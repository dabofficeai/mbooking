export const PRICE_PER_MASS_INR = 100;
export const PRICE_PER_MASS_PAISE = 10000;
export const WINDOW_DAYS = 30;
export const MAX_INTENTION_LENGTH = 50;

export const INTENTION_TEMPLATES = [
  "Departed soul of ",
  "Thanksgiving mass for ",
  "Special intention of ",
  "Birthday blessings for ",
];

const IST_OFFSET_MS = 330 * 60 * 1000; // UTC+5:30
const DAY_NAMES = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MONTH_NAMES = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];

export function getIstTodayIso(now = new Date()) {
  const istTime = new Date(now.getTime() + IST_OFFSET_MS);
  return istTime.toISOString().slice(0, 10);
}

export function addDaysIso(isoDate, days) {
  const [y, m, d] = isoDate.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d + days));
  return dt.toISOString().slice(0, 10);
}

export function isSundayIso(isoDate) {
  const [y, m, d] = isoDate.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  return dt.getUTCDay() === 0;
}

export function formatDateHuman(isoDate) {
  const [y, m, d] = isoDate.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  const dayName = DAY_NAMES[dt.getUTCDay()];
  const monthName = MONTH_NAMES[dt.getUTCMonth()];
  const dd = String(d).padStart(2, "0");
  return `${dayName}, ${dd} ${monthName} ${y}`;
}

export function buildDefaultSchedule(startDateIso, days = WINDOW_DAYS) {
  const weekdayMasses = [
    {
      mass_time: "06:00 AM",
      language: "Telugu",
      mass_label: "06:00 AM (Telugu)",
      amount_paise: PRICE_PER_MASS_PAISE,
      sort_order: 1,
    },
    {
      mass_time: "06:00 PM",
      language: "English",
      mass_label: "06:00 PM (English)",
      amount_paise: PRICE_PER_MASS_PAISE,
      sort_order: 2,
    },
  ];
  const sundayMasses = [
    {
      mass_time: "06:00 AM",
      language: "Telugu",
      mass_label: "06:00 AM (Telugu)",
      amount_paise: PRICE_PER_MASS_PAISE,
      sort_order: 1,
    },
    {
      mass_time: "07:00 AM",
      language: "English",
      mass_label: "07:00 AM (English)",
      amount_paise: PRICE_PER_MASS_PAISE,
      sort_order: 2,
    },
    {
      mass_time: "06:00 PM",
      language: "English",
      mass_label: "06:00 PM (English)",
      amount_paise: PRICE_PER_MASS_PAISE,
      sort_order: 3,
    },
  ];

  const schedule = [];
  for (let i = 0; i < days; i += 1) {
    const iso = addDaysIso(startDateIso, i);
    const sunday = isSundayIso(iso);
    schedule.push({
      service_date: iso,
      is_sunday: sunday,
      is_override: false,
      occasion_label: sunday ? "Sunday" : null,
      masses: sunday ? sundayMasses.map((m) => ({ ...m })) : weekdayMasses.map((m) => ({ ...m })),
    });
  }
  return schedule;
}

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
      isSunday: dt.getUTCDay() === 0,
    });
  }
  return result;
}

export function isDateInWindow(isoDate, startDateIso, days = WINDOW_DAYS) {
  const endDateIso = addDaysIso(startDateIso, days - 1);
  return isoDate >= startDateIso && isoDate <= endDateIso;
}

export function offeringKey(serviceDate, massLabel) {
  return `${serviceDate}::${massLabel}`;
}

/**
 * Pure ES6 state manager for multi-date, multi-Mass selection & 50-char intentions.
 */
export class MassBookingState {
  constructor(startDateIso = getIstTodayIso(), windowDays = WINDOW_DAYS) {
    this.startDateIso = startDateIso;
    this.windowDays = windowDays;
    this.sameIntentionMode = true;
    this.sharedIntentionText = "";
    /** @type {Set<string>} */
    this.selectedDates = new Set();
    /** @type {Map<string, {service_date: string, mass_label: string, amount_paise: number, intention_text: string}>} */
    this.selectedOfferings = new Map();
    /** @type {Map<string, {service_date: string, is_sunday: boolean, is_override: boolean, occasion_label: string|null, masses: Array}>} */
    this.scheduleByDate = new Map();

    this.setSchedule(buildDefaultSchedule(startDateIso, windowDays));
  }

  setSchedule(scheduleArray, startDateIso = null, windowDays = null) {
    if (startDateIso) this.startDateIso = startDateIso;
    if (windowDays) this.windowDays = windowDays;

    this.scheduleByDate.clear();
    for (const day of scheduleArray) {
      this.scheduleByDate.set(day.service_date, day);
    }

    // Prune any out-of-window dates or removed Mass slots
    for (const d of Array.from(this.selectedDates)) {
      if (!this.scheduleByDate.has(d)) {
        this.selectedDates.delete(d);
      }
    }
    for (const [key, item] of Array.from(this.selectedOfferings.entries())) {
      const day = this.scheduleByDate.get(item.service_date);
      const validSlot = day?.masses.find((m) => m.mass_label === item.mass_label);
      if (!validSlot) {
        this.selectedOfferings.delete(key);
      } else {
        item.amount_paise = validSlot.amount_paise;
      }
    }
  }

