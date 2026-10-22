const path = require('path');
const fs = require('fs');
const sqlite3 = require('sqlite3').verbose();
const { Pool } = require('pg');
require('dotenv').config();

let sqliteInstance = null;
let currentDbPath = null;
let pgPool = null;

/**
 * Determines whether to use PostgreSQL or SQLite.
 * Uses PostgreSQL if DB_ENGINE is explicitly 'postgres' or 'postgresql',
 * or if DB_HOST / INSTANCE_CONNECTION_NAME is configured.
 */
function getEngine() {
  const engine = (process.env.DB_ENGINE || '').toLowerCase().trim();
  if (engine === 'postgres' || engine === 'postgresql') return 'postgres';
  if (engine === 'sqlite') return 'sqlite';
  if (process.env.INSTANCE_CONNECTION_NAME || process.env.DB_HOST) {
    return 'postgres';
  }
  return 'sqlite';
}

/**
 * Resolves the absolute database file path for SQLite.
 */
function resolveDbPath(customPath = null) {
  if (customPath) return customPath;
  const envPath = process.env.DB_PATH;
  if (!envPath) {
    return path.resolve(__dirname, '../../../data/asset_management.db');
  }
  if (path.isAbsolute(envPath)) {
    return envPath;
  }
  return path.resolve(process.cwd(), envPath);
}

/**
 * Converts SQLite-style positional `?` parameter placeholders into
 * PostgreSQL numbered placeholders ($1, $2, ...), while safely ignoring
 * literal question marks inside single or double-quoted strings.
 */
function convertPlaceholders(sql) {
  let inSingleQuote = false;
  let inDoubleQuote = false;
  let paramIndex = 1;
  let result = '';

  for (let i = 0; i < sql.length; i++) {
    const char = sql[i];
    if (char === "'" && (i === 0 || sql[i - 1] !== '\\')) {
      inSingleQuote = !inSingleQuote;
      result += char;
    } else if (char === '"' && (i === 0 || sql[i - 1] !== '\\')) {
      inDoubleQuote = !inDoubleQuote;
      result += char;
    } else if (char === '?' && !inSingleQuote && !inDoubleQuote) {
      result += `$${paramIndex++}`;
    } else {
      result += char;
    }
  }

  // Replace SQLite DATETIME('now') with ANSI standard CURRENT_TIMESTAMP for PostgreSQL
  let converted = result.replace(/DATETIME\('now'\)/gi, 'CURRENT_TIMESTAMP');

  // Replace SQLite INSERT OR IGNORE INTO with PostgreSQL ON CONFLICT DO NOTHING
  if (/^\s*INSERT\s+OR\s+IGNORE\s+INTO/i.test(converted)) {
    converted = converted.replace(/^\s*INSERT\s+OR\s+IGNORE\s+INTO/i, 'INSERT INTO');
    if (!/ON\s+CONFLICT/i.test(converted)) {
      converted += ' ON CONFLICT DO NOTHING';
    }
  }

  return converted;
}

/**
 * Returns or initializes the PostgreSQL connection pool.
 * Configured with Cloud Run friendly bounded limits, timeouts, and Cloud SQL Unix socket support.
 */
