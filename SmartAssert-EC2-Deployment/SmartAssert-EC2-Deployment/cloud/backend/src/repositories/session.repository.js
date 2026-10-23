const db = require('../config/database');

class SessionRepository {
  /**
   * Persists a newly created server-managed session.
   */
  async createSession({ id, adminId, expiresAt, ipAddress = null, userAgent = null }) {
    return await db.run(
      `INSERT INTO sessions (id, admin_id, expires_at, ip_address, user_agent)
       VALUES (?, ?, ?, ?, ?)`,
      [id, adminId, expiresAt, ipAddress, userAgent]
    );
  }

  /**
   * Retrieves an active, unexpired session and joins the authenticated administrator.
   */
  async findValidSession(sessionId) {
    if (!sessionId) return null;
    return await db.get(
      `SELECT s.id as session_id, s.expires_at, s.created_at as session_created_at,
              a.id as admin_id, a.username, a.email, a.full_name, a.role
       FROM sessions s
       JOIN administrators a ON s.admin_id = a.id
       WHERE s.id = ? AND s.expires_at > DATETIME('now')`,
      [sessionId]
    );
  }

  /**
   * Deletes a session by its token ID (logout).
   */
  async deleteSession(sessionId) {
    if (!sessionId) return { changes: 0 };
    return await db.run('DELETE FROM sessions WHERE id = ?', [sessionId]);
  }

  /**
   * Deletes all expired sessions (housekeeping).
   */
  async deleteExpiredSessions() {
    return await db.run("DELETE FROM sessions WHERE expires_at <= DATETIME('now')");
  }

  /**
   * Deletes all sessions belonging to an administrator (force logout everywhere).
   */
  async deleteAllAdminSessions(adminId) {
    return await db.run('DELETE FROM sessions WHERE admin_id = ?', [adminId]);
  }
}

module.exports = new SessionRepository();
