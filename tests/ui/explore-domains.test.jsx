import React from 'react';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { normalizeInventory, reconcileInventories, INDEX_DATASET, DATASET } from '../../scripts/generate-explore-domains.mjs';
import manifest from '../../src/ui/catalogs/exploreDomains.json';
import { domainResources, loadDomainResources, isTrustedDomainUrl, openDomainDataset } from '../../src/ui/lib/exploreDomains';
import Explore from '../../src/ui/pages/Explore';

const { loadExploreResources } = vi.hoisted(() => ({ loadExploreResources: vi.fn() }));
vi.mock('../../src/ui/lib/exploreApi', () => ({ loadExploreResources }));
afterEach(() => { cleanup(); vi.restoreAllMocks(); });

const inventory = paths => ({ sha: 'a'.repeat(40), siblings: paths.map(rfilename => ({ rfilename })) });

describe('Domain inventory', () => {
  it('derives one resource per qualifying root file and exactly one General Corpus regardless of chunks', () => {
    const result = normalizeInventory(inventory(['Hematology.jsonl.gz', 'Genomics_GWAS.jsonl.gz', 'Hematology.jsonl.gz', 'general_corpus/_general_corpus_chunk000.jsonl.gz', 'general_corpus/general_corpus_chunk001.jsonl.gz', '_general_corpus_chunk002.jsonl.gz', 'general_corpus_chunk003.jsonl.gz', 'nested/Other.jsonl.gz', 'README.md', '.gitattributes']));
    expect(result.domains.map(d => d.name)).toEqual(['Genomics / GWAS', 'Hematology', 'General Corpus']);
    expect(result.domains.some(d => /chunk/.test(d.id))).toBe(false);
    expect(result.domains[1]).toMatchObject({ id: 'pubmed:Hematology', source: { type: 'huggingface', url: `${DATASET}/blob/main/Hematology.jsonl.gz` } });
    expect(result.domains[2].source.url).toBe(`${DATASET}/tree/main/general_corpus`);
    const smaller = normalizeInventory(inventory(['Hematology.jsonl.gz', 'general_corpus/chunk.jsonl.gz']));
    expect(smaller.domains).toHaveLength(2);
  });
  it('rejects incomplete refreshes instead of replacing last good inventory', () => {
    expect(() => normalizeInventory(inventory(['Hematology.jsonl.gz']))).toThrow(/Incomplete/);
    expect(() => normalizeInventory({})).toThrow(/Invalid/);
  });
  it('loads the checked-in inventory offline with source-independent IDs and metadata', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('offline'));
    const resources = await loadDomainResources();
    expect(resources).toHaveLength(manifest.domains.length);
    expect(resources.filter(r => r.name === 'General Corpus')).toHaveLength(1);
    expect(resources.some(r => /chunk/.test(r.id))).toBe(false);
    for (const r of resources) {
      expect(r).toMatchObject({ type: 'domain', corpus: 'PubMed', provider: 'RAG', availability: 'remote' });
      expect(r.id).toMatch(/^domain:pubmed:/);
      for (const source of r.sources.filter(s => s.destination)) expect(isTrustedDomainUrl(source.destination.url, source.kind)).toBe(true);
    }
    expect(fetchSpy).not.toHaveBeenCalled();
  });
  it.each(['https://evil.test/', `${DATASET}/blob/main/../secret`, `${DATASET}/blob/main/Hematology.jsonl.gz?token=x`, `${DATASET}/blob/main/general_corpus_chunk000.jsonl.gz`, 'javascript:alert(1)', `https://huggingface.co.evil.test/datasets/omnibioai/pubmed-abstracts-36M/blob/main/Hematology.jsonl.gz`])('rejects untrusted destination %s', url => {
    const open = vi.spyOn(window, 'open').mockImplementation(() => null);
    expect(isTrustedDomainUrl(url)).toBe(false);
    openDomainDataset({ kind: 'domain-dataset', url });
    expect(open).not.toHaveBeenCalled();
  });
});

