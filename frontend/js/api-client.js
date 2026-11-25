import { CONFIG } from "../config.js";
import {
  mockConfirmPayment,
  mockCreateBooking,
  mockDeleteOverride,
  mockExportCsv,
  mockGetAdminSchedule,
  mockGetBookingStatus,
  mockGetCalendarWindow,
  mockGetDefaultRules,
  mockGetPaymentTally,
  mockHealth,
  mockUpsertDefaultRules,
  mockUpsertOverride,
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

  async verifyRazorpayPayment(payload) {
    return requestJson("/api/bookings/verify-payment", {
      method: "POST",
      body: JSON.stringify(payload),
    });
  },

  async confirmFakePayment(bookingId) {
    if (CONFIG.USE_MOCK_API) {
      return mockConfirmPayment(bookingId);
    }
    return requestJson(
      `/api/bookings/${encodeURIComponent(bookingId)}/confirm-fake`,
      { method: "POST" }
    );
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

  async getPaymentTally(tallyDate = "") {
    if (CONFIG.USE_MOCK_API) return mockGetPaymentTally(tallyDate);
    const qs = tallyDate ? `?tally_date=${encodeURIComponent(tallyDate)}` : "";
    return requestJson(`/api/admin/payment-tally${qs}`, { method: "GET" });
  },

  async getDefaultRules() {
    if (CONFIG.USE_MOCK_API) return mockGetDefaultRules();
    return requestJson("/api/admin/default-rules", { method: "GET" });
  },

  async upsertDefaultRules(payload) {
    if (CONFIG.USE_MOCK_API) return mockUpsertDefaultRules(payload);
    return requestJson("/api/admin/default-rules", {
      method: "PUT",
      body: JSON.stringify(payload),
    });
  },

  async upsertDateOverride(payload) {
    if (CONFIG.USE_MOCK_API) return mockUpsertOverride(payload);
    return requestJson("/api/admin/overrides", {
      method: "PUT",
      body: JSON.stringify(payload),
    });
  },

  async deleteDateOverride(serviceDate) {
    if (CONFIG.USE_MOCK_API) return mockDeleteOverride(serviceDate);
    return requestJson(`/api/admin/overrides/${encodeURIComponent(serviceDate)}`, {
      method: "DELETE",
    });
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
