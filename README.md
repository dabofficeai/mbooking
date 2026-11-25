# Mass Booking — Full-Stack Multi-Date Holy Mass Booking App

Production-structured full-stack application for booking Holy Mass offerings across a 30-day rolling calendar, engineered with strict Separation of Concerns (SoC) and 100% independent testability across Frontend, Backend, and Database layers for zero-cost cloud deployment (no credit card required).

---

## Architecture Overview

- **Frontend (`/frontend`)**: Vanilla HTML5 + Tailwind CSS (CDN) + modular ES6 JavaScript. Includes `USE_MOCK_API` mode (`localStorage` simulator) for standalone browser testing without a backend.
- **Backend (`/backend`)**: Python 3.11+ FastAPI with layered architecture (`routers` → `services` → `repositories` + `gateways`), Pydantic v2 validation, and `Depends()` injection.
- **Database**: Neon Serverless PostgreSQL (SQLAlchemy 2.0 + `psycopg2-binary`), with in-memory SQLite in `pytest` for fast offline DB tests.
- **Payments**: Razorpay Test Mode (`Orders API` + Checkout JS + `/api/bookings/verify-payment` + `HMAC-SHA256` idempotent webhook), plus `FakePaymentProvider` for offline/test mode.

---

## Key Features & Database Schema

### Features
- **30-Day Rolling Calendar (IST)**: Displays `today` through `today + 29` in `Asia/Kolkata`, with Sundays highlighted in rose and Feast override dates highlighted in amber.
- **Dynamic Mass Timings**:
  - **Permanent Weekday & Sunday Defaults** (`mass_default_rules`): Default Weekday (`06:00 AM Telugu`, `06:00 PM English`) and Sunday (`06:00 AM Telugu`, `07:00 AM English`, `06:00 PM English`) schedules—editable anytime from `admin.html`.
  - **Single-Date Feast Overrides** (`mass_date_overrides`): Override Mass timings for specific Feast/Holy days from `admin.html`.
- **Flexible Selection & Intentions**:
  - Book one or multiple Mass timings per day, or the same timing across multiple selected days.
  - Unlimited devotees/intentions per Mass slot.
  - Optional devotee name (no phone number required), 50-character Mass intention with quick templates, and "Same for all" or per-Mass intention modes.
  - Server-side pricing (configurable `PRICE_PER_MASS_PAISE`, default `10000` = ₹100/Mass).
- **Admin Operations (`/admin.html`)**:
  - Confirmed (`PAID`) offerings grouped **day-wise and mass-wise**, with **Print Sheet** and **Download CSV** export.
  - **End-of-Day Payment Tally** & audit log timeline (`ORDER_CREATED`, `PAYMENT_VERIFIED`, `WEBHOOK_PAID`, `WEBHOOK_FAILED`).

### Database Tables (`backend/models/booking.py`)
- `mass_default_rules`: Permanent `WEEKDAY` and `SUNDAY` Mass timings and optional per-Mass pricing.
- `mass_date_overrides`: Date-specific Feast/Holy day Mass schedules.
- `bookings`: Order header (`id`, `customer_name`, `total_masses`, `total_amount_paise`, `gateway_name`, `gateway_order_id`, `gateway_payment_id`, `status`, `created_at`).
- `booking_items`: Per-Mass offering line items (`service_date`, `mass_time`, `mass_language`, `mass_label`, `intention_text`, `amount_paise`).
- `payment_logs`: Append-only audit trail for end-of-day payment reconciliation.

---

## 1. Running Independent Tests Locally

### A. Backend & Database Tests (`pytest`)
All repository, gateway, and API tests run offline using an isolated in-memory SQLite database and `FakePaymentProvider`.

```bash
cd backend
python -m venv .venv
source .venv/bin/activate   # Windows: .venv\Scripts\activate
pip install -r requirements.txt
pytest -v
```

