# OmniBioAI Studio v0.9.2-beta — Known Issues and Limitations

## Release status

This is a beta release intended for early evaluation and feedback. It does not meet the v0.9.0 roadmap exit criteria (Trusted Tool Catalog, multi-tenancy, technical-readiness closure); that work remains open.

## Plugins

Every analysis plugin has a testkit verdict or a documented exclusion (see the release notes). A plugin's result is verified only if its testkit run passes from its own image. Plugins that pass only in-process, or that are listed below, are evaluation-only.

A disabled plugin is hidden from menus and the planner, and every run path refuses it with its reason: the plugin page, the API, workflows and the agent. A plugin is re-enabled once the cause below is fixed and its testkit run passes.

### Disabled: container image not yet published

These plugins' container images have not been published. They will be re-enabled once their image is built and tested.

clonal_evolution_phylogenetics, dia_analysis, dmr_analysis, fst_calculator, hic_analysis, hla_typing, irfinder_analysis, isoform_analysis, ld_analysis, mag_quality, methylation_qc, mutational_signatures, nanopore_qc, neoantigen_immunogenicity, protein_evolution, protein_interaction, protein_quantification, ptm_analysis, tad_caller, tcr_bcr_repertoire, vaccine_epitope_design.

### Disabled: container image being rebuilt

The published image is missing the plugin's script or one of its dependencies, so the plugin is disabled until it is rebuilt.

admixture_analysis, alpha_diversity, atac_peak_calling, beta_diversity, binding_site_predictor, counts_matrix_qc, deseq2_analysis, docking_analysis, metabolomics_peak_detect, metabolomics_sample_qc, openbabel, selection_scan, spatial_marker_identification.

- **deseq2_analysis: use rnaseq_analysis meanwhile**, which provides DESeq2.
- metabolomics_peak_detect no longer falls back to a synthetic peak list. Without its peak-picking library it now fails.

### Disabled: pending a real implementation

These plugins returned placeholder or synthetic results, or are stub implementations. They are disabled until there is a real implementation.

adv_single_cell, clinical_db_mapping, cnvkit, deep_learning_variant_classifier, drug_response_predictor, exome_analysis, explainable_ai_interpreter, gsea_enrichment, leafcutter_analysis, literature_summarizer, metabolomics_annotate, phasing_haplotype_analysis, proteomics, rare_variant_burden, read_simulator, rmats_analysis, suppa2_analysis.

**Workflow step refuses; use the plugin page.** These plugins' workflow-node executors have no backend yet, so a workflow step using them fails with a clear message. The plugin's own page, where the real tool runs, is unchanged:

- alphafold;
- chipseq_differential_binding;
- chipseq_peak_annotation;
- gene_annotation;
- omnilink_e2t;
- spliceai;
- vcf_liftover.

### Requires GPU permission (users.submit_gpu_job)

ML/GPU plugins require the GPU-job permission (`users.submit_gpu_job`), which an administrator grants per user. Without it the plugin page and the API refuse the run.

This covers the 29 machine-learning and fine-tuning plugins that request a GPU. Their results have not yet been verified by the testkit, which runs without a GPU, so treat them as evaluation-only. Several of their images are built for x86-64 only and run under emulation on ARM64 hosts.

### Requires reference data or model weights

These plugins need a large reference resource or pretrained weights that are not bundled yet. Download candidates are planned; until then the plugin fails clearly, or cannot be verified:

- **deepvariant:** needs the DeepVariant container image (x86-64 only).
- **enzyme_ec_classifier, ptm_site_predictor, protein_function_classifier_esm:** need ESM-2 protein language model weights. These also require GPU permission.
- **Fine-tuning plugins:** need their backbone model weights in the image.
- **spliceai (plugin page):** needs the SpliceAI models and a reference genome.
- **vcf_liftover (plugin page):** needs a chain file and a VCF-aware liftover tool.
- **alphafold (plugin page):** needs ColabFold, AlphaFold2 parameters and a GPU.

### Other plugin limitations

- **Images built for x86-64 only.** An ARM64 build is needed before these can be verified on ARM64 hosts: clustering, protein_language_model_finetuner, scanpy_clustering, scanpy_markers, scanpy_qc_metrics, single_cell_analysis, spatial_analysis, spatial_clustering.
- **A tool or module the plugin needs is not in its image:** circtools_runner, molecular_docking, rna_velocity_analysis, ppi_network_plot, venn_upset_plot.
- **Open defects:**
  - fastq_qc and fastq_trimmer write their run directory inside the application directory, so they fail on a read-only installation.
  - pathway_enrichment does the same, and also needs network access.
  - single_cell_loom_viewer pads its cell table to 100 rows and writes cell IDs as byte strings.
  - rnaseq_analysis declares one image tag and runs another.
