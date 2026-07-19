/**
 * Audit script: Find photo files on disk that have no matching record in the database.
 * Run with: npx ts-node audit-orphan-photos.ts
 * Does NOT delete anything — only reports.
 */
import dotenv from "dotenv";
import path from "path";
import fs from "fs";
import { Pool } from "pg";

dotenv.config();

const uploadsDir = process.env.NODE_ENV === "production"
  ? "/app/data/uploads"
  : path.join(__dirname, "../uploads");

async function main() {
  const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: process.env.NODE_ENV === "production" ? { rejectUnauthorized: false } : undefined,
  });

  // Get all filenames from DB
  const { rows } = await pool.query("SELECT filename FROM user_photos");
  const dbFilenames = new Set(rows.map((r: any) => r.filename));

  // Get all files on disk
  if (!fs.existsSync(uploadsDir)) {
    console.log(`Uploads directory not found: ${uploadsDir}`);
    process.exit(1);
  }

  const diskFiles = fs.readdirSync(uploadsDir);
  const orphans = diskFiles.filter(f => !dbFilenames.has(f));

  console.log(`\n=== Orphan Photos Audit ===`);
  console.log(`Files on disk: ${diskFiles.length}`);
  console.log(`Files in DB:   ${dbFilenames.size}`);
  console.log(`Orphans:       ${orphans.length}`);

  if (orphans.length > 0) {
    console.log(`\nOrphan files (no DB record):`);
    for (const f of orphans) {
      const stat = fs.statSync(path.join(uploadsDir, f));
      console.log(`  ${f}  (${(stat.size / 1024).toFixed(1)} KB, modified ${stat.mtime.toISOString().slice(0, 10)})`);
    }
  } else {
    console.log(`\n✓ No orphan files found.`);
  }

  await pool.end();
}

main().catch(err => {
  console.error("Error:", err.message);
  process.exit(1);
});
