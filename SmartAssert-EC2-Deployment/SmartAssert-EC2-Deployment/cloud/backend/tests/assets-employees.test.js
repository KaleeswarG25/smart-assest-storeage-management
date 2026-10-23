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

const TEST_DB_PATH = path.resolve(__dirname, '../../data/test_assets_employees.db');
process.env.DB_PATH = TEST_DB_PATH;

const TEST_ADMIN = {
  username: 'assetadmin',
  email: 'assetadmin@enterprise.local',
  password: 'AssetAdminPass123!',
  fullName: 'Asset Management Administrator'
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

  // Run seed to populate sample employees and assets
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
    try {
      fs.unlinkSync(TEST_DB_PATH);
    } catch {
      // ignore
    }
  }
});

// ===========================================================================
// SECTION 1: EMPLOYEE MANAGEMENT TESTS
// ===========================================================================

test('1. GET /api/employees rejects unauthenticated requests with 401', async () => {
  const res = await request(app)
    .get('/api/employees')
    .expect(401);

  assert.strictEqual(res.body.success, false);
});

test('2. GET /api/employees succeeds when authenticated', async () => {
  const res = await request(app)
    .get('/api/employees')
    .set('Cookie', [authCookie])
    .expect(200);

  assert.strictEqual(res.body.success, true);
  assert.ok(Array.isArray(res.body.data.employees));
  assert.ok(res.body.data.employees.length >= 5);
  assert.ok(res.body.data.pagination.total >= 5);
});

test('3. POST /api/employees creates a new employee with valid data', async () => {
  const newEmp = {
    employee_code: 'EMP-9901',
    first_name: 'David',
    last_name: 'Kim',
    email: 'david.kim@enterprise.local',
    department: 'Cybersecurity',
    designation: 'Security Operations Analyst',
    status: 'ACTIVE'
  };

  const res = await request(app)
    .post('/api/employees')
    .set('Cookie', [authCookie])
    .send(newEmp)
    .expect(201);

  assert.strictEqual(res.body.success, true);
  assert.strictEqual(res.body.data.employee.employee_code, 'EMP-9901');
  assert.strictEqual(res.body.data.employee.email, 'david.kim@enterprise.local');

  // Verify audit log recorded
  const audit = await db.get(
    "SELECT * FROM audit_logs WHERE action = 'EMPLOYEE_CREATED' AND entity_id = ?",
    [res.body.data.employee.id]
  );
  assert.ok(audit, 'Audit log must record employee creation');
});

test('4. POST /api/employees rejects missing required fields with 400', async () => {
  const res = await request(app)
    .post('/api/employees')
    .set('Cookie', [authCookie])
    .send({ employee_code: 'EMP-EMPTY' })
    .expect(400);

  assert.strictEqual(res.body.success, false);
});

test('5. POST /api/employees rejects invalid email format with 400', async () => {
  const res = await request(app)
    .post('/api/employees')
    .set('Cookie', [authCookie])
    .send({
      employee_code: 'EMP-9902',
      first_name: 'Invalid',
      last_name: 'Email',
      email: 'not-an-email',
      department: 'IT',
      designation: 'Technician'
    })
    .expect(400);

  assert.strictEqual(res.body.success, false);
  assert.ok(res.body.error.includes('email'));
});

test('6. POST /api/employees rejects duplicate employee_code or email with 409', async () => {
  // Duplicate employee_code (EMP-1001 exists from seed)
  const resCode = await request(app)
    .post('/api/employees')
    .set('Cookie', [authCookie])
    .send({
      employee_code: 'EMP-1001',
      first_name: 'Duplicate',
      last_name: 'Code',
      email: 'unique.email@enterprise.local',
      department: 'QA',
      designation: 'Tester'
    })
    .expect(409);

  assert.strictEqual(resCode.body.success, false);
  assert.ok(resCode.body.error.includes('EMP-1001'));

  // Duplicate email (sarah.chen@enterprise.local exists from seed)
  const resEmail = await request(app)
    .post('/api/employees')
    .set('Cookie', [authCookie])
    .send({
      employee_code: 'EMP-9903',
      first_name: 'Duplicate',
      last_name: 'Email',
      email: 'sarah.chen@enterprise.local',
      department: 'QA',
      designation: 'Tester'
    })
    .expect(409);

  assert.strictEqual(resEmail.body.success, false);
  assert.ok(resEmail.body.error.includes('sarah.chen@enterprise.local'));
});

