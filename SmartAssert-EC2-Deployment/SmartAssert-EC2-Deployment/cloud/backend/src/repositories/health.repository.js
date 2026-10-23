const db = require('../config/database');

class HealthRepository {
  /**
   * Pings the active database connection to verify responsiveness.
   * Returns { alive: boolean, tableCount: number, error: string | null }
   */
  async checkDatabaseHealth() {
    try {
      const pingResult = await db.get('SELECT 1 AS alive');
      const isAlive = Boolean(pingResult && (pingResult.alive === 1 || pingResult.alive === '1'));
      if (!isAlive) {
        return { alive: false, tableCount: 0, error: 'Database ping returned unexpected value' };
      }

      // Fetch count of application tables based on engine
      const engine = db.getEngine();
      let tableCount = 0;

      if (engine === 'postgres') {
        const row = await db.get(
          "SELECT count(*)::int as count FROM information_schema.tables WHERE table_schema = 'public';"
        );
        tableCount = row ? parseInt(row.count, 10) : 0;
      } else {
        const tables = await db.query(
          "SELECT count(*) as count FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%';"
        );
        tableCount = tables[0] ? parseInt(tables[0].count, 10) : 0;
      }

      return {
        alive: true,
        tableCount,
        error: null
      };
    } catch (err) {
      return {
        alive: false,
        tableCount: 0,
        error: err.message
      };
    }
  }
}

module.exports = new HealthRepository();
