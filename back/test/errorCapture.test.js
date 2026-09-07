const test = require('node:test');
const assert = require('node:assert/strict');
const { shouldCaptureResponse } = require('../src/middleware/errorCapture');

test('expected client and permission responses are not stored as server errors', () => {
  const req = { originalUrl: '/api/homework/student/1' };
  assert.equal(shouldCaptureResponse(req, { statusCode: 400 }, { capturedErrors: 0 }), false);
  assert.equal(shouldCaptureResponse(req, { statusCode: 403 }, { capturedErrors: 0 }), false);
  assert.equal(shouldCaptureResponse(req, { statusCode: 404 }, { capturedErrors: 0 }), false);
});

test('server responses are stored once', () => {
  const req = { originalUrl: '/api/homework' };
  assert.equal(shouldCaptureResponse(req, { statusCode: 500 }, { capturedErrors: 0 }), true);
  assert.equal(shouldCaptureResponse(req, { statusCode: 503 }, { capturedErrors: 1 }), false);
});
