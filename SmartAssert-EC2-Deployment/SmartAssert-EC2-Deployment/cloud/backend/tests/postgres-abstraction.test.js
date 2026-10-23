const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const db = require('../src/config/database');
const { TABLES_IN_ORDER } = require('../src/db/migrateSqliteToPostgres');

test('PostgreSQL Abstraction & Migration Utility Tests', async (t) => {
  await t.test('1. convertPlaceholders translates sequential question marks to $1, $2, $3', () => {
    const input = 'SELECT * FROM assets WHERE category = ? AND status = ? AND purchase_cost >= ?';
    const expected = 'SELECT * FROM assets WHERE category = $1 AND status = $2 AND purchase_cost >= $3';
    const output = db.convertPlaceholders(input);
    assert.strictEqual(output, expected);
  });

  await t.test('2. convertPlaceholders preserves question marks inside string literals', () => {
    const input = "SELECT * FROM assets WHERE notes = 'Is this broken?' AND status = ?";
    const expected = "SELECT * FROM assets WHERE notes = 'Is this broken?' AND status = $1";
    const output = db.convertPlaceholders(input);
    assert.strictEqual(output, expected);
  });

  await t.test('3. convertPlaceholders converts DATETIME(\'now\') to ANSI CURRENT_TIMESTAMP', () => {
    const input = "UPDATE assets SET updated_at = DATETIME('now') WHERE id = ?";
    const expected = "UPDATE assets SET updated_at = CURRENT_TIMESTAMP WHERE id = $1";
    const output = db.convertPlaceholders(input);
    assert.strictEqual(output, expected);
  });

  await t.test('4. convertPlaceholders converts SQLite INSERT OR IGNORE INTO to PostgreSQL ON CONFLICT DO NOTHING', () => {
    const input = "INSERT OR IGNORE INTO employees (id, employee_code) VALUES (?, ?)";
    const expected = "INSERT INTO employees (id, employee_code) VALUES ($1, $2) ON CONFLICT DO NOTHING";
    const output = db.convertPlaceholders(input);
    assert.strictEqual(output, expected);
  });

  await t.test('5. Engine resolution correctly switches based on environment variables', () => {
    const origEngine = process.env.DB_ENGINE;
    const origHost = process.env.DB_HOST;
    const origInstance = process.env.INSTANCE_CONNECTION_NAME;

    try {
      // Test explicit postgres
      process.env.DB_ENGINE = 'postgres';
      delete process.env.INSTANCE_CONNECTION_NAME;
      delete process.env.DB_HOST;
      assert.strictEqual(db.getEngine(), 'postgres');

      // Test Cloud SQL instance connection
      delete process.env.DB_ENGINE;
      process.env.INSTANCE_CONNECTION_NAME = 'my-gcp-project:us-central1:my-instance';
      assert.strictEqual(db.getEngine(), 'postgres');

      // Test fallback to sqlite when no gcp/pg variables
      delete process.env.INSTANCE_CONNECTION_NAME;
      delete process.env.DB_HOST;
      delete process.env.DB_ENGINE;
      assert.strictEqual(db.getEngine(), 'sqlite');
    } finally {
      process.env.DB_ENGINE = origEngine;
      process.env.DB_HOST = origHost;
      process.env.INSTANCE_CONNECTION_NAME = origInstance;
    }
  });

  await t.test('6. PostgreSQL schema file exists and contains all 8 required tables', () => {
    const schemaFile = path.resolve(__dirname, '../src/db/schema.postgres.sql');
    assert.ok(fs.existsSync(schemaFile), 'schema.postgres.sql must exist');

    const content = fs.readFileSync(schemaFile, 'utf8');
    const requiredTables = [
      'administrators',
      'employees',
      'assets',
      'asset_assignment_history',
      'software_licenses',
      'license_allocations',
      'audit_logs',
      'sessions'
    ];

    for (const table of requiredTables) {
      assert.ok(
        content.includes(`CREATE TABLE IF NOT EXISTS ${table}`),
        `PostgreSQL schema must create table ${table}`
      );
    }

    // Verify Cloud SQL specific types
    assert.ok(content.includes('SERIAL PRIMARY KEY'));
    assert.ok(content.includes('TIMESTAMP WITH TIME ZONE'));
    assert.ok(content.includes('bill_image_url TEXT NULL'));
    assert.ok(content.includes('bill_image_name VARCHAR(255) NULL'));
  });

  await t.test('7. TABLES_IN_ORDER reflects strict foreign key dependency hierarchy', () => {
    assert.deepStrictEqual(TABLES_IN_ORDER, [
      'administrators',
      'employees',
      'assets',
      'asset_assignment_history',
      'software_licenses',
      'license_allocations',
      'audit_logs',
      'sessions'
    ]);
  });
});
