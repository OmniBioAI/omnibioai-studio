# Specialized renderers (documented boundary, not implemented)

This system intentionally does not try to represent every plugin UI. These
families are real, repeated, and were explicitly audited — each is a
documented boundary, not an oversight.

## What's out of scope today, with real examples

- **Dashboards** — N independent, simultaneously-fetched read-mostly
  widgets on one page, manual refresh only (no polling found anywhere
  sampled): `alerting`, `api_analytics`, `audit_log`, `environment_manager`,
  `file_transfer_manager`, `job_monitor`, `job_queue_manager`,
  `multiqc_wrapper`, `notification_center`, `resource_monitoring`,
  `security_dashboard`, and others. A materially different shape than one
  form → one result.
- **Multi-stage orchestration / scheduling / chat** —
  `multi_agent_bio_orchestrator`, `workflow_runner`, `workflow_scheduler`,
  `bio_agent`: DAG execution with resume/replay, cron-style scheduling, and
  conversational UI are three different interaction models from each other
  and from `async_analysis`.
- **Graph/network editors and viewers** — `workflow_builder`,
  `network_analysis`, `literature_summarizer`, `dataset_ingest`: different
  libraries (d3-force, cytoscape.js, a hand-rolled canvas editor), different
  data shapes, no shared contract. `workflow_builder` is an editable DAG
  canvas — an editor, not a viewer — and must stay specialized regardless
  of any future generalization of the others.
- **Genuinely interactive molecular/genome viewers** — `alphafold`'s NGL 3D
  viewer, `genome_viewer`'s IGV.js locus browser: real, narrow, one-off
  specialized renderers if ever built — never a plugin-descriptor-controlled
  arbitrary viewer spec.
- **A plugin that merely produces a plain image or table needs nothing
  special**, even if its own name suggests otherwise. Several
  "3D viewer"-named plugins in this codebase (`agentic_pymol`,
  `docking_pose_viewer`, `structure_visualizer`) turn out to render a plain
  matplotlib/PyMOL PNG — already fully expressible by
  [StaticPngResult](../results/static-png.md)/[ArtifactDownload](../results/artifacts.md),
  no new renderer needed. Check the actual artifact `kind`/`media_type`
  before assuming a plugin needs specialized work.
- **True external applications** — a plugin whose backend launches, stops,
  or otherwise controls a separate running application server.
  `jupyterhub` (starting a per-user notebook server via the Hub's own REST
  API) is the **only** genuine case found. An external *data* API — even a
  licensed/credentialed one (NCBI, Ensembl, Grafana's read API, Galaxy's job
  API) — is not an external application and doesn't justify keeping a
  plugin off this system; `galaxy` and `prometheus_grafana` were
  specifically reclassified as ordinary API-data connectors, and
  `omniml_studio` isn't externally connected at all (it indexes this
  repository's own local docs).

None of the above need, or should be approximated with, a generic recursive
viewer, a dashboard framework, a workflow/DAG builder, or an arbitrary
plotting-spec engine.

## The security principle

Do not solve specialized UI by letting a descriptor supply arbitrary React
component names, arbitrary JS/HTML/iframes, arbitrary Vega/Plotly specs,
arbitrary script URLs, module imports, or callbacks — see
[security-model.md](../security-model.md). Instead, a repeated specialized
interaction follows:

```text
audit real plugins -> finite renderer contract -> explicit RENDERER_REGISTRY entry
  -> backend authority -> tests -> documentation
```

See [adding-a-renderer.md](../adding-a-renderer.md) for the full checklist.

## Related

[renderer-selection.md](../renderer-selection.md),
[migration-guide.md](../migration-guide.md)