function getPgPool() {
  if (pgPool) return pgPool;

  const poolMax = parseInt(process.env.DB_POOL_MAX || '5', 10);
  const idleTimeoutMillis = parseInt(process.env.DB_IDLE_TIMEOUT_MS || '30000', 10);
  const connectionTimeoutMillis = parseInt(process.env.DB_CONNECTION_TIMEOUT_MS || '5000', 10);

  const poolConfig = {
    max: Math.max(1, Math.min(50, poolMax)),
    idleTimeoutMillis,
    connectionTimeoutMillis
  };

  // Optional PostgreSQL Unix socket path:
  // e.g. /cloudsql/PROJECT_ID:REGION:INSTANCE_NAME
  const instanceConnectionName = process.env.INSTANCE_CONNECTION_NAME;
  if (instanceConnectionName) {
    poolConfig.host = `/cloudsql/${instanceConnectionName}`;
  } else if (process.env.DB_HOST) {
    poolConfig.host = process.env.DB_HOST;
  } else {
    poolConfig.host = 'localhost';
  }

  if (process.env.DB_PORT) {
    poolConfig.port = parseInt(process.env.DB_PORT, 10);
  } else if (!instanceConnectionName) {
    poolConfig.port = 5432;
  }

  poolConfig.database = process.env.DB_NAME || 'asset_management';
  poolConfig.user = process.env.DB_USER || 'postgres';
  poolConfig.password = process.env.DB_PASSWORD || '';

  // Optional SSL configuration for external connections
  if (process.env.DB_SSL === 'true') {
    poolConfig.ssl = { rejectUnauthorized: false };
  }

  pgPool = new Pool(poolConfig);

  pgPool.on('error', (err) => {
    console.error('[Database:PostgreSQL] Unexpected error on idle client:', err.message);
  });

  return pgPool;
}

/**
 * Initializes and returns the active SQLite database connection.
 * Guarantees foreign key enforcement and WAL journal mode.
 */
function getSqliteDb(customPath = null) {
  const targetPath = resolveDbPath(customPath);

  if (sqliteInstance && currentDbPath === targetPath) {
    return sqliteInstance;
  }

  if (sqliteInstance) {
    try {
      sqliteInstance.close();
    } catch {
      // ignore
    }
    sqliteInstance = null;
  }

  if (targetPath !== ':memory:') {
    const parentDir = path.dirname(targetPath);
    if (!fs.existsSync(parentDir)) {
      fs.mkdirSync(parentDir, { recursive: true });
    }
  }

  currentDbPath = targetPath;
  sqliteInstance = new sqlite3.Database(targetPath, (err) => {
    if (err) {
      console.error(`[Database:SQLite] Failed to open database at ${targetPath}:`, err.message);
    }
  });

  sqliteInstance.serialize(() => {
    sqliteInstance.run('PRAGMA foreign_keys = ON;', (err) => {
      if (err) {
        console.error('[Database:SQLite] Failed to enable PRAGMA foreign_keys:', err.message);
      }
    });
    if (targetPath !== ':memory:') {
      sqliteInstance.run('PRAGMA journal_mode = WAL;');
    }
  });

  return sqliteInstance;
}

/**
 * Universal database access handle.
 */
function getDb(customPath = null) {
  const engine = getEngine();
  if (engine === 'postgres') {
    return getPgPool();
  }
  return getSqliteDb(customPath);
}

/**
 * Executes a parameterized SQL query returning all matching rows.
 */
async function query(sql, params = []) {
  const engine = getEngine();
  if (engine === 'postgres') {
    const pgSql = convertPlaceholders(sql);
    const pool = getPgPool();
    const res = await pool.query(pgSql, params);
    return res.rows;
  }

  return new Promise((resolve, reject) => {
    getSqliteDb().all(sql, params, (err, rows) => {
      if (err) return reject(err);
      resolve(rows);
    });
  });
}

/**
 * Executes a parameterized SQL query returning a single row.
 */
async function get(sql, params = []) {
  const engine = getEngine();
  if (engine === 'postgres') {
    const pgSql = convertPlaceholders(sql);
    const pool = getPgPool();
    const res = await pool.query(pgSql, params);
    return res.rows[0];
  }

  return new Promise((resolve, reject) => {
    getSqliteDb().get(sql, params, (err, row) => {
      if (err) return reject(err);
      resolve(row);
    });
  });
}

/**
 * Executes a parameterized INSERT, UPDATE, or DELETE SQL statement.
 * Resolves with { lastID, changes }.
 */
