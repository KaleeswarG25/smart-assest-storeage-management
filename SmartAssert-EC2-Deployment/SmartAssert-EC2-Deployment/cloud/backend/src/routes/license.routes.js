const express = require('express');
const router = express.Router();
const licenseController = require('../controllers/license.controller');
const { authenticate } = require('../middleware/authMiddleware');

// All software license endpoints require active administrator authentication
router.use(authenticate);

// License Inventory CRUD
router.get('/', (req, res, next) => licenseController.getAllLicenses(req, res, next));
router.get('/:id', (req, res, next) => licenseController.getLicenseById(req, res, next));
router.post('/', (req, res, next) => licenseController.createLicense(req, res, next));
router.put('/:id', (req, res, next) => licenseController.updateLicense(req, res, next));
router.delete('/:id', (req, res, next) => licenseController.deleteLicense(req, res, next));

// License Allocation Lifecycle
router.get('/:id/allocations', (req, res, next) => licenseController.getAllocations(req, res, next));
router.post('/:id/allocations', (req, res, next) => licenseController.allocateSeat(req, res, next));
router.post('/:id/allocations/:allocationId/revoke', (req, res, next) => licenseController.revokeAllocation(req, res, next));

module.exports = router;
