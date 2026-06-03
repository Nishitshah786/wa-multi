# WA Multi — WhatsApp Scheduler & Forwarder

Multi-user dashboard. Each user connects their own WhatsApp, sets forwarding rules and schedules messages.

---

## Run locally (for testing)

```
npm run install:all
npm run build
npm run dev
```
Open http://localhost:3001

---

## Deploy to Railway (production, 24/7)

### Step 1 — Push to GitHub
1. Create a free account at github.com
2. Create a new repository (name it `wa-multi`)
3. Download GitHub Desktop from desktop.github.com
4. Open GitHub Desktop → Add existing repository → select this folder
5. Commit all files → Push to GitHub

### Step 2 — Deploy on Railway
1. Go to railway.app → sign up with your GitHub account
2. Click **New Project** → **Deploy from GitHub repo**
3. Select your `wa-multi` repo
4. Railway will auto-detect and start building

### Step 3 — Add environment variables
In Railway dashboard → your project → **Variables** tab, add:
```
ANTHROPIC_API_KEY=sk-ant-your-key-here
PORT=3001
```
(PORT is set automatically by Railway — you can skip it)

### Step 4 — Get your URL
Railway gives you a public URL like:
`https://wa-multi-production.up.railway.app`

Share this URL with your 3-4 users. Anyone with the link can access it.

---

## Important notes for Railway

- **Sessions**: WhatsApp sessions are stored in the `sessions/` folder. On Railway, this folder resets if the container restarts — users will need to re-scan QR after deploys. To avoid this, you can add a Railway Volume (persistent disk) — ask for help with this if needed.

- **Data**: `data.json` (schedules, rules, logs) also resets on container restart without a Volume. Add a Volume for production use.

- **Cost**: Railway hobby plan is ~$5/month. More than enough for 4 users.

---

## Environment variables

| Variable | Required | Description |
|---|---|---|
| `ANTHROPIC_API_KEY` | Only for AI filter | Get from console.anthropic.com |
| `PORT` | No | Set automatically by Railway |

---

## Features per user

- ✅ Connect their own WhatsApp (scan QR once)
- ✅ Send messages to any group immediately
- ✅ Forwarding rules: AI filter (Claude) or keyword filter
- ✅ Schedule messages: one-time or recurring
- ✅ Activity log

---

## File structure

```
wa-multi/
├── server/
│   ├── index.js       ← Express API
│   ├── db.js          ← lowdb database (no compilation needed)
│   ├── sessions.js    ← WhatsApp session manager
│   └── scheduler.js   ← Cron job scheduler
├── client/
│   └── src/
│       ├── App.jsx
│       └── components/
│           ├── UserDashboard.jsx
│           ├── QRPanel.jsx
│           ├── SendNow.jsx
│           ├── Rules.jsx
│           ├── Schedules.jsx
│           └── Logs.jsx
├── railway.json       ← Railway deployment config
├── .gitignore
└── package.json
```
