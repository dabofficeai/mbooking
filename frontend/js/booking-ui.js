import { CONFIG } from "../config.js";
import { apiClient } from "./api-client.js";
import {
  INTENTION_TEMPLATES,
  MAX_INTENTION_LENGTH,
  MassBookingState,
  buildCalendarWindow,
  formatDateHuman,
  getIstTodayIso,
  offeringKey,
} from "./calendar-state.js";

const state = new MassBookingState(getIstTodayIso(), 30);

const els = {
  coldStartBanner: document.getElementById("cold-start-banner"),
  coldStartText: document.getElementById("cold-start-text"),
  mockModeBadge: document.getElementById("mock-mode-badge"),
  calendarGrid: document.getElementById("calendar-grid"),
  windowRangeLabel: document.getElementById("window-range-label"),
  massSelectionContainer: document.getElementById("mass-selection-container"),
  quickApplyContainer: document.getElementById("quick-apply-container"),
  sameIntentionToggle: document.getElementById("same-intention-toggle"),
  sharedIntentionSection: document.getElementById("shared-intention-section"),
  sharedIntentionInput: document.getElementById("shared-intention-input"),
  sharedCharCount: document.getElementById("shared-char-count"),
  templateChips: document.getElementById("template-chips"),
  perOfferingSection: document.getElementById("per-offering-section"),
  perOfferingList: document.getElementById("per-offering-list"),
  selectedCount: document.getElementById("selected-count"),
  totalAmount: document.getElementById("total-amount"),
  customerName: document.getElementById("customer-name"),
  errorBox: document.getElementById("form-error-box"),
  payButton: document.getElementById("pay-button"),
  receiptSection: document.getElementById("receipt-section"),
  receiptContent: document.getElementById("receipt-content"),
  newBookingBtn: document.getElementById("new-booking-btn"),
  clearSelectionBtn: document.getElementById("clear-selection-btn"),
};

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

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

function renderCalendar() {
  const days = buildCalendarWindow(state.startDateIso, state.windowDays);
  const first = days[0];
  const last = days[days.length - 1];
  els.windowRangeLabel.textContent = `${first.fullLabel} – ${last.fullLabel} (IST)`;

  els.calendarGrid.innerHTML = "";
  for (const day of days) {
    const daySched = state.getDaySchedule(day.iso);
    const isSelected = state.selectedDates.has(day.iso);
    const isSunday = day.isSunday;
    const isOverride = Boolean(daySched?.is_override);
    const chosenCount = Array.from(state.selectedOfferings.values()).filter(
      (o) => o.service_date === day.iso
    ).length;

    let colorClasses =
      "border-slate-200 bg-white text-slate-800 hover:border-indigo-300 hover:bg-indigo-50";
    if (isSelected && isSunday) {
      colorClasses = "border-rose-700 bg-rose-600 text-white shadow-sm";
    } else if (isSelected) {
      colorClasses = "border-indigo-600 bg-indigo-600 text-white shadow-sm";
    } else if (isSunday) {
      colorClasses =
        "border-rose-300 bg-rose-50 text-rose-900 hover:border-rose-400 hover:bg-rose-100";
    } else if (isOverride) {
      colorClasses =
        "border-amber-300 bg-amber-50 text-amber-900 hover:border-amber-400 hover:bg-amber-100";
    }

    const btn = document.createElement("button");
    btn.type = "button";
    btn.dataset.date = day.iso;
    btn.className = `relative flex flex-col items-center justify-center rounded-xl border p-2.5 text-center transition-all focus:outline-none focus:ring-2 focus:ring-indigo-500 ${colorClasses}`;

    const subColor = isSelected
      ? "text-white/80"
      : isSunday
      ? "text-rose-600 font-semibold"
      : "text-slate-500";

    const badgeHtml = isOverride
      ? `<span class="mt-1 rounded bg-amber-200/90 px-1.5 py-0.5 text-[9px] font-bold uppercase text-amber-900">${escapeHtml(
          daySched?.occasion_label || "Feast"
        )}</span>`
      : isSunday
      ? `<span class="mt-1 rounded ${
          isSelected ? "bg-rose-800 text-rose-100" : "bg-rose-200/80 text-rose-900"
        } px-1.5 py-0.5 text-[9px] font-bold uppercase">Sunday</span>`
      : "";

    const countPill =
      chosenCount > 0
        ? `<span class="absolute -top-1.5 -right-1.5 flex h-5 w-5 items-center justify-center rounded-full bg-emerald-500 text-[10px] font-bold text-white shadow">${chosenCount}</span>`
        : "";

    btn.innerHTML = `
      ${countPill}
      <span class="text-[11px] uppercase tracking-wide ${subColor}">${day.dayName}</span>
      <span class="mt-0.5 text-lg font-bold leading-tight">${day.dayNum}</span>
      <span class="text-[11px] ${subColor}">${day.monthShort}${day.isToday ? " · Today" : ""}</span>
      ${badgeHtml}
    `;

    btn.addEventListener("click", () => {
      state.toggleDate(day.iso);
      showErrors([]);
      renderAll();
    });

    els.calendarGrid.appendChild(btn);
  }
}

