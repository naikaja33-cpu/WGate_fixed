import { format } from 'date-fns';

const IST_MS = 330 * 60 * 1000; // India is UTC+5:30, all year

// A Date whose hours, day and month read as India time, whatever time zone the phone is set to.
export const toIST = (value = new Date()) => {
  const d = value instanceof Date ? value : new Date(value);
  return new Date(d.getTime() + IST_MS + d.getTimezoneOffset() * 60000);
};

// Show a moment in time (check-in time, created date...) in India time.
export const formatIST = (value, pattern) => format(toIST(value), pattern);

// Show a plain day such as '2026-11-19' (due date, booking date...) so it never slips to another day.
export const formatDay = (value, pattern) => {
  const m = String(value || '').match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!m) return formatIST(value, pattern);
  return format(new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3])), pattern);
};

// Today's date in India as 'yyyy-MM-dd'.
export const istToday = () => new Date(Date.now() + IST_MS).toISOString().slice(0, 10);

// The India date ('yyyy-MM-dd') of a moment in time.
export const istDayOf = (value) => new Date(new Date(value).getTime() + IST_MS).toISOString().slice(0, 10);