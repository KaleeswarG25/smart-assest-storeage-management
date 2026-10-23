const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const { Pool } = require('pg');

const tables = [
  'administrators',
  'employees',
  'assets',
  'asset_assignment_history',
  'software_licenses',
  'license_allocations',
  'audit_logs'
];

const sqlitePath = path.resolve('..', 'data', 'asset_management.db');
const sqlite = new sqlite3.Database(sqlitePath, sqlite3.OPEN_READONLY);
const pg = new Pool({
  host: '127.0.0.1',
  port: 15432,
  database: process.env.DB_NAME || 'asset_management',
  user: process.env.DB_USER || 'asset_app_user',
  password: process.env.DB_PASSWORD
});

const all = (sql) => new Promise((resolve, reject) =>
  sqlite.all(sql, (err, rows) => err ? reject(err) : resolve(rows))
);

(async () => {
  for (const table of tables) {
    const source = await all(`SELECT id FROM "${table}"`);
    const target = await pg.query(`SELECT id FROM "${table}" ORDER BY id`);
    const sourceIds = new Set(source.map(row => String(row.id)));
    const extras = target.rows
      .map(row => String(row.id))
      .filter(id => !sourceIds.has(id));

    console.log(`${table}: SQLite=${source.length}, PostgreSQL=${target.rowCount}, extra IDs=${extras.length}`);
    if (extras.length) console.log('  Extra IDs:', extras.slice(0, 20).join(', '));
  }
})().catch(err => {
  console.error(err.message);
  process.exitCode = 1;
}).finally(async () => {
  sqlite.close();
  await pg.end();
});
