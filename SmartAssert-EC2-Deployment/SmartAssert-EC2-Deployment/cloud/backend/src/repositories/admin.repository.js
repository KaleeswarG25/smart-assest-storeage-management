const db = require('../config/database');

class AdminRepository {
  /**
   * Finds an administrator by username or official email address.
   * Case-insensitive comparison.
   */
  async findByUsernameOrEmail(identifier) {
    if (!identifier) return null;
    const normalized = identifier.trim().toLowerCase();
    return await db.get(
      `SELECT id, username, email, password_hash, full_name, role, created_at, last_login
       FROM administrators
       WHERE LOWER(username) = ? OR LOWER(email) = ?`,
      [normalized, normalized]
    );
  }

  /**
   * Finds an administrator by ID, returning public fields only.
   */
  async findById(id) {
    return await db.get(
      `SELECT id, username, email, full_name, role, created_at, last_login
       FROM administrators
       WHERE id = ?`,
      [id]
    );
  }

  /**
   * Updates the last_login timestamp upon successful authentication.
   */
  async updateLastLogin(id) {
    return await db.run(
      "UPDATE administrators SET last_login = DATETIME('now') WHERE id = ?",
      [id]
    );
  }

  /**
   * Creates a new administrator record.
   */
  async create({ username, email, passwordHash, fullName, role = 'SUPERADMIN' }) {
    return await db.run(
      `INSERT INTO administrators (username, email, password_hash, full_name, role)
       VALUES (?, ?, ?, ?, ?)`,
      [username.trim(), email.trim().toLowerCase(), passwordHash, fullName.trim(), role]
    );
  }
}

module.exports = new AdminRepository();
