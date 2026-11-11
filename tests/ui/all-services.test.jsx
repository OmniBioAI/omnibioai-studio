import React from "react";
import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";

const storage = vi.hoisted(() => ({ state: { status: "loading", data: null, error: "" } }));
const health = vi.hoisted(() => ({ snapshot: {}, refresh: vi.fn() }));

vi.mock("../../src/ui/lib/useStorageUsage", () => ({ useStorageUsage: () => storage.state }));
vi.mock("../../src/ui/lib/billingApi", () => ({ getSubscription: vi.fn() }));
vi.mock("../../src/ui/lib/serviceHealth", () => ({
  HEALTH_ENDPOINTS: { tes: "/_svc/tes", lims: "/_svc/lims/", rag: "/_svc/rag" },
  refreshServiceHealth: (...args) => health.refresh(...args),
  useServiceHealth: () => health.snapshot,
}));

import * as billingApi from "../../src/ui/lib/billingApi";
import AllServices, { ALL_SERVICES, matchesQuery } from "../../src/ui/pages/AllServices";
import { ADMIN_ROUTE_DEFINITIONS } from "../../src/ui/lib/adminRoutes";

const ADMIN = { userId: "a", orgId: "org-1", permissions: ["platform.manage_infra", "manage_config", "manage_api_keys"] };
const MEMBER = { userId: "m", orgId: "org-1", permissions: [] };

function groupNames() {
  return screen.getAllByRole("heading", { level: 2 }).map(heading => heading.textContent);
}

function cardsIn(groupLabel) {
  const heading = screen.getByRole("heading", { level: 2, name: new RegExp(`^${groupLabel}`) });
  return within(heading.closest("section")).getAllByRole("link").map(link => link.querySelector("strong").textContent);
}

function card(title) {
  return screen.getByRole("link", { name: new RegExp(`^${title}`) });
}

beforeEach(() => {
  storage.state = { status: "loading", data: null, error: "" };
  health.snapshot = {};
  health.refresh = vi.fn(() => new Promise(() => {}));
  billingApi.getSubscription.mockReset().mockReturnValue(new Promise(() => {}));
});

afterEach(cleanup);

