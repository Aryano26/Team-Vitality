# Cooper – App Workflow (Start to End)

This document describes the full user and system workflow of the Cooper shared-expense app, from first visit to event closure.

---

## 1. Entry & Authentication

| Step | Route | What happens |
|------|--------|----------------|
| **Landing** | `/` | User sees landing page with **Login** and **Register**. No auth required. |
| **Register** | `/register` | User signs up (name, email, password) or “Sign up with Google”. On success → redirect to `/login`. |
| **Login** | `/login` | User signs in (email/password) or “Log in with Google”. Token stored in `localStorage`. On success → redirect to `/dashboard`. |
| **Already logged in** | — | If token exists and user visits `/` or `/login`, they may be redirected to `/dashboard`. |

**Backend:** `POST /api/v1/register`, `POST /api/v1/login`, `GET /api/v1/auth/google` (OAuth).

---

## 2. Dashboard

| Step | Route | What happens |
|------|--------|----------------|
| **Dashboard** | `/dashboard` | Protected. Shows welcome message and **My Events** / **Logout** links. If no token → redirect to `/login`. |

**Backend:** `GET /api/v1/dashboard` (validates token).

---

## 3. Events List

| Step | Route | What happens |
|------|--------|----------------|
| **Events** | `/events` | Protected. Lists all events where the user is a participant (created or joined). |
| **Create event** | (same page) | User clicks “+ New Event”, fills: name, type, description, optional **start time**, **end time**, **settlement trigger** (manual/auto). Reads default rules summary. Submits → `POST /api/v1/events`. Backend creates event with wallet balance 0, status ACTIVE, creator as first participant with `depositedAmount = 0`. |
| **Join event** | (same page) | User pastes **event ID** and submits → `POST /api/v1/events/:id/join`. Backend adds user as participant with `joinedAt`, `depositedAmount = 0`. No charge; no auto-join to categories. On success → redirect to that event’s detail page. |

**Backend:** `GET /api/v1/events`, `POST /api/v1/events`, `POST /api/v1/events/:id/join`.

---

## 4. Event Detail (Single Event)

Route: `/events/:id`. Protected. User must be a participant. Page loads event, wallet, transactions, categories, summary, and expenses.

### 4.1 Event header & dashboard stats

- **Event status:** ACTIVE / CLOSED (and other statuses from backend).
- **Stats (from backend):** Wallet balance, total spent (from summary), remaining balance (= wallet balance).

### 4.2 Share event (creator only)

- Creator sees **Event ID** and **Copy** so others can join via “Join an existing event” on `/events`.

### 4.3 Wallet & deposits

- **Shared wallet balance** and message: “Deposits are pooled and settled automatically (fair share per participant) when the event is settled.”
- If event is **ACTIVE:** user can **Deposit** (amount).  
  - **Sync path:** `POST /api/v1/events/:id/wallet/deposits` → backend credits wallet and updates participant `depositedAmount`.  
  - **Payment redirect:** backend may return `paymentUrl` → user completes payment → webhook credits wallet and `depositedAmount` → user returns with `?deposit=success` and UI refetches.

**Backend:** `GET /api/v1/events/:id/wallet`, `POST /api/v1/events/:id/wallet/deposits`; webhook for async payment success.

### 4.4 Categories

- **Create category (event ACTIVE):** Name, optional spend limit (budget). Backend creates category with status ACTIVE, empty participants, optional rules.
- **Per category shown:** Budget limit, current spend, remaining, **status (ACTIVE/CLOSED)**, “Approval required above X” if set, list of participating users.
- **Join / Leave:** User clicks Join or Leave → `PUT .../categories/:categoryId/join` or `.../leave`. Backend records `categoryJoinedAt` / `categoryLeftAt`; no charge.
- **Close category (creator only):** “Close category” → `PATCH .../categories/:categoryId/close`. New expenses in that category are blocked.

**Backend:** `GET /api/v1/events/:id/categories`, `POST .../categories`, `PUT .../categories/:id/join`, `PUT .../categories/:id/leave`, `PATCH .../categories/:id/close`.

### 4.5 Pay from shared wallet

- **Only when event is ACTIVE.** User must **select a category** (required). UI shows wallet balance and remaining category budget.
- User enters amount, optional description, optional receipt URL → submit.
- **Backend rule engine:** Checks event ACTIVE, category ACTIVE, user in category, authorized, amount ≤ category budget, amount ≤ wallet balance.
  - If **approval required** (e.g. amount above threshold): expense is created with status **PENDING**; wallet is **not** debited.
  - Otherwise: wallet is debited, transaction created, expense created with status **PAID** and **locked participant snapshot** (for fair-share settlement).
- UI shows success (“Expense recorded”) or “Expense submitted; pending approval” or error (e.g. “Blocked”, “Insufficient balance”).

**Backend:** `POST /api/v1/events/:id/expenses` (rule-based; may return `expense` with `status: "pending"` or transaction + paid expense).

### 4.6 Pending approvals

