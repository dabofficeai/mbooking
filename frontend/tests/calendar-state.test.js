import test from "node:test";
import assert from "node:assert/strict";

import {
  CalendarBookingState,
  PRICE_PER_DAY_INR,
  PRICE_PER_DAY_PAISE,
  addDaysIso,
  buildCalendarWindow,
  isDateInWindow,
} from "../js/calendar-state.js";

test("buildCalendarWindow generates exactly 30 consecutive days starting today", () => {
  const start = "2026-11-19";
  const days = buildCalendarWindow(start, 30);
  assert.equal(days.length, 30);
  assert.equal(days[0].iso, "2026-11-19");
  assert.equal(days[0].isToday, true);
  assert.equal(days[29].iso, "2026-12-18");
  assert.equal(days[29].isToday, false);
});

test("isDateInWindow rejects past dates and day 31+", () => {
  const start = "2026-11-19";
  assert.equal(isDateInWindow("2026-11-18", start, 30), false);
  assert.equal(isDateInWindow("2026-11-19", start, 30), true);
  assert.equal(isDateInWindow("2026-12-18", start, 30), true);
  assert.equal(isDateInWindow("2026-12-19", start, 30), false);
});

test("CalendarBookingState computes ₹100 * N pricing and syncs same-item mode", () => {
  const start = "2026-11-19";
  const state = new CalendarBookingState(start, 30);

  state.toggleDate("2026-11-19");
  state.toggleDate(addDaysIso(start, 4));
  state.toggleDate(addDaysIso(start, 10));

  assert.equal(state.getTotalDays(), 3);
  assert.equal(state.getTotalAmountInr(), 3 * PRICE_PER_DAY_INR);
  assert.equal(state.getTotalAmountPaise(), 3 * PRICE_PER_DAY_PAISE);

  // Same-item mode syncs all selected dates
  state.setSharedItemText("Filter Coffee");
  for (const entry of state.getSortedSelectedEntries()) {
    assert.equal(entry.item_text, "Filter Coffee");
  }

  // Switching to per-day mode allows individual overrides
  state.setSameItemMode(false);
  state.setDateItemText(addDaysIso(start, 4), "Masala Chai");
  const entries = state.getSortedSelectedEntries();
  assert.equal(entries[0].item_text, "Filter Coffee");
  assert.equal(entries[1].item_text, "Masala Chai");
  assert.equal(entries[2].item_text, "Filter Coffee");
});

test("validateForSubmission catches missing fields and builds valid API payload", () => {
  const start = "2026-11-19";
  const state = new CalendarBookingState(start, 30);
  state.toggleDate(start);
  state.setSharedItemText("  Oats   Bowl  ");

  const invalid = state.validateForSubmission("", "123");
  assert.equal(invalid.valid, false);
  assert.ok(invalid.errors.length >= 2);

  const valid = state.validateForSubmission("  Meera   Iyer ", "+91 98765-43210");
  assert.equal(valid.valid, true);
  assert.deepEqual(valid.payload, {
    customer_name: "Meera Iyer",
    customer_phone: "+919876543210",
    items: [{ service_date: "2026-11-19", item_text: "Oats Bowl" }],
  });
});
