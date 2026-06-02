import React, { useState, useEffect } from "react";
import { 
  FileText, 
  Download, 
  Filter, 
  Search, 
  Calendar, 
  ChevronRight,
  TrendingUp,
  Package,
  ArrowUpRight,
  ArrowDownRight
} from "lucide-react";

const C = {
  bg: "#0a0a0c",
  panel: "#141417",
  border: "rgba(255,255,255,0.08)",
  text: "#ffffff",
  muted: "#8a8a91",
  blue: "#00d2ff",
  green: "#00ff9d",
  red: "#ff3e3e",
  orange: "#ff9100",
  purple: "#bd00ff"
};

const S = {
  container: {
    padding: "24px",
    display: "flex",
    flexDirection: "column",
    gap: "24px",
    height: "100%",
    overflowY: "auto",
    color: C.text,
    fontFamily: "'Inter', sans-serif"
  },
  header: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: "8px"
  },
  title: {
    fontSize: "1.8rem",
    fontWeight: 800,
    letterSpacing: "-0.5px",
    background: "linear-gradient(to right, #fff, #888)",
    WebkitBackgroundClip: "text",
    WebkitTextFillColor: "transparent"
  },
  statsGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))",
    gap: "20px"
  },
  statCard: {
    background: C.panel,
    border: `1px solid ${C.border}`,
    borderRadius: "16px",
    padding: "20px",
    display: "flex",
    flexDirection: "column",
    gap: "12px",
    transition: "all 0.3s ease",
    position: "relative",
    overflow: "hidden"
  },
  statLabel: {
    color: C.muted,
    fontSize: "0.85rem",
    fontWeight: 600,
    textTransform: "uppercase",
    letterSpacing: "1px"
  },
  statValue: {
    fontSize: "2rem",
    fontWeight: 800,
    fontFamily: "'Rajdhani', sans-serif"
  },
  statTrend: {
    display: "flex",
    alignItems: "center",
    gap: "4px",
    fontSize: "0.8rem",
    fontWeight: 600
  },
  mainPanel: {
    background: C.panel,
    border: `1px solid ${C.border}`,
    borderRadius: "20px",
    flex: 1,
    display: "flex",
    flexDirection: "column",
    overflow: "hidden"
  },
  tableHeader: {
    padding: "20px",
    borderBottom: `1px solid ${C.border}`,
    display: "flex",
    gap: "16px",
    alignItems: "center"
  },
  searchBox: {
    background: "rgba(255,255,255,0.03)",
    border: `1px solid ${C.border}`,
    borderRadius: "12px",
    padding: "10px 16px",
    display: "flex",
    alignItems: "center",
    gap: "10px",
    flex: 1
  },
  input: {
    background: "none",
    border: "none",
    color: "#fff",
    width: "100%",
    outline: "none",
    fontSize: "0.9rem"
  },
  tableContainer: {
    flex: 1,
    overflowY: "auto",
  },
  table: {
    width: "100%",
    borderCollapse: "collapse",
    textAlign: "left"
  },
  th: {
    padding: "16px 20px",
    color: C.muted,
    fontSize: "0.75rem",
    fontWeight: 700,
    textTransform: "uppercase",
    letterSpacing: "1px",
    borderBottom: `1px solid ${C.border}`,
    position: "sticky",
    top: 0,
    background: C.panel,
    zIndex: 10
  },
  td: {
    padding: "16px 20px",
    fontSize: "0.9rem",
    borderBottom: `1px solid ${C.border}`,
    color: "rgba(255,255,255,0.9)"
  },
  badge: {
    padding: "4px 8px",
    borderRadius: "6px",
    fontSize: "0.7rem",
    fontWeight: 700,
    textTransform: "uppercase"
  }
};

