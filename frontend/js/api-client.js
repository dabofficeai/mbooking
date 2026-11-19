import { CONFIG } from "../config.js";
import {
  mockConfirmPayment,
  mockCreateBooking,
  mockExportCsv,
  mockGetAdminSchedule,
  mockGetBookingStatus,
  mockGetCalendarWindow,
  mockHealth,
} from "./mock-api.js";

async function requestJson(path, options = {}) {
  const url = `${CONFIG.API_BASE_URL.replace(/\/$/, "")}${path}`;
  const response = await fetch(url, {
    headers: {
      "Content-Type": "application/json",
      ...(options.headers || {}),
    },
    ...options,
  });

  if (!response.ok) {
    let message = `Request failed (${response.status})`;
    try {
      const errBody = await response.json();
      if (errBody?.detail) {
        message =
          typeof errBody.detail === "string"
            ? errBody.detail
            : JSON.stringify(errBody.detail);
      }
    } catch {
      // ignore JSON parse error
    }
    throw new Error(message);
  }
  return response.json();
}

export const apiClient = {
  isMockMode() {
    return Boolean(CONFIG.USE_MOCK_API);
  },

  async checkHealth() {
    if (CONFIG.USE_MOCK_API) return mockHealth();
    return requestJson("/api/health", { method: "GET" });
  },

  async getCalendarWindow() {
    if (CONFIG.USE_MOCK_API) return mockGetCalendarWindow();
    return requestJson("/api/calendar-window", { method: "GET" });
  },

  async createBooking(payload) {
    if (CONFIG.USE_MOCK_API) return mockCreateBooking(payload);
    return requestJson("/api/bookings", {
      method: "POST",
      body: JSON.stringify(payload),
    });
  },

  async confirmMockPayment(bookingId) {
    if (!CONFIG.USE_MOCK_API) {
      throw new Error("Mock payment confirmation is only available in USE_MOCK_API mode.");
    }
    return mockConfirmPayment(bookingId);
  },

  async getBookingStatus(bookingId) {
    if (CONFIG.USE_MOCK_API) return mockGetBookingStatus(bookingId);
    return requestJson(`/api/bookings/${encodeURIComponent(bookingId)}`, {
      method: "GET",
    });
  },

  async getAdminSchedule(startDate = "", endDate = "") {
    if (CONFIG.USE_MOCK_API) return mockGetAdminSchedule(startDate, endDate);
    const params = new URLSearchParams();
    if (startDate) params.set("start_date", startDate);
    if (endDate) params.set("end_date", endDate);
    const qs = params.toString() ? `?${params.toString()}` : "";
    return requestJson(`/api/admin/schedule-by-date${qs}`, { method: "GET" });
  },

  async downloadAdminCsv(startDate = "", endDate = "") {
    if (CONFIG.USE_MOCK_API) {
      return mockExportCsv(startDate, endDate);
    }
    const params = new URLSearchParams();
    if (startDate) params.set("start_date", startDate);
    if (endDate) params.set("end_date", endDate);
    const qs = params.toString() ? `?${params.toString()}` : "";
    const url = `${CONFIG.API_BASE_URL.replace(/\/$/, "")}/api/admin/export-csv${qs}`;
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`CSV export failed (${response.status})`);
    }
    return response.text();
  },
};
