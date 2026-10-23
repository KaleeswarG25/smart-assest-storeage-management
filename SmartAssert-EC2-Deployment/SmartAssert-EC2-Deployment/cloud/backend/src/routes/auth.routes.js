const express = require('express');
const router = express.Router();
const authController = require('../controllers/auth.controller');
const { authenticate } = require('../middleware/authMiddleware');
const { loginRateLimiter } = require('../middleware/rateLimiter');

// Public endpoints
router.post('/login', loginRateLimiter, authController.login);

// Protected endpoints
router.post('/logout', authenticate, authController.logout);
router.get('/me', authenticate, authController.getCurrentUser);

// Verification route to test protected middleware
router.get('/verify', authenticate, (req, res) => {
  res.status(200).json({
    success: true,
    message: 'Access granted to protected administrative resource.',
    admin: req.admin
  });
});

module.exports = router;
