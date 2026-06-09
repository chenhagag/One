#!/usr/bin/env node
/**
 * Copy a user and all their data from production DB to staging DB.
 *
 * Usage:
 *   node copy-user-to-staging.js <user_id_or_name> [--prod <prod_url>] [--staging <staging_url>]
 *
 * If --prod is not provided, reads PROD_DATABASE_URL from .env or environment.
 * If --staging is not provided, reads DATABASE_URL from .env (which points to staging by default).
 *
 * Examples:
 *   node copy-user-to-staging.js 42
 *   node copy-user-to-staging.js "הינדי"
 *   node copy-user-to-staging.js 42 --prod postgresql://...@nozomi.proxy.rlwy.net:.../railway
 */

const { Client } = require("pg");
const dotenv = require("dotenv");
const path = require("path");

dotenv.config({ path: path.join(__dirname, ".env") });

const args = process.argv.slice(2);
if (args.length === 0) {
  console.log("Usage: node copy-user-to-staging.js <user_id_or_name> [--prod <url>] [--staging <url>]");
  process.exit(1);
}

const userIdOrName = args[0];
let prodUrl = process.env.PROD_DATABASE_URL || process.env.DATABASE_PUBLIC_URL;
let stagingUrl = process.env.DATABASE_URL;

for (let i = 1; i < args.length; i++) {
  if (args[i] === "--prod" && args[i + 1]) { prodUrl = args[++i]; }
  if (args[i] === "--staging" && args[i + 1]) { stagingUrl = args[++i]; }
}

if (!prodUrl) {
  console.error("ERROR: Production DB URL not found. Set PROD_DATABASE_URL or DATABASE_PUBLIC_URL in .env, or pass --prod <url>");
  process.exit(1);
}
if (!stagingUrl) {
  console.error("ERROR: Staging DB URL not found. Set DATABASE_URL in .env or pass --staging <url>");
  process.exit(1);
}

const TABLES = [
  // { table, fk_column, extra_condition }
  { table: "conversation_messages", fk: "user_id" },
  { table: "user_chat_summaries", fk: "user_id" },
  { table: "user_traits", fk: "user_id" },
  { table: "user_look_traits", fk: "user_id" },
  { table: "user_photos", fk: "user_id" },
  { table: "analysis_runs", fk: "user_id" },
  { table: "token_usage", fk: "user_id" },
  { table: "bug_reports", fk: "user_id" },
];

async function main() {
  const prod = new Client({ connectionString: prodUrl, ssl: { rejectUnauthorized: false } });
  const staging = new Client({ connectionString: stagingUrl, ssl: { rejectUnauthorized: false } });

  try {
    await prod.connect();
    await staging.connect();
    console.log("Connected to both databases.");

    // Find user in production
    let userRow;
    const isNumeric = /^\d+$/.test(userIdOrName);
    if (isNumeric) {
      const r = await prod.query("SELECT * FROM users WHERE id = $1", [parseInt(userIdOrName)]);
      userRow = r.rows[0];
    } else {
      const r = await prod.query("SELECT * FROM users WHERE first_name ILIKE $1", [`%${userIdOrName}%`]);
      if (r.rows.length > 1) {
        console.log(`Found ${r.rows.length} users matching "${userIdOrName}":`);
        r.rows.forEach(u => console.log(`  #${u.id} — ${u.first_name} (${u.email})`));
        console.log("Please specify exact user ID.");
        process.exit(1);
      }
      userRow = r.rows[0];
    }

    if (!userRow) {
      console.error(`User "${userIdOrName}" not found in production.`);
      process.exit(1);
    }

    const userId = userRow.id;
    console.log(`\nFound user: #${userId} — ${userRow.first_name} (${userRow.email})`);

    // Check if user exists in staging
    const existsInStaging = await staging.query("SELECT id FROM users WHERE id = $1", [userId]);
    if (existsInStaging.rows.length > 0) {
      console.log(`User #${userId} already exists in staging. Deleting old data...`);
      // Delete in reverse dependency order
      for (const t of [...TABLES].reverse()) {
        const del = await staging.query(`DELETE FROM ${t.table} WHERE ${t.fk} = $1`, [userId]);
        if (del.rowCount > 0) console.log(`  Deleted ${del.rowCount} rows from ${t.table}`);
      }
      // Delete candidate_matches
      const delCm = await staging.query(
        "DELETE FROM candidate_matches WHERE user_id = $1 OR candidate_user_id = $1", [userId]
      );
      if (delCm.rowCount > 0) console.log(`  Deleted ${delCm.rowCount} rows from candidate_matches`);
      // Delete user
      await staging.query("DELETE FROM users WHERE id = $1", [userId]);
      console.log("  Deleted user record.");
    }

    // Insert user
    const userCols = Object.keys(userRow);
    const userVals = Object.values(userRow);
    const placeholders = userVals.map((_, i) => `$${i + 1}`).join(", ");
    await staging.query(
      `INSERT INTO users (${userCols.join(", ")}) VALUES (${placeholders})
       ON CONFLICT (id) DO NOTHING`,
      userVals
    );
    console.log(`\nInserted user #${userId} into staging.`);

    // Fix sequence if needed
    await staging.query(`SELECT setval('users_id_seq', GREATEST((SELECT MAX(id) FROM users), 1))`);

    // Copy each related table
    for (const t of TABLES) {
      const rows = await prod.query(`SELECT * FROM ${t.table} WHERE ${t.fk} = $1`, [userId]);
      if (rows.rows.length === 0) {
        console.log(`  ${t.table}: 0 rows (skipped)`);
        continue;
      }

      let inserted = 0;
      for (const row of rows.rows) {
        const cols = Object.keys(row);
        const vals = Object.values(row);
        const ph = vals.map((_, i) => `$${i + 1}`).join(", ");
        try {
          await staging.query(`INSERT INTO ${t.table} (${cols.join(", ")}) VALUES (${ph})`, vals);
          inserted++;
        } catch (err) {
          // Skip duplicate key errors (e.g. trait_definitions FK mismatch)
          if (err.code === "23505") continue; // unique_violation
          if (err.code === "23503") continue; // foreign_key_violation
          console.error(`  WARNING: ${t.table} row insert failed: ${err.message}`);
        }
      }
      console.log(`  ${t.table}: ${inserted}/${rows.rows.length} rows copied`);
    }

    // Fix sequences for tables with serial IDs
    for (const t of TABLES) {
      try {
        await staging.query(`SELECT setval('${t.table}_id_seq', GREATEST((SELECT MAX(id) FROM ${t.table}), 1))`);
      } catch (_) {} // Some tables may not have id_seq
    }

    console.log(`\nDone! User #${userId} (${userRow.first_name}) copied to staging.`);
    console.log("Note: Photo files are NOT copied (they live on Railway Volume). Only DB records are transferred.");

  } catch (err) {
    console.error("Error:", err.message);
    process.exit(1);
  } finally {
    await prod.end();
    await staging.end();
  }
}

main();
