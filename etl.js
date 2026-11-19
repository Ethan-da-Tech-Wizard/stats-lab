// ==============================================================================
// Program: etl.js
// Programmer: Ethan-da-Tech-Wizard
// Last Modified: November 18, 2026
// Purpose: Implements an Extract, Transform, Load (ETL) pipeline for MLB match telemetry.
//          - Extraction: Ingests raw JSON documents from REST API over HTTPS with Bearer auth.
//          - Transformation: Validates records, normalizes nested documents into flat relation
//            tuples, derives aggregated domain metrics (run totals, winner determination).
//          - Loading: Persists normalized data to disk as RFC 4180 CSV and into an embedded
//            SQLite relational database using pre-compiled parameterized queries.
//
// How it fits: this is a standalone command-line script (nothing imports it, and it
//   exports nothing). It is the only JavaScript entry point of the repo; the Python
//   craps_simulation.py is an unrelated exercise. Its outputs (raw_matches.json,
//   cleaned_matches.csv, stats.db) are written into the current working directory,
//   so run it from the repo root.
//
// Inputs:  env var BIGBALLS_API_KEY (required) and optional CLI args sport=, league=,
//          limit= (all strings, passed straight into the query string).
// Outputs: raw_matches.json (untouched API reply), cleaned_matches.csv (flat rows) and
//          stats.db table `mlb_matches` (same rows, rebuilt on every run).
//
// Design decisions: the SQLite table is dropped and recreated each run so the DB always
//   mirrors the latest extract exactly (idempotent refresh, no duplicate-key errors).
//   Uses Node's built-in `node:sqlite`, so there is no npm dependency; this needs a Node
//   release that ships `node:sqlite` (22.5 or newer).
//
// Known limits: the CSV writer wraps text fields in quotes but does NOT double any quote
//   characters that appear inside a team name, so a name containing `"` would produce
//   malformed CSV (not RFC 4180 compliant in that case). Values are interpolated into the
//   URL without encodeURIComponent. Both are flagged here rather than changed because
//   this pass edits comments only.
//
// Run:  BIGBALLS_API_KEY=... node etl.js sport=baseball league=mlb limit=5
//       (or: node --env-file=.env etl.js). There is no automated test: it needs the network.
// ==============================================================================

import fs from 'fs';
import { DatabaseSync } from 'node:sqlite';

// Fail fast on a missing credential. Without this check the request would still be sent
// and the provider would answer 401 (or the call would hang), which is a more confusing
// failure than naming the missing variable up front. The key comes from the environment
// so it never lands in git (see .env.example).
const API_KEY = process.env.BIGBALLS_API_KEY;
if (!API_KEY) {
  throw new Error('Environment configuration error: BIGBALLS_API_KEY must be defined.');
}

// Tiny hand-rolled `key=value` argument parser (no argv library needed for three options).
// Defaults make a bare `node etl.js` do a small, cheap MLB fetch, which keeps API usage
// low while developing. Unknown keys are silently ignored so typos do not crash a run.
// e.g., node etl.js sport=baseball league=mlb limit=5
const args = process.argv.slice(2);
// Defaults; each is overwritten below only when the matching key=value arg is present.
let sport = 'baseball';
let league = 'mlb';
let limit = '5';

for (const arg of args) {
  // split('=') keeps only the first two pieces, so a value that itself contains '=' is truncated.
  const [key, val] = arg.split('=');
  if (key === 'sport' && val) sport = val;
  if (key === 'league' && val) league = val;
  if (key === 'limit' && val) limit = val;
}

// Endpoint for the match list. `limit` caps the number of matches the server returns, which
// bounds both the payload size and the number of rows loaded into SQLite.
const API_URL = `https://api.bigballsdata.com/v1/matches?sport=${sport}&league=${league}&limit=${limit}`;

/**
 * Runs the whole pipeline once: extract from the API, transform to flat rows, load to CSV
 * and SQLite.
 *
 * Side effects: performs one HTTPS request; overwrites raw_matches.json and
 * cleaned_matches.csv in the working directory; drops and recreates the `mlb_matches`
 * table in stats.db. The stages run strictly in order because each one consumes the
 * previous one's in-memory result.
 *
 * @returns {Promise<void>} Resolves after the database is closed.
 * @throws {Error} If the HTTP status is not 2xx, or on any file, JSON or SQLite failure
 *   (the caller at the bottom of the file turns these into exit code 1).
 */
