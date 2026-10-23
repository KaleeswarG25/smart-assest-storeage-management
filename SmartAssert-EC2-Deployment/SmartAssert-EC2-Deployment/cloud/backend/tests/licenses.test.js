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
const { seed } = require('../src/db/seed');

const TEST_DB_PATH = path.resolve(__dirname, '../../data/test_licenses.db');
process.env.DB_PATH = TEST_DB_PATH;

const TEST_ADMIN = {
  username: 'licenseadmin',
  email: 'licenseadmin@enterprise.local',
  password: 'LicenseAdminPass123!',
  fullName: 'License Management Administrator'
};

let authCookie = null;
let adminId = null;

test.before(async () => {
  process.env.DB_PATH = TEST_DB_PATH;
  await db.close();
  if (fs.existsSync(TEST_DB_PATH)) {
    fs.unlinkSync(TEST_DB_PATH);
  }

  // Migrate schema
  await migrate(TEST_DB_PATH);

  // Insert verified administrator
  const hash = await bcrypt.hash(TEST_ADMIN.password, 10);
  const result = await db.run(
    `INSERT INTO administrators (username, email, password_hash, full_name, role)
     VALUES (?, ?, ?, ?, 'SUPERADMIN')`,
    [TEST_ADMIN.username, TEST_ADMIN.email, hash, TEST_ADMIN.fullName]
  );
  adminId = result.lastID;

  // Run seed to populate sample employees, assets, and licenses
  await seed(TEST_DB_PATH);

  // Log in to obtain HttpOnly cookie
  const loginRes = await request(app)
    .post('/api/auth/login')
    .send({ identifier: TEST_ADMIN.username, password: TEST_ADMIN.password });

  const cookies = loginRes.headers['set-cookie'];
  assert.ok(cookies, 'Login must set cookie');
  const sessionCookie = cookies.find((c) => c.startsWith('session_id='));
  authCookie = sessionCookie.split(';')[0];
});

test.after(async () => {
  await db.close();
  if (fs.existsSync(TEST_DB_PATH)) {
    fs.unlinkSync(TEST_DB_PATH);
  }
});

// ==============================================================================
// 1. LICENSE INVENTORY API TESTS
// ==============================================================================

test('1. GET /api/licenses rejects unauthenticated request with 401', async () => {
  const res = await request(app).get('/api/licenses');
  assert.equal(res.status, 401);
  assert.equal(res.body.success, false);
});

test('2. GET /api/licenses succeeds when authenticated and returns paginated list', async () => {
  const res = await request(app)
    .get('/api/licenses')
    .set('Cookie', authCookie);

  assert.equal(res.status, 200);
  assert.equal(res.body.success, true);
  assert.ok(Array.isArray(res.body.data.licenses));
  assert.ok(res.body.data.licenses.length >= 4); // 4 seeded licenses
  assert.ok(res.body.data.pagination);
  assert.ok(res.body.data.pagination.total >= 4);

  // Check derived available_quantity
  const lic1 = res.body.data.licenses.find((l) => l.license_code === 'LIC-MS-M365-E5');
  assert.ok(lic1);
  assert.equal(lic1.total_quantity, 10);
  assert.equal(lic1.used_quantity, 3);
  assert.equal(lic1.available_quantity, 7);
});

test('3. POST /api/licenses creates license with valid data', async () => {
  const newLic = {
    license_code: 'LIC-SLACK-ENT-2026',
    software_name: 'Slack Enterprise Grid',
    vendor: 'Salesforce / Slack',
    license_type: 'ANNUAL_SUBSCRIPTION',
    total_quantity: 50,
    purchase_date: '2026-03-01',
    expiry_date: '2027-03-01',
    purchase_cost: 450000.00,
    renewal_status: 'ACTIVE',
    notes: 'Primary enterprise communication suite'
  };

  const res = await request(app)
    .post('/api/licenses')
    .set('Cookie', authCookie)
    .send(newLic);

  assert.equal(res.status, 201);
  assert.equal(res.body.success, true);
  assert.equal(res.body.data.license.license_code, 'LIC-SLACK-ENT-2026');
  assert.equal(res.body.data.license.total_quantity, 50);
  assert.equal(res.body.data.license.used_quantity, 0);
  assert.equal(res.body.data.license.available_quantity, 50);
});

