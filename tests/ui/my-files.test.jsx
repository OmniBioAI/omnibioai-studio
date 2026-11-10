import React from "react";
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const session = vi.hoisted(() => ({ token: "user-5-token", version: 1, listeners: new Set() }));
vi.mock("../../src/ui/lib/session", () => ({
  getToken: () => session.token,
  getSessionVersion: () => session.version,
  isElectron: () => false,
  onSessionChange: callback => { session.listeners.add(callback); return () => session.listeners.delete(callback); },
}));
import MyFiles from "../../src/ui/components/MyFiles";
import AccountMembershipStorage from "../../src/ui/pages/AccountMembershipStorage";
import { deleteMyFile, listMyFiles, myFileDownloadUrl, normalizeMyFile } from "../../src/ui/lib/myFilesApi";

const ID_A = "7b4d7e91-29e3-487b-8e06-473cb1470023";
const ID_B = "11111111-2222-4333-8444-555555555555";
const SHA = "940d6cbf39ca846de2dd8ecf8cd67d73e5db7efff97843dc58996039398a36b2";
const FILES_URL = "/_svc/workbench/api/storage/me/files";
const usage = {
  owner_type: "USER", owner_id: "5", used_bytes: 60, reserved_bytes: 0, available_bytes: 999999940,
  quota_bytes: 1000000000, membership_plan: "free", over_quota: false, quota_mode: "audit",
  enforcement_active: false, entitlement_status: "fresh",
};
const fileRow = (overrides = {}) => ({
  id: ID_A, name: "registry-proof-20261110.csv", size_bytes: 60, created_at: "2026-11-10T06:57:47Z",
  source: "data_manager_user_upload", source_label: "Data Manager upload", checksum: SHA,
  checksum_algorithm: "sha256", organization_id: "1", organization_name: "Acme Lab",
  download_allowed: true, deleting: false, ...overrides,
});
const listBody = (files = [fileRow()], extra = {}) => ({ files, total_count: files.length, total_bytes: 60, limit: 20, offset: 0, active_organization: null, ...extra });
const reply = (body, status = 200) => ({ ok: status >= 200 && status < 300, status, json: async () => body });

let routes;
function serve() {
  vi.spyOn(globalThis, "fetch").mockImplementation(async (url, options = {}) => {
    const method = options.method || "GET";
    for (const [match, handler] of routes) {
      if (match(String(url), method)) return handler(String(url), options);
    }
    throw new Error(`unexpected ${method} ${url}`);
  });
}
const isList = (url, method) => method === "GET" && url.startsWith(`${FILES_URL}?`);
const isDelete = (url, method) => method === "DELETE" && url.startsWith(`${FILES_URL}/`);
const isUsage = (url, method) => method === "GET" && url.endsWith("/api/storage/me/usage");
const calls = predicate => fetch.mock.calls.filter(([url, options = {}]) => predicate(String(url), options.method || "GET"));

beforeEach(() => {
  session.token = "user-5-token"; session.version = 1;
  routes = [[isList, () => reply(listBody())], [isUsage, () => reply(usage)]];
  serve();
});
afterEach(() => { cleanup(); vi.restoreAllMocks(); session.listeners.clear(); });

