const { Pool } = require('pg');

const pool = new Pool({
  host: '127.0.0.1',
  port: 15432,
  database: process.env.DB_NAME || 'asset_management',
  user: process.env.DB_USER || 'asset_app_user',
  password: process.env.DB_PASSWORD
});

const queries = [
  ['employees', 'SELECT id, name, email FROM employees WHERE id = ANY($1::int[])', [6]],
  ['assets', 'SELECT id, asset_name, serial_number FROM assets WHERE id = ANY($1::int[])', [ [11] ]],
  ['software_licenses', 'SELECT id, name FROM software_licenses WHERE id = ANY($1::int[])', [[5, 7]]],
  ['license_allocations', 'SELECT id, license_id, employee_id FROM license_allocations WHERE id = ANY($1::int[])', [[10, 11, 12]]],
  ['asset_assignment_history', 'SELECT * FROM asset_assignment_history WHERE id = ANY($1::int[])', [[7, 8, 9]]]
];

(async () => {
  for (const [table, sql, params] of queries) {
    try {
      const result = await pool.query(sql, params);
      console.log(`\n${table}:`);
      console.table(result.rows);
    } catch (error) {
      console.log(`\n${table}: inspection query needs schema adjustment: ${error.message}`);
    }
  }
})().finally(() => pool.end());