function renderMassSelection() {
  const selectedDates = state.getSortedSelectedDates();

  if (selectedDates.length === 0) {
    els.quickApplyContainer.classList.add("hidden");
    els.quickApplyContainer.innerHTML = "";
    els.massSelectionContainer.innerHTML =
      '<p class="text-sm text-slate-500 italic">Click one or more dates on the calendar above to choose Mass timings.</p>';
    return;
  }

  // Build quick-apply buttons across selected dates when > 1 date is selected
  if (selectedDates.length > 1) {
    const labelSet = new Set();
    for (const d of selectedDates) {
      const sched = state.getDaySchedule(d);
      for (const m of sched?.masses || []) {
        labelSet.add(m.mass_label);
      }
    }
    els.quickApplyContainer.classList.remove("hidden");
    els.quickApplyContainer.innerHTML = `
      <div class="flex flex-wrap items-center gap-2">
        <span class="text-xs font-semibold text-slate-600">Quick-select across all chosen dates:</span>
        ${Array.from(labelSet)
          .map(
            (lbl) => `
            <button type="button" data-quick-mass="${escapeHtml(lbl)}"
              class="rounded-full border border-indigo-200 bg-indigo-50 px-2.5 py-1 text-xs font-semibold text-indigo-700 hover:bg-indigo-100">
              + ${escapeHtml(lbl)}
            </button>`
          )
          .join("")}
      </div>
    `;
    els.quickApplyContainer.querySelectorAll("[data-quick-mass]").forEach((btn) => {
      btn.addEventListener("click", () => {
        state.applyMassTimingAcrossSelectedDates(btn.dataset.quickMass);
        showErrors([]);
        renderAll();
      });
    });
  } else {
    els.quickApplyContainer.classList.add("hidden");
    els.quickApplyContainer.innerHTML = "";
  }

  els.massSelectionContainer.innerHTML = "";
  for (const iso of selectedDates) {
    const sched = state.getDaySchedule(iso);
    const card = document.createElement("div");
    card.className = `rounded-xl border p-3 ${
      sched?.is_sunday
        ? "border-rose-200 bg-rose-50/50"
        : sched?.is_override
        ? "border-amber-200 bg-amber-50/50"
        : "border-slate-200 bg-slate-50/60"
    }`;

    const tag = sched?.is_override
      ? `<span class="ml-2 rounded bg-amber-200 px-1.5 py-0.5 text-[10px] font-bold text-amber-900">${escapeHtml(
          sched.occasion_label || "Special"
        )}</span>`
      : sched?.is_sunday
      ? '<span class="ml-2 rounded bg-rose-200 px-1.5 py-0.5 text-[10px] font-bold text-rose-900">Sunday</span>'
      : "";

    const header = document.createElement("div");
    header.className = "flex items-center justify-between mb-2";
    header.innerHTML = `<span class="text-xs font-bold text-slate-800">${escapeHtml(
      formatDateHuman(iso)
    )}${tag}</span>`;

    const pillsWrap = document.createElement("div");
    pillsWrap.className = "flex flex-wrap gap-2";

    for (const mass of sched?.masses || []) {
      const key = offeringKey(iso, mass.mass_label);
      const isChecked = state.selectedOfferings.has(key);
      const pill = document.createElement("button");
      pill.type = "button";
      pill.className = isChecked
        ? "rounded-lg border border-indigo-600 bg-indigo-600 px-3 py-1.5 text-xs font-semibold text-white shadow-sm"
        : "rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:border-indigo-400 hover:bg-indigo-50";
      pill.textContent = `${mass.mass_label} · ₹${(mass.amount_paise / 100).toFixed(0)}`;
      pill.addEventListener("click", () => {
        state.toggleMassOffering(iso, mass.mass_label);
        showErrors([]);
        renderAll();
      });
      pillsWrap.appendChild(pill);
    }

    card.appendChild(header);
    card.appendChild(pillsWrap);
    els.massSelectionContainer.appendChild(card);
  }
}

