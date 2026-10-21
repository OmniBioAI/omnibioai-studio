// Decimal bytes, matching the membership catalog and storage API contract.
export function formatStorageBytes(value) {
  if (value === null) return "Unavailable";
  if (value < 1000) return `${value} B`;
  const units = ["KB", "MB", "GB", "TB", "PB"];
  let amount = value / 1000;
  let unit = 0;
  while (amount >= 1000 && unit < units.length - 1) {
    amount /= 1000;
    unit += 1;
  }
  return `${amount.toFixed(1)} ${units[unit]}`;
}

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
    ].map(part => ({ ...part, percent: scale > 0 ? part.bytes / scale * 100 : 0 })),
  };
}