test('7. PUT /api/employees/:id updates an existing employee', async () => {
  const res = await request(app)
    .put('/api/employees/1')
    .set('Cookie', [authCookie])
    .send({
      designation: 'VP of Systems Architecture'
    })
    .expect(200);

  assert.strictEqual(res.body.success, true);
  assert.strictEqual(res.body.data.employee.designation, 'VP of Systems Architecture');
});

test('8. GET /api/employees/:id returns 404 for nonexistent employee', async () => {
  const res = await request(app)
    .get('/api/employees/99999')
    .set('Cookie', [authCookie])
    .expect(404);

  assert.strictEqual(res.body.success, false);
});

test('9. DELETE /api/employees/:id rejects deletion of employee with asset custody history (409)', async () => {
  // Employee 1 (Sarah Chen) holds ThinkPad T14 and has assignment history
  const res = await request(app)
    .delete('/api/employees/1')
    .set('Cookie', [authCookie])
    .expect(409);

  assert.strictEqual(res.body.success, false);
  assert.ok(res.body.error.includes('history') || res.body.error.includes('assigned'));
});

test('10. Safe deletion of an employee with zero history succeeds', async () => {
  // Create a temporary employee with no asset assignments
  const created = await request(app)
    .post('/api/employees')
    .set('Cookie', [authCookie])
    .send({
      employee_code: 'EMP-TEMP',
      first_name: 'Temp',
      last_name: 'Worker',
      email: 'temp.worker@enterprise.local',
      department: 'Contract',
      designation: 'Intern'
    })
    .expect(201);

  const empId = created.body.data.employee.id;

  const deleteRes = await request(app)
    .delete(`/api/employees/${empId}`)
    .set('Cookie', [authCookie])
    .expect(200);

  assert.strictEqual(deleteRes.body.success, true);
  assert.strictEqual(deleteRes.body.data.deleted, true);
});

// ===========================================================================
// SECTION 2: HARDWARE ASSET INVENTORY TESTS
// ===========================================================================

test('11. GET /api/assets rejects unauthenticated requests with 401', async () => {
  await request(app)
    .get('/api/assets')
    .expect(401);
});

test('12. GET /api/assets succeeds when authenticated and returns seeded assets', async () => {
  const res = await request(app)
    .get('/api/assets')
    .set('Cookie', [authCookie])
    .expect(200);

  assert.strictEqual(res.body.success, true);
  assert.ok(Array.isArray(res.body.data.assets));
  assert.ok(res.body.data.assets.length >= 6);
});

test('13. POST /api/assets creates a new asset in AVAILABLE status', async () => {
  const newAsset = {
    asset_tag: 'AST-2026-9001',
    serial_number: 'SN-TEST-9001',
    name: 'Precision 5680 Mobile Workstation',
    category: 'LAPTOP',
    manufacturer: 'Dell',
    model: 'Precision 5680',
    purchase_date: '2026-03-01',
    purchase_cost: 185000.00,
    warranty_expiry: '2029-03-01',
    notes: 'Engineering workstation'
  };

  const res = await request(app)
    .post('/api/assets')
    .set('Cookie', [authCookie])
    .send(newAsset)
    .expect(201);

  assert.strictEqual(res.body.success, true);
  assert.strictEqual(res.body.data.asset.asset_tag, 'AST-2026-9001');
  assert.strictEqual(res.body.data.asset.status, 'AVAILABLE');
  assert.strictEqual(res.body.data.asset.current_employee_id, null);

  // Verify audit log recorded
  const audit = await db.get(
    "SELECT * FROM audit_logs WHERE action = 'ASSET_CREATED' AND entity_id = ?",
    [res.body.data.asset.id]
  );
  assert.ok(audit, 'Audit log must record asset creation');
});

