const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const db = require('../src/config/database');
const { migrate, REQUIRED_TABLES } = require('../src/db/migrate');
const { seed } = require('../src/db/seed');

const TEST_DB_PATH = path.resolve(__dirname, '../../data/test_database.db');

test.before(async () => {
  process.env.DB_PATH = TEST_DB_PATH;
  await db.close();
  if (fs.existsSync(TEST_DB_PATH)) {
    fs.unlinkSync(TEST_DB_PATH);
  }
});

test.after(async () => {
  await db.close();
  if (fs.existsSync(TEST_DB_PATH)) {
    try {
      fs.unlinkSync(TEST_DB_PATH);
    } catch {
      // ignore unlink error on Windows if held
    }
  }
});

test('1. Database initialization succeeds', async () => {
  const result = await migrate(TEST_DB_PATH);
  assert.strictEqual(result.success, true, 'Migration must report success');
  assert.ok(fs.existsSync(TEST_DB_PATH), 'Test database file must exist on disk');
});

test('2. All required tables exist in database (7 domain tables + sessions table)', async () => {
  const tables = await db.query(
    "SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' ORDER BY name;"
  );
  const tableNames = tables.map((t) => t.name);

  for (const expectedTable of REQUIRED_TABLES) {
    assert.ok(
      tableNames.includes(expectedTable),
      `Required table '${expectedTable}' must exist in sqlite_master`
    );
  }
  assert.strictEqual(REQUIRED_TABLES.length, 8, 'Must have 8 tables defined (7 domain + sessions)');
});

test('3. Foreign key enforcement is enabled on connection', async () => {
  const fkStatus = await db.get('PRAGMA foreign_keys;');
  assert.strictEqual(
    fkStatus.foreign_keys,
    1,
    'PRAGMA foreign_keys must be 1 (enabled)'
  );
});

test('4. Seed data inserts successfully and satisfies constraints', async () => {
  const seedResult = await seed(TEST_DB_PATH);
  assert.strictEqual(seedResult.success, true, 'Seed operation must succeed');
  assert.ok(seedResult.employees >= 5, 'Must seed at least 5 employees');
  assert.ok(seedResult.assets >= 6, 'Must seed at least 6 assets');
  assert.ok(seedResult.licenses >= 4, 'Must seed at least 4 software licenses');
  assert.ok(seedResult.allocations >= 8, 'Must seed at least 8 license allocations');

  // Verify employee records
  const empCount = await db.get('SELECT COUNT(*) as c FROM employees');
  assert.strictEqual(empCount.c, 5);

  // Verify asset state distribution
  const statusCounts = await db.query(
    'SELECT status, COUNT(*) as c FROM assets GROUP BY status ORDER BY status'
  );
  const statusMap = Object.fromEntries(statusCounts.map((s) => [s.status, s.c]));
  assert.ok(statusMap['AVAILABLE'] > 0, 'Must have AVAILABLE assets');
  assert.ok(statusMap['ASSIGNED'] > 0, 'Must have ASSIGNED assets');
  assert.ok(statusMap['UNDER_MAINTENANCE'] > 0, 'Must have UNDER_MAINTENANCE assets');
  assert.ok(statusMap['RETIRED'] > 0, 'Must have RETIRED assets');
});

test('5. Repeated execution of seed script is idempotent (does not duplicate records)', async () => {
  // Capture counts before second seed run
  const empBefore = (await db.get('SELECT COUNT(*) as c FROM employees')).c;
  const assetBefore = (await db.get('SELECT COUNT(*) as c FROM assets')).c;
  const licBefore = (await db.get('SELECT COUNT(*) as c FROM software_licenses')).c;
  const allocBefore = (await db.get('SELECT COUNT(*) as c FROM license_allocations')).c;
  const histBefore = (await db.get('SELECT COUNT(*) as c FROM asset_assignment_history')).c;

  // Run seed second time
  await seed(TEST_DB_PATH);

  // Compare counts after second seed run
  const empAfter = (await db.get('SELECT COUNT(*) as c FROM employees')).c;
  const assetAfter = (await db.get('SELECT COUNT(*) as c FROM assets')).c;
  const licAfter = (await db.get('SELECT COUNT(*) as c FROM software_licenses')).c;
  const allocAfter = (await db.get('SELECT COUNT(*) as c FROM license_allocations')).c;
  const histAfter = (await db.get('SELECT COUNT(*) as c FROM asset_assignment_history')).c;

  assert.strictEqual(empAfter, empBefore, 'Employee count must remain identical');
  assert.strictEqual(assetAfter, assetBefore, 'Asset count must remain identical');
  assert.strictEqual(licAfter, licBefore, 'License count must remain identical');
  assert.strictEqual(allocAfter, allocBefore, 'Allocation count must remain identical');
  assert.strictEqual(histAfter, histBefore, 'History count must remain identical');
});

test('6. Duplicate asset tag is rejected by UNIQUE constraint', async () => {
  await assert.rejects(
    async () => {
      // Attempt to insert duplicate asset_tag 'AST-2026-0001'
      await db.run(
        `INSERT INTO assets (asset_tag, serial_number, name, category, manufacturer, model, purchase_date, purchase_cost, status)
         VALUES ('AST-2026-0001', 'DUPLICATE-SN', 'Duplicate Asset', 'LAPTOP', 'Dell', 'XPS', '2026-01-01', 50000, 'AVAILABLE')`
      );
    },
    /UNIQUE constraint failed: assets\.asset_tag/,
    'Inserting duplicate asset_tag must trigger SQLITE_CONSTRAINT UNIQUE error'
  );
});

test('7. Invalid foreign-key reference is rejected', async () => {
  await assert.rejects(
    async () => {
      // Attempt to assign asset to non-existent employee ID 99999
      await db.run(
        `INSERT INTO assets (asset_tag, serial_number, name, category, manufacturer, model, purchase_date, purchase_cost, status, current_employee_id)
         VALUES ('AST-INVALID-FK', 'SN-INVALID-FK', 'Ghost Asset', 'LAPTOP', 'Lenovo', 'T14', '2026-01-01', 50000, 'ASSIGNED', 99999)`
      );
    },
    /FOREIGN KEY constraint failed/,
    'Assigning non-existent employee_id must trigger FOREIGN KEY constraint failure'
  );
});

test('8. License quantity constraints are strictly enforced', async () => {
  // Scenario A: used_quantity cannot exceed total_quantity
  await assert.rejects(
    async () => {
      await db.run(
        `INSERT INTO software_licenses (license_code, software_name, vendor, license_type, total_quantity, used_quantity, purchase_date, purchase_cost)
         VALUES ('LIC-OVERALLOC-TEST', 'Test Suite', 'Vendor', 'PERPETUAL', 5, 6, '2026-01-01', 10000)`
      );
    },
    /CHECK constraint failed/,
    'used_quantity > total_quantity must trigger CHECK constraint error'
  );

  // Scenario B: total_quantity must be > 0
  await assert.rejects(
    async () => {
      await db.run(
        `INSERT INTO software_licenses (license_code, software_name, vendor, license_type, total_quantity, used_quantity, purchase_date, purchase_cost)
         VALUES ('LIC-ZERO-TOTAL', 'Test Suite Zero', 'Vendor', 'PERPETUAL', 0, 0, '2026-01-01', 10000)`
      );
    },
    /CHECK constraint failed/,
    'total_quantity <= 0 must trigger CHECK constraint error'
  );
});
