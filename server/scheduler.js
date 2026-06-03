import cron from "node-cron";
import * as db from "./db.js";
import { sendMessage, startSession, disconnectSession, getSessionInfo } from "./sessions.js";

const jobs = new Map();

// ── One-time scheduled messages: check every minute ───────────────────────────
cron.schedule("* * * * *", async () => {
  const pending = db.getPendingOneTime();
  for (const s of pending) {
    try {
      await sendMessage(s.user_id, s.group_id, s.message);
      await db.updateSchedule(s.id, { sent: 1 });
      await db.addLog(s.user_id, "schedule", `📅 Sent to ${s.group_name || s.group_id}`);
    } catch (err) {
      await db.addLog(s.user_id, "error", `❌ Schedule failed: ${err.message}`);
    }
  }
});

// ── Auto-connect 3 mins before batch send (11:58 PM IST = 18:28 UTC) ─────────
cron.schedule("28 18 * * *", async () => {
  console.log("⏰ Auto-connecting sessions for batch send...");
  const users = db.getUsers();
  for (const user of users) {
    const config = db.getBatchConfig(user.id);
    if (!config?.enabled) continue;
    const info = getSessionInfo(user.id);
    if (info.status !== "connected") {
      console.log(`🔌 Auto-connecting: ${user.name}`);
      startSession(user.id).catch(() => {});
      await db.addLog(user.id, "info", "🔌 Auto-connecting for batch send...");
    }
  }
});

// ── Batch forwarding: runs at 12:01 AM IST (18:31 UTC) ───────────────────────
cron.schedule("31 18 * * *", async () => {
  const nowIST = new Date(Date.now() + (5.5 * 60 * 60 * 1000));
  const dayName = ["sunday","monday","tuesday","wednesday","thursday","friday","saturday"][nowIST.getUTCDay()];

  console.log(`⏰ Batch forward trigger: IST day = ${dayName}`);

  const users = db.getUsers();
  for (const user of users) {
    const config = db.getBatchConfig(user.id);
    if (!config?.enabled || !config.target_group_id) continue;

    const messages = db.getBatchMsgsByDay(user.id, dayName);
    if (!messages.length) {
      await db.addLog(user.id, "batch", `📭 No ${dayName} messages to forward`);
      continue;
    }

    await db.addLog(user.id, "batch", `📤 Forwarding ${messages.length} ${dayName} message(s)...`);

    for (const m of messages) {
      try {
        await sendMessage(user.id, config.target_group_id, m.text);
        await new Promise(r => setTimeout(r, 1500));
      } catch (err) {
        await db.addLog(user.id, "error", `❌ Batch send failed: ${err.message}`);
      }
    }

    await db.deleteBatchMsgsByDay(user.id, dayName);
    await db.addLog(user.id, "batch", `✅ Forwarded and cleared ${messages.length} ${dayName} message(s)`);
  }
});

// ── Auto-disconnect 5 mins after batch send (12:05 AM IST = 18:35 UTC) ───────
cron.schedule("35 18 * * *", async () => {
  console.log("⏰ Auto-disconnecting sessions after batch send...");
  const users = db.getUsers();
  for (const user of users) {
    const config = db.getBatchConfig(user.id);
    if (!config?.enabled) continue;
    const info = getSessionInfo(user.id);
    if (info.status === "connected") {
      console.log(`🔌 Auto-disconnecting: ${user.name}`);
      await disconnectSession(user.id).catch(() => {});
      await db.addLog(user.id, "info", "🔌 Auto-disconnected after batch send");
    }
  }
});


// ── Auto-connect at 11:58 PM IST (18:28 UTC) ─────────────────────────────────
cron.schedule("28 18 * * *", async () => {
  console.log("⏰ Auto-connect: connecting all users for batch send...");
  const users = db.getUsers();
  for (const user of users) {
    const config = db.getBatchConfig(user.id);
    if (!config?.enabled) continue;
    const info = getSessionInfo(user.id);
    if (info.status !== "connected") {
      console.log(`🔌 Auto-connecting: ${user.name}`);
      startSession(user.id, true).catch(err =>
        console.error(`Auto-connect failed for ${user.name}:`, err.message)
      );
      await db.addLog(user.id, "info", "🔌 Auto-connecting for batch send...");
    }
  }
});

// ── Auto-disconnect at 12:05 AM IST (18:35 UTC) ───────────────────────────────
cron.schedule("35 18 * * *", async () => {
  console.log("⏰ Auto-disconnect: disconnecting all auto-connected users...");
  const users = db.getUsers();
  for (const user of users) {
    const config = db.getBatchConfig(user.id);
    if (!config?.enabled) continue;
    // Only disconnect if this was an auto-connect (not manually connected)
    const meta = db.getSessionMeta(user.id);
    if (meta?.auto_connected) {
      console.log(`🔌 Auto-disconnecting: ${user.name}`);
      await disconnectSession(user.id).catch(() => {});
      await db.upsertSessionMeta(user.id, { auto_connected: false });
      await db.addLog(user.id, "info", "🔌 Auto-disconnected after batch send");
    }
  }
});

// ── Recurring scheduled messages ──────────────────────────────────────────────
export function registerRecurring(s) {
  if (jobs.has(s.id)) { jobs.get(s.id).stop(); }
  if (!s.enabled || !cron.validate(s.cron_expr)) return;
  const job = cron.schedule(s.cron_expr, async () => {
    try {
      await sendMessage(s.user_id, s.group_id, s.message);
      await db.addLog(s.user_id, "schedule", `🔁 Recurring sent to ${s.group_name || s.group_id}`);
    } catch (err) {
      await db.addLog(s.user_id, "error", `❌ Recurring failed: ${err.message}`);
    }
  });
  jobs.set(s.id, job);
}

export function unregisterRecurring(id) {
  if (jobs.has(id)) { jobs.get(id).stop(); jobs.delete(id); }
}

export function bootSchedules() {
  const recurring = db.getRecurring();
  recurring.forEach(registerRecurring);
  console.log(`⏰ Loaded ${recurring.length} recurring schedule(s)`);
}
