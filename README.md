# Trading Journal — Prop Firm Edition

A self-hosted trading journal for **futures & CFD** prop-firm trades with a dashboard, detailed trade log, snapshot management, and full configuration.

## Tech Stack

| Layer     | Choice                                    |
|-----------|-------------------------------------------|
| Frontend  | Vite + React 18 + TypeScript              |
| Charts    | Recharts                                  |
| Backend   | Node.js + Express (TypeScript)            |
| Database  | SQLite (file-based, **trading.db**)       |
| Uploads   | Multer → `server/snapshots/`              |

## Pages

1. **Dashboard** — equity curve, KPI tiles, PnL by instrument, monthly PnL, win/loss donut, **day-wise PnL calendar** (IST), recent trades.
2. **Trade Log** — add/edit trades in a modal, **table ⇄ card views**, card thumbnails of snapshots, **keyboard navigation** (← → ↑ ↓ in card view), filtering (date range, status, contract, instrument, tag), column sorting, **CSV export** (with snapshot paths & semicolon-separated tags).
3. **Configuration** — manage instruments (name, CFD/Futures, ₹ per-point PnL) and **tag categories + tags**, which appear in the trade form & filters.

## Quick Start

```bash
# 1. Install dependencies (server + client)
npm run setup

# 2. Run both server and client concurrently
npm run dev
```

Then open **http://localhost:5173** (Vite) — the API runs on **http://localhost:5000**.

Or run them separately:

```bash
npm run dev:server   # API on :5000
npm run dev:client   # UI on :5173
```

### First-time setup

1. Go to **Configuration** and add your instruments (e.g. NIFTY 50 — Futures — ₹25/pt). Set the **₹ per-point PnL** — this drives auto PnL calculation.
2. Add tag categories + tags (e.g. "Setup Type" → breaking-move, pullback, rangefade…).
3. Head to **Trade Log**, click **New Trade**, fill the form, and you're journaling.

## Features

- **Auto PnL**: for Closed trades, `PnL = (exit − entry) × qty × pointValue` (sign depends on Long/Short). Recalc happens server-side on save/update.
- **Everything in IST**: timestamps stored as ISO UTC and rendered in `Asia/Kolkata`; the calendar and CSV are keyed to IST.
- **Snapshots**: upload images or **Ctrl+V** a screenshot straight into the trade modal. Stored under `server/snapshots/{YYYYMMDD}_{Instrument}_{tradeId}/img_001.png` — folders line up serially in the file browser. Multiple per trade; view/delete any time.
- **CSV export** honors current filters and includes `Snapshot Paths` and `Tags (semicolon-separated)` columns.
- **Extensible**: the dashboard page is self-contained — add new analysis cards/widgets without touching other pages.

## Paths

| Item            | Location                                       |
|-----------------|------------------------------------------------|
| Database        | `server/trading.db`                            |
| Snapshot images | `server/snapshots/`                            |
| API             | `http://localhost:5000/api`                    |
| Frontend        | `client/src/`                                  |