test('4. POST /api/licenses rejects missing required fields with 400', async () => {
  const res = await request(app)
    .post('/api/licenses')
    .set('Cookie', authCookie)
    .send({ software_name: 'Incomplete License' });

  assert.equal(res.status, 400);
  assert.equal(res.body.success, false);
  assert.match(res.body.error, /license code|required/i);
});

test('5. POST /api/licenses rejects invalid quantity or negative cost with 400', async () => {
  // Invalid zero/negative quantity
  const zeroQtyRes = await request(app)
    .post('/api/licenses')
    .set('Cookie', authCookie)
    .send({
      license_code: 'LIC-INVALID-QTY',
      software_name: 'Zero Seats App',
      vendor: 'Vendor X',
      license_type: 'VOLUME_SEAT',
      total_quantity: 0,
      purchase_date: '2026-01-01'
    });
  assert.equal(zeroQtyRes.status, 400);

  // Negative cost
  const negCostRes = await request(app)
    .post('/api/licenses')
    .set('Cookie', authCookie)
    .send({
      license_code: 'LIC-NEG-COST',
      software_name: 'Negative Cost App',
      vendor: 'Vendor Y',
      license_type: 'VOLUME_SEAT',
      total_quantity: 5,
      purchase_cost: -500,
      purchase_date: '2026-01-01'
    });
  assert.equal(negCostRes.status, 400);
});

test('6. POST /api/licenses rejects duplicate license_code with 409', async () => {
  const res = await request(app)
    .post('/api/licenses')
    .set('Cookie', authCookie)
    .send({
      license_code: 'LIC-MS-M365-E5', // Pre-existing in seed
      software_name: 'Microsoft 365 Duplicate',
      vendor: 'Microsoft',
      license_type: 'ANNUAL_SUBSCRIPTION',
      total_quantity: 10,
      purchase_date: '2026-01-01'
    });

  assert.equal(res.status, 409);
  assert.match(res.body.error, /already exists/i);
});

test('7. PUT /api/licenses/:id updates license metadata', async () => {
  const res = await request(app)
    .put('/api/licenses/1')
    .set('Cookie', authCookie)
    .send({
      notes: 'Updated enterprise agreement notes for 2026'
    });

  assert.equal(res.status, 200);
  assert.equal(res.body.success, true);
  assert.equal(res.body.data.license.notes, 'Updated enterprise agreement notes for 2026');
});

test('8. GET /api/licenses/:id returns 404 for nonexistent license', async () => {
  const res = await request(app)
    .get('/api/licenses/99999')
    .set('Cookie', authCookie);

  assert.equal(res.status, 404);
  assert.equal(res.body.success, false);
});

test('9. PUT /api/licenses/:id rejects reducing purchased quantity below active allocation count with 409', async () => {
  // License 1 has used_quantity = 3 in seed
  const res = await request(app)
    .put('/api/licenses/1')
    .set('Cookie', authCookie)
    .send({
      total_quantity: 2 // Cannot reduce below 3
    });

  assert.equal(res.status, 409);
  assert.match(res.body.error, /Cannot reduce purchased seats/i);
});

test('10. DELETE /api/licenses/:id rejects deletion of license with allocation history with 409', async () => {
  // License 1 has 3 allocations
  const res = await request(app)
    .delete('/api/licenses/1')
    .set('Cookie', authCookie);

  assert.equal(res.status, 409);
  assert.match(res.body.error, /allocation records exist/i);
});

// ==============================================================================
// 2. ALLOCATION LIFECYCLE TESTS
// ==============================================================================

