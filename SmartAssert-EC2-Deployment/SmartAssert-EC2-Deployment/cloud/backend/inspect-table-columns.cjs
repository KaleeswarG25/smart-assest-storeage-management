const { Pool } = require('pg');

const pool = new Pool({
  host: '127.0.0.1',
  port: 15432,
  database: process.env.DB_NAME || 'asset_management',
  user: process.env.DB_USER || 'asset_app_user',
  password: process.env.DB_PASSWORD
});

(async () => {
  for (const table of [
    'employees',
    'assets',
    'software_licenses',
    'administrators'
  ]) {
    const result = await pool.query(`
      SELECT column_name
      FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = $1
      ORDER BY ordinal_position
    `, [table]);

    console.log(`\n${table}: ${result.rows.map(r => r.column_name).join(', ')}`);
  }
})().catch(err => {
  console.error(err.message);
  process.exitCode = 1;
}).finally(() => pool.end());
