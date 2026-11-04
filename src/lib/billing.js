// Maintenance bill maths: flat size (sq ft) x rate per sq ft, plus optional fixed charges.

export const formatSqft = (n) =>
  Number(n).toLocaleString('en-IN', { maximumFractionDigits: 2 });

export const formatMoney = (n) => Number(n || 0).toLocaleString('en-IN');

// Keeps only fixed charges that have a name and an amount above zero (whole rupees).
export function cleanExtraItems(items) {
  return (items || [])
    .map((i) => ({ label: String(i.label || '').trim(), amount: Math.round(Number(i.amount) || 0) }))
    .filter((i) => i.label && i.amount > 0);
}

const key = (flat) => String(flat ?? '').trim().toLowerCase();

/**
 * One row per flat with everything the screens need.
 *  - flats:         ['A-101', 'A-102', ...]
 *  - areas:         { 'A-101': 1200, ... }   (sq ft)
 *  - rate:          rupees per sq ft per month
 *  - extraItems:    optional fixed charges [{ label, amount }]
 *  - existingBills: bills already created (to avoid billing the same flat twice for a month)
 *  - month:         '2026-11'
 *  - excluded:      Set of flats the admin unticked
 *
 * A row has `reason` = 'no_size' | 'already_billed' when the flat cannot be billed.
 * The maintenance amount is rounded to whole rupees.
 */
export function buildBillRows({ flats, areas, rate, extraItems, existingBills, month, excluded }) {
  const rateNum = Number(rate);
  const hasRate = Number.isFinite(rateNum) && rateNum > 0;
  const extras = cleanExtraItems(extraItems);
  const extrasTotal = extras.reduce((sum, i) => sum + i.amount, 0);
  const billed = new Set(
    (existingBills || []).filter((b) => b.month === month).map((b) => key(b.flat_number))
  );

  return flats.map((flat) => {
    const area = Number(areas?.[flat]) || 0;
    const reason = area <= 0 ? 'no_size' : billed.has(key(flat)) ? 'already_billed' : null;
    const maintenance = area > 0 && hasRate ? Math.round(area * rateNum) : 0;
    return {
      flat,
      area,
      maintenance,
      total: maintenance + extrasTotal,
      lineItems: [
        { label: `Maintenance (${formatSqft(area)} sq ft × ₹${rateNum}/sq ft)`, amount: maintenance },
        ...extras,
      ],
      reason,
      selected: !reason && hasRate && !excluded.has(flat),
    };
  });
}