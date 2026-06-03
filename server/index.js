import express from "express";
import cors from "cors";
import path from "path";
import { fileURLToPath } from "url";
import { v4 as uuid } from "uuid";
import * as db from "./db.js";
import {
  startSession, disconnectSession, sendMessage,
  getSessionInfo, getGroups, getQR,
  addSSEClient, removeSSEClient, bootSessions,
} from "./sessions.js";
import { bootSchedules, registerRecurring, unregisterRecurring } from "./scheduler.js";
import { initDB } from "./db.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, "../client/dist")));

// ── Users ─────────────────────────────────────────────────────────────────────
app.get("/api/users", (req, res) => {
  const users = db.getUsers().map(u => {
    const live = getSessionInfo(u.id);
    const meta = db.getSessionMeta(u.id);
    // Use live status if active, otherwise fall back to persisted meta
    const status = live.status !== "disconnected" ? live.status : (meta?.status || "disconnected");
    const phone = live.phone || meta?.phone || null;
    return { ...u, session: { status, phone } };
  });
  res.json(users);
});

app.post("/api/users", async (req, res) => {
  const { name } = req.body;
  if (!name?.trim()) return res.status(400).json({ error: "Name required" });
  const id = uuid();
  await db.createUser(id, name.trim());
  res.json({ id, name: name.trim() });
});

app.delete("/api/users/:userId", async (req, res) => {
  await disconnectSession(req.params.userId).catch(() => {});
  await db.deleteUser(req.params.userId);
  res.json({ ok: true });
});

// ── WhatsApp connection ───────────────────────────────────────────────────────
app.post("/api/users/:userId/connect", async (req, res) => {
  const { userId } = req.params;
  if (!db.getUser(userId)) return res.status(404).json({ error: "User not found" });
  startSession(userId).catch(() => {});
  res.json({ ok: true });
});

app.post("/api/users/:userId/disconnect", async (req, res) => {
  await disconnectSession(req.params.userId);
  res.json({ ok: true });
});

// SSE stream per user
app.get("/api/users/:userId/stream", (req, res) => {
  const { userId } = req.params;
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.flushHeaders();
  addSSEClient(userId, res);

  // Live state from memory
  const qr = getQR(userId);
  const info = getSessionInfo(userId);
  const groups = getGroups(userId);
  // Persisted state as fallback (survives page refresh)
  const meta = db.getSessionMeta(userId);

  // Send QR: live first, then persisted if session not yet active
  if (qr) {
    res.write(`data: ${JSON.stringify({ type: "qr", qr })}\n\n`);
  } else if (meta && meta.qr && info.status !== "connected") {
    res.write(`data: ${JSON.stringify({ type: "qr", qr: meta.qr })}\n\n`);
  }

  // Send status: live if active, else from persisted meta
  const phone = info.phone || meta?.phone || null;
  const status = info.status !== "disconnected" ? info.status : (meta?.status || "disconnected");
  res.write(`data: ${JSON.stringify({ type: "status", status, phone })}\n\n`);
  res.write(`data: ${JSON.stringify({ type: "groups", groups })}\n\n`);

  req.on("close", () => removeSSEClient(userId, res));
});

app.get("/api/users/:userId/groups", (req, res) => {
  res.json(getGroups(req.params.userId));
});

