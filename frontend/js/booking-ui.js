import { CONFIG } from "../config.js";
import { apiClient } from "./api-client.js";
import {
  CalendarBookingState,
  PRICE_PER_DAY_INR,
  buildCalendarWindow,
  formatDateHuman,
  getIstTodayIso,
} from "./calendar-state.js";

const state = new CalendarBookingState(getIstTodayIso(), 30);

const els = {
  coldStartBanner: document.getElementById("cold-start-banner"),
  coldStartText: document.getElementById("cold-start-text"),
  mockModeBadge: document.getElementById("mock-mode-badge"),
  calendarGrid: document.getElementById("calendar-grid"),
  windowRangeLabel: document.getElementById("window-range-label"),
  sameItemToggle: document.getElementById("same-item-toggle"),
  sharedItemSection: document.getElementById("shared-item-section"),
  sharedItemInput: document.getElementById("shared-item-input"),
  perDaySection: document.getElementById("per-day-section"),
  perDayList: document.getElementById("per-day-list"),
  selectedCount: document.getElementById("selected-count"),
  totalAmount: document.getElementById("total-amount"),
  customerName: document.getElementById("customer-name"),
  customerPhone: document.getElementById("customer-phone"),
  errorBox: document.getElementById("form-error-box"),
  payButton: document.getElementById("pay-button"),
  receiptSection: document.getElementById("receipt-section"),
  receiptContent: document.getElementById("receipt-content"),
  newBookingBtn: document.getElementById("new-booking-btn"),
  clearSelectionBtn: document.getElementById("clear-selection-btn"),
};

function showErrors(messages) {
  if (!messages || messages.length === 0) {
    els.errorBox.classList.add("hidden");
    els.errorBox.innerHTML = "";
    return;
  }
  els.errorBox.classList.remove("hidden");
  els.errorBox.innerHTML = messages
    .map((msg) => `<p class="text-sm text-red-700">• ${escapeHtml(msg)}</p>`)
    .join("");
}

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function renderCalendar() {
  const days = buildCalendarWindow(state.startDateIso, state.windowDays);
  const first = days[0];
  const last = days[days.length - 1];
  els.windowRangeLabel.textContent = `${first.fullLabel} – ${last.fullLabel} (IST)`;

  els.calendarGrid.innerHTML = "";
  for (const day of days) {
    const isSelected = state.selectedDates.has(day.iso);
    const btn = document.createElement("button");
    btn.type = "button";
    btn.dataset.date = day.iso;
    btn.className = [
      "flex flex-col items-center justify-center rounded-xl border p-2.5 text-center transition-all focus:outline-none focus:ring-2 focus:ring-indigo-500",
      isSelected
        ? "border-indigo-600 bg-indigo-600 text-white shadow-sm"
        : "border-slate-200 bg-white text-slate-800 hover:border-indigo-300 hover:bg-indigo-50",
    ].join(" ");

    btn.innerHTML = `
      <span class="text-[11px] font-medium uppercase tracking-wide ${
        isSelected ? "text-indigo-100" : "text-slate-500"
      }">${day.dayName}</span>
      <span class="mt-0.5 text-lg font-bold leading-tight">${day.dayNum}</span>
      <span class="text-[11px] ${
        isSelected ? "text-indigo-100" : "text-slate-500"
      }">${day.monthShort}${day.isToday ? " · Today" : ""}</span>
    `;

    btn.addEventListener("click", () => {
      state.toggleDate(day.iso);
      showErrors([]);
      renderAll();
    });

    els.calendarGrid.appendChild(btn);
  }
}

function renderItemInputs() {
  const entries = state.getSortedSelectedEntries();
  els.sameItemToggle.checked = state.sameItemMode;

  if (state.sameItemMode) {
    els.sharedItemSection.classList.remove("hidden");
    els.perDaySection.classList.add("hidden");
    if (els.sharedItemInput.value !== state.sharedItemText) {
      els.sharedItemInput.value = state.sharedItemText;
    }
  } else {
    els.sharedItemSection.classList.add("hidden");
    els.perDaySection.classList.remove("hidden");

    if (entries.length === 0) {
      els.perDayList.innerHTML =
        '<p class="text-sm text-slate-500 italic">Select one or more dates on the calendar to enter items.</p>';
      return;
    }

    els.perDayList.innerHTML = "";
    for (const entry of entries) {
      const row = document.createElement("div");
      row.className =
        "flex flex-col sm:flex-row sm:items-center gap-2 rounded-lg border border-slate-200 bg-slate-50 p-2.5";

      const label = document.createElement("span");
      label.className = "text-xs font-semibold text-slate-700 sm:w-40 shrink-0";
      label.textContent = formatDateHuman(entry.service_date);

      const input = document.createElement("input");
      input.type = "text";
      input.maxLength = 100;
      input.placeholder = "Enter item / custom text (max 100 chars)";
      input.value = entry.item_text;
      input.className =
        "w-full rounded-md border border-slate-300 bg-white px-3 py-1.5 text-sm text-slate-900 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500";
      input.addEventListener("input", (e) => {
        state.setDateItemText(entry.service_date, e.target.value);
      });

      row.appendChild(label);
      row.appendChild(input);
      els.perDayList.appendChild(row);
    }
  }
}

function renderSummary() {
  const totalDays = state.getTotalDays();
  const totalInr = state.getTotalAmountInr();
  els.selectedCount.textContent = `${totalDays} ${totalDays === 1 ? "day" : "days"}`;
  els.totalAmount.textContent = `₹${totalInr}`;
  els.payButton.textContent =
    totalDays > 0
      ? `Pay ₹${totalInr} for ${totalDays} ${totalDays === 1 ? "Day" : "Days"}`
      : `Select Dates to Book (₹${PRICE_PER_DAY_INR}/day)`;
}