function renderTemplateChips() {
  els.templateChips.innerHTML = INTENTION_TEMPLATES.map(
    (tpl) => `
      <button type="button" data-tpl="${escapeHtml(tpl)}"
        class="rounded-full border border-slate-200 bg-slate-100 px-2.5 py-1 text-[11px] font-medium text-slate-700 hover:bg-indigo-50 hover:text-indigo-700 hover:border-indigo-200">
        ${escapeHtml(tpl.trim())}…
      </button>`
  ).join("");

  els.templateChips.querySelectorAll("[data-tpl]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const tpl = btn.dataset.tpl;
      if (state.sameIntentionMode) {
        state.setSharedIntentionText(tpl);
        els.sharedIntentionInput.value = tpl;
        els.sharedIntentionInput.focus();
        els.sharedCharCount.textContent = `${tpl.length}/${MAX_INTENTION_LENGTH}`;
      } else {
        const firstEmpty = els.perOfferingList.querySelector("input");
        if (firstEmpty) {
          firstEmpty.value = tpl;
          firstEmpty.dispatchEvent(new Event("input"));
          firstEmpty.focus();
        }
      }
    });
  });
}

function renderIntentionInputs() {
  const offerings = state.getSortedOfferings();
  els.sameIntentionToggle.checked = state.sameIntentionMode;

  if (state.sameIntentionMode) {
    els.sharedIntentionSection.classList.remove("hidden");
    els.perOfferingSection.classList.add("hidden");
    if (els.sharedIntentionInput.value !== state.sharedIntentionText) {
      els.sharedIntentionInput.value = state.sharedIntentionText;
    }
    els.sharedCharCount.textContent = `${state.sharedIntentionText.length}/${MAX_INTENTION_LENGTH}`;
  } else {
    els.sharedIntentionSection.classList.add("hidden");
    els.perOfferingSection.classList.remove("hidden");

    if (offerings.length === 0) {
      els.perOfferingList.innerHTML =
        '<p class="text-sm text-slate-500 italic">Select one or more Mass timings first.</p>';
      return;
    }

    els.perOfferingList.innerHTML = "";
    for (const entry of offerings) {
      const row = document.createElement("div");
      row.className = "rounded-lg border border-slate-200 bg-slate-50 p-2.5 space-y-1.5";

      const top = document.createElement("div");
      top.className = "flex items-center justify-between text-xs";
      top.innerHTML = `
        <span class="font-semibold text-slate-800">${escapeHtml(
          formatDateHuman(entry.service_date)
        )} · <span class="text-indigo-700">${escapeHtml(entry.mass_label)}</span></span>
        <span class="text-slate-500" data-count-for="${escapeHtml(entry.key)}">${
        entry.intention_text.length
      }/${MAX_INTENTION_LENGTH}</span>
      `;

      const input = document.createElement("input");
      input.type = "text";
      input.maxLength = MAX_INTENTION_LENGTH;
      input.placeholder = "Enter intention (max 50 chars)";
      input.value = entry.intention_text;
      input.className =
        "w-full rounded-md border border-slate-300 bg-white px-3 py-1.5 text-sm text-slate-900 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500";
      input.addEventListener("input", (e) => {
        state.setOfferingIntention(entry.key, e.target.value);
        const counter = row.querySelector(`[data-count-for="${CSS.escape(entry.key)}"]`);
        if (counter) {
          counter.textContent = `${e.target.value.length}/${MAX_INTENTION_LENGTH}`;
        }
      });

      row.appendChild(top);
      row.appendChild(input);
      els.perOfferingList.appendChild(row);
    }
  }
}

function renderSummary() {
  const totalMasses = state.getTotalMasses();
  const totalInr = state.getTotalAmountInr();
  els.selectedCount.textContent = `${totalMasses} ${
    totalMasses === 1 ? "Mass" : "Masses"
  }`;
  els.totalAmount.textContent = `₹${totalInr}`;
  els.payButton.textContent =
    totalMasses > 0
      ? `Pay ₹${totalInr} for ${totalMasses} ${totalMasses === 1 ? "Mass" : "Masses"}`
      : "Select Date & Mass Timing to Book";
}

