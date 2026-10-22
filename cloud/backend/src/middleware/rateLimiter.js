const rateLimit = require('express-rate-limit');

/**
 * Strict rate limiting for the login endpoint to prevent brute-force attacks.
 */
const loginRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes window
  max: 5, // 5 attempts per window
  standardHeaders: true,
  legacyHeaders: false,
  skip: () => process.env.NODE_ENV === 'test',
  message: {
    success: false,
    error: 'Too many authentication attempts from this IP address. Please try again after 15 minutes.'
  }
});

module.exports = {
  loginRateLimiter
};
