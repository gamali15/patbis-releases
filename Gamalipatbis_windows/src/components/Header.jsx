import React, { useState, useEffect } from "react";
import { Menu, Wifi, WifiOff, Clock } from "lucide-react";

export default function Header({ title, onToggleSidebar, python }) {
  const [time, setTime] = useState(new Date());

  const bridgeReady = python?.ready || false;
  const bridgeError = python?.error || null;

  useEffect(() => {
    const timer = setInterval(() => setTime(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  const formatTime = (d) =>
    d.toLocaleTimeString("tr-TR", { hour: "2-digit", minute: "2-digit", second: "2-digit" });

  const formatDate = (d) =>
    d.toLocaleDateString("tr-TR", { day: "2-digit", month: "long", year: "numeric" });

  return (
    <header style={{
      height: 56,
      minHeight: 56,
      background: "var(--bg-panel)",
      borderBottom: "1px solid rgba(0, 212, 255, 0.08)",
      display: "flex",
      alignItems: "center",
      justifyContent: "space-between",
      padding: "0 24px",
      gap: 16,
    }}>
      {/* Sol — Menü */}
      <div style={{ display: "flex", alignItems: "center", width: 200 }}>
        <button
          onClick={onToggleSidebar}
          style={{
            background: "transparent",
            border: "none",
            cursor: "pointer",
            color: "var(--text-secondary)",
            display: "flex",
            alignItems: "center",
            padding: 4,
          }}
        >
          <Menu size={18} />
        </button>
      </div>

      {/* Orta — Başlık */}
      <div style={{ 
        position: "absolute", 
        left: "50%", 
        transform: "translateX(-50%)",
        textAlign: "center",
        pointerEvents: "none"
      }}>
        <h1 style={{
          fontFamily: "var(--font-display)",
          fontSize: "0.95rem",
          fontWeight: 700,
          letterSpacing: "4px",
          color: "var(--text-primary)",
          textTransform: "uppercase",
          margin: 0,
          display: "flex",
          alignItems: "center",
          gap: 12
        }}>
          <span>{title}</span>
        </h1>
      </div>

      {/* Sağ — Durum göstergeleri */}
      <div style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "flex-end",
        width: 250,
        gap: 20,
        fontSize: "0.8rem",
        fontFamily: "var(--font-body)",
        fontWeight: 500,
      }}>
        {/* Bridge Bağlantı durumu */}
        <div style={{
          display: "flex",
          alignItems: "center",
          gap: 6,
          color: bridgeReady ? "var(--neon-green)" : bridgeError ? "var(--neon-red)" : "var(--neon-orange)",
        }}
        title={bridgeError || (bridgeReady ? "Python bridge aktif" : "Bağlanıyor...")}
        >
          {bridgeReady ? <Wifi size={14} /> : <WifiOff size={14} />}
          <span style={{ letterSpacing: "1px", fontSize: "0.7rem" }}>
            {bridgeReady ? "BRIDGE AKTIF" : bridgeError ? "BRIDGE HATA" : "BAĞLANIYOR..."}
          </span>
          <div style={{
            width: 6,
            height: 6,
            borderRadius: "50%",
            background: bridgeReady ? "var(--neon-green)" : bridgeError ? "var(--neon-red)" : "var(--neon-orange)",
            boxShadow: bridgeReady ? "var(--glow-green)" : "var(--glow-red)",
            animation: "pulse-glow 2s infinite",
          }} />
        </div>

        {/* Ayırıcı */}
        <div style={{
          width: 1,
          height: 20,
          background: "rgba(0, 212, 255, 0.1)",
        }} />

        {/* Saat */}
        <div style={{
          display: "flex",
          alignItems: "center",
          gap: 6,
          color: "var(--text-secondary)",
        }}>
          <Clock size={13} />
          <span style={{ fontVariantNumeric: "tabular-nums" }}>{formatTime(time)}</span>
          <span style={{ color: "var(--text-muted)", fontSize: "0.7rem" }}>{formatDate(time)}</span>
        </div>
      </div>
    </header>
  );
}
