import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const source = path => readFileSync(`${import.meta.dirname}/../../${path}`, "utf8");

describe("IDE infrastructure survives removal of its standalone UI", () => {
  it.each(["docker-compose.yml", "docker-compose-release.yml", "docker-compose.release.yml"])("retains environment and Launcher service definitions in %s", file => {
    const compose = source(file);
    for (const service of ["jupyter", "rstudio", "vscode", "launcher"]) {
      expect(compose).toMatch(new RegExp(`^  ${service}:$`, "m"));
    }
  });

  it("retains nginx environment proxies and the Launcher entry point", () => {
    const nginx = source("docker/nginx-router.conf");
    for (const [service, port] of [["jupyter", 8888], ["rstudio", 8787], ["vscode", 8080]]) {
      expect(nginx).toContain(`location /${service}/`);
      expect(nginx).toContain(`${service}:${port}`);
    }
    expect(nginx).toContain("location ^~ /_svc/sdk");
    expect(nginx).toContain("launcher:5190");
  });
});