describe('Explore Domain cards', () => {
  const existing = ['tool', 'workflow', 'service', 'capability'].map(type => ({ id: type, type, name: `Existing ${type}`, destination: { kind: 'navigate', page: 9 } }));
  async function setup() {
    const domains = await loadDomainResources();
    loadExploreResources.mockResolvedValue({ resources: [...existing, ...domains], failures: [] });
    const onOpen = vi.fn();
    render(<Explore onOpen={onOpen} />);
    await screen.findByRole('heading', { name: 'Hematology' });
    return { domains, onOpen };
  }
  it('derives Domains and All counts from resources, renders metadata and opens trusted datasets safely', async () => {
    const { domains } = await setup();
    expect(screen.getByRole('button', { name: /^Domains/ })).toHaveTextContent(`Domains${domains.length}`);
    expect(screen.getByRole('button', { name: /^All/ })).toHaveTextContent(`All${existing.length + domains.length}`);
    fireEvent.click(screen.getByRole('button', { name: /^Domains/ }));
    expect(screen.getAllByRole('heading', { level: 2 })).toHaveLength(domains.length);
    const heading = screen.getByRole('heading', { name: 'Hematology' });
    const card = within(heading.parentElement);
    expect(card.getByText('domain')).toHaveClass('explore-card-type');
    expect(card.getByText('PubMed • RAG')).toBeInTheDocument();
    expect(card.getByText('Corpus · Remote')).toBeInTheDocument();
    const open = vi.spyOn(window, 'open').mockImplementation(() => null);
    fireEvent.click(card.getByRole('button', { name: 'Open corpus for Hematology' }));
    expect(open).toHaveBeenCalledWith(`${DATASET}/blob/main/Hematology.jsonl.gz`, '_blank', 'noopener,noreferrer');
    fireEvent.click(screen.getByRole('button', { name: 'Open corpus for General Corpus' }));
    expect(open).toHaveBeenLastCalledWith(`${DATASET}/tree/main/general_corpus`, '_blank', 'noopener,noreferrer');
    expect(screen.getAllByRole('heading', { name: 'General Corpus' })).toHaveLength(1);
    expect(screen.queryByText(/general_corpus_chunk/)).not.toBeInTheDocument();
  });
  it.each([['hematology', 'Hematology'], ['gwas', 'Genomics / GWAS'], ['Genomics_GWAS', 'Genomics / GWAS'], ['bioinformatics', 'Bioinformatics'], ['general corpus', 'General Corpus'], ['aging / longevity', 'Aging / Longevity']])('uses shared search for %s', async (query, label) => {
    await setup();
    fireEvent.change(screen.getByRole('searchbox'), { target: { value: query } });
    expect(screen.getByRole('heading', { name: label })).toBeInTheDocument();
  });
  it.each([['Tools', 'tool'], ['Workflows', 'workflow'], ['Services', 'service'], ['Capabilities', 'capability']])('preserves %s filters and actions', async (label, type) => {
    const { onOpen } = await setup();
    fireEvent.click(screen.getByRole('button', { name: new RegExp(`^${label}`) }));
    expect(screen.getAllByRole('heading', { level: 2 })).toHaveLength(1);
    fireEvent.click(screen.getByRole('button', { name: `Open Existing ${type}` }));
    expect(onOpen).toHaveBeenCalledWith(existing.find(r => r.type === type).destination, existing.find(r => r.type === type));
  });
});

const pairedFixture = () => reconcileInventories(
  inventory(['Hematology.jsonl.gz', 'Genomics_GWAS.jsonl.gz', 'DNA_damage_response.jsonl.gz', 'Corpus_Only.jsonl.gz', 'general_corpus/_general_corpus_chunk000.jsonl.gz', 'general_corpus/chunk001.jsonl.gz']),
  inventory(['Hematology/pubmed_index.faiss', 'Hematology/pmid_map.json', 'Hematology/metadata.json', 'Hematology/embedding_checkpoint.json', 'Genomics_GWAS/pubmed_index.faiss', 'DNA damage response/pubmed_index.faiss', 'Index_Only/pubmed_index.faiss', 'Metadata_Only/metadata.json', 'Checkpoint_Only/embedding_checkpoint.json', '_general_corpus_chunk000/pubmed_index.faiss', '_general_corpus_chunk001/pmid_map.json', 'mxbai-1024/general_corpus/_general_corpus_chunk000/index.faiss', 'mxbai-1024/general_corpus/_general_corpus_chunk001/index.faiss']),
);

