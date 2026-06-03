import makeWASocket, {
  useMultiFileAuthState,
  DisconnectReason,
  fetchLatestBaileysVersion,
} from "@whiskeysockets/baileys";
import { Boom } from "@hapi/boom";
import pino from "pino";
import qrcode from "qrcode";
import path from "path";
import fs from "fs";
import { fileURLToPath } from "url";
import Anthropic from "@anthropic-ai/sdk";
import * as db from "./db.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SESSIONS_DIR = process.env.SESSIONS_PATH || path.join(__dirname, "../sessions");
fs.mkdirSync(SESSIONS_DIR, { recursive: true });

// userId -> { sock, groups, qr, status, phone }
const sessions = new Map();

// SSE: userId -> Set of res
const sseClients = new Map();

export function addSSEClient(userId, res) {
  if (!sseClients.has(userId)) sseClients.set(userId, new Set());
  sseClients.get(userId).add(res);
}
export function removeSSEClient(userId, res) {
  sseClients.get(userId)?.delete(res);
}
function broadcast(userId, data) {
  const payload = `data: ${JSON.stringify(data)}\n\n`;
  sseClients.get(userId)?.forEach(res => res.write(payload));
}

export function getSessionInfo(userId) {
  const s = sessions.get(userId);
  return { status: s?.status || "disconnected", phone: s?.phone || null };
}
export function getGroups(userId) { return sessions.get(userId)?.groups || []; }
export function getQR(userId) { return sessions.get(userId)?.qr || null; }

// ── Claude filter ─────────────────────────────────────────────────────────────
const anthropic = process.env.ANTHROPIC_API_KEY
  ? new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
  : null;

async function claudeDecide(text, senderName, ruleText) {
  if (!anthropic) return { forward: false, reason: "No API key configured" };
  try {
    const resp = await anthropic.messages.create({
      model: "claude-sonnet-4-20250514",
      max_tokens: 150,
      system: `You are a WhatsApp message filter. Rule: ${ruleText}
Respond ONLY with JSON: {"forward":true,"reason":"..."} or {"forward":false,"reason":"..."}`,
      messages: [{ role: "user", content: `Sender: ${senderName}\nMessage: ${text}` }],
    });
    return JSON.parse(resp.content[0].text.trim());
  } catch {
    return { forward: false, reason: "Claude error" };
  }
}

function keywordDecide(text, keywords) {
  const lower = text.toLowerCase();
  const matched = keywords.find(k => lower.includes(k.toLowerCase().trim()));
  return matched
    ? { forward: true, reason: `Matched keyword: "${matched}"` }
    : { forward: false, reason: "No keyword match" };
}

// ── Tag message detection ─────────────────────────────────────────────────────
const DAYS = ["monday","tuesday","wednesday","thursday","friday","saturday","sunday"];

function detectDay(text) {
  const lower = text.toLowerCase();
  return DAYS.find(d => lower.includes(d)) || null;
}

function isTagMessage(text) {
  const lower = text.toLowerCase();
  const hasDay = DAYS.some(d => lower.includes(d));
  const hasTag = text.includes("👆") || lower.includes("batch") ||
    lower.includes("sevak") || lower.includes("divine drive") ||
    lower.includes("happy living") || lower.includes("guilt free");
  return hasDay && hasTag;
}

// ── Per-user, per-group, per-sender message buffer (last 5 mins) ──────────────
// structure: buffers[userId][groupId][senderName] = [{text, ts}]
const buffers = {};

function getBuffer(userId, groupId, sender) {
  if (!buffers[userId]) buffers[userId] = {};
  if (!buffers[userId][groupId]) buffers[userId][groupId] = {};
  if (!buffers[userId][groupId][sender]) buffers[userId][groupId][sender] = [];
  return buffers[userId][groupId][sender];
}

function addToBuffer(userId, groupId, sender, text) {
  const buf = getBuffer(userId, groupId, sender);
  const now = Date.now();
  // Keep only last 5 minutes
  const filtered = buf.filter(m => now - m.ts < 5 * 60 * 1000);
  filtered.push({ text, ts: now });
  buffers[userId][groupId][sender] = filtered;
}

function drainSenderBuffer(userId, groupId, sender) {
  const buf = getBuffer(userId, groupId, sender);
  buffers[userId][groupId][sender] = [];
  return buf;
}

