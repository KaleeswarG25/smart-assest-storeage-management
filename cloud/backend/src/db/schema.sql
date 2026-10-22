-- ==============================================================================
-- DATABASE SCHEMA: IT ASSET LIFECYCLE & SOFTWARE LICENSE MANAGEMENT SYSTEM
-- Compatible with SQLite 3 (Stage A) and convertible to PostgreSQL (Stage B)
-- ==============================================================================

PRAGMA foreign_keys = ON;

-- 1. ADMINISTRATORS TABLE
-- Internal IT administrators authorized to manage assets and licenses
CREATE TABLE IF NOT EXISTS administrators (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT NOT NULL UNIQUE,
    email TEXT NOT NULL UNIQUE,
    password_hash TEXT NOT NULL,
    full_name TEXT NOT NULL,
    role TEXT NOT NULL DEFAULT 'SUPERADMIN' CHECK (role IN ('SUPERADMIN', 'OPERATOR')),
    created_at TEXT NOT NULL DEFAULT (DATETIME('now')),
    last_login TEXT NULL
);

-- 2. EMPLOYEES TABLE
-- Directory of corporate personnel eligible to receive assets and licenses
CREATE TABLE IF NOT EXISTS employees (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    employee_code TEXT NOT NULL UNIQUE,
    first_name TEXT NOT NULL,
    last_name TEXT NOT NULL,
    email TEXT NOT NULL UNIQUE,
    department TEXT NOT NULL,
    designation TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE', 'ON_LEAVE', 'TERMINATED')),
    created_at TEXT NOT NULL DEFAULT (DATETIME('now')),
    updated_at TEXT NOT NULL DEFAULT (DATETIME('now'))
);

-- 3. ASSETS TABLE
-- Hardware assets across procurement, assignment, maintenance, and retirement
CREATE TABLE IF NOT EXISTS assets (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    asset_tag TEXT NOT NULL UNIQUE,
    serial_number TEXT UNIQUE,
    name TEXT NOT NULL,
    category TEXT NOT NULL CHECK (category IN ('LAPTOP', 'DESKTOP', 'MONITOR', 'PRINTER', 'NETWORKING', 'MOBILE', 'OTHER')),
    manufacturer TEXT NOT NULL,
    model TEXT NOT NULL,
    purchase_date TEXT NOT NULL,
    purchase_cost REAL NOT NULL DEFAULT 0.00 CHECK (purchase_cost >= 0),
    warranty_expiry TEXT NULL,
    status TEXT NOT NULL DEFAULT 'AVAILABLE' CHECK (status IN ('AVAILABLE', 'ASSIGNED', 'UNDER_MAINTENANCE', 'RETIRED')),
    current_employee_id INTEGER NULL,
    notes TEXT NULL,
    bill_image_url TEXT NULL,
    bill_image_name TEXT NULL,
    created_at TEXT NOT NULL DEFAULT (DATETIME('now')),
    updated_at TEXT NOT NULL DEFAULT (DATETIME('now')),
    FOREIGN KEY (current_employee_id) REFERENCES employees(id) ON DELETE RESTRICT,
    CHECK (
        (status = 'ASSIGNED' AND current_employee_id IS NOT NULL) OR
        (status != 'ASSIGNED' AND current_employee_id IS NULL)
    )
);

-- 3a. Bill upload metadata (file bytes stay in S3; metadata stays in the database)
CREATE TABLE IF NOT EXISTS bill_uploads (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    object_key TEXT NOT NULL UNIQUE,
    original_filename TEXT NOT NULL,
    mime_type TEXT NOT NULL,
    size_bytes INTEGER NOT NULL CHECK (size_bytes > 0),
    storage_provider TEXT NOT NULL DEFAULT 's3',
    uploaded_at TEXT NOT NULL DEFAULT (DATETIME('now'))
);

-- 4. ASSET ASSIGNMENT HISTORY TABLE
-- Immutable audit log recording all custody changes, repairs, and returns
CREATE TABLE IF NOT EXISTS asset_assignment_history (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    asset_id INTEGER NOT NULL,
    employee_id INTEGER NULL,
    action TEXT NOT NULL CHECK (action IN ('ASSIGNED', 'RETURNED', 'SENT_TO_MAINTENANCE', 'RETURNED_FROM_MAINTENANCE', 'RETIRED')),
    action_date TEXT NOT NULL DEFAULT (DATETIME('now')),
    performed_by_admin_id INTEGER NULL,
    notes TEXT NULL,
    FOREIGN KEY (asset_id) REFERENCES assets(id) ON DELETE RESTRICT,
    FOREIGN KEY (employee_id) REFERENCES employees(id) ON DELETE RESTRICT,
    FOREIGN KEY (performed_by_admin_id) REFERENCES administrators(id) ON DELETE SET NULL
);

