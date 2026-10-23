const { Pool } = require('pg');

const pool = new Pool({
  host: '127.0.0.1',
  port: 15432,
  database: 'asset_management',
  user: 'asset_app_user',
  password: process.env.DB_PASSWORD
});

const checks = [
  ['Extra employees',
   'SELECT id, employee_code, first_name, last_name FROM employees WHERE id > 5 ORDER BY id'],
  ['Extra assets',
   'SELECT id, asset_tag, serial_number, name, current_employee_id FROM assets WHERE id > 7 ORDER BY id'],
  ['Extra software licenses',
   'SELECT id, license_code, software_name FROM software_licenses WHERE id > 4 ORDER BY id'],
  ['Extra administrators',
   'SELECT id, username, email FROM administrators WHERE id > 4 ORDER BY id'],
  ['Extra license allocations',
   'SELECT id, asset_id, employee_id, license_id FROM license_allocations WHERE id > 9 ORDER BY id'],
  ['Extra assignment history',
   'SELECT id, asset_id, employee_id, performed_by_admin_id FROM asset_assignment_history WHERE id > 6 ORDER BY id']
];

(async () => {
  try {
    for (const [name, sql] of checks) {
      const result = await pool.query(sql);
      console.log('\n--- ' + name + ' ---');
      console.table(result.rows);
    }
  } catch (error) {
    console.error('Inspection failed:', error.message);
    process.exitCode = 1;
  } finally {
    await pool.end();
  }
})();

