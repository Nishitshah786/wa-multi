import { useState, useEffect } from "react";
import { RefreshCw } from "lucide-react";

const ICON  = { sent: "📤", forward: "✅", skip: "⏭️", schedule: "📅", info: "ℹ️", warn: "⚠️", error: "❌" };
const COLOR = { sent: "var(--green)", forward: "var(--green)", skip: "var(--text2)", schedule: "var(--indigo)", info: "var(--text2)", warn: "var(--amber)", error: "var(--red)" };

export default function Logs({ userId, tick }) {
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(false);

  const load = async () => {
    setLoading(true);
    const data = await fetch(`/api/users/${userId}/logs`).then(r => r.json());
    setLogs(data);
    setLoading(false);
  };

  useEffect(() => { load(); }, [userId, tick]);
  useEffect(() => { const t = setInterval(load, 8000); return () => clearInterval(t); }, [userId]);

  return (
    <div style={{ maxWidth: 700, display: "flex", flexDirection: "column", gap: 12 }} className="fi">
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <div>
          <div style={{ fontFamily: "var(--font-h)", fontWeight: 700, fontSize: 18, marginBottom: 4 }}>Activity Log</div>
          <div style={{ color: "var(--text2)", fontSize: 12 }}>Last 100 events · auto-refreshes every 8s</div>
        </div>
        <button className="btn btn-ghost btn-sm" onClick={load} disabled={loading}>
          <RefreshCw size={12} className={loading ? "spin" : ""} /> Refresh
        </button>
      </div>
      {logs.length === 0 && <div style={{ textAlign: "center", padding: "40px 0", color: "var(--text2)" }}>No activity yet.</div>}
      <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
        {logs.map(log => (
          <div key={log.id} style={{ display: "flex", gap: 10, padding: "7px 12px", background: "var(--bg2)", border: "1px solid var(--border)", borderRadius: 6, fontSize: 12, alignItems: "flex-start" }}>
            <span style={{ color: "var(--text2)", whiteSpace: "nowrap", flexShrink: 0, fontVariantNumeric: "tabular-nums" }}>
              {new Date(log.created_at * 1000).toLocaleTimeString()}
            </span>
            <span style={{ flexShrink: 0 }}>{ICON[log.type] || "•"}</span>
            <span style={{ color: COLOR[log.type] || "var(--text)", wordBreak: "break-word" }}>{log.message}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
