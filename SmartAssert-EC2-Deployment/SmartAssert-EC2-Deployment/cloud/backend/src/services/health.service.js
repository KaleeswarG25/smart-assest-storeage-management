const healthRepository = require('../repositories/health.repository');
const db = require('../config/database');

class HealthService {
  /**
   * Evaluates overall system health including database status and runtime metrics.
   */
  async getSystemHealth() {
    const dbHealth = await healthRepository.checkDatabaseHealth();
    const isHealthy = dbHealth.alive;
    const engine = db.getEngine();

    return {
      status: isHealthy ? 'UP' : 'DOWN',
      healthy: isHealthy,
      timestamp: new Date().toISOString(),
      environment: process.env.NODE_ENV || 'development',
      uptimeSeconds: Math.floor(process.uptime()),
      database: {
        status: dbHealth.alive ? 'CONNECTED' : 'DISCONNECTED',
        engine: engine === 'postgres' ? 'Google Cloud SQL (PostgreSQL)' : 'SQLite 3',
        tablesFound: dbHealth.tableCount,
        ...(dbHealth.error ? { error: dbHealth.error } : {})
      }
    };
  }
}

module.exports = new HealthService();