- **Pending approvals** block lists expenses with `status === "pending"` (from `GET /api/v1/events/:id/expenses`).
- **Approver** (e.g. event creator) can click **Approve** → `POST /api/v1/events/:id/expenses/:expenseId/approve`. Backend re-validates, debits wallet, snapshots category participants on the expense, marks expense PAID. UI refetches.

**Backend:** `GET /api/v1/events/:id/expenses`, `POST /api/v1/events/:id/expenses/:expenseId/approve`.

### 4.7 Recent activity

- List of **transactions** (deposits, expenses, refunds) for the event.

**Backend:** `GET /api/v1/events/:id/wallet/transactions`.

### 4.8 Settlement summary

- **Per participant (from backend):** Deposited amount, fair share (spent), net (refund or payable). Table shows “Fair share” and “Net (refund / payable)”.
- **By category:** For each category, total spent and list of participants (from current categories + summary data).
- **Settle event (creator only):** Button “Settle Event” → `POST /api/v1/events/:id/settle`. Backend runs **settlement engine**: fair share = total spent / participant count per expense (using locked participant snapshots), net = depositedAmount − fair share. Event status set to “settled”; summary stored. No automatic refunds yet; that’s a separate step (e.g. settlement execute/refund endpoints).

**Backend:** `GET /api/v1/events/:id/summary` (participants, wallet, transactions, settlementSummary), `POST /api/v1/events/:id/settle`.

### 4.9 Close event (optional)

- Creator can **close event** → `PATCH /api/v1/events/:id/close`. Event status → CLOSED; wallet status → closed. No new deposits or expenses.

**Backend:** `PATCH /api/v1/events/:id/close`.

---

## 5. Settlement & Refunds (Event Detail page)

**Where:** On the **Event Detail** page (`/events/:id`), scroll to the **"Settlement & Refunds"** section (below the Settlement summary table and "Settle Event" button).

**Backend routes** (mounted at `/api/v1/events/:eventId/settlement`):

| Action | Method & path | What it does |
|--------|----------------|--------------|
| Get status | `GET /api/v1/events/:eventId/settlement` | Returns settlements, wallet balance, event status (used to show list of refunds and "Process refund" / "Complete settlement"). |
| Calculate settlement | `GET .../settlement/calculate` | Returns per-participant refund/payable from fair-share engine (totalDeposited, totalExpenses, settlement by participantId). |
| Execute settlement | `POST .../settlement/execute` | Creator only; event must be ACTIVE. Creates refund Transaction records and Settlement records for over-paid participants, deducts from wallet; event status → "settling". |
| Process refund | `POST .../settlement/refund/:participantId` | Creator only. Processes one participant’s refund (e.g. via payment provider); marks that settlement’s refundStatus completed. |
| Complete settlement | `PATCH .../settlement/complete` | Creator only. When all refunds are completed, marks event "settled" and wallet "closed". |

**UI flow:**

1. **Calculate settlement** – Button calls `GET .../settlement/calculate`; result shown (total deposited, total expenses, per-participant refund).
2. **Execute settlement** – Button (creator only, event ACTIVE) calls `POST .../settlement/execute`; creates refund txs and settlement records; list of settlements appears.
3. **Process refund** – For each settlement with refundAmount > 0 and refundStatus "pending", creator can click **Process refund** → `POST .../settlement/refund/:participantId`.
4. **Complete settlement** – When every refund is completed, **Complete settlement** button appears → `PATCH .../settlement/complete` → event and wallet closed.

---

## 6. Logout

| Step | Route | What happens |
|------|--------|----------------|
| **Logout** | `/logout` | User clicks Logout (e.g. from Dashboard or Events). Token cleared; redirect to `/` after short delay. |

**Backend:** Client clears `localStorage`; optional logout endpoint if present.

---

## 7. End-to-end flow (summary)

1. **Visit** `/` → Login or Register.
2. **Login** → Dashboard.
3. **Go to Events** `/events` → Create event (with optional start/end time, settlement trigger) or Join with event ID.
4. **Open event** `/events/:id` → See status, wallet, total spent, remaining.
5. **Deposit** (if ACTIVE) → Money pooled; `depositedAmount` updated per participant.
6. **Create categories** (if ACTIVE) → Set budget/approval rules; others **Join** category (no charge).
7. **Pay from wallet** (if ACTIVE) → Select category, amount; backend allows or requires approval; if allowed, wallet debited and expense locked to current category participants.
8. **Approve** pending expenses (if approver) → Wallet debited, expense marked PAID, participants locked.
9. **Settlement summary** → View fair share and net (refund/payable) per participant; optionally **Settle event** to calculate and store final summary.
10. **Close category** (creator) → No new expenses in that category.
11. **Close event** (creator) → Event and wallet closed.
12. **Logout** → Token cleared; back to landing.

---

## 8. Route overview

| Path | Purpose |
|------|---------|
| `/` | Landing (Login / Register links) |
| `/login` | Login |
| `/register` | Register |
| `/dashboard` | Dashboard (My Events, Logout) |
| `/events` | List events, create event, join event |
| `/events/:id` | Event detail: wallet, categories, pay, approvals, summary, settle, close |
| `/logout` | Logout |

All routes except `/`, `/login`, and `/register` are protected (redirect to login if not authenticated).
