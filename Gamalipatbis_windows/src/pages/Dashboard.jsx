/**
 * GAMALI PATBİS — Dashboard v3.0
 * Bridge komutları:
 *   stok.ozet → {stats, depolar, cesitler, son_yuklemeler}
 */

import React, { useState, useEffect, useCallback } from "react";
import { 
  Package, Boxes, LayoutDashboard, Warehouse, 
  TrendingUp, Layers, MapPin, Truck, RefreshCw, ChevronRight
} from "lucide-react";
import StatusCard from "../components/StatusCard";

export default function Dashboard({ python }) {
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState(null);
  const [hata, setHata] = useState("");

  const veriCek = useCallback(async () => {
    if (!python?.ready) return;
    setLoading(true);
    try {
      const resp = await python.call("stok.ozet", {});
      if (resp && resp.basarili) {
        setData(resp);
      } else {
        setHata(resp ? resp.mesaj : "Bridge yanıt vermedi.");
      }
    } catch (err) {
      setHata("Veri çekme hatası.");
      console.error(err);
    } finally {
      setLoading(false);
    }
  }, [python]);

  useEffect(() => {
    veriCek();
    const iv = setInterval(veriCek, 60000); // 1 dakikada bir tazele
    return () => clearInterval(iv);
  }, [veriCek]);

  if (loading && !data) {
    return (
      <div style={S.loadingKapsayici}>
        <RefreshCw size={40} className="spin" color="var(--neon-blue)" />
        <p>Dashboard hazırlanıyor...</p>
      </div>
    );
  }

  const stats = {
    toplam_urun: data?.stats?.toplam_urun || 0,
    kutu_sayisi: data?.stats?.kutu_sayisi || 0,
    cesit_sayisi: data?.stats?.cesit_sayisi || 0,
    toplam_agirlik: data?.stats?.toplam_agirlik || 0
  };

  return (
    <div style={S.konteyner}>
      
      {/* ── Üst Kartlar (Özet) ── */}
      <div style={S.statsGrid}>
        <StatusCard 
          icon={Package} 
          label="Stokta Ürün" 
          value={stats.toplam_urun.toLocaleString("tr-TR")} 
          color="var(--neon-blue)" 
          glowColor="var(--glow-blue)" 
        />
        <StatusCard 
          icon={Boxes} 
          label="Kutu / Birim" 
          value={stats.kutu_sayisi.toLocaleString("tr-TR")} 
          color="var(--neon-purple)" 
        />
        <StatusCard 
          icon={TrendingUp} 
          label="Toplam Ağırlık" 
          value={`${(stats.toplam_agirlik || 0).toFixed(1)} kg`} 
          color="var(--neon-orange)" 
        />
        <StatusCard 
          icon={Warehouse} 
          label="Aktif Depo" 
          value={String(data?.depolar.length || 0)} 
          color="var(--neon-green)" 
        />
      </div>

      <div style={S.anaIcerik}>
        {/* ── Sol: Son İşlemler ve Çeşitler ── */}
        <div style={S.solKolon}>
          
          {/* Son Yüklemeler Paneli */}
          <div style={S.panel}>
            <div style={S.panelBaslik}>
              <Truck size={18} color="var(--neon-blue)" />
              <span>SON STOK YÜKLEMELERİ</span>
              <button style={S.kucukButon} onClick={veriCek}><RefreshCw size={14} /></button>
            </div>
            <div style={{ overflowX: "auto" }}>
              <table style={S.tablo}>
                <thead>
                  <tr>
                    <th style={S.th}>DEPO</th>
                    <th style={S.th}>GÖNDERİ NO</th>
                    <th style={S.th}>TARİH</th>
                    <th style={{ ...S.th, textAlign: "right" }}>ADET</th>
                  </tr>
                </thead>
                <tbody>
                  {data?.son_yuklemeler.map((y) => (
                    <tr key={y.id} style={S.tr}>
                      <td style={S.td}>{y.depo_adi}</td>
                      <td style={{ ...S.td, fontFamily: "monospace", color: "var(--neon-blue)" }}>{y.gonderi_no}</td>
                      <td style={S.td}>{y.yukleme_tarihi.split("T")[0]}</td>
                      <td style={{ ...S.td, textAlign: "right", fontWeight: 700, color: "var(--neon-green)" }}>{y.urun_sayisi}</td>
                    </tr>
                  ))}
                  {(!data?.son_yuklemeler || data.son_yuklemeler.length === 0) && (
                    <tr>
                      <td colSpan={4} style={{ ...S.td, textAlign: "center", opacity: 0.5 }}>Henüz kayıt yok.</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>

          {/* Ürün Dağılımı (SID) */}
          <div style={S.panel}>
            <div style={S.panelBaslik}>
              <Layers size={18} color="var(--neon-purple)" />
              <span>ÜRÜN ÇEŞİDİ DAĞILIMI</span>
            </div>
            <div style={S.tabloKonteyner}>
              <table style={S.tablo}>
                <thead>
                  <tr>
                    <th style={S.th}>ÜRÜN ADI</th>
                    <th style={{ ...S.th, textAlign: "right" }}>ADET</th>
                    <th style={{ ...S.th, width: 120 }}>ORAN</th>
                  </tr>
                </thead>
                <tbody>
                  {data?.cesitler.slice(0, 8).map((c) => (
                    <tr key={c.sid} style={S.tr}>
                      <td style={S.td}>
                        <div style={S.urunHücre}>
                          <span style={S.urunAdi}>{c.urun_adi}</span>
                          <span style={S.urunSid}>{c.sid}</span>
                        </div>
                      </td>
                      <td style={{ ...S.td, textAlign: "right", fontWeight: 600 }}>{c.adet}</td>
                      <td style={S.td}>
                        <div style={S.barArkaplan}>
                          <div style={{ 
                            ...S.barDoluluk, 
                            width: `${(c.adet / (stats.toplam_urun || 1)) * 100}%`,
                            background: "linear-gradient(90deg, var(--neon-purple), var(--neon-blue))"
                          }} />
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>

        {/* ── Sağ: Depo Listesi ── */}
        <div style={S.sagKolon}>
          <div style={S.panel}>
            <div style={S.panelBaslik}>
              <MapPin size={18} color="var(--neon-green)" />
              <span>DEPO BAZLI STOK</span>
            </div>
            <div style={S.depoListe}>
              {data?.depolar.map((d) => {
                const pct = (d.urun_sayisi / (Math.max(...data.depolar.map(x => x.urun_sayisi)) || 1)) * 100;
                return (
                  <div key={d.id} style={S.depoKart}>
                    <div style={S.depoKartUst}>
                      <span style={S.depoAd}>{d.ad}</span>
                      <span style={S.depoAdet}>{d.urun_sayisi.toLocaleString("tr-TR")} ÜRÜN</span>
                    </div>
                    <div style={S.barArkaplan}>
                      <div style={{ ...S.barDoluluk, width: `${pct}%`, background: "var(--neon-green)" }} />
                    </div>
                    <div style={S.depoKartAlt}>
                      <span>{d.kod}</span>
                      <span>{d.agirlik} kg</span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Drive Durumu Placeholder */}
          <div style={{ ...S.panel, background: "rgba(0, 212, 255, 0.03)", border: "1px dashed var(--neon-blue)" }}>
             <div style={{ padding: "20px", textAlign: "center", color: "var(--text-muted)", fontSize: "0.8rem" }}>
                <RefreshCw size={24} style={{ marginBottom: 12, opacity: 0.5 }} />
                <p>Google Drive senkronizasyonu aktif.</p>
                <p style={{ fontSize: "0.65rem", marginTop: 4 }}>Son yedekleme: Bugün 14:30</p>
             </div>
          </div>
        </div>

      </div>
    </div>
  );
}

const S = {
  konteyner: {
    display: "flex",
    flexDirection: "column",
    gap: 24,
    animation: "fadeIn 0.5s ease",
  },
  loadingKapsayici: {
    height: "60vh",
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    justifyContent: "center",
    gap: 16,
    color: "var(--text-secondary)",
  },
  statsGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))",
    gap: 20,
  },
  anaIcerik: {
    display: "grid",
    gridTemplateColumns: "1fr 340px",
    gap: 24,
  },
  solKolon: {
    display: "flex",
    flexDirection: "column",
    gap: 24,
  },
  sagKolon: {
    display: "flex",
    flexDirection: "column",
    gap: 24,
  },
  panel: {
    background: "var(--bg-panel)",
    borderRadius: "16px",
    border: "1px solid rgba(255,255,255,0.05)",
    overflow: "hidden",
    boxShadow: "0 8px 32px rgba(0,0,0,0.15)",
  },
  panelBaslik: {
    padding: "14px 20px",
    background: "rgba(255,255,255,0.02)",
    borderBottom: "1px solid rgba(255,255,255,0.05)",
    display: "flex",
    alignItems: "center",
    gap: 12,
    fontFamily: "var(--font-display)",
    fontSize: "0.8rem",
    fontWeight: 600,
    letterSpacing: "1px",
    color: "var(--text-primary)",
  },
  kucukButon: {
    marginLeft: "auto",
    background: "none",
    border: "none",
    color: "var(--text-muted)",
    cursor: "pointer",
    padding: 4,
    borderRadius: "4px",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
  },
  tablo: {
    width: "100%",
    borderCollapse: "collapse",
  },
  th: {
    padding: "12px 20px",
    textAlign: "left",
    fontSize: "0.65rem",
    color: "var(--text-muted)",
    fontWeight: 700,
    textTransform: "uppercase",
    letterSpacing: "1px",
    background: "rgba(255,255,255,0.01)",
    borderBottom: "1px solid rgba(255,255,255,0.05)",
  },
  tr: {
    borderBottom: "1px solid rgba(255,255,255,0.02)",
    transition: "background 0.2s",
  },
  td: {
    padding: "10px 20px",
    fontSize: "0.85rem",
    color: "var(--text-secondary)",
  },
  urunHücre: {
    display: "flex",
    flexDirection: "column",
    gap: 2,
  },
  urunAdi: {
    color: "var(--text-primary)",
    fontWeight: 500,
    fontSize: "0.85rem",
  },
  urunSid: {
    fontSize: "0.7rem",
    color: "var(--text-muted)",
    fontFamily: "monospace",
  },
  barArkaplan: {
    width: "100%",
    height: 4,
    background: "rgba(255,255,255,0.05)",
    borderRadius: "2px",
    overflow: "hidden",
  },
  barDoluluk: {
    height: "100%",
    borderRadius: "2px",
  },
  depoListe: {
    display: "flex",
    flexDirection: "column",
    padding: "10px 0",
  },
  depoKart: {
    padding: "16px 20px",
    display: "flex",
    flexDirection: "column",
    gap: 10,
    borderBottom: "1px solid rgba(255,255,255,0.02)",
  },
  depoKartUst: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
  },
  depoAd: {
    fontSize: "0.85rem",
    fontWeight: 600,
    color: "var(--text-primary)",
  },
  depoAdet: {
    fontSize: "0.8rem",
    fontWeight: 700,
    color: "var(--neon-green)",
    fontFamily: "var(--font-display)",
  },
  depoKartAlt: {
    display: "flex",
    justifyContent: "space-between",
    fontSize: "0.7rem",
    color: "var(--text-muted)",
  },
};