describe("My files list", () => {
  it("lists name, size, created, source and checksum through the workbench route with the bearer token", async () => {
    render(<MyFiles />);
    const row = (await screen.findByRole("rowheader", { name: "registry-proof-20261110.csv" })).closest("tr");
    expect(within(row).getByText("60 B")).toBeInTheDocument();
    expect(within(row).getByText("Data Manager upload")).toBeInTheDocument();
    expect(within(row).getByText(`sha256:${SHA.slice(0, 12)}…`)).toHaveAttribute("title", `sha256: ${SHA}`);
    expect(within(row).getByText((_, el) => el?.tagName === "TIME")).toHaveAttribute("datetime", "2026-11-10T06:57:47Z");
    const [[url, options]] = calls(isList);
    expect(url).toBe(`${FILES_URL}?sort=created&dir=desc&limit=20&offset=0`);
    expect(options).toEqual(expect.objectContaining({
      method: "GET", credentials: "same-origin", cache: "no-store",
      headers: { Accept: "application/json", Authorization: "Bearer user-5-token" },
    }));
    expect(url).not.toMatch(/user|owner|tenant|path/);
  });

  it("downloads through a same-origin link without fetching the file into memory", async () => {
    render(<MyFiles />);
    const link = await screen.findByRole("link", { name: "Download registry-proof-20261110.csv" });
    expect(link).toHaveAttribute("href", `${FILES_URL}/${ID_A}/download`);
    expect(link).toHaveAttribute("download", "registry-proof-20261110.csv");
    expect(calls(url => url.includes("/download"))).toHaveLength(0);
    expect(myFileDownloadUrl(ID_A)).toBe(`${FILES_URL}/${ID_A}/download`);
  });

  it("shows unnamed files and files whose download is not allowed", async () => {
    routes[0] = [isList, () => reply(listBody([fileRow({ name: null, checksum: null, download_allowed: false })]))];
    render(<MyFiles />);
    expect(await screen.findByText("Unnamed file", { selector: "em" })).toBeInTheDocument();
    expect(screen.getByText("Download unavailable")).toBeInTheDocument();
    expect(screen.queryByRole("link")).not.toBeInTheDocument();
    expect(screen.getByText("—")).toBeInTheDocument();
  });

  it("sorts by a column and toggles direction, resetting to the first page", async () => {
    render(<MyFiles />);
    await screen.findByRole("rowheader", { name: "registry-proof-20261110.csv" });
    expect(screen.getByRole("columnheader", { name: /Created/ })).toHaveAttribute("aria-sort", "descending");
    fireEvent.click(screen.getByRole("button", { name: "Name" }));
    await waitFor(() => expect(calls(isList).at(-1)[0]).toContain("sort=name&dir=asc"));
    expect(screen.getByRole("columnheader", { name: /Name/ })).toHaveAttribute("aria-sort", "ascending");
    fireEvent.click(screen.getByRole("button", { name: /Name/ }));
    await waitFor(() => expect(calls(isList).at(-1)[0]).toContain("sort=name&dir=desc"));
    fireEvent.click(screen.getByRole("button", { name: "Size" }));
    await waitFor(() => expect(calls(isList).at(-1)[0]).toContain("sort=size&dir=desc&limit=20&offset=0"));
  });

  it("paginates with Previous and Next", async () => {
    const page = offset => Array.from({ length: offset === 0 ? 20 : 5 }, (_, index) => fileRow({
      id: `00000000-0000-4000-8000-${String(offset + index).padStart(12, "0")}`, name: `file-${offset + index}.csv`,
    }));
    routes[0] = [isList, url => {
      const offset = Number(new URL(url, "http://x").searchParams.get("offset"));
      return reply(listBody(page(offset), { total_count: 25 }));
    }];
    render(<MyFiles />);
    await screen.findByText("1–20 of 25");
    expect(screen.getByRole("button", { name: "Previous" })).toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: "Next" }));
    await screen.findByText("21–25 of 25");
    expect(calls(isList).at(-1)[0]).toContain("offset=20");
    expect(screen.getByRole("button", { name: "Next" })).toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: "Previous" }));
    await screen.findByText("1–20 of 25");
  });

  it("shows loading, then the empty state", async () => {
    let release;
    routes[0] = [isList, () => new Promise(resolve => { release = () => resolve(reply(listBody([]))); })];
    render(<MyFiles />);
    expect(screen.getByRole("status")).toHaveTextContent("Loading your files…");
    await act(async () => release());
    expect(await screen.findByText(/No files yet/)).toBeInTheDocument();
  });

  it("shows 'Storage temporarily unavailable' on 503 and retries", async () => {
    let status = 503;
    routes[0] = [isList, () => reply({ code: "STORAGE_BACKEND_UNAVAILABLE" }, status)];
    render(<MyFiles />);
    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent("Storage temporarily unavailable");
    status = 200;
    routes[0] = [isList, () => reply(listBody())];
    fireEvent.click(within(alert).getByRole("button", { name: "Retry" }));
    expect(await screen.findByRole("rowheader", { name: "registry-proof-20261110.csv" })).toBeInTheDocument();
  });

  it.each([[401, "Sign in again"], [403, "denied"], [500, "failed to load"], [429, "Too many requests"]])(
    "shows an error for HTTP %s without showing a payload", async (status, text) => {
      routes[0] = [isList, () => reply(listBody([fileRow({ name: "someone-else.csv" })]), status)];
      render(<MyFiles />);
      expect(await screen.findByRole("alert")).toHaveTextContent(text);
      expect(screen.queryByText("someone-else.csv")).not.toBeInTheDocument();
    });

  it("rejects a malformed list payload", async () => {
    routes[0] = [isList, () => reply({ files: [{ id: "../etc", name: "x" }], total_count: 1, total_bytes: 1 })];
    render(<MyFiles />);
    expect(await screen.findByRole("alert")).toHaveTextContent("Couldn’t load your files");
  });

  it("drops a response that arrives after the session changed", async () => {
    let release;
    routes[0] = [isList, () => new Promise(resolve => { release = () => resolve(reply(listBody())); })];
    render(<MyFiles />);
    session.token = "user-6-token"; session.version = 2;
    await act(async () => release());
    expect(screen.queryByText("registry-proof-20261110.csv")).not.toBeInTheDocument();
  });
});

