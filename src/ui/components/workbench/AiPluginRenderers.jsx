import { createGuidedPluginRenderer } from "./PriorityPluginRenderers";

const AI_WORKFLOWS = Object.freeze({
  agent_workflow_studio: {
    eyebrow: "Agent workflow studio",
    summary: "Validate and run a registered multi-agent graph with explicit inputs and execution context.",
    stages: ["Choose graph", "Set execution context", "Validate inputs", "Run and inspect"],
    outputs: ["Graph validation", "Execution status", "Run artifacts"],
    note: "The shared runner uses the registered executor contract; graph import and registry administration remain separate backend operations.",
    mode: "async",
  },
  bio_hypothesis_ai: {
    eyebrow: "Hypothesis generation",
    summary: "Generate candidate biological hypotheses from supplied evidence and inspect the structured reasoning output.",
    stages: ["Frame the question", "Supply evidence", "Generate candidates", "Review provenance"],
    outputs: ["Hypothesis candidates", "Evidence links", "Run artifacts"],
    note: "Treat generated hypotheses as research leads that require independent validation.",
    mode: "async",
  },
  bio_narrator_ai: {
    eyebrow: "Scientific narrative",
    summary: "Turn supplied analysis results and study context into a structured, evidence-linked scientific narrative.",
    stages: ["Provide analysis outputs", "Describe context", "Generate narrative", "Review sources"],
    outputs: ["Narrative sections", "Evidence references", "Run artifacts"],
    note: "Review all scientific claims against the underlying analyses before publication or clinical use.",
    mode: "async",
  },
  literature_summarizer: {
    eyebrow: "Literature intelligence",
    summary: "Prepare a study, ingest literature, build an evidence index, and run grounded retrieval over the resulting collection.",
    stages: ["Create or select study", "Ingest articles", "Build evidence index", "Ask and review"],
    outputs: ["Study records", "Retrieved evidence", "Grounded answer"],
    note: "Answers depend on the indexed corpus and retain source references for verification.",
    mode: "async",
  },
});

export const AI_PLUGIN_RENDERERS = Object.freeze(Object.fromEntries(
  Object.entries(AI_WORKFLOWS).map(([slug, workflow]) => [slug, createGuidedPluginRenderer(workflow)]),
));

export const AI_PLUGIN_SLUGS = Object.freeze(Object.keys(AI_WORKFLOWS));
