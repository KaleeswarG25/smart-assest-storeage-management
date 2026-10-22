const db = require('../config/database');

/**
 * Seeds the database with realistic, fictional demonstration records.
 * The operation is wrapped in a transaction and idempotent:
 * re-running will not create duplicate records.
 */
async function seed(customDbPath = null) {
  if (customDbPath) {
    db.getDb(customDbPath);
  } else {
    db.getDb();
  }

  return await db.transaction(async ({ query, get, run }) => {
    // -------------------------------------------------------------------------
    // 1. Seed Administrators (Safe Provisioning Check - Never Overwrites Existing)
    // -------------------------------------------------------------------------
    const existingAdmin = await get('SELECT id FROM administrators LIMIT 1');
    let adminId = existingAdmin ? existingAdmin.id : null;

    if (!existingAdmin) {
      const initialPassword = process.env.ADMIN_PASSWORD || process.env.ADMIN_INITIAL_PASSWORD || (process.env.NODE_ENV === 'test' ? 'TestAdminPass123!' : null);
      if (initialPassword) {
        const bcrypt = require('bcryptjs');
        const hash = await bcrypt.hash(initialPassword, 10);
        const result = await run(
          `INSERT INTO administrators (id, username, email, password_hash, full_name, role)
           VALUES (1, ?, ?, ?, ?, 'SUPERADMIN')`,
          [
            process.env.ADMIN_USERNAME || 'itadmin',
            process.env.ADMIN_EMAIL || 'itadmin@enterprise.local',
            hash,
            process.env.ADMIN_NAME || 'Enterprise IT Administrator'
          ]
        );
        adminId = result.lastID;
      }
    }

    // -------------------------------------------------------------------------
    // 2. Seed Employees
    // -------------------------------------------------------------------------
    const employees = [
      { id: 1, code: 'EMP-1001', first: 'Sarah', last: 'Chen', email: 'sarah.chen@enterprise.local', dept: 'Engineering', desig: 'Principal Systems Architect' },
      { id: 2, code: 'EMP-1002', first: 'Marcus', last: 'Rodriguez', email: 'marcus.rodriguez@enterprise.local', dept: 'Product Design', desig: 'Lead UX Designer' },
      { id: 3, code: 'EMP-1003', first: 'Amina', last: 'Diallo', email: 'amina.diallo@enterprise.local', dept: 'Infrastructure', desig: 'Cloud DevOps Engineer' },
      { id: 4, code: 'EMP-1004', first: 'Vikram', last: 'Patel', email: 'vikram.patel@enterprise.local', dept: 'Finance', desig: 'Senior Financial Analyst' },
      { id: 5, code: 'EMP-1005', first: 'Elena', last: 'Rostova', email: 'elena.rostova@enterprise.local', dept: 'People Operations', desig: 'HR Operations Lead' }
    ];

    for (const emp of employees) {
      await run(
        `INSERT OR IGNORE INTO employees (id, employee_code, first_name, last_name, email, department, designation, status)
         VALUES (?, ?, ?, ?, ?, ?, ?, 'ACTIVE')`,
        [emp.id, emp.code, emp.first, emp.last, emp.email, emp.dept, emp.desig]
      );
    }

    // -------------------------------------------------------------------------
    // 3. Seed Assets (Representing All 4 Lifecycle States)
    // -------------------------------------------------------------------------
    const assets = [
      {
        id: 1,
        tag: 'AST-2026-0001',
        serial: 'SN-LN-987421',
        name: 'ThinkPad T14 Gen 4',
        cat: 'LAPTOP',
        mfr: 'Lenovo',
        model: '21HD0004US',
        pdate: '2025-01-15',
        cost: 95000.00,
        warranty: '2028-01-15',
        status: 'ASSIGNED',
        empId: 1, // Sarah Chen
        notes: 'Primary developer workstation with 32GB RAM'
      },
      {
        id: 2,
        tag: 'AST-2026-0002',
        serial: 'SN-AP-441209',
        name: 'MacBook Pro 16-inch M3 Max',
        cat: 'LAPTOP',
        mfr: 'Apple',
        model: 'MUW63HN/A',
        pdate: '2025-02-10',
        cost: 249900.00,
        warranty: '2028-02-10',
        status: 'ASSIGNED',
        empId: 2, // Marcus Rodriguez
        notes: 'Dedicated design workstation with Liquid Retina XDR'
      },
      {
        id: 3,
        tag: 'AST-2026-0003',
        serial: 'SN-DL-883190',
        name: 'Dell UltraSharp 27 4K USB-C Hub',
        cat: 'MONITOR',
        mfr: 'Dell',
        model: 'U2723QE',
        pdate: '2025-03-01',
        cost: 52000.00,
        warranty: '2028-03-01',
        status: 'AVAILABLE',
        empId: null,
        notes: 'Spare external display in IT hardware inventory'
      },
      {
        id: 4,
        tag: 'AST-2026-0004',
        serial: 'SN-CS-119283',
        name: 'Cisco Catalyst 1000 24-Port Switch',
        cat: 'NETWORKING',
        mfr: 'Cisco',
        model: 'C1000-24T-4G-L',
        pdate: '2024-06-15',
        cost: 78000.00,
        warranty: '2027-06-15',
        status: 'AVAILABLE',
        empId: null,
        notes: 'Rack-mount switch for Server Room B'
      },
      {
        id: 5,
        tag: 'AST-2026-0005',
        serial: 'SN-HP-332901',
        name: 'HP LaserJet Enterprise M507x',
        cat: 'PRINTER',
        mfr: 'HP',
        model: '1PV88A',
        pdate: '2023-04-10',
        cost: 45000.00,
        warranty: '2026-04-10',
        status: 'UNDER_MAINTENANCE',
        empId: null,
        notes: 'Fuser roller replacement underway via authorized vendor ticket #4912'
      },
      {
        id: 6,
        tag: 'AST-2026-0006',
        serial: 'SN-DL-002194',
        name: 'Dell OptiPlex 7070 Micro',
        cat: 'DESKTOP',
        mfr: 'Dell',
        model: 'OPT-7070-M',
        pdate: '2020-05-10',
        cost: 62000.00,
        warranty: '2023-05-10',
        status: 'RETIRED',
        empId: null,
        notes: 'End-of-life device securely wiped and prepared for e-waste recycling'
      }
    ];

    for (const a of assets) {
      await run(
        `INSERT OR IGNORE INTO assets (id, asset_tag, serial_number, name, category, manufacturer, model, purchase_date, purchase_cost, warranty_expiry, status, current_employee_id, notes)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [a.id, a.tag, a.serial, a.name, a.cat, a.mfr, a.model, a.pdate, a.cost, a.warranty, a.status, a.empId, a.notes]
      );
    }

    // -------------------------------------------------------------------------
    // 4. Seed Asset Assignment History (Preserves Past & Current Custody)
    // -------------------------------------------------------------------------
    const historyEntries = [
      { id: 1, assetId: 1, empId: 1, action: 'ASSIGNED', date: '2025-01-15 10:00:00', adminId: adminId || null, notes: 'Initial workstation provisioning for new joiner' },
      { id: 2, assetId: 2, empId: 2, action: 'ASSIGNED', date: '2025-02-10 11:30:00', adminId: adminId || null, notes: 'Design laptop allocation' },
      { id: 3, assetId: 5, empId: null, action: 'SENT_TO_MAINTENANCE', date: '2026-09-01 14:00:00', adminId: adminId || null, notes: 'Paper jam and roller wear reported' },
      { id: 4, assetId: 6, empId: 4, action: 'ASSIGNED', date: '2020-05-15 09:00:00', adminId: adminId || null, notes: 'Original deployment to Finance team' },
      { id: 5, assetId: 6, empId: 4, action: 'RETURNED', date: '2023-05-01 16:00:00', adminId: adminId || null, notes: 'Hardware upgrade return' },
      { id: 6, assetId: 6, empId: null, action: 'RETIRED', date: '2023-05-10 12:00:00', adminId: adminId || null, notes: 'Decommission approved after 3-year refresh' }
    ];

    for (const h of historyEntries) {
      await run(
        `INSERT OR IGNORE INTO asset_assignment_history (id, asset_id, employee_id, action, action_date, performed_by_admin_id, notes)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [h.id, h.assetId, h.empId, h.action, h.date, h.adminId, h.notes]
      );
    }

    // -------------------------------------------------------------------------
    // 5. Seed Software Licenses (Validating Quantity Constraints)
    // -------------------------------------------------------------------------
    const licenses = [
      {
        id: 1,
        code: 'LIC-MS-M365-E5',
        name: 'Microsoft 365 E5 Enterprise',
        vendor: 'Microsoft',
        type: 'ANNUAL_SUBSCRIPTION',
        total: 10,
        used: 3,
        pdate: '2026-01-01',
        expiry: '2027-01-01',
        cost: 360000.00,
        status: 'ACTIVE',
        notes: 'Enterprise collaboration, security, and Office applications'
      },
      {
        id: 2,
        code: 'LIC-JB-ALL-2026',
        name: 'JetBrains All Products Pack',
        vendor: 'JetBrains',
        type: 'ANNUAL_SUBSCRIPTION',
        total: 5,
        used: 2,
        pdate: '2025-11-15',
        expiry: '2026-11-15',
        cost: 145000.00,
        status: 'EXPIRING_SOON',
        notes: 'Developer IDE suite (IntelliJ, WebStorm, PyCharm)'
      },
      {
        id: 3,
        code: 'LIC-WIN11-PRO-OEM',
        name: 'Windows 11 Pro OEM',
        vendor: 'Microsoft',
        type: 'PERPETUAL',
        total: 20,
        used: 2,
        pdate: '2024-01-01',
        expiry: null,
        cost: 280000.00,
        status: 'ACTIVE',
        notes: 'Perpetual OEM licenses bundled with desktop fleet'
      },
      {
        id: 4,
        code: 'LIC-ADOBE-CC-2025',
        name: 'Adobe Creative Cloud All Apps',
        vendor: 'Adobe',
        type: 'ANNUAL_SUBSCRIPTION',
        total: 2,
        used: 1,
        pdate: '2025-09-01',
        expiry: '2026-09-01',
        cost: 110000.00,
        status: 'EXPIRED',
        notes: 'Creative suite license for UI/UX product department'
      }
    ];

    for (const lic of licenses) {
      await run(
        `INSERT OR IGNORE INTO software_licenses (id, license_code, software_name, vendor, license_type, total_quantity, used_quantity, purchase_date, expiry_date, purchase_cost, renewal_status, notes)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [lic.id, lic.code, lic.name, lic.vendor, lic.type, lic.total, lic.used, lic.pdate, lic.expiry, lic.cost, lic.status, lic.notes]
      );
    }

    // -------------------------------------------------------------------------
    // 6. Seed License Allocations (Matches used_quantity Exactly)
    // -------------------------------------------------------------------------
    const allocations = [
      // 3 seats of M365 E5
      { id: 1, licId: 1, empId: 1, assetId: null, notes: 'Sarah Chen primary corporate email & cloud seat' },
      { id: 2, licId: 1, empId: 2, assetId: null, notes: 'Marcus Rodriguez corporate seat' },
      { id: 3, licId: 1, empId: 3, assetId: null, notes: 'Amina Diallo corporate seat' },
      // 2 seats of JetBrains All Products Pack
      { id: 4, licId: 2, empId: 1, assetId: null, notes: 'Sarah Chen IntelliJ IDEA license' },
      { id: 5, licId: 2, empId: 3, assetId: null, notes: 'Amina Diallo WebStorm/GoLand license' },
      // 2 seats of Windows 11 OEM assigned to hardware
      { id: 6, licId: 3, empId: null, assetId: 1, notes: 'OEM license bound to ThinkPad T14 (AST-2026-0001)' },
      { id: 7, licId: 3, empId: null, assetId: 6, notes: 'OEM license bound to OptiPlex 7070 (AST-2026-0006)' },
      // 1 seat of Adobe CC
      { id: 8, licId: 4, empId: 2, assetId: null, notes: 'Marcus Rodriguez UI/UX design seat' }
    ];

    for (const al of allocations) {
      await run(
        `INSERT OR IGNORE INTO license_allocations (id, license_id, employee_id, asset_id, notes)
         VALUES (?, ?, ?, ?, ?)`,
        [al.id, al.licId, al.empId, al.assetId, al.notes]
      );
    }

    // -------------------------------------------------------------------------
    // 7. Seed Audit Logs (System Baseline Activity)
    // -------------------------------------------------------------------------
    const logs = [
      { id: 1, adminId: adminId || null, action: 'SYSTEM_INITIALIZED', type: 'SYSTEM', entityId: null, details: JSON.stringify({ event: 'Initial database schema and seed applied', version: '1.0.0' }) },
      { id: 2, adminId: adminId || null, action: 'ASSET_PROVISIONED', type: 'ASSET', entityId: 1, details: JSON.stringify({ assetTag: 'AST-2026-0001', assignee: 'EMP-1001' }) },
      { id: 3, adminId: adminId || null, action: 'LICENSE_ALLOCATED', type: 'LICENSE', entityId: 1, details: JSON.stringify({ licenseCode: 'LIC-MS-M365-E5', employeeCode: 'EMP-1001' }) }
    ];

    for (const l of logs) {
      await run(
        `INSERT OR IGNORE INTO audit_logs (id, admin_id, action, entity_type, entity_id, details)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [l.id, l.adminId, l.action, l.type, l.entityId, l.details]
      );
    }

    return {
      success: true,
      employees: employees.length,
      assets: assets.length,
      licenses: licenses.length,
      allocations: allocations.length,
      historyEntries: historyEntries.length
    };
  });
}

// Enable direct CLI execution
if (require.main === module) {
  (async () => {
    try {
      console.log('[Seed] Seeding sample demonstration data...');
      const summary = await seed();
      console.log('[Seed] Database seeded successfully:');
      console.log(` - Employees: ${summary.employees}`);
      console.log(` - Assets: ${summary.assets}`);
      console.log(` - Software Licenses: ${summary.licenses}`);
      console.log(` - License Allocations: ${summary.allocations}`);
      console.log(` - Custody History Entries: ${summary.historyEntries}`);
      process.exit(0);
    } catch (err) {
      console.error('[Seed] Failed:', err.message);
      process.exit(1);
    }
  })();
}

module.exports = { seed };