async function runETL() {
  // --------------------------------------------------------------------------
  // STAGE 1: EXTRACTION
  // Fetch remote match telemetry over HTTPS using bearer token authentication.
  // Persists raw unmutated payload to disk as a source-of-truth audit trace.
  // --------------------------------------------------------------------------
  // Bearer auth is the scheme the provider documents for API keys. Only the host's reply
  // is trusted as far as `.data`; everything inside it is validated in the transform stage.
  console.log(`[ETL] Extracting data from: ${API_URL}`);
  const res = await fetch(API_URL, {
    headers: { Authorization: `Bearer ${API_KEY}` }
  });

  // fetch() only rejects on network errors; HTTP 4xx/5xx still resolve, so check explicitly.
  if (!res.ok) {
    throw new Error(`[ETL] HTTP request failed with status: ${res.status} ${res.statusText}`);
  }

  const jsonResponse = await res.json();
  // The provider wraps results as { data, meta, error }. A missing `data` (for example on an
  // error payload that still had a 200 status) becomes an empty list, so later stages
  // simply produce an empty CSV and an empty table instead of throwing on .map.
  const rawMatches = jsonResponse.data || [];

  // Snapshot raw JSON payload to disk for auditability, replayability, and offline debugging
  fs.writeFileSync('raw_matches.json', JSON.stringify(jsonResponse, null, 2));
  console.log(`[ETL] Successfully extracted ${rawMatches.length} raw match records.`);

  // --------------------------------------------------------------------------
  // STAGE 2: TRANSFORMATION & NORMALIZATION
  // Clean raw hierarchical JSON records into flat, strongly-typed relational models.
  // Handles missing score attributes, cleans string padding, and computes derived fields.
  // --------------------------------------------------------------------------
  const cleanedRows = rawMatches.map(m => {
    // Scores may be absent for matches not yet played; treat that as 0-0 rather than letting
    // undefined leak into the sums below. Null-coalescing score extraction prevents NaN arithmetic during aggregation
    const homeScore = m.score?.home ?? 0;
    const awayScore = m.score?.away ?? 0;
    
    // Winner is stored as the team NAME (not a home/away flag) so it can be read directly
    // in SQL. 'Home'/'Away' are fallbacks for records with a missing team name, and a
    // 0-0 unplayed game also ends up as 'Tie'.
    let winner = 'Tie';
    if (homeScore > awayScore) {
      winner = m.home?.name || 'Home';
    } else if (awayScore > homeScore) {
      winner = m.away?.name || 'Away';
    }

    // One flat, fixed-shape row per match. Column order here must stay in sync with the CSV
    // header, the CREATE TABLE statement and the INSERT below. `total_runs` is a derived
    // metric (home + away). `date_utc` keeps only the YYYY-MM-DD part of the ISO timestamp.
    return {
      match_id: String(m.id || ''),
      date_utc: m.kickoff_utc ? m.kickoff_utc.split('T')[0] : 'N/A',
      home_team: (m.home?.name || 'Unknown').trim(),
      away_team: (m.away?.name || 'Unknown').trim(),
      home_score: homeScore,
      away_score: awayScore,
      winner: winner.trim(),
      total_runs: homeScore + awayScore,
      status: (m.status || 'UNKNOWN').toUpperCase(),
      broadcast: (m.broadcast || 'N/A').trim()
    };
  });

  // Build the CSV by hand. Text columns are wrapped in double quotes so commas inside team
  // names do not split a field; numeric columns are left bare. (Embedded quote characters
  // are not escaped; see the limits in the file header.) The header line must list the same
  // columns, in the same order, as each row template below.
  const csvHeaders = 'match_id,date_utc,home_team,away_team,home_score,away_score,winner,total_runs,status,broadcast\n';
  const csvBody = cleanedRows.map(r => 
    `"${r.match_id}","${r.date_utc}","${r.home_team}","${r.away_team}",${r.home_score},${r.away_score},"${r.winner}",${r.total_runs},"${r.status}","${r.broadcast}"`
  ).join('\n');

  // No trailing newline after the last row; most CSV readers accept that.
  fs.writeFileSync('cleaned_matches.csv', csvHeaders + csvBody);
  console.log('[ETL] Normalized records written to cleaned_matches.csv.');

  // --------------------------------------------------------------------------
  // STAGE 3: RELATIONAL LOADING (SQLite)
  // Ingest clean normalized records into relational SQLite storage (`stats.db`).
  // Uses parameterized statements to guarantee protection against SQL injection.
  // --------------------------------------------------------------------------
  // DatabaseSync opens (or creates) the file synchronously; all calls below block, which is
  // fine for a one-shot batch script.
  const db = new DatabaseSync('stats.db');

  // Drop-and-recreate makes every run a full refresh: stale rows from earlier runs cannot
  // survive and re-running the same extract cannot trip the PRIMARY KEY constraint.
  db.exec('DROP TABLE IF EXISTS mlb_matches;');
  // Column meanings match the row object built in the transform stage. SQLite types are
  // advisory, so scores stay INTEGER only because we insert JS numbers.
  db.exec(`
    CREATE TABLE mlb_matches (
      match_id TEXT PRIMARY KEY,
      date_utc TEXT,
      home_team TEXT,
      away_team TEXT,
      home_score INTEGER,
      away_score INTEGER,
      winner TEXT,
      total_runs INTEGER,
      status TEXT,
      broadcast TEXT
    );
  `);

  // One prepared statement reused for every row: parsed once, and the `?` placeholders mean
  // team names are bound as data, never concatenated into SQL (so an apostrophe in a name
  // cannot break or inject into the query). Parameter order must match the columns listed.
  const insertStmt = db.prepare(`
    INSERT INTO mlb_matches (match_id, date_utc, home_team, away_team, home_score, away_score, winner, total_runs, status, broadcast)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?);
  `);

  // Insert row by row. There is no explicit BEGIN/COMMIT, so SQLite autocommits each row;
  // that is slow for thousands of rows but irrelevant at the default limit of 5.
  for (const r of cleanedRows) {
    insertStmt.run(
      r.match_id,
      r.date_utc,
      r.home_team,
      r.away_team,
      r.home_score,
      r.away_score,
      r.winner,
      r.total_runs,
      r.status,
      r.broadcast
    );
  }

  // Close explicitly so the file is fully written and unlocked before the process exits.
  db.close();
  console.log('[ETL] Database ingestion complete.');
}

// Entry point. Any error thrown inside runETL is reported with a recognisable prefix and
// turned into a non-zero exit code so shell scripts and CI can detect a failed run.
runETL().catch(err => {
  console.error('[ETL Fatal Error]', err);
  process.exit(1);
});
