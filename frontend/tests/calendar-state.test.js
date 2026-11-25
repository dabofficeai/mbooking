import test from "node:test";
import assert from "node:assert/strict";

import {
  MassBookingState,
  PRICE_PER_MASS_INR,
  PRICE_PER_MASS_PAISE,
  addDaysIso,
  buildCalendarWindow,
  isDateInWindow,
} from "../js/calendar-state.js";

test("buildCalendarWindow generates 30 days and flags Sundays", () => {
  const start = "2026-11-19"; // Thu
  const days = buildCalendarWindow(start, 30);
  assert.equal(days.length, 30);
  assert.equal(days[0].iso, "2026-11-19");
  assert.equal(days[0].isSunday, false);
  assert.equal(days[3].iso, "2026-11-22");
  assert.equal(days[3].isSunday, true);
});

test("isDateInWindow rejects past dates and day 31+", () => {
  const start = "2026-11-19";
  assert.equal(isDateInWindow("2026-11-18", start, 30), false);
  assert.equal(isDateInWindow("2026-11-19", start, 30), true);
  assert.equal(isDateInWindow("2026-12-18", start, 30), true);
  assert.equal(isDateInWindow("2026-12-19", start, 30), false);
});

test("MassBookingState supports multi-Mass same day, multi-day, and same-intention sync", () => {
  const start = "2026-11-19";
  const state = new MassBookingState(start, 30);

  // Two Masses on same weekday + one on Sunday
  state.toggleMassOffering(start, "06:00 AM (Telugu)");
  state.toggleMassOffering(start, "06:00 PM (English)");
  state.toggleMassOffering("2026-11-22", "07:00 AM (English)");

  assert.equal(state.getTotalMasses(), 3);
  assert.equal(state.getTotalAmountInr(), 3 * PRICE_PER_MASS_INR);
  assert.equal(state.getTotalAmountPaise(), 3 * PRICE_PER_MASS_PAISE);

  // Same-intention mode syncs all selected Mass offerings
  state.setSharedIntentionText("Thanksgiving mass for family");
  for (const o of state.getSortedOfferings()) {
    assert.equal(o.intention_text, "Thanksgiving mass for family");
  }

  // Per-offering mode allows unique intention per Mass
  state.setSameIntentionMode(false);
  const offerings = state.getSortedOfferings();
  state.setOfferingIntention(offerings[0].key, "Departed soul of Joseph");
  assert.equal(state.getSortedOfferings()[0].intention_text, "Departed soul of Joseph");
  assert.equal(state.getSortedOfferings()[1].intention_text, "Thanksgiving mass for family");
});

test("validateForSubmission enforces 50-char limit and makes name optional", () => {
  const start = "2026-11-19";
  const state = new MassBookingState(start, 30);
  state.toggleMassOffering(start, "06:00 AM (Telugu)");

  state.setSharedIntentionText("A".repeat(51));
  const tooLong = state.validateForSubmission("");
  assert.equal(tooLong.valid, false);

  state.setSharedIntentionText("  Departed   soul of Mary ");
  const validAnon = state.validateForSubmission("");
  assert.equal(validAnon.valid, true);
  assert.deepEqual(validAnon.payload, {
    customer_name: null,
    items: [
      {
        service_date: "2026-11-19",
        mass_label: "06:00 AM (Telugu)",
        intention_text: "Departed soul of Mary",
      },
    ],
  });
});

test("applyMassTimingAcrossSelectedDates selects common Mass timing where available", () => {
  const start = "2026-11-19";
  const state = new MassBookingState(start, 30);
  state.toggleDate(start); // Thu (has 06:00 AM Telugu, 06:00 PM English)
  state.toggleDate(addDaysIso(start, 3)); // Sun (also has 07:00 AM English)

  const added = state.applyMassTimingAcrossSelectedDates("07:00 AM (English)");
  assert.equal(added, 1); // Only Sunday has 07:00 AM English
  assert.equal(state.getTotalMasses(), 1);
});
