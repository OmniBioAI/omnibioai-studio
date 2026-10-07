import manifest from '../catalogs/exploreDomains.json';
import { openExternal } from './externalLink';

// Temporary storage adapter. Logical IDs, taxonomy and card metadata do not
// depend on this provider. A future RAG adapter supplies its own destination.
export function isTrustedDomainUrl(url, resourceKind = 'corpus') {
  if (resourceKind === 'index') {
    return typeof url === 'string' && /^https:\/\/huggingface\.co\/datasets\/omnibioai\/pubmed-faiss-indexes\/tree\/main(?:\/[A-Za-z](?:[A-Za-z0-9_]|%20)*)?$/.test(url)
      && !/\/(?:general_corpus|mxbai)[^/]*$/i.test(url);
  }
  if (resourceKind !== 'corpus') return false;
  return typeof url === 'string' && /^https:\/\/huggingface\.co\/datasets\/omnibioai\/pubmed-abstracts-36M\/(?:blob\/main\/[A-Za-z][A-Za-z0-9_]*\.jsonl\.gz|tree\/main\/general_corpus)$/.test(url)
    && !/\/general_corpus[^/]*\.jsonl\.gz$/i.test(url);
}

export function openDomainDataset(destination) {
  if (destination?.kind === 'domain-dataset' && isTrustedDomainUrl(destination.url, destination.resourceKind)) openExternal(destination.url);
}

export function domainResources(inventory) {
  if (inventory.schemaVersion !== 2 || !Array.isArray(inventory.domains)) throw new Error('Invalid domain inventory');
  return inventory.domains.map(domain => {
    const sources = [['corpus', 'Corpus', domain.corpusSource], ['index', 'FAISS Index', domain.indexSource]].map(([kind, label, source]) => {
      if (source?.availability === 'unavailable' && source.url === undefined) return { kind, label, availability: 'unavailable' };
      if (source?.type !== 'huggingface' || source.availability !== 'remote' || !isTrustedDomainUrl(source.url, kind)) throw new Error('Unsupported domain source');
      return { kind, label, availability: source.availability, destination: { kind: 'domain-dataset', resourceKind: kind, url: source.url, label: kind === 'corpus' ? 'Open corpus' : 'Open index' } };
    });
    return { ...domain, id: `domain:${domain.id}`, type: 'domain', tags: [], sources };
  });
}

export async function loadDomainResources() {
  return domainResources(manifest);
}