async function run(sql, params = []) {
  const engine = getEngine();
  if (engine === 'postgres') {
    let pgSql = convertPlaceholders(sql);
    const isInsert = /^\s*INSERT\s+INTO/i.test(pgSql);
    const hasReturning = /RETURNING\s+/i.test(pgSql);

    // If INSERT without RETURNING clause, automatically append RETURNING id
    if (isInsert && !hasReturning) {
      pgSql += ' RETURNING id';
    }

    const pool = getPgPool();
    const res = await pool.query(pgSql, params);
    const lastID = res.rows && res.rows[0] && res.rows[0].id !== undefined ? res.rows[0].id : null;
    return {
      lastID,
      changes: res.rowCount || 0
    };
  }

  return new Promise((resolve, reject) => {
    getSqliteDb().run(sql, params, function (err) {
      if (err) return reject(err);
      resolve({ lastID: this.lastID, changes: this.changes });
    });
  });
}

/**
 * Executes raw multi-statement SQL scripts (DDL schema scripts).
 */
async function exec(sql) {
  const engine = getEngine();
  if (engine === 'postgres') {
    const pool = getPgPool();
    await pool.query(sql);
    return;
  }

  return new Promise((resolve, reject) => {
    getSqliteDb().exec(sql, (err) => {
      if (err) return reject(err);
      resolve();
    });
  });
}

/**
 * Executes an asynchronous function within a database transaction.
 * Automatically performs COMMIT on success or ROLLBACK on failure.
 */
async function transaction(actionFn) {
  const engine = getEngine();
  if (engine === 'postgres') {
    const pool = getPgPool();
    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      const txQuery = async (sql, params = []) => {
        const pgSql = convertPlaceholders(sql);
        const res = await client.query(pgSql, params);
        return res.rows;
      };

      const txGet = async (sql, params = []) => {
        const pgSql = convertPlaceholders(sql);
        const res = await client.query(pgSql, params);
        return res.rows[0] || null;
      };

      const txRun = async (sql, params = []) => {
        let pgSql = convertPlaceholders(sql);
        const isInsert = /^\s*INSERT\s+INTO/i.test(pgSql);
        const hasReturning = /RETURNING\s+/i.test(pgSql);
        if (isInsert && !hasReturning) {
          pgSql += ' RETURNING id';
        }
        const res = await client.query(pgSql, params);
        const lastID = res.rows && res.rows[0] && res.rows[0].id !== undefined ? res.rows[0].id : null;
        return {
          lastID,
          changes: res.rowCount || 0
        };
      };

      const result = await actionFn({ query: txQuery, get: txGet, run: txRun });
      await client.query('COMMIT');
      return result;
    } catch (error) {
      try {
        await client.query('ROLLBACK');
      } catch {
        // rollback error suppressed
      }
      throw error;
    } finally {
      client.release();
    }
  }

  // SQLite transaction
  await run('BEGIN TRANSACTION');
  try {
    const result = await actionFn({ query, get, run });
    await run('COMMIT');
    return result;
  } catch (error) {
    try {
      await run('ROLLBACK');
    } catch {
      // rollback error suppressed
    }
    throw error;
  }
}

/**
 * Performs a live connectivity check.
 */
async function isAlive() {
  try {
    const row = await get('SELECT 1 AS alive');
    return Boolean(row && (row.alive === 1 || row.alive === '1'));
  } catch {
    return false;
  }
}

/**
 * Closes the active database connection or connection pool.
 */
async function close() {
  if (pgPool) {
    try {
      await pgPool.end();
    } catch {
      // ignore
    }
    pgPool = null;
  }

  return new Promise((resolve, reject) => {
    if (!sqliteInstance) return resolve();
    sqliteInstance.close((err) => {
      sqliteInstance = null;
      currentDbPath = null;
      if (err) return reject(err);
      resolve();
    });
  });
}

module.exports = {
  getDb,
  getEngine,
  query,
  get,
  run,
  exec,
  transaction,
  isAlive,
  close,
  resolveDbPath,
  convertPlaceholders
};