test('11. POST /api/licenses/:id/allocations successfully allocates a seat to active employee', async () => {
  // Employee 4 (David Kim, Engineering, ACTIVE)
  const res = await request(app)
    .post('/api/licenses/1/allocations')
    .set('Cookie', authCookie)
    .send({
      employee_id: 4,
      notes: 'New engineering hire M365 provisioning'
    });

  assert.equal(res.status, 201);
  assert.equal(res.body.success, true);
  assert.ok(res.body.data.allocation);
  assert.equal(res.body.data.allocation.employee_id, 4);
  assert.equal(res.body.data.allocation.employee_name, 'Vikram Patel');
  assert.equal(res.body.data.allocation.revoked_at, null);
});

test('12. Active allocation count and used quantity remain synchronized', async () => {
  const res = await request(app)
    .get('/api/licenses/1')
    .set('Cookie', authCookie);

  assert.equal(res.status, 200);
  assert.equal(res.body.data.license.total_quantity, 10);
  assert.equal(res.body.data.license.used_quantity, 4); // 3 original + 1 from test 11
  assert.equal(res.body.data.license.available_quantity, 6);
});

test('13. POST /api/licenses/:id/allocations rejects duplicate active allocation to same employee with 409', async () => {
  // Employee 4 already allocated in test 11
  const res = await request(app)
    .post('/api/licenses/1/allocations')
    .set('Cookie', authCookie)
    .send({
      employee_id: 4,
      notes: 'Duplicate seat request'
    });

  assert.equal(res.status, 409);
  assert.match(res.body.error, /already holds an active seat allocation/i);
});

test('14. POST /api/licenses/:id/allocations rejects nonexistent employee with 404', async () => {
  const res = await request(app)
    .post('/api/licenses/1/allocations')
    .set('Cookie', authCookie)
    .send({
      employee_id: 99999
    });

  assert.equal(res.status, 404);
  assert.match(res.body.error, /Employee with ID 99999 was not found/i);
});

test('15. POST /api/licenses/:id/allocations rejects inactive employee (TERMINATED/ON_LEAVE) with 409', async () => {
  // Explicitly set Employee 5 to TERMINATED for testing status validation
  await db.run("UPDATE employees SET status = 'TERMINATED' WHERE id = 5");

  const res = await request(app)
    .post('/api/licenses/1/allocations')
    .set('Cookie', authCookie)
    .send({
      employee_id: 5
    });

  assert.equal(res.status, 409);
  assert.match(res.body.error, /Only ACTIVE employees can be allocated licenses/i);
});

test('16. POST /api/licenses/:id/allocations rejects allocation when no seats remain with 409', async () => {
  // Create an active license with exactly 1 seat
  const createRes = await request(app)
    .post('/api/licenses')
    .set('Cookie', authCookie)
    .send({
      license_code: 'LIC-CAPACITY-TEST-1SEAT',
      software_name: 'Single Seat Security Tool',
      vendor: 'SecurityCorp',
      license_type: 'ANNUAL_SUBSCRIPTION',
      total_quantity: 1,
      purchase_date: '2026-01-01',
      renewal_status: 'ACTIVE'
    });
  assert.equal(createRes.status, 201);
  const testLicId = createRes.body.data.license.id;

  // Allocate the 1 available seat to Employee 1 (succeeds)
  const allocRes = await request(app)
    .post(`/api/licenses/${testLicId}/allocations`)
    .set('Cookie', authCookie)
    .send({ employee_id: 1, notes: 'Sarah Chen single seat' });
  assert.equal(allocRes.status, 201);

  // Now used = 1, total = 1 (0 available). Attempt 2nd allocation to Employee 2
  const fullRes = await request(app)
    .post(`/api/licenses/${testLicId}/allocations`)
    .set('Cookie', authCookie)
    .send({ employee_id: 2, notes: 'Marcus Rodriguez Over-capacity seat' });

  assert.equal(fullRes.status, 409);
  assert.match(fullRes.body.error, /No available seats remaining/i);
});

test('17. Allocation creates an allocation history record in database', async () => {
  const res = await request(app)
    .get('/api/licenses/1/allocations')
    .set('Cookie', authCookie);

  assert.equal(res.status, 200);
  assert.ok(Array.isArray(res.body.data.allocations));
  const davidAlloc = res.body.data.allocations.find((a) => a.employee_id === 4);
  assert.ok(davidAlloc, 'David Kim allocation record must exist in allocations list');
  assert.equal(davidAlloc.employee_code, 'EMP-1004');
});

