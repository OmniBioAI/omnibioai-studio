import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import vm from "node:vm";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

function loadWorkerScript({ clients, location = { origin: "https://webstudio.omnibioai.org" } }) {
  const script = fs.readFileSync(path.join(repoRoot, "public/sw-client-reload.js"), "utf8");
  const listeners = new Map();
  const context = {
    URL,
    Promise,
    self: {
      clients,
      location,
      addEventListener: (type, handler) => listeners.set(type, handler),
    },
  };
  vm.runInNewContext(script, context);
  return listeners;
}

describe("service worker client reload hook", () => {
  it("refreshes only already-controlled Studio root clients on activation", async () => {
    const navigated = [];
    const clients = {
      matchAll: async (options) => {
        expect(options).toEqual({ type: "window" });
        return [
          { url: "https://webstudio.omnibioai.org/", navigate: async (url) => navigated.push(url) },
          { url: "https://webstudio.omnibioai.org/_svc/videos/videos.json", navigate: async (url) => navigated.push(url) },
          { url: "https://example.test/", navigate: async (url) => navigated.push(url) },
          { url: "not a url", navigate: async (url) => navigated.push(url) },
          { url: "https://webstudio.omnibioai.org/workbench" },
        ];
      },
    };
    const listeners = loadWorkerScript({ clients });
    const waits = [];

    listeners.get("activate")({ waitUntil: (promise) => waits.push(promise) });
    await Promise.all(waits);

    expect(navigated).toEqual(["https://webstudio.omnibioai.org/"]);
  });

  it("does not fail activation when clients are unavailable", async () => {
    const listeners = loadWorkerScript({ clients: {} });
    const waits = [];

    listeners.get("activate")({ waitUntil: (promise) => waits.push(promise) });
    await expect(Promise.all(waits)).resolves.toEqual([undefined]);
  });
});
