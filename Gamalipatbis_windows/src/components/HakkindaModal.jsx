/**
 * GAMALI PATBİS — Hakkında Modal
 * Cyberpunk V2.0 tema uyumlu.
 * Güncelleme kontrolü: VDS üzerindeki version.json endpoint'i
 */
import React, { useState } from "react";
import {
  X,
  RefreshCw,
  CheckCircle2,
  AlertCircle,
  ArrowUpCircle,
  Loader2,
  Shield,
  BarChart3,
  Layers,
  FileText,
  Wifi,
} from "lucide-react";

// ─── Sabitler ───────────────────────────────────────────────────────────────

const SURUM = "1.0.0";

// VDS'teki version.json endpoint'i
// İleride: https://patbis.gamali.com.tr/version.json veya
//           http://50.114.185.64/patbis/version.json
const GUNCELLEME_URL = "https://raw.githubusercontent.com/gamali15/patbis-releases/main/version.json";
// TODO: VDS hazır olunca gerçek URL'e çevir ↑

const AMACLAR = [
  {
    icon: Shield,
    baslik: "PATBİS Uyumluluğu",
    aciklama:
      "T.C. İçişleri Bakanlığı Patlayıcı Madde Bilgi Sistemi mevzuatına tam uyumlu envanter kayıt ve takip işlemleri.",
  },
  {
    icon: Layers,
    baslik: "Hiyerarşik Stok Takibi",
    aciklama:
      "GS1-128 standartlı barkodlarla Palet → Kutu → Ürün seviyesinde kesintisiz stok görünürlüğü.",
  },
  {
    icon: BarChart3,
    baslik: "Depo Yönetimi",
    aciklama:
      "Özaltın İnşaat bünyesindeki tüm patlayıcı madde depolarının tek ekrandan anlık durumunu izleme.",
  },
  {
    icon: FileText,
    baslik: "XML / TXT Entegrasyonu",
    aciklama:
      "Tedarikçi FEEM XML dosyaları ve CK65 barkod TXT çıktılarının otomatik işlenmesi ve eşleştirilmesi.",
  },
  {
    icon: Wifi,
    baslik: "Çevrimdışı Çalışma",
    aciklama:
      "İnternet bağlantısı gerektirmez. Tüm veriler yerel SQLite veritabanında güvenle saklanır.",
  },
];

// ─── Güncelleme Durumu ──────────────────────────────────────────────────────

const GuncellemeDurumu = ({ durum, yeniSurum }) => {
  if (!durum) return null;

  const config = {
    kontrol_ediliyor: {
      icon: <Loader2 size={14} style={{ animation: "spin 1s linear infinite" }} />,
      renk: "#60a5fa",
      metin: "Güncelleme kontrol ediliyor...",
    },
    guncel: {
      icon: <CheckCircle2 size={14} />,
      renk: "#4ade80",
      metin: `v${SURUM} — En güncel sürümdesiniz.`,
    },
    guncelleme_var: {
      icon: <ArrowUpCircle size={14} />,
      renk: "#fbbf24",
      metin: `v${yeniSurum} mevcut! Lütfen yöneticinizle iletişime geçin.`,
    },
    hata: {
      icon: <AlertCircle size={14} />,
      renk: "#f87171",
      metin: "Güncelleme sunucusuna ulaşılamadı.",
    },
  };

  const c = config[durum];
  if (!c) return null;

  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 8,
        padding: "8px 12px",
        borderRadius: 7,
        background: `${c.renk}12`,
        border: `1px solid ${c.renk}30`,
        color: c.renk,
        fontSize: 12,
        marginTop: 10,
      }}
    >
      {c.icon}
      <span>{c.metin}</span>
    </div>
  );
};

// ─── Ana Bileşen ─────────────────────────────────────────────────────────────