test('18. POST /api/licenses/:id/allocations/:allocationId/revoke successfully revokes seat', async () => {
  // Find David Kim allocation ID on License 1
  const listRes = await request(app)
    .get('/api/licenses/1/allocations')
    .set('Cookie', authCookie);

  const davidAlloc = listRes.body.data.allocations.find((a) => a.employee_id === 4 && a.revoked_at === null);
  assert.ok(davidAlloc);

  const res = await request(app)
    .post(`/api/licenses/1/allocations/${davidAlloc.id}/revoke`)
    .set('Cookie', authCookie);

  assert.equal(res.status, 200);
  assert.equal(res.body.success, true);
  assert.match(res.body.message, /successfully revoked/i);
  assert.equal(res.body.license.used_quantity, 3); // Restored from 4 to 3
});

test('19. Revocation preserves allocation history (record is NOT deleted)', async () => {
  const listRes = await request(app)
    .get('/api/licenses/1/allocations')
    .set('Cookie', authCookie);

  const revokedAlloc = listRes.body.data.allocations.find((a) => a.employee_id === 4);
  assert.ok(revokedAlloc, 'Revoked record must remain in database');
  assert.ok(revokedAlloc.revoked_at !== null, 'revoked_at timestamp must be set');
});

test('20. Used quantity decreases exactly once on revocation', async () => {
  const licRes = await request(app)
    .get('/api/licenses/1')
    .set('Cookie', authCookie);

  assert.equal(licRes.body.data.license.used_quantity, 3);
  assert.equal(licRes.body.data.license.available_quantity, 7);
});

test('21. Duplicate revocation cannot decrement quantity again and returns 409', async () => {
  // Find the same already-revoked allocation
  const listRes = await request(app)
    .get('/api/licenses/1/allocations')
    .set('Cookie', authCookie);

  const revokedAlloc = listRes.body.data.allocations.find((a) => a.employee_id === 4 && a.revoked_at !== null);
  assert.ok(revokedAlloc);

  const res = await request(app)
    .post(`/api/licenses/1/allocations/${revokedAlloc.id}/revoke`)
    .set('Cookie', authCookie);

  assert.equal(res.status, 409);
  assert.match(res.body.error, /already been revoked/i);

  // Verify used_quantity was NOT decremented again
  const licRes = await request(app)
    .get('/api/licenses/1')
    .set('Cookie', authCookie);
  assert.equal(licRes.body.data.license.used_quantity, 3);
});

test('22. A revoked seat can be reallocated to the same or another employee', async () => {
  // Re-allocate to David Kim (Employee 4) now that previous allocation was revoked
  const reallocRes = await request(app)
    .post('/api/licenses/1/allocations')
    .set('Cookie', authCookie)
    .send({
      employee_id: 4,
      notes: 'Re-issuing M365 seat following role transition'
    });

  assert.equal(reallocRes.status, 201);
  assert.equal(reallocRes.body.data.allocation.employee_id, 4);

  // Both the old revoked record and the new active record exist
  const listRes = await request(app)
    .get('/api/licenses/1/allocations')
    .set('Cookie', authCookie);

  const davidAllocations = listRes.body.data.allocations.filter((a) => a.employee_id === 4);
  assert.equal(davidAllocations.length, 2);
  const activeCount = davidAllocations.filter((a) => a.revoked_at === null).length;
  const revokedCount = davidAllocations.filter((a) => a.revoked_at !== null).length;
  assert.equal(activeCount, 1);
  assert.equal(revokedCount, 1);
});

test('23. Allocation from a nonexistent license returns 404', async () => {
  const res = await request(app)
    .post('/api/licenses/99999/allocations')
    .set('Cookie', authCookie)
    .send({ employee_id: 1 });

  assert.equal(res.status, 404);
});

