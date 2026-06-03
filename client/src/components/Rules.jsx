import { useState, useEffect } from "react";
import { Plus, Trash2, ToggleLeft, ToggleRight, ArrowRight, Bot, Hash } from "lucide-react";

const blank = { source_group_id: "", target_group_id: "", filter_type: "ai", rule_text: `Forward messages related to:
- Weekly spiritual planners or programs
- Community announcements and events
- Spiritual teachings and quotes

Skip: casual greetings, jokes, off-topic chatter.`, keywords: "" };

export default function Rules({ userId, groups, isConnected }) {
  const [rules, setRules] = useState([]);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState(blank);

  const load = () => fetch(`/api/users/${userId}/rules`).then(r => r.json()).then(setRules);
  useEffect(() => { load(); }, [userId]);
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  const create = async () => {
    if (!form.source_group_id || !form.target_group_id) return alert("Select source and target groups.");
    if (form.filter_type === "ai" && !form.rule_text.trim()) return alert("Enter a forwarding rule for Claude.");
    if (form.filter_type === "keyword" && !form.keywords.trim()) return alert("Enter at least one keyword.");
    const src = groups.find(g => g.id === form.source_group_id);
    const tgt = groups.find(g => g.id === form.target_group_id);
    await fetch(`/api/users/${userId}/rules`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...form, source_group_name: src?.name || "", target_group_name: tgt?.name || "" }),
    });
    setShowForm(false); setForm(blank); load();
  };

  const toggle = async (r) => {
    await fetch(`/api/users/${userId}/rules/${r.id}`, {
      method: "PATCH", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ enabled: r.enabled ? 0 : 1 }),
    });
    load();
  };

  const remove = async (id) => {
    if (!confirm("Delete this rule?")) return;
    await fetch(`/api/users/${userId}/rules/${id}`, { method: "DELETE" });
    load();
  };

  return (
    <div style={{ maxWidth: 680, display: "flex", flexDirection: "column", gap: 16 }} className="fi">
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between" }}>
        <div>
          <div style={{ fontFamily: "var(--font-h)", fontWeight: 700, fontSize: 18, marginBottom: 4 }}>Forwarding Rules</div>
          <div style={{ color: "var(--text2)", fontSize: 12 }}>Auto-forward messages from one group to another based on AI or keywords.</div>
        </div>
        <button className="btn btn-green btn-sm" onClick={() => setShowForm(v => !v)}>
          <Plus size={13} /> {showForm ? "Cancel" : "New Rule"}
        </button>
      </div>

      {!isConnected && <div className="card" style={{ borderColor: "var(--adim)", background: "var(--adim)" }}><span style={{ color: "var(--amber)", fontSize: 12 }}>⚠️ Connect WhatsApp to see your groups.</span></div>}

      {showForm && (
        <div className="card fi" style={{ display: "flex", flexDirection: "column", gap: 14, borderColor: "var(--border2)" }}>
          <div style={{ fontFamily: "var(--font-h)", fontWeight: 700, fontSize: 14 }}>New Forwarding Rule</div>

          {/* Group selectors */}
          <div style={{ display: "flex", gap: 12, alignItems: "flex-end" }}>
            <div style={{ flex: 1 }}>
              <label className="lbl">Source Group (listen from)</label>
              <select value={form.source_group_id} onChange={e => set("source_group_id", e.target.value)}>
                <option value="">Select…</option>
                {groups.map(g => <option key={g.id} value={g.id}>{g.name}</option>)}
              </select>
            </div>
            <div style={{ paddingBottom: 10 }}><ArrowRight size={16} color="var(--text2)" /></div>
            <div style={{ flex: 1 }}>
              <label className="lbl">Target Group (forward to)</label>
              <select value={form.target_group_id} onChange={e => set("target_group_id", e.target.value)}>
                <option value="">Select…</option>
                {groups.map(g => <option key={g.id} value={g.id}>{g.name}</option>)}
              </select>
            </div>
          </div>

          {/* Filter type toggle */}
          <div>
            <label className="lbl">Filter Type</label>
            <div style={{ display: "flex", gap: 8 }}>
              <button onClick={() => set("filter_type", "ai")} className="btn btn-sm"
                style={{ border: `1px solid ${form.filter_type === "ai" ? "var(--indigo)" : "var(--border)"}`, color: form.filter_type === "ai" ? "var(--indigo)" : "var(--text2)", background: form.filter_type === "ai" ? "var(--idim)" : "transparent" }}>
                <Bot size={12} /> Claude AI
              </button>
              <button onClick={() => set("filter_type", "keyword")} className="btn btn-sm"
                style={{ border: `1px solid ${form.filter_type === "keyword" ? "var(--green)" : "var(--border)"}`, color: form.filter_type === "keyword" ? "var(--green)" : "var(--text2)", background: form.filter_type === "keyword" ? "var(--gdim)" : "transparent" }}>
                <Hash size={12} /> Keywords
              </button>
            </div>
          </div>

          {form.filter_type === "ai" && (
            <div>
              <label className="lbl">Claude Rule (plain English)</label>
              <textarea rows={5} value={form.rule_text} onChange={e => set("rule_text", e.target.value)}
                placeholder="Describe what messages to forward…" />
              <div style={{ fontSize: 11, color: "var(--text2)", marginTop: 4 }}>Claude reads each message and decides yes/no based on this rule.</div>
            </div>
          )}

          {form.filter_type === "keyword" && (
            <div>
              <label className="lbl">Keywords (comma separated)</label>
              <input value={form.keywords} onChange={e => set("keywords", e.target.value)}
                placeholder="planner, announcement, session, quiz" />
              <div style={{ fontSize: 11, color: "var(--text2)", marginTop: 4 }}>Message is forwarded if it contains any of these words.</div>
            </div>
          )}

          <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
            <button className="btn btn-ghost btn-sm" onClick={() => { setShowForm(false); setForm(blank); }}>Cancel</button>
            <button className="btn btn-green btn-sm" onClick={create}>Save Rule</button>
          </div>
        </div>
      )}

      {rules.length === 0 && !showForm && (
        <div style={{ textAlign: "center", padding: "40px 0", color: "var(--text2)", fontSize: 13 }}>No forwarding rules yet.</div>
      )}

      {rules.map(r => (
        <div key={r.id} className="card" style={{ display: "flex", gap: 12, opacity: r.enabled ? 1 : 0.5 }}>
          <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 8 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
              <Pill name={r.source_group_name || r.source_group_id} />
              <ArrowRight size={13} color="var(--text2)" />
              <Pill name={r.target_group_name || r.target_group_id} color="var(--indigo)" />
              <span className={`tag ${r.filter_type === "ai" ? "ti" : "tg"}`} style={{ marginLeft: "auto" }}>
                {r.filter_type === "ai" ? <><Bot size={10} /> Claude AI</> : <><Hash size={10} /> Keywords</>}
              </span>
            </div>
            <div style={{ fontSize: 12, background: "var(--bg3)", padding: "8px 12px", borderRadius: 6, color: "var(--text2)", whiteSpace: "pre-wrap", lineHeight: 1.6 }}>
              {r.filter_type === "ai" ? r.rule_text : `Keywords: ${r.keywords}`}
            </div>
            <span className={`tag ${r.enabled ? "tg" : "tr"}`} style={{ alignSelf: "flex-start" }}>{r.enabled ? "Active" : "Paused"}</span>
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            <button className="btn btn-ghost btn-sm" onClick={() => toggle(r)}>
              {r.enabled ? <ToggleRight size={15} color="var(--green)" /> : <ToggleLeft size={15} />}
            </button>
            <button className="btn btn-danger btn-sm" onClick={() => remove(r.id)}><Trash2 size={13} /></button>
          </div>
        </div>
      ))}
    </div>
  );
}

function Pill({ name, color = "var(--green)" }) {
  return <span style={{ background: "var(--bg3)", border: "1px solid var(--border)", padding: "3px 10px", borderRadius: 20, fontSize: 12, color }}>{name}</span>;
}