describe("All services directory", () => {
  it("renders the four groups in order with their cards for an admin", () => {
    render(<AllServices currentUser={ADMIN} />);
    expect(screen.getByRole("heading", { level: 1, name: "All services" })).toBeInTheDocument();
    expect(screen.getByText("Every OmniBioAI module in one place.")).toBeInTheDocument();
    expect(groupNames()).toEqual(["Learn", "Your account", "Science and data", "OperationsAdmins only"]);
    expect(cardsIn("Learn")).toEqual(["Getting started", "Video tutorials"]);
    expect(cardsIn("Your account")).toEqual(["Membership and storage", "Billing", "API keys"]);
    expect(cardsIn("Science and data")).toEqual(["LIMS", "Model registry", "Dev Hub"]);
    expect(cardsIn("Operations")).toEqual(["Admin console", "Control center", "Platform health", "Metrics", "Neo4j browser", "Tool images"]);
    expect(screen.getByText("Your files, storage and membership")).toBeInTheDocument();
  });

  it("hides Operations and permission-gated cards for a non-admin", () => {
    render(<AllServices currentUser={MEMBER} />);
    expect(groupNames()).toEqual(["Learn", "Your account", "Science and data"]);
    expect(cardsIn("Your account")).toEqual(["Membership and storage", "Billing"]);
    expect(screen.queryByText("Admins only")).not.toBeInTheDocument();
    expect(health.refresh).not.toHaveBeenCalled();
  });

  it("shows Operations with only the cards a partial admin can open", () => {
    render(<AllServices currentUser={{ ...MEMBER, permissions: ["manage_config"] }} />);
    expect(cardsIn("Operations")).toEqual(["Tool images"]);
  });

  it("keeps each card's existing permission check", () => {
    const gated = Object.fromEntries(ALL_SERVICES.filter(item => item.permissions).map(item => [item.title, item.permissions]));
    expect(gated).toEqual({
      "API keys": ["manage_api_keys", "manage_org"],
      "Admin console": ["platform.manage_infra"],
      "Control center": ["platform.manage_infra"],
      "Platform health": ["platform.manage_infra"],
      Metrics: ["platform.manage_infra"],
      "Neo4j browser": ["platform.manage_infra"],
      "Tool images": ["manage_config"],
    });
  });

  it("filters by title and description case-insensitively and hides empty groups", () => {
    render(<AllServices currentUser={ADMIN} />);
    const search = screen.getByRole("searchbox", { name: "Search services" });
    fireEvent.change(search, { target: { value: "GRAFANA" } });
    expect(groupNames()).toEqual(["OperationsAdmins only"]);
    expect(cardsIn("Operations")).toEqual(["Metrics"]);
    fireEvent.change(search, { target: { value: "lims" } });
    expect(cardsIn("Science and data")).toEqual(["LIMS"]);
    expect(matchesQuery(ALL_SERVICES[0], "  ")).toBe(true);
  });

  it("shows the empty state when nothing matches", () => {
    render(<AllServices currentUser={MEMBER} />);
    fireEvent.change(screen.getByRole("searchbox", { name: "Search services" }), { target: { value: "metrics" } });
    expect(screen.queryAllByRole("link")).toHaveLength(0);
    expect(screen.getByRole("status")).toHaveTextContent("No services match “metrics”");
  });

  it("renders each card as one link with its canonical href", () => {
    render(<AllServices currentUser={ADMIN} />);
    const hrefs = Object.fromEntries(screen.getAllByRole("link").map(link => [link.querySelector("strong").textContent, link.getAttribute("href")]));
    expect(hrefs).toEqual({
      "Getting started": "/_svc/docs/user/getting-started/",
      "Video tutorials": "/_svc/videos",
      "Membership and storage": "/studio/account/membership-storage",
      Billing: "/studio/account/organization/billing",
      "API keys": "/studio/account/organization/api-keys",
      LIMS: "/_svc/lims/",
      "Model registry": "/_svc/modelregistry",
      "Dev Hub": "/_svc/devhub",
      "Admin console": "https://admin.omnibioai.org/?obai_theme=dark",
      "Control center": "/studio/admin/runtime/control-center",
      "Platform health": "/studio/admin/runtime/platform-health",
      Metrics: "/studio/admin/runtime/metrics",
      "Neo4j browser": "/studio/admin/runtime/neo4j",
      "Tool images": "/studio/admin/runtime/tool-images",
    });
    for (const link of screen.getAllByRole("link")) {
      expect(link.querySelectorAll("a, button, input, [tabindex]")).toHaveLength(0);
    }
  });

  // The flat list on main before the redesign: every card's event and target.
  // Admin cards (except the standalone Admin console) moved to `navigate` with
  // their admin route index, which App resolves to the same oldUrl and label.
  const MAIN_TARGETS = {
    "Getting started": { event: "open-service", detail: { url: "/_svc/docs/user/getting-started/", label: "Getting started" } },
    "Video tutorials": { event: "open-service", detail: { url: "/_svc/videos", label: "Video tutorials" } },
    LIMS: { event: "open-service", detail: { url: "/_svc/lims/", label: "LIMS" } },
    "Model registry": { event: "open-service", detail: { url: "/_svc/modelregistry", label: "Model registry" } },
    "Dev Hub": { event: "open-service", detail: { url: "/_svc/devhub", label: "Dev Hub" } },
    Billing: { event: "navigate", detail: 12 },
    "Membership and storage": { event: "navigate", detail: 32 },
    "API keys": { event: "navigate", detail: 14 },
    "Admin console": { event: "open-service", detail: { url: "https://admin.omnibioai.org/", label: "Admin console" } },
    "Control center": { event: "open-service", detail: { url: "/_svc/control/", label: "Control center" } },
    "Platform health": { event: "open-service", detail: { url: "https://control.omnibioai.org", label: "Platform health" } },
    Metrics: { event: "open-service", detail: { url: "/_svc/monitor", label: "Metrics" } },
    "Tool images": { event: "open-service", detail: { url: "/_svc/toolimages", label: "Tool images" } },
    "Neo4j browser": { event: "open-service", detail: { url: "/neo4j/browser/", label: "Neo4j browser" } },
  };
  const ADMIN_ROUTE_CARDS = { "Control center": -11, "Platform health": -12, Metrics: -13, "Tool images": -14, "Neo4j browser": -15 };

  function clickEvents(title, init) {
    const events = [];
    const record = type => event => events.push({ event: type, detail: event.detail });
    const onNavigate = record("navigate");
    const onOpen = record("open-service");
    window.addEventListener("navigate", onNavigate);
    window.addEventListener("open-service", onOpen);
    try {
      const notPrevented = fireEvent.click(card(title), init);
      return { events, notPrevented };
    } finally {
      window.removeEventListener("navigate", onNavigate);
      window.removeEventListener("open-service", onOpen);
    }
  }

  it("opens exactly main's target for every card on plain click", () => {
    render(<AllServices currentUser={ADMIN} />);
    expect(Object.keys(MAIN_TARGETS).sort()).toEqual(ALL_SERVICES.map(item => item.title).sort());
    for (const [title, target] of Object.entries(MAIN_TARGETS)) {
      const { events, notPrevented } = clickEvents(title);
      expect(notPrevented, title).toBe(false);
      const route = ADMIN_ROUTE_CARDS[title];
      if (route === undefined) {
        expect(events, title).toEqual([target]);
      } else {
        expect(events, title).toEqual([{ event: "navigate", detail: route }]);
        const definition = ADMIN_ROUTE_DEFINITIONS.find(item => item.idx === route);
        expect({ url: definition.oldUrl, label: definition.name }, title).toEqual(target.detail);
        expect(card(title).getAttribute("href"), title).toBe(definition.path);
      }
    }
  });

  it("leaves modified and non-primary clicks to the browser", () => {
    render(<AllServices currentUser={ADMIN} />);
    for (const title of Object.keys(MAIN_TARGETS)) {
      for (const init of [{ metaKey: true }, { ctrlKey: true }, { shiftKey: true }, { button: 1 }]) {
        const { events, notPrevented } = clickEvents(title, init);
        expect(events, `${title} ${JSON.stringify(init)}`).toEqual([]);
        expect(notPrevented, title).toBe(true);
      }
    }
  });

  it("shows skeletons while status data loads, without delaying the cards", () => {
    health.snapshot = {};
    render(<AllServices currentUser={ADMIN} />);
    expect(screen.getAllByRole("link")).toHaveLength(14);
    for (const title of ["Membership and storage", "Billing", "Platform health"]) {
      expect(card(title).querySelector(".service-card__skeleton")).not.toBeNull();
    }
  });

  it("fills the status slots from existing data", async () => {
    storage.state = { status: "success", data: { usedBytes: 2_500_000_000, quotaBytes: 10_000_000_000 }, error: "" };
    billingApi.getSubscription.mockResolvedValue({ plan_name: "Team" });
    health.snapshot = { tes: { state: "up" }, lims: { state: "down" }, rag: { state: "unknown" } };
    health.refresh = vi.fn(() => Promise.resolve());
    render(<AllServices currentUser={ADMIN} />);
    await act(async () => {});
    expect(billingApi.getSubscription).toHaveBeenCalledWith("org-1");
    expect(health.refresh).toHaveBeenCalledWith(["tes", "lims", "rag"]);
    expect(card("Membership and storage")).toHaveTextContent("2.5 GB of 10.0 GB used");
    expect(card("Membership and storage").querySelector(".service-card__bar > span").style.width).toBe("25%");
    expect(card("Billing")).toHaveTextContent("Team (organization)");
    expect(card("Platform health")).toHaveTextContent("1 service down");
  });

  it("summarises healthy and degraded platforms", async () => {
    health.refresh = vi.fn(() => Promise.resolve());
    health.snapshot = { tes: { state: "up" }, lims: { state: "up" } };
    const { unmount } = render(<AllServices currentUser={ADMIN} />);
    await act(async () => {});
    expect(card("Platform health")).toHaveTextContent("All 2 services up");
    unmount();
    health.snapshot = { tes: { state: "up" }, lims: { state: "degraded" } };
    render(<AllServices currentUser={ADMIN} />);
    await act(async () => {});
    expect(card("Platform health")).toHaveTextContent("1 degraded");
  });

  it("shows nothing in the status slots on error or missing data", async () => {
    storage.state = { status: "error", data: null, error: "unavailable" };
    billingApi.getSubscription.mockRejectedValue(Object.assign(new Error("nope"), { status: 404 }));
    health.refresh = vi.fn(() => Promise.resolve());
    health.snapshot = { tes: { state: "unknown" } };
    render(<AllServices currentUser={ADMIN} />);
    await act(async () => {});
    for (const title of ["Membership and storage", "Billing", "Platform health"]) {
      expect(card(title).querySelector(".service-card__status")).toBeEmptyDOMElement();
    }
  });

  it("shows no plan or storage line without an organization or allowance", async () => {
    storage.state = { status: "success", data: { usedBytes: 0, quotaBytes: null }, error: "" };
    render(<AllServices currentUser={{ ...MEMBER, orgId: undefined }} />);
    await act(async () => {});
    expect(billingApi.getSubscription).not.toHaveBeenCalled();
    expect(card("Billing").querySelector(".service-card__status")).toBeEmptyDOMElement();
    expect(card("Membership and storage").querySelector(".service-card__status")).toBeEmptyDOMElement();
  });

  it("shows → for cards that open inside Studio and ↗ only for another site", () => {
    render(<AllServices currentUser={ADMIN} />);
    const opens = Object.fromEntries(screen.getAllByRole("link").map(link => [
      link.querySelector("strong").textContent,
      link.querySelector(".service-card__arrow").getAttribute("data-opens"),
    ]));
    expect(Object.entries(opens).filter(([, value]) => value === "another-site").map(([title]) => title)).toEqual(["Admin console"]);
    expect(Object.values(opens).filter(value => value === "studio")).toHaveLength(13);
    for (const arrow of document.querySelectorAll(".service-card__arrow")) expect(arrow).toHaveAttribute("aria-hidden", "true");
  });

  it("shows a decorative magnifier inside the labelled search field", () => {
    const { container } = render(<AllServices currentUser={MEMBER} />);
    const search = screen.getByRole("searchbox", { name: "Search services" });
    const icon = container.querySelector(".all-services__search-icon");
    expect(icon).toHaveAttribute("aria-hidden", "true");
    expect(icon.parentElement).toBe(search.parentElement);
    expect(screen.getByRole("search")).toContainElement(search);
  });

  it("uses no emoji in the directory", () => {
    const { container } = render(<AllServices currentUser={ADMIN} />);
    expect(container.textContent).not.toMatch(/\p{Extended_Pictographic}/u);
  });
});