-- 5. SOFTWARE LICENSES TABLE
-- Software products, subscriptions, seat caps, and compliance metadata
CREATE TABLE IF NOT EXISTS software_licenses (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    license_code TEXT NOT NULL UNIQUE,
    software_name TEXT NOT NULL,
    vendor TEXT NOT NULL,
    license_type TEXT NOT NULL CHECK (license_type IN ('PERPETUAL', 'ANNUAL_SUBSCRIPTION', 'MONTHLY_SUBSCRIPTION', 'VOLUME_SEAT', 'OEM')),
    total_quantity INTEGER NOT NULL CHECK (total_quantity > 0),
    used_quantity INTEGER NOT NULL DEFAULT 0 CHECK (used_quantity >= 0 AND used_quantity <= total_quantity),
    purchase_date TEXT NOT NULL,
    expiry_date TEXT NULL,
    purchase_cost REAL NOT NULL DEFAULT 0.00 CHECK (purchase_cost >= 0),
    renewal_status TEXT NOT NULL DEFAULT 'ACTIVE' CHECK (renewal_status IN ('ACTIVE', 'EXPIRING_SOON', 'EXPIRED', 'CANCELLED')),
    notes TEXT NULL,
    created_at TEXT NOT NULL DEFAULT (DATETIME('now')),
    updated_at TEXT NOT NULL DEFAULT (DATETIME('now'))
);

-- 6. LICENSE ALLOCATIONS TABLE
-- Tracks individual seat allocations to specific employees or hardware assets
CREATE TABLE IF NOT EXISTS license_allocations (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    license_id INTEGER NOT NULL,
    employee_id INTEGER NULL,
    asset_id INTEGER NULL,
    allocated_at TEXT NOT NULL DEFAULT (DATETIME('now')),
    revoked_at TEXT NULL,
    notes TEXT NULL,
    FOREIGN KEY (license_id) REFERENCES software_licenses(id) ON DELETE RESTRICT,
    FOREIGN KEY (employee_id) REFERENCES employees(id) ON DELETE RESTRICT,
    FOREIGN KEY (asset_id) REFERENCES assets(id) ON DELETE RESTRICT,
    CHECK (employee_id IS NOT NULL OR asset_id IS NOT NULL)
);

-- 7. AUDIT LOGS TABLE
-- Append-only system activity log for administrative tracking and security compliance
CREATE TABLE IF NOT EXISTS audit_logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    admin_id INTEGER NULL,
    action TEXT NOT NULL,
    entity_type TEXT NOT NULL CHECK (entity_type IN ('AUTH', 'ASSET', 'EMPLOYEE', 'LICENSE', 'SYSTEM')),
    entity_id INTEGER NULL,
    details TEXT NULL,
    timestamp TEXT NOT NULL DEFAULT (DATETIME('now')),
    FOREIGN KEY (admin_id) REFERENCES administrators(id) ON DELETE SET NULL
);

-- 8. SESSIONS TABLE
-- Server-managed session store for active administrator authentication sessions
CREATE TABLE IF NOT EXISTS sessions (
    id TEXT PRIMARY KEY,
    admin_id INTEGER NOT NULL,
    expires_at TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT (DATETIME('now')),
    ip_address TEXT NULL,
    user_agent TEXT NULL,
    FOREIGN KEY (admin_id) REFERENCES administrators(id) ON DELETE CASCADE
);

-- ==============================================================================
-- INDEXES FOR HIGH-FREQUENCY QUERY OPTIMIZATION
-- ==============================================================================

CREATE INDEX IF NOT EXISTS idx_employees_code ON employees(employee_code);
CREATE INDEX IF NOT EXISTS idx_employees_email ON employees(email);
CREATE INDEX IF NOT EXISTS idx_assets_tag ON assets(asset_tag);
CREATE INDEX IF NOT EXISTS idx_assets_status ON assets(status);
CREATE INDEX IF NOT EXISTS idx_assets_current_emp ON assets(current_employee_id);
CREATE INDEX IF NOT EXISTS idx_assignment_history_asset ON asset_assignment_history(asset_id);
CREATE INDEX IF NOT EXISTS idx_assignment_history_employee ON asset_assignment_history(employee_id);
CREATE INDEX IF NOT EXISTS idx_licenses_code ON software_licenses(license_code);
CREATE INDEX IF NOT EXISTS idx_allocations_license ON license_allocations(license_id);
CREATE INDEX IF NOT EXISTS idx_allocations_employee ON license_allocations(employee_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_timestamp ON audit_logs(timestamp);
CREATE INDEX IF NOT EXISTS idx_sessions_admin ON sessions(admin_id);
CREATE INDEX IF NOT EXISTS idx_sessions_expires ON sessions(expires_at);