// ── Start session ─────────────────────────────────────────────────────────────
export async function startSession(userId, auto = false) {
  if (sessions.get(userId)?.status === "connected") return;

  const sessionDir = path.join(SESSIONS_DIR, userId);
  fs.mkdirSync(sessionDir, { recursive: true });

  const { state, saveCreds } = await useMultiFileAuthState(sessionDir);
  const { version } = await fetchLatestBaileysVersion();

  const sock = makeWASocket({
    version, auth: state,
    logger: pino({ level: "silent" }),
    printQRInTerminal: false,
    browser: ["WA Multi", "Chrome", "1.0"],
  });

  sessions.set(userId, { sock, groups: [], qr: null, status: "connecting", phone: null });
  sock.ev.on("creds.update", saveCreds);

  sock.ev.on("connection.update", async ({ connection, lastDisconnect, qr }) => {
    const session = sessions.get(userId);
    if (!session) return;

    if (qr) {
      const qrDataUrl = await qrcode.toDataURL(qr);
      session.qr = qrDataUrl;
      session.status = "awaiting_qr";
      broadcast(userId, { type: "qr", qr: qrDataUrl });
      broadcast(userId, { type: "status", status: "awaiting_qr" });
      // Persist QR in db so it survives page refresh
      await db.upsertSessionMeta(userId, { status: "awaiting_qr", qr: qrDataUrl });
    }

    if (connection === "open") {
      session.status = "connected";
      session.qr = null;
      session.phone = sock.user?.id?.split(":")[0];
      broadcast(userId, { type: "status", status: "connected", phone: session.phone });
      await db.addLog(userId, "info", "✅ WhatsApp connected");
      await db.upsertSessionMeta(userId, { status: "connected", phone: session.phone, qr: null, auto_connected: auto });
      // Load groups
      try {
        const raw = await sock.groupFetchAllParticipating();
        session.groups = Object.values(raw).map(g => ({
          id: g.id, name: g.subject, participants: g.participants.length,
        }));
        broadcast(userId, { type: "groups", groups: session.groups });
      } catch {}
    }

    if (connection === "close") {
      const code = new Boom(lastDisconnect?.error)?.output?.statusCode;
      const loggedOut = code === DisconnectReason.loggedOut;
      session.status = loggedOut ? "disconnected" : "reconnecting";
      session.groups = [];
      broadcast(userId, { type: "status", status: session.status });
      await db.addLog(userId, "warn", `Disconnected: ${lastDisconnect?.error?.message || "unknown"}`);
      await db.upsertSessionMeta(userId, { status: session.status, qr: null });
      if (!loggedOut) setTimeout(() => startSession(userId), 5000);
      else sessions.delete(userId);
    }
  });

  // ── Message listener ────────────────────────────────────────────────────────
  sock.ev.on("messages.upsert", async ({ messages, type }) => {
    if (type !== "notify") return;

    for (const msg of messages) {
      if (msg.key.fromMe) continue;
      const groupId = msg.key.remoteJid;
      if (!groupId?.endsWith("@g.us")) continue;

      const text = msg.message?.conversation ||
        msg.message?.extendedTextMessage?.text ||
        msg.message?.imageMessage?.caption;
      if (!text) continue;

      const senderName = msg.pushName || msg.key.participant?.split("@")[0] || "Unknown";

      // ── Batch forwarding ──────────────────────────────────────────────────
      const batchConfig = db.getBatchConfig(userId);
      if (batchConfig?.enabled && batchConfig.source_group_id === groupId) {
        if (isTagMessage(text)) {
          // Tag message — claim this sender's buffered messages
          const day = detectDay(text);
          if (day) {
            const buffered = drainSenderBuffer(userId, groupId, senderName);
            if (buffered.length > 0) {
              for (const m of buffered) {
                await db.saveBatchMsg(userId, { text: m.text, sender: senderName, day });
              }
              await db.addLog(userId, "batch",
                `📥 [${day}] Tagged ${buffered.length} msg(s) from ${senderName} via: "${text.slice(0, 60)}"`);
            } else {
              await db.addLog(userId, "batch",
                `⚠️ [${day}] Tag from ${senderName} but no recent messages buffered (within 5 mins)`);
            }
            broadcast(userId, { type: "log" });
          }
        } else {
          // Content message — add to this sender's buffer
          addToBuffer(userId, groupId, senderName, text);
        }
      }

      // ── Regular forwarding rules ──────────────────────────────────────────
      const rules = db.getEnabledRules(userId);
      for (const rule of rules) {
        if (rule.source_group_id !== groupId) continue;
        let decision;
        if (rule.filter_type === "ai") {
          decision = await claudeDecide(text, senderName, rule.rule_text);
        } else {
          const keywords = (rule.keywords || "").split(",");
          decision = keywordDecide(text, keywords);
        }
        const logMsg = `${decision.forward ? "✅" : "⏭️"} ${senderName}: "${text.slice(0, 50)}" → ${decision.reason}`;
        await db.addLog(userId, decision.forward ? "forward" : "skip", logMsg);
        broadcast(userId, { type: "log" });
        if (decision.forward) {
          const fwdText = `📨 *From ${rule.source_group_name || "Source"}*\n👤 ${senderName}\n─────────────\n${text}`;
          await sock.sendMessage(rule.target_group_id, { text: fwdText });
        }
      }
    }
  });
}

// ── Send message ──────────────────────────────────────────────────────────────
export async function sendMessage(userId, groupId, text) {
  const session = sessions.get(userId);
  if (!session?.sock || session.status !== "connected")
    throw new Error("WhatsApp not connected");
  await session.sock.sendMessage(groupId, { text });
}

// ── Disconnect ────────────────────────────────────────────────────────────────
export async function disconnectSession(userId) {
  const session = sessions.get(userId);
  if (session?.sock) await session.sock.logout().catch(() => {});
  sessions.delete(userId);
  const sessionDir = path.join(SESSIONS_DIR, userId);
  fs.rmSync(sessionDir, { recursive: true, force: true });
  await db.upsertSessionMeta(userId, { status: "disconnected", qr: null, phone: null });
  broadcast(userId, { type: "status", status: "disconnected" });
}

// ── Boot existing sessions ────────────────────────────────────────────────────
export async function bootSessions() {
  const sessionDirs = fs.readdirSync(SESSIONS_DIR).filter(f =>
    fs.statSync(path.join(SESSIONS_DIR, f)).isDirectory()
  );
  for (const userId of sessionDirs) {
    if (db.getUser(userId)) {
      console.log(`🔄 Restoring session: ${userId}`);
      startSession(userId).catch(() => {});
    }
  }
}
