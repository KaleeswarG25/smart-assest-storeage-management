const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const request = require('supertest');
const app = require('../src/app');
const { getCookieOptions } = require('../src/controllers/auth.controller');

test('Google Cloud Deployment Configuration & Security Tests', async (t) => {
  await t.test('1. Dockerfile exists and includes Cloud Run production best practices', () => {
    const dockerfilePath = path.resolve(__dirname, '../Dockerfile');
    assert.ok(fs.existsSync(dockerfilePath), 'Dockerfile must exist in backend');

    const content = fs.readFileSync(dockerfilePath, 'utf8');
    assert.ok(content.includes('FROM node:20-alpine'), 'Must use lightweight alpine base image');
    assert.ok(content.includes('USER node'), 'Must run as unprivileged node user');
    assert.ok(content.includes('HEALTHCHECK'), 'Must include container healthcheck');
    assert.ok(content.includes('npm ci --only=production'), 'Must exclude dev dependencies from runtime');
    assert.ok(content.includes('EXPOSE 5000'), 'Must expose port');
  });

  await t.test('2. .dockerignore exists and excludes secrets, SQLite DB, and tests', () => {
    const dockerignorePath = path.resolve(__dirname, '../.dockerignore');
    assert.ok(fs.existsSync(dockerignorePath), '.dockerignore must exist in backend');

    const content = fs.readFileSync(dockerignorePath, 'utf8');
    assert.ok(content.includes('node_modules'));
    assert.ok(content.includes('.env'));
    assert.ok(content.includes('data/*.db*'));
    assert.ok(content.includes('tests'));
  });

  await t.test('3. Cookie configuration supports cross-site SameSite=None and Secure for Vercel', () => {
    const origEnv = process.env.NODE_ENV;
    const origSameSite = process.env.COOKIE_SAMESITE;
    try {
      process.env.NODE_ENV = 'production';
      process.env.COOKIE_SAMESITE = 'none';
      const prodOpts = getCookieOptions();
      assert.strictEqual(prodOpts.secure, true, 'Must require secure cookies in production');
      assert.strictEqual(prodOpts.sameSite, 'none', 'Must use SameSite=None when configured for cross-site Vercel to Cloud Run');
      assert.strictEqual(prodOpts.httpOnly, true, 'Must be HttpOnly');

      process.env.NODE_ENV = 'development';
      delete process.env.COOKIE_SAMESITE;
      const devOpts = getCookieOptions();
      assert.strictEqual(devOpts.secure, false, 'Secure is false in development for localhost HTTP');
      assert.strictEqual(devOpts.sameSite, 'lax');
    } finally {
      process.env.NODE_ENV = origEnv;
      process.env.COOKIE_SAMESITE = origSameSite;
    }
  });

  await t.test('4. GET /api/health responds with 200 OK and database health status', async () => {
    const res = await request(app).get('/api/health');
    assert.strictEqual(res.statusCode, 200);
    assert.strictEqual(res.body.healthy, true);
    assert.strictEqual(res.body.status, 'UP');
    assert.strictEqual(res.body.database.status, 'CONNECTED');
    assert.ok(res.body.database.tablesFound >= 8, 'Must verify all 8 required tables exist');
  });

  await t.test('5. Vercel vercel.json configuration exists with SPA rewrites', () => {
    const vercelConfig = path.resolve(__dirname, '../../frontend/vercel.json');
    assert.ok(fs.existsSync(vercelConfig), 'frontend/vercel.json must exist');

    const content = JSON.parse(fs.readFileSync(vercelConfig, 'utf8'));
    assert.strictEqual(content.outputDirectory, 'dist');
    assert.ok(content.rewrites.some(r => r.destination === '/index.html'));
  });
});
