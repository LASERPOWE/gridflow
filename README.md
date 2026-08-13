# GridFlow — Smartsheet-style Sheets App

A fast, Smartsheet-like data app: **Excel-style editable grid** (inline edit, resize, sort, filter), **left folders/sheets tree**, **top toolbar**, **colored status/priority cells**, and **direct import from Smartsheet** via API token. Backend: Supabase (already live). Deploys on **GitHub + Vercel**.

Your Supabase project is already set up with the database (Org → Dept → Workspace → Sheets, configurable columns, rows, roles, security). This app just connects to it.

---

## 1. Run locally (optional, to test)

```bash
cp .env.example .env      # then paste your Supabase anon key into .env
npm install
npm run dev
```
Open the URL it prints (http://localhost:5173). Sign up → first account = Super Admin.

The Supabase **URL** is already filled in `.env.example`. You only add the **anon public key** (Supabase → Settings → API Keys → anon public → Copy).

---

## 2. Deploy on GitHub + Vercel (recommended)

### a) Push to GitHub
1. Create a new repo on https://github.com (e.g. `gridflow`).
2. In this folder:
   ```bash
   git init
   git add .
   git commit -m "GridFlow"
   git branch -M main
   git remote add origin https://github.com/<you>/gridflow.git
   git push -u origin main
   ```

### b) Deploy on Vercel
1. Go to https://vercel.com → **Add New → Project** → import your `gridflow` repo.
2. Framework preset: **Vite** (auto-detected). Build command `npm run build`, output `dist` (already in `vercel.json`).
3. **Environment Variables** — add these two:
   - `VITE_SUPABASE_URL` = `https://bjghgijxfppgtrxwwkzq.supabase.co`
   - `VITE_SUPABASE_ANON_KEY` = your anon public key
4. **Deploy**. You get a live URL that works from any device.

Every future `git push` auto-deploys.

---

## 3. Import from Smartsheet

1. In the app toolbar click **⬇ Import from Smartsheet**.
2. Get an API token: Smartsheet → your avatar → **Personal Settings → API Access → Generate new access token**. Copy it.
3. Paste the token → **Connect** → you'll see your Smartsheet sheets.
4. Click **Import** on any sheet — its columns and rows are pulled into a new sheet here.

The token stays only in your browser (localStorage); it's never stored on any server.

---

## Features
- **Editable grid** — double-click any cell to edit; changes save to the database instantly.
- **New row / Add column** — build sheets on the fly.
- **New sheet** (+ in the tree) — creates a sheet with starter columns.
- **Search** — quick-filter across all rows.
- **Colored cells** — status & priority render as colored pills.
- **Roles** — Super Admin / Manager / Editor can edit; Viewer is read-only (enforced by the database).

## Structure
```
gridflow/
├─ src/
│  ├─ App.jsx              # shell: toolbar + tree + editable grid
│  ├─ lib/supabase.js      # DB client
│  ├─ lib/auth.jsx         # login + roles
│  ├─ lib/smartsheet.js    # Smartsheet API import
│  ├─ lib/cells.js         # colored status/priority pills
│  ├─ components/Login.jsx  Tree.jsx  ImportModal.jsx
│  └─ styles.css           # Smartsheet-style look
├─ vercel.json  .env.example  package.json
```
