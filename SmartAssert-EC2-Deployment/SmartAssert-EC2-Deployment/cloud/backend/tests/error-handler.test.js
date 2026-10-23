const test = require('node:test');
const assert = require('node:assert/strict');
const { globalErrorHandler } = require('../src/middleware/errorHandler');

function invokeErrorHandler(error, environment) {
  const previousEnvironment = process.env.NODE_ENV;
  const originalConsoleError = console.error;
  let statusCode;
  let body;

  process.env.NODE_ENV = environment;
  console.error = () => {};

  try {
    globalErrorHandler(
      error,
      { method: 'GET', originalUrl: '/api/test' },
      {
        status(code) {
          statusCode = code;
          return this;
        },
        json(value) {
          body = value;
          return this;
        }
      },
      () => {}
    );
  } finally {
    console.error = originalConsoleError;
    if (previousEnvironment === undefined) {
      delete process.env.NODE_ENV;
    } else {
      process.env.NODE_ENV = previousEnvironment;
    }
  }

  return { statusCode, body };
}

test('production responses do not expose internal server error details', () => {
  const result = invokeErrorHandler(
    new Error('SQLITE_CANTOPEN: private database path'),
    'production'
  );

  assert.equal(result.statusCode, 500);
  assert.deepEqual(result.body, {
    success: false,
    error: 'Internal Server Error'
  });
});

test('production responses retain safe client error messages', () => {
  const validationError = new Error('Name is required.');
  validationError.statusCode = 400;

  const result = invokeErrorHandler(validationError, 'production');

  assert.equal(result.statusCode, 400);
  assert.deepEqual(result.body, {
    success: false,
    error: 'Name is required.'
  });
});