- `tests/test_repository.py`: Multi-user same-Mass inserts, payment log creation, and Feast date overrides.
- `tests/test_gateway.py`: Razorpay `create_order` delegation and `HMAC-SHA256` valid/invalid webhook signatures.
- `tests/test_api_endpoints.py`: 30-day IST window, permanent `PUT /api/admin/default-rules`, Feast overrides, 50-char intention validation, webhook idempotency, day+mass admin grouping, and payment tally.

### B. Frontend Unit Tests (`node --test`)
Zero `npm install` required (uses Node.js 18+ built-in test runner):

```bash
cd frontend
node --test tests/calendar-state.test.js
```

### C. Standalone Frontend Browser Mode (No Backend Needed)
1. Open `frontend/config.js` and set `USE_MOCK_API: true`.
2. Serve `/frontend` locally (e.g., `python3 -m http.server 5500` inside `/frontend`).
3. Open `http://localhost:5500/index.html` and `http://localhost:5500/admin.html`.

---

## 2. Zero-Cost Cloud Deployment (Neon + Render + Cloudflare Pages + Razorpay)

### Step 1: Neon Serverless PostgreSQL
1. Create a free project at Neon and open **Connect → Connection pooling**.
2. Copy the `postgresql://...` connection string and replace the prefix with `postgresql+psycopg2://` for SQLAlchemy 2.0 compatibility.
3. On first startup, FastAPI automatically creates all 5 tables and seeds default Weekday & Sunday Mass rules.

### Step 2: Render Free Web Service (Backend)
1. Create a **New → Web Service** from your GitHub repo:
   - **Root Directory**: `backend`
   - **Runtime**: `Python 3`
   - **Build Command**: `pip install -r requirements.txt`
   - **Start Command**: `uvicorn main:app --host 0.0.0.0 --port $PORT`
   - **Instance Type**: `Free`
2. Set Environment Variables:
   - `PYTHON_VERSION`: `3.11.11`
   - `DATABASE_URL`: `postgresql+psycopg2://...` (from Neon)
   - `PAYMENT_PROVIDER`: `razorpay` (or `fake` for testing without Razorpay keys)
   - `RAZORPAY_KEY_ID`: Your `rzp_test_...` Key ID
   - `RAZORPAY_KEY_SECRET`: Your Razorpay Test Key Secret
   - `RAZORPAY_WEBHOOK_SECRET`: Your Razorpay Webhook Secret
   - `FRONTEND_URL`: `https://<your-site>.pages.dev`
   - `PRICE_PER_MASS_PAISE`: `10000` (optional, defaults to `10000` = ₹100)

### Step 3: Razorpay Test Mode Webhook
1. Switch Razorpay Dashboard to **Test Mode**.
2. Go to **Account & Settings → Webhooks → Add New Webhook**:
   - **Webhook URL**: `https://<your-render-app>.onrender.com/api/webhooks/razorpay`
   - **Secret**: Exact same value as `RAZORPAY_WEBHOOK_SECRET` on Render
   - **Active Events**: `payment.captured`, `order.paid`, `payment.failed`

### Step 4: Cloudflare Pages (Frontend)
1. Update `frontend/config.js`:
   - `API_BASE_URL`: `https://<your-render-app>.onrender.com`
   - `RAZORPAY_KEY_ID`: Your `rzp_test_...` Key ID
   - `USE_MOCK_API`: `false`
2. On Cloudflare Dashboard → **Workers & Pages → Create → Pages → Connect to Git**, set **Build output directory** to `frontend` (leave Build command empty) and deploy.

---

## 3. Planned Security Hardening (Before Production Live Mode)
- Protect `/api/admin/*` routes in `backend/routers/admin_routes.py` with a `require_admin` dependency (`ADMIN_SECRET` / token check) and add an admin passcode gate to `admin.html` (or Cloudflare Zero Trust Access).
- Remove the `Admin Schedule` shortcut link from `index.html` (admins access `/admin` directly).
- Add rate limiting on `POST /api/bookings` via Cloudflare WAF or `slowapi`.
- Keep `FRONTEND_URL` strictly pinned to your production Cloudflare Pages origin.
