// Vercel's financial year ends on 31 January: Q1 is Feb to Apr, Q2 May to Jul,
// Q3 Aug to Oct and Q4 Nov to Jan. The year is named after the January it ends
// in, so October 2026 is FY27 Q3.

/** Fiscal quarter for a date, e.g. "FY27 Q3". `offset` moves that many quarters forward (or back). */
export function fiscalQuarter(date = new Date(), offset = 0): string {
  // Day 15 so adding months never spills into the month after.
  const d = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + offset * 3, 15));
  const month = d.getUTCMonth(); // 0 = January
  const quarter = Math.floor(((month + 11) % 12) / 3) + 1;
  const fy = month === 0 ? d.getUTCFullYear() : d.getUTCFullYear() + 1;
  return `FY${String(fy % 100).padStart(2, "0")} Q${quarter}`;
}
