// Public product catalog for individual memberships. This is presentation
// metadata only: billing and storage services remain authoritative for paid
// state and quota enforcement. Keep prices/allowances centralized here.
export const MEMBERSHIP_PLANS = [
  {
    id: "free",
    name: "Free",
    monthlyPrice: 0,
    storageGb: 1,
    summary: "Entry-level research features",
    checkoutAvailable: false,
  },
  {
    id: "plus",
    name: "Plus",
    monthlyPrice: 19,
    storageGb: 20,
    summary: "Expanded research capabilities",
    checkoutAvailable: false,
  },
  {
    id: "pro",
    name: "Pro",
    monthlyPrice: 49,
    storageGb: 100,
    summary: "Advanced research capabilities",
    checkoutAvailable: false,
    highlighted: true,
  },
  {
    id: "enterprise",
    name: "Enterprise",
    monthlyPrice: null,
    storageGb: null,
    summary: "Organization administration and organization-owned storage",
    checkoutAvailable: false,
  },
];

export const MEMBERSHIP_FEATURES = [
  { label: "Price", values: ["$0/month", "$19/month", "$49/month", "Custom"] },
  { label: "Personal storage", values: ["1 GB allowance", "20 GB allowance", "100 GB allowance", "Separate organization scope"] },
  { label: "Workflow access", values: ["Public workflows", "Public workflows; higher access planned", "Eligible catalog; full access planned", "Contract-defined"] },
  { label: "Execution limits", values: ["Basic (planned)", "Higher limits (planned)", "Highest individual limits (planned)", "Contract-defined"] },
  { label: "Private projects", values: ["Limited (planned)", "Included (planned)", "Included (planned)", "Contract-defined"] },
  { label: "File uploads", values: ["Browser uploads", "Browser uploads", "Browser uploads", "Contract-defined"] },
  { label: "Data transfers", values: ["Limited (planned)", "CLI included (planned)", "CLI included (planned)", "Contract-defined"] },
  { label: "Cloud connections", values: ["Not included", "Not included", "Planned", "Customer-owned storage (planned)"] },
  { label: "AI integrations", values: ["Eligible public integrations", "Expanded access planned", "Full eligible catalog planned", "Organization connections"] },
  { label: "Support", values: ["Community (planned)", "Standard (planned)", "Priority (planned)", "Contract-defined"] },
  { label: "Organization storage", values: ["Not included", "Not included", "Not included", "Separate customer-owned scope"] },
];

export function normalizeMembershipState(state) {
  if (!state || state.status !== "ready") return state || { status: "unavailable" };
  // Only a trusted USER-scoped record may mark an individual plan current.
  // An organization subscription must never grant a personal tier.
  const plan = String(state.plan || "").toLowerCase();
  if ((state.scope || state.owner_type) !== "USER" || !["free", "plus", "pro"].includes(plan)) {
    return { status: "unavailable", reason: "No authoritative individual membership record is available." };
  }
  return { ...state, plan };
}
