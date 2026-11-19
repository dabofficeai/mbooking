export const PRICE_PER_DAY_INR = 100;
export const PRICE_PER_DAY_PAISE = 10000;
export const WINDOW_DAYS = 30;
export const MAX_ITEM_TEXT_LENGTH = 100;

const IST_OFFSET_MS = 330 * 60 * 1000; // UTC+5:30

const DAY_NAMES = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MONTH_NAMES = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];

/**
 * Returns today's YYYY-MM-DD date string in Asia/Kolkata (IST).
 */
export function getIstTodayIso(now = new Date()) {
  const istTime = new Date(now.getTime() + IST_OFFSET_MS);
  return istTime.toISOString().slice(0, 10);
}

/**
 * Adds `days` to an ISO YYYY-MM-DD string and returns the resulting YYYY-MM-DD.
 */
export function addDaysIso(isoDate, days) {
  const [y, m, d] = isoDate.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d + days));
  return dt.toISOString().slice(0, 10);
}

/**
 * Formats an ISO YYYY-MM-DD date into a human-friendly label like "Thu, 19 Nov 2026".
 */
export function formatDateHuman(isoDate) {
  const [y, m, d] = isoDate.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  const dayName = DAY_NAMES[dt.getUTCDay()];
  const monthName = MONTH_NAMES[dt.getUTCMonth()];
  const dd = String(d).padStart(2, "0");
  return `${dayName}, ${dd} ${monthName} ${y}`;
}

/**
 * Builds the 30-day rolling calendar window starting from `startDateIso`.
 */
export function buildCalendarWindow(startDateIso, days = WINDOW_DAYS) {
  const result = [];
  for (let i = 0; i < days; i += 1) {
    const iso = addDaysIso(startDateIso, i);
    const [y, m, d] = iso.split("-").map(Number);
    const dt = new Date(Date.UTC(y, m - 1, d));
    result.push({
      iso,
      dayName: DAY_NAMES[dt.getUTCDay()],
      dayNum: d,
      monthShort: MONTH_NAMES[dt.getUTCMonth()],
      fullLabel: formatDateHuman(iso),
      isToday: i === 0,
    });
  }
  return result;
}

/**
 * Checks whether `isoDate` falls inside [startDateIso, startDateIso + days - 1].
 */
export function isDateInWindow(isoDate, startDateIso, days = WINDOW_DAYS) {
  const endDateIso = addDaysIso(startDateIso, days - 1);
  return isoDate >= startDateIso && isoDate <= endDateIso;
}

/**
 * Pure state manager for multi-date selection, item text modes, and ₹100/day pricing.
 */
export class CalendarBookingState {
  constructor(startDateIso = getIstTodayIso(), windowDays = WINDOW_DAYS) {
    this.startDateIso = startDateIso;
    this.windowDays = windowDays;
    this.sameItemMode = true;
    this.sharedItemText = "";
    /** @type {Map<string, string>} */
    this.selectedDates = new Map();
  }

  setWindow(startDateIso, windowDays = WINDOW_DAYS) {
    this.startDateIso = startDateIso;
    this.windowDays = windowDays;
    for (const dateIso of Array.from(this.selectedDates.keys())) {
      if (!isDateInWindow(dateIso, this.startDateIso, this.windowDays)) {
        this.selectedDates.delete(dateIso);
      }
    }
  }

  toggleDate(isoDate) {
    if (!isDateInWindow(isoDate, this.startDateIso, this.windowDays)) {
      throw new Error(
        `Date ${isoDate} is outside the ${this.windowDays}-day booking window.`
      );
    }
    if (this.selectedDates.has(isoDate)) {
      this.selectedDates.delete(isoDate);
      return false;
    }
    const initialText = this.sameItemMode ? this.sharedItemText : "";
    this.selectedDates.set(isoDate, initialText);
    return true;
  }

  setSameItemMode(enabled) {
    this.sameItemMode = Boolean(enabled);
    if (this.sameItemMode) {
      for (const dateIso of this.selectedDates.keys()) {
        this.selectedDates.set(dateIso, this.sharedItemText);
      }
    }
  }

  setSharedItemText(text) {
    this.sharedItemText = text;
    if (this.sameItemMode) {
      for (const dateIso of this.selectedDates.keys()) {
        this.selectedDates.set(dateIso, text);
      }
    }
  }

  setDateItemText(isoDate, text) {
    if (!this.selectedDates.has(isoDate)) {
      throw new Error(`Date ${isoDate} is not currently selected.`);
    }
    this.selectedDates.set(isoDate, text);
  }

  getSortedSelectedEntries() {
    return Array.from(this.selectedDates.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([service_date, item_text]) => ({
        service_date,
        item_text,
      }));
  }

  getTotalDays() {
    return this.selectedDates.size;
  }

  getTotalAmountInr() {
    return this.getTotalDays() * PRICE_PER_DAY_INR;
  }

  getTotalAmountPaise() {
    return this.getTotalDays() * PRICE_PER_DAY_PAISE;
  }

  clearSelection() {
    this.selectedDates.clear();
  }

  validateForSubmission(customerName, customerPhone) {
    const errors = [];
    const trimmedName = (customerName || "").trim().replace(/\s+/g, " ");
    const compactPhone = (customerPhone || "").trim().replace(/[\s\-()]/g, "");

    if (!trimmedName) {
      errors.push("Please enter your full name.");
    }
    if (!/^\+?[0-9]{10,15}$/.test(compactPhone)) {
      errors.push("Please enter a valid 10 to 15 digit phone number.");
    }
    if (this.selectedDates.size === 0) {
      errors.push("Please select at least 1 date from the calendar.");
    }

    const entries = this.getSortedSelectedEntries();
    const items = [];
    for (const entry of entries) {
      const cleanedItem = (entry.item_text || "").trim().replace(/\s+/g, " ");
      if (!cleanedItem) {
        errors.push(`Please enter an item name for ${formatDateHuman(entry.service_date)}.`);
      } else if (cleanedItem.length > MAX_ITEM_TEXT_LENGTH) {
        errors.push(
          `Item text for ${formatDateHuman(entry.service_date)} must be ${MAX_ITEM_TEXT_LENGTH} characters or fewer.`
        );
      } else {
        items.push({
          service_date: entry.service_date,
          item_text: cleanedItem,
        });
      }
    }

    return {
      valid: errors.length === 0,
      errors,
      payload:
        errors.length === 0
          ? {
              customer_name: trimmedName,
              customer_phone: compactPhone,
              items,
            }
          : null,
    };
  }
}
