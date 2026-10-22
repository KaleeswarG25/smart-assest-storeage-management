const express = require('express');
const router = express.Router();
const expiryController = require('../controllers/expiry.controller');
const { authenticate } = require('../middleware/authMiddleware');

// All expiry endpoints require active administrator authentication
router.use(authenticate);

// License expiry classification
router.get('/licenses', (req, res, next) => expiryController.getLicenseExpiry(req, res, next));

// Hardware asset warranty expiry classification
router.get('/warranties', (req, res, next) => expiryController.getWarrantyExpiry(req, res, next));

// Combined dashboard summary
router.get('/summary', (req, res, next) => expiryController.getDashboardSummary(req, res, next));

module.exports = router;
