# Explore PubMed/RAG Domains V1

Hugging Face is temporary public backing storage. Explore uses the checked-in
normalized `src/ui/catalogs/exploreDomains.json`, never browser scraping, directory
requests, credentials, or corpus downloads. Builds also work offline from this
inventory. An outage at Hugging Face cannot remove the last generated inventory.

## Discovery and provenance

Source: https://huggingface.co/datasets/omnibioai/pubmed-abstracts-36M/tree/main

The public dataset metadata API's complete `siblings` file inventory at revision
`d26d98f71ecf801b62283ea1762a33966dd0b31a` contained 150 qualifying named root
`.jsonl.gz` files, 132 files inside `general_corpus/`, README and Git attributes.
The result is 150 named domains and one General Corpus (151 Explore resources).
These are discovery observations, not count constants in the implementation.
No chunk is an Explore resource. Counts come from the normalized resource array.

Before implementing, Studio Explore, the neighboring RAG, data and Workbench
repositories were searched. RAG's `scripts/domains.py` is an ingestion query
registry: eight entries are absent from Hugging Face and eight Hugging Face
names are absent from that registry. It is not the current stored inventory.
RAG's `/v1/studies` enumerates tenant-filtered local indexes, while
`ragbio/security/global_manifest.py` is an empty security allowlist, not a
public domain catalog. Reindex manifests describe index shards, including
General Corpus chunks. None is a replacement for this temporary public source.
No RAG authorization or ingestion registry was changed.

The FAISS metadata API at revision
`439895400c2507d5e138cb718ff59f1a8bcfea7b` lists 150 named domain directories
with `pubmed_index.faiss`. All 150 match the corpus inventory. Corpus-only: 0;
index-only: 0. General Corpus is present on both sides, giving 151 logical
resources. Metadata alone was fetched; no corpus, FAISS, PMID map, checkpoint
or embedding data was downloaded.

Named index directories are matched to corpus stems using the same case-sensitive
identity convention. Spaces become underscores: `DNA damage response` matches
`DNA_damage_response`, and `cell cycle regulation` matches
`cell_cycle_regulation`. Case, acronyms and other scientific tokens are preserved.
Ambiguous normalized identities abort generation rather than merge domains.
Index-only directories with a canonical `pubmed_index.faiss` become one explicit
index-only Domain; corpus-only entries remain visible with an unavailable index.
Similar-looking names are never fuzzy-matched.

General Corpus indexes have 125 root shard FAISS files and 56 files in the
`mxbai-1024/general_corpus/` variant tree. These are physical versions/shards,
not additional domains. Presence means index files exist, not that every shard
is complete or that retrieval is ready. The General Corpus index action points
to the repository root, the common parent of both observed layouts; no single
shard or embedding variant is selected as the logical corpus. Named index
links point to their domain directory, never a raw FAISS or metadata file.

Index discovery only accepts observed layouts. Metadata/checkpoint/PMID files
cannot establish a domain or index availability. An unknown FAISS layout aborts
a refresh for review, so new layouts cannot silently disappear from inventory.

## Refresh

Run explicitly (not on page load or during the build):

```sh
node scripts/generate-explore-domains.mjs
```

For reproducible generation, optionally pass both saved public API JSON responses:

```sh
node scripts/generate-explore-domains.mjs corpus-inventory.json index-inventory.json
```

The arguments are corpus metadata followed by index metadata. No token is needed. Review the manifest diff,
run Explore tests and commit the result. The generator validates the response,
qualifies only safe root dataset filenames, deduplicates files, and collapses
all `general_corpus/` contents into one directory resource. Missing named files
or General Corpus abort the refresh. Writes use a temporary file and rename,
so request/validation failures preserve the prior inventory. Source revision
is retained for auditing. No manually maintained total exists.

Labels conservatively replace underscores with spaces, preserving scientific
case and tokens; explicit aliases are Aging / Longevity and Genomics / GWAS.
The original stem remains searchable. Descriptions are generic corpus labels.

