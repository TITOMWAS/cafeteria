# Synapse Cafeteria

An installable (PWA) campus cafeteria pre-ordering system — React + Express + PostgreSQL with M-Pesa payments (PayHero) and two-factor authentication for staff.

📖 **Full documentation: [`DOCUMENTATION.md`](./DOCUMENTATION.md)**

## Quick Start

> Requires Node.js 18+ and Docker

```bash
npm run setup     # install root + backend + frontend deps
npm run db        # start PostgreSQL (auto-creates & seeds tables)
npm run dev       # run backend (:5001) + frontend (:5173) together
```

## Login Credentials — all 4 dashboards

| Dashboard | URL | Credentials |
|---|---|---|
| **Student Portal** | landing page → Student card | `CT207/119148/24` / `password` (or self-register) |
| **Guest Ordering** | landing page → Guest card | no account needed |
| **Cashier Console** | `/secure-access` → `/cashier` | `staff@cafeteria.ac.ke` / `password` |
| **Management Console** | `/secure-access` → `/admin` | `admin@cafeteria.ac.ke` / `password` + **2FA code** |

Management access is **strictly OTP-gated**: press **Set up 2FA** on `/secure-access`, scan the QR with your authenticator app, then sign in with the 6-digit code. Without it, the dashboard can never be reached. Cashier/staff accounts are created by management (Admin → Users & Staff) and sign in with just email + password.

Payments work out of the box in **simulated mode** (full M-Pesa STK-style flow, no real money). Add live PayHero credentials in `backend/.env` to go real.

Install the app: visit in Chrome/Edge and use the install card that appears (iOS: Share → Add to Home Screen).

## Environment

Copy/edit `backend/.env` (defaults work for local dev):

```env
PORT=5001
DATABASE_URL=postgresql://postgres:password@localhost:5433/cafeteria_db
JWT_SECRET=cafeteria_secret_jwt_2026
NODE_ENV=development
PAYHERO_USERNAME=
PAYHERO_PASSWORD=
PAYHERO_CHANNEL_ID=
```

Leave PayHero vars blank in dev — orders use mock payment references automatically.

## Scripts

| Command (root) | Action |
|---|---|
| `npm run setup` | install all dependencies |
| `npm run db` / `db:reset` | start DB / wipe & re-seed it |
| `npm run dev` | backend + frontend concurrently |
| `npm run build` | production frontend build |

Backend-only: `npm --prefix backend run dev` · Frontend-only: `npm --prefix frontend run dev`
