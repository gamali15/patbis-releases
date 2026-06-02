/**
 * GAMALI PATBİS — Stok Sayım Sayfası
 * ====================================
 * İki mod:
 *   1. Envanter  → Depodaki tüm ürünleri filtreli tablo
 *   2. Sayım     → UID listesi yapıştır, stokla karşılaştır
 *
 * Bridge: db.depolar | stok.envanter | stok.sayim_karsilastir | barkod.sorgula
 * Stil: inline style (BarkodSorgula ile aynı pattern) — CSS dosyası YOK
 */

import { useState, useEffect, useCallback, useRef } from "react";
import usePython from "../hooks/usePython";
import {
  ClipboardCheck, Package, Search, ChevronLeft, ChevronRight,
  AlertTriangle, CheckCircle2, XCircle, ArrowRightLeft,
  RotateCcw, Loader2, Layers, Box, List, FileText, Upload,
  Warehouse, ChevronDown,
} from "lucide-react";

// ── Tema sabitleri ──
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

const SAYFA_BOYUT = 100;
const GRUP_SECENEKLER = [
  { id: "hepsi", label: "Tüm Ürünler", Icon: List },
  { id: "cesit", label: "Çeşit", Icon: Layers },
  { id: "kutu", label: "Kutu", Icon: Box },
];

// ═══════════════════════════════════════════════════════════════
// ANA BİLEŞEN
// ═══════════════════════════════════════════════════════════════