## Source and migration boundary

Logical IDs (`domain:pubmed:<canonical stem>`) contain neither a host nor a
storage URL. Normalized metadata specifies name, description, corpus, provider,
availability, `corpusSource` and `indexSource` independently. Each source
has its own availability and, when available, provider type and trusted URL.
Missing sources have `availability: "unavailable"` and no URL. The manifest
records MATCHED, CORPUS_ONLY or INDEX_ONLY for every domain. `exploreDomains.js` is the storage
adapter that turns source metadata into a destination. The shared Explore
filter, search, counts and card layout consume normalized resources.

Future DGX/RAG work can replace that manifest/source adapter with an RAG-owned
source and safe application destination while keeping logical IDs, taxonomy,
search and cards. The conceptual future storage hierarchy is
`data/Pubmed/Abstracts` (the current RAG repository spells its root `PubMed`).
Physical host paths must stay server-side; expose only an opaque RAG reference
or authorized application route. The future FAISS location is deliberately
unspecified and belongs to RAG/storage infrastructure. Corpus and index sources
can migrate independently without changing logical IDs or resource counts.
No local storage adapter, mount, synchronization,
index move or embedding migration is implemented here.

Only exact HTTPS corpus blob/directory URLs in `omnibioai/pubmed-abstracts-36M`
and index directory URLs in `omnibioai/pubmed-faiss-indexes` are accepted by this V1 adapter and rechecked on click before the existing
Studio external-link helper opens them. Arbitrary hosts, query strings,
fragments and path traversal are rejected. A domain adapter failure follows
Explore's existing partial-source failure behavior.

## Validation

Focused tests cover generation, chunk exclusion, derived counts, shared search,
card classification/metadata, safe navigation, all existing category actions,
offline loading and isolated domain-source failure. Run:

```sh
npm run test:ui -- tests/ui/explore.test.jsx tests/ui/explore-api.test.js tests/ui/explore-domains.test.jsx tests/ui/explore-domain-failure.test.js
npm run test:ui
npm run web:build
git diff --check
```

### Validation status

The original corpus-only baseline passed 30 focused tests and 863 full UI tests.
The corpus/FAISS amendment preserves those cases and adds reconciliation,
mismatch rendering, dual-action safety, unknown-layout and determinism tests.
Final validation:

- Focused Explore: 44/44 passed; full Studio UI: 877/877 passed (74 files).
- Production web build and `git diff --check`: passed.
- Repeated metadata generation was byte-identical; manifest SHA-256:
  `d3c51625ba90ae840975489f65f983d0a8bff552e211e74e0c1d29182ec73f7f`.
- Every named corpus/index URL was independently checked against the fetched
  public file inventories. No large data was downloaded.
- Production/source scan found no credentials, Hugging Face tokens, private
  keys, signed URLs or actual host paths. Generic Settings examples
  (`/home/username/...`, `/workspace/work`) predate this feature.
- Only local `web-ui` was rebuilt/recreated. Container status was Up and nginx
  startup logs were normal.
- Chrome AppleScript inspection of the existing normally authenticated Studio
  tab after a normal reload confirmed the exact new production asset
  `index-DjJgFlVO.js`, both Open corpus/Open index actions, no partial-source
  warning, and counts: All 13,941; Tools 12,276; Workflows 1,002; Services 501;
  Domains 151; Capabilities 11. No cookies or tokens were read or copied, and
  authentication was not mocked or bypassed.
- Full authenticated interaction verification remains incomplete: the active
  tab changed pages during checks, isolated tabs did not inherit usable
  authentication, and macOS denied automated Cmd+Shift+R keyboard access.
  Manual hard refresh, General Corpus uniqueness, all paired action destinations,
  search interactions and console/runtime-error inspection still need completion
  in a stable signed-in session. These behaviors pass the focused UI tests;
  that is not a claim of completed authenticated browser automation.

The final commit gate requires all code/test/build checks green; authenticated
runtime limitations are reported separately rather than hidden.
