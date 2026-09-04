import React from "react";
import { render, screen, fireEvent, waitFor, cleanup, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { isElectron, getToken } = vi.hoisted(() => ({
  isElectron: vi.fn(() => false),
  getToken: vi.fn(() => "tok"),
}));
vi.mock("../../src/ui/lib/session", () => ({ isElectron, getToken }));

import Jobs from "../../src/ui/pages/Jobs";

const run1 = { run_id: "run-aaaaaaaaaaaaaaaaaaaa", tool_id: "align", state: "COMPLETED", server_id: "srv1", created_epoch: 1700000000 };
const run2 = { run_id: "run-bbbbbbbbbbbbbbbbbbbb", tool_id: "call-variants", state: "RUNNING", server_id: null, created_epoch: 0 };
const runs = [run1, run2];
const tools = [
  { tool_id: "align", http: true },
  { tool_id: "call-variants", http: false, slurm: true },
  { tool_id: "plain-tool" },
];
const servers = [
  { server_id: "srv1", adapter_type: "local", capabilities: { cpu: 4 } },
  { server_id: "srv2", adapter_type: "slurm", capabilities: null },
];

function jsonRes(body, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
}

function mockFetchByPath(handlers) {
  return vi.fn((url) => {
    for (const [suffix, respond] of handlers) {
      if (String(url).endsWith(suffix)) return Promise.resolve(respond());
    }
    return Promise.reject(new Error(`unhandled fetch: ${url}`));
  });
}

beforeEach(() => {
  isElectron.mockReturnValue(false);
  getToken.mockReturnValue("tok");
});
afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.useRealTimers(); });