describe('Corpus and FAISS reconciliation', () => {
  it('matches exact identities and storage separators while retaining one logical resource per domain', () => {
    const { domains } = pairedFixture();
    expect(domains).toHaveLength(6);
    expect(new Set(domains.map(d => d.id)).size).toBe(domains.length);
    expect(domains.find(d => d.sourceName === 'DNA_damage_response')).toMatchObject({ id: 'pubmed:DNA_damage_response', reconciliation: 'MATCHED', indexSource: { url: `${INDEX_DATASET}/tree/main/DNA%20damage%20response` } });
    const hem = domains.filter(d => d.sourceName === 'Hematology');
    expect(hem).toHaveLength(1);
    expect(hem[0]).toMatchObject({ reconciliation: 'MATCHED', corpusSource: { availability: 'remote', url: `${DATASET}/blob/main/Hematology.jsonl.gz` }, indexSource: { availability: 'remote', url: `${INDEX_DATASET}/tree/main/Hematology` } });
  });
  it('retains corpus-only and index-only domains explicitly without guessing similar identities', () => {
    const { domains } = pairedFixture();
    expect(domains.find(d => d.sourceName === 'Corpus_Only')).toMatchObject({ reconciliation: 'CORPUS_ONLY', indexSource: { availability: 'unavailable' } });
    expect(domains.find(d => d.sourceName === 'Index_Only')).toMatchObject({ reconciliation: 'INDEX_ONLY', corpusSource: { availability: 'unavailable' } });
    const separate = reconcileInventories(inventory(['Hematology.jsonl.gz', 'general_corpus/chunk.jsonl.gz']), inventory(['hematology/pubmed_index.faiss']));
    expect(separate.domains.find(d => d.sourceName === 'Hematology').reconciliation).toBe('CORPUS_ONLY');
    expect(separate.domains.find(d => d.sourceName === 'hematology').reconciliation).toBe('INDEX_ONLY');
  });
  it('collapses corpus and index shards/variants into one General Corpus and excludes implementation files', () => {
    const { domains } = pairedFixture();
    const general = domains.filter(d => d.name === 'General Corpus');
    expect(general).toHaveLength(1);
    expect(general[0]).toMatchObject({ reconciliation: 'MATCHED', indexSource: { availability: 'remote', url: `${INDEX_DATASET}/tree/main` } });
    expect(domains.some(d => /chunk|faiss|pmid|metadata|checkpoint|mxbai/i.test(d.id))).toBe(false);
  });
  it('rejects unknown layouts and ambiguous identities so refresh cannot silently omit indexes', () => {
    const corpus = inventory(['Hematology.jsonl.gz', 'general_corpus/chunk.jsonl.gz']);
    expect(() => reconcileInventories(corpus, inventory(['variant/Unknown/index.faiss']))).toThrow(/Unrecognized/);
    expect(() => reconcileInventories(corpus, inventory(['DNA damage/pubmed_index.faiss', 'DNA_damage/pubmed_index.faiss']))).toThrow(/Ambiguous/);
    expect(() => reconcileInventories(corpus, inventory(['Metadata/metadata.json']))).toThrow(/Incomplete/);
    expect(() => reconcileInventories(corpus, {})).toThrow(/Invalid/);
  });
  it('generates deterministically regardless of inventory ordering and duplicate file records', () => {
    const corpus = inventory(['Hematology.jsonl.gz', 'general_corpus/chunk.jsonl.gz']);
    const index = inventory(['Index_Only/pubmed_index.faiss', 'Hematology/pubmed_index.faiss']);
    const first = JSON.stringify(reconcileInventories(corpus, index));
    corpus.siblings.reverse(); index.siblings.reverse(); index.siblings.push(index.siblings[0]);
    expect(JSON.stringify(reconcileInventories(corpus, index))).toBe(first);
    expect(JSON.stringify(pairedFixture())).toBe(JSON.stringify(pairedFixture()));
  });
  it.each([`${INDEX_DATASET}/blob/main/Hematology/pubmed_index.faiss`, `${INDEX_DATASET}/tree/main/Hematology?token=private`, `${INDEX_DATASET}/tree/main/../secret`, `${INDEX_DATASET}/tree/main/general_corpus_chunk000`, `${INDEX_DATASET}/tree/main/_general_corpus_chunk000`, `${INDEX_DATASET}/tree/main/Hematology%2Fpmid_map.json`, `${DATASET}/tree/main/general_corpus`])('rejects unsafe or cross-repository index link %s', url => {
    const open = vi.spyOn(window, 'open').mockImplementation(() => null);
    expect(isTrustedDomainUrl(url, 'index')).toBe(false);
    openDomainDataset({ kind: 'domain-dataset', resourceKind: 'index', url });
    expect(open).not.toHaveBeenCalled();
  });
  it('rejects cross-repository corpus sources and malformed manifest sources', () => {
    expect(isTrustedDomainUrl(`${INDEX_DATASET}/tree/main/Hematology`, 'corpus')).toBe(false);
    const bad = pairedFixture(); bad.domains[0].indexSource = { type: 'huggingface', availability: 'remote', url: 'https://evil.test' };
    expect(() => domainResources(bad)).toThrow(/Unsupported/);
  });
  it('renders availability, correct actions and single-card search for paired and unmatched domains', async () => {
    const resources = domainResources(pairedFixture());
    loadExploreResources.mockResolvedValue({ resources, failures: [] });
    render(<Explore />);
    await screen.findByRole('heading', { name: 'Hematology' });
    expect(screen.getByRole('button', { name: /^Domains/ })).toHaveTextContent(`Domains${resources.length}`);
    expect(screen.getByRole('button', { name: /^All/ })).toHaveTextContent(`All${resources.length}`);
    const card = name => within(screen.getByRole('heading', { name, exact: true }).parentElement);
    expect(card('Hematology').getByText('Corpus · Remote')).toBeInTheDocument();
    expect(card('Hematology').getByText('FAISS Index · Remote')).toBeInTheDocument();
    expect(card('Corpus Only').getByText('FAISS Index · Unavailable')).toBeInTheDocument();
    expect(card('Corpus Only').queryByRole('button', { name: /Open index/ })).not.toBeInTheDocument();
    expect(card('Corpus Only').getByRole('button', { name: /Open corpus/ })).toBeInTheDocument();
    expect(card('Index Only').getByText('Corpus · Unavailable')).toBeInTheDocument();
    expect(card('Index Only').queryByRole('button', { name: /Open corpus/ })).not.toBeInTheDocument();
    const open = vi.spyOn(window, 'open').mockImplementation(() => null);
    fireEvent.click(card('Hematology').getByRole('button', { name: /Open index/ }));
    expect(open).toHaveBeenLastCalledWith(`${INDEX_DATASET}/tree/main/Hematology`, '_blank', 'noopener,noreferrer');
    fireEvent.click(card('Index Only').getByRole('button', { name: /Open index/ }));
    expect(open).toHaveBeenLastCalledWith(`${INDEX_DATASET}/tree/main/Index_Only`, '_blank', 'noopener,noreferrer');
    fireEvent.click(card('General Corpus').getByRole('button', { name: /Open index/ }));
    expect(open).toHaveBeenLastCalledWith(`${INDEX_DATASET}/tree/main`, '_blank', 'noopener,noreferrer');
    fireEvent.change(screen.getByRole('searchbox'), { target: { value: 'hematology' } });
    expect(screen.getAllByRole('heading', { level: 2 })).toHaveLength(1);
    fireEvent.change(screen.getByRole('searchbox'), { target: { value: 'faiss' } });
    expect(screen.getAllByRole('heading', { level: 2 })).toHaveLength(resources.filter(r => r.indexSource.availability === 'remote').length);
    expect(screen.queryByRole('heading', { name: 'Corpus Only' })).not.toBeInTheDocument();
    fireEvent.change(screen.getByRole('searchbox'), { target: { value: 'corpus only' } });
    expect(screen.getByRole('heading', { name: 'Corpus Only' })).toBeInTheDocument();
  });
});
