import fs from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { fileURLToPath } from "node:url";

const rootDir = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  ".."
);
const dbFile = path.join(rootDir, ".office-data", "office.sqlite3");
const backupsDir = path.join(rootDir, ".office-data", "backups");

if (!fs.existsSync(dbFile)) {
  console.log("No office.sqlite3 database file to back up yet.");
  process.exit(0);
}

fs.mkdirSync(backupsDir, { recursive: true });
const stamp = new Date().toISOString().replace(/[:.]/g, "-");
const dest = path.join(backupsDir, `office-${stamp}.sqlite3`);

const db = new DatabaseSync(dbFile);
try {
  // VACUUM INTO produces an atomic, WAL-consistent standalone snapshot without locking out readers.
  db.exec(`VACUUM INTO '${dest.replace(/'/g, "''")}';`);
} finally {
  db.close();
}

console.log(`Backed up SQLite database to ${dest}`);
