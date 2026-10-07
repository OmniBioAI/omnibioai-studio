// Isolated production-component fixture: no App startup, telemetry, or real APIs.
import "@omnibioai/design-tokens/tokens.css";
import "@omnibioai/ui/dist/index.css";
import "../../src/index.css";
import React from "react";
import { createRoot } from "react-dom/client";
import PluginField from "../../src/ui/components/workbench/PluginField";
import PluginForm from "../../src/ui/components/workbench/PluginForm";
import QueryRenderer from "../../src/ui/components/workbench/QueryRenderer";
import { validatePluginDescriptor } from "../../src/ui/lib/pluginApi";
import ResultsTable from "../../src/ui/components/workbench/results/ResultsTable";
import PaginationControls from "../../src/ui/components/workbench/results/PaginationControls";
import ArtifactList from "../../src/ui/components/workbench/results/ArtifactList";
import "./workbench-components.css";

const field = (overrides = {}) => ({ id: "identifier", component: "text", format: "text", label: "Scientific identifier", description: "Use the complete accession or transcript identifier.", required: false, ...overrides });
const identifier = `ENST00000357654.9:BRCA1:c.${"1799_1800delinsATG".repeat(8)}`;
const columns = [
  { key: "id", label: "Transcript and variant identifier" },
  { key: "pathway", label: "Extended biological pathway description" },
  { key: "significance", label: "Scientific significance" },
  { key: "samples", label: "Large sample count" },
  { key: "verified", label: "Verification state" },
  { key: "filename", label: "Source filename" },
  { key: "literal", label: "Literal backend text" },
];
const rows = [{ id: identifier, pathway: "Homologous recombination and DNA double strand break repair in human somatic cells", significance: 1e-27, samples: "9007199254740993", verified: false, filename: `${"study_A_long_filename_".repeat(7)}.tsv`, literal: "<img src=x onerror=alert(1)>" }];
const descriptor = validatePluginDescriptor({
  schema_version: 2, renderer: "query", native_supported: true,
  plugin: { slug: "rcsb_pdb", name: "RCSB PDB", version: "1", description: "Fixed-operation query composition review", category: "reference_db" },
  inputs: [
    field({ id: "pdb_id", label: "PDB ID", description: "Optional structure accession.", placeholder: "e.g. 4HHB" }),
    field({ id: "protein_name", label: "Protein name", description: "Optional protein name search.", placeholder: "e.g. hemoglobin" }),
    field({ id: "organism", label: "Organism", description: "Optional source organism filter.", placeholder: "e.g. Homo sapiens" }),
    field({ id: "max_resolution", component: "number", format: "float", label: "Maximum resolution", description: "Optional positive resolution limit in angstroms; validated by the backend.", max: 1000, step: "any", unit: "Å", placeholder: "e.g. 2.0" }),
    field({ id: "page_size", component: "number", format: "integer", label: "Page size", description: "Maximum results requested from the backend (1–100).", default: 20, min: 1, max: 100, step: 1 }),
  ],
  outputs: [], capabilities: { query: true, detail: true },
  endpoints: { query: "/plugins/rcsb_pdb/api/ui-query/", detail: "/plugins/rcsb_pdb/api/ui-detail/{detail_id}/" },
  result: { presentation: "table", rows_path: "results", row_key: "pdb_id", detail_key: "pdb_id", columns: [{ key: "pdb_id", label: "PDB ID" }, { key: "score", label: "Score" }] },
  pagination: { component: "pagination", mode: "page" },
  filters: { component: "filters", title: "Structure filters", field_ids: ["organism", "max_resolution"] },
  detail: { component: "detail", title: "Structure detail", sections: [
    { id: "identity", title: "Structure identity", presentation: "scalar", fields: [
      { key: "pdb_id", label: "PDB ID" }, { key: "title", label: "Title" },
      { key: "experimental_method", label: "Experimental method" }, { key: "resolution_angstrom", label: "Resolution (Å)" },
    ] },
    { id: "authors", title: "Primary citation authors", presentation: "table", optional: true,
      row_key: "position", max_rows: 100, columns: [{ key: "position", label: "Order" }, { key: "author", label: "Author" }] },
    { id: "primary_references", title: "Primary citation references", presentation: "references", optional: true,
      reference_types: ["doi", "pubmed"], max_items: 2 },
    { id: "provenance", title: "Provenance", presentation: "provenance", fields: [
      { key: "source", label: "Source database" }, { key: "retrieved_at", label: "Retrieved at" },
    ] },
  ] },
}, "rcsb_pdb");
const page = { mode: "page", page: 1, page_size: 10, total_items: 25, has_previous: false, has_next: true };
const artifactId = `art_${"A".repeat(43)}`;
const artifacts = [{
  artifact_id: artifactId,
  display_name: "single_cell_cluster_markers_condition_2_vs_21_with_complete_transcript_identifiers.tsv",
  label: "Single-cell cluster markers for condition 2 versus condition 21",
  media_type: "text/tab-separated-values",
  size_bytes: 987654321,
  kind: "table",
}];

