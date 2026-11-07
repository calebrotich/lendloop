const DATE_FORMAT: Intl.DateTimeFormatOptions = {
  day: "numeric",
  month: "short",
  year: "numeric",
  timeZone: "UTC",
};

/** "20 Nov 2026" or "20 Nov 2026 – 22 Nov 2026" for a range. */
export function formatRange(startDate: number, endDate: number): string {
  const start = new Intl.DateTimeFormat("en-GB", DATE_FORMAT).format(startDate);
  if (startDate === endDate) return start;
  const end = new Intl.DateTimeFormat("en-GB", DATE_FORMAT).format(endDate);
  return `${start} – ${end}`;
}

/** `YYYY-MM-DD` for a date input's `min`, in UTC to match the backend. */
export function todayInput(): string {
  return new Date().toISOString().slice(0, 10);
}
