import { useState, useEffect } from "react";
import { Plus, Trash2, ToggleLeft, ToggleRight, Clock, Repeat } from "lucide-react";

const PRESETS = [
  { label: "Every Monday 9 am", value: "0 9 * * 1" },
  { label: "Every day 8 am", value: "0 8 * * *" },
  { label: "Every Friday 6 pm", value: "0 18 * * 5" },
  { label: "Every Sunday 10 am", value: "0 10 * * 0" },
  { label: "1st of every month", value: "0 9 1 * *" },
  { label: "Custom…", value: "custom" },
];
const blank = { group_id: "", message: "", type: "once", send_at: "", preset: "", cron_expr: "" };

export default function Schedules({ userId, groups, isConnected }) {
  const [schedules, setSchedules] = useState([]);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState(blank);

  const load = () => fetch(`/api/users/${userId}/schedules`).then(r => r.json()).then(setSchedules);
  useEffect(() => { load(); }, [userId]);
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  const create = async () => {
    if (!form.group_id || !form.message.trim()) return alert("Select a group and write a message.");
    const g = groups.find(g => g.id === form.group_id);
    let payload = { group_id: form.group_id, group_name: g?.name || "", message: form.message.trim(), type: form.type };
    if (form.type === "once") {
      if (!form.send_at) return alert("Pick a date and time.");
      payload.send_at = Math.floor(new Date(form.send_at).getTime() / 1000);
    } else {
      const expr = form.preset === "custom" ? form.cron_expr : form.preset;
      if (!expr) return alert("Choose a schedule.");
      payload.cron_expr = expr;
    }
    await fetch(`/api/users/${userId}/schedules`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    setShowForm(false); setForm(blank); load();
  };

  const toggle = async (s) => {
    await fetch(`/api/users/${userId}/schedules/${s.id}`, {
      method: "PATCH", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ enabled: s.enabled ? 0 : 1 }),
    });
    load();
  };

  const remove = async (id) => {
    if (!confirm("Delete this schedule?")) return;
    await fetch(`/api/users/${userId}/schedules/${id}`, { method: "DELETE" });
    load();
  };

  return (
    <div style={{ maxWidth: 680, display: "flex", flexDirection: "column", gap: 16 }} className="fi">
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between" }}>
        <div>
          <div style={{ fontFamily: "var(--font-h)", fontWeight: 700, fontSize: 18, marginBottom: 4 }}>Scheduled Messages</div>
          <div style={{ color: "var(--text2)", fontSize: 12 }}>One-time or recurring messages sent automatically.</div>
        </div>
        <button className="btn btn-green btn-sm" onClick={() => setShowForm(v => !v)}>
          <Plus size={13} /> {showForm ? "Cancel" : "New Schedule"}
        </button>
      </div>

      {showForm && (
        <div className="card fi" style={{ display: "flex", flexDirection: "column", gap: 14, borderColor: "var(--border2)" }}>
          <div style={{ fontFamily: "var(--font-h)", fontWeight: 700, fontSize: 14 }}>New Scheduled Message</div>
          <div>
            <label className="lbl">Target Group</label>
            <select value={form.group_id} onChange={e => set("group_id", e.target.value)}>
              <option value="">Select group…</option>
              {groups.map(g => <option key={g.id} value={g.id}>{g.name}</option>)}
            </select>
          </div>
          <div>
            <label className="lbl">Message</label>
            <textarea rows={5} value={form.message} onChange={e => set("message", e.target.value)} placeholder="Type your message…" />
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            {[["once", "One-time", <Clock size={12} />], ["recurring", "Recurring", <Repeat size={12} />]].map(([val, label, icon]) => (
              <button key={val} onClick={() => set("type", val)} className="btn btn-sm"
                style={{ border: `1px solid ${form.type === val ? "var(--green)" : "var(--border)"}`, color: form.type === val ? "var(--green)" : "var(--text2)", background: form.type === val ? "var(--gdim)" : "transparent" }}>
                {icon} {label}
              </button>
            ))}
          </div>
          {form.type === "once" && (
            <div>
              <label className="lbl">Send At</label>
              <input type="datetime-local" value={form.send_at} onChange={e => set("send_at", e.target.value)} />
            </div>
          )}
          {form.type === "recurring" && (
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              <div>
                <label className="lbl">Repeat</label>
                <select value={form.preset} onChange={e => set("preset", e.target.value)}>
                  <option value="">Choose…</option>
                  {PRESETS.map(p => <option key={p.value} value={p.value}>{p.label}</option>)}
                </select>
              </div>
              {form.preset === "custom" && (
                <div>
                  <label className="lbl">Cron Expression</label>
                  <input value={form.cron_expr} onChange={e => set("cron_expr", e.target.value)} placeholder="e.g. 0 9 * * 1" />
                  <div style={{ fontSize: 11, color: "var(--text2)", marginTop: 4 }}>Build one at <b>crontab.guru</b></div>
                </div>
              )}
            </div>
          )}
          <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
            <button className="btn btn-ghost btn-sm" onClick={() => { setShowForm(false); setForm(blank); }}>Cancel</button>
            <button className="btn btn-green btn-sm" onClick={create}>Save Schedule</button>
          </div>
        </div>
      )}

      {schedules.length === 0 && !showForm && (
        <div style={{ textAlign: "center", padding: "40px 0", color: "var(--text2)", fontSize: 13 }}>No schedules yet.</div>
      )}

      {schedules.map(s => (
        <div key={s.id} className="card" style={{ display: "flex", gap: 12, opacity: s.enabled ? 1 : 0.5 }}>
          <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 8 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
              {s.type === "once" ? <Clock size={13} color="var(--amber)" /> : <Repeat size={13} color="var(--indigo)" />}
              <span style={{ color: "var(--text2)", fontSize: 12 }}>
                {s.type === "once" ? (s.send_at ? new Date(s.send_at * 1000).toLocaleString() : "—") : s.cron_expr}
              </span>
              <span style={{ color: "var(--text3)" }}>→</span>
              <span style={{ color: "var(--green)", fontSize: 12 }}>{s.group_name || s.group_id}</span>
            </div>
            <div style={{ background: "var(--bg3)", padding: "8px 12px", borderRadius: 6, fontSize: 12, lineHeight: 1.6, whiteSpace: "pre-wrap" }}>{s.message}</div>
            <span className={`tag ${s.type === "once" && s.sent ? "tg" : s.enabled ? (s.type === "once" ? "ta" : "ti") : "tr"}`} style={{ alignSelf: "flex-start" }}>
              {s.type === "once" && s.sent ? "✓ Sent" : s.enabled ? (s.type === "once" ? "Pending" : "Active") : "Paused"}
            </span>
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            {!s.sent && <button className="btn btn-ghost btn-sm" onClick={() => toggle(s)}>{s.enabled ? <ToggleRight size={15} color="var(--green)" /> : <ToggleLeft size={15} />}</button>}
            <button className="btn btn-danger btn-sm" onClick={() => remove(s.id)}><Trash2 size={13} /></button>
          </div>
        </div>
      ))}
    </div>
  );
}
