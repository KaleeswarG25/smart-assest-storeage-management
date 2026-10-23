const { Pool } = require('pg');

const pool = new Pool({
  host: '127.0.0.1',
  port: 15432,
  database: process.env.DB_NAME || 'asset_management',
  user: process.env.DB_USER || 'asset_app_user',
  password: process.env.DB_PASSWORD
});

const queries = [
  ['employees', `
    SELECT id, employee_code, first_name, last_name, email, department, designation
    FROM employees WHERE id = ANY($1::int[]) ORDER BY id
  `, [[6]]],

  ['assets', `
    SELECT id, asset_tag, serial_number, name, category, current_employee_id, status
    FROM assets WHERE id = ANY($1::int[]) ORDER BY id
  `, [[11]]],

  ['software_licenses', `
    SELECT id, license_code, software_name, vendor, total_quantity, used_quantity
    FROM software_licenses WHERE id = ANY($1::int[]) ORDER BY id
  `, [[5, 7]]],

  ['administrators', `
    SELECT id, username, email, full_name, role
    FROM administrators WHERE id = ANY($1::int[]) ORDER BY id
  `, [[5, 7]]]
];

(async () => {
  for (const [table, sql, params] of queries) {
    const result = await pool.query(sql, params);
    console.log(`\n--- ${table} ---`);
    console.table(result.rows);
  }
})().catch(error => {
  console.error(error.message);
  process.exitCode = 1;
}).finally(() => pool.end());