export default function StokSayim() {
  const { call: invoke } = usePython();

  const [mod, setMod] = useState("envanter");
  const [depolar, setDepolar] = useState([]);
  const [secilenDepo, setSecilenDepo] = useState(null);
  const [yukleniyor, setYukleniyor] = useState(false);

  // envanter
  const [arama, setArama] = useState("");
  const [aramaGecici, setAramaGecici] = useState("");
  const [grup, setGrup] = useState("hepsi");
  const [sayfa, setSayfa] = useState(1);
  const [envanter, setEnvanter] = useState(null);
  const [seciliUrun, setSeciliUrun] = useState(null);
  const [detayYuk, setDetayYuk] = useState(false);

  // sayım
  const [uidMetin, setUidMetin] = useState("");
  const [sayimSonuc, setSayimSonuc] = useState(null);
  const [sayimTab, setSayimTab] = useState("eslesen");
  const [sayimDepoId, setSayimDepoId] = useState(null);   // TXT'den otomatik tespit
  const [sayimDepoAdi, setSayimDepoAdi] = useState("");      // Gösterim için

  const debRef = useRef(null);

  // ── Depolar ──
  useEffect(() => {
    invoke("db.depolar", {}).then((r) => {
      if (Array.isArray(r)) setDepolar(r);
    }).catch(() => { });
  }, [invoke]);

  // ── Envanter yükle ──
  const envanterYukle = useCallback(async () => {
    setYukleniyor(true);
    setSeciliUrun(null);
    try {
      const r = await invoke("stok.envanter", {
        depo_id: secilenDepo, arama, grup, sayfa, sayfa_boyut: SAYFA_BOYUT,
      });
      setEnvanter(r?.basarili ? r : null);
    } catch { setEnvanter(null); }
    finally { setYukleniyor(false); }
  }, [invoke, secilenDepo, arama, grup, sayfa]);

  useEffect(() => {
    if (mod === "envanter") envanterYukle();
  }, [mod, secilenDepo, arama, grup, sayfa]);

  // ── Debounce arama ──
  const aramaGuncelle = (v) => {
    setAramaGecici(v);
    if (debRef.current) clearTimeout(debRef.current);
    debRef.current = setTimeout(() => { setArama(v); setSayfa(1); }, 380);
  };

  // ── Detay ──
  const detayAc = async (uid) => {
    if (!uid) return;
    setDetayYuk(true);
    try {
      const r = await invoke("barkod.sorgula", { uid });
      if (r?.basarili) setSeciliUrun(r);
    } catch { }
    finally { setDetayYuk(false); }
  };

  // ── Sayım ──
  const karsilastir = async () => {
    const liste = uidMetin.split("\n").map((s) => s.trim()).filter(Boolean);
    if (!liste.length) return;
    setYukleniyor(true);
    setSayimSonuc(null);
    try {
      const r = await invoke("stok.sayim_karsilastir", { depo_id: sayimDepoId, uid_listesi: liste });
      setSayimSonuc(r?.basarili ? r : { hata: r?.mesaj || "Hata" });
      setSayimTab("eslesen");
    } catch (e) { setSayimSonuc({ hata: String(e) }); }
    finally { setYukleniyor(false); }
  };

  const uidSatir = uidMetin.split("\n").filter((s) => s.trim()).length;
  const toplamSayfa = envanter ? Math.ceil(envanter.toplam / SAYFA_BOYUT) : 0;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14, height: "100%", overflow: "hidden" }}>

      {/* ── ÜST BAR ── */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          {/* Mod toggle */}
          <div style={{ display: "flex", background: C.panel, border: `1px solid ${C.border}`, borderRadius: 8, overflow: "hidden" }}>
            {[
              { id: "envanter", label: "Envanter", Icon: Package },
              { id: "sayim", label: "Sayım", Icon: ClipboardCheck },
            ].map(({ id, label, Icon }) => (
              <button key={id} onClick={() => setMod(id)} style={{
                display: "flex", alignItems: "center", gap: 6,
                padding: "8px 16px", background: "transparent", border: "none",
                borderBottom: mod === id ? `2px solid ${C.blue}` : "2px solid transparent",
                color: mod === id ? C.blue : C.muted,
                fontFamily: "Rajdhani, sans-serif", fontSize: 13, fontWeight: 600,
                cursor: "pointer", transition: "all 0.2s", letterSpacing: "0.04em",
              }}>
                <Icon size={14} />
                {label}
              </button>
            ))}
          </div>

          {/* Depo Seçimi */}
          <div style={{ position: "relative", minWidth: 200 }}>
            <div style={{ 
              position: "absolute", left: 10, top: "50%", transform: "translateY(-50%)", 
              color: secilenDepo ? C.blue : C.muted, display: "flex", pointerEvents: "none" 
            }}>
              <Warehouse size={16} />
            </div>
            
            <select
              value={secilenDepo || ""}
              onChange={(e) => { setSecilenDepo(e.target.value ? Number(e.target.value) : null); setSayfa(1); }}
              style={{
                background: C.panel, 
                border: `1px solid ${secilenDepo ? `${C.blue}66` : C.border}`, 
                borderRadius: 8,
                padding: "8px 30px 8px 32px", 
                color: secilenDepo ? "#fff" : C.muted,
                fontFamily: "Rajdhani, sans-serif", fontSize: 13, 
                cursor: "pointer", outline: "none", appearance: "none",
                transition: "all 0.2s",
                boxShadow: secilenDepo ? `0 0 15px ${C.blue}12` : "none"
              }}
            >
              <option value="">Depo Seçiniz...</option>
              {depolar.map((d) => <option key={d.id} value={d.id} style={{ background: C.void }}>{d.ad}</option>)}
            </select>

            <div style={{ 
              position: "absolute", right: 10, top: "50%", transform: "translateY(-50%)", 
              color: C.muted, display: "flex", pointerEvents: "none" 
            }}>
              <ChevronDown size={16} />
            </div>
          </div>
        </div>

        {/* Envanter araçları */}
        {mod === "envanter" && (
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            {/* Gruplama */}
            <div style={{ display: "flex", gap: 2, background: C.panel, border: `1px solid ${C.border}`, borderRadius: 8, padding: 3 }}>
              {GRUP_SECENEKLER.map(({ id, label, Icon }) => (
                <button key={id} onClick={() => { setGrup(id); setSayfa(1); }} style={{
                  display: "flex", alignItems: "center", gap: 5, padding: "5px 10px",
                  border: "none", borderRadius: 5,
                  background: grup === id ? `${C.blue}1A` : "transparent",
                  color: grup === id ? C.blue : C.muted,
                  fontFamily: "Rajdhani, sans-serif", fontSize: 11, fontWeight: 600, cursor: "pointer",
                }}>
                  <Icon size={12} />{label}
                </button>
              ))}
            </div>

            {/* Arama */}
            <div style={{ position: "relative", display: "flex", alignItems: "center" }}>
              <Search size={14} style={{ position: "absolute", left: 10, color: C.muted, pointerEvents: "none" }} />
              <input
                type="text" placeholder="UID, lot, ürün adı..."
                value={aramaGecici} onChange={(e) => aramaGuncelle(e.target.value)}
                style={{
                  background: C.panel, border: `1px solid ${C.border}`, borderRadius: 8,
                  padding: "8px 12px 8px 30px", color: "#e2e8f0",
                  fontFamily: "Rajdhani, sans-serif", fontSize: 13, width: 210, outline: "none",
                }}
              />
            </div>
          </div>
        )}
      </div>

      {/* ── ÖZET KARTLAR ── */}
      {mod === "envanter" && envanter?.ozet && (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 10 }}>
          {[
            { l: "Toplam Ürün", v: envanter.ozet.toplam_urun || 0, c: C.blue },
            { l: "Çeşit", v: envanter.ozet.cesit_sayisi || 0, c: C.purple },
            { l: "Kutu", v: envanter.ozet.kutu_sayisi || 0, c: C.orange },
            { l: "Toplam Ağırlık", v: `${envanter.ozet.toplam_agirlik || 0} kg`, c: C.green },
          ].map(({ l, v, c }) => (
            <div key={l} style={{ background: C.panel, border: `1px solid ${c}22`, borderRadius: 10, padding: "12px 16px", display: "flex", flexDirection: "column", gap: 3 }}>
              <span style={{ fontFamily: "Orbitron, monospace", fontSize: 9, letterSpacing: "0.1em", color: C.muted, textTransform: "uppercase" }}>{l}</span>
              <span style={{ fontFamily: "Rajdhani, sans-serif", fontSize: 22, fontWeight: 700, color: c, lineHeight: 1 }}>{v}</span>
            </div>
          ))}
        </div>
      )}

      {/* ── ANA İÇERİK ── */}
      <div style={{ flex: 1, minHeight: 0, overflow: "hidden" }}>
        {mod === "envanter" ? (
          <EnvanterPanel
            envanter={envanter} grup={grup} yukleniyor={yukleniyor}
            sayfa={sayfa} toplamSayfa={toplamSayfa} sayfaDegistir={setSayfa}
            seciliUrun={seciliUrun} detayAc={detayAc} detayYuk={detayYuk}
            detayKapat={() => setSeciliUrun(null)}
          />
        ) : (
          <SayimPanel
            depolar={depolar}
            uidMetin={uidMetin} setUidMetin={setUidMetin}
            uidSatir={uidSatir} karsilastir={karsilastir}
            sayimDepoId={sayimDepoId} setSayimDepoId={setSayimDepoId}
            sayimDepoAdi={sayimDepoAdi} setSayimDepoAdi={setSayimDepoAdi}
            sifirla={() => { setUidMetin(""); setSayimSonuc(null); setSayimDepoId(null); setSayimDepoAdi(""); }}
            sayimSonuc={sayimSonuc} sayimTab={sayimTab} setSayimTab={setSayimTab}
            yukleniyor={yukleniyor}
          />
        )}
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════
// ENVANTER PANELİ
// ═══════════════════════════════════════════════════════════════

