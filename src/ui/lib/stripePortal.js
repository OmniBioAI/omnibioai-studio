// Shared with Billing.jsx (the organization-admin billing page) and
// AccountPlan.jsx (the personal, read-mostly Account plan view) — extracted
// so this security-sensitive origin check and hand-off logic exists in
// exactly one place rather than two copies that could silently drift.
//
// Checked against URL#origin (derived by the parser from scheme+host+port,
// not the raw string), so something like "https://checkout.stripe.com@evil.example"
// — whose origin is actually evil.example — is correctly rejected rather
// than matched by a naive prefix/substring check.
const STRIPE_HOSTED_ORIGINS = new Set(["https://checkout.stripe.com", "https://billing.stripe.com"]);

export function isStripeHostedUrl(url) {
  try {
    return STRIPE_HOSTED_ORIGINS.has(new URL(url).origin);
  } catch (_) {
    return false;
  }
}

// Card data must never pass through OmniBioAI, so the only thing a caller
// ever does with a setup/portal session is hand the browser off to Stripe's
// own hosted page for it — never render it in an iframe, never fetch it
// ourselves. Guarded by isStripeHostedUrl so a compromised or misbehaving
// billing-service can't redirect the user (and their Electron app's
// shell.openExternal privilege) somewhere arbitrary.
export function openStripeUrl(url, stripeTab) {
  if (!isStripeHostedUrl(url)) {
    throw new Error("Refused to open a non-Stripe-hosted URL");
  }
  if (stripeTab) {
    if (stripeTab.closed) throw new Error("The Stripe tab was closed. Please try again.");
    // Navigate from the reserved tab without sending Studio's referrer.
    // Its opener was already severed synchronously before the API request.
    const link = stripeTab.document.createElement("a");
    link.href = url;
    link.rel = "noopener noreferrer";
    link.target = "_self";
    stripeTab.document.body.appendChild(link);
    link.click();
  } else if (window.electronAPI?.openExternal) {
    window.electronAPI.openExternal(url);
  } else if (window.api?.openExternal) {
    window.api.openExternal(url);
  } else {
    window.location.assign(url);
  }
}
