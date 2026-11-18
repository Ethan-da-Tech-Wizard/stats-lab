// ==============================================================================
// Program: etl.js
// Programmer: Ethan-da-Tech-Wizard
// Last Modified: November 18, 2026
// Purpose: Implements an Extract, Transform, Load (ETL) pipeline for MLB game data.
//          Connects to the sports statistics API, extracts raw match JSON,
//          transforms match records into structured tabular formats, exports
//          normalized CSV datasets, and persists the records to an SQLite database.
// ==============================================================================

import fs from 'fs';
import { DatabaseSync } from 'node:sqlite';

// Step 1: Validate environment prerequisites (API authorization key)
const API_KEY = process.env.BIGBALLS_API_KEY;
if (!API_KEY) throw new Error('Set BIGBALLS_API_KEY in your environment before running the ETL.');

// Step 2: Parse CLI arguments with sensible defaults (e.g., node etl.js sport=baseball league=mlb limit=5)
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

// Construct target endpoint URL based on query filters
const API_URL = `https://api.bigballsdata.com/v1/matches?sport=${sport}&league=${league}&limit=${limit}`;

/**
 * Main execution orchestration for the pipeline lifecycle.
 */
async function runETL() {
  // --------------------------------------------------------------------------
  // STAGE 1: EXTRACTION
  // Fetch raw match telemetry over HTTPS using bearer token authentication.
  // --------------------------------------------------------------------------
  console.log(`[ETL] Extracting data from: ${API_URL}`);
  const res = await fetch(API_URL, {
    headers: { Authorization: `Bearer ${API_KEY}` }
  });
  const jsonResponse = await res.json();
  const rawMatches = jsonResponse.data || [];

  // Snapshot raw JSON payload to disk for auditability and debugging
  fs.writeFileSync('raw_matches.json', JSON.stringify(jsonResponse, null, 2));
  console.log(`[ETL] Successfully extracted ${rawMatches.length} raw match records.`);

  // --------------------------------------------------------------------------
  // STAGE 2: TRANSFORMATION
  // Normalize JSON structures, compute derived metrics (winner, total runs),
  // and handle missing values or formatting quirks.
  // --------------------------------------------------------------------------
  const cleanedRows = rawMatches.map(m => {
    // Extract scores with fallback defaults
    const homeScore = m.score?.home ?? 0;
    const awayScore = m.score?.away ?? 0;
    
    // Determine match winner based on score comparison
    const winner = homeScore > awayScore ? m.home.name : (awayScore > homeScore ? m.away.name : 'Tie');

    return {
      match_id: m.id,
      date_utc: m.kickoff_utc ? m.kickoff_utc.split('T')[0] : 'N/A',
      home_team: m.home.name.trim(),
      away_team: m.away.name.trim(),
      home_score: homeScore,
      away_score: awayScore,
      winner: winner,
      total_runs: homeScore + awayScore,
      status: m.status.toUpperCase(),
      broadcast: m.broadcast || 'N/A'
    };
  });

  // Export structured dataset to CSV
  const csvHeaders = 'match_id,date_utc,home_team,away_team,home_score,away_score,winner,total_runs,status,broadcast\n';
  const csvBody = cleanedRows.map(r => 
    `"${r.match_id}","${r.date_utc}","${r.home_team}","${r.away_team}",${r.home_score},${r.away_score},"${r.winner}",${r.total_runs},"${r.status}","${r.broadcast}"`
  ).join('\n');

  fs.writeFileSync('cleaned_matches.csv', csvHeaders + csvBody);
  console.log('[ETL] Normalized records written to cleaned_matches.csv.');

  // --------------------------------------------------------------------------
  // STAGE 3: LOADING
  // Ingest clean records into relational SQLite storage (`stats.db`).
  // --------------------------------------------------------------------------
  const db = new DatabaseSync('stats.db');
  
  // Re-create the relational table schema
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

  // Execute row insertions within database
  for (const r of cleanedRows) {
    insertStmt.run(r.match_id, r.date_utc, r.home_team, r.away_team, r.home_score, r.away_score, r.winner, r.total_runs, r.status, r.broadcast);
  }

  // Gracefully finalize connection
  db.close();
  console.log('[ETL] Database ingestion complete.');
}

// Trigger top-level pipeline execution with error handling
runETL().catch(console.error);