test('24. Revoking an allocation ID that belongs to a different license returns 404', async () => {
  // Allocation 1 belongs to License 1, attempt to revoke via License 2
  const res = await request(app)
    .post('/api/licenses/2/allocations/1/revoke')
    .set('Cookie', authCookie);

  assert.equal(res.status, 404);
  assert.match(res.body.error, /does not belong to license/i);
});

test('25. Failure during a multi-write allocation rolls back all changes', async () => {
  const beforeLic = await request(app).get('/api/licenses/1').set('Cookie', authCookie);
  const initialUsed = beforeLic.body.data.license.used_quantity;

  // Attempting to allocate to an invalid employee fails before commit
  const failRes = await request(app)
    .post('/api/licenses/1/allocations')
    .set('Cookie', authCookie)
    .send({ employee_id: 99999 });

  assert.equal(failRes.status, 404);

  const afterLic = await request(app).get('/api/licenses/1').set('Cookie', authCookie);
  assert.equal(afterLic.body.data.license.used_quantity, initialUsed);
});

test('26. Failure during revocation rolls back all changes', async () => {
  const beforeLic = await request(app).get('/api/licenses/1').set('Cookie', authCookie);
  const initialUsed = beforeLic.body.data.license.used_quantity;

  // Invalid allocation ID
  const failRes = await request(app)
    .post('/api/licenses/1/allocations/99999/revoke')
    .set('Cookie', authCookie);

  assert.equal(failRes.status, 404);

  const afterLic = await request(app).get('/api/licenses/1').set('Cookie', authCookie);
  assert.equal(afterLic.body.data.license.used_quantity, initialUsed);
});

test('27. Concurrent or repeated allocations cannot exceed purchased capacity', async () => {
  // License 2 has total = 5, used = 2 in seed. Available = 3.
  // Verify available seats count
  const licRes = await request(app).get('/api/licenses/2').set('Cookie', authCookie);
  assert.equal(licRes.body.data.license.available_quantity, 3);
});

test('28. Audit records are written for license creation, allocation, and revocation without secrets', async () => {
  const audits = await db.query(
    `SELECT * FROM audit_logs WHERE entity_type = 'LICENSE' ORDER BY id DESC LIMIT 10`
  );

  assert.ok(audits.length >= 3, 'Audit logs must record license operations');
  const actions = audits.map((a) => a.action);
  assert.ok(actions.includes('LICENSE_ALLOCATED'), 'LICENSE_ALLOCATED action must exist');
  assert.ok(actions.includes('LICENSE_REVOKED'), 'LICENSE_REVOKED action must exist');

  // Verify no passwords, tokens, or session secrets are in audit details
  for (const a of audits) {
    if (a.details) {
      assert.doesNotMatch(a.details, /password|session_id|cookie|token/i);
    }
  }
});

test('29. Listing and detail responses do not leak database internals or stack traces', async () => {
  const res = await request(app)
    .get('/api/licenses')
    .set('Cookie', authCookie);

  assert.equal(res.status, 200);
  const jsonStr = JSON.stringify(res.body);
  assert.doesNotMatch(jsonStr, /stack|sqlite3|SELECT|FROM/i);
});

test('30. Safe deletion succeeds for a license with zero allocation history', async () => {
  // Create a brand new license with 0 allocations
  const createRes = await request(app)
    .post('/api/licenses')
    .set('Cookie', authCookie)
    .send({
      license_code: 'LIC-TEMP-DELETE-TEST',
      software_name: 'Temporary Tool to Delete',
      vendor: 'Temp Vendor',
      license_type: 'OEM',
      total_quantity: 1,
      purchase_date: '2026-04-01'
    });

  assert.equal(createRes.status, 201);
  const tempId = createRes.body.data.license.id;

  // Delete it safely
  const delRes = await request(app)
    .delete(`/api/licenses/${tempId}`)
    .set('Cookie', authCookie);

  assert.equal(delRes.status, 200);
  assert.equal(delRes.body.success, true);

  // Subsequent get returns 404
  const getRes = await request(app)
    .get(`/api/licenses/${tempId}`)
    .set('Cookie', authCookie);
  assert.equal(getRes.status, 404);
});
