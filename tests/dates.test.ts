import { describe, expect, it } from "vitest";

import { ConvexError } from "convex/values";

import {
  assertLoanWindow,
  DAY_MS,
  formatDateInput,
  loanDayCount,
  loanPhase,
  overlaps,
  parseDateInput,
  startOfDay,
} from "../convex/lib/dates";

const NOW = Date.UTC(2026, 10, 7, 10, 30); // 2026-11-07T10:30Z
const DAY = (offset: number) => Date.UTC(2026, 10, 7) + offset * DAY_MS;

function codeOf(fn: () => void): string | undefined {
  try {
    fn();
    return undefined;
  } catch (error) {
    if (error instanceof ConvexError) {
      return (error.data as { code?: string }).code;
    }
    return undefined;
  }
}

describe("parseDateInput", () => {
  it("maps a date to UTC midnight", () => {
    expect(parseDateInput("2026-11-20")).toBe(Date.UTC(2026, 10, 20));
  });

  it("rejects malformed input", () => {
    for (const value of ["2026-11-2", "20-11-2026", "2026/11/20", "tomorrow", ""]) {
      expect(parseDateInput(value)).toBeNull();
    }
  });

  it("rejects impossible calendar dates instead of rolling them over", () => {
    expect(parseDateInput("2026-02-31")).toBeNull();
    expect(parseDateInput("2026-13-01")).toBeNull();
  });
});

describe("overlaps", () => {
  it("treats a shared day as an overlap", () => {
    expect(overlaps(DAY(0), DAY(2), DAY(2), DAY(4))).toBe(true);
  });

  it("is false when one window ends before the other starts", () => {
    expect(overlaps(DAY(0), DAY(2), DAY(3), DAY(4))).toBe(false);
    expect(overlaps(DAY(3), DAY(4), DAY(0), DAY(2))).toBe(false);
  });

  it("handles windows inside other windows", () => {
    expect(overlaps(DAY(0), DAY(10), DAY(4), DAY(5))).toBe(true);
  });
});

describe("assertLoanWindow", () => {
  it("accepts a same-day loan", () => {
    expect(codeOf(() => assertLoanWindow(DAY(0), DAY(0), NOW))).toBeUndefined();
  });

  it("rejects an end before the start", () => {
    expect(codeOf(() => assertLoanWindow(DAY(2), DAY(1), NOW))).toBe("VALIDATION");
  });

  it("rejects a start in the past", () => {
    expect(codeOf(() => assertLoanWindow(DAY(-1), DAY(0), NOW))).toBe("VALIDATION");
  });

  it("allows today even though midnight has passed", () => {
    expect(codeOf(() => assertLoanWindow(startOfDay(NOW), DAY(0), NOW))).toBeUndefined();
  });

  it("caps the window at 30 days", () => {
    expect(loanDayCount(DAY(0), DAY(29))).toBe(30);
    expect(codeOf(() => assertLoanWindow(DAY(0), DAY(30), NOW))).toBe("VALIDATION");
  });
});

describe("loanPhase", () => {
  const base = { startDate: DAY(0), endDate: DAY(2) };

  it("passes terminal statuses straight through", () => {
    expect(loanPhase({ ...base, status: "pending" }, NOW)).toBe("pending");
    expect(loanPhase({ ...base, status: "declined" }, NOW)).toBe("declined");
    expect(loanPhase({ ...base, status: "returned" }, NOW)).toBe("returned");
  });

  it("derives upcoming, active and overdue from the window", () => {
    expect(loanPhase({ status: "approved", startDate: DAY(2), endDate: DAY(4) }, NOW)).toBe(
      "upcoming",
    );
    expect(loanPhase({ ...base, status: "approved" }, NOW)).toBe("active");
    expect(loanPhase({ status: "approved", startDate: DAY(-5), endDate: DAY(-1) }, NOW)).toBe(
      "overdue",
    );
  });
});

describe("formatDateInput", () => {
  it("round-trips with parseDateInput", () => {
    const ms = Date.UTC(2026, 11, 1);
    expect(formatDateInput(ms)).toBe("2026-12-01");
    expect(parseDateInput(formatDateInput(ms))).toBe(ms);
  });
});
