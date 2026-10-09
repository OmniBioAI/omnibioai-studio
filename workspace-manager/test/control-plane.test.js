'use strict';

const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const test = require('node:test');
process.env.CONTROL_PLANE_SERVICE_SECRET = 'test-control-plane-secret';
process.env.CONTROL_PLANE_SERVICE_ID = 'workspace-manager';
const { authenticate, operations } = require('../control-plane');

function signed(raw, timestamp = Date.now(), nonce = crypto.randomBytes(16).toString('hex')) {
  return { 'x-service-id': 'workspace-manager', 'x-request-timestamp': String(timestamp), 'x-request-nonce': nonce, 'x-request-signature': crypto.createHmac('sha256', process.env.CONTROL_PLANE_SERVICE_SECRET).update(`${timestamp}.${nonce}.${raw}`).digest('hex') };
}

test('control plane requires the configured service identity and rejects replay', () => {
  const raw = JSON.stringify({ record: { id: '00000000-0000-0000-0000-000000000000' } }); const headers = signed(raw); const req = { headers };
  assert.equal(authenticate(req, raw), true);
  assert.equal(authenticate(req, raw), false);
  assert.equal(authenticate({ headers: { ...headers, 'x-service-id': 'browser' } }, raw), false);
  assert.equal(authenticate({ headers: signed(raw, Date.now() - 60000) }, raw), false);
});

test('control plane exposes only fixed managed operations', () => {
  assert.deepEqual(Object.keys(operations).sort(), ['create-container', 'create-network', 'create-volume', 'image-architecture', 'inspect', 'remove', 'start', 'stop', 'update']);
});
