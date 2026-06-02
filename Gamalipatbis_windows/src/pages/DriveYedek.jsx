import { useState, useEffect } from "react";
import usePython from "../hooks/usePython";
import { 
  Database, RefreshCw, HardDrive, 
  CheckCircle2, AlertTriangle, Loader2, Info, Calendar,
  Upload, WifiOff 
} from "lucide-react";

// ── Tema ──
const C = {
  void: "#020617",
  panel: "#0f172a",
  surface: "#1e293b",
  blue: "#00d4ff",
  green: "#00ff9d",
  purple: "#bd00ff",
  orange: "#ff9100",
  red: "#ff0055",
  border: "rgba(255,255,255,0.06)",
  muted: "#94a3b8",
};

export default function DriveYedek() {
  const { call: invoke } = usePython();

  const [durum, setDurum] = useState(null);
  const [dosyalar, setDosyalar] = useState([]);
  const [yukleniyor, setYukleniyor] = useState(false);
  const [yedekleniyor, setYedekleniyor] = useState(false);
  const [baglaniyor, setBaglaniyor] = useState(false);
  const [mesaj, setMesaj] = useState(null);

  // ── Durum Yükle ──
  const durumYükle = async () => {
    setYukleniyor(true);
    try {
      const d = await invoke("drive.durum", {});
      if (d?.basarili) {
        setDurum(d);
        if (d.bagli) dosyalarYükle();
      }
    } catch (e) {
      setMesaj({ tip: "hata", metin: `Durum yükleme hatası: ${e}` });
    } finally {
      setYukleniyor(false);
    }
  };

  // ── Dosyalar Yükle ──
  const dosyalarYükle = async () => {
    try {
      const r = await invoke("drive.dosyalar", {});
      if (r?.basarili) setDosyalar(r.dosyalar || []);
    } catch (e) {
      console.error("Dosya listeleme hatası", e);
    }
  };

  useEffect(() => {
    durumYükle();
  }, [invoke]);

  // ── Bağlan ──
  const baglan = async () => {
    setBaglaniyor(true);
    setMesaj({ tip: "bilgi", metin: "Google Drive yetkilendirmesi bekleniyor... Lütfen açılan tarayıcı penceresinden onay verin." });
    try {
      const r = await invoke("drive.baglan", {});
      if (r?.basarili) {
        setMesaj({ tip: "basari", metin: r.mesaj });
        durumYükle();
      } else {
        setMesaj({ tip: "hata", metin: r.mesaj });
      }
    } catch (e) {
      setMesaj({ tip: "hata", metin: `Bağlantı hatası: ${e}` });
    } finally {
      setBaglaniyor(false);
    }
  };

  // ── Yedekle ──
  const yedekle = async () => {
    setYedekleniyor(true);
    setMesaj({ tip: "bilgi", metin: "Veritabanı yedekleniyor ve Drive'a yükleniyor..." });
    try {
      const r = await invoke("drive.yedekle", {});
      if (r?.basarili) {
        setMesaj({ tip: "basari", metin: r.mesaj });
        durumYükle();
      } else {
        setMesaj({ tip: "hata", metin: r.mesaj });
      }
    } catch (e) {
      setMesaj({ tip: "hata", metin: `Yedekleme hatası: ${e}` });
    } finally {
      setYedekleniyor(false);
    }
  };

  const formatByte = (b) => {
    if (!b) return "0 B";
    const units = ["B", "KB", "MB", "GB"];
    let i = 0;
    while (b >= 1024 && i < units.length - 1) { b /= 1024; i++; }
    return `${b.toFixed(1)} ${units[i]}`;
  };

  const formatDate = (d) => {
    if (!d) return "-";
    return new Date(d).toLocaleString("tr-TR");
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20, height: "100%", overflow: "hidden" }}>
      
      {/* ── ÜST PANEL: DURUM ── */}
      <div style={{ 
        background: C.panel, border: `1px solid ${C.border}`, borderRadius: 12, padding: 24,
        display: "flex", alignItems: "center", gap: 30, flexWrap: "wrap",
        boxShadow: "0 4px 20px rgba(0,0,0,0.2)"
      }}>
        <div style={{
          width: 80, height: 80, borderRadius: "50%",
          background: durum?.bagli ? `${C.green}12` : `${C.red}12`,
          border: `2px solid ${durum?.bagli ? C.green : C.red}`,
          display: "flex", alignItems: "center", justifyContent: "center",
          boxShadow: `0 0 30px ${durum?.bagli ? C.green : C.red}22`
        }}>
          {durum?.bagli ? <HardDrive size={40} color={C.green} /> : <WifiOff size={40} color={C.red} />}
        </div>

        <div style={{ flex: 1, minWidth: 200 }}>
          <div style={{ fontFamily: "Orbitron, monospace", fontSize: 18, fontWeight: 700, color: "#e2e8f0", marginBottom: 6 }}>
            {durum?.bagli ? "Google Drive Bağlı" : "Bağlantı Yok"}
          </div>
          <div style={{ display: "flex", gap: 20, flexWrap: "wrap" }}>
            <StatusInfo icon={<HardDrive size={14} />} label="Hedef Klasör" value={durum?.klasor || "Belirlenmedi"} />
            <StatusInfo icon={<Calendar size={14} />} label="Son Yedek" value={durum?.son_yedek ? formatDate(durum.son_yedek) : "Hiç yedek alınmadı"} />
          </div>
        </div>

        <div style={{ display: "flex", gap: 12 }}>
          {durum?.bagli ? (
            <ActionButton 
              onClick={yedekle} 
              disabled={yedekleniyor} 
              icon={yedekleniyor ? <Loader2 size={18} style={{ animation: "spin 1s linear infinite" }} /> : <Upload size={18} />}
              label="Şimdi Yedekle"
              color={C.blue}
            />
          ) : (
            <ActionButton 
              onClick={baglan} 
              disabled={baglaniyor} 
              icon={baglaniyor ? <Loader2 size={18} style={{ animation: "spin 1s linear infinite" }} /> : <RefreshCw size={18} />}
              label="Drive'a Bağlan"
              color={C.orange}
            />
          )}
          <button onClick={durumYükle} style={{ 
            background: "transparent", border: `1px solid ${C.border}`, borderRadius: 10,
            width: 44, height: 44, display: "flex", alignItems: "center", justifyContent: "center",
            color: C.muted, cursor: "pointer", transition: "all 0.2s"
          }}>
            <RefreshCw size={18} />
          </button>
        </div>
      </div>

      {/* ── BİLGİ/HATA MESAJLARI ── */}
      {mesaj && (
        <div style={{ 
          display: "flex", alignItems: "center", gap: 12, padding: "12px 16px",
          borderRadius: 10, background: mesaj.tip === "basari" ? `${C.green}12` : mesaj.tip === "hata" ? `${C.red}12` : `${C.blue}12`,
          border: `1px solid ${mesaj.tip === "basari" ? C.green : mesaj.tip === "hata" ? C.red : C.blue}33`,
          color: mesaj.tip === "basari" ? C.green : mesaj.tip === "hata" ? C.red : C.blue,
          fontFamily: "Rajdhani, sans-serif", fontSize: 14, fontWeight: 600
        }}>
          {mesaj.tip === "basari" ? <CheckCircle2 size={18} /> : mesaj.tip === "hata" ? <AlertTriangle size={18} /> : <Info size={18} />}
          <span style={{ flex: 1 }}>{mesaj.metin}</span>
          <button onClick={() => setMesaj(null)} style={{ background: "none", border: "none", color: "inherit", cursor: "pointer", fontSize: 16 }}>✕</button>
        </div>
      )}

      {/* ── ALT PANEL: LİSTE ── */}
      <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 12, minHeight: 0 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, fontFamily: "Orbitron, monospace", fontSize: 12, color: C.muted, letterSpacing: "0.08em" }}>
          <Database size={14} />
          SON YEDEKLEMELER
        </div>

        <div style={{ 
          flex: 1, overflow: "auto", background: C.panel, border: `1px solid ${C.border}`, borderRadius: 12,
          scrollbarWidth: "thin", scrollbarColor: `${C.border} transparent`
        }}>
          {yukleniyor ? (
            <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "100%", gap: 10, color: C.muted, fontFamily: "Rajdhani, sans-serif" }}>
              <Loader2 size={24} style={{ animation: "spin 1s linear infinite" }} /> Veriler yükleniyor...
            </div>
          ) : !durum?.bagli ? (
            <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", height: "100%", gap: 14, color: C.muted, textAlign: "center", padding: 40 }}>
              <WifiOff size={48} strokeWidth={1} style={{ opacity: 0.3 }} />
              <div style={{ fontFamily: "Rajdhani, sans-serif", fontSize: 16 }}>Drive bağlantısı kurulmadığı için yedekler listelenemiyor.</div>
              <button onClick={baglan} style={{ 
                background: `${C.orange}12`, border: `1px solid ${C.orange}44`, color: C.orange,
                padding: "8px 20px", borderRadius: 8, fontFamily: "Rajdhani, sans-serif", fontWeight: 600, cursor: "pointer"
              }}>
                Bağlantıyı Başlat
              </button>
            </div>
          ) : dosyalar.length === 0 ? (
            <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", height: "100%", gap: 14, color: C.muted, textAlign: "center", padding: 40 }}>
              <Database size={48} strokeWidth={1} style={{ opacity: 0.3 }} />
              <div style={{ fontFamily: "Rajdhani, sans-serif", fontSize: 16 }}>Henüz Drive'da yedek bulunamadı.</div>
            </div>
          ) : (
            <table style={{ width: "100%", borderCollapse: "collapse", fontFamily: "Rajdhani, sans-serif" }}>
              <thead style={{ position: "sticky", top: 0, zIndex: 10, background: C.surface }}>
                <tr>
                  <Th label="Dosya Adı" />
                  <Th label="Boyut" />
                  <Th label="Yükleme Tarihi" />
                  <Th label="İşlem" />
                </tr>
              </thead>
              <tbody>
                {dosyalar.map((f) => (
                  <tr key={f.id} style={{ borderBottom: `1px solid ${C.border}`, transition: "background 0.2s" }} className="hover-row">
                    <td style={{ padding: "12px 20px" }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                        <div style={{ width: 32, height: 32, borderRadius: 6, background: "rgba(255,255,255,0.03)", display: "flex", alignItems: "center", justifyContent: "center" }}>
                          <Database size={16} color={C.blue} />
                        </div>
                        <span style={{ fontWeight: 600, color: "#cbd5e1", fontSize: 13 }}>{f.name}</span>
                      </div>
                    </td>
                    <td style={{ padding: "12px 20px", color: C.muted, fontSize: 12 }}>{formatByte(f.size)}</td>
                    <td style={{ padding: "12px 20px", color: C.muted, fontSize: 12 }}>{formatDate(f.modifiedTime)}</td>
                    <td style={{ padding: "12px 20px" }}>
                      <a 
                        href={f.webViewLink} target="_blank" rel="noreferrer"
                        style={{ 
                          display: "inline-flex", alignItems: "center", gap: 6,
                          padding: "6px 12px", background: "rgba(255,255,255,0.04)", 
                          border: `1px solid ${C.border}`, borderRadius: 6,
                          color: C.blue, textDecoration: "none", fontSize: 11, fontWeight: 700
                        }}
                      >
                        DRIVE'DA GÖR <HardDrive size={12} />
                      </a>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>

      <style>{`
        @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
        @keyframes pulse { 0% { opacity: 0.6; } 50% { opacity: 1; } 100% { opacity: 0.6; } }
        .hover-row:hover { background: rgba(255,255,255,0.02); }
      `}</style>
    </div>
  );
}

function StatusInfo({ icon, label, value }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
      <span style={{ color: C.muted, display: "flex" }}>{icon}</span>
      <span style={{ fontSize: 11, color: C.muted, textTransform: "uppercase", letterSpacing: "0.05em", fontFamily: "Orbitron, monospace" }}>{label}:</span>
      <span style={{ fontSize: 13, color: "#94a3b8", fontWeight: 600, fontFamily: "Rajdhani, sans-serif" }}>{value}</span>
    </div>
  );
}

function ActionButton({ onClick, disabled, icon, label, color }) {
  return (
    <button 
      onClick={onClick} 
      disabled={disabled}
      style={{
        display: "flex", alignItems: "center", gap: 10, padding: "0 24px",
        background: `${color}12`, border: `1px solid ${color}44`, borderRadius: 10,
        color: color, fontFamily: "Orbitron, monospace", fontSize: 11, fontWeight: 700,
        cursor: disabled ? "not-allowed" : "pointer", opacity: disabled ? 0.5 : 1,
        transition: "all 0.2s", height: 44, letterSpacing: "0.05em"
      }}
    >
      {icon} {label}
    </button>
  );
}

function Th({ label }) {
  return (
    <th style={{ 
      padding: "10px 20px", textAlign: "left", fontFamily: "Orbitron, monospace", 
      fontSize: 9, letterSpacing: "0.1em", color: C.muted, textTransform: "uppercase" 
    }}>
      {label}
    </th>
  );
}
