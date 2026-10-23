const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const dbPath = path.resolve('..', 'data', 'asset_management.db');
const tables = [
  'administrators',
  'employees',
  'assets',
  'asset_assignment_history',
  'software_licenses',
  'license_allocations',
  'audit_logs',
  'sessions'
];

const db = new sqlite3.Database(
  dbPath,
  sqlite3.OPEN_READONLY,
  (err) => {
    if (err) {
      console.error('Cannot open SQLite database:', err.message);
      process.exitCode = 1;
    }
  }
);

db.serialize(() => {
  for (const table of tables) {
    db.get(
      `SELECT COUNT(*) AS count FROM "${table}"`,
      (err, row) => {
        if (err) {
          console.error(`${table}: ERROR - ${err.message}`);
        } else {
          console.log(`${table}: ${row.count}`);
        }
      }
    );
  }
});

db.close();