  getDaySchedule(isoDate) {
    return this.scheduleByDate.get(isoDate) || null;
  }

  toggleDate(isoDate) {
    if (!isDateInWindow(isoDate, this.startDateIso, this.windowDays)) {
      throw new Error(
        `Date ${isoDate} is outside the ${this.windowDays}-day booking window.`
      );
    }
    if (this.selectedDates.has(isoDate)) {
      this.selectedDates.delete(isoDate);
      for (const [key, item] of Array.from(this.selectedOfferings.entries())) {
        if (item.service_date === isoDate) {
          this.selectedOfferings.delete(key);
        }
      }
      return false;
    }
    this.selectedDates.add(isoDate);
    return true;
  }

  toggleMassOffering(isoDate, massLabel) {
    const day = this.scheduleByDate.get(isoDate);
    if (!day) {
      throw new Error(`Date ${isoDate} is outside the booking window.`);
    }
    const slot = day.masses.find((m) => m.mass_label === massLabel);
    if (!slot) {
      throw new Error(`Mass '${massLabel}' is not available on ${isoDate}.`);
    }

    this.selectedDates.add(isoDate);
    const key = offeringKey(isoDate, massLabel);
    if (this.selectedOfferings.has(key)) {
      this.selectedOfferings.delete(key);
      return false;
    }

    this.selectedOfferings.set(key, {
      service_date: isoDate,
      mass_label: massLabel,
      amount_paise: slot.amount_paise ?? PRICE_PER_MASS_PAISE,
      intention_text: this.sameIntentionMode ? this.sharedIntentionText : "",
    });
    return true;
  }

  applyMassTimingAcrossSelectedDates(massLabel) {
    let added = 0;
    for (const isoDate of this.selectedDates) {
      const day = this.scheduleByDate.get(isoDate);
      const slot = day?.masses.find((m) => m.mass_label === massLabel);
      if (slot) {
        const key = offeringKey(isoDate, massLabel);
        if (!this.selectedOfferings.has(key)) {
          this.selectedOfferings.set(key, {
            service_date: isoDate,
            mass_label: massLabel,
            amount_paise: slot.amount_paise ?? PRICE_PER_MASS_PAISE,
            intention_text: this.sameIntentionMode ? this.sharedIntentionText : "",
          });
          added += 1;
        }
      }
    }
    return added;
  }

  setSameIntentionMode(enabled) {
    this.sameIntentionMode = Boolean(enabled);
    if (this.sameIntentionMode) {
      for (const item of this.selectedOfferings.values()) {
        item.intention_text = this.sharedIntentionText;
      }
    }
  }

  setSharedIntentionText(text) {
    this.sharedIntentionText = text;
    if (this.sameIntentionMode) {
      for (const item of this.selectedOfferings.values()) {
        item.intention_text = text;
      }
    }
  }

  setOfferingIntention(key, text) {
    const item = this.selectedOfferings.get(key);
    if (!item) {
      throw new Error(`Offering ${key} is not selected.`);
    }
    item.intention_text = text;
  }

  getSortedSelectedDates() {
    return Array.from(this.selectedDates).sort((a, b) => a.localeCompare(b));
  }

  getSortedOfferings() {
    return Array.from(this.selectedOfferings.entries())
      .map(([key, item]) => ({ key, ...item }))
      .sort((a, b) => {
        const dateCmp = a.service_date.localeCompare(b.service_date);
        return dateCmp !== 0 ? dateCmp : a.mass_label.localeCompare(b.mass_label);
      });
  }

  getTotalMasses() {
    return this.selectedOfferings.size;
  }

  getTotalAmountPaise() {
    let sum = 0;
    for (const item of this.selectedOfferings.values()) {
      sum += item.amount_paise;
    }
    return sum;
  }

  getTotalAmountInr() {
    return this.getTotalAmountPaise() / 100;
  }

  clearSelection() {
    this.selectedDates.clear();
    this.selectedOfferings.clear();
  }

  validateForSubmission(customerName = "") {
    const errors = [];
    const trimmedName = (customerName || "").trim().replace(/\s+/g, " ");

    if (this.selectedOfferings.size === 0) {
      errors.push("Please select at least 1 Mass timing from your chosen date(s).");
    }

    const offerings = this.getSortedOfferings();
    const items = [];
    for (const entry of offerings) {
      const cleaned = (entry.intention_text || "").trim().replace(/\s+/g, " ");
      if (!cleaned) {
        errors.push(
          `Please enter a Mass intention for ${formatDateHuman(entry.service_date)} (${entry.mass_label}).`
        );
      } else if (cleaned.length > MAX_INTENTION_LENGTH) {
        errors.push(
          `Intention for ${formatDateHuman(entry.service_date)} (${entry.mass_label}) must be ${MAX_INTENTION_LENGTH} characters or fewer.`
        );
      } else {
        items.push({
          service_date: entry.service_date,
          mass_label: entry.mass_label,
          intention_text: cleaned,
        });
      }
    }

    return {
      valid: errors.length === 0,
      errors,
      payload:
        errors.length === 0
          ? {
              customer_name: trimmedName || null,
              items,
            }
          : null,
    };
  }
}
