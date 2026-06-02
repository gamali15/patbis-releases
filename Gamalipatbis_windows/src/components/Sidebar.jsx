import React from "react";
import {
  LayoutDashboard,
  FileUp,
  Search,
  Bomb,
  FileSpreadsheet,
  Settings,
  ChevronLeft,
  ChevronRight,
  LogOut,
  User,
  Info,
} from "lucide-react";

const NAV_ITEMS = [
  { id: "dashboard", label: "Dashboard", icon: LayoutDashboard },
  { id: "stok_yukle", label: "Stok Yükle", icon: FileUp },
  { id: "barkod_sorgula", label: "Barkod Sorgula", icon: Search },
  { id: "patlatma", label: "Çıkış / Patlatma", icon: Bomb },
  { id: "raporlar", label: "Raporlar", icon: FileSpreadsheet },
];

const ADMIN_ITEMS = [
  { id: "ayarlar", label: "Ayarlar", icon: Settings },
];

export default function Sidebar({ activePage, onNavigate, collapsed, onToggle, activeUser, onLogout, onAboutClick }) {
  return (
    <nav style={{
      width: collapsed ? 64 : 220,
      minWidth: collapsed ? 64 : 220,
      height: "100vh",
      background: "var(--bg-panel)",
      borderRight: "1px solid rgba(0, 212, 255, 0.08)",
      display: "flex",
      flexDirection: "column",
      transition: "width var(--transition-normal), min-width var(--transition-normal)",
      overflow: "hidden",
      position: "relative",
    }}>
      {/* Logo alanı */}
      <div style={{
        padding: collapsed ? "20px 12px" : "20px 16px",
        borderBottom: "1px solid rgba(0, 212, 255, 0.08)",
        display: "flex",
        alignItems: "center",
        gap: 10,
        minHeight: 72,
      }}>
        <img
          src={collapsed ? "/gamali-logo-symbol.png" : "/gamali-logo-full.png"}
          alt="GAMALI"
          style={{
            width: collapsed ? 36 : 140,
            height: 36,
            objectFit: "contain",
          }}
        />
        {!collapsed && <div style={{ flex: 1 }} />}
      </div>

      {/* Navigasyon */}
      <div style={{ flex: 1, padding: "12px 8px", display: "flex", flexDirection: "column", gap: 2, overflowY: "auto" }}>
        {[...NAV_ITEMS, ...(activeUser?.id === 0 ? ADMIN_ITEMS : [])].map((item) => {
          const isActive = activePage === item.id;
          const Icon = item.icon;
          return (
            <button
              key={item.id}
              onClick={() => onNavigate(item.id)}
              title={collapsed ? item.label : undefined}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 12,
                padding: collapsed ? "10px 0" : "10px 12px",
                justifyContent: collapsed ? "center" : "flex-start",
                background: isActive ? "var(--accent-dim)" : "transparent",
                border: "none",
                borderRadius: 8,
                cursor: "pointer",
                color: isActive ? "var(--accent)" : "var(--text-secondary)",
                transition: "all var(--transition-fast)",
                position: "relative",
                fontFamily: "var(--font-body)",
                fontWeight: 600,
                fontSize: "0.85rem",
                letterSpacing: "0.5px",
                width: "100%",
                textAlign: "left",
              }}
              onMouseEnter={(e) => {
                if (!isActive) e.currentTarget.style.background = "var(--bg-surface)";
              }}
              onMouseLeave={(e) => {
                if (!isActive) e.currentTarget.style.background = "transparent";
              }}
            >
              {isActive && (
                <div style={{
                  position: "absolute",
                  left: 0,
                  top: "50%",
                  transform: "translateY(-50%)",
                  width: 3,
                  height: 20,
                  background: "var(--accent)",
                  borderRadius: "0 3px 3px 0",
                  boxShadow: "var(--glow-accent)",
                }} />
              )}
              <Icon size={18} strokeWidth={isActive ? 2.5 : 2} />
              {!collapsed && <span>{item.label}</span>}
            </button>
          );
        })}
      </div>

      {/* Kullanıcı Profili ve Çıkış */}
      <div style={{ padding: "12px", borderTop: "1px solid rgba(0, 212, 255, 0.08)", display: "flex", flexDirection: "column", gap: 12 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, overflow: "hidden", justifyContent: collapsed ? "center" : "flex-start" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10, overflow: "hidden" }}>
            <div style={{ width: 32, height: 32, borderRadius: 16, background: "rgba(0, 212, 255, 0.1)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
              <User size={16} color="var(--neon-blue)" />
            </div>
            {!collapsed && (
              <div style={{ display: "flex", flexDirection: "column", overflow: "hidden" }}>
                <span style={{ color: "#fff", fontSize: "0.8rem", fontWeight: 700, whiteSpace: "nowrap", textOverflow: "ellipsis", overflow: "hidden" }}>{activeUser?.ad_soyad || "Kullanıcı"}</span>
                <span style={{ color: "var(--text-muted)", fontSize: "0.65rem", whiteSpace: "nowrap", textOverflow: "ellipsis", overflow: "hidden" }}>{activeUser?.id === 0 ? "Yönetici" : activeUser?.unvan || "Personel"}</span>
              </div>
            )}
          </div>
        </div>
        <button
          onClick={onAboutClick}
          title="Hakkında"
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            gap: 8,
            width: "100%",
            padding: "8px",
            background: "rgba(0, 212, 255, 0.05)",
            border: "1px solid rgba(0, 212, 255, 0.15)",
            borderRadius: 8,
            color: "var(--neon-blue)",
            cursor: "pointer",
            transition: "all 0.2s",
            fontFamily: "var(--font-body)",
            fontWeight: 700,
            fontSize: "0.75rem"
          }}
          onMouseEnter={e => e.currentTarget.style.background = "rgba(0, 212, 255, 0.15)"}
          onMouseLeave={e => e.currentTarget.style.background = "rgba(0, 212, 255, 0.05)"}
        >
          <Info size={14} />
          {!collapsed && <span style={{ fontSize: "0.75rem", fontWeight: 700 }}>HAKKINDA</span>}
        </button>
        <button
          onClick={onLogout}
          title="Çıkış Yap"
          style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 8, width: "100%", padding: "8px", background: "rgba(255, 0, 85, 0.1)", border: "1px solid rgba(255, 0, 85, 0.2)", borderRadius: 8, color: "var(--neon-red)", cursor: "pointer", transition: "all 0.2s" }}
          onMouseEnter={e => e.currentTarget.style.background = "rgba(255, 0, 85, 0.2)"}
          onMouseLeave={e => e.currentTarget.style.background = "rgba(255, 0, 85, 0.1)"}
        >
          <LogOut size={14} />
          {!collapsed && <span style={{ fontSize: "0.75rem", fontWeight: 700 }}>ÇIKIŞ YAP</span>}
        </button>
      </div>

      {/* Collapse toggle */}
      <button
        onClick={onToggle}
        style={{
          padding: "12px",
          background: "transparent",
          border: "none",
          borderTop: "1px solid rgba(0, 212, 255, 0.08)",
          cursor: "pointer",
          color: "var(--text-muted)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          transition: "color var(--transition-fast)",
        }}
        onMouseEnter={(e) => e.currentTarget.style.color = "var(--neon-blue)"}
        onMouseLeave={(e) => e.currentTarget.style.color = "var(--text-muted)"}
      >
        {collapsed ? <ChevronRight size={16} /> : <ChevronLeft size={16} />}
      </button>
    </nav>
  );
}
