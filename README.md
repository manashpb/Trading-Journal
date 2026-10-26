# Trading Journal

A self-hosted React + Express + SQLite journal with four recording profiles: options scalping (intraday), options positional hedges, prop trades, and cash stocks (intraday/swing).

## Start locally

Requires Node.js 22 or later.

```sh
npm install
npm run setup
npm run dev
```

Open http://localhost:5173. The API runs on port 5000. For the built app:

```sh
npm run build
npm start
```

Open http://localhost:5000. Express serves both frontend and API.

## Recording workflow

1. In Configuration, add instruments/underlyings with their asset type and value per price point per quantity unit. Equity and option prices recorded per unit normally use multiplier 1; lot quantities require the captured lot size instead. Do not apply both conventions at once.
2. Choose a profile, then enter account, holding style, strategy, planned risk, costs and entry analysis.
3. For options, add contracts with expiry, strike, Call/Put, buy/sell, quantity and multiplier. Hedges require at least two legs.
4. Simple positions use entry/exit summaries. For scaling or partial exits, add timestamped Entry/Exit fills to each leg. Fills override that leg's summary prices and quantities. Fill costs and additional trade costs are added once.
5. Close a trade after every leg closes. Open strategies show realised P&L and optional unrealised P&L from manually entered mark prices. No live market feed is connected.
6. Keep entry thesis separate from exit reason and review. Adjustment notes can include timestamps and reasons; financial adjustments must also be reflected in leg fills or new legs.
7. Save, reopen, then upload screenshots or paste images from the clipboard.

All monetary values are **INR**. Convert non-INR figures consistently before recording; automatic FX conversion is not implemented. Planned risk is a manual entry, not inferred maximum loss. R multiple uses closed net P&L / planned risk. Overnight scalps are flagged as rule violations but remain recordable.

## Custom templates

Configuration includes a field editor for each profile. Fields support text, numbers and dropdowns. Use stable keys and consistent measurement definitions. Saving creates a template version. Existing trades retain their original definitions/version when edited; new trades use the latest template. Changing an existing trade's profile resets its analysis values and legs and applies the new template.

Leave unknown values blank. Observation time and source provide context. Entry analysis remains editable; this personal journal is not an immutable audit system.

## Data and calculations

The fresh framework uses `server/journal.db`; previous `server/trading.db` is untouched and not imported. Screenshots use `server/snapshots/` unless configured otherwise.

Shared trade identity, risk, costs and totals are SQLite columns. Versioned analysis, legs and executions are stored as a validated JSON trade aggregate. Trade/tag writes are transactional. Multipliers are captured with trades/legs so instrument configuration changes do not alter historical calculations.

Execution accounting uses weighted average entry cost per leg, timestamp ordering and buy/sell sign. Exits cannot exceed open quantity. Dashboard totals include closed net results; open partial realised results appear on trade cards. The equity curve represents cumulative closed P&L, not broker account equity.

Trade Log and Dashboard filter by profile/account. CSV exports include profile, risk, costs, R multiple and full framework JSON with analysis and fills.

## Text trade entry

Open **New Trade → Text** to edit a YAML trade instead of filling out the form. Choose a template profile and click **Load template** for prop, options scalping, positional hedge, or cash fields. Comments list current instruments, profile choices, analysis dropdown options, and tags from Configuration. Generating a fresh template replaces the current text after a warning.

Use exact instrument and tag names, quote names containing YAML punctuation, and enter times as `YYYY-MM-DD HH:mm` in IST. Blank optional values mean not recorded. Unknown keys, invalid choices, invalid dates, missing required values, and inconsistent option legs block creation and show line numbers. Closed trades need an exit time and exit prices; hedged trades need at least two legs. P&L and a readable preview update as the text becomes valid.

Tags are grouped by category, e.g. `tags: {Setup: [Breakout]}`. Click tag chips below the editor to add/remove selections in the YAML; existing comments are preserved. Duplicate category or instrument names must be made unique in Configuration to use them in text entry.

**Download text** saves the current draft as `new-trade.yaml`. Edit it externally and use **Load file** to load `.yaml`, `.yml`, or `.txt` files (maximum 256 KB). Form and Text maintain separate drafts. Text survives tab changes, closing/reopening the trade dialog, and failed saves within the same page session; refreshing the page clears it, so download drafts you want to keep. Click **Create New Trade** to save through the normal trade API. Add snapshots afterward by editing the created trade. The feature does not place broker orders.

## Verification

```sh
npm run build
npm test
```

Text entry tests check generated templates, YAML errors, unknown fields, IST dates, dropdown choices, category-based tags, tag chips, and strategy validation. Integration tests start an isolated server and temporary database, checking profiles, multi-leg P&L, partial exits, invalid inputs, template history, atomic rollback, authentication and production frontend serving.

## Remote deployment

The shared login portal and Nginx routing are owned by [VCCL Workspace](../workspace/README.md). Its [deployment guide](../workspace/docs/DEPLOYMENT.md) covers the independent portal lifecycle and server cutover. This journal builds and runs independently; its updates do not restart the portal. Standalone journal deployment alternatives are in [deploy/README.md](deploy/README.md). Nothing is automatically published.

| Variable | Default / purpose |
| --- | --- |
| `PORT` | `5000` |
| `DB_PATH` | `server/journal.db` |
| `SNAPSHOTS_DIR` | `server/snapshots` |
| `JOURNAL_USER` | HTTP Basic authentication username |
| `JOURNAL_PASSWORD` | HTTP Basic authentication password |
| `NODE_ENV` | Set `production` for hosting; credentials are then required |

Use HTTPS at the reverse proxy. Authentication protects frontend, API and images; `/api/health` returns only health status and stays public. This is a single-owner journal without separate user accounts or tenant isolation.