// ── Send now ──────────────────────────────────────────────────────────────────
app.post("/api/users/:userId/send", async (req, res) => {
  const { userId } = req.params;
  const { group_id, message } = req.body;
  if (!group_id || !message) return res.status(400).json({ error: "group_id and message required" });
  try {
    await sendMessage(userId, group_id, message);
    const group = getGroups(userId).find(g => g.id === group_id);
    await db.addLog(userId, "sent", `📤 Sent to ${group?.name || group_id}`);
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── Forwarding Rules ──────────────────────────────────────────────────────────
app.get("/api/users/:userId/rules", (req, res) => {
  res.json(db.getRules(req.params.userId));
});

app.post("/api/users/:userId/rules", async (req, res) => {
  const { userId } = req.params;
  const { source_group_id, source_group_name, target_group_id, target_group_name, filter_type, rule_text, keywords } = req.body;
  if (!source_group_id || !target_group_id || !filter_type)
    return res.status(400).json({ error: "Missing required fields" });
  const rule = {
    id: uuid(), user_id: userId,
    source_group_id, source_group_name: source_group_name || "",
    target_group_id, target_group_name: target_group_name || "",
    filter_type, rule_text: rule_text || "", keywords: keywords || "",
  };
  await db.createRule(rule);
  res.json(rule);
});

app.patch("/api/users/:userId/rules/:ruleId", async (req, res) => {
  const allowed = ["source_group_id", "source_group_name", "target_group_id", "target_group_name", "filter_type", "rule_text", "keywords", "enabled"];
  const updates = Object.fromEntries(Object.entries(req.body).filter(([k]) => allowed.includes(k)));
  await db.updateRule(req.params.ruleId, updates);
  res.json(db.getRule(req.params.ruleId));
});

app.delete("/api/users/:userId/rules/:ruleId", async (req, res) => {
  await db.deleteRule(req.params.ruleId);
  res.json({ ok: true });
});

// ── Schedules ─────────────────────────────────────────────────────────────────
app.get("/api/users/:userId/schedules", (req, res) => {
  res.json(db.getSchedules(req.params.userId));
});

app.post("/api/users/:userId/schedules", async (req, res) => {
  const { userId } = req.params;
  const { group_id, group_name, message, type, cron_expr, send_at } = req.body;
  if (!group_id || !message || !type) return res.status(400).json({ error: "Missing fields" });
  const s = { id: uuid(), user_id: userId, group_id, group_name: group_name || "", message, type, cron_expr: cron_expr || null, send_at: send_at || null };
  await db.createSchedule(s);
  if (type === "recurring") registerRecurring({ ...s, enabled: 1 });
  res.json(s);
});

app.patch("/api/users/:userId/schedules/:id", async (req, res) => {
  const allowed = ["message", "cron_expr", "send_at", "enabled", "group_id", "group_name"];
  const updates = Object.fromEntries(Object.entries(req.body).filter(([k]) => allowed.includes(k)));
  await db.updateSchedule(req.params.id, updates);
  const updated = db.getSchedule(req.params.id);
  if (updated?.type === "recurring") {
    updated.enabled ? registerRecurring(updated) : unregisterRecurring(req.params.id);
  }
  res.json(updated);
});

app.delete("/api/users/:userId/schedules/:id", async (req, res) => {
  unregisterRecurring(req.params.id);
  await db.deleteSchedule(req.params.id);
  res.json({ ok: true });
});

// ── Logs ──────────────────────────────────────────────────────────────────────
app.get("/api/users/:userId/logs", (req, res) => {
  res.json(db.getLogs(req.params.userId));
});

// ── Fallback ──────────────────────────────────────────────────────────────────
app.get("*", (req, res) =>
  res.sendFile(path.join(__dirname, "../client/dist/index.html"))
);

const PORT = process.env.PORT || 3001;
app.listen(PORT, async () => {
  console.log(`\n🚀 WA Multi running → http://localhost:${PORT}\n`);
  await initDB();
  await bootSessions();
  bootSchedules();
});

// ── Batch Forwarding Config ───────────────────────────────────────────────────
app.get("/api/users/:userId/batch-config", (req, res) => {
  res.json(db.getBatchConfig(req.params.userId) || {});
});

app.post("/api/users/:userId/batch-config", async (req, res) => {
  const { userId } = req.params;
  const { source_group_id, source_group_name, target_group_id, target_group_name, enabled } = req.body;
  await db.upsertBatchConfig(userId, { source_group_id, source_group_name, target_group_id, target_group_name, enabled });
  res.json(db.getBatchConfig(userId));
});

app.get("/api/users/:userId/pending-batch-msgs", (req, res) => {
  res.json(db.getAllPendingBatchMsgs(req.params.userId));
});

app.delete("/api/users/:userId/pending-batch-msgs/:day", async (req, res) => {
  await db.deleteBatchMsgsByDay(req.params.userId, req.params.day);
  res.json({ ok: true });
});
