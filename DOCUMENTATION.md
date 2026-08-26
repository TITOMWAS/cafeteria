# 🍽 Synapse Cafeteria — Documentation

**Version 4.0** · Installable (PWA) campus meal pre-ordering platform · A Synapse Five product

Students and guests browse the menu, pay via **M-Pesa (PayHero)**, and pick up their meals without queuing. The **Cashier Console** runs the live counter queue with **real-time updates**; the **Management Console** handles analytics with **graphs & date ranges**, menu management with **image uploads**, full user/staff administration, and an audit trail. Missed meals are never lost — uncollected orders automatically become **carryovers redeemable at the next serving session** (e.g. a missed lunch becomes a supper entitlement). The **Management Console is strictly protected by two-factor authentication (TOTP)** — it can never be opened without a valid authenticator code — while staff accounts are provisioned by management and sign in with plain credentials.

---

## Table of Contents
1. [Architecture](#1-architecture)
2. [Tech Stack](#2-tech-stack)
3. [Quick Start](#3-quick-start)
4. [User Roles & Credentials](#4-user-roles--credentials)
5. [Student Registration Number Policy](#5-student-registration-number-policy)
6. [Two-Factor Authentication (Staff/Management)](#6-two-factor-authentication)
7. [Database Schema](#7-database-schema)
8. [API Reference](#8-api-reference)
9. [Feature Guide](#9-feature-guide)
10. [Missed-Meal Carryover Rules](#10-missed-meal-carryover-rules)
11. [Payment Flow (PayHero / M-Pesa)](#11-payment-flow-payhero--mpesa)
12. [Theming (Light & Dark Mode)](#12-theming-light--dark-mode)
13. [Environment Variables](#13-environment-variables)
14. [Running with Docker](#14-running-with-docker)
15. [Security Model](#15-security-model)
16. [Testing & CI](#16-testing--ci)
17. [Troubleshooting](#17-troubleshooting)

---

## 1. Architecture

```
┌─────────────────────┐   HTTP/JSON + SSE    ┌─────────────────────┐       SQL        ┌──────────────┐
│  React SPA (Vite)   │ ───────────────────► │  Express REST API   │ ───────────────► │  PostgreSQL  │
│  localhost:5173     │ ◄─────────────────── │  localhost:5001     │ ◄─────────────── │  :5433 (host)│
└─────────────────────┘      JWT bearer      └─────────┬───────────┘    pg driver    └──────────────┘
        ▲                                              │ HTTPS            ▲
        │ PWA install / offline shell                  ▼                  │ node-cron sweeps
┌───────┴─────────────┐                      ┌───────────────┐   ┌────────┴─────────┐
│ Service worker (sw.js)│                     │ PayHero Gateway│  │ Session scheduler │
└─────────────────────┘                      │ (M-Pesa STK)  │  │ carryovers/expiry │
                                             └───────────────┘  └──────────────────┘
```

- **Frontend**: single-page React app (lazy-loaded routes). Access token + refresh token in `localStorage`; cart/theme/toast via React context. An `ErrorBoundary` wraps the whole app so a crash shows a recovery screen instead of a blank page.
- **Backend**: Express API with JWT auth (short-lived access tokens + 7-day refresh tokens), role-based access control, server-side payment verification, Server-Sent Events for live order push, and a `node-cron` scheduler for session sweeps.
- **Database**: PostgreSQL running in Docker, auto-initialized from `backend/schema.sql`.
- **Payments**: PayHero triggers an M-Pesa STK push; the backend verifies the transaction before accepting any order.

---

## 2. Tech Stack

| Layer | Technology |
|---|---|
| Frontend | React 18, Vite, React Router 6, lucide-react icons, qrcode.react |
| Tests | Vitest (+ Node assert), CI via GitHub Actions |
| Styling | Hand-crafted CSS design system (`src/index.css`) with light/dark tokens |
| Backend | Node.js 18+, Express 5, jsonwebtoken, bcryptjs, express-rate-limit, compression |
| Realtime | Server-Sent Events (`/api/orders/stream`) — no extra client library needed |
| Jobs | node-cron — session-end sweeps every day at 10:05 / 15:05 + expiry check every 5 min |
| Uploads | multer (disk storage → `backend/uploads`, served at `/uploads/*`, 5 MB limit) |
| Database | PostgreSQL 16 (Docker), schema + seed in `backend/schema.sql` |
| Payments | PayHero API v2 — Basic auth, M-Pesa STK push, transaction status verification |
| 2FA | RFC 6238 TOTP implemented with Node's built-in `crypto` (zero extra deps) |

### Project Structure

```
CAFTERIA-SYSTEM/
├── package.json               # Root scripts: setup / db / dev (runs both apps)
├── docker-compose.yml         # Postgres (+ optional app containers)
├── .github/workflows/ci.yml   # CI: backend syntax+boot, frontend tests+build, docker builds
│
├── backend/
│   ├── index.js               # Express entry: CORS, static /uploads, routes, scheduler start
│   ├── schema.sql             # Tables (incl. carryovers/favourites/ratings/audit/resets),
│   │                          #   seeds, migration guards, indexes
│   ├── uploads/               # Uploaded meal images (created automatically)
│   ├── config/database.js     # pg Pool from DATABASE_URL
│   ├── middleware/            # authMiddleware (JWT + roles), validation, errors
│   ├── utils/
│   │   ├── totp.js            # RFC 6238 TOTP
│   │   ├── events.js          # EventEmitter powering SSE order updates
│   │   ├── scheduler.js       # session windows, missed-meal sweeps, expiry cron
│   │   ├── auditLogger.js     # write-once helper for the audit trail
│   │   └── validators.js      # student reg-number format (strict)
│   ├── controllers/
│   │   ├── authController.js  # login, staff login (2FA), register, refresh,
│   │   │                      #   forgot/reset password, TOTP setup/reset
│   │   ├── productController.js # meals CRUD + image upload + ratings
│   │   ├── orderController.js # orders (pagination/search/SSE/export) + analytics + PayHero
│   │   ├── carryOverController.js # missed-meal list/redeem endpoints
│   │   ├── favouritesController.js
│   │   ├── userController.js  # profile + admin user management (search/pagination)
│   │   └── auditController.js
│   └── routes/                # auth/product/order/user/notification/favourites/audit routes
│
└── frontend/
    └── src/
        ├── App.jsx            # Routes incl. /kitchen; global ErrorBoundary
        ├── index.css          # Design tokens for BOTH themes + print styles
        ├── pages/             # Landing, SecureAccess, StudentPortal, GuestPortal,
        │                      # CashierDashboard, AdminDashboard, StudentProfile, KitchenDisplay
        ├── components/        # Navbar, MealCard, MealPortal, CartDrawer, SettingsPanel,
        │                      # ErrorBoundary, charts (Trend/Donut/HBar/StatusBars), InstallPrompt
        ├── context/           # AuthContext, CartContext, ThemeContext, ToastContext
        ├── services/api.js    # Fetch wrappers + transparent 401→refresh→retry logic
        ├── utils/session.js   # Session windows, KES/date formatting, status styles
        └── utils/*.test.jsx   # Vitest unit tests
```

---

## 3. Quick Start

> Prereqs: **Node.js 18+**, **Docker**

```bash
# 1. Install everything (root + backend + frontend)
npm run setup

# 2. Start the database (auto-creates & seeds tables)
npm run db

# 3. Run backend + frontend together
npm run dev
```

- Web app → http://localhost:5173
- API → http://localhost:5001/api/health

Useful extras:

```bash
npm run db:reset      # wipe DB volume & re-seed from scratch
npm run build         # production frontend build
cd frontend && npm test   # unit tests (vitest)
```

<details>
<summary>Manual setup (without root scripts)</summary>

```bash
docker compose up -d                       # database
cd backend  && npm install && npm run dev  # API on :5001
cd frontend && npm install && npm run dev  # UI on :5173
```
</details>

> **Existing database?** Re-run `backend/schema.sql` once — every change ships as an idempotent migration guard (new tables, `orders.served_at`, demo-student reg-number update).

---

## 4. User Roles & Credentials

| Role | Dashboard | Where they sign in | Credentials |
|---|---|---|---|
| **Student** | `/student` portal | Landing page → Student card | Reg number `CT207/119148/24` / password `password` (demo) |
| **Guest** | `/guest` ordering | Landing page → Guest card | No account needed — name + M-Pesa phone at checkout |
| **Cashier** | `/cashier` console | `/secure-access` page only | `staff@cafeteria.ac.ke` / password `password` |
| **Management** | `/admin` console | `/secure-access` page only | `admin@cafeteria.ac.ke` / password `password` + **2FA code (mandatory)** |
| **Kitchen** | `/kitchen` display | Same JWT as staff/admin | Big-screen cooking queue (link in navbar & cashier console) |

⚠️ All seeded accounts use the password **`password`** (bcrypt hash in `backend/schema.sql`). Change them for any real deployment.

**Staff provisioning:** cashier accounts are created by management (**Admin → Users & Staff**) and sign in with just email + password — no authenticator needed.

**First-time management login:** no TOTP secret is seeded. Go to `/secure-access`, enter your admin email + password, press **"Set up 2FA"**, scan the QR code, then sign in with the 6-digit code. Until enrolled — and on every login after — the management console refuses access without a valid code (`TOTP_ENROLLMENT_REQUIRED` / `TOTP_REQUIRED`).

### Capability matrix

| Capability | Student | Guest | Cashier | Management |
|---|:-:|:-:|:-:|:-:|
| Browse menu, order & pay | ✅ | ✅ | — | — |
| Favourites ♥ + one-tap Buy Again | ✅ | — | — | — |
| Rate meals (1–5 ★ after pickup) | ✅ | — | — | — |
| Printable receipts | ✅ | — | — | — |
| See own missed-meal vouchers | ✅ | — | — | — |
| Live queue, status updates, ETA | — | — | ✅ | ✅ |
| Redeem missed-meal carryovers | — | — | ✅ | ✅ |
| Kitchen display mode | — | — | ✅ | ✅ |
| Menu CRUD + image upload | — | — | — | ✅ |
| Graphs, date-range analytics, CSV export | — | — | — | ✅ |
| User/staff management (multi-staff) | — | — | — | ✅ |
| Audit log, notifications, CSV reports | — | — | — | ✅ |

Every dashboard (student portal via Profile page, cashier console, management console) has a **Settings** area: edit name/phone, switch theme, change password.

---

## 5. Student Registration Number Policy

Registration numbers are **strictly validated** on both the client and the server:

```
CT207/119148/24
└─┬─┘└──┬───┘└┬┘
  │     │     └─ year of study/session — EXACTLY 2 digits
  │     └─ serial number — EXACTLY 6 digits (no more, no fewer)
  └─ course code — 2–3 letters followed by exactly 3 digits
```

| Example | Valid? | Why |
|---|:-:|---|
| `CT207/119148/24` | ✅ | Canonical format |
| `ct207/119148/24` | ✅ | Auto-normalised to uppercase everywhere (input field, API, storage, login lookup) |
| `CT207/11914/24` | ❌ | Middle segment must be exactly 6 digits |
| `CT207/1191488/24` | ❌ | 7 digits — rejected |
| `CT207/119148/2024` | ❌ | Year must be exactly 2 digits |
| `STUDENT001` | ❌ | Legacy/demo style no longer accepted for students |

- Enforced in: **Admin → Users & Staff → Add/Edit user**, `POST /api/users`, `PATCH /api/users/:id`, `POST /api/auth/register`.
- The student **login** field accepts any case and normalises before lookup.
- Staff/admin accounts keep using emails — the rule applies only to `role = 'student'`.

---

## 6. Two-Factor Authentication

Staff and management logins live on `/secure-access`. Management logins require a rotating 6-digit code from any TOTP authenticator app — **there is no way into the management console without it**. Cashier staff skip the code entirely.

```
Management (first login)              Management (every later login)
------------------------              ------------------------------
email + password                      email + password + 6-digit TOTP code
        │                                        │
        ▼                                        ▼
"Set up 2FA" → QR code (otpauth://)     backend verifies password AND
scan with authenticator app             TOTP within ±30s clock window
        │                                        ▼
        ▼                                access token (12 h) +
sign in                                  refresh token (7 d)

Staff: email + password only → tokens (no OTP; accounts are admin-provisioned)
```

**Endpoints**
- `POST /api/auth/totp/setup` — `{ email, password }` → stores a Base32 secret, returns an `otpauth://` URI for QR rendering. **Management accounts only.** Rate-limited.
- `POST /api/auth/staff-login` — `{ email, password, token? }`. Management: valid TOTP code mandatory (`TOTP_ENROLLMENT_REQUIRED` until enrolled / `TOTP_REQUIRED` / `TOTP_INVALID`). Staff: plain credentials.
- `POST /api/auth/totp/reset` — admin-only, `{ email }`. Clears TOTP for account recovery (lost phone). Editing a user's **role** also clears their TOTP so they re-enroll under the new privilege level.

Lost your phone?
```bash
curl -X POST http://localhost:5001/api/auth/totp/reset \
  -H "Authorization: Bearer <ADMIN_JWT>" -H "Content-Type: application/json" \
  -d '{"email":"staff@cafeteria.ac.ke"}'
```

---

## 7. Database Schema

All tables are created idempotently by `backend/schema.sql`.

### users
| Column | Type | Notes |
|---|---|---|
| id | SERIAL PK | |
| student_id | VARCHAR(50) UNIQUE | students log in with this — strict format (§5); staff/admin store any legacy ID or NULL |
| name | VARCHAR(100) NOT NULL | |
| email | VARCHAR(150) UNIQUE | required for staff/admin |
| password_hash | VARCHAR(255) | bcrypt, cost 10 |
| phone | VARCHAR(20) | |
| role | VARCHAR(20) | `student \| staff \| admin` |
| theme_preference | VARCHAR(10) | `dark \| light` |
| totp_secret | VARCHAR(64) | NULL = 2FA not enrolled |
| created_at | TIMESTAMP | default now() |

### meals
name, description, price DECIMAL(10,2), image_url, category (`breakfast|lunch|supper`), quantity_available INT, availability BOOL (auto-false when stock hits 0), created_at. Seeded with Kenyan campus meals across all three sessions.

### orders
user_id FK→users (NULL = guest), guest_name, phone_number NOT NULL, status (`pending|paid|preparing|ready|served|expired`), total_amount, **served_at** TIMESTAMP (set automatically when marked served — powers receipts & ETA baselines), created_at.

### order_items
order_id FK→orders CASCADE, meal_id FK→meals SET NULL, meal_name (snapshot), quantity.

### transactions
order_id FK→orders CASCADE, amount, payment_status (`pending|success|failed`), payment_reference UNIQUE, payment_method, created_at.

### notifications / notification_reads *(unchanged)*
Broadcasts to roles with per-user read receipts.

### 🆕 meal_carryovers — missed-meal redemption
| Column | Type | Notes |
|---|---|---|
| id | SERIAL PK | |
| order_id | FK→orders CASCADE | source order (marked `expired` after sweep) |
| user_id / guest_name / phone_number | | who owns it |
| code | VARCHAR(8) UNIQUE | 6-digit hand-over code shown to the student & cashier |
| items | JSONB | snapshot of `[{meal_id, quantity, name}]` |
| total_amount | DECIMAL(10,2) | |
| original_session | VARCHAR(20) | `breakfast \| lunch \| supper` |
| status | VARCHAR(20) | `pending → redeemed` or `expired` |
| expires_at | TIMESTAMP | end of the next session + 15 min grace |

### 🆕 favourites
(user_id, meal_id) PK — powers ♥ hearts and the Favourites filter.

### 🆕 meal_ratings
id, meal_id FK, user_id FK, rating SMALLINT 1–5, UNIQUE(meal_id, user_id) — one rating per student per meal, updatable. Aggregated into `avg_rating`/`rating_count` on every meals read.

### 🆕 audit_logs
id, actor_id/actor_name, action (`user.create`, `user.update`, `user.delete`, `meal.create/update/disable`, `order.status_change`, `carryover.redeem`, `orders.export_csv`), entity_type/entity_id, details JSONB, ip, created_at. Visible in **Admin → Audit** tab.

### 🆕 password_resets
id, user_id, token_hash (SHA-256), expires_at (30 min), used BOOL — single-use reset tokens.

---

## 8. API Reference

Base URL: `http://localhost:5001/api`. Auth: `Authorization: Bearer <access-token>` unless noted. Rate limit: 15 req / 15 min on auth routes.

### Auth
| Method | Path | Access | Description |
|---|---|---|---|
| POST | `/auth/login` | public | `{ student_id, password }` → `{ token, refresh_token, user }`. Reg number is normalised (case-insensitive). |
| POST | `/auth/staff-login` | public | `{ email, password, token? }` → tokens + user. Management requires a valid TOTP code; staff sign in with credentials only. |
| POST | `/auth/refresh` | public | `{ refresh_token }` → fresh 12 h access token. Called automatically by the frontend on any 401. |
| POST | `/auth/forgot-password` | public | `{ identifier }` (reg number or email) → creates single-use reset token. Dev-mode returns `reset_token` directly until a mailer is wired. |
| POST | `/auth/reset-password` | public | `{ token, new_password }` → sets the new password (min 6 chars). |
| POST | `/auth/register` | public as student; admin for other roles | Validates the strict reg-number format for students. |
| POST | `/auth/totp/setup` | public + rate-limit | Enroll a TOTP secret (management accounts only). |
| POST | `/auth/totp/reset` | admin | Clear someone's TOTP. |

### Meals
| Method | Path | Access | Description |
|---|---|---|---|
| GET | `/meals?category=` | public | Available meals incl. `avg_rating`, `rating_count`. |
| GET | `/meals/:id` | public | Single meal. |
| POST | `/meals/upload` | admin | multipart field `image` (JPG/PNG/WEBP/GIF ≤ 5 MB) → `{ url }` served from `/uploads/*`. |
| POST / PUT / DELETE | `/meals…` | admin | Create / partial-update / disable. Audited. |
| POST | `/meals/:id/rating` | student | `{ rating: 1..5 }` — only for meals the student has been served. Upserts. |
| GET | `/meals/my-ratings` | student | Own ratings map. |

### Orders
| Method | Path | Access | Description |
|---|---|---|---|
| POST | `/orders` | public | Place order after verified payment (mock refs OK in dev). Emits SSE `new_order`. |
| POST | `/orders/initiate-payment` | public | PayHero STK push (simulated without credentials). |
| GET | `/orders` | staff/admin | Filters: `status`, `date` (YYYY-MM-DD), `all=1` (skip today filter), `search` (name/phone/id/student). Add `page`+`limit` for pagination (`{ data, total, page, pages }`). Without `page` → full list (queue mode) plus `student_name`. |
| GET | `/orders/stream?token=` | staff/admin | **Server-Sent Events**: `new_order`, `status_changed` frames + 25 s keep-alive pings. Token goes in the query string because EventSource cannot set headers. |
| GET | `/orders/my-orders` | student | Last 3 days of own orders (receipt/rating data). |
| PATCH | `/orders/:id/status` | staff/admin | Advance status; sets `served_at` on serve; audited; emits SSE. |
| GET | `/orders/analytics?from=&to=` | admin | Today KPIs + trend/category/status breakdown over the range (default last 7 days) incl. per-meal `avg_rating`. |
| GET | `/orders/export?from=&to=` | admin | CSV download of all orders in range. Audited. |
| GET | `/orders/carryovers/mine` | student | Own pending/redeemed missed-meal vouchers. |
| GET | `/orders/carryovers?search=` | staff/admin | All pending carryovers (by name/phone/reg/code). |
| POST | `/orders/carryovers/:id/redeem` | staff/admin | Hand over the meal → marks redeemed + source order served. Only during an open serving window; audited. |

### Users
| Method | Path | Access | Description |
|---|---|---|---|
| GET/PATCH | `/users/profile` (+ `/profile/password`) | any signed-in | Read/update own profile, change password. Used by every dashboard's Settings tab. |
| GET | `/users?search=&role=&page=&limit=` | admin | Directory with order stats; paginated when `page` given. |
| POST | `/users` | admin | Create student/staff/admin. Strict reg-number validation for students. Multi-staff supported. |
| PATCH | `/users/:id` | admin | Edit details, role, optional password reset. Role change clears TOTP. Cannot demote/delete the last admin. |
| DELETE | `/users/:id` | admin | Delete (not self; protects last admin). |

### Favourites / Audit / Notifications / Health
| Method | Path | Access | Description |
|---|---|---|---|
| GET | `/favourites` | signed-in | Favourite meals. |
| POST / DELETE | `/favourites/:mealId` | signed-in | Toggle a favourite. |
| GET | `/audit?action=&page=` | admin | Audit trail (latest first). |
| GET / POST / PATCH / DELETE | `/notifications…` | varies | Broadcast centre with read receipts (unchanged). |
| GET | `/health` | public | Liveness probe. |

---

## 9. Feature Guide

### 🔴 Real-time updates (SSE)
The cashier console and kitchen display subscribe to `GET /api/orders/stream`. New payments and status changes appear instantly; a 1-minute polling fallback covers dropped connections. The header badge reads **“Real-time · fallback refresh every 1 min”**.

### ⏱ Queue ETA
Each queue card shows **“~N min to ready”**, computed from the card's position in the paid/preparing pipeline × ~8 min average prep minus elapsed time. The kitchen tiles turn red-border **OVERDUE** past 16 minutes.

### 👨‍🍳 Kitchen Display (`/kitchen`)
Full-screen tile board for the kitchen: paid orders queued oldest-first, one tap *Start Cooking* → *Mark Ready*, waiting timers, overdue highlighting, live SSE refresh. Open it from the navbar 🔥 icon or “Kitchen view” in the cashier console.

### ♥ Favourites & Buy Again (students)
Heart icons on menu cards save favourites (`favourites` table); a **♥ Favourites** filter chip shows only those. Above the menu, a **Buy Again** row lists recently ordered available meals with one-tap add-to-cart.

### 🧾 Printable receipts
Order history rows have a **Receipt** button → modal with itemised lines, totals and order meta; **Print** opens the browser dialog with print-only CSS (everything else hidden).

### ⭐ Meal ratings
After pickup, students rate each item 1–5 ★ from their profile (one rating per meal, editable). Average ratings surface on meal cards and in the admin Popular Meals table (`4.8 ★`).

### 📊 Admin analytics & reports
Overview graphs: 7-day **revenue trend** bars, **sales-by-category** donut, **order-status** distribution strip, popular-meals table with ratings. Date-range pickers (`from`/`to`) drive the charts, and **Export CSV** downloads the matching order report.

### 🚨 Low-stock alerts
An amber banner appears in the admin overview whenever active meals sit at/below the threshold (default **5**), listing each item and its remaining quantity; menu cards show the same warning inline.

### 🖼 Meal image uploads
Menu form accepts either an image URL **or** a file upload (multer → `backend/uploads`, auto-served at `/uploads/<file>`), with instant preview. JPG/PNG/WEBP/GIF up to 5 MB.

### 🔍 Search & pagination everywhere
Orders and users tables support server-side search (name/phone/order-id/reg-number) with paginated results in the admin console; carryovers are searchable by code too.

### 🛡 Audit trail
Every privileged action — user create/update/delete, meal create/update/disable, order status changes, carryover redemptions, CSV exports — is recorded with actor, entity, JSON details, IP and timestamp in **Admin → Audit**.

### ⚙️ Settings in every dashboard
Profile (name/phone), appearance (dark/light) and password change live in a shared `SettingsPanel`: Admin → *Settings* tab, Cashier → *Settings* tab, students → Profile page.

### 🔐 Sessions & recovery
- Access tokens last **12 h**; refresh tokens **7 days**. On any 401 the API layer transparently refreshes once and retries, then cleanly signs the user out if that fails.
- **Forgot password?** on the landing login modal issues a single-use token (30 min). Until an email service is connected, dev mode surfaces the token/link directly in the response (also logged server-side).

### 💥 Crash safety
A global `ErrorBoundary` catches render crashes and offers *Back to Home* / *Reload* with the error message shown — no more blank screens.

---

## 10. Missed-Meal Carryover Rules

The cafeteria's redemption policy is automated end-to-end:

```
Serving windows            Sweep (node-cron)                 Next session
06:00–10:00 breakfast ──►  10:05  uncollected orders ──────► redeemable at lunch
12:00–15:00 lunch     ──►  15:05  uncollected orders ──────► redeemable at SUPPER  ← your rule
18:00–21:00 supper    ──►  21:15  anything still pending ──► expired automatically
```

1. At **five minutes past** each window close, every order still in `paid/preparing/ready` from that session becomes a **carryover**: items are snapshotted into `meal_carryovers`, a unique **6-digit code** is issued, and the source order is marked `expired`.
2. During the **next session the same day** the student sees an amber banner in their portal — *“You missed Chicken Pilau ×1 (lunch) — collect at the counter, code 482913”* — and the voucher also appears in their profile.
3. The cashier opens the **Missed Meals** tab, searches by name/phone/code, confirms identity against the code and presses **Hand over & Redeem**. Redemption only works while a serving window is open and before `expires_at`.
4. Unredeemed carryovers expire automatically (checked every 5 minutes). Redeeming flips the original order to `served` so reporting stays truthful.

Guests are covered too — their carryovers are matched by phone number instead of account.

---

## 11. Payment Flow (PayHero / M-Pesa)

1. Checkout calls `POST /api/orders/initiate-payment`.
2. **Without credentials** the API returns a simulated success (`mock_…` reference) so local dev runs the entire journey offline.
3. With credentials configured, a real STK push is sent; the reference must verify via PayHero's transaction-status endpoint before `POST /api/orders` accepts the order (duplicate references are rejected with HTTP 409).
4. Order creation is transactional: quantities are locked (`FOR UPDATE`), decremented, availability flips off at zero, and the payment row is recorded.

---

## 12. Theming (Light & Dark Mode)

- Design tokens live as CSS custom properties on `:root` (warm paper light theme) and `[data-theme='dark']` (moss charcoal).
- Toggle in the navbar; persisted in `localStorage` and saved to the user profile (`theme_preference`) via Settings.
- Charts, badges and the kitchen display all derive from the same variables — both themes stay consistent automatically.

---

## 13. Environment Variables

`backend/.env` (see `.env.example`):

| Variable | Purpose |
|---|---|
| `PORT` | API port (default 5001) |
| `DATABASE_URL` | Postgres connection string (Docker maps the DB to host port **5433**) |
| `JWT_SECRET` | Access-token signing key — long random value in production |
| `JWT_REFRESH_SECRET` | Optional separate key for refresh tokens (falls back to `JWT_SECRET + "_refresh"`) |
| `PAYHERO_USERNAME` / `PAYHERO_PASSWORD` | PayHero Basic-auth creds — absent ⇒ mock payment mode |
| `PAYHERO_CHANNEL_ID` | Your M-Pesa collection channel id |
| `PAYHERO_CALLBACK_URL` | Optional async webhook URL |
| `PUBLIC_BASE_URL` | Optional host prefix for uploaded-image URLs behind a proxy |
| `TURNSTILE_SECRET_KEY` | Cloudflare Turnstile server key — absent ⇒ captcha verification skipped (dev) |
| `TURNSTILE_SITE_KEY` | Cloudflare Turnstile site key (reference; the browser uses its own copy) |
| `CORS_ORIGINS` | Extra allowed browser origins, e.g. your Cloudflare Pages/Workers domain |
| `TRUST_PROXY` | Express `trust proxy` setting behind the Cloudflare proxy/tunnel |

Frontend (`frontend/.env`, see `.env.example`): `VITE_API_URL` — defaults to `http://localhost:5001/api`; `VITE_TURNSTILE_SITE_KEY` — Cloudflare Turnstile site key. The captcha widget renders automatically once the site key is present and stays hidden in dev.

### Connecting Cloudflare

1. **Turnstile (captcha)** — create a widget at [dash.cloudflare.com → Turnstile](https://dash.cloudflare.com) for your domain:
   - Copy the **Site Key** → set `VITE_TURNSTILE_SITE_KEY` in `frontend/.env` (rebuild the frontend).
   - Copy the **Secret Key** → set `TURNSTILE_SECRET_KEY` in `backend/.env`.
   - With both set, every student login, staff login, 2FA setup and forgot-password call is verified server-side against `challenges.cloudflare.com/turnstile/v0/siteverify`. Leave either blank and everything runs in simulated mode.
2. **Proxy / CDN** — point a Cloudflare DNS record (proxied 🟠) at your backend host, add the public origin to `CORS_ORIGINS`, and keep `TRUST_PROXY=loopback, linklocal, uniquelocal` so rate limiting sees real client IPs via `CF-Connecting-IP`.

---

## 14. Running with Docker

```bash
docker compose up --build      # postgres + backend + frontend
```

The backend Dockerfile copies source and installs production deps; uploads persist inside the container volume. For production, mount `backend/uploads` and set `JWT_SECRET`/`JWT_REFRESH_SECRET`/PayHero variables via your orchestrator's secrets.

---

## 15. Security Model

| Control | Implementation |
|---|---|
| Passwords | bcrypt cost 10; min length 6; never returned by any endpoint |
| Tokens | 12 h access JWT + 7 d refresh JWT (distinct secret); transparent rotation; auto sign-out on refresh failure |
| 2FA | TOTP (SHA-1, 30 s step, ±1 step drift) strictly required for every management login — the console is unreachable without it; cleared on role change; admin-resettable. Staff logins use credentials only. |
| RBAC | `protect` + `requireRole(...roles)` middleware on every privileged route |
| Strict reg numbers | Server-side format enforcement for student IDs (§5) |
| Payment integrity | Server-side verification + unique reference constraint + transactional stock decrement |
| Rate limiting | 15 auth attempts / 15 min per IP |
| Audit | Append-only `audit_logs` for privileged actions |
| Redemptions | Carryover redeem blocked outside serving windows and after expiry; codes are unique & single-use |
| Uploads | MIME allow-list, 5 MB cap, random filenames, images served from a dedicated directory |
| CORS | Allow-list of dev origins (`5173`/`5174`) |
| Resilience | Global ErrorBoundary; SSE keep-alives; polling fallbacks |

---

## 16. Testing & CI

```bash
cd frontend && npm test        # vitest: session windows, formatting, chart smoke,
                               #   strict reg-number matrix, status-map integrity
```

GitHub Actions (`.github/workflows/ci.yml`) runs on every push/PR to `main`:
1. **backend** — install, `node --check` every source file, boot the server with a dummy secret (no DB needed).
2. **frontend** — install, vitest, production build.
3. **docker** — build both images on pushes.

---

## 17. Troubleshooting

| Symptom | Fix |
|---|---|
| `Network error` toast | Backend not running or `VITE_API_URL` wrong — hit `/api/health` first |
| Login says invalid but credentials look right | Reg numbers are stored uppercase — type normally; input auto-capitalises |
| “Invalid Registration Number” when adding a student | Format must be `CT207/119148/24` — exactly 6 middle digits, 2-digit year |
| 2FA loop | Clock drift > 90 s on the authenticator device, or ask an admin to `totp/reset` |
| Images don't show after upload | Set `PUBLIC_BASE_URL` when running behind a proxy/domain |
| Carryover won't redeem | Outside a serving window (06–10 / 12–15 / 18–21) or already redeemed/expired |
| SSE not updating | Some proxies buffer `text/event-stream`; the 1-minute poller keeps things moving regardless |
| DB out of sync with schema | Re-run `backend/schema.sql` — all migrations are idempotent guards |

---

© 2026 SynapseFive · Support: **support@synapsefive.com**
