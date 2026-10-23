const fs = require('fs');
const path = require('path');
const db = require('../config/database');

const REQUIRED_TABLES = [
  'administrators',
  'employees',
  'assets',
  'asset_assignment_history',
  'software_licenses',
  'license_allocations',
  'audit_logs',
  'sessions'
];

/**
 * Executes the appropriate DDL schema file (PostgreSQL or SQLite)
 * and verifies that all 8 required tables exist and are properly structured.
 */
async function migrate(customDbPath = null) {
  const engine = db.getEngine();

  if (engine === 'postgres') {
    const schemaPath = path.resolve(__dirname, 'schema.postgres.sql');
    if (!fs.existsSync(schemaPath)) {
      throw new Error(`PostgreSQL schema file not found at ${schemaPath}`);
    }

    const schemaSql = fs.readFileSync(schemaPath, 'utf8');
    await db.exec(schemaSql);

    // Verify all required tables exist in PostgreSQL public schema
    const rows = await db.query(
      "SELECT table_name FROM information_schema.tables WHERE table_schema = 'public';"
    );
    const tableNames = rows.map((r) => r.table_name);

    // Forward-only migration checks for PostgreSQL
    const allocCols = await db.query(
      "SELECT column_name FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'license_allocations';"
    );
    if (allocCols && allocCols.length > 0 && !allocCols.some((c) => c.column_name === 'revoked_at')) {
      await db.run('ALTER TABLE license_allocations ADD COLUMN IF NOT EXISTS revoked_at TIMESTAMP WITH TIME ZONE NULL;');
    }

    const assetCols = await db.query(
      "SELECT column_name FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'assets';"
    );
    if (assetCols && assetCols.length > 0) {
      if (!assetCols.some((c) => c.column_name === 'bill_image_url')) {
        await db.run('ALTER TABLE assets ADD COLUMN IF NOT EXISTS bill_image_url TEXT NULL;');
      }
      if (!assetCols.some((c) => c.column_name === 'bill_image_name')) {
        await db.run('ALTER TABLE assets ADD COLUMN IF NOT EXISTS bill_image_name VARCHAR(255) NULL;');
      }
    }

    const missingTables = REQUIRED_TABLES.filter((t) => !tableNames.includes(t));
    if (missingTables.length > 0) {
      throw new Error(`PostgreSQL migration verification failed. Missing tables: ${missingTables.join(', ')}`);
    }

    return {
      success: true,
      engine: 'postgres',
      tables: tableNames,
      target: process.env.INSTANCE_CONNECTION_NAME || process.env.DB_HOST || 'localhost:5432'
    };
  }

  // SQLite engine path
  if (customDbPath) {
    db.getDb(customDbPath);
  } else {
    db.getDb();
  }

  const schemaPath = path.resolve(__dirname, 'schema.sql');
  if (!fs.existsSync(schemaPath)) {
    throw new Error(`Schema file not found at ${schemaPath}`);
  }

  const schemaSql = fs.readFileSync(schemaPath, 'utf8');
  await db.exec(schemaSql);

  const existingTables = await db.query(
    "SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%';"
  );
  const tableNames = existingTables.map((t) => t.name);

  // Forward-only migration checks for SQLite
  const allocCols = await db.query("PRAGMA table_info(license_allocations);");
  if (allocCols && allocCols.length > 0 && !allocCols.some((c) => c.name === 'revoked_at')) {
    await db.run('ALTER TABLE license_allocations ADD COLUMN revoked_at TEXT NULL;');
  }

  const assetCols = await db.query("PRAGMA table_info(assets);");
  if (assetCols && assetCols.length > 0) {
    if (!assetCols.some((c) => c.name === 'bill_image_url')) {
      await db.run('ALTER TABLE assets ADD COLUMN bill_image_url TEXT NULL;');
    }
    if (!assetCols.some((c) => c.name === 'bill_image_name')) {
      await db.run('ALTER TABLE assets ADD COLUMN bill_image_name TEXT NULL;');
    }
  }

  const missingTables = REQUIRED_TABLES.filter((t) => !tableNames.includes(t));
  if (missingTables.length > 0) {
    throw new Error(`Migration verification failed. Missing tables: ${missingTables.join(', ')}`);
  }

  return {
    success: true,
    engine: 'sqlite',
    tables: tableNames,
    databasePath: db.resolveDbPath(customDbPath)
  };
}

// Enable direct CLI execution
if (require.main === module) {
  (async () => {
    try {
      console.log(`[Migration] Initializing database schema (${db.getEngine()})...`);
      const result = await migrate();
      console.log(`[Migration] Successfully verified ${result.tables.length} tables [Engine: ${result.engine}]`);
      console.log('[Migration] Tables:', result.tables.join(', '));
      process.exit(0);
    } catch (err) {
      console.error('[Migration] Failed:', err.message);
      process.exit(1);
    }
  })();
}

module.exports = { migrate, REQUIRED_TABLES };
