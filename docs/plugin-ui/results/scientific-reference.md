# ScientificReference (`reference`)

## Purpose

Navigate from a validated scientific identifier to its authoritative
external record through a fixed, server-owned redirect — never an
arbitrary link.

## When to use it

A `references` detail section whose backend projects a bounded list of
scientific identifiers of an allowlisted type.

## When NOT to use it

Arbitrary web links, downloads, artifacts, internal routes, user-supplied
URLs, signed URLs, or server actions — none of those are what this
component is for.

## Current allowlisted reference types

Exactly five, each with its own identifier grammar and bound
(`SCIENTIFIC_REFERENCE_TYPES` in `src/ui/lib/pluginUiContracts.js`):

| Type | Label | Max length | Identifier pattern |
| --- | --- | --- | --- |
| `doi` | DOI | 255 | `10.\d{4,9}/...` |
| `pubmed` | PubMed | 10 | `[1-9]\d{0,9}` |
| `clinvar` | ClinVar | 32 | `VCV\d{9}(\.\d+)?` |
| `ncbi_gene` | NCBI Gene | 10 | `[1-9]\d{0,9}` |
| `refseq` | RefSeq | 32 | `(NC\|NG\|NM\|NR\|NT\|NW\|NZ\|XM\|XR\|NP\|XP\|YP\|WP)_\d{6,9}(\.\d{1,4})?` |

Which of these a given plugin may actually use is additionally scoped
per-plugin (`scientificReferenceTypesForPlugin`): today `rcsb_pdb` is
scoped to `["doi", "pubmed"]` and `dbsnp` to `["clinvar", "ncbi_gene",
"refseq"]`. **Do not treat this list as open-ended** — adding a new type or
scoping it to a new plugin is itself a reviewed change (see
[adding-a-component.md](../adding-a-component.md)'s evidence bar).

## Descriptor contract

Declared only as a `references` presentation inside a
[DetailPanel](detail-panel.md) section — see that page for the section
shape. There is no standalone `reference` field/widget a plugin declares
directly; `ScientificReference` itself takes trusted props
(`pluginSlug`, `referenceType`, `identifier`) supplied by `DetailPanel`/
`QueryRenderer` from an already-validated response, never directly from a
descriptor.

## Properties / fields

Runtime record shape, exactly:

```json
{"reference_type": "pubmed", "identifier": "6726807"}
```

No other key is allowed. The identifier keeps its full scientific
precision as a string and must pass its type's grammar; it may not contain
`..`, `\`, or control characters.

## Backend responsibilities

Authenticate, enforce plugin/type scope, validate the identifier against
its type's grammar, select the fixed HTTPS scheme/host/path policy for that
type, and return a redirect with `Cache-Control: no-store`,
`Referrer-Policy: no-referrer`, `X-Content-Type-Options: nosniff`.

## Frontend responsibilities

Construct only the fixed same-origin resolution operation,
`/plugins/{slug}/api/ui-reference/{reference_type}/?identifier=...`
(`ScientificReference.jsx`'s `referencePath()`), and render a semantic
anchor to it. It never receives or constructs the actual destination URL.

## Security boundary

Neither descriptors nor response records ever contain `href`, a URL, host,
scheme, template, callback, or destination. Unknown types and malformed
identifiers render inert, disabled text rather than a link. The backend
defends against open-redirect payloads — absolute/protocol-relative URLs,
encoded schemes/slashes, query/fragment injection, CR/LF, backslashes,
traversal, Unicode slash lookalikes, overlong values, duplicate query
parameters, destination-like query keys — and re-verifies the final
`Location` is an exact allowlisted HTTPS host with no userinfo/port before
responding. Django never accepts a `next`/redirect/destination input on
this route.

## States

Valid (a semantic link), invalid/unavailable (inert `<span
aria-disabled="true">`, showing the raw identifier or "Reference
unavailable").

## Accessibility

A semantic anchor whose accessible name includes the resource label and
full identifier (`"{label}: {identifier} (external scientific resource)"`),
a visible focus ring, and a non-color external-resource mark (↗) — not a
color-only indicator. It opens in the current browsing context; there is no
casual `target="_blank"`.

## Scientific-data considerations

The complete identifier always wraps at narrow widths and is never
ellipsized — a truncated DOI or RefSeq accession would be scientifically
meaningless.

## Example

RCSB PDB's primary citation DOI/PubMed references is the production proof.
dbSNP's ClinVar/Gene/RefSeq references establish registry reuse but remain
on `ServiceViewer` because its full multi-operation projection is a larger
migration than this component covers.

## Rendered behavior

An inline link reading e.g. "PubMed: 6726807 ↗".

## Validation / failure behavior

A malformed authoritative response rejects the **entire** detail payload
before rendering (not just the one bad reference) — see
`validStructuredDetailRecord` in [detail-panel.md](detail-panel.md).

## Testing

`tests/ui/workbench-scientific-reference.test.jsx`; Workbench backend
`plugins/shared/tests/test_scientific_references.py`,
`plugins/shared/tests/test_query_ui.py`.

## Related components

[detail-panel](detail-panel.md)
