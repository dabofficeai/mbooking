import { apiClient } from "./api-client.js";

const els = {
  mockBadge: document.getElementById("admin-mock-badge"),
  startDateInput: document.getElementById("filter-start-date"),
  endDateInput: document.getElementById("filter-end-date"),
  refreshBtn: document.getElementById("refresh-btn"),
  printBtn: document.getElementById("print-btn"),
  csvBtn: document.getElementById("csv-btn"),
  summaryBar: document.getElementById("admin-summary-bar"),
  tallyBar: document.getElementById("payment-tally-bar"),
  logsBody: document.getElementById("payment-logs-body"),
  scheduleContainer: document.getElementById("schedule-container"),
  errorBox: document.getElementById("admin-error-box"),
  ovDate: document.getElementById("ov-date"),
  ovOccasion: document.getElementById("ov-occasion"),
  ovMasses: document.getElementById("ov-masses"),
  ovSaveBtn: document.getElementById("ov-save-btn"),
  ovDeleteBtn: document.getElementById("ov-delete-btn"),
  ovStatus: document.getElementById("ov-status"),
};

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function renderSchedule(data) {
  const totalInr = (data.total_amount_paise / 100).toFixed(0);
  els.summaryBar.innerHTML = `
    <span class="font-semibold text-slate-900">${data.groups.length}</span> Active Date(s)
    <span class="mx-2 text-slate-300">|</span>
    <span class="font-semibold text-slate-900">${data.total_offerings}</span> Paid Mass Offering(s)
    <span class="mx-2 text-slate-300">|</span>
    Total Offering: <span class="font-bold text-emerald-700">₹${totalInr}</span>
  `;

  if (!data.groups || data.groups.length === 0) {
    els.scheduleContainer.innerHTML = `
      <div class="rounded-xl border border-dashed border-slate-300 bg-white p-8 text-center text-slate-500">
        No confirmed (PAID) Mass offerings found for the selected range.
      </div>
    `;
    return;
  }

  els.scheduleContainer.innerHTML = data.groups
    .map((group) => {
      const groupInr = (group.total_amount_paise / 100).toFixed(0);
      const sundayBadge = group.is_sunday
        ? '<span class="ml-2 rounded bg-rose-100 px-2 py-0.5 text-[10px] font-bold uppercase text-rose-800">Sunday</span>'
        : "";

      const massesHtml = group.masses
        .map((mass) => {
          const massInr = (mass.total_amount_paise / 100).toFixed(0);
          const rowsHtml = mass.offerings
            .map(
              (offering, idx) => `
              <tr class="border-t border-slate-100 hover:bg-slate-50">
                <td class="px-4 py-2 text-xs text-slate-500 w-10">${idx + 1}</td>
                <td class="px-4 py-2 text-sm font-medium text-slate-900">${escapeHtml(
                  offering.intention_text
                )}</td>
                <td class="px-4 py-2 text-sm text-slate-600">${escapeHtml(
                  offering.customer_name || "—"
                )}</td>
                <td class="px-4 py-2 text-xs font-mono text-slate-500">${escapeHtml(
                  offering.booking_id.slice(0, 8)
                )}…</td>
              </tr>`
            )
            .join("");

          return `
            <div class="border-t border-slate-200">
              <div class="flex items-center justify-between bg-indigo-50/70 px-4 py-2">
                <h3 class="text-sm font-bold text-indigo-900">${escapeHtml(
                  mass.mass_label
                )}</h3>
                <span class="text-xs font-semibold text-indigo-800">
                  ${mass.offering_count} ${
            mass.offering_count === 1 ? "Intention" : "Intentions"
          } | ₹${massInr}
                </span>
              </div>
              <div class="overflow-x-auto">
                <table class="w-full text-left border-collapse">
                  <thead>
                    <tr class="bg-white text-[11px] font-semibold uppercase tracking-wider text-slate-500">
                      <th class="px-4 py-1.5">#</th>
                      <th class="px-4 py-1.5">Mass Intention</th>
                      <th class="px-4 py-1.5">Offered By</th>
                      <th class="px-4 py-1.5">Booking ID</th>
                    </tr>
                  </thead>
                  <tbody>${rowsHtml}</tbody>
                </table>
              </div>
            </div>
          `;
        })
        .join("");

      return `
        <section class="overflow-hidden rounded-xl border ${
          group.is_sunday ? "border-rose-200" : "border-slate-200"
        } bg-white shadow-sm break-inside-avoid">
          <header class="flex flex-wrap items-center justify-between gap-2 ${
            group.is_sunday ? "bg-rose-50" : "bg-slate-50"
          } px-4 py-3">
            <h2 class="text-base font-bold text-slate-900">
              ${escapeHtml(group.formatted_date)}${sundayBadge}
              <span class="ml-2 text-sm font-semibold text-emerald-700">
                — ${group.offering_count} ${
        group.offering_count === 1 ? "Offering" : "Offerings"
      } | ₹${groupInr}
              </span>
            </h2>
            <span class="text-xs font-mono text-slate-500">${escapeHtml(
              group.service_date
            )}</span>
          </header>
          ${massesHtml}
        </section>
      `;
    })
    .join("");
}