function renderAll() {
  renderCalendar();
  renderMassSelection();
  renderIntentionInputs();
  renderSummary();
}

function showReceipt(booking) {
  els.receiptSection.classList.remove("hidden");
  const itemsHtml = booking.items
    .map(
      (i) => `
      <li class="flex flex-col sm:flex-row sm:items-center justify-between gap-1 border-b border-emerald-100 py-2 text-sm">
        <div>
          <span class="font-semibold text-slate-800">${escapeHtml(
            formatDateHuman(i.service_date)
          )}</span>
          <span class="ml-1.5 rounded bg-indigo-100 px-1.5 py-0.5 text-xs font-semibold text-indigo-800">${escapeHtml(
            i.mass_label
          )}</span>
        </div>
        <span class="text-slate-700">${escapeHtml(i.intention_text)}</span>
      </li>`
    )
    .join("");

  els.receiptContent.innerHTML = `
    <div class="space-y-2 text-sm text-slate-700">
      <p><span class="font-semibold">Status:</span> <span class="inline-block rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-semibold text-emerald-800">${escapeHtml(
        booking.status
      )}</span></p>
      ${
        booking.customer_name
          ? `<p><span class="font-semibold">Offered By:</span> ${escapeHtml(booking.customer_name)}</p>`
          : ""
      }
      <p><span class="font-semibold">Booking ID:</span> <code class="rounded bg-slate-100 px-1.5 py-0.5 text-xs">${escapeHtml(
        booking.booking_id
      )}</code></p>
      <p><span class="font-semibold">Order ID:</span> <code class="rounded bg-slate-100 px-1.5 py-0.5 text-xs">${escapeHtml(
        booking.gateway_order_id
      )}</code></p>
      ${
        booking.gateway_payment_id
          ? `<p><span class="font-semibold">Payment ID:</span> <code class="rounded bg-slate-100 px-1.5 py-0.5 text-xs">${escapeHtml(
              booking.gateway_payment_id
            )}</code></p>`
          : ""
      }
      <p><span class="font-semibold">Total Offering:</span> ₹${(
        booking.total_amount_paise / 100
      ).toFixed(0)} (${booking.total_masses} Mass${booking.total_masses === 1 ? "" : "es"})</p>
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

function openRazorpayCheckout(booking, customerName) {
  return new Promise((resolve, reject) => {
    if (typeof window.Razorpay !== "function") {
      reject(new Error("Razorpay Checkout script failed to load."));
      return;
    }
    const rzp = new window.Razorpay({
      key: CONFIG.RAZORPAY_KEY_ID,
      amount: booking.total_amount_paise,
      currency: "INR",
      name: "Mass Booking",
      description: `${booking.total_masses} Mass Offering(s)`,
      order_id: booking.gateway_order_id,
      prefill: customerName ? { name: customerName } : {},
      theme: { color: "#4f46e5" },
      handler: async (response) => {
        try {
          const verified = await apiClient.verifyRazorpayPayment({
            booking_id: booking.booking_id,
            razorpay_order_id: response.razorpay_order_id,
            razorpay_payment_id: response.razorpay_payment_id,
            razorpay_signature: response.razorpay_signature,
          });
          resolve(verified);
        } catch {
          try {
            resolve(await pollForPaidStatus(booking.booking_id));
          } catch (pollErr) {
            reject(pollErr);
          }
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
  const validation = state.validateForSubmission(els.customerName.value);
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
        validation.payload.customer_name
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
    if (win?.schedule?.length) {
      state.setSchedule(win.schedule, win.start_date, win.days || 30);
      renderAll();
    }
    els.coldStartBanner.classList.add("hidden");
  } catch {
    els.coldStartText.textContent =
      "Backend server is unreachable. Check API_BASE_URL in config.js or enable USE_MOCK_API.";
  }
}

function init() {
  renderTemplateChips();

  els.sameIntentionToggle.addEventListener("change", (e) => {
    state.setSameIntentionMode(e.target.checked);
    renderIntentionInputs();
  });

  els.sharedIntentionInput.addEventListener("input", (e) => {
    state.setSharedIntentionText(e.target.value);
    els.sharedCharCount.textContent = `${e.target.value.length}/${MAX_INTENTION_LENGTH}`;
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