function renderAll() {
  renderCalendar();
  renderItemInputs();
  renderSummary();
}

function showReceipt(booking) {
  els.receiptSection.classList.remove("hidden");
  const itemsHtml = booking.items
    .map(
      (i) => `
      <li class="flex items-center justify-between border-b border-emerald-100 py-1.5 text-sm">
        <span class="font-medium text-slate-800">${escapeHtml(formatDateHuman(i.service_date))}</span>
        <span class="text-slate-600">${escapeHtml(i.item_text)}</span>
      </li>`
    )
    .join("");

  els.receiptContent.innerHTML = `
    <div class="space-y-2 text-sm text-slate-700">
      <p><span class="font-semibold">Status:</span> <span class="inline-block rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-semibold text-emerald-800">${escapeHtml(booking.status)}</span></p>
      <p><span class="font-semibold">Booking ID:</span> <code class="rounded bg-slate-100 px-1.5 py-0.5 text-xs">${escapeHtml(booking.booking_id)}</code></p>
      <p><span class="font-semibold">Order ID:</span> <code class="rounded bg-slate-100 px-1.5 py-0.5 text-xs">${escapeHtml(booking.gateway_order_id)}</code></p>
      <p><span class="font-semibold">Total Paid:</span> ₹${(booking.total_amount_paise / 100).toFixed(0)} (${booking.total_days} days)</p>
      <ul class="mt-3 divide-y divide-emerald-100 rounded-lg border border-emerald-200 bg-white px-3 py-1">
        ${itemsHtml}
      </ul>
    </div>
  `;
  els.receiptSection.scrollIntoView({ behavior: "smooth" });
}

async function pollForPaidStatus(bookingId, attempts = 8) {
  for (let i = 0; i < attempts; i += 1) {
    const statusData = await apiClient.getBookingStatus(bookingId);
    if (statusData.status === "PAID") {
      return statusData;
    }
    await new Promise((r) => setTimeout(r, 1500));
  }
  return apiClient.getBookingStatus(bookingId);
}

function openRazorpayCheckout(booking, customerName, customerPhone) {
  return new Promise((resolve, reject) => {
    if (typeof window.Razorpay !== "function") {
      reject(new Error("Razorpay Checkout script failed to load."));
      return;
    }
    const rzp = new window.Razorpay({
      key: CONFIG.RAZORPAY_KEY_ID,
      amount: booking.total_amount_paise,
      currency: "INR",
      name: "Daily Item Booking",
      description: `${booking.total_days} Day(s) @ ₹100/day`,
      order_id: booking.gateway_order_id,
      prefill: {
        name: customerName,
        contact: customerPhone,
      },
      theme: { color: "#4f46e5" },
      handler: async () => {
        try {
          const finalStatus = await pollForPaidStatus(booking.booking_id);
          resolve(finalStatus);
        } catch (err) {
          reject(err);
        }
      },
      modal: {
        ondismiss: () => {
          reject(new Error("Payment checkout was closed before completion."));
        },
      },
    });
    rzp.open();
  });
}

async function handleSubmit() {
  showErrors([]);
  const validation = state.validateForSubmission(
    els.customerName.value,
    els.customerPhone.value
  );
  if (!validation.valid) {
    showErrors(validation.errors);
    return;
  }

  els.payButton.disabled = true;
  const originalLabel = els.payButton.textContent;
  els.payButton.textContent = "Creating booking order...";

  try {
    const booking = await apiClient.createBooking(validation.payload);

    if (apiClient.isMockMode() || booking.gateway_name === "fake") {
      els.payButton.textContent = "Confirming payment...";
      const paid = await apiClient.confirmFakePayment(booking.booking_id);
      showReceipt(paid);
      state.clearSelection();
      renderAll();
    } else {
      els.payButton.textContent = "Waiting for Razorpay payment...";
      const finalBooking = await openRazorpayCheckout(
        booking,
        validation.payload.customer_name,
        validation.payload.customer_phone
      );
      showReceipt(finalBooking);
      state.clearSelection();
      renderAll();
    }
  } catch (err) {
    showErrors([err.message || "Unable to complete booking."]);
  } finally {
    els.payButton.disabled = false;
    if (els.payButton.textContent.includes("...")) {
      els.payButton.textContent = originalLabel;
      renderSummary();
    }
  }
}

async function wakeBackendAndSyncWindow() {
  if (apiClient.isMockMode()) {
    els.mockModeBadge.classList.remove("hidden");
    els.coldStartBanner.classList.add("hidden");
  } else {
    els.coldStartBanner.classList.remove("hidden");
    els.coldStartText.textContent =
      "Waking up free cloud server (~30s on first load)...";
  }

  try {
    await apiClient.checkHealth();
    const win = await apiClient.getCalendarWindow();
    if (win?.start_date) {
      state.setWindow(win.start_date, win.days || 30);
      renderAll();
    }
    els.coldStartBanner.classList.add("hidden");
  } catch {
    els.coldStartText.textContent =
      "Backend server is unreachable. Check API_BASE_URL in config.js or enable USE_MOCK_API.";
  }
}

function init() {
  els.sameItemToggle.addEventListener("change", (e) => {
    state.setSameItemMode(e.target.checked);
    renderItemInputs();
  });

  els.sharedItemInput.addEventListener("input", (e) => {
    state.setSharedItemText(e.target.value);
  });

  els.clearSelectionBtn.addEventListener("click", () => {
    state.clearSelection();
    showErrors([]);
    renderAll();
  });

  els.payButton.addEventListener("click", handleSubmit);

  els.newBookingBtn.addEventListener("click", () => {
    els.receiptSection.classList.add("hidden");
  });

  renderAll();
  wakeBackendAndSyncWindow();
}

init();