# ₹100/Day Multi-Date Item Booking Web App

Production-structured full-stack prototype with strict Separation of Concerns (SoC) and 100% independent testability across Frontend, Backend, and Database layers, designed for zero-cost cloud deployment (no credit card required).

## Architecture Overview

- **Frontend (`/frontend`)**: Vanilla HTML5 + Tailwind CSS (CDN) + modular ES6 JavaScript. Includes `USE_MOCK_API` mode (`localStorage` simulator) for standalone browser testing without a backend.
- **Backend (`/backend`)**: Python 3.11+ FastAPI with layered architecture (`routers` → `services` → `repositories` + `gateways`), Pydantic v2 validation, and `Depends()` injection.
- **Database**: Neon Serverless PostgreSQL (SQLAlchemy 2.0 + `psycopg2-binary`), with in-memory SQLite in `pytest` for fast offline DB tests.
- **Payments**: Razorpay Test Mode (`Orders API` + Checkout JS + `HMAC-SHA256` webhook verification with idempotency), plus `FakePaymentProvider` for offline testing.

---

## 1. Running Independent Tests Locally

### A. Backend & Database Tests (`pytest`)
All backend, repository, gateway, and API tests run offline using an isolated in-memory SQLite database and `FakePaymentProvider`.

```bash
cd backend
python -m venv .venv
source .venv/bin/activate   # Windows: .venv\Scripts\activate
pip install -r requirements.txt
pytest -v
```

- `tests/test_repository.py`: Tests multi-user same-date inserts, PAID vs PENDING filtering, and chronological ordering.
- `tests/test_gateway.py`: Tests Razorpay `create_order` delegation and `HMAC-SHA256` valid/invalid webhook signatures.
- `tests/test_api_endpoints.py`: Tests 30-day IST window boundaries, `₹100 × N` server-side pricing, webhook signature enforcement, webhook idempotency, and admin schedule/CSV export.

### B. Frontend Unit Tests (`node --test`)
Zero `npm install` required (uses Node.js 18+ built-in test runner):

```bash
cd frontend
node --test tests/calendar-state.test.js
```

### C. Standalone Frontend Browser Mode (No Backend Needed)
1. Open `frontend/config.js` and set `USE_MOCK_API: true`.
2. Serve `/frontend` with any static server (e.g., `python3 -m http.server 5500` inside `/frontend`).
3. Open `http://localhost:5500/index.html` to book dates and simulate payment, then open `http://localhost:5500/admin.html` to view the date-grouped schedule, print, or export CSV.

---

## 2. Zero-Cost Cloud Deployment Guide (No Credit Card Required)

### Step 1: Neon Serverless PostgreSQL (Free Tier)
1. Create a free account at Neon and create a new project/database.
2. Copy the connection string (ensure `?sslmode=require` is included).

### Step 2: Razorpay Test Mode
1. Create a Razorpay account and switch the dashboard toggle to **Test Mode**.
2. Generate **Test API Keys** (`RAZORPAY_KEY_ID` and `RAZORPAY_KEY_SECRET`).
3. Under **Webhooks**, create a webhook (after Step 3 gives you your Render URL):
   - **Webhook URL**: `https://<your-render-app>.onrender.com/api/webhooks/razorpay`
   - **Secret**: Set a strong secret (copy as `RAZORPAY_WEBHOOK_SECRET`)
   - **Active Events**: Check `payment.captured`, `order.paid`, and `payment.failed`.

### Step 3: Render Free Web Service (Backend)
1. Push this repository to GitHub.
2. On Render, click **New → Web Service** and connect your GitHub repo.
3. Configure:
   - **Root Directory**: `backend`
   - **Runtime**: `Python 3`
   - **Build Command**: `pip install -r requirements.txt`
   - **Start Command**: `uvicorn main:app --host 0.0.0.0 --port $PORT`
   - **Instance Type**: `Free`
4. Add Environment Variables:
   - `DATABASE_URL`: Your Neon PostgreSQL URL
   - `PAYMENT_PROVIDER`: `razorpay`
   - `RAZORPAY_KEY_ID`: Your Test Key ID
   - `RAZORPAY_KEY_SECRET`: Your Test Key Secret
   - `RAZORPAY_WEBHOOK_SECRET`: Your Razorpay Webhook Secret
   - `FRONTEND_URL`: Your Cloudflare Pages URL (e.g., `https://daily-booking.pages.dev`)

### Step 4: Cloudflare Pages (Frontend)
1. Update `frontend/config.js`:
   - `API_BASE_URL`: `https://<your-render-app>.onrender.com`
   - `RAZORPAY_KEY_ID`: Your Razorpay Test Key ID
   - `USE_MOCK_API`: `false`
2. On Cloudflare Dashboard → **Workers & Pages → Create → Pages → Connect to Git**.
3. Set **Build output directory** to `frontend` (leave Build command empty) and deploy.