function EnvanterPanel({ envanter, grup, yukleniyor, sayfa, toplamSayfa, sayfaDegistir, seciliUrun, detayAc, detayYuk, detayKapat }) {

  if (yukleniyor && !envanter) return <YukleSpin metin="Envanter yükleniyor..." />;
  if (!envanter?.basarili) return <BosEkran icon={<Package size={40} strokeWidth={1} />} metin="Henüz stok verisi yok." alt="XML Yükle sayfasından stok yükleyin." />;

  const urunler = envanter.urunler || [];

  const basliklar = {
    hepsi: ["UID", "Ürün Adı", "Kod", "Lot", "SKT", "Ağırlık", "Depo"],
    cesit: ["SID", "Ürün Adı", "Kod", "Lot", "SKT", "Adet", "Ağırlık", "Depo"],
    kutu: ["Kutu UID", "Ürün Adı", "Lot", "SKT", "Adet", "Ağırlık", "Depo"],
  };

  return (
    <div style={{ display: "flex", gap: 14, height: "100%" }}>
      {/* Tablo */}
      <div style={{
        flex: 1, display: "flex", flexDirection: "column",
        background: C.panel, border: `1px solid ${C.border}`, borderRadius: 10,
        overflow: "hidden", position: "relative", minHeight: 0,
      }}>
        <div style={{ flex: 1, overflow: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontFamily: "Rajdhani, sans-serif", fontSize: 12 }}>
            <thead>
              <tr>
                {basliklar[grup].map((b) => (
                  <th key={b} style={{
                    position: "sticky", top: 0, zIndex: 2,
                    background: C.surface, padding: "10px 12px", textAlign: "left",
                    fontFamily: "Orbitron, monospace", fontSize: 9, fontWeight: 500,
                    letterSpacing: "0.08em", color: C.muted, textTransform: "uppercase",
                    borderBottom: `1px solid ${C.border}`, whiteSpace: "nowrap",
                  }}>{b}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {urunler.length === 0 ? (
                <tr><td colSpan={basliklar[grup].length} style={{ textAlign: "center", padding: "40px 12px", color: C.muted, fontStyle: "italic" }}>Sonuç bulunamadı</td></tr>
              ) : urunler.map((u, i) => (
                <SatirHover key={i} onClick={() => detayAc(u.uid || u.sid || u.kutu_uid)}>
                  {grup === "hepsi" && <>
                    <TdMono val={kisalt(u.uid, 18)} title={u.uid} c={C.blue} />
                    <Td val={u.urun_adi} />
                    <TdMono val={u.kod} c="rgba(255,255,255,0.4)" />
                    <Td val={u.lot} />
                    <Td val={u.skt} />
                    <Td val={u.agirlik ? `${u.agirlik} kg` : "-"} sag />
                    <TdDepo val={u.depo_kod} />
                  </>}
                  {grup === "cesit" && <>
                    <TdMono val={kisalt(u.sid, 18)} title={u.sid} c={C.blue} />
                    <Td val={u.urun_adi} />
                    <TdMono val={u.kod} c="rgba(255,255,255,0.4)" />
                    <Td val={u.lot} />
                    <Td val={u.skt} />
                    <Td val={u.adet} sag />
                    <Td val={u.toplam_agirlik ? `${u.toplam_agirlik} kg` : "-"} sag />
                    <TdDepo val={u.depo_kod} />
                  </>}
                  {grup === "kutu" && <>
                    <TdMono val={kisalt(u.kutu_uid, 18)} title={u.kutu_uid} c={C.blue} />
                    <Td val={u.urun_adi} />
                    <Td val={u.lot} />
                    <Td val={u.skt} />
                    <Td val={u.adet} sag />
                    <Td val={u.toplam_agirlik ? `${u.toplam_agirlik} kg` : "-"} sag />
                    <TdDepo val={u.depo_kod} />
                  </>}
                </SatirHover>
              ))}
            </tbody>
          </table>
        </div>

        {/* Sayfalama */}
        {toplamSayfa > 1 && (
          <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 12, padding: "9px 12px", borderTop: `1px solid ${C.border}`, fontFamily: "Rajdhani, sans-serif", fontSize: 12, color: C.muted }}>
            <SayfaBtn disabled={sayfa <= 1} onClick={() => sayfaDegistir(sayfa - 1)}><ChevronLeft size={14} /></SayfaBtn>
            <span>{sayfa} / {toplamSayfa} <span style={{ marginLeft: 6, color: "rgba(255,255,255,0.18)", fontSize: 11 }}>({envanter.toplam} kayıt)</span></span>
            <SayfaBtn disabled={sayfa >= toplamSayfa} onClick={() => sayfaDegistir(sayfa + 1)}><ChevronRight size={14} /></SayfaBtn>
          </div>
        )}

        {/* Overlay */}
        {yukleniyor && (
          <div style={{ position: "absolute", inset: 0, background: "rgba(2,6,23,0.6)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 5 }}>
            <Spin />
          </div>
        )}
      </div>

      {/* Detay */}
      {seciliUrun && <DetayPanel data={seciliUrun} yukleniyor={detayYuk} kapat={detayKapat} />}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════
// DETAY PANELİ
// ═══════════════════════════════════════════════════════════════

function DetayPanel({ data, yukleniyor, kapat }) {
  return (
    <div style={{ width: 310, flexShrink: 0, background: C.panel, border: `1px solid ${C.border}`, borderRadius: 10, display: "flex", flexDirection: "column", overflow: "hidden" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "11px 14px", borderBottom: `1px solid ${C.border}`, fontFamily: "Orbitron, monospace", fontSize: 9, letterSpacing: "0.06em", color: "rgba(255,255,255,0.5)" }}>
        <span style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <Package size={12} />
          {yukleniyor ? "Yükleniyor..." : data.tip === "koli" ? `${data.etiket || "KOLİ"} — ${data.koli?.urun_sayisi} ürün` : "Ürün Detayı"}
        </span>
        <button onClick={kapat} style={{ background: "none", border: "none", color: C.muted, cursor: "pointer", fontSize: 14, padding: "2px 6px" }}>✕</button>
      </div>

      {yukleniyor ? (
        <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center" }}><Spin /></div>
      ) : (
        <div style={{ padding: "12px 14px", overflowY: "auto", flex: 1, display: "flex", flexDirection: "column", gap: 5 }}>
          {data.tip === "urun" && (() => {
            const u = data.urun, y = data.yukleme; return (<>
              <DS e="UID" v={u.uid} mono />
              <DS e="SID" v={u.sid} mono />
              <DS e="Kod" v={u.kod} />
              <DS e="Ürün Adı" v={u.urun_adi} />
              <DS e="Lot" v={u.lot} />
              <DS e="SKT" v={u.skt} />
              <DS e="Ağırlık" v={u.agirlik ? `${u.agirlik} kg` : "-"} />
              <DS e="Koli İçi" v={u.koli_toplam} />
              <div style={{ height: 1, background: C.border, margin: "4px 0" }} />
              <DS e="Depo" v={y.depo} />
              <DS e="Depo Kodu" v={y.depo_kod} />
              <DS e="Gönderi" v={y.gonderi_no} />
              <DS e="Gönderen" v={y.gonderen} />
              <DS e="Alıcı" v={y.alici} />
            </>);
          })()}

          {data.tip === "koli" && (() => {
            const k = data.koli, ks = data.urunler || []; return (<>
              <DS e="SID" v={k.sid} mono />
              <DS e="Ürün Adı" v={k.urun_adi} />
              <DS e="Lot" v={k.lot} />
              <DS e="SKT" v={k.skt} />
              <DS e="Depo" v={k.depo} />
              <div style={{ height: 1, background: C.border, margin: "4px 0" }} />
              <span style={{ fontFamily: "Orbitron, monospace", fontSize: 9, color: C.muted, letterSpacing: "0.08em" }}>İÇERİK ({ks.length})</span>
              <div style={{ display: "flex", flexDirection: "column", gap: 2, maxHeight: 200, overflowY: "auto" }}>
                {ks.slice(0, 25).map((u, i) => (
                  <div key={i} style={{ display: "flex", justifyContent: "space-between", padding: "3px 0", fontSize: 11, color: "rgba(255,255,255,0.4)", borderBottom: `1px solid ${C.border}` }}>
                    <span style={{ fontFamily: "JetBrains Mono, monospace", fontSize: 10, color: `${C.blue}99` }}>{kisalt(u.uid, 16)}</span>
                    <span>{u.agirlik ? `${u.agirlik} kg` : ""}</span>
                  </div>
                ))}
                {ks.length > 25 && <div style={{ textAlign: "center", padding: "4px 0", fontSize: 11, color: C.muted, fontStyle: "italic" }}>+{ks.length - 25} ürün daha</div>}
              </div>
            </>);
          })()}
        </div>
      )}
    </div>
  );
}

function DS({ e, v, mono }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 8 }}>
      <span style={{ fontFamily: "Rajdhani, sans-serif", fontSize: 11, color: C.muted, whiteSpace: "nowrap", flexShrink: 0 }}>{e}</span>
      <span style={{ fontFamily: mono ? "JetBrains Mono, monospace" : "Rajdhani, sans-serif", fontSize: mono ? 10 : 12, color: mono ? `${C.blue}BB` : "#e2e8f0", textAlign: "right", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{v || "-"}</span>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════
// SAYIM PANELİ
// ═══════════════════════════════════════════════════════════════

// GS1-128 TXT satırından UID'yi çıkar
// Format: (90)TR022(250)21031317465(240)010(20)00(3103)000066
function gs1SatirUid(satir) {
  const m = satir.match(/\(250\)([^(]+)/);
  return m ? m[1].trim() : null;
}

function SayimPanel({ depolar, uidMetin, setUidMetin, uidSatir, karsilastir, sifirla, sayimSonuc, sayimTab, setSayimTab, yukleniyor, sayimDepoId, setSayimDepoId, sayimDepoAdi, setSayimDepoAdi }) {
  const fileInputRef = useRef(null);
  const [txtDosyaAdi, setTxtDosyaAdi] = useState("");

  // ── Dosya adından depo kodunu çıkar ──
  // Örnek: FEEMTR_185555_2026043030542805_457_.txt → "457" → "33-2019-00457"
  const dosyaAdindanDepoTespit = (dosyaAdi) => {
    // Son rakam bloğu: _457_ veya _00419_ gibi
    const m = dosyaAdi.match(/_(\d{3,6})_[^_]*$/);
    if (!m) return null;
    const sonEk = m[1]; // örn: "457"
    // depolar içinde kod'un sonu bu rakamla bitiyor mu?
    const eslesenDepo = depolar.find((d) =>
      d.kod && d.kod.endsWith(sonEk)
    );
    return eslesenDepo || null;
  };

  // ── TXT dosyası seç ve parse et ──
  const txtDosyaSec = (e) => {
    const dosya = e.target.files?.[0];
    if (!dosya) return;
    setTxtDosyaAdi(dosya.name);

    // Depoyu dosya adından tespit et
    const tespit = dosyaAdindanDepoTespit(dosya.name);
    if (tespit) {
      setSayimDepoId(tespit.id);
      setSayimDepoAdi(tespit.ad);
    } else {
      setSayimDepoId(null);
      setSayimDepoAdi("");
    }

    const reader = new FileReader();
    reader.onload = (ev) => {
      const metin = ev.target.result;
      const satirlar = metin.split(/\r?\n/);

      // GS1 formatı mı kontrol et
      const ilkGercel = satirlar.find((s) => s.trim());
      const gs1Mi = ilkGercel && ilkGercel.includes("(250)");

      let uidler;
      if (gs1Mi) {
        uidler = satirlar.map(gs1SatirUid).filter(Boolean);
      } else {
        uidler = satirlar.map((s) => s.trim()).filter(Boolean);
      }

      setUidMetin(uidler.join("\n"));
    };
    reader.readAsText(dosya, "utf-8");
    e.target.value = "";
  };

  return (
    <div style={{ display: "flex", gap: 14, height: "100%" }}>
      {/* Sol: UID girişi */}
      <div style={{ width: 340, flexShrink: 0, display: "flex", flexDirection: "column", gap: 10 }}>

        {/* Başlık satırı */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, fontFamily: "Orbitron, monospace", fontSize: 9, letterSpacing: "0.06em", color: C.muted }}>
            <FileText size={13} />
            UID LİSTESİ
            <span style={{ background: `${C.blue}18`, color: C.blue, padding: "2px 8px", borderRadius: 10, fontFamily: "Rajdhani, sans-serif", fontSize: 11, fontWeight: 600 }}>
              {uidSatir} satır
            </span>
          </div>

          {/* TXT Yükle butonu */}
          <button
            onClick={() => fileInputRef.current?.click()}
            title="CK65 TXT veya düz UID listesi yükle"
            style={{
              display: "flex", alignItems: "center", gap: 5,
              padding: "5px 10px", border: `1px solid ${C.blue}33`, borderRadius: 7,
              background: `${C.blue}0C`, color: C.blue,
              fontFamily: "Rajdhani, sans-serif", fontSize: 11, fontWeight: 600, cursor: "pointer",
            }}
          >
            <Upload size={12} />
            TXT Yükle
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept=".txt"
            onChange={txtDosyaSec}
            style={{ display: "none" }}
          />
        </div>

        {/* Yüklenen dosya + tespit edilen depo */}
        {txtDosyaAdi && (
          <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 6, padding: "5px 10px", background: `${C.green}08`, border: `1px solid ${C.green}22`, borderRadius: 7 }}>
              <FileText size={11} style={{ color: C.green, flexShrink: 0 }} />
              <span style={{ fontFamily: "JetBrains Mono, monospace", fontSize: 10, color: `${C.green}CC`, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", flex: 1 }}>
                {txtDosyaAdi}
              </span>
            </div>
            {sayimDepoAdi ? (
              <div style={{ display: "flex", alignItems: "center", gap: 6, padding: "4px 10px", background: `${C.blue}08`, border: `1px solid ${C.blue}20`, borderRadius: 7 }}>
                <span style={{ fontFamily: "Orbitron, monospace", fontSize: 8, color: C.muted, letterSpacing: "0.08em" }}>DEPO</span>
                <span style={{ fontFamily: "Rajdhani, sans-serif", fontSize: 12, fontWeight: 600, color: C.blue }}>
                  {sayimDepoAdi}
                </span>
              </div>
            ) : (
              <div style={{ display: "flex", alignItems: "center", gap: 6, padding: "4px 10px", background: `${C.orange}08`, border: `1px solid ${C.orange}20`, borderRadius: 7 }}>
                <AlertTriangle size={11} style={{ color: C.orange, flexShrink: 0 }} />
                <span style={{ fontFamily: "Rajdhani, sans-serif", fontSize: 11, color: C.orange }}>
                  Depo tespit edilemedi — manuel seçin
                </span>
                <div style={{ position: "relative", marginLeft: "auto", minWidth: 140 }}>
                  <select
                    value={sayimDepoId || ""}
                    onChange={(e) => {
                      const d = depolar.find((x) => x.id === Number(e.target.value));
                      setSayimDepoId(d?.id || null);
                      setSayimDepoAdi(d?.ad || "");
                    }}
                    style={{ 
                      width: "100%",
                      background: C.panel, border: `1px solid ${sayimDepoId ? `${C.blue}66` : C.border}`, 
                      borderRadius: 6, padding: "4px 24px 4px 8px", 
                      color: sayimDepoId ? "#fff" : C.muted, 
                      fontFamily: "Rajdhani, sans-serif", fontSize: 11,
                      appearance: "none", outline: "none", cursor: "pointer"
                    }}
                  >
                    <option value="">Depo Seçiniz...</option>
                    {depolar.map((d) => <option key={d.id} value={d.id} style={{ background: C.void }}>{d.ad}</option>)}
                  </select>
                  <div style={{ position: "absolute", right: 6, top: "50%", transform: "translateY(-50%)", color: C.muted, pointerEvents: "none", display: "flex" }}>
                    <ChevronDown size={12} />
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        <textarea
          value={uidMetin}
          onChange={(e) => setUidMetin(e.target.value)}
          placeholder={"UID'leri her satıra bir tane girin ya da yapıştırın...\n\nYa da 'TXT Yükle' ile CK65'ten gelen\ndosyayı seçin — otomatik parse edilir.\n\nÖrnek:\n21031318347\n21031318348"}
          spellCheck={false}
          style={{
            flex: 1, minHeight: 180, background: "#000",
            border: `1px solid ${C.blue}20`, borderRadius: 10,
            padding: 14, color: C.blue,
            fontFamily: "JetBrains Mono, monospace", fontSize: 11, lineHeight: 1.7,
            resize: "none", outline: "none",
          }}
          onFocus={(e) => e.target.style.borderColor = `${C.blue}44`}
          onBlur={(e) => e.target.style.borderColor = `${C.blue}20`}
        />

        <div style={{ display: "flex", gap: 8 }}>
          <button
            onClick={karsilastir}
            disabled={yukleniyor || uidSatir === 0 || !sayimDepoId}
            style={{
              flex: 1, display: "flex", alignItems: "center", justifyContent: "center", gap: 6,
              padding: "9px 0", border: `1px solid ${C.green}44`, borderRadius: 8,
              background: `${C.green}0E`, color: C.green,
              fontFamily: "Rajdhani, sans-serif", fontSize: 13, fontWeight: 600,
              cursor: yukleniyor || uidSatir === 0 ? "not-allowed" : "pointer",
              opacity: yukleniyor || uidSatir === 0 ? 0.4 : 1, transition: "opacity 0.2s",
            }}
          >
            {yukleniyor ? <Spin size={14} /> : <ArrowRightLeft size={14} />}
            Karşılaştır
          </button>
          <button
            onClick={() => { sifirla(); setTxtDosyaAdi(""); setSayimDepoId(null); setSayimDepoAdi(""); }} disabled={yukleniyor}
            style={{
              display: "flex", alignItems: "center", gap: 5, padding: "9px 14px",
              border: `1px solid ${C.border}`, borderRadius: 8,
              background: "transparent", color: C.muted,
              fontFamily: "Rajdhani, sans-serif", fontSize: 13, fontWeight: 600,
              cursor: "pointer", opacity: yukleniyor ? 0.4 : 1,
            }}
          >
            <RotateCcw size={13} />
            Temizle
          </button>
        </div>
      </div>

      {/* Sağ: Sonuçlar */}
      <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 10, minHeight: 0, overflow: "hidden" }}>
        {!sayimSonuc ? (
          <BosEkran icon={<ArrowRightLeft size={32} strokeWidth={1} />} metin="UID listesi girip Karşılaştır'a basın." />
        ) : sayimSonuc.hata ? (
          <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "12px 16px", background: `${C.red}0A`, border: `1px solid ${C.red}33`, borderRadius: 10, color: C.red, fontFamily: "Rajdhani, sans-serif", fontSize: 13 }}>
            <AlertTriangle size={15} />{sayimSonuc.hata}
          </div>
        ) : (
          <SayimSonucPanel sonuc={sayimSonuc} tab={sayimTab} setTab={setSayimTab} />
        )}
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════
// SAYIM SONUÇ PANELİ
// ═══════════════════════════════════════════════════════════════

function SayimSonucPanel({ sonuc, tab, setTab }) {
  const oz = sonuc.ozet;
  const uyumRenk = oz.uyum_orani >= 95 ? C.green : oz.uyum_orani >= 80 ? C.orange : C.red;
  const TABLAR = [
    { id: "eslesen", label: "Eşleşen", sayi: oz.eslesen, c: C.green, Icon: CheckCircle2 },
    { id: "eksik", label: "Eksik", sayi: oz.eksik, c: C.red, Icon: XCircle },
    { id: "fazla", label: "Fazla", sayi: oz.fazla, c: C.orange, Icon: AlertTriangle },
  ];
  const aktif = tab === "eslesen" ? sonuc.eslesen : tab === "eksik" ? sonuc.eksik : sonuc.fazla;

  return <>
    {/* Özet */}
    <div style={{ display: "flex", gap: 8 }}>
      {[
        { l: "Sayılan", v: oz.sayilan, c: C.blue },
        { l: "Stokta", v: oz.stokta, c: "#e2e8f0" },
        { l: "Uyum Oranı", v: `%${oz.uyum_orani}`, c: uyumRenk },
        ...(oz.mukerrer > 0 ? [{ l: "Mükerrer", v: oz.mukerrer, c: C.orange }] : []),
      ].map(({ l, v, c }) => (
        <div key={l} style={{ flex: 1, background: C.panel, border: `1px solid ${C.border}`, borderRadius: 10, padding: "10px 14px", display: "flex", flexDirection: "column", gap: 2 }}>
          <span style={{ fontFamily: "Orbitron, monospace", fontSize: 8, letterSpacing: "0.1em", color: C.muted, textTransform: "uppercase" }}>{l}</span>
          <span style={{ fontFamily: "Rajdhani, sans-serif", fontSize: 20, fontWeight: 700, color: c, lineHeight: 1 }}>{v}</span>
        </div>
      ))}
    </div>

    {/* Sekmeler */}
    <div style={{ display: "flex", gap: 6 }}>
      {TABLAR.map(({ id, label, sayi, c, Icon }) => (
        <button key={id} onClick={() => setTab(id)} style={{
          display: "flex", alignItems: "center", gap: 6, padding: "7px 14px",
          background: tab === id ? `${c}12` : C.panel,
          border: `1px solid ${tab === id ? `${c}33` : C.border}`,
          borderRadius: 8, color: tab === id ? c : C.muted,
          fontFamily: "Rajdhani, sans-serif", fontSize: 12, fontWeight: 600, cursor: "pointer", transition: "all 0.18s",
        }}>
          <Icon size={13} />
          {label}
          <span style={{ fontFamily: "JetBrains Mono, monospace", fontSize: 10, padding: "1px 6px", borderRadius: 8, background: tab === id ? `${c}18` : "rgba(255,255,255,0.04)", color: tab === id ? c : C.muted }}>
            {sayi}
          </span>
        </button>
      ))}
    </div>

    {/* Tablo */}
    <div style={{ flex: 1, overflow: "auto", background: C.panel, border: `1px solid ${C.border}`, borderRadius: 10 }}>
      <table style={{ width: "100%", borderCollapse: "collapse", fontFamily: "Rajdhani, sans-serif", fontSize: 12 }}>
        <thead>
          <tr>
            {["UID", "Ürün Adı", "Lot", tab === "fazla" ? "Açıklama" : "Ağırlık"].map((b) => (
              <th key={b} style={{ position: "sticky", top: 0, background: C.surface, padding: "9px 12px", textAlign: "left", fontFamily: "Orbitron, monospace", fontSize: 9, letterSpacing: "0.08em", color: C.muted, textTransform: "uppercase", borderBottom: `1px solid ${C.border}` }}>{b}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {aktif.length === 0
            ? <tr><td colSpan={4} style={{ textAlign: "center", padding: "40px 12px", color: C.muted, fontStyle: "italic" }}>Bu kategoride kayıt yok</td></tr>
            : aktif.map((u, i) => (
              <tr key={i} style={{ borderBottom: `1px solid ${C.border}` }}>
                <TdMono val={kisalt(u.uid, 22)} title={u.uid} c={C.blue} />
                <Td val={u.urun_adi} />
                <Td val={u.lot} />
                {tab === "fazla" ? <Td val={u.aciklama} c={C.orange} /> : <Td val={u.agirlik ? `${u.agirlik} kg` : "-"} sag />}
              </tr>
            ))
          }
        </tbody>
      </table>
    </div>
  </>;
}

// ═══════════════════════════════════════════════════════════════
// KÜÇÜK YARDIMCILAR
// ═══════════════════════════════════════════════════════════════

const tdBase = { padding: "8px 12px", color: "#cbd5e1", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", maxWidth: 180 };

function Td({ val, sag, c }) {
  return <td style={{ ...tdBase, textAlign: sag ? "right" : "left", color: c || "#cbd5e1" }}>{val ?? "-"}</td>;
}
function TdMono({ val, title, c }) {
  return <td title={title} style={{ ...tdBase, fontFamily: "JetBrains Mono, monospace", fontSize: 10, color: c || C.blue }}>{val ?? "-"}</td>;
}
function TdDepo({ val }) {
  return <td style={{ ...tdBase, fontFamily: "Orbitron, monospace", fontSize: 9, letterSpacing: "0.05em", color: `${C.purple}AA` }}>{val ?? "-"}</td>;
}

function SatirHover({ children, onClick }) {
  const [hov, setHov] = useState(false);
  return (
    <tr onClick={onClick} onMouseEnter={() => setHov(true)} onMouseLeave={() => setHov(false)}
      style={{ cursor: "pointer", background: hov ? `${C.blue}06` : "transparent", transition: "background 0.12s" }}>
      {children}
    </tr>
  );
}

function SayfaBtn({ children, disabled, onClick }) {
  return (
    <button onClick={onClick} disabled={disabled} style={{ background: "rgba(255,255,255,0.04)", border: `1px solid ${C.border}`, borderRadius: 6, padding: "4px 8px", color: C.muted, cursor: disabled ? "default" : "pointer", display: "flex", alignItems: "center", opacity: disabled ? 0.25 : 1 }}>
      {children}
    </button>
  );
}

function Spin({ size = 18 }) {
  return <Loader2 size={size} style={{ animation: "spin 1s linear infinite", color: C.blue }} />;
}

function YukleSpin({ metin }) {
  return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 10, height: "100%", color: C.muted, fontFamily: "Rajdhani, sans-serif", fontSize: 14 }}>
      <Spin />{metin}
    </div>
  );
}

function BosEkran({ icon, metin, alt }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 12, height: "100%", color: C.muted, fontFamily: "Rajdhani, sans-serif", fontSize: 15 }}>
      {icon}
      <span>{metin}</span>
      {alt && <span style={{ fontSize: 12, color: "rgba(255,255,255,0.12)" }}>{alt}</span>}
    </div>
  );
}

function kisalt(str, max) {
  if (!str) return "-";
  return str.length > max ? str.slice(0, max) + "…" : str;
}