describe("Jobs page", () => {
  it("loads runs, tools, and servers and renders the dashboard", async () => {
    vi.stubGlobal("fetch", mockFetchByPath([
      ["/api/runs", () => jsonRes(runs)],
      ["/api/tools", () => jsonRes(tools)],
      ["/api/servers", () => jsonRes(servers)],
    ]));
    render(<Jobs />);
    await waitFor(() => expect(screen.getByText("2", { selector: "div" })).toBeInTheDocument());
    expect(screen.getAllByText("align").length).toBeGreaterThan(0);
    expect(screen.getByText("COMPLETED")).toBeInTheDocument();
    expect(screen.getByText("RUNNING")).toBeInTheDocument();
    expect(screen.getAllByText("—").length).toBeGreaterThan(0); // run2's null server/epoch -> dashes
    // servers: one ready, one pending
    expect(screen.getByText("● ready")).toBeInTheDocument();
    expect(screen.getByText("◐ pending")).toBeInTheDocument();
    // tools: http-only, slurm-only, local fallback
    expect(screen.getByText("http")).toBeInTheDocument();
    expect(screen.getAllByText("slurm").length).toBeGreaterThan(0);
    expect(screen.getAllByText("local").length).toBeGreaterThan(0);
  });

  it("shows an error banner when loading fails, and empty states with no data", async () => {
    vi.stubGlobal("fetch", mockFetchByPath([
      ["/api/runs", () => new Response("boom", { status: 500, statusText: "Server Error" })],
      ["/api/tools", () => jsonRes([])],
      ["/api/servers", () => jsonRes([])],
    ]));
    render(<Jobs />);
    await waitFor(() => expect(screen.getByText(/500 Server Error/)).toBeInTheDocument());
    expect(screen.getByText("No servers configured")).toBeInTheDocument();
    expect(screen.getByText("No tools registered")).toBeInTheDocument();
  });

  it("shows the empty run-history state", async () => {
    vi.stubGlobal("fetch", mockFetchByPath([
      ["/api/runs", () => jsonRes([])],
      ["/api/tools", () => jsonRes([])],
      ["/api/servers", () => jsonRes([])],
    ]));
    render(<Jobs />);
    await waitFor(() => expect(screen.getByText("No runs yet — submit one above")).toBeInTheDocument());
  });

  it("opens a run's detail panel with inputs and error, then closes it", async () => {
    vi.stubGlobal("fetch", mockFetchByPath([
      ["/api/runs", () => jsonRes(runs)],
      ["/api/tools", () => jsonRes([])],
      ["/api/servers", () => jsonRes([])],
      [`/api/runs/${run1.run_id}/logs`, () => jsonRes("line one\nline two")],
      [`/api/runs/${run1.run_id}`, () => jsonRes({ ...run1, updated_epoch: 1700000100, exit_code: 0, inputs: { a: 1 }, error: { message: "oops" } })],
    ]));
    render(<Jobs />);
    await waitFor(() => expect(screen.getByText("align")).toBeInTheDocument());
    fireEvent.click(screen.getByText("align"));
    expect(await screen.findByText("Run Detail")).toBeInTheDocument();
    await waitFor(() => expect(screen.getByText(/"a": 1/)).toBeInTheDocument());
    expect(screen.getByText(/"message": "oops"/)).toBeInTheDocument();
    expect(screen.getByText(/line one/)).toBeInTheDocument();
    fireEvent.click(screen.getByText("✕"));
    await waitFor(() => expect(screen.queryByText("Run Detail")).not.toBeInTheDocument());
  });

  it("shows a logs error and renders minimal detail with no inputs/error", async () => {
    vi.stubGlobal("fetch", mockFetchByPath([
      ["/api/runs", () => jsonRes(runs)],
      ["/api/tools", () => jsonRes([])],
      ["/api/servers", () => jsonRes([])],
      [`/api/runs/${run2.run_id}/logs`, () => { throw new Error("network"); }],
      [`/api/runs/${run2.run_id}`, () => jsonRes({ ...run2 })],
    ]));
    render(<Jobs />);
    await waitFor(() => expect(screen.getByText("call-variants")).toBeInTheDocument());
    fireEvent.click(screen.getByText("call-variants"));
    await waitFor(() => expect(screen.getByText(/Error loading logs/)).toBeInTheDocument());
  });

  it("shows the 'No logs yet' placeholder when logs come back empty", async () => {
    vi.stubGlobal("fetch", mockFetchByPath([
      ["/api/runs", () => jsonRes(runs)],
      ["/api/tools", () => jsonRes([])],
      ["/api/servers", () => jsonRes([])],
      [`/api/runs/${run1.run_id}/logs`, () => jsonRes("")],
      [`/api/runs/${run1.run_id}`, () => jsonRes({ ...run1 })],
    ]));
    render(<Jobs />);
    await waitFor(() => expect(screen.getByText("align")).toBeInTheDocument());
    fireEvent.click(screen.getByText("align"));
    await waitFor(() => expect(screen.getByText("No logs yet")).toBeInTheDocument());
  });

  it("validates submit JSON, submits a new run, and resets the form", async () => {
    const fetchMock = mockFetchByPath([
      ["/api/runs", () => jsonRes(runs)],
      ["/api/tools", () => jsonRes(tools)],
      ["/api/servers", () => jsonRes([])],
      ["/api/runs/submit", () => jsonRes({ run_id: "new" })],
    ]);
    vi.stubGlobal("fetch", fetchMock);
    render(<Jobs />);
    await waitFor(() => expect(screen.getAllByText("align").length).toBeGreaterThan(0));

    fireEvent.click(screen.getByRole("button", { name: "+ Submit Run" }));
    expect(screen.getByText("Submit New Run")).toBeInTheDocument();

    const submitBtn = screen.getByRole("button", { name: "Submit" });
    expect(submitBtn).toBeDisabled(); // no tool selected yet

    const select = screen.getByDisplayValue("— select tool —");
    fireEvent.change(select, { target: { value: "align" } });
    expect(submitBtn).not.toBeDisabled();

    const [inputsBox, resourcesBox] = screen.getAllByRole("textbox").slice(-2);
    fireEvent.change(inputsBox, { target: { value: "{not json" } });
    fireEvent.click(submitBtn);
    expect(await screen.findByText(/JSON parse error/)).toBeInTheDocument();

    fireEvent.change(inputsBox, { target: { value: '{"sample":"s1"}' } });
    fireEvent.change(resourcesBox, { target: { value: '{"cpu":2}' } });
    fireEvent.click(submitBtn);
    await waitFor(() => expect(screen.queryByText("Submit New Run")).not.toBeInTheDocument());
    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining("/api/runs/submit"),
      expect.objectContaining({ method: "POST", body: expect.stringContaining("sample") })
    );

    // cancel closes the form too
    fireEvent.click(screen.getByRole("button", { name: "+ Submit Run" }));
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(screen.queryByText("Submit New Run")).not.toBeInTheDocument();
  });

  it("surfaces a submit failure without closing the form", async () => {
    vi.stubGlobal("fetch", mockFetchByPath([
      ["/api/runs", () => jsonRes([])],
      ["/api/tools", () => jsonRes(tools)],
      ["/api/servers", () => jsonRes([])],
      ["/api/runs/submit", () => new Response("nope", { status: 400, statusText: "Bad Request" })],
    ]));
    render(<Jobs />);
    await waitFor(() => expect(screen.getByText("No runs yet — submit one above")).toBeInTheDocument());
    fireEvent.click(screen.getByRole("button", { name: "+ Submit Run" }));
    fireEvent.change(screen.getByDisplayValue("— select tool —"), { target: { value: "align" } });
    fireEvent.click(screen.getByRole("button", { name: "Submit" }));
    await waitFor(() => expect(screen.getByText(/400 Bad Request/)).toBeInTheDocument());
    expect(screen.getByText("Submit New Run")).toBeInTheDocument();
  });

  it("uses the direct TES host URL under Electron instead of the /_tes proxy", async () => {
    isElectron.mockReturnValue(true);
    const fetchMock = mockFetchByPath([
      ["/api/runs", () => jsonRes([])],
      ["/api/tools", () => jsonRes([])],
      ["/api/servers", () => jsonRes([])],
    ]);
    vi.stubGlobal("fetch", fetchMock);
    render(<Jobs />);
    await waitFor(() => expect(screen.getByText("No runs yet — submit one above")).toBeInTheDocument());
    expect(fetchMock).toHaveBeenCalledWith(expect.stringContaining(":8081/api/runs"), expect.anything());
  });

  it("highlights a run row on hover and clears it back out", async () => {
    vi.stubGlobal("fetch", mockFetchByPath([
      ["/api/runs", () => jsonRes(runs)],
      ["/api/tools", () => jsonRes([])],
      ["/api/servers", () => jsonRes([])],
    ]));
    render(<Jobs />);
    await waitFor(() => expect(screen.getAllByText("align").length).toBeGreaterThan(0));
    const row = screen.getAllByText("align")[0].closest("tr");
    fireEvent.mouseEnter(row);
    expect(row.style.background).toBe("rgba(255, 255, 255, 0.02)");
    fireEvent.mouseLeave(row);
    expect(row.style.background).toBe("transparent");
  });

  it("refreshes on demand via the Refresh button", async () => {
    const fetchMock = mockFetchByPath([
      ["/api/runs", () => jsonRes([])],
      ["/api/tools", () => jsonRes([])],
      ["/api/servers", () => jsonRes([])],
    ]);
    vi.stubGlobal("fetch", fetchMock);
    render(<Jobs />);
    await waitFor(() => expect(screen.getByText("No runs yet — submit one above")).toBeInTheDocument());
    const before = fetchMock.mock.calls.length;
    fireEvent.click(screen.getByRole("button", { name: "↻ Refresh" }));
    await waitFor(() => expect(fetchMock.mock.calls.length).toBeGreaterThan(before));
  });
});
