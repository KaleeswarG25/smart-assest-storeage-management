require('dotenv').config();
const readline = require('readline');
const bcrypt = require('bcryptjs');
const db = require('../config/database');

/**
 * Reads a line from console, optionally masking input for passwords.
 */
function askQuestion(rl, query, isPassword = false) {
  return new Promise((resolve) => {
    if (!isPassword) {
      rl.question(query, (answer) => resolve(answer.trim()));
    } else {
      process.stdout.write(query);
      const stdin = process.stdin;
      const oldRaw = stdin.isRaw;
      
      let password = '';
      const onData = (char) => {
        const str = char.toString('utf8');
        switch (str) {
          case '\n':
          case '\r':
          case '\u0004':
            stdin.setRawMode(oldRaw);
            stdin.removeListener('data', onData);
            process.stdout.write('\n');
            resolve(password.trim());
            break;
          case '\u0003': // Ctrl+C
            process.stdout.write('\n');
            process.exit(1);
            break;
          case '\u0008': // Backspace
          case '\x7f':
            if (password.length > 0) {
              password = password.slice(0, -1);
              process.stdout.write('\b \b');
            }
            break;
          default:
            password += str;
            process.stdout.write('*');
            break;
        }
      };

      if (process.stdin.isTTY) {
        stdin.setRawMode(true);
        stdin.resume();
        stdin.on('data', onData);
      } else {
        // Fallback for non-TTY environments
        rl.question('', (answer) => resolve(answer.trim()));
      }
    }
  });
}

/**
 * Validates password strength policy.
 */
function validatePassword(password) {
  if (!password || password.length < 8) {
    return 'Password must be at least 8 characters long.';
  }
  if (!/[0-9]/.test(password) && !/[^a-zA-Z0-9]/.test(password)) {
    return 'Password must include at least one number or special character.';
  }
  return null;
}

/**
 * Provisions or updates an administrator account safely.
 */
async function provisionAdmin() {
  db.getDb();

  const envUser = process.env.ADMIN_USERNAME;
  const envEmail = process.env.ADMIN_EMAIL;
  const envPass = process.env.ADMIN_PASSWORD || process.env.ADMIN_INITIAL_PASSWORD;
  const envName = process.env.ADMIN_NAME;

  let username = envUser;
  let email = envEmail;
  let password = envPass;
  let fullName = envName;

  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
  });

  try {
    if (!username) {
      username = await askQuestion(rl, 'Enter administrator username [admin]: ');
      if (!username) username = 'admin';
    }

    if (!email) {
      email = await askQuestion(rl, `Enter official email [${username}@enterprise.local]: `);
      if (!email) email = `${username}@enterprise.local`;
    }

    if (!fullName) {
      fullName = await askQuestion(rl, 'Enter administrator full name [IT Administrator]: ');
      if (!fullName) fullName = 'IT Administrator';
    }

    if (!password) {
      while (true) {
        password = await askQuestion(rl, 'Enter secure administrator password: ', true);
        const error = validatePassword(password);
        if (!error) break;
        console.error(`[Error] ${error}`);
      }
    } else {
      const error = validatePassword(password);
      if (error) {
        throw new Error(error);
      }
    }

    rl.close();

    console.log('[Provisioning] Hashing password with bcrypt (work factor 10)...');
    const saltRounds = 10;
    const passwordHash = await bcrypt.hash(password, saltRounds);

    // Check if administrator already exists
    const existing = await db.get(
      'SELECT id, username, email FROM administrators WHERE username = ? OR email = ?',
      [username, email]
    );

    let adminId;
    if (existing) {
      // Never overwrite an existing administrator password automatically
      if (process.env.ADMIN_OVERWRITE !== 'true') {
        if (process.stdin.isTTY && !envPass) {
          const confirm = await askQuestion(rl, `Administrator '${existing.username}' already exists. Overwrite password? (y/N): `);
          if (confirm.toLowerCase() !== 'y' && confirm.toLowerCase() !== 'yes') {
            console.log(`[Provisioning] Overwrite cancelled. Password for '${existing.username}' was preserved.`);
            return { id: existing.id, overwritten: false };
          }
        } else {
          console.log(`[Provisioning] Administrator '${existing.username}' already exists. Automatic overwrite prevented.`);
          return { id: existing.id, overwritten: false };
        }
      }
      console.log(`[Provisioning] Updating existing administrator '${existing.username}' (ID: ${existing.id})...`);
      await db.run(
        `UPDATE administrators
         SET password_hash = ?, full_name = ?, role = 'SUPERADMIN'
         WHERE id = ?`,
        [passwordHash, fullName, existing.id]
      );
      adminId = existing.id;
    } else {
      console.log(`[Provisioning] Creating new administrator '${username}'...`);
      const result = await db.run(
        `INSERT INTO administrators (username, email, password_hash, full_name, role)
         VALUES (?, ?, ?, ?, 'SUPERADMIN')`,
        [username, email, passwordHash, fullName]
      );
      adminId = result.lastID;
    }

    // Record administrative audit log
    await db.run(
      `INSERT INTO audit_logs (admin_id, action, entity_type, entity_id, details)
       VALUES (?, 'ADMIN_PROVISIONED', 'AUTH', ?, ?)`,
      [adminId, adminId, JSON.stringify({ username, email, action: existing ? 'PASSWORD_UPDATED' : 'ACCOUNT_CREATED' })]
    );

    console.log(`[Provisioning] Administrator '${username}' successfully provisioned (ID: ${adminId}).`);
    console.log('[Security] Passwords and credentials are never printed or logged.');
  } catch (err) {
    console.error('[Provisioning Failed]:', err.message);
    process.exit(1);
  } finally {
    rl.close();
    await db.close();
  }
}

if (require.main === module) {
  provisionAdmin().then(() => process.exit(0));
}

module.exports = { provisionAdmin, validatePassword };
