import Database from "better-sqlite3";
import path from "path";
import { createSchema } from "./schema";
import { seedDefinitions } from "./seedDefinitions";

const DB_PATH = path.join(__dirname, "../../matchmaker.db");

const db = new Database(DB_PATH);

// Enable WAL mode for better performance
db.pragma("journal_mode = WAL");

// Create all tables
createSchema(db);

// Seed definition/config tables (idempotent — skips if data exists)
seedDefinitions(db);

// NOTE: tokenTracker used to be wired to this sqlite db via initTokenTracker(db).
// It now writes directly to pg (see tokenTracker.ts + db.pg.ts), so no init needed here.

export default db;
