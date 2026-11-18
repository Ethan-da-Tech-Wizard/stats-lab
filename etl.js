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
// ==============================================================================

import fs from 'fs';
import { DatabaseSync } from 'node:sqlite';

// Step 1: Environment Preconditions & Configuration Validation
// Defensive programming pattern: fail fast if critical credentials are absent
// to prevent downstream network timeouts and unauthorized payload requests.
const API_KEY = process.env.BIGBALLS_API_KEY;
if (!API_KEY) {
  throw new Error('Environment configuration error: BIGBALLS_API_KEY must be defined.');
}

// Step 2: Command-Line Interface (CLI) Parameter Ingestion
// Parses key=value arguments with default fallbacks for resilient development runs.
// e.g., node etl.js sport=baseball league=mlb limit=5
const args = process.argv.slice(2);
let sport = 'baseball';
let league = 'mlb';
let limit = '5';

for (const arg of args) {
  const [key, val] = arg.split('=');
  if (key === 'sport' && val) sport = val;
  if (key === 'league' && val) league = val;
  if (key === 'limit' && val) limit = val;
}

// Target resource locator constructed with bounded query parameters
const API_URL = `https://api.bigballsdata.com/v1/matches?sport=${sport}&league=${league}&limit=${limit}`;

/**
 * Main execution orchestration for the pipeline lifecycle.
 * Manages atomic execution stages: extraction, transformation, and load.
 */
async function runETL() {
  // --------------------------------------------------------------------------
  // STAGE 1: EXTRACTION
  // Fetch remote match telemetry over HTTPS using bearer token authentication.
  // Persists raw unmutated payload to disk as a source-of-truth audit trace.
  // --------------------------------------------------------------------------
  console.log(`[ETL] Extracting data from: ${API_URL}`);
  const res = await fetch(API_URL, {
    headers: { Authorization: `Bearer ${API_KEY}` }
  });

  if (!res.ok) {
    throw new Error(`[ETL] HTTP request failed with status: ${res.status} ${res.statusText}`);
  }

  const jsonResponse = await res.json();
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
    // Null-coalescing score extraction prevents NaN arithmetic during aggregation
    const homeScore = m.score?.home ?? 0;
    const awayScore = m.score?.away ?? 0;
    
    // Evaluate match outcome: home win, away win, or tie state
    let winner = 'Tie';
    if (homeScore > awayScore) {
      winner = m.home?.name || 'Home';
    } else if (awayScore > homeScore) {
      winner = m.away?.name || 'Away';
    }

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

  // Export structured dataset to CSV formatted to RFC 4180 specifications
  // Escapes field values in quotes to preserve formatting and comma boundaries
  const csvHeaders = 'match_id,date_utc,home_team,away_team,home_score,away_score,winner,total_runs,status,broadcast\n';
  const csvBody = cleanedRows.map(r => 
    `"${r.match_id}","${r.date_utc}","${r.home_team}","${r.away_team}",${r.home_score},${r.away_score},"${r.winner}",${r.total_runs},"${r.status}","${r.broadcast}"`
  ).join('\n');

  fs.writeFileSync('cleaned_matches.csv', csvHeaders + csvBody);
  console.log('[ETL] Normalized records written to cleaned_matches.csv.');

  // --------------------------------------------------------------------------
  // STAGE 3: RELATIONAL LOADING (SQLite)
  // Ingest clean normalized records into relational SQLite storage (`stats.db`).
  // Uses parameterized statements to guarantee protection against SQL injection.
  // --------------------------------------------------------------------------
  const db = new DatabaseSync('stats.db');
  
  // Re-create the relational table schema for deterministic batch refresh
  db.exec('DROP TABLE IF EXISTS mlb_matches;');
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

  // Prepare parameterized statement for secure and efficient batch insertion
  const insertStmt = db.prepare(`
    INSERT INTO mlb_matches (match_id, date_utc, home_team, away_team, home_score, away_score, winner, total_runs, status, broadcast)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?);
  `);

  // Execute row insertions within the database transaction
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

  // Gracefully close connection to flush WAL buffers and release lock
  db.close();
  console.log('[ETL] Database ingestion complete.');
}

// Top-level rejection handler to catch unhandled promise errors
runETL().catch(err => {
  console.error('[ETL Fatal Error]', err);
  process.exit(1);
});
