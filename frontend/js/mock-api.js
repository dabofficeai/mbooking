import {
  PRICE_PER_DAY_PAISE,
  WINDOW_DAYS,
  addDaysIso,
  formatDateHuman,
  getIstTodayIso,
  isDateInWindow,
} from "./calendar-state.js";

const STORAGE_KEY = "daily_booking_mock_db_v1";

function loadStore() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { bookings: [] };
    return JSON.parse(raw);
  } catch {
    return { bookings: [] };
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
  return {
    start_date: start,
    end_date: addDaysIso(start, WINDOW_DAYS - 1),
    days: WINDOW_DAYS,
    price_per_day_paise: PRICE_PER_DAY_PAISE,
    timezone: "Asia/Kolkata",
  };
}

export async function mockCreateBooking(payload) {
  const start = getIstTodayIso();
  for (const item of payload.items) {
    if (!isDateInWindow(item.service_date, start, WINDOW_DAYS)) {
      throw new Error(`Date ${item.service_date} is outside the 30-day window.`);
    }
  }

  const bookingId = randomId("bk");
  const orderId = randomId("order_mock");
  const totalDays = payload.items.length;
  const totalAmountPaise = totalDays * PRICE_PER_DAY_PAISE;

  const booking = {
    booking_id: bookingId,
    customer_name: payload.customer_name,
    customer_phone: payload.customer_phone,
    total_days: totalDays,
    total_amount_paise: totalAmountPaise,
    gateway_name: "mock",
    gateway_order_id: orderId,
    gateway_payment_id: null,
    currency: "INR",
    status: "PENDING",
    created_at: new Date().toISOString(),
    items: payload.items.map((item) => ({
      id: randomId("item"),
      service_date: item.service_date,
      item_text: item.item_text,
      amount_paise: PRICE_PER_DAY_PAISE,
    })),
  };

  const store = loadStore();
  store.bookings.push(booking);
  saveStore(store);
  return booking;
}

export async function mockConfirmPayment(bookingId) {
  const store = loadStore();
  const booking = store.bookings.find((b) => b.booking_id === bookingId);
  if (!booking) throw new Error("Booking not found.");
  booking.status = "PAID";
  booking.gateway_payment_id = booking.gateway_payment_id || randomId("pay_mock");
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
        byDate.set(item.service_date, []);
      }
      byDate.get(item.service_date).push({
        booking_id: b.booking_id,
        customer_name: b.customer_name,
        customer_phone: b.customer_phone,
        item_text: item.item_text,
        amount_paise: item.amount_paise,
        gateway_payment_id: b.gateway_payment_id,
      });
    }
  }

  const groups = [];
  let totalOrders = 0;
  let totalAmountPaise = 0;

  for (const serviceDate of Array.from(byDate.keys()).sort()) {
    const orders = byDate.get(serviceDate);
    const dayAmount = orders.reduce((acc, o) => acc + o.amount_paise, 0);
    totalOrders += orders.length;
    totalAmountPaise += dayAmount;
    groups.push({
      service_date: serviceDate,
      formatted_date: formatDateHuman(serviceDate),
      order_count: orders.length,
      total_amount_paise: dayAmount,
      orders,
    });
  }

  return {
    total_orders: totalOrders,
    total_amount_paise: totalAmountPaise,
    groups,
  };
}

export async function mockExportCsv(startDate = "", endDate = "") {
  const schedule = await mockGetAdminSchedule(startDate, endDate);
  const rows = [
    [
      "service_date",
      "formatted_date",
      "booking_id",
      "customer_name",
      "customer_phone",
      "item_text",
      "amount_inr",
      "gateway_payment_id",
    ],
  ];
  for (const group of schedule.groups) {
    for (const order of group.orders) {
      rows.push([
        group.service_date,
        group.formatted_date,
        order.booking_id,
        order.customer_name,
        order.customer_phone,
        order.item_text,
        (order.amount_paise / 100).toFixed(2),
        order.gateway_payment_id || "",
      ]);
    }
  }
  return rows
    .map((r) => r.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(","))
    .join("\n");
}