function Fixture() {
  const [values, setValues] = React.useState({});
  const [submitted, setSubmitted] = React.useState(false);
  const [currentPage, setCurrentPage] = React.useState(1);
  const pagination = { ...page, page: currentPage, has_previous: currentPage > 1, has_next: currentPage < 3 };
  return <main className="review-page">
    <h1>Workbench shared scientific components</h1>
    <p className="review-intro">Production review with full scientific values, both color themes, and keyboard interaction.</p>
    <section className="review-panel" aria-labelledby="fields-heading">
      <h2 id="fields-heading">Fields</h2>
      <PluginForm inputs={[
        field({ required: true, default: identifier }),
        field({ id: "notes", component: "textarea", label: "Multiline scientific notes", description: "Multiline values remain complete and editable.", default: ">ENST00000357654.9\nACGTACGT\nTGACTGAC" }),
        field({ id: "distance", component: "number", format: "float", label: "Distance", description: "The backend validates scientific suitability.", default: 1e-7, min: 0, max: 10, step: "any", unit: "nm" }),
        field({ id: "count", component: "number", format: "integer", label: "Result count", description: "The server enforces the requested result bound.", default: 20, min: 1, max: 100, step: 1 }),
        field({ id: "include_regulatory", component: "checkbox", format: "boolean", label: "Include regulatory-region consequences with complete transcript context", description: "A deterministic scientific boolean; unchecked is submitted as false.", default: false, multiple: false }),
        field({ id: "annotation_sources", component: "multiselect", format: "text", label: "Annotation sources", description: "Choose multiple fixed sources. Use platform multiple-selection keys where needed.", required: true, multiple: true,
          choices: [
            { value: "ensembl_vep", label: "Ensembl Variant Effect Predictor with complete transcript annotations" },
            { value: "clinvar", label: "ClinVar clinical significance and review-status annotations" },
            { value: "gnomad", label: "gnomAD population allele-frequency annotations" },
          ], default: ["ensembl_vep", "clinvar"] }),
      ]} values={values} onValueChange={(id, value) => setValues(previous => ({ ...previous, [id]: value }))}
        onSubmit={event => { event.preventDefault(); setSubmitted(true); }} submitLabel="Validate presentation" />
      {submitted && <p role="status">Inputs accepted for backend validation.</p>}
      <PluginField input={field({ id: "invalid", label: "Invalid identifier" })} value="INVALID" error="This identifier is not supported for the selected organism." />
      <PluginField input={field({ id: "disabled", label: "Unavailable input" })} value="Temporarily unavailable" disabled />
      <PluginField input={field({ id: "readonly", label: "Read-only accession" })} value={identifier} readOnly />
    </section>
    <section className="review-panel" aria-labelledby="table-heading">
      <h2 id="table-heading">Scientific results</h2>
      <ResultsTable caption="Scientific results" columns={columns} rows={rows} rowKey="id" />
      <PaginationControls pagination={pagination} onNavigate={direction => setCurrentPage(previous => previous + (direction === "next" ? 1 : -1))} />
    </section>
    <section className="review-panel" aria-labelledby="states-heading">
      <h2 id="states-heading">Result and pagination states</h2>
      <ResultsTable caption="Empty results" columns={columns} rows={[]} />
      <ResultsTable caption="Pending results" columns={columns} rows={[]} loading />
      <ResultsTable caption="Failed results" columns={columns} rows={[]} error="The backend could not complete this query. Try again." />
      <PaginationControls pagination={page} loading />
      <PaginationControls pagination={{ ...page, page: 3, has_previous: true, has_next: false }} disabled />
    </section>
    <section className="review-panel" aria-labelledby="artifacts-heading" data-testid="artifact-review">
      <h2 id="artifacts-heading">Downloadable artifacts</h2>
      <ArtifactList artifacts={artifacts} pluginSlug="deseq2_analysis" runId="run-scientific-1" />
    </section>
    <section className="review-panel" aria-labelledby="query-heading" data-testid="query-review">
      <h2 id="query-heading">Query composition</h2>
      <QueryRenderer descriptor={descriptor} />
    </section>
  </main>;
}

createRoot(document.getElementById("root")).render(<Fixture />);
