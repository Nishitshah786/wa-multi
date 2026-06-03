import { useState, useEffect } from "react";
import { Plus, RefreshCw, Trash2, Wifi } from "lucide-react";
import UserDashboard from "./components/UserDashboard.jsx";

const STATUS_DOT = { connected: "var(--green)", awaiting_qr: "var(--amber)", reconnecting: "var(--amber)", disconnected: "var(--border2)" };

export default function App() {
  const [users, setUsers] = useState([]);
  const [selected, setSelected] = useState(null);
  const [newName, setNewName] = useState("");
  const [showForm, setShowForm] = useState(false);

  const load = async () => {
    const data = await fetch("/api/users").then(r => r.json());
    setUsers(data);
    // Keep selected in sync
    if (selected) setSelected(s => data.find(u => u.id === s?.id) || s);
  };

  useEffect(() => { load(); const t = setInterval(load, 8000); return () => clearInterval(t); }, []);

  const addUser = async () => {
    if (!newName.trim()) return;
    const user = await fetch("/api/users", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: newName.trim() }),
    }).then(r => r.json());
    setNewName(""); setShowForm(false);
    await load();
    setSelected(user);
  };

  const removeUser = async (e, id) => {
    e.stopPropagation();
    if (!confirm("Remove this user? Their session and data will be deleted.")) return;
    await fetch(`/api/users/${id}`, { method: "DELETE" });
    if (selected?.id === id) setSelected(null);
    load();
  };

  return (
    <div style={{ display: "flex", height: "100vh", overflow: "hidden" }}>
      {/* Sidebar */}
      <aside style={{ width: 220, background: "var(--bg2)", borderRight: "1px solid var(--border)", display: "flex", flexDirection: "column", flexShrink: 0 }}>
        <div style={{ padding: "16px 16px 12px", borderBottom: "1px solid var(--border)", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <span style={{ fontFamily: "var(--font-h)", fontWeight: 800, fontSize: 15 }}>WA Multi</span>
          <button className="btn btn-ghost btn-sm" onClick={load}><RefreshCw size={12} /></button>
        </div>

        <div style={{ flex: 1, overflow: "auto", padding: "8px 0" }}>
          <div style={{ padding: "4px 16px 6px", fontSize: 11, color: "var(--text2)", textTransform: "uppercase", letterSpacing: ".07em" }}>Users</div>
          {users.map(u => (
            <button key={u.id} onClick={() => setSelected(u)} style={{
              width: "100%", textAlign: "left", padding: "9px 16px",
              background: selected?.id === u.id ? "var(--bg3)" : "transparent",
              borderLeft: `2px solid ${selected?.id === u.id ? "var(--green)" : "transparent"}`,
              border: "none", color: selected?.id === u.id ? "var(--text)" : "var(--text2)",
              fontSize: 13, cursor: "pointer", display: "flex", alignItems: "center", gap: 8,
            }}>
              <span style={{ width: 7, height: 7, borderRadius: "50%", flexShrink: 0, background: STATUS_DOT[u.session?.status] || "var(--border2)" }} />
              <span style={{ flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{u.name}</span>
              <span onClick={(e) => removeUser(e, u.id)} style={{ opacity: 0, color: "var(--red)", fontSize: 11 }}
                onMouseEnter={e => e.currentTarget.style.opacity = 1}
                onMouseLeave={e => e.currentTarget.style.opacity = 0}>
                <Trash2 size={11} />
              </span>
            </button>
          ))}
          {users.length === 0 && <div style={{ padding: "16px", fontSize: 12, color: "var(--text2)", textAlign: "center" }}>No users yet</div>}
        </div>

        <div style={{ padding: 12, borderTop: "1px solid var(--border)" }}>
          {showForm ? (
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              <input placeholder="Name..." value={newName} onChange={e => setNewName(e.target.value)}
                onKeyDown={e => e.key === "Enter" && addUser()} autoFocus style={{ fontSize: 12, padding: "6px 10px" }} />
              <div style={{ display: "flex", gap: 6 }}>
                <button className="btn btn-green btn-sm" style={{ flex: 1 }} onClick={addUser}>Add</button>
                <button className="btn btn-ghost btn-sm" onClick={() => setShowForm(false)}>✕</button>
              </div>
            </div>
          ) : (
            <button className="btn btn-ghost btn-sm" style={{ width: "100%", justifyContent: "center" }} onClick={() => setShowForm(true)}>
              <Plus size={13} /> Add User
            </button>
          )}
        </div>
      </aside>

      {/* Main */}
      <main style={{ flex: 1, overflow: "auto" }}>
        {selected
          ? <UserDashboard key={selected.id} user={users.find(u => u.id === selected.id) || selected} onRefresh={load} />
          : <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", height: "100%", gap: 10, color: "var(--text2)" }}>
              <Wifi size={36} strokeWidth={1} />
              <div style={{ fontFamily: "var(--font-h)", fontSize: 18, color: "var(--text)" }}>WA Multi</div>
              <div style={{ fontSize: 12 }}>Add a user and connect their WhatsApp</div>
            </div>
        }
      </main>
    </div>
  );
}
