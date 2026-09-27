export const catalog = {
  schema_version: 1, total_count: 3, categories: [
    { key: "dashboard", title: "Dashboard", count: 1, plugins: [
      { slug: "ops_dashboard", title: "System Health", description: "Workers and queues", version: "1.0.0", category: "dashboard", launch_path: "/ops/" },
    ] },
    { key: "analysis", title: "Analysis", count: 2, plugins: [
      { slug: "rna", title: "RNA Analysis", description: "Transcript processing", version: "2.0", category: "analysis", launch_path: "/plugins/rna/" },
      { slug: "qc", title: "Quality Control", description: "Read checks", version: "", category: "analysis", launch_path: "/plugins/qc/" },
    ] },
  ],
};
export const catalogResponse = () => ({ ok: true, json: async () => structuredClone(catalog) });
