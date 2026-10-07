# Adding a new renderer

A renderer represents a distinct, repeated **interaction model** — not
merely a different visual appearance. `table`/`key_value`/`detail` are
components *within* a renderer; a renderer is the thing that decides whether
there's a submit-and-poll lifecycle, a search-and-inspect lifecycle, or no
lifecycle at all. Before proposing a fourth renderer, read
[renderer-selection.md](renderer-selection.md) to confirm the existing three
(plus the `generic_runner` alias) genuinely don't fit.

## Documented candidates that were evaluated and NOT built

These families were audited against real plugins and explicitly left as
`ServiceViewer`/legacy, each for a reason specific to the family — not
because no one looked:

- **Dashboard** — `alerting`, `api_analytics`, `audit_log`,
  `environment_manager`, `file_transfer_manager`, `job_monitor`,
  `job_queue_manager`, `multiqc_wrapper`, `notification_center`,
  `resource_monitoring`, `security_dashboard`, and others: N independent
  read-mostly widgets on one page, manual refresh only. Real and repeated,
  but a materially different shape than one-form/one-result —
  `SPECIALIZED_RENDERER_REQUIRED`, future work.
- **Multi-stage / orchestration** — `multi_agent_bio_orchestrator`,
  `workflow_runner`, `workflow_scheduler`, `bio_agent`: DAG execution with
  resume/replay, cron-style scheduling, and conversational UI are three
  different interaction models from each other, let alone from
  `async_analysis`.
- **Graph/network** — `dataset_ingest`, `literature_summarizer`,
  `network_analysis`, `workflow_builder`: three incompatible libraries
  (d3-force, cytoscape.js, a hand-rolled canvas editor); `workflow_builder`
  is an editable canvas, not a viewer, and must stay specialized regardless
  of any future generalization.
- **Molecular/structure viewers** — `alphafold` (NGL, genuinely interactive
  3D) needs a real specialized renderer if one is ever built. By contrast,
  `agentic_pymol`, `docking_pose_viewer`, and `structure_visualizer` only
  render a plain PNG today and need **no** new renderer — they already fit
  `async_analysis` + `StaticPngResult`/`ArtifactDownload`; check what a
  plugin actually outputs before assuming it needs a specialized renderer.
- **Genome/locus viewers** — `genome_viewer` (IGV.js) is a real one-off with
  no sibling to generalize against yet.

See [renderers/specialized-renderers.md](renderers/specialized-renderers.md)
for the full list and current disposition of each.

## The security principle

Do not solve any of the above by letting a descriptor supply arbitrary React
component names, arbitrary JS/HTML/iframes, arbitrary Vega/Plotly
specifications, arbitrary script URLs, module imports, or callbacks. That
would reintroduce exactly the executable-metadata surface
[security-model.md](security-model.md) exists to close. Instead:

```text
repeated specialized interaction observed across real plugins
  -> audit real data/interaction shapes
  -> design a finite renderer contract (its own descriptor vocabulary)
  -> add an explicit RENDERER_REGISTRY entry
  -> backend authority for every value the new renderer reads
  -> tests
  -> documentation
```

## The checklist

- [ ] Repeated evidence across multiple real plugins in the same family
  (cite them, as above).
- [ ] A genuinely distinct interaction model — not a visual variant of an
  existing renderer.
- [ ] A finite descriptor vocabulary for the new renderer, following the
  same identifier/forbidden-key rules as existing schemas.
- [ ] Backend authority: every value the new renderer reads is validated
  and normalized server-side.
- [ ] Security boundary documented explicitly, matching
  [security-model.md](security-model.md)'s structure.
- [ ] Built from composition of existing shared components wherever
  possible, rather than one-off JSX.
- [ ] A `ServiceViewer` fallback remains available for any plugin in the
  family that doesn't yet meet the new contract.
- [ ] Tests: descriptor/schema, backend contract, frontend component.
- [ ] Documentation page under `renderers/`.
- [ ] A migration proof: at least one real plugin demonstrating the new
  renderer end-to-end before calling it production-ready — see
  [migration-guide.md](migration-guide.md).

## Related

- [adding-a-component.md](adding-a-component.md)
- [renderers/README.md](renderers/README.md)
