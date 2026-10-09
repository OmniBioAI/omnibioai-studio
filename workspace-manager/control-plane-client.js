'use strict';

const crypto = require('node:crypto');

const URL_BASE = process.env.CONTROL_PLANE_URL;
const SERVICE_ID = process.env.CONTROL_PLANE_SERVICE_ID || 'workspace-manager';
const SERVICE_SECRET = process.env.CONTROL_PLANE_SERVICE_SECRET;

function clientRequest(operation, record, extra = {}) {
  if (!URL_BASE || !SERVICE_SECRET) throw new Error('control-plane service authentication is not configured');
  const payload = JSON.stringify({ record, ...extra });
  const timestamp = String(Date.now());
  const nonce = crypto.randomBytes(16).toString('hex');
  const signature = crypto.createHmac('sha256', SERVICE_SECRET).update(`${timestamp}.${nonce}.${payload}`).digest('hex');
  const correlationId = crypto.randomUUID();
  return fetch(`${URL_BASE}/v1/workspaces/${encodeURIComponent(record.id)}/${operation}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-service-id': SERVICE_ID, 'x-request-timestamp': timestamp, 'x-request-nonce': nonce, 'x-request-signature': signature, 'x-correlation-id': correlationId },
    body: payload,
    signal: AbortSignal.timeout(30000),
  }).then(async response => ({ status: response.status, body: await response.json().catch(() => ({})) }));
}

class ControlPlaneClient {
  imageArchitecture() { return clientRequest('image-architecture', { id: '00000000-0000-0000-0000-000000000000' }).then(result => result.body.architecture || null); }
  inspectContainer(record) { return clientRequest('inspect', record); }
  createVolume(record) { return clientRequest('create-volume', record).then(result => { if (result.status < 200 || result.status >= 300) throw new Error(result.body.error || 'workspace volume creation failed'); return result.body; }); }
  createNetwork(record) { return clientRequest('create-network', record).then(result => { if (result.status < 200 || result.status >= 300) throw new Error(result.body.error || 'workspace network creation failed'); return result.body; }); }
  createContainer(record, extra) { return clientRequest('create-container', record, extra).then(result => { if (result.status < 200 || result.status >= 300 || !result.body.Id) throw new Error(result.body.error || 'workspace container creation failed'); record.runtime_id = result.body.Id; record.runtime_name = `obws-${record.id}`; record.volume_name = `obws-volume-${record.id}`; record.network_name = `obws-network-${record.id}`; record.host_port = extra.hostPort; return result.body; }); }
  start(record) { return clientRequest('start', record); }
  stop(record) { return clientRequest('stop', record); }
  update(record, allocation) { return clientRequest('update', record, { allocation }); }
  remove(record) { return clientRequest('remove', record); }
}

module.exports = { ControlPlaneClient };
