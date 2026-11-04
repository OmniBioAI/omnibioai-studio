import { createServer } from "node:http";
import { execFile } from "node:child_process";
import { mkdir, readFile } from "node:fs/promises";
import { dirname, extname, resolve } from "node:path";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";

const run = promisify(execFile);
const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const build = resolve(root, "dist/web");
const output = resolve(root, "docs/screenshots/studio-nav-redesign");
const types = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".svg": "image/svg+xml", ".png": "image/png" };
const tools = [
  { tool_id: "fastqc", name: "FastQC", description: "Quality control for sequencing reads", tags: ["qc"], backends: ["slurm", "http"] },
  { tool_id: "flye", name: "Flye assembly", description: "Assemble long Nanopore reads", tags: ["assembly", "nanopore"], backends: ["kubernetes", "aws"] },
  { tool_id: "cellranger", name: "Cell Ranger", description: "Process single-cell RNA sequencing data", tags: ["single-cell", "rna-seq"], backends: ["slurm"] },
  { tool_id: "vep", name: "Variant effect predictor", description: "Annotate genomic variants", tags: ["annotation"], backends: ["http"] },
];
const runs = [
  { run_id: "run-fastqc-1042", tool_id: "fastqc", state: "COMPLETED" },
  { run_id: "run-flye-1043", tool_id: "flye", state: "RUNNING" },
  { run_id: "run-cellranger-1044", tool_id: "cellranger", state: "QUEUED" },
];
const adminPermissions = ["manage_config", "manage_roles", "manage_org", "manage_all_orgs", "manage_api_keys", "manage_oauth_clients", "platform.manage_infra"];
const json = (response, body) => {
  response.writeHead(200, { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" });
  response.end(JSON.stringify(body));
};

await mkdir(output, { recursive: true });
const appServer = createServer(async (request, response) => {
  const url = new URL(request.url, "http://localhost");
  if (url.pathname === "/__seed") {
    const role = url.searchParams.get("role") === "admin" ? "admin" : "beta";
    const next = url.searchParams.get("next") || "/studio";
    response.writeHead(200, { "Content-Type": "text/html", "Set-Cookie": `capture_role=${role}; Path=/; SameSite=Lax` });
    const routed = `${next}${next.includes("?") ? "&" : "?"}capture_role=${role}`;
    response.end(`<style>*{box-sizing:border-box}html,body{margin:0;width:100%;height:100%;overflow:hidden}iframe{display:block;width:100vw;height:100vh;border:0}img{display:none}</style><script>localStorage.setItem("omnibioai_access_token","SCREENSHOT-${role.toUpperCase()}");localStorage.setItem("omnibioai_host_ip","[::1]");${role === "admin" ? "setTimeout(()=>document.querySelector('iframe').contentDocument.querySelector('[data-nav-section=ADMIN] button')?.click(),1800)" : ""}</script><iframe src=${JSON.stringify(routed)}></iframe><img src="/__capture_wait">`);
    return;
  }
  if (url.pathname === "/__capture_wait") {
    setTimeout(() => { response.writeHead(200, { "Content-Type": "image/svg+xml" }); response.end("<svg xmlns='http://www.w3.org/2000/svg'/>"); }, 3500);
    return;
  }
  if (url.pathname === "/_tes/api/runs") return json(response, runs);
  if (url.pathname === "/_tes/api/tools") return json(response, tools);
  if (url.pathname === "/_health") return json(response, { status: "ok" });
  if (url.pathname.startsWith("/_svc/")) { response.writeHead(503, { "Content-Type": "application/json" }); response.end("{}"); return; }
  const candidate = resolve(build, `.${decodeURIComponent(url.pathname)}`);
  let file = candidate; let data;
  try { data = await readFile(file); }
  catch { file = resolve(build, "index.html"); data = await readFile(file); }
  if (file.endsWith("index.html")) {
    const role = url.searchParams.get("capture_role") === "admin" ? "admin" : "beta";
    const user = { userId: role === "admin" ? 1 : 2, email: role === "admin" ? "ada@example.test" : "ben@example.test", name: role === "admin" ? "Ada Lovelace" : "Ben Beta", roles: [role], permissions: role === "admin" ? adminPermissions : [] };
    const fixture = `<script>window.electronAPI={getLicense:async()=>({valid:true,expiry:"2099-12-31"})};const originalFetch=window.fetch.bind(window);window.fetch=async(input,options={})=>{const path=String(input);if(path.includes("/auth/validate"))return new Response(${JSON.stringify(JSON.stringify({ valid: true, user_id: user.userId, email: user.email, roles: user.roles, permissions: user.permissions }))},{status:200,headers:{"Content-Type":"application/json"}});if(path.endsWith("/me"))return new Response(${JSON.stringify(JSON.stringify({ first_name: user.name.split(" ")[0], organizations: [{ organization_id: 1, organization_name: "Example research" }] }))},{status:200,headers:{"Content-Type":"application/json"}});if(path.endsWith("/api/runs"))return new Response(${JSON.stringify(JSON.stringify(runs))},{status:200,headers:{"Content-Type":"application/json"}});if(path.endsWith("/api/tools"))return new Response(${JSON.stringify(JSON.stringify(tools))},{status:200,headers:{"Content-Type":"application/json"}});return originalFetch(input,options)};</script>`;
    data = Buffer.from(data.toString().replace("<head>", `<head>${fixture}`));
  }
  response.writeHead(200, { "Content-Type": types[extname(file)] || "application/octet-stream" }); response.end(data);
});
await new Promise(resolveListen => appServer.listen(0, "127.0.0.1", resolveListen));
const origin = `http://127.0.0.1:${appServer.address().port}`;

try {
  for (const role of ["beta", "admin"]) {
    for (const [name, path] of [["home", "/studio"], ["tools", "/studio/tools"], ["settings", "/studio/settings"]]) {
      await run("/usr/bin/firefox", ["--headless", "--no-remote", "--window-size", "1440,1000", "--screenshot", resolve(output, `${role}-${name}.png`), `${origin}/__seed?role=${role}&next=${encodeURIComponent(path)}`], { timeout: 30000 });
    }
  }
} finally {
  await new Promise(resolveClose => appServer.close(resolveClose));
}
