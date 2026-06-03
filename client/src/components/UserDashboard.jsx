import { useState, useEffect } from "react";
import { Wifi, WifiOff, Loader } from "lucide-react";
import QRPanel from "./QRPanel.jsx";
import SendNow from "./SendNow.jsx";
import Rules from "./Rules.jsx";
import BatchForwarding from "./BatchForwarding.jsx";
import Schedules from "./Schedules.jsx";
import Logs from "./Logs.jsx";

const TABS = ["Send Now", "Forwarding Rules", "Batch Forwarding", "Schedules", "Activity Log"];

export default function UserDashboard({ user, onRefresh }) {
  const [tab, setTab] = useState(0);
  const [status, setStatus] = useState(user.session?.status || "disconnected");
  const [phone, setPhone] = useState(user.session?.phone || null);
  const [groups, setGroups] = useState([]);
  const [qr, setQr] = useState(null);
  const [connecting, setConnecting] = useState(false);
  const [logTick, setLogTick] = useState(0);

  useEffect(() => {
    const es = new EventSource(`/api/users/${user.id}/stream`);
    es.onmessage = (e) => {
      const d = JSON.parse(e.data);
      if (d.type === "qr") { setQr(d.qr); }
      if (d.type === "status") {
        setStatus(d.status);
        if (d.phone) setPhone(d.phone);
        if (d.status === "connected") { setQr(null); onRefresh(); }
        if (d.status === "disconnected") { setGroups([]); setPhone(null); onRefresh(); }
      }
      if (d.type === "groups") setGroups(d.groups);
      if (d.type === "log") setLogTick(t => t + 1);
    };
    return () => es.close();
  }, [user.id]);

  const connect = async () => {
    setConnecting(true);
    await fetch(`/api/users/${user.id}/connect`, { method: "POST" });
    setConnecting(false);
  };

  const disconnect = async () => {
    if (!confirm("Disconnect this WhatsApp session?")) return;
    await fetch(`/api/users/${user.id}/disconnect`, { method: "POST" });
  };

  const isConnected = status === "connected";

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%" }}>
      {/* Header */}
      <div style={{ background: "var(--bg2)", borderBottom: "1px solid var(--border)", padding: "14px 24px", display: "flex", alignItems: "center", justifyContent: "space-between", flexShrink: 0 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <div>
            <div style={{ fontFamily: "var(--font-h)", fontWeight: 800, fontSize: 18 }}>{user.name}</div>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 3 }}>
              <StatusBadge status={status} />
              {phone && <span style={{ fontSize: 11, color: "var(--text2)" }}>+{phone}</span>}
            </div>
          </div>
        </div>
        <div>
          {isConnected
            ? <button className="btn btn-ghost btn-sm" onClick={disconnect}><WifiOff size={13} /> Disconnect</button>
            : <button className="btn btn-green btn-sm" onClick={connect} disabled={connecting}>
                {connecting ? <><Loader size={13} className="spin" /> Connecting…</> : <><Wifi size={13} /> Connect WhatsApp</>}
              </button>
          }
        </div>
      </div>

      {/* QR */}
      {qr && status !== "connected" && <QRPanel qr={qr} />}

      {/* Tabs */}
      <div style={{ display: "flex", borderBottom: "1px solid var(--border)", background: "var(--bg2)", flexShrink: 0, padding: "0 24px", overflowX: "auto" }}>
        {TABS.map((t, i) => (
          <button key={t} onClick={() => setTab(i)} style={{
            padding: "9px 14px", background: "none", border: "none",
            borderBottom: tab === i ? "2px solid var(--green)" : "2px solid transparent",
            color: tab === i ? "var(--text)" : "var(--text2)",
            fontSize: 12.5, fontFamily: "var(--font-m)", cursor: "pointer",
            marginBottom: -1, whiteSpace: "nowrap",
          }}>{t}</button>
        ))}
      </div>

      {/* Content */}
      <div style={{ flex: 1, overflow: "auto", padding: "22px 24px" }}>
        {tab === 0 && <SendNow userId={user.id} groups={groups} isConnected={isConnected} />}
        {tab === 1 && <Rules userId={user.id} groups={groups} isConnected={isConnected} />}
        {tab === 2 && <BatchForwarding userId={user.id} groups={groups} isConnected={isConnected} />}
        {tab === 3 && <Schedules userId={user.id} groups={groups} isConnected={isConnected} />}
        {tab === 4 && <Logs userId={user.id} tick={logTick} />}
      </div>
    </div>
  );
}

function StatusBadge({ status }) {
  const map = { connected: ["Connected", "tg"], awaiting_qr: ["Scan QR", "ta"], reconnecting: ["Reconnecting…", "ta"], disconnected: ["Disconnected", "tr"] };
  const [label, cls] = map[status] || map.disconnected;
  return <span className={`tag ${cls}`}>{label}</span>;
}
