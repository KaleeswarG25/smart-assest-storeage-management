const { Pool } = require('pg');

const pool = new Pool({
  host: '127.0.0.1',
  port: 15432,
  database: process.env.DB_NAME || 'asset_management',
  user: process.env.DB_USER || 'asset_app_user',
  password: process.env.DB_PASSWORD
});

(async () => {
  const result = await pool.query(`
    SELECT id, username, created_at
    FROM administrators
    WHERE id NOT IN (1, 2, 3, 4)
    ORDER BY id
  `);

  for (const row of result.rows) {
    console.log({
      id: row.id,
      username: row.username,
      created_at: row.created_at
    });
  }
})().catch(err => {
  console.error(err.message);
  process.exitCode = 1;
}).finally(() => pool.end());
