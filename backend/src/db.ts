import Database from "better-sqlite3";
import path from "path";
import { createSchema } from "./schema";
import { seedDefinitions } from "./seedDefinitions";
import { initTokenTracker } from "./tokenTracker";

const DB_PATH = path.join(__dirname, "../../matchmaker.db");

const db = new Database(DB_PATH);

// Enable WAL mode for better performance
db.pragma("journal_mode = WAL");

// Create all tables
createSchema(db);

// Seed definition/config tables (idempotent — skips if data exists)
seedDefinitions(db);

// Initialize token tracker with DB reference
initTokenTracker(db);

export default db;
