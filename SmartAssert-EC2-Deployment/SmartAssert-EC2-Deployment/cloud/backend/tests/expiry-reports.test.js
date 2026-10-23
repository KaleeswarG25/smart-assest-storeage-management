const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const supertest = require('supertest');
const path = require('path');
const fs = require('fs');

// Configure test environment
process.env.NODE_ENV = 'test';

// Use isolated temporary test database
const testDbPath = path.resolve(__dirname, '../../data/test_expiry_reports.db');
process.env.DB_PATH = testDbPath;

const db = require('../src/config/database');
const app = require('../src/app');

const request = supertest(app);

// Test credentials
const TEST_ADMIN_USERNAME = 'expiry_test_admin';
const TEST_ADMIN_PASSWORD = 'TestP@ssw0rd!2024';

let sessionCookie = null;

describe('Module 6 — Expiry Alerts, Reports & CSV Export API Tests', () => {
  before(async () => {
    // Clean up any existing test database
    if (fs.existsSync(testDbPath)) {
      try { fs.unlinkSync(testDbPath); } catch { /* ignore */ }
    }

    // Initialize schema
    const schemaSql = fs.readFileSync(
      path.resolve(__dirname, '../src/db/schema.sql'),
      'utf-8'
    );
    await db.exec(schemaSql);

    // Create test admin
    const bcrypt = require('bcryptjs');
    const hash = await bcrypt.hash(TEST_ADMIN_PASSWORD, 10);
    await db.run(
      `INSERT INTO administrators (username, email, password_hash, full_name, role)
       VALUES (?, ?, ?, ?, 'SUPERADMIN')`,
      [TEST_ADMIN_USERNAME, 'expiry_admin@test.local', hash, 'Expiry Test Admin']
    );

    // Create test employees
    await db.run(
      `INSERT INTO employees (employee_code, first_name, last_name, email, department, designation, status)
       VALUES ('EXP-001', 'Alice', 'Wonder', 'alice.expiry@test.local', 'Engineering', 'Developer', 'ACTIVE')`
    );

    // Create test assets with varying warranty dates
    const today = new Date();
    const pastDate = new Date(today);
    pastDate.setDate(today.getDate() - 10);
    const nearDate = new Date(today);
    nearDate.setDate(today.getDate() + 5);
    const farDate = new Date(today);
    farDate.setDate(today.getDate() + 90);

    await db.run(
      `INSERT INTO assets (asset_tag, name, category, manufacturer, model, purchase_date, purchase_cost, warranty_expiry, status)
       VALUES ('EXP-AST-001', 'Expired Warranty Laptop', 'LAPTOP', 'Dell', 'Latitude 5520', '2022-01-15', 75000, ?, 'AVAILABLE')`,
      [pastDate.toISOString().split('T')[0]]
    );
    await db.run(
      `INSERT INTO assets (asset_tag, name, category, manufacturer, model, purchase_date, purchase_cost, warranty_expiry, status)
       VALUES ('EXP-AST-002', 'Near Warranty Laptop', 'LAPTOP', 'HP', 'EliteBook 840', '2023-03-10', 85000, ?, 'AVAILABLE')`,
      [nearDate.toISOString().split('T')[0]]
    );
    await db.run(
      `INSERT INTO assets (asset_tag, name, category, manufacturer, model, purchase_date, purchase_cost, warranty_expiry, status)
       VALUES ('EXP-AST-003', 'Valid Warranty Desktop', 'DESKTOP', 'Lenovo', 'ThinkCentre M70', '2024-06-01', 55000, ?, 'AVAILABLE')`,
      [farDate.toISOString().split('T')[0]]
    );
    await db.run(
      `INSERT INTO assets (asset_tag, name, category, manufacturer, model, purchase_date, purchase_cost, status)
       VALUES ('EXP-AST-004', 'No Warranty Monitor', 'MONITOR', 'LG', 'UltraWide 34', '2023-09-01', 32000, 'AVAILABLE')`
    );

    // Create test licenses with varying expiry dates
    await db.run(
      `INSERT INTO software_licenses (license_code, software_name, vendor, license_type, total_quantity, used_quantity, purchase_date, expiry_date, renewal_status)
       VALUES ('EXP-LIC-001', 'Expired Antivirus', 'Norton', 'ANNUAL_SUBSCRIPTION', 50, 10, '2022-01-01', ?, 'ACTIVE')`,
      [pastDate.toISOString().split('T')[0]]
    );
    await db.run(
      `INSERT INTO software_licenses (license_code, software_name, vendor, license_type, total_quantity, used_quantity, purchase_date, expiry_date, renewal_status)
       VALUES ('EXP-LIC-002', 'Near Expiry Office', 'Microsoft', 'ANNUAL_SUBSCRIPTION', 100, 45, '2023-01-01', ?, 'ACTIVE')`,
      [nearDate.toISOString().split('T')[0]]
    );
    await db.run(
      `INSERT INTO software_licenses (license_code, software_name, vendor, license_type, total_quantity, used_quantity, purchase_date, expiry_date, renewal_status)
       VALUES ('EXP-LIC-003', 'Valid IDE License', 'JetBrains', 'ANNUAL_SUBSCRIPTION', 25, 5, '2024-01-01', ?, 'ACTIVE')`,
      [farDate.toISOString().split('T')[0]]
    );
    await db.run(
      `INSERT INTO software_licenses (license_code, software_name, vendor, license_type, total_quantity, used_quantity, purchase_date, renewal_status)
       VALUES ('EXP-LIC-004', 'Perpetual CAD License', 'Autodesk', 'PERPETUAL', 10, 3, '2020-06-01', 'ACTIVE')`
    );

    // Create an assignment history record for reports test
    await db.run(
      `INSERT INTO asset_assignment_history (asset_id, employee_id, action, action_date, notes)
       VALUES (1, 1, 'ASSIGNED', DATETIME('now'), 'Test assignment for reports')`
    );

    // Log in to get session cookie
    const loginRes = await request.post('/api/auth/login').send({
      username: TEST_ADMIN_USERNAME,
      password: TEST_ADMIN_PASSWORD
    });
    assert.equal(loginRes.status, 200, 'Admin login should succeed');
    const setCookieHeader = loginRes.headers['set-cookie'];
    assert.ok(setCookieHeader, 'Login must set cookie');
    sessionCookie = setCookieHeader.map(c => c.split(';')[0]).join('; ');
  });

  after(async () => {
    await db.close();
    if (fs.existsSync(testDbPath)) {
      try { fs.unlinkSync(testDbPath); } catch { /* ignore */ }
    }
  });

  // ===================== EXPIRY API TESTS =====================

  it('1. GET /api/expiry/licenses rejects unauthenticated request with 401', async () => {
    const res = await request.get('/api/expiry/licenses');
    assert.equal(res.status, 401);
  });

  it('2. GET /api/expiry/licenses returns classified licenses with summary', async () => {
    const res = await request.get('/api/expiry/licenses')
      .set('Cookie', sessionCookie);

    assert.equal(res.status, 200);
    assert.ok(res.body.data.licenses);
    assert.ok(res.body.data.summary);
    assert.equal(res.body.data.summary.total, 4);

    // Check classification
    const licenses = res.body.data.licenses;
    const expired = licenses.find(l => l.license_code === 'EXP-LIC-001');
    assert.equal(expired.expiry_bucket, 'EXPIRED');
    assert.ok(expired.days_remaining < 0);

    const nearExpiry = licenses.find(l => l.license_code === 'EXP-LIC-002');
    assert.equal(nearExpiry.expiry_bucket, 'EXPIRING_7_DAYS');
    assert.ok(nearExpiry.days_remaining >= 0 && nearExpiry.days_remaining <= 7);

    const valid = licenses.find(l => l.license_code === 'EXP-LIC-003');
    assert.equal(valid.expiry_bucket, 'VALID');
    assert.ok(valid.days_remaining > 30);

    const perpetual = licenses.find(l => l.license_code === 'EXP-LIC-004');
    assert.equal(perpetual.expiry_bucket, 'NO_EXPIRY');
    assert.equal(perpetual.days_remaining, null);
  });

  it('3. GET /api/expiry/licenses?bucket=EXPIRED filters to expired licenses only', async () => {
    const res = await request.get('/api/expiry/licenses?bucket=EXPIRED')
      .set('Cookie', sessionCookie);

    assert.equal(res.status, 200);
    assert.equal(res.body.data.licenses.length, 1);
    assert.equal(res.body.data.licenses[0].license_code, 'EXP-LIC-001');
  });

  it('4. GET /api/expiry/licenses?search=Norton filters by search term', async () => {
    const res = await request.get('/api/expiry/licenses?search=Norton')
      .set('Cookie', sessionCookie);

    assert.equal(res.status, 200);
    assert.equal(res.body.data.licenses.length, 1);
    assert.equal(res.body.data.licenses[0].vendor, 'Norton');
  });

  it('5. GET /api/expiry/warranties returns classified warranty data', async () => {
    const res = await request.get('/api/expiry/warranties')
      .set('Cookie', sessionCookie);

    assert.equal(res.status, 200);
    assert.ok(res.body.data.assets);
    assert.ok(res.body.data.summary);
    assert.equal(res.body.data.summary.total, 4);

    const assets = res.body.data.assets;
    const expired = assets.find(a => a.asset_tag === 'EXP-AST-001');
    assert.equal(expired.warranty_bucket, 'EXPIRED');

    const near = assets.find(a => a.asset_tag === 'EXP-AST-002');
    assert.equal(near.warranty_bucket, 'EXPIRING_7_DAYS');

    const valid = assets.find(a => a.asset_tag === 'EXP-AST-003');
    assert.equal(valid.warranty_bucket, 'VALID');

    const noWarranty = assets.find(a => a.asset_tag === 'EXP-AST-004');
    assert.equal(noWarranty.warranty_bucket, 'NO_EXPIRY');
  });

  it('6. GET /api/expiry/warranties?bucket=EXPIRING_7_DAYS filters correctly', async () => {
    const res = await request.get('/api/expiry/warranties?bucket=EXPIRING_7_DAYS')
      .set('Cookie', sessionCookie);

    assert.equal(res.status, 200);
    assert.equal(res.body.data.assets.length, 1);
    assert.equal(res.body.data.assets[0].asset_tag, 'EXP-AST-002');
  });

  it('7. GET /api/expiry/summary returns combined dashboard summary', async () => {
    const res = await request.get('/api/expiry/summary')
      .set('Cookie', sessionCookie);

    assert.equal(res.status, 200);
    assert.ok(res.body.data.licenses);
    assert.ok(res.body.data.warranties);
    assert.equal(res.body.data.licenses.total, 4);
    assert.equal(res.body.data.warranties.total, 4);
    assert.ok(res.body.data.licenses.near_expiry_total >= 1);
    assert.ok(res.body.data.warranties.near_expiry_total >= 1);
  });

  // ===================== REPORT API TESTS =====================

  it('8. GET /api/reports rejects unauthenticated request with 401', async () => {
    const res = await request.get('/api/reports');
    assert.equal(res.status, 401);
  });

  it('9. GET /api/reports lists all available report types', async () => {
    const res = await request.get('/api/reports')
      .set('Cookie', sessionCookie);

    assert.equal(res.status, 200);
    assert.ok(Array.isArray(res.body.data.report_types));
    assert.equal(res.body.data.report_types.length, 7);
  });

  it('10. GET /api/reports/asset_inventory returns asset inventory report', async () => {
    const res = await request.get('/api/reports/asset_inventory')
      .set('Cookie', sessionCookie);

    assert.equal(res.status, 200);
    assert.equal(res.body.data.report_type, 'asset_inventory');
    assert.ok(res.body.data.record_count >= 4);
    assert.ok(Array.isArray(res.body.data.records));
  });

  it('11. GET /api/reports/assigned_assets returns assigned assets report', async () => {
    const res = await request.get('/api/reports/assigned_assets')
      .set('Cookie', sessionCookie);

    assert.equal(res.status, 200);
    assert.equal(res.body.data.report_type, 'assigned_assets');
    assert.ok(Array.isArray(res.body.data.records));
  });

  it('12. GET /api/reports/assignment_history returns history report', async () => {
    const res = await request.get('/api/reports/assignment_history')
      .set('Cookie', sessionCookie);

    assert.equal(res.status, 200);
    assert.equal(res.body.data.report_type, 'assignment_history');
    assert.ok(res.body.data.record_count >= 1);
  });

  it('13. GET /api/reports/license_inventory returns license inventory report', async () => {
    const res = await request.get('/api/reports/license_inventory')
      .set('Cookie', sessionCookie);

    assert.equal(res.status, 200);
    assert.equal(res.body.data.report_type, 'license_inventory');
    assert.ok(res.body.data.record_count >= 4);
  });

  it('14. GET /api/reports/seat_utilization returns seat utilization report', async () => {
    const res = await request.get('/api/reports/seat_utilization')
      .set('Cookie', sessionCookie);

    assert.equal(res.status, 200);
    assert.equal(res.body.data.report_type, 'seat_utilization');
    assert.ok(res.body.data.record_count >= 4);
    // Check utilization_percent is calculated
    const firstRecord = res.body.data.records[0];
    assert.ok(firstRecord.utilization_percent !== undefined);
  });

  it('15. GET /api/reports/expired_licenses returns only expired licenses', async () => {
    const res = await request.get('/api/reports/expired_licenses')
      .set('Cookie', sessionCookie);

    assert.equal(res.status, 200);
    assert.equal(res.body.data.report_type, 'expired_licenses');
    res.body.data.records.forEach(r => {
      assert.equal(r.expiry_bucket, 'EXPIRED');
    });
  });

  it('16. GET /api/reports/expiring_licenses returns only near-expiry licenses', async () => {
    const res = await request.get('/api/reports/expiring_licenses')
      .set('Cookie', sessionCookie);

    assert.equal(res.status, 200);
    assert.equal(res.body.data.report_type, 'expiring_licenses');
    res.body.data.records.forEach(r => {
      assert.ok(['EXPIRING_7_DAYS', 'EXPIRING_30_DAYS'].includes(r.expiry_bucket));
    });
  });

  it('17. GET /api/reports/invalid_type returns 400 Bad Request', async () => {
    const res = await request.get('/api/reports/invalid_type')
      .set('Cookie', sessionCookie);

    assert.equal(res.status, 400);
    assert.ok(res.body.error.includes('Invalid report type'));
  });

  // ===================== CSV EXPORT TESTS =====================

  it('18. GET /api/reports/asset_inventory/csv returns CSV with proper headers', async () => {
    const res = await request.get('/api/reports/asset_inventory/csv')
      .set('Cookie', sessionCookie);

    assert.equal(res.status, 200);
    assert.ok(res.headers['content-type'].includes('text/csv'));
    assert.ok(res.headers['content-disposition'].includes('attachment'));
    assert.ok(res.headers['content-disposition'].includes('.csv'));
    assert.ok(res.headers['x-content-type-options'] === 'nosniff');

    // Verify CSV structure
    const lines = res.text.split('\n');
    assert.ok(lines.length >= 2, 'CSV should have at least header + data rows');
    assert.ok(lines[0].includes('Asset Tag'));
    assert.ok(lines[0].includes('Name'));
  });

  it('19. GET /api/reports/license_inventory/csv returns CSV with license data', async () => {
    const res = await request.get('/api/reports/license_inventory/csv')
      .set('Cookie', sessionCookie);

    assert.equal(res.status, 200);
    assert.ok(res.headers['content-type'].includes('text/csv'));

    const lines = res.text.split('\n');
    assert.ok(lines[0].includes('License Code'));
    assert.ok(lines[0].includes('Software Name'));
  });

  it('20. CSV export protects against formula injection', async () => {
    // Create a license with a potentially dangerous name
    await db.run(
      `INSERT INTO software_licenses (license_code, software_name, vendor, license_type, total_quantity, used_quantity, purchase_date, renewal_status)
       VALUES ('INJ-001', '=cmd|test', '+DDE("cmd")', 'PERPETUAL', 5, 0, '2024-01-01', 'ACTIVE')`
    );

    const res = await request.get('/api/reports/license_inventory/csv')
      .set('Cookie', sessionCookie);

    assert.equal(res.status, 200);

    // Verify formula injection protection: dangerous values should be prefixed with single quote
    const lines = res.text.split('\n');
    const dataRow = lines.find(l => l.includes('INJ-001'));
    assert.ok(dataRow, 'Should find the injected record');
    // The software_name starting with = should be escaped
    assert.ok(dataRow.includes("'=cmd"), 'Formula-starting value should be prefixed with single quote');
  });

  it('21. GET /api/reports/invalid_type/csv returns 400 Bad Request', async () => {
    const res = await request.get('/api/reports/invalid_type/csv')
      .set('Cookie', sessionCookie);

    assert.equal(res.status, 400);
  });

  // ===================== UNIT TESTS =====================

  it('22. ExpiryService classifies dates correctly', async () => {
    const expiryService = require('../src/services/expiry.service');

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    // Test expired date
    const pastDate = new Date(today);
    pastDate.setDate(today.getDate() - 5);
    const expired = expiryService.classifyExpiry(pastDate.toISOString().split('T')[0]);
    assert.equal(expired.bucket, 'EXPIRED');
    assert.ok(expired.daysRemaining < 0);

    // Test 3 days from now
    const near = new Date(today);
    near.setDate(today.getDate() + 3);
    const nearResult = expiryService.classifyExpiry(near.toISOString().split('T')[0]);
    assert.equal(nearResult.bucket, 'EXPIRING_7_DAYS');
    assert.ok(nearResult.daysRemaining >= 2 && nearResult.daysRemaining <= 4, `Expected ~3 days, got ${nearResult.daysRemaining}`);

    // Test 15 days from now
    const medium = new Date(today);
    medium.setDate(today.getDate() + 15);
    const mediumResult = expiryService.classifyExpiry(medium.toISOString().split('T')[0]);
    assert.equal(mediumResult.bucket, 'EXPIRING_30_DAYS');
    assert.ok(mediumResult.daysRemaining >= 14 && mediumResult.daysRemaining <= 16, `Expected ~15 days, got ${mediumResult.daysRemaining}`);

    // Test 60 days from now
    const far = new Date(today);
    far.setDate(today.getDate() + 60);
    const farResult = expiryService.classifyExpiry(far.toISOString().split('T')[0]);
    assert.equal(farResult.bucket, 'VALID');
    assert.ok(farResult.daysRemaining >= 59 && farResult.daysRemaining <= 61, `Expected ~60 days, got ${farResult.daysRemaining}`);

    // Test null
    const noExpiry = expiryService.classifyExpiry(null);
    assert.equal(noExpiry.bucket, 'NO_EXPIRY');
    assert.equal(noExpiry.daysRemaining, null);
  });

  it('23. CSV sanitization prevents formula injection for all dangerous prefixes', () => {
    const { sanitizeCsvCell } = require('../src/services/report.service');

    // Test formula injection protection
    assert.ok(sanitizeCsvCell('=cmd|test').includes("'=cmd"), 'Should prefix = with single quote');
    assert.ok(sanitizeCsvCell('+DDE()').includes("'+DDE"), 'Should prefix + with single quote');
    assert.ok(sanitizeCsvCell('-formula').includes("'-formula"), 'Should prefix - with single quote');
    assert.ok(sanitizeCsvCell('@SUM(A1)').includes("'@SUM"), 'Should prefix @ with single quote');

    // Test normal values
    assert.equal(sanitizeCsvCell('Normal text'), '"Normal text"');
    assert.equal(sanitizeCsvCell(null), '');
    assert.equal(sanitizeCsvCell(undefined), '');
    assert.equal(sanitizeCsvCell(42), '"42"');
  });

  it('24. CSV generation produces valid structure with correct columns', () => {
    const { arrayToCsv } = require('../src/services/report.service');

    const data = [
      { name: 'Test Asset', tag: 'TAG-001', cost: 5000 },
      { name: 'Another Asset', tag: 'TAG-002', cost: 7500 }
    ];

    const columns = [
      { header: 'Asset Name', key: 'name' },
      { header: 'Asset Tag', key: 'tag' },
      { header: 'Cost', key: 'cost' }
    ];

    const csv = arrayToCsv(data, columns);
    const lines = csv.split('\n');

    assert.ok(lines[0].includes('Asset Name'));
    assert.ok(lines[0].includes('Asset Tag'));
    assert.ok(lines[0].includes('Cost'));
    assert.ok(lines[1].includes('Test Asset'));
    assert.ok(lines[1].includes('TAG-001'));
    assert.ok(lines[2].includes('Another Asset'));
  });

  it('25. Empty data produces CSV with headers only', () => {
    const { arrayToCsv } = require('../src/services/report.service');

    const csv = arrayToCsv([], [
      { header: 'Column A', key: 'a' },
      { header: 'Column B', key: 'b' }
    ]);

    const lines = csv.split('\n').filter(l => l.trim());
    assert.equal(lines.length, 1, 'Should only have header row');
    assert.ok(lines[0].includes('Column A'));
  });
});
