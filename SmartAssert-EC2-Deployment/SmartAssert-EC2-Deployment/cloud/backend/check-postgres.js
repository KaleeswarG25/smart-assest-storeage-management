
require('dotenv').config();
const { Client } = require('pg');

async function main() {
    const client = new Client({
        host: process.env.DB_HOST,
        port: Number(process.env.DB_PORT || 5432),
        database: process.env.DB_NAME,
        user: process.env.DB_USER,
        password: process.env.DB_PASSWORD,
    });

    try {
        await client.connect();

        const result = await client.query(
            'SELECT current_database() AS database, current_user AS username'
        );

        console.log('Connection successful:', result.rows[0]);

        const tables = await client.query(
            `SELECT table_name
       FROM information_schema.tables
       WHERE table_schema = $1
         AND table_type = $2
       ORDER BY table_name`,
            ['public', 'BASE TABLE']
        );

        console.log('Tables:', tables.rows.map(row => row.table_name));
    } finally {
        await client.end();
    }
}

main().catch(error => {
    console.error('Connection failed:', error.message);
    process.exitCode = 1;
});