describe("My files delete", () => {
  it("asks for confirmation; Cancel sends nothing", async () => {
    render(<MyFiles />);
    fireEvent.click(await screen.findByRole("button", { name: "Delete registry-proof-20261110.csv" }));
    const dialog = screen.getByRole("alertdialog");
    expect(dialog).toHaveTextContent("Delete registry-proof-20261110.csv?");
    expect(dialog).toHaveTextContent("If it backs a dataset version, you’ll be asked to confirm again.");
    fireEvent.click(within(dialog).getByRole("button", { name: "Cancel" }));
    expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument();
    expect(calls(isDelete)).toHaveLength(0);
  });

  it("deletes, shows Deleting…, then reloads the list and refreshes usage", async () => {
    let release;
    routes.unshift([isDelete, () => new Promise(resolve => { release = () => resolve(reply({ status: "deleted", id: ID_A, total_bytes: 0 })); })]);
    const onChanged = vi.fn();
    render(<MyFiles onChanged={onChanged} />);
    fireEvent.click(await screen.findByRole("button", { name: "Delete registry-proof-20261110.csv" }));
    fireEvent.click(within(screen.getByRole("alertdialog")).getByRole("button", { name: "Delete file" }));
    expect(await screen.findByText("Deleting…")).toBeInTheDocument();
    const [[url, options]] = calls(isDelete);
    expect(url).toBe(`${FILES_URL}/${ID_A}`);
    expect(options.headers).toEqual({ Accept: "application/json", Authorization: "Bearer user-5-token" });
    routes[1] = [isList, () => reply(listBody([]))];
    await act(async () => release());
    expect(await screen.findByText(/No files yet/)).toBeInTheDocument();
    expect(onChanged).toHaveBeenCalledTimes(1);
  });

  it("warns when the file backs dataset versions and sends the confirmation only after a second yes", async () => {
    routes.unshift([isDelete, url => url.endsWith("?confirm=dataset_unlink")
      ? reply({ status: "deleted", id: ID_A, total_bytes: 0 })
      : reply({ code: "dataset_linked", message: "This file backs dataset versions",
        datasets: [{ dataset_id: "d1", name: "Cohort A", version: 2 }, { dataset_id: "d2", name: null, version: null }] }, 409)]);
    render(<MyFiles />);
    fireEvent.click(await screen.findByRole("button", { name: "Delete registry-proof-20261110.csv" }));
    fireEvent.click(within(screen.getByRole("alertdialog")).getByRole("button", { name: "Delete file" }));
    const warning = await screen.findByRole("alertdialog", { name: "This file backs dataset versions" });
    expect(warning).toHaveTextContent("Cohort A (version 2)");
    expect(warning).toHaveTextContent("Unnamed dataset");
    expect(calls(isDelete)).toHaveLength(1);
    fireEvent.click(within(warning).getByRole("button", { name: "Delete file and unlink datasets" }));
    await waitFor(() => expect(calls(isDelete)).toHaveLength(2));
    expect(calls(isDelete)[1][0]).toBe(`${FILES_URL}/${ID_A}?confirm=dataset_unlink`);
    await waitFor(() => expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument());
  });

  it("keeps the row with a Retry when a delete fails with 503, and the retry succeeds", async () => {
    let status = 503;
    routes.unshift([isDelete, () => status === 503 ? reply({ code: "STORAGE_BACKEND_UNAVAILABLE" }, 503)
      : reply({ status: "deleted", id: ID_A, total_bytes: 0 })]);
    const onChanged = vi.fn();
    render(<MyFiles onChanged={onChanged} />);
    fireEvent.click(await screen.findByRole("button", { name: "Delete registry-proof-20261110.csv" }));
    fireEvent.click(within(screen.getByRole("alertdialog")).getByRole("button", { name: "Delete file" }));
    expect(await screen.findByText(/Storage temporarily unavailable\. The file was not deleted/)).toBeInTheDocument();
    expect(onChanged).not.toHaveBeenCalled();
    status = 200;
    fireEvent.click(screen.getByRole("button", { name: "Retry deleting registry-proof-20261110.csv" }));
    await waitFor(() => expect(onChanged).toHaveBeenCalledTimes(1));
  });

  it("shows a file already being deleted on the server as Deleting… with Retry", async () => {
    routes[0] = [isList, () => reply(listBody([fileRow({ deleting: true, download_allowed: false })]))];
    routes.unshift([isDelete, () => reply({ status: "deleted", id: ID_A, total_bytes: 0 })]);
    render(<MyFiles />);
    expect(await screen.findByText("Deleting…")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /^Delete / })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Retry deleting registry-proof-20261110.csv" }));
    await waitFor(() => expect(calls(isDelete)).toHaveLength(1));
  });

  it.each([[404, "no longer exists"], [403, "can only be deleted from Studio", { code: "origin_not_allowed" }], [409, "can’t be deleted right now"], [500, "Delete failed."]])(
    "explains a failed delete (HTTP %s)", async (status, text, body = {}) => {
      routes.unshift([isDelete, () => reply(body, status)]);
      render(<MyFiles />);
      fireEvent.click(await screen.findByRole("button", { name: "Delete registry-proof-20261110.csv" }));
      fireEvent.click(within(screen.getByRole("alertdialog")).getByRole("button", { name: "Delete file" }));
      expect(await screen.findByText(text, { exact: false })).toBeInTheDocument();
    });

  it("goes back a page when the last row of a later page is deleted", async () => {
    const id = n => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
    let remaining = 21;
    routes[0] = [isList, url => {
      const offset = Number(new URL(url, "http://x").searchParams.get("offset"));
      const files = Array.from({ length: Math.max(0, Math.min(20, remaining - offset)) }, (_, i) => fileRow({ id: id(offset + i), name: `f${offset + i}.csv` }));
      return reply(listBody(files, { total_count: remaining }));
    }];
    routes.unshift([isDelete, () => { remaining = 20; return reply({ status: "deleted", id: id(20), total_bytes: 0 }); }]);
    render(<MyFiles />);
    await screen.findByText("1–20 of 21");
    fireEvent.click(screen.getByRole("button", { name: "Next" }));
    fireEvent.click(await screen.findByRole("button", { name: "Delete f20.csv" }));
    fireEvent.click(within(screen.getByRole("alertdialog")).getByRole("button", { name: "Delete file" }));
    expect(await screen.findByText("1–20 of 20")).toBeInTheDocument();
  });
});

