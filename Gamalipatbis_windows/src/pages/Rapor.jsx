/**
 * GAMALI PATBİS — Rapor Sayfası
 * ================================
 * 3 bölüm:
 *   1. Filtreler (depo + tarih aralığı)
 *   2. Dashboard kartları + mini tablolar
 *   3. Excel oluştur / indir
 *
 * Bridge:
 *   rapor.veri    → dashboard verisi
 *   rapor.olustur → Excel üret + Masaüstüne kaydet
 *   db.depolar    → depo listesi
 */

import { useState, useEffect, useCallback } from "react";
import usePython from "../hooks/usePython";
import {
  BarChart2, Download, RefreshCw, Loader2, FileSpreadsheet,
  TrendingUp, TrendingDown, Package, PackageMinus,
  CheckCircle2, Calendar, Building2, AlertTriangle,
} from "lucide-react";

const C = {
  panel:   "#0f172a",
  surface: "#1e293b",
  blue:    "#00d4ff",
  green:   "#00ff9d",
  purple:  "#bd00ff",
  orange:  "#ff9100",
  red:     "#ff0055",
  border:  "rgba(255,255,255,0.06)",
  muted:   "#94a3b8",
};

// ═══════════════════════════════════════════════════════════════
// ANA BİLEŞEN
// ═══════════════════════════════════════════════════════════════