test('14. POST /api/assets rejects duplicate asset_tag with 409', async () => {
  const res = await request(app)
    .post('/api/assets')
    .set('Cookie', [authCookie])
    .send({
      asset_tag: 'AST-2026-0001', // already exists
      name: 'Duplicate Tag Laptop',
      category: 'LAPTOP',
      manufacturer: 'Lenovo',
      model: 'T14',
      purchase_date: '2026-01-01'
    })
    .expect(409);

  assert.strictEqual(res.body.success, false);
  assert.ok(res.body.error.includes('AST-2026-0001'));
});

test('15. POST /api/assets rejects invalid category with 400', async () => {
  const res = await request(app)
    .post('/api/assets')
    .set('Cookie', [authCookie])
    .send({
      asset_tag: 'AST-2026-9999',
      name: 'Invalid Cat Asset',
      category: 'SUPERCOMPUTER', // Invalid category
      manufacturer: 'IBM',
      model: 'Mainframe',
      purchase_date: '2026-01-01'
    })
    .expect(400);

  assert.strictEqual(res.body.success, false);
});

test('16. PUT /api/assets/:id updates asset metadata', async () => {
  const res = await request(app)
    .put('/api/assets/3') // Dell UltraSharp 27 (AVAILABLE)
    .set('Cookie', [authCookie])
    .send({
      notes: 'Updated notes: Display assigned to Training Lab Room 102'
    })
    .expect(200);

  assert.strictEqual(res.body.success, true);
  assert.ok(res.body.data.asset.notes.includes('Room 102'));
});

test('17. PUT /api/assets/:id rejects general modification of assignment custody (409)', async () => {
  // Asset 1 is ASSIGNED to Sarah Chen (id 1). Modifying status to AVAILABLE or employee to null via PUT must be rejected
  const res = await request(app)
    .put('/api/assets/1')
    .set('Cookie', [authCookie])
    .send({
      status: 'AVAILABLE'
    })
    .expect(409);

  assert.strictEqual(res.body.success, false);
  assert.ok(res.body.error.includes('return'));
});

test('18. GET /api/assets/:id returns 404 for nonexistent asset', async () => {
  const res = await request(app)
    .get('/api/assets/99999')
    .set('Cookie', [authCookie])
    .expect(404);

  assert.strictEqual(res.body.success, false);
});

test('19. Asset filtering by category and status behaves correctly', async () => {
  // Filter by category LAPTOP
  const resCat = await request(app)
    .get('/api/assets?category=LAPTOP')
    .set('Cookie', [authCookie])
    .expect(200);

  assert.ok(resCat.body.data.assets.length >= 2);
  for (const a of resCat.body.data.assets) {
    assert.strictEqual(a.category, 'LAPTOP');
  }

  // Filter by status AVAILABLE
  const resStatus = await request(app)
    .get('/api/assets?status=AVAILABLE')
    .set('Cookie', [authCookie])
    .expect(200);

  for (const a of resStatus.body.data.assets) {
    assert.strictEqual(a.status, 'AVAILABLE');
  }
});

test('20. DELETE /api/assets/:id rejects deletion of asset with assignment history (409)', async () => {
  // Asset 1 has assignment history
  const res = await request(app)
    .delete('/api/assets/1')
    .set('Cookie', [authCookie])
    .expect(409);

  assert.strictEqual(res.body.success, false);
  assert.ok(res.body.error.includes('assigned') || res.body.error.includes('history'));
});

