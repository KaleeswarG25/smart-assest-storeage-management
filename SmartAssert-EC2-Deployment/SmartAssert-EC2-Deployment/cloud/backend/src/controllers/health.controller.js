const healthService = require('../services/health.service');

/**
 * Controller handling health probe requests.
 * Returns 200 OK when healthy, 503 Service Unavailable when degraded.
 */
async function getHealth(req, res, next) {
  try {
    const health = await healthService.getSystemHealth();
    const statusCode = health.healthy ? 200 : 503;
    return res.status(statusCode).json(health);
  } catch (err) {
    next(err);
  }
}

module.exports = {
  getHealth
};