export default function Raporlar({ python }) {
  const [activeTab, setActiveTab] = useState("envanter");
  const [reportData, setReportData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState("");
  const [isExporting, setIsExporting] = useState(false);

  useEffect(() => {
    fetchReportData();
  }, []);

  const fetchReportData = async () => {
    setLoading(true);
    try {
      const resp = await python.call("rapor.veri", {});
      if (resp?.basarili) {
        setReportData(resp);
      }
    } catch (err) {
      console.error("Rapor veri hatası:", err);
    } finally {
      setLoading(false);
    }
  };

  const exportToExcel = async () => {
    setIsExporting(true);
    try {
      const resp = await python.call("rapor.olustur", {});
      if (resp?.basarili) {
        alert(resp.mesaj);
      } else {
        alert("Hata: " + resp.mesaj);
      }
    } catch (err) {
      alert("Bağlantı hatası: " + err);
    } finally {
      setIsExporting(false);
    }
  };

  const getFilteredLotData = () => {
    if (!reportData?.lot_dagilim) return [];
    return reportData.lot_dagilim.filter(item => 
      Object.values(item).some(val => 
        String(val).toLowerCase().includes(filter.toLowerCase())
      )
    );
  };

  const ozet = reportData?.ozet || {};

  return (
    <div style={S.container}>
      <div style={S.header}>
        <div>
          <h1 style={S.title}>Akıllı Raporlama</h1>
          <div style={{ display: "flex", gap: "20px", marginTop: "12px" }}>
            {["envanter", "depo", "hareketler"].map(tab => (
              <button 
                key={tab}
                onClick={() => setActiveTab(tab)}
                style={{
                  background: "none",
                  border: "none",
                  borderBottom: activeTab === tab ? `2px solid ${C.blue}` : "2px solid transparent",
                  color: activeTab === tab ? C.blue : C.muted,
                  padding: "8px 0",
                  cursor: "pointer",
                  fontSize: "0.9rem",
                  fontWeight: 600,
                  textTransform: "uppercase",
                  transition: "all 0.2s"
                }}
              >
                {tab === "envanter" ? "Stok Özeti" : tab === "depo" ? "Depo Dağılımı" : "Hareket Geçmişi"}
              </button>
            ))}
          </div>
        </div>
        
        <div style={{ display: "flex", gap: "12px" }}>
          <button 
            onClick={exportToExcel}
            disabled={isExporting}
            style={{ 
              ...S.actionBtn, 
              background: C.green, 
              color: "#000",
              opacity: isExporting ? 0.6 : 1
            }}
          >
            <Download size={16} /> {isExporting ? "İŞLENİYOR..." : "EXCEL RAPORU"}
          </button>
        </div>
      </div>

      {activeTab === "envanter" && (
        <>
          <div style={S.statsGrid}>
            <StatCard 
              label="Toplam Giriş" 
              value={ozet.toplam_giris || 0} 
              icon={<Package color={C.blue} />} 
            />
            <StatCard 
              label="Net Stok" 
              value={ozet.net_stok || 0} 
              icon={<TrendingUp color={C.green} />} 
              trend="Aktif" up 
            />
            <StatCard 
              label="Toplam Çıkış" 
              value={ozet.toplam_cikis || 0} 
              icon={<ArrowDownRight color={C.red} />} 
            />
            <StatCard 
              label="Net Ağırlık" 
              value={`${(ozet.net_agirlik || 0).toLocaleString()} kg`} 
              icon={<ArrowUpRight color={C.purple} />} 
            />
          </div>

          <div style={S.mainPanel}>
            <div style={S.tableHeader}>
              <div style={S.searchBox}>
                <Search size={18} color={C.muted} />
                <input 
                  style={S.input} 
                  placeholder="Lot no veya ürün adı ile filtrele..." 
                  value={filter}
                  onChange={(e) => setFilter(e.target.value)}
                />
              </div>
            </div>

            <div style={S.tableContainer}>
              <table style={S.table}>
                <thead>
                  <tr>
                    <th style={S.th}>Lot No</th>
                    <th style={S.th}>Ürün Adı</th>
                    <th style={S.th}>Depo</th>
                    <th style={S.th}>Adet</th>
                    <th style={S.th}>Ağırlık</th>
                    <th style={S.th}>SKT</th>
                  </tr>
                </thead>
                <tbody>
                  {loading ? (
                    <tr><td colSpan="6" style={{ textAlign: "center", padding: 60, color: C.muted }}>Veriler yükleniyor...</td></tr>
                  ) : getFilteredLotData().length === 0 ? (
                    <tr><td colSpan="6" style={{ textAlign: "center", padding: 60, color: C.muted }}>Kayıt bulunamadı.</td></tr>
                  ) : (
                    getFilteredLotData().map((item, i) => (
                      <tr key={i} style={{ borderBottom: `1px solid ${C.border}` }}>
                        <td style={{ ...S.td, fontWeight: 700, color: C.orange }}>{item.lot}</td>
                        <td style={S.td}>{item.urun_adi}</td>
                        <td style={S.td}>{item.depo_adi}</td>
                        <td style={S.td}>{item.adet}</td>
                        <td style={{ ...S.td, fontWeight: 700 }}>{item.agirlik} kg</td>
                        <td style={{ ...S.td, color: C.muted }}>{item.skt}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}

      {activeTab === "depo" && (
        <div style={S.statsGrid}>
          {reportData?.depo_dagilim?.map(depo => (
            <div key={depo.depo_kod} style={S.statCard}>
              <div style={S.statLabel}>{depo.depo_kod}</div>
              <div style={{ ...S.statValue, fontSize: "1.4rem" }}>{depo.depo_adi}</div>
              <div style={{ marginTop: 10, display: "flex", justifyContent: "space-between", fontSize: "0.85rem" }}>
                <span style={{ color: C.muted }}>Stok Adet:</span>
                <span style={{ fontWeight: 700, color: C.blue }}>{depo.stok_adet}</span>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: "0.85rem" }}>
                <span style={{ color: C.muted }}>Net Ağırlık:</span>
                <span style={{ fontWeight: 700, color: C.green }}>{depo.net_agirlik} kg</span>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: "0.85rem", borderTop: `1px solid ${C.border}`, paddingTop: 8, marginTop: 8 }}>
                <span style={{ color: C.red, fontSize: "0.75rem" }}>Toplam Çıkış:</span>
                <span style={{ fontWeight: 700, color: C.red }}>{depo.cikis_adet}</span>
              </div>
            </div>
          ))}
        </div>
      )}

      {activeTab === "hareketler" && (
        <div style={{ display: "flex", gap: "24px" }}>
          <div style={{ ...S.mainPanel, flex: 1 }}>
            <div style={{ ...S.tableHeader, background: "rgba(0, 255, 157, 0.05)" }}>
              <ArrowUpRight size={18} color={C.green} />
              <div style={{ fontWeight: 700 }}>SON GİRİŞLER</div>
            </div>
            <div style={S.tableContainer}>
              <table style={S.table}>
                <tbody>
                  {reportData?.son_girisler?.map((g, i) => (
                    <tr key={i}>
                      <td style={{ ...S.td, fontSize: "0.8rem" }}>{g.tarih}</td>
                      <td style={S.td}>
                        <div style={{ fontWeight: 600 }}>{g.depo_adi}</div>
                        <div style={{ fontSize: "0.7rem", color: C.muted }}>{g.gonderi_no}</div>
                      </td>
                      <td style={{ ...S.td, textAlign: "right" }}>
                        <div style={{ fontWeight: 700, color: C.green }}>+{g.urun_sayisi}</div>
                        <div style={{ fontSize: "0.7rem" }}>{g.toplam_agirlik} kg</div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <div style={{ ...S.mainPanel, flex: 1 }}>
            <div style={{ ...S.tableHeader, background: "rgba(255, 62, 62, 0.05)" }}>
              <ArrowDownRight size={18} color={C.red} />
              <div style={{ fontWeight: 700 }}>SON ÇIKIŞLAR</div>
            </div>
            <div style={S.tableContainer}>
              <table style={S.table}>
                <tbody>
                  {reportData?.son_cikislar?.map((c, i) => (
                    <tr key={i}>
                      <td style={{ ...S.td, fontSize: "0.8rem" }}>{c.tarih}</td>
                      <td style={S.td}>
                        <div style={{ fontWeight: 600 }}>{c.depo_adi}</div>
                        <div style={{ fontSize: "0.7rem", color: C.muted }}>{c.cikis_no}</div>
                      </td>
                      <td style={{ ...S.td, textAlign: "right" }}>
                        <div style={{ fontWeight: 700, color: C.red }}>-{c.urun_sayisi}</div>
                        <div style={{ fontSize: "0.7rem" }}>{c.toplam_agirlik} kg</div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

const S_EXTRA = {
  actionBtn: {
    padding: "8px 16px",
    borderRadius: "10px",
    border: "none",
    fontWeight: 700,
    fontSize: "0.8rem",
    display: "flex",
    alignItems: "center",
    gap: "8px",
    cursor: "pointer",
    transition: "transform 0.1s"
  }
};
Object.assign(S, S_EXTRA);

function StatCard({ label, value, icon, trend, up, down }) {
  return (
    <div style={S.statCard}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
        <div style={S.statLabel}>{label}</div>
        <div style={{ background: "rgba(255,255,255,0.03)", padding: "8px", borderRadius: "10px" }}>
          {icon}
        </div>
      </div>
      <div style={S.statValue}>{value}</div>
      {trend && (
        <div style={{ ...S.statTrend, color: up ? C.green : down ? C.red : C.muted }}>
          {up && <ArrowUpRight size={14} />}
          {down && <ArrowDownRight size={14} />}
          {trend}
        </div>
      )}
    </div>
  );
}