export default function HakkindaModal({ onKapat }) {
  const [gunDurum, setGunDurum] = useState(null); // null | 'kontrol_ediliyor' | 'guncel' | 'guncelleme_var' | 'hata'
  const [yeniSurum, setYeniSurum] = useState(null);

  const guncellemeKontrol = async () => {
    setGunDurum("kontrol_ediliyor");
    setYeniSurum(null);
    try {
      const resp = await fetch(GUNCELLEME_URL, { cache: "no-store" });
      if (!resp.ok) throw new Error("HTTP " + resp.status);
      const data = await resp.json();
      const uzak = data.surum || data.version || "0.0.0";

      // Basit semver karşılaştırma
      const parcala = (s) => s.split(".").map(Number);
      const [ma, mi, pa] = parcala(SURUM);
      const [ua, ui, up] = parcala(uzak);
      const eski =
        ua > ma || (ua === ma && ui > mi) || (ua === ma && ui === mi && up > pa);

      if (eski) {
        setYeniSurum(uzak);
        setGunDurum("guncelleme_var");
      } else {
        setGunDurum("guncel");
      }
    } catch {
      setGunDurum("hata");
    }
  };

  return (
    <>
      {/* ── Overlay ── */}
      <div
        onClick={onKapat}
        style={{
          position: "fixed",
          inset: 0,
          background: "rgba(0,0,0,0.65)",
          backdropFilter: "blur(4px)",
          zIndex: 999,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        {/* ── Modal ── */}
        <div
          onClick={(e) => e.stopPropagation()}
          style={{
            background: "#0d1117",
            border: "1px solid rgba(255,255,255,0.08)",
            borderRadius: 14,
            width: 480,
            maxWidth: "92vw",
            maxHeight: "88vh",
            overflowY: "auto",
            boxShadow: "0 24px 80px rgba(0,0,0,0.6), 0 0 0 1px rgba(124,58,237,0.15)",
            position: "relative",
          }}
        >
          {/* ── Başlık ── */}
          <div
            style={{
              padding: "20px 22px 16px",
              borderBottom: "1px solid rgba(255,255,255,0.06)",
              display: "flex",
              alignItems: "center",
              gap: 14,
            }}
          >
            {/* Logo */}
            <div
              style={{
                width: 44,
                height: 44,
                borderRadius: 10,
                background: "rgba(124,58,237,0.15)",
                border: "1px solid rgba(124,58,237,0.3)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                flexShrink: 0,
              }}
            >
              <span style={{ fontSize: 22 }}>⚡</span>
            </div>

            <div style={{ flex: 1 }}>
              <div
                style={{
                  fontFamily: "'Orbitron', sans-serif",
                  fontSize: 16,
                  fontWeight: 700,
                  color: "#f1f5f9",
                  letterSpacing: "0.04em",
                }}
              >
                GAMALI PATBİS
              </div>
              <div
                style={{
                  fontSize: 11,
                  color: "#475569",
                  fontFamily: "'JetBrains Mono', monospace",
                  marginTop: 2,
                }}
              >
                SÜRÜM v{SURUM}
              </div>
            </div>

            {/* Kapat */}
            <button
              onClick={onKapat}
              style={{
                background: "none",
                border: "none",
                color: "#475569",
                cursor: "pointer",
                display: "flex",
                padding: 4,
                borderRadius: 6,
                transition: "color 0.15s",
              }}
              onMouseEnter={(e) => (e.currentTarget.style.color = "#94a3b8")}
              onMouseLeave={(e) => (e.currentTarget.style.color = "#475569")}
            >
              <X size={18} />
            </button>
          </div>

          {/* ── İçerik ── */}
          <div style={{ padding: "18px 22px" }}>

            {/* Kısa açıklama */}
            <p
              style={{
                fontSize: 12.5,
                color: "#94a3b8",
                lineHeight: 1.65,
                margin: "0 0 20px",
              }}
            >
              Özaltın İnşaat bünyesindeki patlayıcı madde depolarının T.C. İçişleri
              Bakanlığı PATBİS sistemine uyumlu envanter takibini sağlamak amacıyla
              geliştirilmiş kurumsal bir otomasyon yazılımıdır.
            </p>

            {/* Amaçlar */}
            <div
              style={{
                fontSize: 10,
                fontWeight: 700,
                letterSpacing: "0.12em",
                color: "#475569",
                marginBottom: 10,
              }}
            >
              AMAÇLAR
            </div>

            <div
              style={{
                background: "#0f1219",
                border: "1px solid rgba(255,255,255,0.05)",
                borderRadius: 10,
                overflow: "hidden",
                marginBottom: 20,
              }}
            >
              {AMACLAR.map((a, i) => {
                const Icon = a.icon;
                return (
                  <div
                    key={i}
                    style={{
                      display: "flex",
                      alignItems: "flex-start",
                      gap: 12,
                      padding: "11px 14px",
                      borderBottom:
                        i < AMACLAR.length - 1
                          ? "1px solid rgba(255,255,255,0.04)"
                          : "none",
                    }}
                  >
                    <div
                      style={{
                        width: 28,
                        height: 28,
                        borderRadius: 7,
                        background: "rgba(124,58,237,0.1)",
                        border: "1px solid rgba(124,58,237,0.2)",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        flexShrink: 0,
                        marginTop: 1,
                      }}
                    >
                      <Icon size={14} color="#a78bfa" />
                    </div>
                    <div>
                      <div
                        style={{
                          fontSize: 12.5,
                          fontWeight: 600,
                          color: "#e2e8f0",
                          marginBottom: 3,
                        }}
                      >
                        {a.baslik}
                      </div>
                      <div style={{ fontSize: 11.5, color: "#64748b", lineHeight: 1.55 }}>
                        {a.aciklama}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Güncelleme Kontrol */}
            <div
              style={{
                fontSize: 10,
                fontWeight: 700,
                letterSpacing: "0.12em",
                color: "#475569",
                marginBottom: 10,
              }}
            >
              YAZILIM GÜNCELLEMESİ
            </div>

            <div
              style={{
                background: "#0f1219",
                border: "1px solid rgba(255,255,255,0.05)",
                borderRadius: 10,
                padding: "14px",
                marginBottom: 20,
              }}
            >
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  gap: 12,
                }}
              >
                <div>
                  <div style={{ fontSize: 12, color: "#94a3b8" }}>
                    Mevcut sürüm:{" "}
                    <span
                      style={{
                        fontFamily: "'JetBrains Mono', monospace",
                        color: "#a78bfa",
                        fontWeight: 600,
                      }}
                    >
                      v{SURUM}
                    </span>
                  </div>
                  <div style={{ fontSize: 11, color: "#334155", marginTop: 2 }}>
                    Güncellemeler GAMALI NEXUS sunucusu üzerinden yayınlanır.
                  </div>
                </div>

                <button
                  onClick={guncellemeKontrol}
                  disabled={gunDurum === "kontrol_ediliyor"}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 6,
                    padding: "8px 14px",
                    background:
                      gunDurum === "kontrol_ediliyor"
                        ? "#1e293b"
                        : "rgba(124,58,237,0.15)",
                    border: "1px solid rgba(124,58,237,0.3)",
                    borderRadius: 7,
                    color: "#a78bfa",
                    fontSize: 11.5,
                    fontWeight: 600,
                    fontFamily: "'Rajdhani', sans-serif",
                    letterSpacing: "0.06em",
                    cursor:
                      gunDurum === "kontrol_ediliyor" ? "wait" : "pointer",
                    transition: "all 0.2s",
                    flexShrink: 0,
                    whiteSpace: "nowrap",
                  }}
                  onMouseEnter={(e) => {
                    if (gunDurum !== "kontrol_ediliyor")
                      e.currentTarget.style.background = "rgba(124,58,237,0.25)";
                  }}
                  onMouseLeave={(e) => {
                    if (gunDurum !== "kontrol_ediliyor")
                      e.currentTarget.style.background = "rgba(124,58,237,0.15)";
                  }}
                >
                  {gunDurum === "kontrol_ediliyor" ? (
                    <Loader2 size={13} style={{ animation: "spin 1s linear infinite" }} />
                  ) : (
                    <RefreshCw size={13} />
                  )}
                  GÜNCELLEME KONTROL
                </button>
              </div>

              <GuncellemeDurumu durum={gunDurum} yeniSurum={yeniSurum} />
            </div>

            {/* Alt bilgi */}
            <div
              style={{
                textAlign: "center",
                fontSize: 11,
                color: "#334155",
                fontFamily: "'JetBrains Mono', monospace",
              }}
            >
              © 2026 GAMALI NEXUS — Tüm hakları saklıdır.
            </div>
          </div>
        </div>
      </div>

      {/* Spin animasyonu */}
      <style>{`@keyframes spin { from{transform:rotate(0deg)} to{transform:rotate(360deg)} }`}</style>
    </>
  );
}