test('21. Safe deletion of an asset with zero history succeeds', async () => {
  // Create a brand new asset with no assignments
  const created = await request(app)
    .post('/api/assets')
    .set('Cookie', [authCookie])
    .send({
      asset_tag: 'AST-TEMP-DEL',
      name: 'Temporary Deletable Monitor',
      category: 'MONITOR',
      manufacturer: 'BenQ',
      model: 'GW2480',
      purchase_date: '2026-01-01'
    })
    .expect(201);

  const assetId = created.body.data.asset.id;

  const deleteRes = await request(app)
    .delete(`/api/assets/${assetId}`)
    .set('Cookie', [authCookie])
    .expect(200);

  assert.strictEqual(deleteRes.body.success, true);
  assert.strictEqual(deleteRes.body.data.deleted, true);
});

// ===========================================================================
// SECTION 3: ASSIGNMENT & RETURN LIFECYCLE TESTS
// ===========================================================================

test('22. POST /api/assets/:id/assign assigns an available asset to an active employee', async () => {
  // Asset 3 is AVAILABLE. Employee 3 (Amina Diallo) is ACTIVE.
  const res = await request(app)
    .post('/api/assets/3/assign')
    .set('Cookie', [authCookie])
    .send({
      employee_id: 3,
      notes: 'External monitor deployed for remote DevOps station'
    })
    .expect(200);

  assert.strictEqual(res.body.success, true);
  assert.strictEqual(res.body.data.asset.status, 'ASSIGNED');
  assert.strictEqual(res.body.data.asset.current_employee_id, 3);
  assert.strictEqual(res.body.data.asset.current_employee_code, 'EMP-1003');

  // Verify asset_assignment_history record was created
  const history = await db.get(
    "SELECT * FROM asset_assignment_history WHERE asset_id = 3 AND action = 'ASSIGNED' ORDER BY id DESC LIMIT 1"
  );
  assert.ok(history, 'History record must exist');
  assert.strictEqual(history.employee_id, 3);
  assert.strictEqual(history.action, 'ASSIGNED');

  // Verify audit log
  const audit = await db.get(
    "SELECT * FROM audit_logs WHERE action = 'ASSET_ASSIGNED' AND entity_id = 3 ORDER BY id DESC LIMIT 1"
  );
  assert.ok(audit, 'Audit log must record ASSET_ASSIGNED');
});

test('23. GET /api/assets/:id/history returns chronological custody entries', async () => {
  const res = await request(app)
    .get('/api/assets/3/history')
    .set('Cookie', [authCookie])
    .expect(200);

  assert.strictEqual(res.body.success, true);
  assert.ok(Array.isArray(res.body.data.history));
  assert.ok(res.body.data.history.length >= 1);
  assert.strictEqual(res.body.data.history[0].action, 'ASSIGNED');
  assert.strictEqual(res.body.data.history[0].employee_id, 3);
});

test('24. POST /api/assets/:id/assign rejects assigning an already assigned asset with 409', async () => {
  // Asset 3 was just assigned above
  const res = await request(app)
    .post('/api/assets/3/assign')
    .set('Cookie', [authCookie])
    .send({
      employee_id: 4,
      notes: 'Attempting conflicting assignment'
    })
    .expect(409);

  assert.strictEqual(res.body.success, false);
  assert.ok(res.body.error.includes('already assigned'));
});

test('25. POST /api/assets/:id/assign rejects nonexistent employee with 404', async () => {
  // Asset 4 is AVAILABLE
  const res = await request(app)
    .post('/api/assets/4/assign')
    .set('Cookie', [authCookie])
    .send({
      employee_id: 99999
    })
    .expect(404);

  assert.strictEqual(res.body.success, false);
});

test('26. POST /api/assets/:id/assign rejects assigning to inactive (TERMINATED/ON_LEAVE) employee with 409', async () => {
  // Set employee 5 to TERMINATED
  await db.run("UPDATE employees SET status = 'TERMINATED' WHERE id = 5");

  const res = await request(app)
    .post('/api/assets/4/assign')
    .set('Cookie', [authCookie])
    .send({
      employee_id: 5
    })
    .expect(409);

  assert.strictEqual(res.body.success, false);
  assert.ok(res.body.error.includes('status') || res.body.error.includes('TERMINATED'));
});

