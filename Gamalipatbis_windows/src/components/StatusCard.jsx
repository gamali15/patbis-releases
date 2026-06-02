import React from "react";

export default function StatusCard({ icon: Icon, label, value, change, color, glowColor }) {
  const cardColor = color || "var(--neon-blue)";
  const glow = glowColor || "var(--glow-blue)";

  return (
    <div style={{
      background: "var(--bg-panel)",
      borderRadius: 12,
      padding: "20px 24px",
      border: "1px solid rgba(0, 212, 255, 0.06)",
      position: "relative",
      overflow: "hidden",
      transition: "all var(--transition-normal)",
      cursor: "default",
      flex: 1,
      minWidth: 200,
    }}
    onMouseEnter={(e) => {
      e.currentTarget.style.borderColor = `${cardColor}33`;
      e.currentTarget.style.boxShadow = glow;
    }}
    onMouseLeave={(e) => {
      e.currentTarget.style.borderColor = "rgba(0, 212, 255, 0.06)";
      e.currentTarget.style.boxShadow = "none";
    }}
    >
      {/* Üst dekoratif çizgi */}
      <div style={{
        position: "absolute",
        top: 0,
        left: 0,
        right: 0,
        height: 2,
        background: `linear-gradient(90deg, transparent, ${cardColor}, transparent)`,
        opacity: 0.5,
      }} />

      {/* İkon + Etiket */}
      <div style={{
        display: "flex",
        alignItems: "center",
        gap: 10,
        marginBottom: 14,
      }}>
        <div style={{
          width: 36,
          height: 36,
          borderRadius: 8,
          background: `${cardColor}15`,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          color: cardColor,
        }}>
          <Icon size={18} />
        </div>
        <span style={{
          fontFamily: "var(--font-body)",
          fontSize: "0.75rem",
          fontWeight: 600,
          color: "var(--text-secondary)",
          letterSpacing: "1.5px",
          textTransform: "uppercase",
        }}>
          {label}
        </span>
      </div>

      {/* Değer */}
      <div style={{
        fontFamily: "var(--font-display)",
        fontSize: "2rem",
        fontWeight: 700,
        color: "var(--text-primary)",
        letterSpacing: "1px",
        lineHeight: 1,
      }}>
        {value}
      </div>

      {/* Değişim */}
      {change !== undefined && (
        <div style={{
          marginTop: 8,
          fontSize: "0.7rem",
          fontWeight: 600,
          color: change >= 0 ? "var(--neon-green)" : "var(--neon-red)",
          letterSpacing: "0.5px",
        }}>
          {change >= 0 ? "▲" : "▼"} {Math.abs(change)} bugün
        </div>
      )}
    </div>
  );
}