- variant_annotation's annotation database location is being reworked; it cannot be verified yet.
- format_converter accepts only storage-relative paths under a user's own storage, by design, so it is not covered by the command-line testkit.
- multiomics_reasoning_agent and variant_interpretation_agent were tested before the LLM fixture existed and still need an LLM-fixture test.
- assembly_qc, metabolomics_batch_correct and metabolomics_biomarkers have testkit runners that need correcting. assembly_qc's output matched the expected value.
- The ADMET and toxicity plugins report no toxicity endpoints, only rule outcomes and structural alerts. These are screening heuristics, not a safety assessment (omnibioai-workbench#953).
- One ADMET workflow bundle remains disabled because its predictions were not reproducible (omnibioai-workflow-bundles#77).
- GWAS fits one variant at a time with no covariates and no principal components, so population structure is not corrected.
- Phenotype association without gene annotations completes with the phenotype columns unscored.
- atac_differential normalises counts per million only. A more robust normalisation is planned.
- A path-resolution helper in the plugin layer, given an absolute path that does not exist, can resolve it to a same-named file from a recent run. Avoid relying on non-existent paths being reported as errors.

## BioRepository is not ready for protected health information

Unchanged from v0.9.1-beta. Do not put PHI, or any regulated personal data, in the BioRepository in this release. The following controls are not in place yet (omnibioai-workbench#947):

- No encryption at rest for repository file storage.
- No encrypted connection between the services and the database.
- No read auditing. Writes and administrative actions are recorded; reads and downloads are not yet.
- No identifier validation in free-text fields.

Use it for reference data, derived results and non-identifiable datasets while these are open. The other BioRepository limitations listed for v0.9.1-beta still apply:

- Treat a live signed download link as a credential while it is valid.
- A full disaster-recovery exercise has not been performed.
- Typed validation covers genomics, transcriptomics and a generic type only.
- Lineage exists only for versions registered against a run.
- The DRS API has not been tested against third-party clients.

## Authentication and sessions

- The v0.8.1 desktop authentication architecture is unchanged in this release; its limitations still apply.
- The move to RS256 for platform authentication and rotation of the remaining internal service credentials are scheduled.
- Packaged HTTPS staging login has not been independently verified.
- Real operating-system keychain behavior and packaged session restoration have not been fully qualified.

Users should report authentication or session-restoration problems with relevant non-sensitive diagnostic information. Never include passwords, tokens, cookies or credentials in bug reports.

## Literature search (RAG v6)

Unchanged from v0.9.1-beta:

- A study is required for every search: `POST /v1/literature/search` without a study returns `400 invalid_request`. There is no "all studies" search in v6.
- RAG v6 does not generate answers yet. RAG+LLM answers on the Lit AI page are disabled.
- Ingest, Embed and Benchmark on the Lit AI page are disabled with the retired legacy indexes.
- Searching requires a signed-in user with dataset read permission and is rate-limited per user (`429 rate_limited` with `Retry-After`).

## Temporarily restricted APIs

Unchanged from v0.9.1-beta. These remain restricted until each one has per-user authentication:

- The format converter and workflow builder APIs are read-only.
- The multi-agent orchestrator plugin routes are read-only.
- The Benchling integration API is closed; the ServiceNow integration API is read-only.
- The genome viewer track API is unavailable.
- Audit service routes are restricted.

## Self-hosted stack

- The security-audit worker does not start unless its record-integrity key is configured.
- Database backups are written encrypted. There is no plaintext mode, and a backup fails closed when the encryption recipient is missing or invalid.
- Router access logs are rotated with a size and retention limit. Operators who ship logs elsewhere should confirm their collector handles rotation.
- JupyterLab, RStudio and VS Code rely on the router for authentication. Do not expose the IDE containers' networks or ports directly.

## Packaging and platform support

- All nine installers (Linux x64 and ARM64 AppImage, DEB and RPM; macOS Intel and Apple Silicon DMG; Windows x64 installer) are built by GitHub Actions from the `v0.9.2-beta` tag. Installation and launch have not been independently qualified on every platform.
- `SHA256SUMS-v0.9.2-beta.txt` lists all nine published installers so you can check your download.
- The macOS and Windows installers are unsigned and not notarized.
- Installation, upgrade, uninstall and rollback procedures have not all been independently verified.
- Automatic-update metadata has not been qualified; use only explicitly published, checksum-verified artifacts.

## Build and dependency notes

- Release CI builds use Node.js 20; local qualification uses Node.js 22.23.3.
- Full official Docker-backed Gitleaks history scanning remains incomplete.

## Beta expectations

This release is provided for evaluation. Users should retain backups of important data and report reproducible defects.

The beta status does not imply regulatory certification, HIPAA certification or production suitability for regulated workloads.
