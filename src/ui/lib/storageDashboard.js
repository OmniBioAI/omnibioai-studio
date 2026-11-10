const UNITS = ["KB", "MB", "GB", "TB", "PB"];

// Decimal bytes, matching the membership catalog and storage API contract.
// Rounds DOWN to one decimal with exact integer math, so a size is never shown
// larger than it is (999,999,940 B is "999.9 MB", not "1000.0 MB").
export function formatStorageBytes(value) {
  if (value === null) return "—";
  if (value < 1000) return `${value} B`;
  const bytes = BigInt(Math.floor(value));
  let divisor = 1000n;
  let unit = 0;
  while (bytes >= divisor * 1000n && unit < UNITS.length - 1) {
    divisor *= 1000n;
    unit += 1;
  }
  const tenths = bytes * 10n / divisor;
  return `${tenths / 10n}.${tenths % 10n} ${UNITS[unit]}`;
}

// Share of the allowance that is used or reserved, rounded DOWN: anything held
// but under 1% reads "<1%" (never "0%"); one decimal below 10%; whole percent
// from 10%, so 99.99% reads "99%" and only a full allowance reads "100%".
// Returns null when no allowance is defined.
export function formatHeldPercent(heldBytes, quotaBytes) {
  if (!(quotaBytes > 0)) return null;
  if (!(heldBytes > 0)) return "0%";
  const tenths = BigInt(Math.floor(heldBytes)) * 1000n / BigInt(Math.floor(quotaBytes));
  if (tenths < 10n) return "<1%";
  if (tenths < 100n) return `${tenths / 10n}${tenths % 10n ? `.${tenths % 10n}` : ""}%`;
  return `${tenths / 10n}%`;
}

// Bar segments for used and reserved bytes keep this minimum width, so non-zero
// usage is never invisible however small it is against the allowance.
export const MIN_VISIBLE_SEGMENT_PX = 3;

// The API has already validated the atomic counters. Never derive an effective
// quota from the plan catalog. Above quota, scale the bar to the held bytes so
// both used and reserved remain visible; the text retains the true percentage.
export function storageSegments({ usedBytes, reservedBytes, availableBytes, quotaBytes }) {
  const held = usedBytes + reservedBytes;
  const scale = Math.max(quotaBytes || 0, held);
  return {
    percent: quotaBytes > 0 ? held / quotaBytes * 100 : null,
    parts: [
      { name: "used", bytes: usedBytes },
      { name: "reserved", bytes: reservedBytes },
      { name: "available", bytes: availableBytes || 0 },
    ].map(part => ({
      ...part,
      percent: scale > 0 ? part.bytes / scale * 100 : 0,
      minVisible: part.name !== "available" && part.bytes > 0,
    })),
  };
}