function renderTally(tally) {
  els.tallyBar.innerHTML = `
    <div class="grid grid-cols-1 sm:grid-cols-3 gap-3">
      <div class="rounded-xl border border-emerald-200 bg-emerald-50 p-3">
        <p class="text-xs font-semibold uppercase text-emerald-800">Paid (Success)</p>
        <p class="mt-1 text-lg font-bold text-emerald-900">${tally.paid_count} orders · ₹${(
    tally.paid_amount_paise / 100
  ).toFixed(0)}</p>
      </div>
      <div class="rounded-xl border border-amber-200 bg-amber-50 p-3">
        <p class="text-xs font-semibold uppercase text-amber-800">Pending</p>
        <p class="mt-1 text-lg font-bold text-amber-900">${tally.pending_count} orders · ₹${(
    tally.pending_amount_paise / 100
  ).toFixed(0)}</p>
      </div>
      <div class="rounded-xl border border-rose-200 bg-rose-50 p-3">
        <p class="text-xs font-semibold uppercase text-rose-800">Failed</p>
        <p class="mt-1 text-lg font-bold text-rose-900">${tally.failed_count} orders · ₹${(
    tally.failed_amount_paise / 100
  ).toFixed(0)}</p>
      </div>
    </div>
  `;

  if (!tally.recent_logs || tally.recent_logs.length === 0) {
    els.logsBody.innerHTML =
      '<tr><td colspan="5" class="px-3 py-3 text-center text-xs text-slate-500">No payment events logged yet.</td></tr>';
    return;
  }

  els.logsBody.innerHTML = tally.recent_logs
    .map(
      (l) => `
      <tr class="border-t border-slate-100 text-xs">
        <td class="px-3 py-2 font-mono text-slate-600">${escapeHtml(
          new Date(l.created_at).toLocaleString("en-IN")
        )}</td>
        <td class="px-3 py-2 font-semibold text-slate-800">${escapeHtml(l.event_type)}</td>
        <td class="px-3 py-2"><span class="rounded px-1.5 py-0.5 font-semibold ${
          l.status === "PAID"
            ? "bg-emerald-100 text-emerald-800"
            : l.status === "FAILED"
            ? "bg-rose-100 text-rose-800"
            : "bg-amber-100 text-amber-800"
        }">${escapeHtml(l.status)}</span></td>
        <td class="px-3 py-2 font-semibold">₹${(l.amount_paise / 100).toFixed(0)}</td>
        <td class="px-3 py-2 font-mono text-slate-500">${escapeHtml(
          l.gateway_payment_id || l.gateway_order_id
        )}</td>
      </tr>`
    )
    .join("");
}

async function loadAllAdminData() {
  els.errorBox.classList.add("hidden");
  els.scheduleContainer.innerHTML =
    '<p class="text-sm text-slate-500">Loading day-wise & mass-wise schedule...</p>';

  try {
    const [schedule, tally] = await Promise.all([
      apiClient.getAdminSchedule(els.startDateInput.value, els.endDateInput.value),
      apiClient.getPaymentTally(els.startDateInput.value),
    ]);
    renderSchedule(schedule);
    renderTally(tally);
  } catch (err) {
    els.errorBox.textContent = err.message || "Failed to load admin dashboard.";
    els.errorBox.classList.remove("hidden");
    els.scheduleContainer.innerHTML = "";
  }
}

async function handleSaveOverride() {
  els.ovStatus.textContent = "";
  const serviceDate = els.ovDate.value;
  const occasion = els.ovOccasion.value.trim() || "Feast Day";
  const lines = els.ovMasses.value
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean);

  if (!serviceDate || lines.length === 0) {
    els.ovStatus.textContent = "Enter a date and at least 1 Mass line (e.g. 06:00 AM | Tamil).";
    return;
  }

  const masses = lines.map((line, idx) => {
    const [timePart, langPart] = line.split("|").map((s) => s.trim());
    return {
      mass_time: timePart || "06:00 AM",
      language: langPart || "English",
      sort_order: idx + 1,
    };
  });

  try {
    await apiClient.upsertDateOverride({
      service_date: serviceDate,
      occasion_label: occasion,
      masses,
    });
    els.ovStatus.textContent = `Saved ${masses.length} Mass(es) for ${serviceDate}.`;
  } catch (err) {
    els.ovStatus.textContent = err.message || "Failed to save override.";
  }
}

async function handleDeleteOverride() {
  const serviceDate = els.ovDate.value;
  if (!serviceDate) {
    els.ovStatus.textContent = "Select a date to reset.";
    return;
  }
  try {
    await apiClient.deleteDateOverride(serviceDate);
    els.ovStatus.textContent = `Reset ${serviceDate} back to default schedule.`;
  } catch (err) {
    els.ovStatus.textContent = err.message || "Failed to reset override.";
  }
}

async function handleDownloadCsv() {
  try {
    const csvText = await apiClient.downloadAdminCsv(
      els.startDateInput.value,
      els.endDateInput.value
    );
    const blob = new Blob([csvText], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "mass-booking-schedule.csv";
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  } catch (err) {
    els.errorBox.textContent = err.message || "Failed to export CSV.";
    els.errorBox.classList.remove("hidden");
  }
}

function init() {
  if (apiClient.isMockMode()) {
    els.mockBadge.classList.remove("hidden");
  }
  els.refreshBtn.addEventListener("click", loadAllAdminData);
  els.printBtn.addEventListener("click", () => window.print());
  els.csvBtn.addEventListener("click", handleDownloadCsv);
  els.ovSaveBtn.addEventListener("click", handleSaveOverride);
  els.ovDeleteBtn.addEventListener("click", handleDeleteOverride);
  loadAllAdminData();
}

init();
