const express = require('express');
const router = express.Router();
const healthController = require('../controllers/health.controller');

// GET /api/health - Diagnostic and liveness probe
router.get('/', healthController.getHealth);

module.exports = router;
