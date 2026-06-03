import { useState, useEffect } from "react";
import { ArrowRight, ToggleLeft, ToggleRight, Trash2, RefreshCw } from "lucide-react";

const DAYS = ["monday","tuesday","wednesday","thursday","friday","saturday","sunday"];

export default function BatchForwarding({ userId, groups, isConnected }) {
  const [config, setConfig] = useState(null);
  const [msgs, setMsgs] = useState([]);
  const [form, setForm] = useState({ source_group_id: "", target_group_id: "", enabled: true });
  const [saving, setSaving] = useState(false);

  const loadConfig = async () => {
    const c = await fetch(`/api/users/${userId}/batch-config`).then(r => r.json());
    if (c?.source_group_id) { setConfig(c); setForm(c); }
  };
  const loadMsgs = async () => {
    const m = await fetch(`/api/users/${userId}/pending-batch-msgs`).then(r => r.json());
    setMsgs(m);
  };

  useEffect(() => { loadConfig(); loadMsgs(); }, [userId]);
  useEffect(() => { const t = setInterval(loadMsgs, 15000); return () => clearInterval(t); }, [userId]);

  const save = async () => {
    if (!form.source_group_id || !form.target_group_id) return alert("Select both groups.");
    setSaving(true);
    const src = groups.find(g => g.id === form.source_group_id);
    const tgt = groups.find(g => g.id === form.target_group_id);
    const res = await fetch(`/api/users/${userId}/batch-config`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...form, source_group_name: src?.name || "", target_group_name: tgt?.name || "" }),
    }).then(r => r.json());
    setConfig(res);
    setSaving(false);
  };

  const toggle = async () => {
    const updated = { ...config, enabled: !config.enabled };
    await fetch(`/api/users/${userId}/batch-config`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify(updated),
    });
    setConfig(updated);
    setForm(updated);
  };

  const clearDay = async (day) => {
    if (!confirm(`Clear all ${day} messages? They won't be forwarded.`)) return;
    await fetch(`/api/users/${userId}/pending-batch-msgs/${day}`, { method: "DELETE" });
    loadMsgs();
  };

  // Group messages by day
  const byDay = DAYS.reduce((acc, d) => {
    acc[d] = msgs.filter(m => m.day === d);
    return acc;
  }, {});

  return (
    <div style={{ maxWidth: 680, display: "flex", flexDirection: "column", gap: 20 }} className="fi">
      <div>
        <div style={{ fontFamily: "var(--font-h)", fontWeight: 700, fontSize: 18, marginBottom: 4 }}>Batch Forwarding</div>
        <div style={{ color: "var(--text2)", fontSize: 12, lineHeight: 1.6 }}>
          Listens to source group for messages tagged with a day name (e.g. "Batch P Monday").<br />
          Every day at <b>12:01 AM IST</b>, forwards that day's captured messages to the target group.
        </div>
      </div>

      {!isConnected && <div className="card" style={{ borderColor: "var(--adim)", background: "var(--adim)" }}><span style={{ color: "var(--amber)", fontSize: 12 }}>⚠️ Connect WhatsApp to use this feature.</span></div>}

      {/* Config card */}
      <div className="card" style={{ display: "flex", flexDirection: "column", gap: 14 }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div style={{ fontFamily: "var(--font-h)", fontWeight: 700, fontSize: 14 }}>Configuration</div>
          {config && (
            <button className="btn btn-ghost btn-sm" onClick={toggle}>
              {config.enabled ? <><ToggleRight size={15} color="var(--green)" /> Active</> : <><ToggleLeft size={15} /> Paused</>}
            </button>
          )}
        </div>

        <div style={{ display: "flex", gap: 12, alignItems: "flex-end" }}>
          <div style={{ flex: 1 }}>
            <label className="lbl">Source Group (listen from)</label>
            <select value={form.source_group_id} onChange={e => setForm(f => ({ ...f, source_group_id: e.target.value }))}>
              <option value="">Select…</option>
              {groups.map(g => <option key={g.id} value={g.id}>{g.name}</option>)}
            </select>
          </div>
          <div style={{ paddingBottom: 10 }}><ArrowRight size={16} color="var(--text2)" /></div>
          <div style={{ flex: 1 }}>
            <label className="lbl">Target Group (forward to)</label>
            <select value={form.target_group_id} onChange={e => setForm(f => ({ ...f, target_group_id: e.target.value }))}>
              <option value="">Select…</option>
              {groups.map(g => <option key={g.id} value={g.id}>{g.name}</option>)}
            </select>
          </div>
        </div>

        <div style={{ display: "flex", justifyContent: "flex-end" }}>
          <button className="btn btn-green btn-sm" onClick={save} disabled={saving || !isConnected}>
            {saving ? "Saving…" : config ? "Update" : "Activate"}
          </button>
        </div>

        {config && (
          <div style={{ background: "var(--bg3)", padding: "10px 14px", borderRadius: 6, fontSize: 12, color: "var(--text2)", lineHeight: 1.7 }}>
            <div>📡 Listening: <span style={{ color: "var(--green)" }}>{config.source_group_name || config.source_group_id}</span></div>
            <div>📤 Forwarding to: <span style={{ color: "var(--indigo)" }}>{config.target_group_name || config.target_group_id}</span></div>
            <div>⏰ Trigger: 12:01 AM IST daily</div>
            <div>🔌 Auto-connect: 11:58 PM IST · Auto-disconnect: 12:05 AM IST</div>
            <div>🏷️ Detects: Monday – Sunday anywhere in tag message</div>
          </div>
        )}
      </div>

      {/* Pending messages */}
      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div style={{ fontFamily: "var(--font-h)", fontWeight: 700, fontSize: 14 }}>Captured Messages</div>
          <button className="btn btn-ghost btn-sm" onClick={loadMsgs}><RefreshCw size={12} /> Refresh</button>
        </div>
        <div style={{ fontSize: 12, color: "var(--text2)" }}>
          Messages captured from the source group, waiting to be forwarded at 12:01 AM IST on their tagged day.
        </div>

        {msgs.length === 0 && (
          <div style={{ textAlign: "center", padding: "24px 0", color: "var(--text2)", fontSize: 12 }}>
            No messages captured yet. Messages will appear here as they arrive in the source group.
          </div>
        )}

        {DAYS.filter(d => byDay[d].length > 0).map(day => (
          <div key={day} className="card" style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <span style={{ fontFamily: "var(--font-h)", fontWeight: 700, fontSize: 13, textTransform: "capitalize" }}>{day}</span>
                <span className="tag ti">{byDay[day].length} message{byDay[day].length > 1 ? "s" : ""}</span>
              </div>
              <button className="btn btn-danger btn-sm" onClick={() => clearDay(day)} title="Clear all">
                <Trash2 size={12} /> Clear
              </button>
            </div>
            {byDay[day].map((m, i) => (
              <div key={i} style={{ background: "var(--bg3)", borderRadius: 6, padding: "8px 12px", fontSize: 12, display: "flex", flexDirection: "column", gap: 3 }}>
                <div style={{ color: "var(--text2)" }}>👤 {m.sender} · {new Date(m.captured_at * 1000).toLocaleString("en-IN", { timeZone: "Asia/Kolkata" })}</div>
                <div style={{ color: "var(--text)", whiteSpace: "pre-wrap", lineHeight: 1.6 }}>{m.text}</div>
              </div>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}
