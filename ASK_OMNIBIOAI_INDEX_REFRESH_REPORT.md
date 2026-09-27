# Ask OmniBioAI documentation-index refresh report

Date: 2026-09-27

## Result

The active index is stale and incomplete for the requested RNA-seq question.
A clean, non-destructive public candidate was built and validated, but it was
not promoted because it does not contain the authoritative execution README
needed to answer the question. Promoting it would refresh 11 chunks without
changing the observed answer.

## Root cause

The active index was generated from `omnibioai-docs` revision
`217b75ad0c7aa3e0fc505b31711ba946d6fc4dd5` on 2026-09-20. The current
authoritative docs checkout is revision
`090257d3725bc79d64edeaccd84d16e807ae6b6a` from 2026-09-27.

The current public index contains RNA-seq catalog references, including
`site/docs/workflows-catalog/domains.md`, but not the concrete workflow
execution instructions. Those instructions are in the authoritative
workflow-bundles checkout at:

`/home/manish/Desktop/machine/omnibioai-workflow-bundles/rnaseq_v1/README.md`

That README documents `cd rnaseq_v1`, `nextflow run workflow/main.nf`, the
Docker profile, input JSON, and output behavior, so it is sufficient to answer
“how to run rnaseq workflow?” for the `rnaseq_v1` workflow.

The trusted ingestion policy intentionally excludes nested README files from
repositories other than `omnibioai-docs`, and defaults those repositories to
`INTERNAL`. `omnibioai-workflow-bundles` has no public visibility inventory.
Consequently, its README is not eligible for the public-only served artifact.
This is a publication/source-classification gap, not an authentication or
retrieval-threshold problem.

## Existing active index

- Location: `/home/manish/Desktop/machine/omnibioai-dev-hub/data/faiss_index`
- Vectors/chunks: 2,010
- Documents: 132
- Repository: `omnibioai-docs` only
- Visibility: PUBLIC 2,010; INTERNAL 0; REVIEW_REQUIRED 0
- Build ID: `devhub-phase18-20260919220740-public`
- Build timestamp: `2026-09-20T06:55:57Z`
- Source revision: `217b75ad0c7aa3e0fc505b31711ba946d6fc4dd5`
- Embedding model/dimension: `nomic-embed-text` / 768
- Retained previous index: `data/faiss_previous/previous-20260920T071407Z`

RNA-seq terms were already present in the old index, mostly in generated
catalog/domain chunks. The old index had no exact `run rnaseq` phrase and no
workflow-bundle README content.

## Source audit

The configured source list contains current OmniBioAI repositories only; no
obsolete `man4ish` repository was selected. Trusted discovery found 1,930
Markdown documents:

- 132 PUBLIC documents, all from `omnibioai-docs`
- 1,798 INTERNAL documents
- 26 additional documents skipped by the existing policy
- 0 ingestion failures

The source policy excludes `.git`, virtual environments, node_modules, build
and coverage artifacts, generated binary/runtime data, logs, secrets, and
other configured historical/temporary path segments. Only Markdown is read.

## Candidate refresh

The existing candidate builder was used with the public `omnibioai-docs`
source set and the existing `nomic-embed-text` model. It wrote only to:

`/tmp/omnibioai-dev-hub-faiss-candidates/docs-public-refresh-20260927`

Candidate result:

- 132 documents
- 2,021 chunks/vectors
- PUBLIC 2,021; INTERNAL 0; REVIEW_REQUIRED 0
- 768 dimensions
- 2,021 successful embeddings
- 0 embedding failures
- 0 ingestion failures
- validation: passed
- source revision: `090257d3725bc79d64edeaccd84d16e807ae6b6a`

The active index was not overwritten, no service was restarted, and no
container was recreated. The active artifact hashes and timestamps remained
unchanged.

## Retrieval validation

The existing retrieval and grounded-answer pipeline was run against both the
active index and the candidate.

- `how to run rnaseq workflow?`: retrieved RNA-seq catalog chunks, but the
  grounded-answer contract correctly returned “No trusted documentation
  answer”; no citations were emitted.
- `how do I configure LLM providers?`: no supported public documentation was
  found; trusted fallback remained.
- `how do I launch a workflow?`: grounded answer returned, citing
  `site/docs/user/workflows.md`.
- `what workflow engines does OmniBioAI support?`: grounded answer returned,
  citing `site/docs/workflows-catalog/domains.md`.

The candidate produced the same outcome as the active index for all four
queries. No confidence threshold or trusted-only fallback was changed.

## Activation decision

Not activated. The current index should not be promoted until the publication
owner explicitly classifies the appropriate workflow-bundle documentation as
PUBLIC (or publishes equivalent execution guidance into `omnibioai-docs`),
then the trusted candidate should be rebuilt and evaluated again. That change
must preserve fail-closed visibility handling and should be reviewed as a
documentation-publication decision, not implemented by bypassing the index
policy.

## Files/services changed

No tracked source files or service configurations were changed for this task.
Only the non-active candidate artifacts under `/tmp` were created. No
authentication, IAM, authorization, Redis, RAG policy, or Studio routing was
modified.

## Git state

Studio already had unrelated changes:

```text
 M docker-compose.release.yml
 M docker-compose.yml
```

Dev Hub already had unrelated/authentication changes:

```text
 M api/auth.py
 M omnibioai-dev-hub-ui/src/api/client.test.ts
 M omnibioai-dev-hub-ui/src/api/client.ts
 M tests/test_auth.py
 M tests/test_coverage_completion.py
```

No commit or push was performed.
