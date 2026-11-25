import {
  MAX_INTENTION_LENGTH,
  PRICE_PER_MASS_PAISE,
  WINDOW_DAYS,
  addDaysIso,
  buildDefaultSchedule,
  formatDateHuman,
  getIstTodayIso,
  isSundayIso,
} from "./calendar-state.js";

const STORAGE_KEY = "mass_booking_mock_db_v2";

function defaultRulesSeed() {
  return [
    { id: "def-wd-1", day_type: "WEEKDAY", mass_time: "06:00 AM", language: "Telugu", sort_order: 1, amount_paise: null },
    { id: "def-wd-2", day_type: "WEEKDAY", mass_time: "06:00 PM", language: "English", sort_order: 2, amount_paise: null },
    { id: "def-su-1", day_type: "SUNDAY", mass_time: "06:00 AM", language: "Telugu", sort_order: 1, amount_paise: null },
    { id: "def-su-2", day_type: "SUNDAY", mass_time: "07:00 AM", language: "English", sort_order: 2, amount_paise: null },
    { id: "def-su-3", day_type: "SUNDAY", mass_time: "06:00 PM", language: "English", sort_order: 3, amount_paise: null },
  ];
}

function loadStore() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { bookings: [], overrides: {}, logs: [], defaultRules: defaultRulesSeed() };
    const parsed = JSON.parse(raw);
    return {
      bookings: parsed.bookings || [],
      overrides: parsed.overrides || {},
      logs: parsed.logs || [],
      defaultRules: parsed.defaultRules || defaultRulesSeed(),
    };
  } catch {
    return { bookings: [], overrides: {}, logs: [], defaultRules: defaultRulesSeed() };
  }
}

function saveStore(store) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(store));
}

function randomId(prefix) {
  return `${prefix}_${Math.random().toString(36).slice(2, 10)}${Date.now().toString(36)}`;
}

export async function mockHealth() {
  return { status: "ok", mode: "mock" };
}

export async function mockGetCalendarWindow() {
  const start = getIstTodayIso();
  const store = loadStore();
  const weekdayMasses = store.defaultRules
    .filter((r) => r.day_type === "WEEKDAY")
    .sort((a, b) => a.sort_order - b.sort_order)
    .map((r) => ({
      mass_time: r.mass_time,
      language: r.language,
      mass_label: `${r.mass_time} (${r.language})`,
      amount_paise: r.amount_paise || PRICE_PER_MASS_PAISE,
      sort_order: r.sort_order,
    }));
  const sundayMasses = store.defaultRules
    .filter((r) => r.day_type === "SUNDAY")
    .sort((a, b) => a.sort_order - b.sort_order)
    .map((r) => ({
      mass_time: r.mass_time,
      language: r.language,
      mass_label: `${r.mass_time} (${r.language})`,
      amount_paise: r.amount_paise || PRICE_PER_MASS_PAISE,
      sort_order: r.sort_order,
    }));

  const schedule = buildDefaultSchedule(start, WINDOW_DAYS).map((day) => {
    const ov = store.overrides[day.service_date];
    if (ov) {
      return {
        ...day,
        is_override: true,
        occasion_label: ov.occasion_label,
        masses: ov.masses.map((m, idx) => ({
          mass_time: m.mass_time,
          language: m.language,
          mass_label: `${m.mass_time} (${m.language})`,
          amount_paise: m.amount_paise || PRICE_PER_MASS_PAISE,
          sort_order: m.sort_order || idx + 1,
        })),
      };
    }
    return {
      ...day,
      masses: (day.is_sunday ? sundayMasses : weekdayMasses).map((m) => ({ ...m })),
    };
  });

  return {
    start_date: start,
    end_date: addDaysIso(start, WINDOW_DAYS - 1),
    days: WINDOW_DAYS,
    default_price_per_mass_paise: PRICE_PER_MASS_PAISE,
    max_intention_length: MAX_INTENTION_LENGTH,
    timezone: "Asia/Kolkata",
    schedule,
  };
}

