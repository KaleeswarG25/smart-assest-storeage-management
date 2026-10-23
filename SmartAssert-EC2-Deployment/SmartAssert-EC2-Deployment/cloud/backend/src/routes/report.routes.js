const express = require('express');
const router = express.Router();
const reportController = require('../controllers/report.controller');
const { authenticate } = require('../middleware/authMiddleware');

// All report endpoints require active administrator authentication
router.use(authenticate);

// List available report types
router.get('/', (req, res, next) => reportController.listReportTypes(req, res, next));

// JSON report data
router.get('/:type', (req, res, next) => reportController.getReport(req, res, next));

// CSV download
router.get('/:type/csv', (req, res, next) => reportController.downloadCsv(req, res, next));

module.exports = router;
