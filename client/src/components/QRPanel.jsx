export default function QRPanel({ qr }) {
  return (
    <div className="fi" style={{ background: "var(--bg2)", borderBottom: "1px solid var(--border)", padding: "18px 24px", display: "flex", alignItems: "center", gap: 24, flexShrink: 0 }}>
      <img src={qr} alt="QR" style={{ width: 120, height: 120, borderRadius: 8, flexShrink: 0 }} />
      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        <div style={{ fontFamily: "var(--font-h)", fontWeight: 700, fontSize: 15 }}>Scan to connect WhatsApp</div>
        <div style={{ fontSize: 12, color: "var(--text2)", lineHeight: 1.7 }}>
          <div>1. Open WhatsApp on your phone</div>
          <div>2. Tap ⋮ → <b>Linked Devices</b> → <b>Link a Device</b></div>
          <div>3. Point camera at QR code</div>
        </div>
        <span className="tag ta" style={{ alignSelf: "flex-start", fontSize: 11 }}>Refreshes automatically if expired</span>
      </div>
    </div>
  );
}