export async function mockCreateBooking(payload) {
  const win = await mockGetCalendarWindow();
  const schedMap = new Map(win.schedule.map((d) => [d.service_date, d]));

  const resolvedItems = [];
  for (const item of payload.items) {
    const day = schedMap.get(item.service_date);
    const slot = day?.masses.find((m) => m.mass_label === item.mass_label);
    if (!slot) {
      throw new Error(`Mass '${item.mass_label}' not scheduled on ${item.service_date}.`);
    }
    resolvedItems.push({
      id: randomId("item"),
      service_date: item.service_date,
      mass_time: slot.mass_time,
      mass_language: slot.language,
      mass_label: slot.mass_label,
      intention_text: item.intention_text,
      amount_paise: slot.amount_paise,
    });
  }

  const bookingId = randomId("bk");
  const orderId = randomId("order_mock");
  const totalAmountPaise = resolvedItems.reduce((s, i) => s + i.amount_paise, 0);

  const booking = {
    booking_id: bookingId,
    customer_name: payload.customer_name || null,
    total_masses: resolvedItems.length,
    total_amount_paise: totalAmountPaise,
    gateway_name: "mock",
    gateway_order_id: orderId,
    gateway_payment_id: null,
    currency: "INR",
    status: "PENDING",
    created_at: new Date().toISOString(),
    items: resolvedItems,
  };

  const store = loadStore();
  store.bookings.push(booking);
  store.logs.unshift({
    id: randomId("log"),
    booking_id: bookingId,
    gateway_name: "mock",
    gateway_order_id: orderId,
    gateway_payment_id: null,
    event_type: "ORDER_CREATED",
    status: "PENDING",
    amount_paise: totalAmountPaise,
    note: `${resolvedItems.length} Mass offering(s)`,
    created_at: new Date().toISOString(),
  });
  saveStore(store);
  return booking;
}

export async function mockConfirmPayment(bookingId) {
  const store = loadStore();
  const booking = store.bookings.find((b) => b.booking_id === bookingId);
  if (!booking) throw new Error("Booking not found.");
  booking.status = "PAID";
  booking.gateway_payment_id = booking.gateway_payment_id || randomId("pay_mock");
  store.logs.unshift({
    id: randomId("log"),
    booking_id: bookingId,
    gateway_name: "mock",
    gateway_order_id: booking.gateway_order_id,
    gateway_payment_id: booking.gateway_payment_id,
    event_type: "MOCK_CONFIRMED",
    status: "PAID",
    amount_paise: booking.total_amount_paise,
    note: "Confirmed in mock mode",
    created_at: new Date().toISOString(),
  });
  saveStore(store);
  return booking;
}

export async function mockGetBookingStatus(bookingId) {
  const store = loadStore();
  const booking = store.bookings.find((b) => b.booking_id === bookingId);
  if (!booking) throw new Error("Booking not found.");
  return booking;
}

