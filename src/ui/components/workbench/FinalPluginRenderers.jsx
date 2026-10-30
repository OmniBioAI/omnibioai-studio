import { createGuidedPluginRenderer } from "./PriorityPluginRenderers";

const EXECUTION_STAGES = ["Provide source data", "Configure visualization", "Run workflow", "Review artifacts"];
const INFORMATION_STAGES = ["Review capability", "Inspect requirements", "Understand limitations", "Plan integration"];

function group(name, color, eyebrow, plugins, informational = true) {
  return Object.freeze({
    name, color, eyebrow, plugins,
    stages: informational ? INFORMATION_STAGES : EXECUTION_STAGES,
    outputs: informational
      ? ["Capability summary", "Configuration requirements", "Documented limitations"]
      : ["Scientific plot", "Supporting data", "Reproducible run evidence"],
    note: informational
      ? "This deployment intentionally exposes a read-only React workspace because execution is disabled by the backend descriptor."
      : "Plot inputs, parameters and generated artifacts remain linked through the authenticated Workbench lifecycle.",
  });
}

// Tuple: slug, label, icon, Studio description, backend renderer family.
export const FINAL_PLUGIN_GROUPS = Object.freeze([
  group("Clinical & Comparative Plots", "var(--accent3)", "Scientific plotting", [
    ["clonal_prevalence_plot", "Clonal Prevalence", "📊", "Plot clone prevalence", "generic_runner"],
    ["enrichment_dot_plot", "Enrichment Dot Plot", "🔵", "Plot enrichment results", "generic_runner"],
    ["forest_plot", "Forest Plot", "🌲", "Plot effect estimates", "generic_runner"],
    ["group_comparison_plot", "Group Comparison", "📈", "Compare scientific groups", "generic_runner"],
    ["kaplan_meier_plot", "Kaplan–Meier", "📉", "Plot survival evidence", "generic_runner"],
    ["karyotype_cnv_plot", "Karyotype CNV", "🧬", "Plot copy-number events", "generic_runner"],
  ], false),
  group("Mutation & Response Plots", "#a78bfa", "Scientific plotting", [
    ["mutation_lollipop_plot", "Mutation Lollipop", "🍭", "Plot protein mutations", "generic_runner"],
    ["mutation_waterfall_plot", "Mutation Waterfall", "🌊", "Plot mutation burden", "generic_runner"],
    ["oncoprint_plot", "Oncoprint", "🧬", "Plot mutation matrices", "generic_runner"],
    ["sequence_logo_plot", "Sequence Logo", "🔤", "Plot sequence conservation", "generic_runner"],
    ["swimmer_plot", "Swimmer Plot", "🏊", "Plot clinical timelines", "generic_runner"],
    ["dose_response_ic50_plot", "Dose Response", "💊", "Plot IC50 curves", "generic_runner"],
  ], false),
  group("Scientific Capability Guides", "var(--accent)", "Scientific capability guides", [
    ["openbabel", "Open Babel", "⚗️", "Review chemistry conversion", "informational"],
    ["drug_discovery_intelligence", "Drug Discovery Intelligence", "💊", "Review discovery intelligence", "informational"],
    ["europepmc", "Europe PMC", "📚", "Review literature integration", "informational"],
    ["adv_single_cell", "Advanced Single Cell", "🔬", "Review advanced analysis", "informational"],
    ["scanpy_import", "Scanpy Import", "📥", "Review AnnData import", "informational"],
    ["scanpy_qc_filter", "Scanpy QC Filter", "✅", "Review cell filtering", "informational"],
    ["cache_manager", "Cache Manager", "🗄️", "Review cache operations", "informational"],
  ]),
  group("Workflow & Cloud Integrations", "var(--accent-platform)", "Integration capability guides", [
    ["airflow", "Apache Airflow", "🌬️", "Review DAG integration", "informational"],
    ["argo_workflows", "Argo Workflows", "⛵", "Review workflow integration", "informational"],
    ["azure_blob_storage", "Azure Blob Storage", "☁️", "Review object storage integration", "informational"],
    ["azure_devops", "Azure DevOps", "🔷", "Review DevOps integration", "informational"],
    ["basespace", "Illumina BaseSpace", "🧬", "Review sequencing integration", "informational"],
  ]),
  group("Data Platform Integrations", "var(--accent2)", "Integration capability guides", [
    ["bigquery", "BigQuery", "📊", "Review warehouse integration", "informational"],
    ["box", "Box", "📦", "Review document integration", "informational"],
    ["ceph", "Ceph", "💾", "Review storage integration", "informational"],
    ["cromwell", "Cromwell", "⚙️", "Review WDL integration", "informational"],
    ["dagster", "Dagster", "🧭", "Review orchestration integration", "informational"],
  ]),
  group("Analytics & Registry Integrations", "var(--accent3)", "Integration capability guides", [
    ["databricks", "Databricks", "🧱", "Review analytics integration", "informational"],
    ["dbt", "dbt", "🔄", "Review transformation integration", "informational"],
    ["docker_hub", "Docker Hub", "🐳", "Review container registry", "informational"],
    ["galaxy", "Galaxy", "🌌", "Review bioinformatics integration", "informational"],
    ["genologics_clarity", "Clarity LIMS", "🧪", "Review LIMS integration", "informational"],
  ]),
  group("Git & Transfer Integrations", "#a78bfa", "Integration capability guides", [
    ["ghcr", "GitHub Container Registry", "📦", "Review container integration", "informational"],
    ["git_hosting", "Git Hosting", "🌿", "Review source integration", "informational"],
    ["github_actions", "GitHub Actions", "⚙️", "Review CI integration", "informational"],
    ["gitlab", "GitLab", "🦊", "Review GitLab integration", "informational"],
    ["globus", "Globus", "🌐", "Review data transfer", "informational"],
  ]),
  group("Cloud & Model Integrations", "var(--accent)", "Integration capability guides", [
    ["google_cloud_storage", "Google Cloud Storage", "☁️", "Review cloud storage", "informational"],
    ["google_drive", "Google Drive", "📁", "Review Drive integration", "informational"],
    ["harbor", "Harbor", "⚓", "Review registry integration", "informational"],
    ["hugging_face", "Hugging Face", "🤗", "Review model hub integration", "informational"],
    ["illumina_ica", "Illumina ICA", "🧬", "Review genomics cloud", "informational"],
  ]),
  group("Compute & Collaboration Integrations", "var(--accent-platform)", "Integration capability guides", [
    ["jenkins", "Jenkins", "🏗️", "Review automation integration", "informational"],
    ["kubernetes", "Kubernetes", "☸️", "Review compute integration", "informational"],
    ["metaflow", "Metaflow", "🌊", "Review ML workflow integration", "informational"],
    ["microsoft_teams", "Microsoft Teams", "💬", "Review collaboration integration", "informational"],
    ["minio", "MinIO", "🪣", "Review object storage", "informational"],
  ]),
  group("ML & Metadata Integrations", "var(--accent2)", "Integration capability guides", [
    ["mlflow", "MLflow", "🤖", "Review ML lifecycle integration", "informational"],
    ["nextcloud", "Nextcloud", "☁️", "Review file integration", "informational"],
    ["nvidia_ngc", "NVIDIA NGC", "🟢", "Review AI catalog integration", "informational"],
    ["openmetadata", "OpenMetadata", "📚", "Review metadata integration", "informational"],
    ["openstack", "OpenStack", "☁️", "Review infrastructure integration", "informational"],
  ]),
  group("Operations Integrations", "var(--accent3)", "Integration capability guides", [
    ["pagerduty", "PagerDuty", "🚨", "Review incident integration", "informational"],
    ["prefect", "Prefect", "⚙️", "Review orchestration integration", "informational"],
    ["prometheus_grafana", "Prometheus & Grafana", "📊", "Review monitoring integration", "informational"],
    ["quay", "Quay", "📦", "Review container registry", "informational"],
    ["seqera_platform", "Seqera Platform", "🧬", "Review Nextflow integration", "informational"],
  ]),
  group("Enterprise Integrations", "#a78bfa", "Integration capability guides", [
    ["servicenow", "ServiceNow", "🎫", "Review service integration", "informational"],
    ["slack", "Slack", "💬", "Review messaging integration", "informational"],
    ["slurm", "Slurm", "🖥️", "Review HPC integration", "informational"],
    ["snowflake", "Snowflake", "❄️", "Review warehouse integration", "informational"],
    ["synapse", "Synapse", "🧠", "Review research integration", "informational"],
  ]),
  group("Security & Experiment Tracking", "var(--accent)", "Integration capability guides", [
    ["vault", "Vault", "🔐", "Review secrets integration", "informational"],
    ["wandb", "Weights & Biases", "📈", "Review experiment tracking", "informational"],
  ]),
  group("Pathway & Sample References", "var(--accent-platform)", "Reference capability guides", [
    ["biocyc", "BioCyc", "🔗", "Review pathway knowledge", "informational"],
    ["biosamples", "BioSamples", "🧫", "Review sample metadata", "informational"],
    ["cellosaurus", "Cellosaurus", "🔬", "Review cell-line knowledge", "informational"],
    ["cosmic", "COSMIC", "🧬", "Review somatic mutations", "informational"],
    ["ctd", "CTD", "⚗️", "Review toxicogenomic evidence", "informational"],
  ]),
  group("Variant & Disease References", "var(--accent2)", "Reference capability guides", [
    ["dbvar", "dbVar", "🧬", "Review structural variants", "informational"],
    ["decipher", "DECIPHER", "🏥", "Review clinical variation", "informational"],
    ["dgv", "DGV", "🧬", "Review genomic variants", "informational"],
    ["diseases_db", "DISEASES", "🏥", "Review gene-disease evidence", "informational"],
    ["drugbank", "DrugBank", "💊", "Review drug knowledge", "informational"],
  ]),
  group("Gene & Genome References", "var(--accent3)", "Reference capability guides", [
    ["flybase", "FlyBase", "🪰", "Review fly genetics", "informational"],
    ["gene2phenotype", "Gene2Phenotype", "🧬", "Review disease associations", "informational"],
    ["gene_cards", "GeneCards", "🃏", "Review gene knowledge", "informational"],
    ["geo", "NCBI GEO", "📊", "Review expression studies", "informational"],
    ["guidetopharmacology", "Guide to Pharmacology", "💊", "Review pharmacology", "informational"],
  ]),
  group("Ontology & Molecular References", "#a78bfa", "Reference capability guides", [
    ["hpo", "Human Phenotype Ontology", "🌳", "Review phenotype terms", "informational"],
    ["jaspar", "JASPAR", "🧬", "Review motif knowledge", "informational"],
    ["lincs", "LINCS", "📊", "Review perturbation signatures", "informational"],
    ["massbank", "MassBank", "⚗️", "Review mass spectra", "informational"],
    ["metacyc", "MetaCyc", "🔗", "Review metabolic pathways", "informational"],
  ]),
  group("Model Organism & Clinical References", "var(--accent)", "Reference capability guides", [
    ["mgi", "Mouse Genome Informatics", "🐭", "Review mouse genetics", "informational"],
    ["mirbase", "miRBase", "🧬", "Review microRNA knowledge", "informational"],
    ["monarch", "Monarch Initiative", "🦋", "Review phenotype evidence", "informational"],
    ["oncokb", "OncoKB", "🏥", "Review cancer knowledge", "informational"],
    ["openfda", "OpenFDA", "💊", "Review regulatory data", "informational"],
  ]),
  group("Protein & Panel References", "var(--accent-platform)", "Reference capability guides", [
    ["orthodb", "OrthoDB", "🌳", "Review orthology evidence", "informational"],
    ["panelapp", "PanelApp", "🧬", "Review diagnostic panels", "informational"],
    ["pathway_commons", "Pathway Commons", "🔗", "Review pathway evidence", "informational"],
    ["pfam", "Pfam", "🧬", "Review protein families", "informational"],
    ["rgd", "Rat Genome Database", "🐀", "Review rat genetics", "informational"],
  ]),
  group("Reaction & Variant References", "var(--accent2)", "Reference capability guides", [
    ["rhea", "Rhea", "⚗️", "Review biochemical reactions", "informational"],
    ["tair", "TAIR", "🌱", "Review Arabidopsis genetics", "informational"],
    ["varcards", "VarCards", "🧬", "Review variant annotations", "informational"],
    ["varsome", "VarSome", "🧬", "Review variant knowledge", "informational"],
    ["zfin", "ZFIN", "🐟", "Review zebrafish genetics", "informational"],
  ]),
]);

const entries = FINAL_PLUGIN_GROUPS.flatMap(item => item.plugins.map(
  ([slug, label, icon, desc, renderer]) => ({ slug, label, icon, desc, renderer, group: item }),
));

export const FINAL_PLUGIN_SLUGS = Object.freeze(entries.map(({ slug }) => slug));
export const FINAL_PLUGIN_MODES = Object.freeze(Object.fromEntries(entries.map(
  ({ slug, renderer }) => [slug, renderer],
)));
export const FINAL_PLUGIN_RENDERERS = Object.freeze(Object.fromEntries(entries.map(entry => [
  entry.slug,
  createGuidedPluginRenderer({
    eyebrow: entry.group.eyebrow,
    summary: `${entry.label}: ${entry.desc}.`,
    stages: entry.group.stages,
    outputs: entry.group.outputs,
    note: entry.group.note,
  }),
])));
