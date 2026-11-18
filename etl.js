/**
 * Program: stats-lab - etl.js
 * Programmer: Ethan-da-Tech-Wizard (written with Claude, an AI assistant)
 * Last Modified: 2026-11-18
 * Purpose: Downloads match data from a sports API, cleans it, and saves it as a raw JSON file, a CSV file and a SQLite database table.
 */

/**
 * ==========================================================================
 * REAL MLB BASEBALL ETL PIPELINE (etl.js)
 * Using Live API: api.bigballsdata.com
 * ==========================================================================
 */

// ===== Imports =====
// fs lets us read and write files on disk.
import fs from 'fs';
// DatabaseSync is Node's built-in synchronous SQLite database class.
import { DatabaseSync } from 'node:sqlite';

// ===== Settings =====
// The API key is read from an environment variable so it is never stored in the code.
const API_KEY = process.env.BIGBALLS_API_KEY;
// Stop right away with a clear message if the key is missing.
if (!API_KEY) throw new Error('Set BIGBALLS_API_KEY in your environment before running the ETL.');

// Parse CLI arguments (e.g., node etl.js sport=baseball league=mlb limit=5)
// process.argv holds the command line; the first two items are node and the script name, so slice them off.
const args = process.argv.slice(2);
// Default values, used when the user does not pass an option.
let sport = 'baseball';
let league = 'mlb';
let limit = '5';

// Go through each argument like sport=baseball and split it into a key and a value.
for (const arg of args) {
  const [key, val] = arg.split('=');
  if (key === 'sport' && val) sport = val;
  if (key === 'league' && val) league = val;
  if (key === 'limit' && val) limit = val;
}

// Build the web address to request, inserting the chosen sport, league and limit.
const API_URL = `https://api.bigballsdata.com/v1/matches?sport=${sport}&league=${league}&limit=${limit}`;

/**
 * Runs the whole ETL (Extract, Transform, Load) process from start to finish.
 * @returns {Promise<void>} resolves when the database has been written
 */
async function runETL() {
  // STAGE 1: EXTRACTION
  // Ask the API for the matches, sending the key in the Authorization header.
  const res = await fetch(API_URL, {
    headers: { Authorization: `Bearer ${API_KEY}` }
  });
  // Turn the reply text into a JavaScript object.
  const jsonResponse = await res.json();
  // The matches are in the "data" field; use an empty list if it is missing.
  const rawMatches = jsonResponse.data || [];

  // Save an untouched copy of the reply (pretty-printed) so we can look at it later.
  fs.writeFileSync('raw_matches.json', JSON.stringify(jsonResponse, null, 2));

  // STAGE 2: TRANSFORMATION
  // Turn each raw match into a simpler, flat row of cleaned values.
  const cleanedRows = rawMatches.map(m => {
    // ?. and ?? mean: if the score is missing, use 0 instead of crashing.
    const homeScore = m.score?.home ?? 0;
    const awayScore = m.score?.away ?? 0;
    // Whoever has the higher score wins; equal scores are a tie.
    const winner = homeScore > awayScore ? m.home.name : (awayScore > homeScore ? m.away.name : 'Tie');

    // The cleaned row, one named field per column.
    return {
      match_id: m.id,
      // Keep only the date part (before the "T") of the start time.
      date_utc: m.kickoff_utc ? m.kickoff_utc.split('T')[0] : 'N/A',
      // trim() removes extra spaces around team names.
      home_team: m.home.name.trim(),
      away_team: m.away.name.trim(),
      home_score: homeScore,
      away_score: awayScore,
      winner: winner,
      // Total runs scored by both teams.
      total_runs: homeScore + awayScore,
      // Upper-case the status (for example FINAL) so it is consistent.
      status: m.status.toUpperCase(),
      broadcast: m.broadcast || 'N/A'
    };
  });

  // Export CSV
  // First line of the file: the column names.
  const csvHeaders = 'match_id,date_utc,home_team,away_team,home_score,away_score,winner,total_runs,status,broadcast\n';
  // One line per match; text values are wrapped in quotes, numbers are not. Lines are joined with newlines.
  const csvBody = cleanedRows.map(r => 
    `"${r.match_id}","${r.date_utc}","${r.home_team}","${r.away_team}",${r.home_score},${r.away_score},"${r.winner}",${r.total_runs},"${r.status}","${r.broadcast}"`
  ).join('\n');

  // Write the header line followed by all the rows.
  fs.writeFileSync('cleaned_matches.csv', csvHeaders + csvBody);

  // STAGE 3: LOADING
  // Open (or create) the SQLite database file.
  const db = new DatabaseSync('stats.db');
  
  // Delete the old table, if any, so each run starts fresh, then create it with a type for each column.
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

  // A prepared INSERT statement; each ? is filled in with a value for every row.
  const insertStmt = db.prepare(`
    INSERT INTO mlb_matches (match_id, date_utc, home_team, away_team, home_score, away_score, winner, total_runs, status, broadcast)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?);
  `);

  // Insert every cleaned row into the table.
  for (const r of cleanedRows) {
    insertStmt.run(r.match_id, r.date_utc, r.home_team, r.away_team, r.home_score, r.away_score, r.winner, r.total_runs, r.status, r.broadcast);
  }

  // Close the database so everything is saved.
  db.close();
}

// Start the pipeline; if anything goes wrong, print the error instead of crashing silently.
runETL().catch(console.error);
