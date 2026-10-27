import React from "react";
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import Profile from "../../src/ui/pages/Profile";
import { clearSession, getToken, logout, setSession } from "../../src/ui/lib/session";

vi.mock("../../src/ui/components/Login", () => ({ default: ({ title, description }) => <div>{title}<p>{description}</p></div> }));

const currentUser = { userId: 7, email: "session-only@test", orgId: 42 };
const identity = {
  user: { id: 7, email: "alex.chen@example.org", created_at: "2024-05-12T00:00:00Z" },
  organizations: [{ organization_id: 42, organization_name: "Genome Lab", roles: ["researcher"] }],
  global_roles: [{ id: 1, name: "platform_viewer" }],
};
const json = (body, status = 200) => new Response(JSON.stringify(body), { status });
function deferred() {
  let resolve, reject;
  const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}
function mockApi(profile = identity, subscription = { plan_name: "Academic" }) {
  return vi.spyOn(globalThis, "fetch").mockImplementation(url =>
    Promise.resolve(String(url).endsWith("/me") ? json(profile) : json(subscription)));
}
beforeEach(() => setSession("token-a"));
afterEach(() => { cleanup(); clearSession(); vi.restoreAllMocks(); });

describe("Profile", () => {
  it("renders canonical IAM identity and links organization plan management to Billing", async () => {
    const fetchMock = mockApi();
    localStorage.setItem("profile", JSON.stringify({ email: "forged@example.org" }));
    window.history.replaceState({}, "", "/studio/profile?user_id=999&email=forged@example.org");
    render(<Profile currentUser={currentUser} />);
    expect(screen.getByText("Loading profile…")).toBeInTheDocument();
    expect(await screen.findByRole("heading", { name: identity.user.email })).toBeInTheDocument();
    const planLink = screen.getByRole("link", { name: "View Organization plan" });
    expect(planLink).toHaveAttribute("href", "/studio/account/organization/billing");
    expect(screen.getByRole("img", { name: "Initials avatar" })).toHaveTextContent("AL");
    expect(screen.getByText("7")).toBeInTheDocument();
    expect(screen.getByText("May 12, 2024")).toBeInTheDocument();
    expect(screen.getByText(/Organization plan for Genome Lab is managed in Billing/)).toBeInTheDocument();
    const org = screen.getByRole("heading", { name: "Genome Lab" }).closest("li");
    expect(within(org).getByText("Organization ID: 42")).toBeInTheDocument();
    expect(within(org).getByText("Organization roles")).toBeInTheDocument();
    expect(within(org).getByText("researcher")).toBeInTheDocument();
    const globals = screen.getByRole("heading", { name: "Global roles" }).closest(".omni-card");
    expect(within(globals).getByText("platform_viewer")).toBeInTheDocument();
    expect(within(globals).queryByText("researcher")).not.toBeInTheDocument();
    expect(screen.queryByText(currentUser.email)).not.toBeInTheDocument();
    expect(screen.queryByText("forged@example.org")).not.toBeInTheDocument();
    expect(screen.queryByText(/storage|token usage|workflow.*executed|display name|username/i)).not.toBeInTheDocument();
    expect(fetchMock.mock.calls[0][0]).toMatch(/\/me$/);
    expect(fetchMock.mock.calls[0][1]).toMatchObject({ cache: "no-store", headers: { Authorization: "Bearer token-a" } });
  });

  it.each([null, undefined, "not-a-date"])("does not synthesize a member-since date (%s)", async created_at => {
    mockApi({ ...identity, user: { ...identity.user, created_at } });
    render(<Profile currentUser={currentUser} />);
    await screen.findByRole("heading", { name: identity.user.email });
    expect(screen.queryByText(/Member since|Not provided|Unavailable/)).not.toBeInTheDocument();
  });

  it("handles missing optional roles and organizations without billing requests", async () => {
    const fetchMock = mockApi({ user: identity.user });
    render(<Profile currentUser={currentUser} />);
    expect(await screen.findByText("No organization memberships.")).toBeInTheDocument();
    expect(screen.getByText("None assigned")).toBeInTheDocument();
    expect(screen.queryByText("Organization plan")).not.toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("shows all memberships and points the session organization to Billing without a plan request", async () => {
    const profile = { ...identity, organizations: [
      { organization_id: 8, organization_name: "Second Lab" }, ...identity.organizations,
    ] };
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(json(profile));
    render(<Profile currentUser={currentUser} />);
    expect(await screen.findByRole("heading", { name: "Second Lab" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Genome Lab" })).toBeInTheDocument();
    expect(screen.getByText("None assigned")).toBeInTheDocument();
    expect(screen.getByText(/Organization plan for Genome Lab is managed in Billing/)).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("uses a real membership for the Billing link when the session has no matching organization", async () => {
    mockApi();
    render(<Profile currentUser={{ ...currentUser, orgId: null }} />);
    expect(await screen.findByText(/Organization plan for Genome Lab is managed in Billing/)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "View Organization plan" })).toHaveAttribute("href", "/studio/account/organization/billing");
  });

  it.each([403, 404, 502])("keeps identity independent from former billing status %s", async status => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(json(identity));
    render(<Profile currentUser={currentUser} />);
    expect(await screen.findByRole("heading", { name: identity.user.email })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "View Organization plan" })).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("does not invent a plan name on the profile page", async () => {
    mockApi(identity, {});
    render(<Profile currentUser={currentUser} />);
    expect(await screen.findByRole("link", { name: "View Organization plan" })).toBeInTheDocument();
    expect(screen.queryByText("Academic")).not.toBeInTheDocument();
  });

  it("handles an IAM error without cached identity and retries", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockRejectedValue(new Error("offline"));
    render(<Profile currentUser={currentUser} />);
    expect(await screen.findByRole("alert")).toHaveTextContent("Couldn’t load profile");
    expect(screen.queryByText(currentUser.email)).not.toBeInTheDocument();
    fetchMock.mockImplementation(url => Promise.resolve(String(url).endsWith("/me") ? json(identity) : json({ plan_name: "Academic" })));
    fireEvent.click(screen.getByRole("button", { name: "Retry" }));
    expect(await screen.findByRole("heading", { name: identity.user.email })).toBeInTheDocument();
  });

  it("requires sign-in even in Electron and clears an expired session", async () => {
    window.api = {};
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(json({}, 401));
    const { rerender } = render(<Profile currentUser={null} />);
    expect(screen.getByText("Sign in required")).toBeInTheDocument();
    expect(fetchMock).not.toHaveBeenCalled();
    rerender(<Profile currentUser={currentUser} />);
    await waitFor(() => expect(getToken()).toBeNull());
    expect(screen.getByText("Sign in required")).toBeInTheDocument();
  });

  it("clears profile immediately on logout, before server revocation finishes", async () => {
    setSession("token-a", "refresh-a");
    const fetchMock = mockApi();
    render(<Profile currentUser={currentUser} />);
    await screen.findByRole("heading", { name: identity.user.email });
    const pending = deferred();
    fetchMock.mockReturnValue(pending.promise);
    let request;
    act(() => { request = logout(); });
    expect(screen.queryByRole("heading", { name: identity.user.email })).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "View Organization plan" })).not.toBeInTheDocument();
    expect(screen.getByText("Sign in required")).toBeInTheDocument();
    await act(async () => { pending.resolve(json({})); await request; });
  });

  it("immediately clears loaded identity and billing when the token changes", async () => {
    const fetchMock = mockApi();
    render(<Profile currentUser={currentUser} />);
    await screen.findByRole("heading", { name: identity.user.email });
    const pending = deferred();
    fetchMock.mockReturnValue(pending.promise);
    act(() => setSession("token-b"));
    expect(screen.queryByText(identity.user.email)).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "View Organization plan" })).not.toBeInTheDocument();
    expect(screen.getByText("Loading profile…")).toBeInTheDocument();
    await act(async () => pending.resolve(json({ user: { id: 8, email: "b@example.org" } })));
    expect(await screen.findByRole("heading", { name: "b@example.org" })).toBeInTheDocument();
  });

  it.each(["success", "error"])("ignores a stale IAM %s after account change", async outcome => {
    const pending = deferred();
    vi.spyOn(globalThis, "fetch").mockReturnValueOnce(pending.promise)
      .mockResolvedValue(json({ user: { id: 8, email: "b@example.org" } }));
    render(<Profile currentUser={currentUser} />);
    act(() => setSession("token-b"));
    await screen.findByRole("heading", { name: "b@example.org" });
    await act(async () => {
      if (outcome === "success") pending.resolve(json(identity));
      else pending.reject(new Error("old request failed"));
    });
    expect(screen.queryByText(identity.user.email)).not.toBeInTheDocument();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "b@example.org" })).toBeInTheDocument();
  });

  it.each([200, 401, 502])("does not start the removed profile billing request (%s)", async status => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(json(identity))
      .mockResolvedValue(json({ user: { id: 8, email: "b@example.org" } }));
    render(<Profile currentUser={currentUser} />);
    await screen.findByRole("heading", { name: identity.user.email });
    act(() => setSession("token-b"));
    await screen.findByRole("heading", { name: "b@example.org" });
    expect(getToken()).toBe("token-b");
    expect(fetchMock.mock.calls.every(([url]) => String(url).endsWith("/me"))).toBe(true);
    expect(screen.getByRole("heading", { name: "b@example.org" })).toBeInTheDocument();
  });

  it("clears data on cross-tab invalidation", async () => {
    mockApi();
    render(<Profile currentUser={currentUser} />);
    await screen.findByRole("heading", { name: identity.user.email });
    act(() => {
      localStorage.removeItem("omnibioai_access_token");
      window.dispatchEvent(new StorageEvent("storage", { key: "omnibioai_access_token" }));
    });
    expect(screen.queryByText(identity.user.email)).not.toBeInTheDocument();
    expect(screen.getByText("Sign in required")).toBeInTheDocument();
  });
});
