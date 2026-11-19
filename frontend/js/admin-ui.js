import { apiClient } from "./api-client.js";

const els = {
  mockBadge: document.getElementById("admin-mock-badge"),
  startDateInput: document.getElementById("filter-start-date"),
  endDateInput: document.getElementById("filter-end-date"),
  refreshBtn: document.getElementById("refresh-btn"),
  printBtn: document.getElementById("print-btn"),
  csvBtn: document.getElementById("csv-btn"),
  summaryBar: document.getElementById("admin-summary-bar"),
  scheduleContainer: document.getElementById("schedule-container"),
  errorBox: document.getElementById("admin-error-box"),
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
    <span class="font-semibold text-slate-900">${data.total_orders}</span> Paid Order(s)
    <span class="mx-2 text-slate-300">|</span>
    Total Revenue: <span class="font-bold text-emerald-700">₹${totalInr}</span>
  `;

  if (!data.groups || data.groups.length === 0) {
    els.scheduleContainer.innerHTML = `
      <div class="rounded-xl border border-dashed border-slate-300 bg-white p-8 text-center text-slate-500">
        No confirmed (PAID) orders found for the selected range.
      </div>
    `;
    return;
  }

  els.scheduleContainer.innerHTML = data.groups
    .map((group) => {
      const groupInr = (group.total_amount_paise / 100).toFixed(0);
      const rowsHtml = group.orders
        .map(
          (order, idx) => `
          <tr class="border-t border-slate-100 hover:bg-slate-50">
            <td class="px-4 py-2.5 text-xs text-slate-500">${idx + 1}</td>
            <td class="px-4 py-2.5 text-sm font-medium text-slate-900">${escapeHtml(order.customer_name)}</td>
            <td class="px-4 py-2.5 text-sm text-slate-600">${escapeHtml(order.customer_phone)}</td>
            <td class="px-4 py-2.5 text-sm font-medium text-indigo-700">${escapeHtml(order.item_text)}</td>
            <td class="px-4 py-2.5 text-xs font-mono text-slate-500">${escapeHtml(order.booking_id.slice(0, 8))}…</td>
          </tr>`
        )
        .join("");

      return `
        <section class="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm break-inside-avoid">
          <header class="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 bg-slate-50 px-4 py-3">
            <h2 class="text-base font-bold text-slate-900">
              ${escapeHtml(group.formatted_date)}
              <span class="ml-2 text-sm font-semibold text-indigo-700">
                — ${group.order_count} ${group.order_count === 1 ? "Order" : "Orders"} | ₹${groupInr}
              </span>
            </h2>
            <span class="text-xs font-mono text-slate-500">${escapeHtml(group.service_date)}</span>
          </header>
          <div class="overflow-x-auto">
            <table class="w-full text-left border-collapse">
              <thead>
                <tr class="bg-white text-[11px] font-semibold uppercase tracking-wider text-slate-500">
                  <th class="px-4 py-2 w-12">#</th>
                  <th class="px-4 py-2">Customer</th>
                  <th class="px-4 py-2">Phone</th>
                  <th class="px-4 py-2">Item / Custom Text</th>
                  <th class="px-4 py-2">Booking ID</th>
                </tr>
              </thead>
              <tbody>${rowsHtml}</tbody>
            </table>
          </div>
        </section>
      `;
    })
    .join("");
}

async function loadSchedule() {
  els.errorBox.classList.add("hidden");
  els.scheduleContainer.innerHTML =
    '<p class="text-sm text-slate-500">Loading chronological schedule...</p>';

  try {
    const data = await apiClient.getAdminSchedule(
      els.startDateInput.value,
      els.endDateInput.value
    );
    renderSchedule(data);
  } catch (err) {
    els.errorBox.textContent = err.message || "Failed to load admin schedule.";
    els.errorBox.classList.remove("hidden");
    els.scheduleContainer.innerHTML = "";
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
    link.download = "daily-booking-schedule.csv";
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
  els.refreshBtn.addEventListener("click", loadSchedule);
  els.printBtn.addEventListener("click", () => window.print());
  els.csvBtn.addEventListener("click", handleDownloadCsv);
  loadSchedule();
}

init();
