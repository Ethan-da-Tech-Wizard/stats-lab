/**
 * ==========================================================================
 * REAL MLB BASEBALL ETL PIPELINE (etl.js)
 * Using Live API: api.bigballsdata.com
 * ==========================================================================
 */

import fs from 'fs';
import { DatabaseSync } from 'node:sqlite';

const API_KEY = 'bbs_live_000000XxvYdBPIYWikOz2PkDSyoxSk56QmI0kSeIG9p3fhMS';

// Parse CLI arguments (e.g., node etl.js sport=baseball league=mlb limit=5)
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

const API_URL = `https://api.bigballsdata.com/v1/matches?sport=${sport}&league=${league}&limit=${limit}`;

async function runETL() {
  // STAGE 1: EXTRACTION
  const res = await fetch(API_URL, {
    headers: { Authorization: `Bearer ${API_KEY}` }
  });
  const jsonResponse = await res.json();
  const rawMatches = jsonResponse.data || [];

  fs.writeFileSync('raw_matches.json', JSON.stringify(jsonResponse, null, 2));

  // STAGE 2: TRANSFORMATION
  const cleanedRows = rawMatches.map(m => {
    const homeScore = m.score?.home ?? 0;
    const awayScore = m.score?.away ?? 0;
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

  // Export CSV
  const csvHeaders = 'match_id,date_utc,home_team,away_team,home_score,away_score,winner,total_runs,status,broadcast\n';
  const csvBody = cleanedRows.map(r => 
    `"${r.match_id}","${r.date_utc}","${r.home_team}","${r.away_team}",${r.home_score},${r.away_score},"${r.winner}",${r.total_runs},"${r.status}","${r.broadcast}"`
  ).join('\n');

  fs.writeFileSync('cleaned_matches.csv', csvHeaders + csvBody);

  // STAGE 3: LOADING
  const db = new DatabaseSync('stats.db');
  
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

  const insertStmt = db.prepare(`
    INSERT INTO mlb_matches (match_id, date_utc, home_team, away_team, home_score, away_score, winner, total_runs, status, broadcast)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?);
  `);

  for (const r of cleanedRows) {
    insertStmt.run(r.match_id, r.date_utc, r.home_team, r.away_team, r.home_score, r.away_score, r.winner, r.total_runs, r.status, r.broadcast);
  }

  db.close();
}

runETL().catch(console.error);