describe("Account → Membership & storage", () => {
  it("places My files between the storage summary and the plan cards, and refreshes usage after a delete", async () => {
    routes.unshift([isDelete, () => reply({ status: "deleted", id: ID_A, total_bytes: 0 })]);
    const { container } = render(<AccountMembershipStorage currentUser={{ id: 5 }} />);
    await screen.findByRole("rowheader", { name: "registry-proof-20261110.csv" });
    await screen.findByText("Membership: Free");
    const order = ["#storage-summary-heading", "#my-files-heading", "#storage-plans-heading"]
      .map(selector => container.querySelector(selector));
    expect(order.every(Boolean)).toBe(true);
    expect(order[0].compareDocumentPosition(order[1]) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(order[1].compareDocumentPosition(order[2]) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    const usageCalls = calls(isUsage).length;
    fireEvent.click(screen.getByRole("button", { name: "Delete registry-proof-20261110.csv" }));
    fireEvent.click(within(screen.getByRole("alertdialog")).getByRole("button", { name: "Delete file" }));
    await waitFor(() => expect(calls(isUsage).length).toBeGreaterThan(usageCalls));
  });
});

describe("myFilesApi", () => {
  it("validates arguments and payloads", async () => {
    await expect(listMyFiles({ sort: "owner" })).rejects.toMatchObject({ code: "invalid" });
    await expect(listMyFiles({ limit: 0 })).rejects.toMatchObject({ code: "invalid" });
    await expect(deleteMyFile("../../other")).rejects.toMatchObject({ code: "invalid" });
    expect(() => myFileDownloadUrl("not-a-uuid")).toThrow("invalid");
    expect(() => normalizeMyFile(fileRow({ size_bytes: -1 }))).toThrow("invalid");
    expect(() => normalizeMyFile(fileRow({ created_at: "never" }))).toThrow("invalid");
    expect(() => normalizeMyFile([])).toThrow("invalid");
    expect(normalizeMyFile(fileRow({ id: ID_B, checksum: "" })).checksumAlgorithm).toBeNull();
  });

  it("maps a network failure to unavailable and passes aborts through", async () => {
    routes[0] = [isList, () => { throw new TypeError("network"); }];
    await expect(listMyFiles()).rejects.toMatchObject({ code: "unavailable" });
    routes[0] = [isList, () => { throw Object.assign(new Error("aborted"), { name: "AbortError" }); }];
    await expect(listMyFiles()).rejects.toMatchObject({ name: "AbortError" });
  });
});
