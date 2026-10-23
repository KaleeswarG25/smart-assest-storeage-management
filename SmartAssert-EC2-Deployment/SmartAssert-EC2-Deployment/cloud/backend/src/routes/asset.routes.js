const express = require('express');
const router = express.Router();
const assetController = require('../controllers/asset.controller');
const { authenticate } = require('../middleware/authMiddleware');

// All hardware asset and bill endpoints require active administrator authentication
router.use(authenticate);

// Bill upload and authorized image retrieval operations (GCS & local adapter)
router.post('/upload-bill', assetController.uploadBill);
router.get('/bills/:fileName/signed-url', assetController.getBillImageSignedUrl);
router.get('/bills/:fileName', assetController.getBillImage);

// Lifecycle operations
router.get('/:id/history', assetController.getAssetHistory);
router.post('/:id/assign', assetController.assignAsset);
router.post('/:id/return', assetController.returnAsset);

// Standard Asset Inventory CRUD
router.get('/', assetController.getAllAssets);
router.get('/:id', assetController.getAssetById);
router.post('/', assetController.createAsset);
router.put('/:id', assetController.updateAsset);
router.delete('/:id', assetController.deleteAsset);

module.exports = router;