test('27. POST /api/assets/:id/assign rejects assets in UNDER_MAINTENANCE or RETIRED status with 409', async () => {
  // Asset 5 is UNDER_MAINTENANCE
  const resMaint = await request(app)
    .post('/api/assets/5/assign')
    .set('Cookie', [authCookie])
    .send({ employee_id: 2 })
    .expect(409);

  assert.strictEqual(resMaint.body.success, false);
  assert.ok(resMaint.body.error.includes('UNDER_MAINTENANCE'));

  // Asset 6 is RETIRED
  const resRet = await request(app)
    .post('/api/assets/6/assign')
    .set('Cookie', [authCookie])
    .send({ employee_id: 2 })
    .expect(409);

  assert.strictEqual(resRet.body.success, false);
  assert.ok(resRet.body.error.includes('RETIRED'));
});

test('28. POST /api/assets/:id/return succeeds and returns asset to AVAILABLE status', async () => {
  // Asset 3 is ASSIGNED to employee 3. Perform return:
  const res = await request(app)
    .post('/api/assets/3/return')
    .set('Cookie', [authCookie])
    .send({
      notes: 'Monitor returned in perfect condition'
    })
    .expect(200);

  assert.strictEqual(res.body.success, true);
  assert.strictEqual(res.body.data.asset.status, 'AVAILABLE');
  assert.strictEqual(res.body.data.asset.current_employee_id, null);

  // Verify return recorded in history
  const history = await db.get(
    "SELECT * FROM asset_assignment_history WHERE asset_id = 3 AND action = 'RETURNED' ORDER BY id DESC LIMIT 1"
  );
  assert.ok(history, 'Return history record must exist');
  assert.strictEqual(history.employee_id, 3);
  assert.strictEqual(history.action, 'RETURNED');

  // Verify audit log
  const audit = await db.get(
    "SELECT * FROM audit_logs WHERE action = 'ASSET_RETURNED' AND entity_id = 3 ORDER BY id DESC LIMIT 1"
  );
  assert.ok(audit, 'Audit log must record ASSET_RETURNED');
});

test('29. POST /api/assets/:id/return rejects returning an unassigned asset with 409', async () => {
  // Asset 3 is now AVAILABLE (not assigned). Returning again must fail with 409
  const res = await request(app)
    .post('/api/assets/3/return')
    .set('Cookie', [authCookie])
    .send({ notes: 'Invalid return attempt' })
    .expect(409);

  assert.strictEqual(res.body.success, false);
  assert.ok(res.body.error.includes('not currently assigned'));
});

test('30. A returned asset can be assigned again, preserving historical custody records', async () => {
  // Ensure employee 4 (Vikram Patel) is ACTIVE
  await db.run("UPDATE employees SET status = 'ACTIVE' WHERE id = 4");

  // Re-assign Asset 3 to Employee 4
  const resReassign = await request(app)
    .post('/api/assets/3/assign')
    .set('Cookie', [authCookie])
    .send({
      employee_id: 4,
      notes: 'Reassigned to Finance Department'
    })
    .expect(200);

  assert.strictEqual(resReassign.body.data.asset.status, 'ASSIGNED');
  assert.strictEqual(resReassign.body.data.asset.current_employee_id, 4);

  // Check complete history: Should have ASSIGNED (emp 3) -> RETURNED (emp 3) -> ASSIGNED (emp 4)
  const historyRes = await request(app)
    .get('/api/assets/3/history')
    .set('Cookie', [authCookie])
    .expect(200);

  const history = historyRes.body.data.history;
  assert.ok(history.length >= 3, 'Must retain prior assignment and return records');
  assert.strictEqual(history[0].action, 'ASSIGNED'); // Latest
  assert.strictEqual(history[0].employee_id, 4);
  assert.strictEqual(history[1].action, 'RETURNED'); // Prior return
  assert.strictEqual(history[1].employee_id, 3);
  assert.strictEqual(history[2].action, 'ASSIGNED'); // Original assign
  assert.strictEqual(history[2].employee_id, 3);
});
