'use strict';

const http = require('node:http');

const SOCKET_PATH = process.env.DOCKER_SOCKET_PATH || '/var/run/docker.sock';
const IMAGE = 'ghcr.io/omnibioai/omnibioai-jupyter:1.0';
const UUID = /^[0-9a-f-]{36}$/;

function names(workspace) {
  if (!workspace || !UUID.test(workspace.id)) throw new Error('invalid managed workspace id');
  return { container: `obws-${workspace.id}`, volume: `obws-volume-${workspace.id}`, network: `obws-network-${workspace.id}` };
}

function labels(workspace) {
  return {
    'com.omnibioai.managed': 'workspace-manager-v1',
    'com.omnibioai.workspace.id': workspace.id,
    'com.omnibioai.workspace.owner_user_id': String(workspace.owner_user_id),
    'com.omnibioai.workspace.organization_id': String(workspace.organization_id),
  };
}

function request(method, endpoint, requestBody) {
  return new Promise((resolve, reject) => {
    const encoded = requestBody === undefined ? undefined : JSON.stringify(requestBody);
    const req = http.request({ socketPath: SOCKET_PATH, path: endpoint, method,
      headers: encoded ? { 'content-type': 'application/json', 'content-length': Buffer.byteLength(encoded) } : {} }, res => {
      let raw = ''; res.setEncoding('utf8'); res.on('data', chunk => { raw += chunk; });
      res.on('end', () => { let parsed; try { parsed = raw ? JSON.parse(raw) : {}; } catch { parsed = raw; } resolve({ status: res.statusCode, body: parsed }); });
    });
    req.on('error', reject); req.end(encoded);
  });
}

function assertManaged(record, resource, expectedName) {
  const actualName = resource.Name?.replace(/^\//, '') || resource.Name;
  if (actualName !== expectedName) throw new Error('managed Docker resource name mismatch');
  const actual = resource.Config?.Labels || resource.Labels || {};
  const expected = labels(record);
  for (const key of Object.keys(expected)) if (actual[key] !== expected[key]) throw new Error('managed Docker resource ownership mismatch');
}

class DockerControlPlane {
  async imageArchitecture() {
    const result = await request('GET', `/images/${encodeURIComponent(IMAGE)}/json`);
    return result.status === 200 ? result.body.Architecture : null;
  }

  async inspectContainer(record) {
    const result = await request('GET', `/containers/${encodeURIComponent(record.runtime_id)}/json`);
    if (result.status === 404) return result;
    if (result.status !== 200 || !result.body || typeof result.body !== 'object') throw new Error('managed workspace container inspection failed');
    assertManaged(record, result.body, names(record).container);
    return result;
  }

  async createVolume(record) {
    const result = await request('POST', '/volumes/create', { Name: names(record).volume, Driver: 'local', Labels: labels(record) });
    if (result.status < 200 || result.status >= 300) throw new Error('workspace volume creation failed');
    const inspected = await request('GET', `/volumes/${encodeURIComponent(names(record).volume)}`);
    if (inspected.status !== 200) throw new Error('workspace volume inspection failed');
    assertManaged(record, inspected.body, names(record).volume); return inspected.body;
  }

  async createNetwork(record) {
    const result = await request('POST', '/networks/create', { Name: names(record).network, Driver: 'bridge', Labels: labels(record) });
    if (result.status < 200 || result.status >= 300) throw new Error('workspace network creation failed');
    const inspected = await request('GET', `/networks/${encodeURIComponent(names(record).network)}`);
    if (inspected.status !== 200) throw new Error('workspace network inspection failed');
    assertManaged(record, inspected.body, names(record).network); return inspected.body;
  }

  async createContainer(record, { token, hostPort }) {
    const n = names(record); const architecture = await this.imageArchitecture();
    if (architecture !== 'arm64') throw new Error('workspace image is not available for arm64');
    const result = await request('POST', `/containers/create?name=${n.container}`, {
      Image: IMAGE, User: '1000:100', Cmd: ['start-notebook.py', `--NotebookApp.token=${token}`, `--ServerApp.token=${token}`, '--ip=0.0.0.0', '--no-browser'],
      Env: ['JUPYTER_ENABLE_LAB=yes', `JUPYTER_TOKEN=${token}`], ExposedPorts: { '8888/tcp': {} }, Labels: labels(record),
      HostConfig: { NanoCpus: Math.round(record.allocation.cpu * 1e9), Memory: record.allocation.memory_bytes, DeviceRequests: [],
        NetworkMode: n.network, PortBindings: { '8888/tcp': [{ HostIp: '127.0.0.1', HostPort: String(hostPort) }] },
        SecurityOpt: ['no-new-privileges:true'], Privileged: false, Binds: [`${n.volume}:/home/jovyan/work:rw`] },
    });
    if (result.status < 200 || result.status >= 300 || !result.body.Id) throw new Error('workspace container creation failed');
    record.runtime_id = result.body.Id; record.runtime_name = n.container; record.volume_name = n.volume; record.network_name = n.network; record.host_port = hostPort;
    const inspected = await this.inspectContainer(record); assertManaged(record, inspected.body, n.container); return result.body;
  }

  async start(record) { const result = await this.inspectContainer(record); if (result.status === 404) throw new Error('managed workspace container not found'); return request('POST', `/containers/${encodeURIComponent(record.runtime_id)}/start`); }
  async stop(record) { const result = await this.inspectContainer(record); if (result.status === 404) return result; return request('POST', `/containers/${encodeURIComponent(record.runtime_id)}/stop`, { t: 5 }); }
  async update(record, allocation) { const result = await this.inspectContainer(record); if (result.status === 404) throw new Error('managed workspace container not found'); return request('POST', `/containers/${encodeURIComponent(record.runtime_id)}/update`, { NanoCpus: Math.round(allocation.cpu * 1e9), Memory: allocation.memory_bytes, DeviceRequests: [] }); }

  async remove(record, { purgeData = false } = {}) {
    if (record.runtime_id) { const inspected = await this.inspectContainer(record); if (inspected.status !== 404) await request('DELETE', `/containers/${encodeURIComponent(record.runtime_id)}?force=true`); }
    const n = names(record); const volume = await request('GET', `/volumes/${encodeURIComponent(n.volume)}`); if (purgeData && volume.status === 200) { assertManaged(record, volume.body, n.volume); await request('DELETE', `/volumes/${encodeURIComponent(n.volume)}`); }
    const network = await request('GET', `/networks/${encodeURIComponent(n.network)}`); if (network.status === 200) { assertManaged(record, network.body, n.network); await request('DELETE', `/networks/${encodeURIComponent(n.network)}`); }
  }
}

module.exports = { DockerControlPlane, IMAGE, labels, names, request };