export default function Rapor() {
  const { call: invoke } = usePython();

  const [depolar, setDepolar]         = useState([]);
  const [secilenDepo, setSecilenDepo] = useState(null);
  const [baslangic, setBaslangic]     = useState("");
  const [bitis, setBitis]             = useState("");

  const [veri, setVeri]               = useState(null);
  const [yukleniyorVeri, setYukleniyorVeri] = useState(false);
  const [yukleniyorExcel, setYukleniyorExcel] = useState(false);
  const [excelSonuc, setExcelSonuc]   = useState(null);

  const [aktifTab, setAktifTab]       = useState("giris"); // "giris"|"cikis"|"lot"

  // ── Depolar ──
  useEffect(() => {
    invoke("db.depolar", {}).then((r) => {
      if (Array.isArray(r)) setDepolar(r);
    }).catch(() => {});
  }, [invoke]);

  // ── Rapor verisi ──
  const veriYukle = useCallback(async () => {
    setYukleniyorVeri(true);
    setExcelSonuc(null);
    try {
      const r = await invoke("rapor.veri", {
        depo_id:   secilenDepo,
        baslangic: baslangic || null,
        bitis:     bitis     || null,
      });
      if (r?.basarili) setVeri(r);
      else setVeri(null);
    } catch { setVeri(null); }
    finally { setYukleniyorVeri(false); }
  }, [invoke, secilenDepo, baslangic, bitis]);

  // ── İlk yüklemede otomatik ──
  useEffect(() => { veriYukle(); }, []);

  // ── Excel oluştur ──
  const excelOlustur = async () => {
    setYukleniyorExcel(true);
    setExcelSonuc(null);
    try {
      const r = await invoke("rapor.olustur", {
        depo_id:   secilenDepo,
        baslangic: baslangic || null,
        bitis:     bitis     || null,
      });
      setExcelSonuc(r);
    } catch (e) {
      setExcelSonuc({ basarili: false, mesaj: String(e) });
    } finally {
      setYukleniyorExcel(false);
    }
  };

  const bugun = new Date().toISOString().split("T")[0];

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14, height: "100%", overflow: "hidden" }}>

      {/* ── FİLTRE BARI ── */}
      <div style={{
        display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap",
        background: C.panel, border: `1px solid ${C.border}`,
        borderRadius: 10, padding: "12px 16px",
      }}>
        {/* Depo */}
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <Building2 size={14} style={{ color: C.muted }} />
          <select
            value={secilenDepo || ""}
            onChange={(e) => setSecilenDepo(e.target.value ? Number(e.target.value) : null)}
            style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 7, padding: "7px 10px", color: "#e2e8f0", fontFamily: "Rajdhani, sans-serif", fontSize: 13, outline: "none", cursor: "pointer", minWidth: 170 }}
          >
            <option value="">Tüm Depolar</option>
            {depolar.map((d) => <option key={d.id} value={d.id}>{d.ad}</option>)}
          </select>
        </div>

        <div style={{ width: 1, height: 24, background: C.border }} />

        {/* Tarih aralığı */}
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <Calendar size={14} style={{ color: C.muted }} />
          <input
            type="date" value={baslangic} max={bugun}
            onChange={(e) => setBaslangic(e.target.value)}
            style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 7, padding: "7px 10px", color: baslangic ? "#e2e8f0" : C.muted, fontFamily: "Rajdhani, sans-serif", fontSize: 13, outline: "none" }}
          />
          <span style={{ color: C.muted, fontSize: 12 }}>—</span>
          <input
            type="date" value={bitis} max={bugun}
            onChange={(e) => setBitis(e.target.value)}
            style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 7, padding: "7px 10px", color: bitis ? "#e2e8f0" : C.muted, fontFamily: "Rajdhani, sans-serif", fontSize: 13, outline: "none" }}
          />
          {(baslangic || bitis) && (
            <button onClick={() => { setBaslangic(""); setBitis(""); }}
              style={{ background: "none", border: "none", color: C.muted, cursor: "pointer", fontSize: 16, lineHeight: 1, padding: "0 4px" }}>
              ✕
            </button>
          )}
        </div>

        <div style={{ marginLeft: "auto", display: "flex", gap: 8 }}>
          {/* Yenile */}
          <button onClick={veriYukle} disabled={yukleniyorVeri}
            style={{ display: "flex", alignItems: "center", gap: 5, padding: "7px 14px", border: `1px solid ${C.border}`, borderRadius: 8, background: "transparent", color: C.muted, fontFamily: "Rajdhani, sans-serif", fontSize: 12, fontWeight: 600, cursor: "pointer", opacity: yukleniyorVeri ? 0.4 : 1 }}>
            {yukleniyorVeri
              ? <Loader2 size={13} style={{ animation: "spin 1s linear infinite" }} />
              : <RefreshCw size={13} />}
            Yenile
          </button>

          {/* Excel */}
          <button onClick={excelOlustur} disabled={yukleniyorExcel}
            style={{ display: "flex", alignItems: "center", gap: 6, padding: "7px 16px", border: `1px solid ${C.green}44`, borderRadius: 8, background: `${C.green}0E`, color: C.green, fontFamily: "Rajdhani, sans-serif", fontSize: 13, fontWeight: 700, cursor: yukleniyorExcel ? "not-allowed" : "pointer", opacity: yukleniyorExcel ? 0.5 : 1 }}>
            {yukleniyorExcel
              ? <Loader2 size={14} style={{ animation: "spin 1s linear infinite" }} />
              : <FileSpreadsheet size={14} />}
            Excel Raporu
          </button>
        </div>
      </div>

      {/* ── EXCEL SONUÇ BANNER ── */}
      {excelSonuc && (
        <div style={{
          display: "flex", alignItems: "center", gap: 10, padding: "10px 16px",
          background: excelSonuc.basarili ? `${C.green}08` : `${C.red}08`,
          border: `1px solid ${excelSonuc.basarili ? `${C.green}33` : `${C.red}33`}`,
          borderRadius: 9,
        }}>
          {excelSonuc.basarili
            ? <CheckCircle2 size={16} style={{ color: C.green, flexShrink: 0 }} />
            : <AlertTriangle size={16} style={{ color: C.red, flexShrink: 0 }} />}
          <span style={{ fontFamily: "Rajdhani, sans-serif", fontSize: 13, color: excelSonuc.basarili ? C.green : C.red }}>
            {excelSonuc.mesaj}
          </span>
          {excelSonuc.basarili && (
            <span style={{ marginLeft: "auto", fontFamily: "JetBrains Mono, monospace", fontSize: 10, color: `${C.green}88` }}>
              {excelSonuc.dosya_adi}
            </span>
          )}
          <button onClick={() => setExcelSonuc(null)} style={{ background: "none", border: "none", color: C.muted, cursor: "pointer", fontSize: 16 }}>✕</button>
        </div>
      )}

      {/* ── ANA İÇERİK ── */}
      {yukleniyorVeri && !veri ? (
        <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", gap: 10, color: C.muted, fontFamily: "Rajdhani, sans-serif", fontSize: 14 }}>
          <Loader2 size={20} style={{ animation: "spin 1s linear infinite" }} />
          Rapor yükleniyor...
        </div>
      ) : !veri ? (
        <div style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 12, color: C.muted, fontFamily: "Rajdhani, sans-serif", fontSize: 15 }}>
          <BarChart2 size={40} strokeWidth={1} />
          <span>Veri yüklenemedi. Yenile butonuna basın.</span>
        </div>
      ) : (
        <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 14, minHeight: 0, overflow: "auto" }}>

          {/* ── ÖZET KARTLAR ── */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(6, 1fr)", gap: 10 }}>
            {[
              { l: "Toplam Giriş", v: veri.ozet.toplam_giris,  c: C.blue,   Icon: TrendingUp,    sub: `${veri.ozet.giris_agirlik} kg` },
              { l: "Net Stok",     v: veri.ozet.net_stok,       c: C.green,  Icon: Package,       sub: `${veri.ozet.net_agirlik} kg` },
              { l: "Toplam Çıkış", v: veri.ozet.toplam_cikis,  c: C.red,    Icon: PackageMinus,  sub: `${veri.ozet.cikis_agirlik} kg` },
              { l: "Giriş Ağırlık",v: `${veri.ozet.giris_agirlik} kg`, c: C.blue,  Icon: TrendingUp, sub: "kg" },
              { l: "Net Ağırlık",  v: `${veri.ozet.net_agirlik} kg`,   c: C.green, Icon: Package,    sub: "stokta" },
              { l: "Çıkış Ağırlık",v: `${veri.ozet.cikis_agirlik} kg`,c: C.orange,Icon: TrendingDown,sub: "çıkarılan" },
            ].map(({ l, v, c, Icon, sub }) => (
              <div key={l} style={{ background: C.panel, border: `1px solid ${c}20`, borderRadius: 10, padding: "12px 14px", display: "flex", flexDirection: "column", gap: 4 }}>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                  <span style={{ fontFamily: "Orbitron, monospace", fontSize: 8, letterSpacing: "0.1em", color: C.muted, textTransform: "uppercase" }}>{l}</span>
                  <Icon size={13} style={{ color: `${c}66` }} />
                </div>
                <span style={{ fontFamily: "Rajdhani, sans-serif", fontSize: 20, fontWeight: 700, color: c, lineHeight: 1 }}>{v}</span>
                <span style={{ fontFamily: "Rajdhani, sans-serif", fontSize: 10, color: C.muted }}>{sub}</span>
              </div>
            ))}
          </div>

          {/* ── DEPO DAGILIMI ── */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14, flex: 1, minHeight: 0 }}>

            {/* Depo tablosu */}
            <div style={{ background: C.panel, border: `1px solid ${C.border}`, borderRadius: 10, overflow: "hidden", display: "flex", flexDirection: "column" }}>
              <div style={{ padding: "10px 14px", borderBottom: `1px solid ${C.border}`, fontFamily: "Orbitron, monospace", fontSize: 9, letterSpacing: "0.08em", color: C.muted }}>
                DEPO BAZLI DAĞILIM
              </div>
              <div style={{ overflow: "auto", flex: 1 }}>
                <table style={{ width: "100%", borderCollapse: "collapse", fontFamily: "Rajdhani, sans-serif", fontSize: 12 }}>
                  <thead>
                    <tr>
                      {["Depo", "Stok", "Çıkış", "Net Ağırlık"].map((b) => (
                        <th key={b} style={{ position: "sticky", top: 0, background: C.surface, padding: "8px 12px", textAlign: b === "Depo" ? "left" : "right", fontFamily: "Orbitron, monospace", fontSize: 8, color: C.muted, letterSpacing: "0.08em", textTransform: "uppercase", borderBottom: `1px solid ${C.border}` }}>{b}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {veri.depo_dagilim.length === 0 ? (
                      <tr><td colSpan={4} style={{ textAlign: "center", padding: "30px", color: C.muted, fontStyle: "italic" }}>Veri yok</td></tr>
                    ) : veri.depo_dagilim.map((d, i) => (
                      <tr key={i} style={{ background: i % 2 === 1 ? "rgba(255,255,255,0.02)" : "transparent", borderBottom: `1px solid ${C.border}` }}>
                        <td style={{ padding: "7px 12px", color: "#e2e8f0" }}>
                          <div style={{ fontWeight: 600 }}>{d.depo_adi}</div>
                          <div style={{ fontFamily: "Orbitron, monospace", fontSize: 8, color: C.muted }}>{d.depo_kod}</div>
                        </td>
                        <td style={{ padding: "7px 12px", textAlign: "right", color: C.blue, fontWeight: 600 }}>{d.stok_adet}</td>
                        <td style={{ padding: "7px 12px", textAlign: "right", color: d.cikis_adet > 0 ? C.red : C.muted }}>{d.cikis_adet}</td>
                        <td style={{ padding: "7px 12px", textAlign: "right", color: C.green }}>{d.net_agirlik} kg</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Hareketler */}
            <div style={{ background: C.panel, border: `1px solid ${C.border}`, borderRadius: 10, overflow: "hidden", display: "flex", flexDirection: "column" }}>
              {/* Sekme başlıkları */}
              <div style={{ display: "flex", borderBottom: `1px solid ${C.border}` }}>
                {[
                  { id: "giris", label: `Girişler (${veri.son_girisler.length})`, c: C.blue  },
                  { id: "cikis", label: `Çıkışlar (${veri.son_cikislar.length})`, c: C.red   },
                  { id: "lot",   label: `Lot (${veri.lot_dagilim.length})`,        c: C.green },
                ].map(({ id, label, c }) => (
                  <button key={id} onClick={() => setAktifTab(id)} style={{
                    flex: 1, padding: "9px 6px", background: aktifTab === id ? `${c}10` : "transparent",
                    border: "none", borderBottom: aktifTab === id ? `2px solid ${c}` : "2px solid transparent",
                    color: aktifTab === id ? c : C.muted,
                    fontFamily: "Rajdhani, sans-serif", fontSize: 11, fontWeight: 600, cursor: "pointer",
                    transition: "all 0.15s",
                  }}>{label}</button>
                ))}
              </div>

              <div style={{ overflow: "auto", flex: 1 }}>
                <table style={{ width: "100%", borderCollapse: "collapse", fontFamily: "Rajdhani, sans-serif", fontSize: 12 }}>
                  <thead>
                    <tr>
                      {aktifTab === "giris" && ["Tarih","Depo","Gönderi","Adet","Ağırlık"].map((b) => <Th key={b}>{b}</Th>)}
                      {aktifTab === "cikis" && ["Tarih","Depo","Çıkış No","Sebep","Adet"].map((b) => <Th key={b}>{b}</Th>)}
                      {aktifTab === "lot"   && ["Lot","Ürün Adı","SKT","Adet","Ağırlık"].map((b) => <Th key={b}>{b}</Th>)}
                    </tr>
                  </thead>
                  <tbody>
                    {aktifTab === "giris" && (
                      veri.son_girisler.length === 0
                        ? <BosRow span={5} />
                        : veri.son_girisler.map((g, i) => (
                          <tr key={i} style={{ background: i%2===1?"rgba(255,255,255,0.02)":"transparent", borderBottom:`1px solid ${C.border}` }}>
                            <Td>{(g.tarih||"").replace("T"," ")}</Td>
                            <Td>{g.depo_adi}</Td>
                            <Td mono c={C.blue}>{kisalt(g.gonderi_no,16)}</Td>
                            <Td sag c={C.blue}>{g.urun_sayisi}</Td>
                            <Td sag>{g.toplam_agirlik} kg</Td>
                          </tr>
                        ))
                    )}
                    {aktifTab === "cikis" && (
                      veri.son_cikislar.length === 0
                        ? <BosRow span={5} />
                        : veri.son_cikislar.map((c, i) => (
                          <tr key={i} style={{ background: i%2===1?"rgba(255,255,255,0.02)":"transparent", borderBottom:`1px solid ${C.border}` }}>
                            <Td>{(c.tarih||"").replace("T"," ")}</Td>
                            <Td>{c.depo_adi}</Td>
                            <Td mono c={C.red}>{kisalt(c.cikis_no,14)}</Td>
                            <Td c={C.orange}>{c.sebep}</Td>
                            <Td sag c={C.red}>{c.urun_sayisi}</Td>
                          </tr>
                        ))
                    )}
                    {aktifTab === "lot" && (
                      veri.lot_dagilim.length === 0
                        ? <BosRow span={5} />
                        : veri.lot_dagilim.map((l, i) => (
                          <tr key={i} style={{ background: i%2===1?"rgba(255,255,255,0.02)":"transparent", borderBottom:`1px solid ${C.border}` }}>
                            <Td mono c={C.purple}>{kisalt(l.lot,12)}</Td>
                            <Td>{kisalt(l.urun_adi,18)}</Td>
                            <Td>{l.skt}</Td>
                            <Td sag c={C.green}>{l.adet}</Td>
                            <Td sag>{l.agirlik} kg</Td>
                          </tr>
                        ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ─ Yardımcı tablo bileşenleri
function Th({ children }) {
  return (
    <th style={{ position: "sticky", top: 0, background: "#1e293b", padding: "8px 10px", textAlign: "left", fontFamily: "Orbitron, monospace", fontSize: 8, color: "#94a3b8", letterSpacing: "0.08em", textTransform: "uppercase", borderBottom: "1px solid rgba(255,255,255,0.06)", whiteSpace: "nowrap" }}>
      {children}
    </th>
  );
}

function Td({ children, sag, mono, c }) {
  return (
    <td style={{ padding: "7px 10px", textAlign: sag ? "right" : "left", color: c || "#cbd5e1", fontFamily: mono ? "JetBrains Mono, monospace" : "Rajdhani, sans-serif", fontSize: mono ? 10 : 12, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", maxWidth: 160 }}>
      {children}
    </td>
  );
}

function BosRow({ span }) {
  return (
    <tr><td colSpan={span} style={{ textAlign: "center", padding: "30px", color: "#94a3b8", fontStyle: "italic", fontFamily: "Rajdhani, sans-serif", fontSize: 12 }}>Kayıt yok</td></tr>
  );
}

function kisalt(str, max) {
  if (!str) return "-";
  return str.length > max ? str.slice(0, max) + "…" : str;
}
