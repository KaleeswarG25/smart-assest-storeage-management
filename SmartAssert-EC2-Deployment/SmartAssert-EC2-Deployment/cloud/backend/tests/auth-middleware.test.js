const test = require('node:test');
const assert = require('node:assert/strict');
const { authenticate } = require('../src/middleware/authMiddleware');
const { AuthService } = require('../src/services/auth.service');

function createResponse() {
  return {
    statusCode: null,
    body: null,
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(value) {
      this.body = value;
      return this;
    }
  };
}

test('production rejects cookie-authenticated writes without an origin or referer', async () => {
  const previousEnvironment = process.env.NODE_ENV;
  const previousOrigin = process.env.CORS_ORIGIN;
  const response = createResponse();
  let nextCalled = false;

  process.env.NODE_ENV = 'production';
  process.env.CORS_ORIGIN = 'https://app.example.test';

  try {
    await authenticate(
      {
        cookies: { session_id: 'opaque-session' },
        method: 'POST',
        headers: {}
      },
      response,
      () => {
        nextCalled = true;
      }
    );
  } finally {
    if (previousEnvironment === undefined) {
      delete process.env.NODE_ENV;
    } else {
      process.env.NODE_ENV = previousEnvironment;
    }
    if (previousOrigin === undefined) {
      delete process.env.CORS_ORIGIN;
    } else {
      process.env.CORS_ORIGIN = previousOrigin;
    }
  }

  assert.equal(response.statusCode, 403);
  assert.equal(response.body.success, false);
  assert.equal(nextCalled, false);
});

test('authentication middleware forwards unexpected profile lookup errors', async () => {
  const originalGetProfile = AuthService.getProfile;
  const lookupError = new Error('database unavailable');
  let forwardedError;

  AuthService.getProfile = async () => {
    throw lookupError;
  };

  try {
    await authenticate(
      {
        cookies: { session_id: 'opaque-session' },
        method: 'GET',
        headers: {}
      },
      createResponse(),
      (error) => {
        forwardedError = error;
      }
    );
  } finally {
    AuthService.getProfile = originalGetProfile;
  }

  assert.equal(forwardedError, lookupError);
});