export async function mockGetAdminSchedule(startDate = "", endDate = "") {
  const store = loadStore();
  const paidBookings = store.bookings.filter((b) => b.status === "PAID");
  const byDate = new Map();

  for (const b of paidBookings) {
    for (const item of b.items) {
      if (startDate && item.service_date < startDate) continue;
      if (endDate && item.service_date > endDate) continue;
      if (!byDate.has(item.service_date)) {
        byDate.set(item.service_date, new Map());
      }
      const massMap = byDate.get(item.service_date);
      if (!massMap.has(item.mass_label)) {
        massMap.set(item.mass_label, {
          mass_label: item.mass_label,
          mass_time: item.mass_time,
          mass_language: item.mass_language,
          offerings: [],
        });
      }
      massMap.get(item.mass_label).offerings.push({
        booking_id: b.booking_id,
        customer_name: b.customer_name,
        intention_text: item.intention_text,
        amount_paise: item.amount_paise,
        gateway_payment_id: b.gateway_payment_id,
      });
    }
  }

  const groups = [];
  let totalOfferings = 0;
  let totalAmountPaise = 0;

  for (const serviceDate of Array.from(byDate.keys()).sort()) {
    const massMap = byDate.get(serviceDate);
    const masses = [];
    let dayOfferings = 0;
    let dayAmount = 0;

    for (const massLabel of Array.from(massMap.keys()).sort()) {
      const m = massMap.get(massLabel);
      const massAmount = m.offerings.reduce((s, o) => s + o.amount_paise, 0);
      dayOfferings += m.offerings.length;
      dayAmount += massAmount;
      masses.push({
        ...m,
        offering_count: m.offerings.length,
        total_amount_paise: massAmount,
      });
    }

    totalOfferings += dayOfferings;
    totalAmountPaise += dayAmount;
    groups.push({
      service_date: serviceDate,
      formatted_date: formatDateHuman(serviceDate),
      is_sunday: isSundayIso(serviceDate),
      offering_count: dayOfferings,
      total_amount_paise: dayAmount,
      masses,
    });
  }

  return {
    total_offerings: totalOfferings,
    total_amount_paise: totalAmountPaise,
    groups,
  };
}

export async function mockGetPaymentTally() {
  const store = loadStore();
  const paid = store.bookings.filter((b) => b.status === "PAID");
  const pending = store.bookings.filter((b) => b.status === "PENDING");
  const failed = store.bookings.filter((b) => b.status === "FAILED");
  return {
    paid_count: paid.length,
    paid_amount_paise: paid.reduce((s, b) => s + b.total_amount_paise, 0),
    pending_count: pending.length,
    pending_amount_paise: pending.reduce((s, b) => s + b.total_amount_paise, 0),
    failed_count: failed.length,
    failed_amount_paise: failed.reduce((s, b) => s + b.total_amount_paise, 0),
    recent_logs: store.logs.slice(0, 40),
  };
}

export async function mockGetDefaultRules() {
  const store = loadStore();
  return store.defaultRules;
}

export async function mockUpsertDefaultRules(payload) {
  const store = loadStore();
  const others = store.defaultRules.filter((r) => r.day_type !== payload.day_type);
  const replaced = payload.masses.map((m, idx) => ({
    id: randomId("def"),
    day_type: payload.day_type,
    mass_time: m.mass_time,
    language: m.language,
    sort_order: m.sort_order || idx + 1,
    amount_paise: m.amount_paise || null,
  }));
  store.defaultRules = [...others, ...replaced];
  saveStore(store);
  return store.defaultRules;
}

export async function mockUpsertOverride(payload) {
  const store = loadStore();
  store.overrides[payload.service_date] = payload;
  saveStore(store);
  return {
    service_date: payload.service_date,
    is_sunday: isSundayIso(payload.service_date),
    is_override: true,
    occasion_label: payload.occasion_label,
    masses: payload.masses,
  };
}

export async function mockDeleteOverride(serviceDate) {
  const store = loadStore();
  delete store.overrides[serviceDate];
  saveStore(store);
  return { status: "deleted", service_date: serviceDate };
}

export async function mockExportCsv(startDate = "", endDate = "") {
  const schedule = await mockGetAdminSchedule(startDate, endDate);
  const rows = [
    [
      "service_date",
      "formatted_date",
      "mass_time",
      "mass_language",
      "mass_label",
      "booking_id",
      "customer_name",
      "intention_text",
      "amount_inr",
      "gateway_payment_id",
    ],
  ];
  for (const group of schedule.groups) {
    for (const mass of group.masses) {
      for (const offering of mass.offerings) {
        rows.push([
          group.service_date,
          group.formatted_date,
          mass.mass_time,
          mass.mass_language,
          mass.mass_label,
          offering.booking_id,
          offering.customer_name || "",
          offering.intention_text,
          (offering.amount_paise / 100).toFixed(2),
          offering.gateway_payment_id || "",
        ]);
      }
    }
  }
  return rows
    .map((r) => r.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(","))
    .join("\n");
}
