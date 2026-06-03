import { Low } from "lowdb";
import { JSONFile } from "lowdb/node";
import { fileURLToPath } from "url";
import path from "path";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const file = process.env.DATA_PATH || path.join(__dirname, "../data.json");
const adapter = new JSONFile(file);
const db = new Low(adapter, {
  users: [], schedules: [], rules: [], activity: [],
  batch_configs: [], pending_batch_msgs: [], session_meta: []
});

let ready = false;

export async function initDB() {
  await db.read();
  // Ensure new collections exist in old data files
  db.data.batch_configs = db.data.batch_configs || [];
  db.data.pending_batch_msgs = db.data.pending_batch_msgs || [];
  db.data.session_meta = db.data.session_meta || [];
  ready = true;
  console.log("💾 Database ready");
}

async function save() { await db.write(); }
function now() { return Math.floor(Date.now() / 1000); }

// ── Users ─────────────────────────────────────────────────────────────────────
export const getUsers = () => db.data.users || [];
export const getUser = (id) => (db.data.users || []).find(u => u.id === id);
export const createUser = async (id, name) => {
  db.data.users.push({ id, name, created_at: now() });
  await save();
};
export const deleteUser = async (id) => {
  db.data.users = db.data.users.filter(u => u.id !== id);
  db.data.rules = db.data.rules.filter(r => r.user_id !== id);
  db.data.schedules = db.data.schedules.filter(s => s.user_id !== id);
  db.data.activity = db.data.activity.filter(a => a.user_id !== id);
  db.data.batch_configs = db.data.batch_configs.filter(b => b.user_id !== id);
  db.data.pending_batch_msgs = db.data.pending_batch_msgs.filter(m => m.user_id !== id);
  db.data.session_meta = db.data.session_meta.filter(s => s.user_id !== id);
  await save();
};

// ── Forwarding Rules ──────────────────────────────────────────────────────────
export const getRules = (userId) => (db.data.rules || []).filter(r => r.user_id === userId);
export const getRule = (id) => (db.data.rules || []).find(r => r.id === id);
export const getEnabledRules = (userId) => (db.data.rules || []).filter(r => r.user_id === userId && r.enabled);
export const createRule = async (rule) => {
  db.data.rules.push({ ...rule, enabled: 1, created_at: now() });
  await save();
};
export const updateRule = async (id, updates) => {
  const i = db.data.rules.findIndex(r => r.id === id);
  if (i !== -1) { Object.assign(db.data.rules[i], updates); await save(); }
};
export const deleteRule = async (id) => {
  db.data.rules = db.data.rules.filter(r => r.id !== id);
  await save();
};

// ── Schedules ─────────────────────────────────────────────────────────────────
export const getSchedules = (userId) =>
  [...(db.data.schedules || []).filter(s => s.user_id === userId)]
    .sort((a, b) => b.created_at - a.created_at);
export const getSchedule = (id) => (db.data.schedules || []).find(s => s.id === id);
export const createSchedule = async (s) => {
  db.data.schedules.push({ ...s, sent: 0, enabled: 1, created_at: now() });
  await save();
};
export const updateSchedule = async (id, updates) => {
  const i = db.data.schedules.findIndex(s => s.id === id);
  if (i !== -1) { Object.assign(db.data.schedules[i], updates); await save(); }
};
export const deleteSchedule = async (id) => {
  db.data.schedules = db.data.schedules.filter(s => s.id !== id);
  await save();
};
export const getPendingOneTime = () =>
  (db.data.schedules || []).filter(s =>
    s.type === "once" && !s.sent && s.enabled && s.send_at <= now()
  );
export const getRecurring = () =>
  (db.data.schedules || []).filter(s => s.type === "recurring" && s.enabled);

// ── Batch Forwarding Config ───────────────────────────────────────────────────
// One config per user — source group, target group, enabled toggle
export const getBatchConfig = (userId) =>
  (db.data.batch_configs || []).find(b => b.user_id === userId) || null;

export const upsertBatchConfig = async (userId, config) => {
  const i = db.data.batch_configs.findIndex(b => b.user_id === userId);
  if (i !== -1) {
    Object.assign(db.data.batch_configs[i], config);
  } else {
    db.data.batch_configs.push({ user_id: userId, ...config, created_at: now() });
  }
  await save();
};

// ── Pending Batch Messages ────────────────────────────────────────────────────
// Messages captured from source group, tagged with a day name, waiting to be forwarded

const DAYS = ["sunday","monday","tuesday","wednesday","thursday","friday","saturday"];

export function detectDay(text) {
  const lower = text.toLowerCase();
  return DAYS.find(d => lower.includes(d)) || null;
}

export const saveBatchMsg = async (userId, { text, sender, day }) => {
  db.data.pending_batch_msgs.push({
    id: now() + Math.random().toString(36).slice(2),
    user_id: userId, text, sender, day,
    captured_at: now()
  });
  await save();
};

export const getBatchMsgsByDay = (userId, day) =>
  (db.data.pending_batch_msgs || []).filter(
    m => m.user_id === userId && m.day === day.toLowerCase()
  ).sort((a, b) => a.captured_at - b.captured_at);

export const getAllPendingBatchMsgs = (userId) =>
  (db.data.pending_batch_msgs || [])
    .filter(m => m.user_id === userId)
    .sort((a, b) => a.captured_at - b.captured_at);

export const deleteBatchMsgsByDay = async (userId, day) => {
  db.data.pending_batch_msgs = db.data.pending_batch_msgs.filter(
    m => !(m.user_id === userId && m.day === day.toLowerCase())
  );
  await save();
};

// ── Activity Log ──────────────────────────────────────────────────────────────
export const addLog = async (userId, type, message) => {
  const activity = db.data.activity || [];
  const id = activity.length ? Math.max(...activity.map(a => a.id)) + 1 : 1;
  activity.unshift({ id, user_id: userId, type, message, created_at: now() });
  db.data.activity = activity.slice(0, 500);
  await save();
};
export const getLogs = (userId, limit = 100) =>
  (db.data.activity || []).filter(a => a.user_id === userId).slice(0, limit);


// ── Session Meta (persisted QR + status for page refresh) ────────────────────
export const getSessionMeta = (userId) =>
  (db.data.session_meta || []).find(s => s.user_id === userId) || null;

export const upsertSessionMeta = async (userId, updates) => {
  const i = db.data.session_meta.findIndex(s => s.user_id === userId);
  if (i !== -1) {
    Object.assign(db.data.session_meta[i], updates);
  } else {
    db.data.session_meta.push({ user_id: userId, ...updates });
  }
  await save();
};

export default db;
