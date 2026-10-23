const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const fs = require('fs');
const request = require('supertest');
const app = require('../src/app');
const db = require('../src/config/database');
const { migrate } = require('../src/db/migrate');
const healthRepository = require('../src/repositories/health.repository');

const TEST_DB_PATH = path.resolve(__dirname, '../../data/test_health_db.db');

test.before(async () => {
  process.env.DB_PATH = TEST_DB_PATH;
  await db.close();
  if (fs.existsSync(TEST_DB_PATH)) {
    fs.unlinkSync(TEST_DB_PATH);
  }
  // Initialize test database so health check has tables to count
  await migrate(TEST_DB_PATH);
});

test.after(async () => {
  await db.close();
  if (fs.existsSync(TEST_DB_PATH)) {
    try {
      fs.unlinkSync(TEST_DB_PATH);
    } catch {
      // ignore unlink error
    }
  }
});

test('9. GET /api/health returns 200 OK and expected JSON when healthy', async () => {
  const response = await request(app)
    .get('/api/health')
    .expect('Content-Type', /json/)
    .expect(200);

  const body = response.body;
  assert.strictEqual(body.status, 'UP', 'Status must be UP');
  assert.strictEqual(body.healthy, true, 'Healthy flag must be true');
  assert.ok(body.timestamp, 'Timestamp must be present');
  assert.ok(body.database, 'Database details object must be present');
  assert.strictEqual(body.database.status, 'CONNECTED', 'Database status must be CONNECTED');
  assert.strictEqual(body.database.engine, 'SQLite 3', 'Engine must report SQLite 3');
  assert.strictEqual(body.database.tablesFound, 8, 'Must report all 8 tables found');
});

test('10. GET /api/health returns 503 Service Unavailable when database fails', async () => {
  // Simulate a database failure by intercepting checkDatabaseHealth
  const originalCheck = healthRepository.checkDatabaseHealth;
  healthRepository.checkDatabaseHealth = async () => ({
    alive: false,
    tableCount: 0,
    error: 'SQLITE_CANTOPEN: unable to open database file'
  });

  try {
    const response = await request(app)
      .get('/api/health')
      .expect('Content-Type', /json/)
      .expect(503);

    const body = response.body;
    assert.strictEqual(body.status, 'DOWN', 'Status must be DOWN when database fails');
    assert.strictEqual(body.healthy, false, 'Healthy flag must be false');
    assert.ok(body.timestamp, 'Timestamp must be present');
    assert.strictEqual(body.database.status, 'DISCONNECTED', 'Database status must be DISCONNECTED');
    assert.strictEqual(body.database.error, 'SQLITE_CANTOPEN: unable to open database file');
  } finally {
    // Restore original method
    healthRepository.checkDatabaseHealth = originalCheck;
  }
});

test('404 Handler returns standardized JSON for nonexistent routes', async () => {
  const response = await request(app)
    .get('/api/nonexistent-route')
    .expect('Content-Type', /json/)
    .expect(404);

  assert.strictEqual(response.body.success, false);
  assert.ok(response.body.error.includes('Route not found'));
});
