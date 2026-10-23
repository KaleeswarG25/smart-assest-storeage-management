const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const adminRepository = require('../repositories/admin.repository');
const sessionRepository = require('../repositories/session.repository');
const auditRepository = require('../repositories/audit.repository');

// Standard dummy hash used to neutralize timing side-channels when user does not exist
const DUMMY_HASH = '$2b$10$wK1GvXf5yN6uQ8k0jZ7m9.eD1rP2sT3uV4wX5yZ6aB7cD8eF9gH0i';

// Default session lifespan: 8 hours
const SESSION_TTL_HOURS = 8;

class AuthenticationError extends Error {
  constructor(message = 'Invalid username/email or password') {
    super(message);
    this.name = 'AuthenticationError';
    this.statusCode = 401;
  }
}

class ValidationError extends Error {
  constructor(message) {
    super(message);
    this.name = 'ValidationError';
    this.statusCode = 400;
  }
}

class AuthService {
  /**
   * Authenticates an administrator using username/email and password.
   * Returns session token and sanitized administrator profile.
   */
  async login({ identifier, password, ipAddress = null, userAgent = null }) {
    if (!identifier || typeof identifier !== 'string' || !identifier.trim()) {
      throw new ValidationError('Username or email is required.');
    }
    if (!password || typeof password !== 'string' || !password.trim()) {
      throw new ValidationError('Password is required.');
    }

    const cleanIdentifier = identifier.trim().toLowerCase();
    const admin = await adminRepository.findByUsernameOrEmail(cleanIdentifier);

    // Timing attack defense: always execute bcrypt compare
    const hashToCompare = admin ? admin.password_hash : DUMMY_HASH;
    const isPasswordValid = await bcrypt.compare(password, hashToCompare);

    if (!admin || !isPasswordValid) {
      // Record failed authentication audit log without logging password
      await auditRepository.log({
        adminId: admin ? admin.id : null,
        action: 'LOGIN_FAILED',
        entityType: 'AUTH',
        entityId: admin ? admin.id : null,
        details: { identifier: cleanIdentifier, ipAddress, reason: 'INVALID_CREDENTIALS' }
      });

      // Generic authentication error prevents account enumeration
      throw new AuthenticationError('Invalid username/email or password.');
    }

    // Generate secure 256-bit cryptographically random session token
    const sessionToken = crypto.randomBytes(32).toString('hex');
    const expiresAtDate = new Date(Date.now() + SESSION_TTL_HOURS * 3600 * 1000);
    // Format as ISO string compatible with SQLite DATETIME
    const expiresAt = expiresAtDate.toISOString().replace('T', ' ').slice(0, 19);

    // Persist session record
    await sessionRepository.createSession({
      id: sessionToken,
      adminId: admin.id,
      expiresAt,
      ipAddress,
      userAgent
    });

    // Update administrator last_login
    await adminRepository.updateLastLogin(admin.id);

    // Record successful login audit log
    await auditRepository.log({
      adminId: admin.id,
      action: 'LOGIN_SUCCESS',
      entityType: 'AUTH',
      entityId: admin.id,
      details: { username: admin.username, ipAddress }
    });

    return {
      sessionToken,
      expiresAt,
      administrator: {
        id: admin.id,
        username: admin.username,
        email: admin.email,
        fullName: admin.full_name,
        full_name: admin.full_name,
        role: admin.role,
        lastLogin: admin.last_login
      }
    };
  }

  /**
   * Invalidates an active administrator session (logout).
   */
  async logout({ sessionToken, adminId = null, ipAddress = null }) {
    if (sessionToken) {
      await sessionRepository.deleteSession(sessionToken);
    }

    if (adminId) {
      await auditRepository.log({
        adminId,
        action: 'LOGOUT',
        entityType: 'AUTH',
        entityId: adminId,
        details: { ipAddress }
      });
    }

    return { success: true, message: 'Logged out successfully.' };
  }

  /**
   * Retrieves sanitized profile for an active session.
   */
  async getProfile(sessionToken) {
    if (!sessionToken) {
      throw new AuthenticationError('Authentication required. No session token provided.');
    }

    const sessionData = await sessionRepository.findValidSession(sessionToken);
    if (!sessionData) {
      throw new AuthenticationError('Session expired or invalid. Please log in again.');
    }

    return {
      id: sessionData.admin_id,
      username: sessionData.username,
      email: sessionData.email,
      fullName: sessionData.full_name,
      full_name: sessionData.full_name,
      role: sessionData.role,
      sessionExpiresAt: sessionData.expires_at
    };
  }
}

module.exports = {
  AuthService: new AuthService(),
  AuthenticationError,
  ValidationError
};
