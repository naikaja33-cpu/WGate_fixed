// Maintenance bill maths: flat size (sq ft) x rate per sq ft, plus optional fixed charges.

export const formatSqft = (n) =>
  Number(n).toLocaleString('en-IN', { maximumFractionDigits: 2 });

export const formatMoney = (n) => Number(n || 0).toLocaleString('en-IN');

// A UPI payment link. On a phone it opens GPay, PhonePe, Paytm or whichever UPI app is chosen,
// with the payee, amount and note already filled in.
export function buildUpiLink({ upiId, payeeName, amount, note }) {
  const parts = [
    `pa=${encodeURIComponent(upiId)}`,
    `pn=${encodeURIComponent(payeeName)}`,
    `am=${Number(amount).toFixed(2)}`,
    'cu=INR',
    `tn=${encodeURIComponent(String(note || '').slice(0, 60))}`,
  ];
  return `upi://pay?${parts.join('&')}`;
}

// ---- Late fine: a flat fee added once when a bill is paid after its due date (no grace days) ----

// Today as 'yyyy-MM-dd' in the viewer's own time zone.
export const todayString = (d = new Date()) =>
  new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10);

const dueDay = (bill) => (bill?.due_date ? String(bill.due_date).slice(0, 10) : '');
const fineOf = (bill) => Math.max(0, Math.round(Number(bill?.late_fine) || 0));

// 'paid', 'overdue' (unpaid and the due date has passed) or 'pending'.
export function effectiveStatus(bill, today = todayString()) {
  if (bill?.status === 'paid') return 'paid';
  if (bill?.status === 'overdue') return 'overdue';
  const due = dueDay(bill);
  return due && due < today ? 'overdue' : 'pending';
}

// The fine that applies to an unpaid bill right now.
export function lateFineFor(bill, today = todayString()) {
  return effectiveStatus(bill, today) === 'overdue' ? fineOf(bill) : 0;
}

// The fine for paying on `paidDate` ('yyyy-MM-dd'): only when that day is after the due date.
export function fineForPayment(bill, paidDate) {
  const due = dueDay(bill);
  return due && String(paidDate) > due ? fineOf(bill) : 0;
}

// What the flat owes now (unpaid) or paid (paid), fine included.
export function amountDue(bill, today = todayString()) {
  const base = Number(bill?.amount) || 0;
  if (bill?.status === 'paid') return Number(bill.amount_paid ?? base + (Number(bill.fine_applied) || 0)) || 0;
  return base + lateFineFor(bill, today);
}

// ---- Reminders and the overdue lock ----

// Where reminders point members to pay.
export const APP_LINK = 'https://wwgate.in/#/Billing';

// Whole days past the due date (0 when paid or not yet due).
export function daysOverdue(bill, today = todayString()) {
  const due = dueDay(bill);
  if (!due || bill?.status === 'paid') return 0;
  const ms = new Date(`${today}T00:00:00`) - new Date(`${due}T00:00:00`);
  return Math.max(0, Math.round(ms / 86400000));
}

// The first day the flat is locked out if the bill stays unpaid ('yyyy-MM-dd'), or '' when the lock is off.
export function lockDateFor(bill, days) {
  const due = dueDay(bill);
  if (!due || !(days > 0)) return '';
  const d = new Date(`${due}T00:00:00`);
  d.setDate(d.getDate() + days + 1); // locked once MORE than `days` days late
  return todayString(d);
}

// True when this bill is what locks the flat out right now. The server makes the real decision;
// this only decides which notice the bill card shows.
export function isLocked(bill, days) {
  return days > 0 && bill?.status !== 'paid' && !bill?.payment_claim && !bill?.restriction_waived && daysOverdue(bill) > days;
}

// The WhatsApp message the admin sends.
export function reminderMessage(bill, { name } = {}) {
  const overdue = effectiveStatus(bill) === 'overdue';
  const month = bill.month_label || bill.month || 'maintenance';
  const due = dueDay(bill)
    ? new Date(`${dueDay(bill)}T00:00:00`).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })
    : '';
  const total = amountDue(bill);
  return [
    `Hello${name ? ` ${name}` : ''},`,
    overdue
      ? `Your maintenance bill for ${month} (Flat ${bill.flat_number}) is overdue${due ? `, it was due on ${due}` : ''}.`
      : `Your maintenance bill for ${month} (Flat ${bill.flat_number}) is due${due ? ` on ${due}` : ''}.`,
    `Amount: Rs ${total.toLocaleString('en-IN')}${overdue && lateFineFor(bill) > 0 ? ' (late fine included)' : ''}`,
    `Pay with GPay or PhonePe here: ${APP_LINK}`,
    'Thank you.',
  ].join('\n');
}

// A wa.me link that opens WhatsApp with the message ready to send. A 10-digit number is treated as Indian.
export function whatsappReminderLink(phone, text) {
  const digits = String(phone || '').replace(/\D/g, '');
  if (!digits) return '';
  const number = digits.length === 10 ? `91${digits}` : digits;
  return `https://wa.me/${number}?text=${encodeURIComponent(text)}`;
}

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