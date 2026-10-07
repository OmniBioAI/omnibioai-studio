# Adding a new shared component

Read this before proposing a new field or result component. The short
version: **"one plugin needs it" is never sufficient justification.**

## Ask these first, in order

1. **Can existing components compose this UI?** Most shapes already fit
   `table`/`key_value`/`detail` composition, or a downloadable artifact — see
   [results/README.md](results/README.md) before assuming something is
   missing.
2. **Is the pattern repeated across multiple real plugins, not just one?**
   `ImageGallery` (`image_gallery`) was only built after auditing real,
   repeated evidence across a dozen-plus plugins
   (`cell_comm_visualization`, `chipseq_signal_plots`, `scanpy_qc_metrics`,
   `rnaseq_analysis`, `restriction_digest`,
   `orf_finder`, `circrna_plotter`, `venn_upset_plot`, `ml_eval_plots`,
   `manhattan_qq_plot`, `chromatin_accessibility`, `qc_plots`, plus the
   dynamic-count legacy `proteomics`). Three proposed components were
   explicitly **not** built despite looking plausible, for lack of this kind
   of evidence:
   - `ReportResult` — every sampled report-producing plugin (15+, including
     `omics_qc_report_generator`, `chipseq_report_generator`,
     `clinical_report_generator`) reduced to exactly one opaque
     HTML/PDF/Markdown artifact, already fully covered by
     `ArtifactList`/`ArtifactDownload`.
   - `StructuredResult` (a generic recursive JSON viewer) — the one shape
     that recurred (`{"n_genes":…, "n_samples":…}`-style flat summaries)
     already fits the existing `KeyValueResult`; building a generic viewer
     for arbitrary nested JSON was rejected on security grounds (see
     [security-model.md](security-model.md)) as well as evidence grounds.
   - `SequenceResult`/`TextResult` — across the whole plugin population,
     exactly **one** plugin produced a standalone sequence-like text result.
     One occurrence out of hundreds does not meet the bar.
3. **Is the contract finite?** A component's descriptor shape must be fully
   enumerable — finite choices, finite bounds, finite presentation types. If
   the honest answer is "it depends on arbitrary plugin-specific structure,"
   the component cannot be built safely; see
   [security-model.md](security-model.md).
4. **Can the backend normalize it?** Every value the frontend reads must be
   something Django can validate and bound (scalar types, bounded lists,
   allowlisted keys, server-derived `media_type`/`kind`) — never a raw
   tool-specific blob passed through unexamined.

If any answer is "no," the plugin should stay on its current renderer /
legacy `ServiceViewer` rather than receive a new component built on
insufficient evidence — see
[migration-guide.md](migration-guide.md).

## The approval checklist

Once the evidence bar above is genuinely met, a new component still needs
all of the following before merging:

- [ ] Repeated use across multiple real plugins (cite them).
- [ ] A finite, fully-enumerable descriptor schema.
- [ ] An explicit entry added to `WORKBENCH_COMPONENT_REGISTRY`
  (`src/ui/components/workbench/componentRegistry.jsx`) — never a dynamic
  resolution path.
- [ ] A security review against [security-model.md](security-model.md) — no
  new URL/path/credential surface, no new executable-metadata shape.
- [ ] Accessibility: semantic HTML, label/description/error association,
  keyboard operation, focus management (reuse `FieldShell` for fields).
- [ ] Responsive behavior at narrow widths; no truncation of scientific
  identifiers/filenames.
- [ ] Explicit scientific-content handling (long identifiers, wide tables,
  captions) documented on the component's own page.
- [ ] Backend authority preserved — the backend validates/normalizes every
  value the component will render.
- [ ] Tests: a descriptor/schema test, a backend contract test, and a
  frontend component test (see [testing.md](testing.md)).
- [ ] A documentation page following the standard template (see any page
  under [fields/](fields/README.md) or [results/](results/README.md) for the
  shape).

## Related

- [adding-a-renderer.md](adding-a-renderer.md) — the equivalent process for a
  new interaction model rather than a new primitive.
- [architecture.md](architecture.md)
