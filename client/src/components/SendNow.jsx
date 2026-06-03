import { useState } from "react";
import { Send } from "lucide-react";

export default function SendNow({ userId, groups, isConnected }) {
  const [groupId, setGroupId] = useState("");
  const [message, setMessage] = useState("");
  const [sending, setSending] = useState(false);
  const [flash, setFlash] = useState(null);

  const send = async () => {
    if (!groupId || !message.trim()) return;
    setSending(true);
    try {
      const res = await fetch(`/api/users/${userId}/send`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ group_id: groupId, message: message.trim() }),
      });
      if (!res.ok) throw new Error((await res.json()).error);
      setFlash("success"); setMessage("");
    } catch { setFlash("error"); }
    setSending(false);
    setTimeout(() => setFlash(null), 3000);
  };

  return (
    <div style={{ maxWidth: 580, display: "flex", flexDirection: "column", gap: 16 }} className="fi">
      <div>
        <div style={{ fontFamily: "var(--font-h)", fontWeight: 700, fontSize: 18, marginBottom: 4 }}>Send Message</div>
        <div style={{ color: "var(--text2)", fontSize: 12 }}>Send a message to any group immediately.</div>
      </div>
      {!isConnected && <div className="card" style={{ borderColor: "var(--adim)", background: "var(--adim)" }}><span style={{ color: "var(--amber)", fontSize: 12 }}>⚠️ Connect WhatsApp first.</span></div>}
      <div className="card" style={{ display: "flex", flexDirection: "column", gap: 14 }}>
        <div>
          <label className="lbl">Target Group</label>
          <select value={groupId} onChange={e => setGroupId(e.target.value)} disabled={!isConnected}>
            <option value="">Select group…</option>
            {groups.map(g => <option key={g.id} value={g.id}>{g.name} ({g.participants} members)</option>)}
          </select>
        </div>
        <div>
          <label className="lbl">Message</label>
          <textarea rows={5} value={message} onChange={e => setMessage(e.target.value)}
            placeholder="Type your message…&#10;Tip: Use *bold*, _italic_ for WhatsApp formatting."
            disabled={!isConnected} />
          <div style={{ fontSize: 11, color: "var(--text2)", marginTop: 4, textAlign: "right" }}>{message.length} chars</div>
        </div>
        {flash === "success" && <div className="tag tg fi" style={{ padding: "8px 12px", borderRadius: 6 }}>✅ Sent successfully!</div>}
        {flash === "error" && <div className="tag tr fi" style={{ padding: "8px 12px", borderRadius: 6 }}>❌ Failed to send. Is WhatsApp connected?</div>}
        <button className="btn btn-green" style={{ alignSelf: "flex-end" }}
          onClick={send} disabled={!isConnected || !groupId || !message.trim() || sending}>
          {sending ? "Sending…" : <><Send size={13} /> Send Now</>}
        </button>
      </div>
    </div>
  );
}
