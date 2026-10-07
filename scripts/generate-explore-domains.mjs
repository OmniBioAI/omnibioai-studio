// Explicit maintenance command; never run by Explore or the web build.
import { readFile, writeFile, rename } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';

export const DATASET = 'https://huggingface.co/datasets/omnibioai/pubmed-abstracts-36M';
export const INDEX_DATASET = 'https://huggingface.co/datasets/omnibioai/pubmed-faiss-indexes';
const INDEX_API = 'https://huggingface.co/api/datasets/omnibioai/pubmed-faiss-indexes';
const API = 'https://huggingface.co/api/datasets/omnibioai/pubmed-abstracts-36M';
const labels = { Aging_Longevity: 'Aging / Longevity', Genomics_GWAS: 'Genomics / GWAS' };

export function normalizeDomainIdentifier(name) {
  // Preserve case and scientific tokens; only storage separators differ.
  return name.replaceAll(' ', '_');
}

export function normalizeInventory(inventory) {
  if (!Array.isArray(inventory?.siblings) || !/^[a-f0-9]{40}$/.test(inventory.sha)) throw new Error('Invalid dataset inventory');
  const paths = [...new Set(inventory.siblings.map(entry => entry.rfilename))];
  const named = paths.filter(path => typeof path === 'string' && /^[A-Za-z][A-Za-z0-9_]*\.jsonl\.gz$/.test(path) && !/^general_corpus/i.test(path)).sort();
  if (!named.length || !paths.some(path => typeof path === 'string' && path.startsWith('general_corpus/'))) throw new Error('Incomplete dataset inventory; preserving existing manifest');
  const domains = named.map(path => {
    const sourceName = normalizeDomainIdentifier(path.slice(0, -'.jsonl.gz'.length));
    return {
      id: `pubmed:${sourceName}`, name: labels[sourceName] || sourceName.replaceAll('_', ' '), sourceName,
      description: 'PubMed biomedical literature domain', corpus: 'PubMed', provider: 'RAG', availability: 'remote',
      source: { type: 'huggingface', url: `${DATASET}/blob/main/${path}` },
    };
  });
  domains.push({ id: 'pubmed:general_corpus', name: 'General Corpus', sourceName: 'general_corpus', description: 'General PubMed literature corpus', corpus: 'PubMed', provider: 'RAG', availability: 'remote', source: { type: 'huggingface', url: `${DATASET}/tree/main/general_corpus` } });
  return { schemaVersion: 1, inventory: { url: API, revision: inventory.sha }, domains };
}

// Only documented dataset layouts qualify. Unknown FAISS layouts abort refresh
// for review instead of silently dropping a possible unmatched domain.
export function reconcileInventories(corpusInventory, indexInventory) {
  const result = normalizeInventory(corpusInventory);
  if (!Array.isArray(indexInventory?.siblings) || !/^[a-f0-9]{40}$/.test(indexInventory.sha)) throw new Error('Invalid index inventory');
  const namedIndexes = new Map();
  let generalIndex = false;
  for (const path of [...new Set(indexInventory.siblings.map(entry => entry.rfilename))].sort()) {
    if (typeof path !== 'string') throw new Error('Invalid index filename');
    if (!path.endsWith('.faiss')) continue;
    if (/^_?general_corpus_chunk[0-9]+\/(?:pubmed_index|index)\.faiss$/.test(path)
      || /^(?:mxbai-1024\/)?general_corpus\/_?general_corpus_chunk[0-9]+\/(?:pubmed_index|index)\.faiss$/.test(path)) {
      generalIndex = true;
      continue;
    }
    const match = /^([A-Za-z][A-Za-z0-9_ ]*)\/pubmed_index\.faiss$/.exec(path);
    if (!match || /^general_corpus/i.test(match[1])) throw new Error(`Unrecognized index layout: ${path}`);
    const name = normalizeDomainIdentifier(match[1]);
    if (namedIndexes.has(name) && namedIndexes.get(name) !== match[1]) throw new Error(`Ambiguous index identity: ${name}`);
    namedIndexes.set(name, match[1]);
  }
  if (!namedIndexes.size && !generalIndex) throw new Error('Incomplete index inventory; preserving existing manifest');
  const domains = new Map(result.domains.map(domain => [domain.sourceName, {
    ...domain,
    corpusSource: { ...domain.source, availability: 'remote' },
    indexSource: { availability: 'unavailable' },
  }]));
  for (const [sourceName, directory] of namedIndexes) {
    if (!domains.has(sourceName)) domains.set(sourceName, {
      id: `pubmed:${sourceName}`, name: labels[sourceName] || sourceName.replaceAll('_', ' '), sourceName,
      description: 'PubMed biomedical literature domain', corpus: 'PubMed', provider: 'RAG', availability: 'remote',
      corpusSource: { availability: 'unavailable' },
    });
    domains.get(sourceName).indexSource = { type: 'huggingface', availability: 'remote', url: `${INDEX_DATASET}/tree/main/${encodeURIComponent(directory)}` };
  }
  if (generalIndex) domains.get('general_corpus').indexSource = {
    type: 'huggingface', availability: 'remote', url: `${INDEX_DATASET}/tree/main`,
  };
  const normalized = [...domains.values()].sort((a, b) => {
    if (a.sourceName === b.sourceName) return 0;
    if (a.sourceName === 'general_corpus') return 1;
    if (b.sourceName === 'general_corpus') return -1;
    return a.sourceName < b.sourceName ? -1 : 1;
  }).map(({ source, ...domain }) => ({ ...domain,
    reconciliation: domain.corpusSource.availability === 'remote'
      ? domain.indexSource.availability === 'remote' ? 'MATCHED' : 'CORPUS_ONLY'
      : 'INDEX_ONLY',
  }));
  return { schemaVersion: 2, inventory: { corpus: result.inventory, index: { url: INDEX_API, revision: indexInventory.sha } }, domains: normalized };
}

async function readInventory(api, snapshot) {
  if (snapshot) return JSON.parse(await readFile(snapshot, 'utf8'));
  const response = await fetch(api, { signal: AbortSignal.timeout(30000) });
  if (!response.ok) throw new Error(`Inventory request failed (${response.status})`);
  return response.json();
}

async function main() {
  // Optional saved public API responses permit reproducible offline generation.
  if (process.argv.length !== 2 && process.argv.length !== 4) throw new Error('Provide both corpus and index snapshots, or neither');
  const [corpus, index] = await Promise.all([
    readInventory(API, process.argv[2]), readInventory(INDEX_API, process.argv[3]),
  ]);
  const manifest = reconcileInventories(corpus, index);
  const output = new URL('../src/ui/catalogs/exploreDomains.json', import.meta.url);
  const temporary = new URL(`${output.href}.tmp`);
  await writeFile(temporary, `${JSON.stringify(manifest, null, 2)}\n`);
  await rename(temporary, output);
  const named = manifest.domains.filter(domain => domain.sourceName !== 'general_corpus');
  console.log(JSON.stringify({ logicalDomains: manifest.domains.length, matchedNamed: named.filter(d => d.reconciliation === 'MATCHED').length,
    corpusOnly: manifest.domains.filter(d => d.reconciliation === 'CORPUS_ONLY').map(d => d.sourceName),
    indexOnly: manifest.domains.filter(d => d.reconciliation === 'INDEX_ONLY').map(d => d.sourceName) }));
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) await main();
