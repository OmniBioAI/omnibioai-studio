import { afterEach, expect, it, vi } from 'vitest';
vi.mock('../../src/ui/lib/exploreDomains', () => ({ loadDomainResources: vi.fn(async () => { throw new Error('domain inventory unavailable'); }) }));
vi.mock('../../src/ui/lib/session', () => ({ isElectron: () => false, getToken: () => '' }));
vi.mock('../../src/ui/lib/workbenchApi', () => ({ applicationUrl: p => p, loadWorkbenchCatalog: async () => ({ categories: [{ plugins: [{ slug: 'app', title: 'Application', launch_path: '/app' }] }] }) }));
import { loadExploreResources } from '../../src/ui/lib/exploreApi';
afterEach(() => vi.unstubAllGlobals());
it('isolates domain failure and preserves every existing source', async () => {
  vi.stubGlobal('fetch', vi.fn(async url => ({ ok: true, json: async () => url.includes('/tools') ? [{ id: 'tool', name: 'Tool' }] : url.includes('/workflows') ? [{ id: 'wf', name: 'Workflow', engine: 'nextflow' }] : [{ adapter_type: 'slurm', capabilities: {} }] })));
  const result = await loadExploreResources();
  expect(result.failures).toEqual(['some domains']);
  for (const type of ['tool', 'workflow', 'service', 'capability']) expect(result.resources.some(r => r.type === type)).toBe(true);
  expect(result.resources.some(r => r.type === 'domain')).toBe(false);
});
