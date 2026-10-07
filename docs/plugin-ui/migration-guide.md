# Migrating a legacy Django-template plugin

This guide covers converting an existing `ServiceViewer`-rendered (legacy
Django template) plugin to a native declarative UI. The steps are the same
five steps as [quickstart.md](quickstart.md); this page adds the
parity-preservation work migration specifically requires.

## Process

1. **Inventory existing template behavior.** List every input, every
   validation rule, every result field, and every authorization check the
   legacy template and its view currently perform. This inventory is your
   parity checklist for step 11.
2. **Classify the UI family.** Submit-and-poll analysis, search-and-detail
   query, or static informational content. See
   [renderer-selection.md](renderer-selection.md). If the plugin is a
   dashboard, multi-stage flow, graph editor, or genuinely interactive
   viewer, stop — it belongs in
   [renderers/specialized-renderers.md](renderers/specialized-renderers.md),
   not this migration path.
3. **Identify the renderer** (`async_analysis`, `query`, or `informational`).
4. **Map existing form controls to shared fields.** See
   [fields/README.md](fields/README.md). If a control's shape has no
   evidence-backed shared field (e.g. an arbitrary remote-search box, a
   dataset/registered-object picker), that control stays unsupported — keep
   the plugin legacy rather than approximating it with the wrong field type.
5. **Map existing result rendering to shared result components.** See
   [results/README.md](results/README.md). The same rule applies: a result
   shape with no real evidence elsewhere (see
   [adding-a-component.md](adding-a-component.md)) stays on `ServiceViewer`.
6. **Preserve backend validation.** Every scientific validation rule the
   legacy view performs must still run, unchanged, in the new authoritative
   endpoint. Migration is a presentation-layer change, not a chance to
   rewrite scientific logic.
7. **Preserve scientific semantics.** Numeric precision, identifier grammar,
   and domain-specific bounds must produce bit-for-bit the same accepted/
   rejected inputs as the legacy template did.
8. **Preserve authentication/authorization.** Ownership, IAM scope, and CSRF
   protection must be identical or strictly tighter — never relaxed to make
   the migration easier.
9. **Add the descriptor.** Following [descriptor-spec.md](descriptor-spec.md).
10. **Add tests.** Following [testing.md](testing.md), with migration parity
    tests added on top (see below).
11. **Verify parity.** Run the same real inputs through both the legacy
    template and the new native UI and confirm identical accept/reject
    behavior and identical result content.
12. **Switch `native_supported` to `true` only after parity is proven**, not
    before.
13. **Retain the `ServiceViewer` fallback** until you are confident in
    production; an unresolvable renderer, a failed descriptor validation, or
    `native_supported: false` all fall back to it automatically, so leaving
    it in place costs nothing and gives you a safety net.

## What NOT to do

- **Do not migrate by copying legacy JS into React.** The legacy template's
  JavaScript is not a spec — the backend contract and the shared component's
  own descriptor contract are. Rewrite the interaction against the shared
  components' actual properties, not by porting old DOM-manipulation code.
- **Do not move scientific validation into React.** Backend remains
  authoritative for every scientific/business rule; React only presents
  backend-validated data and backend-reported errors.
- **Do not weaken CSRF/auth to make migration easier.** If the native
  endpoint's auth model doesn't fit the shared renderer cleanly, that is a
  signal the plugin needs more backend design work, not a relaxed check.
- **Do not expose backend storage paths.** Artifacts and resources use opaque
  server-derived identities (see [security-model.md](security-model.md)) —
  migrating a template that exposed a raw file path or `?path=` parameter
  means fixing that exposure, not carrying it into the new descriptor.

## Real examples

- **RCSB PDB** is a real successful migration: float input, a scalar
  table/detail, and real backend-driven page navigation (including the
  backend's own page cap) all map cleanly onto the `query` renderer's
  existing vocabulary. See
  [examples/query-rcsb-pdb.md](examples/query-rcsb-pdb.md).
- **dbSNP** is a real example of a plugin that is *not* a good
  naive-migration candidate: its complete multi-operation variant workflow
  (multiple related operations, nested multi-section scientific results)
  does not fit the current finite scalar/table/provenance detail-section
  contract. Rather than forcing a lossy projection, it stays on
  `ServiceViewer` pending a separate, explicitly-scoped authoritative
  projection design. If your plugin looks like dbSNP — more than one
  authorized operation, or nested rather than flat sectioned results — do
  not force it through this migration path; document it as a boundary case
  the same way, rather than silently dropping scientific meaning to fit the
  contract.

## Related pages

[quickstart.md](quickstart.md) · [renderer-selection.md](renderer-selection.md) ·
[security-model.md](security-model.md) · [testing.md](testing.md) ·
[adding-a-component.md](adding-a-component.md)
