process.env.NODE_ENV = 'test';
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const fs = require('fs');
const request = require('supertest');
const bcrypt = require('bcryptjs');

const app = require('../src/app');
const db = require('../src/config/database');
const { migrate } = require('../src/db/migrate');
const { validatePassword, provisionAdmin } = require('../src/scripts/createAdmin');
const { getCookieOptions } = require('../src/controllers/auth.controller');

const TEST_DB_PATH = path.resolve(__dirname, '../../data/test_auth_db.db');
process.env.DB_PATH = TEST_DB_PATH;

const TEST_ADMIN = {
  username: 'testsecadmin',
  email: 'secadmin@enterprise.local',
  password: 'AdminPassword123!',
  fullName: 'Security Test Administrator'
};

let activeSessionCookie = null;
let testAdminId = null;

test.before(async () => {
  process.env.DB_PATH = TEST_DB_PATH;
  await db.close();
  if (fs.existsSync(TEST_DB_PATH)) {
    fs.unlinkSync(TEST_DB_PATH);
  }
  await migrate(TEST_DB_PATH);

  // Seed test administrator with verified bcrypt hash
  const hash = await bcrypt.hash(TEST_ADMIN.password, 10);
  const result = await db.run(
    `INSERT INTO administrators (username, email, password_hash, full_name, role)
     VALUES (?, ?, ?, ?, 'SUPERADMIN')`,
    [TEST_ADMIN.username, TEST_ADMIN.email, hash, TEST_ADMIN.fullName]
  );
  testAdminId = result.lastID;
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

// ---------------------------------------------------------------------------
// 1. Password Policy Tests
// ---------------------------------------------------------------------------
test('1. Password policy enforces minimum length and complexity', () => {
  assert.ok(validatePassword('short'), 'Should reject passwords shorter than 8 chars');
  assert.ok(validatePassword('nouppernumberhere'), 'Should reject passwords lacking number/symbol');
  assert.strictEqual(validatePassword('ValidPass123!'), null, 'Should accept compliant passwords');
});

// ---------------------------------------------------------------------------
// 2. Login Tests: HttpOnly Cookie Exclusivity & No Token in JSON
// ---------------------------------------------------------------------------
test('2. Successful login sets HttpOnly cookie and does NOT return session token in JSON', async () => {
  const response = await request(app)
    .post('/api/auth/login')
    .send({
      username: TEST_ADMIN.username,
      password: TEST_ADMIN.password
    })
    .expect('Content-Type', /json/)
    .expect(200);

  const body = response.body;
  assert.strictEqual(body.success, true);

  // CRITICAL REQUIREMENT: Token must NOT be exposed in JSON response body
  assert.strictEqual(body.data.token, undefined, 'Login JSON data MUST NOT contain raw session token');
  assert.strictEqual(body.token, undefined, 'Login JSON root MUST NOT contain raw session token');

  // Verify sanitized administrator profile
  assert.strictEqual(body.data.administrator.username, TEST_ADMIN.username);
  assert.strictEqual(body.data.administrator.email, TEST_ADMIN.email);
  assert.strictEqual(body.data.administrator.password_hash, undefined, 'Must NEVER return password_hash');
  assert.strictEqual(body.data.administrator.sessionId, undefined, 'Must NEVER expose sessionId in profile');

  // Verify Set-Cookie header contains HttpOnly session_id with Path=/ and SameSite=Lax
  const setCookie = response.headers['set-cookie'];
  assert.ok(setCookie, 'Must set session cookie');
  const sessionCookieHeader = setCookie.find((c) => c.startsWith('session_id='));
  assert.ok(sessionCookieHeader, 'Cookie must be named session_id');
  assert.ok(sessionCookieHeader.includes('HttpOnly'), 'Cookie must specify HttpOnly');
  assert.ok(sessionCookieHeader.includes('Path=/'), 'Cookie must specify Path=/');
  assert.ok(sessionCookieHeader.toLowerCase().includes('samesite=lax'), 'Cookie must specify SameSite=Lax');

  activeSessionCookie = sessionCookieHeader;

  // Verify audit log recorded LOGIN_SUCCESS
  const log = await db.get(
    "SELECT * FROM audit_logs WHERE action = 'LOGIN_SUCCESS' AND admin_id = ? ORDER BY id DESC LIMIT 1",
    [testAdminId]
  );
  assert.ok(log, 'Must create audit log entry for successful login');
  assert.strictEqual(log.entity_type, 'AUTH');
});

test('3. POST /api/auth/login succeeds with email identifier (case-insensitive)', async () => {
  const response = await request(app)
    .post('/api/auth/login')
    .send({
      identifier: TEST_ADMIN.email.toUpperCase(),
      password: TEST_ADMIN.password
    })
    .expect(200);

  assert.strictEqual(response.body.success, true);
  assert.strictEqual(response.body.data.token, undefined, 'No token in email login JSON');
  assert.strictEqual(response.body.data.administrator.email, TEST_ADMIN.email);
});

test('4. POST /api/auth/login rejects invalid password with generic 401 error', async () => {
  const response = await request(app)
    .post('/api/auth/login')
    .send({
      username: TEST_ADMIN.username,
      password: 'WrongPassword999!'
    })
    .expect(401);

  assert.strictEqual(response.body.success, false);
  assert.strictEqual(response.body.error, 'Invalid username/email or password.');

  // Verify audit log recorded LOGIN_FAILED
  const log = await db.get(
    "SELECT * FROM audit_logs WHERE action = 'LOGIN_FAILED' ORDER BY id DESC LIMIT 1"
  );
  assert.ok(log, 'Must create audit log entry for failed login');
});

test('5. POST /api/auth/login rejects nonexistent user with identical generic 401 error', async () => {
  const response = await request(app)
    .post('/api/auth/login')
    .send({
      username: 'nonexistent_ghost_admin',
      password: 'SomePassword123!'
    })
    .expect(401);

  assert.strictEqual(response.body.success, false);
  assert.strictEqual(response.body.error, 'Invalid username/email or password.');
});

test('6. POST /api/auth/login returns 400 Bad Request on missing fields', async () => {
  const missingPassword = await request(app)
    .post('/api/auth/login')
    .send({ username: 'admin' })
    .expect(400);
  assert.strictEqual(missingPassword.body.success, false);

  const missingUser = await request(app)
    .post('/api/auth/login')
    .send({ password: 'password123' })
    .expect(400);
  assert.strictEqual(missingUser.body.success, false);
});

// ---------------------------------------------------------------------------
// 3. Cookie-Based Protected Route Verification Tests
// ---------------------------------------------------------------------------
test('7. GET /api/auth/me returns profile using cookie session', async () => {
  const response = await request(app)
    .get('/api/auth/me')
    .set('Cookie', [activeSessionCookie])
    .expect(200);

  const admin = response.body.data.administrator;
  assert.strictEqual(admin.username, TEST_ADMIN.username);
  assert.strictEqual(admin.email, TEST_ADMIN.email);
  assert.strictEqual(admin.password_hash, undefined, 'Must not leak password_hash');
  assert.strictEqual(admin.sessionId, undefined, 'Must not leak sessionId');
});

test('8. GET /api/auth/me returns 401 Unauthorized when unauthenticated', async () => {
  const response = await request(app)
    .get('/api/auth/me')
    .expect(401);

  assert.strictEqual(response.body.success, false);
  assert.ok(response.body.error.includes('Authentication required'));
});

test('9. GET /api/auth/verify protects arbitrary routes from unauthenticated access', async () => {
  // Without cookie -> 401
  await request(app)
    .get('/api/auth/verify')
    .expect(401);

  // With cookie -> 200
  const authed = await request(app)
    .get('/api/auth/verify')
    .set('Cookie', [activeSessionCookie])
    .expect(200);

  assert.strictEqual(authed.body.success, true);
  assert.ok(authed.body.message.includes('Access granted'));
});

// ---------------------------------------------------------------------------
// 4. Session Expiration, CSRF & Security Attribute Tests
// ---------------------------------------------------------------------------
test('10. Protected routes reject expired sessions', async () => {
  // Insert an expired session manually into test DB
  const expiredToken = 'expired_test_session_token_1234567890';
  await db.run(
    `INSERT INTO sessions (id, admin_id, expires_at)
     VALUES (?, ?, DATETIME('now', '-1 hour'))`,
    [expiredToken, testAdminId]
  );

  const response = await request(app)
    .get('/api/auth/me')
    .set('Cookie', [`session_id=${expiredToken}`])
    .expect(401);

  assert.strictEqual(response.body.success, false);
  assert.ok(response.body.error.includes('expired or invalid'));
});

test('11. Cookie-based state-changing requests block cross-site CSRF origins', async () => {
  const response = await request(app)
    .post('/api/auth/logout')
    .set('Cookie', [activeSessionCookie])
    .set('Origin', 'http://malicious-attacker-site.com')
    .expect(403);

  assert.strictEqual(response.body.success, false);
  assert.ok(
    response.body.error.includes('blocked') ||
    response.body.error.includes('CSRF validation failure')
  );
});

test('12. Production cookies include the Secure attribute', () => {
  const originalEnv = process.env.NODE_ENV;
  try {
    process.env.NODE_ENV = 'production';
    const prodCookieOpts = getCookieOptions();
    assert.strictEqual(prodCookieOpts.secure, true, 'Production cookies MUST have secure: true');
    assert.strictEqual(prodCookieOpts.httpOnly, true, 'Production cookies MUST have httpOnly: true');
    assert.strictEqual(prodCookieOpts.sameSite, 'lax', 'Production cookies MUST have sameSite: lax');
    assert.strictEqual(prodCookieOpts.path, '/', 'Production cookies MUST have path: /');
  } finally {
    process.env.NODE_ENV = originalEnv;
  }
});

// ---------------------------------------------------------------------------
// 5. Logout & Session Revocation Tests
// ---------------------------------------------------------------------------
test('13. POST /api/auth/logout revokes session in SQLite and clears cookie', async () => {
  // Perform logout with session cookie
  const response = await request(app)
    .post('/api/auth/logout')
    .set('Cookie', [activeSessionCookie])
    .expect(200);

  assert.strictEqual(response.body.success, true);

  // Verify Set-Cookie clears session_id with expiry in past
  const setCookie = response.headers['set-cookie'];
  assert.ok(setCookie, 'Must return clear-cookie header');
  const clearedCookie = setCookie.find((c) => c.startsWith('session_id='));
  assert.ok(clearedCookie, 'Must clear session_id cookie');
  assert.ok(
    clearedCookie.includes('Expires=') || clearedCookie.includes('Max-Age=0'),
    'Cookie must be expired on logout'
  );

  // Extract raw token from activeSessionCookie to check SQLite
  const match = activeSessionCookie.match(/session_id=([^;]+)/);
  const rawToken = match ? match[1] : null;

  // Verify session is deleted from sessions table in DB
  const sessionInDb = await db.get('SELECT * FROM sessions WHERE id = ?', [rawToken]);
  assert.strictEqual(sessionInDb, undefined, 'Session MUST be deleted from sessions table');

  // Verify subsequent request with the logged-out cookie returns 401 Unauthorized
  await request(app)
    .get('/api/auth/me')
    .set('Cookie', [activeSessionCookie])
    .expect(401);
});

// ---------------------------------------------------------------------------
// 6. Administrator Provisioning Environment Variable Test
// ---------------------------------------------------------------------------
test('14. Administrator provisioning uses documented ADMIN_PASSWORD environment variable', async () => {
  const originalPass = process.env.ADMIN_PASSWORD;
  const originalUser = process.env.ADMIN_USERNAME;
  const originalEmail = process.env.ADMIN_EMAIL;

  try {
    process.env.ADMIN_USERNAME = 'provadmin';
    process.env.ADMIN_EMAIL = 'provadmin@enterprise.local';
    process.env.ADMIN_PASSWORD = 'ProvPassword999!';
    process.env.ADMIN_NAME = 'Provisioned Administrator';

    // Execute provisioning script
    await provisionAdmin();

    // Verify administrator in database
    const admin = await db.get(
      'SELECT id, username, email, password_hash FROM administrators WHERE username = ?',
      ['provadmin']
    );
    assert.ok(admin, 'Provisioned administrator must exist in database');
    assert.strictEqual(admin.email, 'provadmin@enterprise.local');
    assert.notStrictEqual(admin.password_hash, 'ProvPassword999!', 'Password must NOT be stored in plaintext');

    // Verify bcrypt hash matches the password
    const matches = await bcrypt.compare('ProvPassword999!', admin.password_hash);
    assert.strictEqual(matches, true, 'bcrypt hash must match documented ADMIN_PASSWORD');

    // Verify automatic overwrite protection: attempting to provision again must NOT overwrite password
    process.env.ADMIN_PASSWORD = 'NewAttemptPassword123!';
    await provisionAdmin();
    const adminAfter = await db.get(
      'SELECT password_hash FROM administrators WHERE username = ?',
      ['provadmin']
    );
    assert.strictEqual(
      adminAfter.password_hash,
      admin.password_hash,
      'Existing administrator password must NOT be overwritten automatically'
    );
  } finally {
    process.env.ADMIN_PASSWORD = originalPass;
    process.env.ADMIN_USERNAME = originalUser;
    process.env.ADMIN_EMAIL = originalEmail;
  }
});
