/**
 * GAMALI PATBİS — Stok Çıkış / Patlatma Sayfası
 * =================================================
 * Akış:
 *   Giriş (TXT yükle | UID paste | listeden seç)
 *   → Önizleme (UID'ler açılır, koli→tekil, GS1 üretilir)
 *   → Toplu Onayla → DB'ye çıkış + soft delete
 *
 * Bridge:
 *   stok.cikis_onizle  → UID'leri aç, GS1 üret, önizle
 *   stok.cikis         → Onaylı çıkışı uygula
 *   db.depolar         → Depo listesi
 *
 * Hiyerarşi:
 *   Level 04 (26x) → Level 03 (22x palet) → Level 02 (22x kutu) → Item (21x tekil)
 *   Herhangi bir seviye tarananabilir, sistem tekile açar.
 */

import { useState, useEffect, useRef } from "react";
import usePython from "../hooks/usePython";
import {
  PackageMinus, Upload, FileText, ClipboardList,
  AlertTriangle, CheckCircle2, XCircle, Loader2,
  RotateCcw, ChevronDown, ChevronUp, Copy, Check,
  ArrowRight, Package, List, Layers, Download,
  Warehouse,
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

const SEBEP_SECENEKLER = ["Patlatma", "Kullanım", "Transfer", "Kayıp", "Diğer"];

// GS1 parse — TXT satırından UID çıkar
function gs1Uid(satir) {
  const m = satir.match(/\(250\)([^(]+)/);
  return m ? m[1].trim() : null;
}

// ═══════════════════════════════════════════════════════════════
// ANA BİLEŞEN
// ═══════════════════════════════════════════════════════════════

export default function StokCikis() {
  const { call: invoke } = usePython();

  // ── Adım: "giris" | "onizleme" | "tamamlandi" ──
  const [adim, setAdim] = useState("giris");

  const [depolar, setDepolar] = useState([]);
  const [secilenDepo, setSecilenDepo] = useState(null);
  const [secilenDepoAdi, setSecilenDepoAdi] = useState("");
  const [sebep, setSebep] = useState("Patlatma");
  const [notlar, setNotlar] = useState("");

  // Giriş
  const [uidMetin, setUidMetin] = useState("");
  const [txtDosyaAdi, setTxtDosyaAdi] = useState("");
  const [aktifGiris, setAktifGiris] = useState("paste"); // "paste"|"txt"

  // Önizleme
  const [onizleme, setOnizleme] = useState(null);
  const [yukleniyor, setYukleniyor] = useState(false);

  // Sonuç
  const [sonuc, setSonuc] = useState(null);
  const [indirildi, setIndirildi] = useState(false);

  const fileRef = useRef(null);

  // ── Depolar ──
  useEffect(() => {
    invoke("db.depolar", {}).then((r) => {
      if (Array.isArray(r)) {
        setDepolar(r);
        if (r.length > 0) {
          setSecilenDepo(prev => prev || r[0].id);
          setSecilenDepoAdi(prev => prev || r[0].ad);
        }
      }
    }).catch(() => { });
  }, [invoke]);

  // ── TXT yükle ──
  const txtYukle = (e) => {
    const dosya = e.target.files?.[0];
    if (!dosya) return;
    setTxtDosyaAdi(dosya.name);
    setAktifGiris("txt");

    // Dosya adından depo tespiti
    const m = dosya.name.match(/_(\d{3,6})_[^_]*$/);
    if (m) {
      const eslesenDepo = depolar.find((d) => d.kod?.endsWith(m[1]));
      if (eslesenDepo) {
        setSecilenDepo(eslesenDepo.id);
        setSecilenDepoAdi(eslesenDepo.ad);
      }
    }

    const reader = new FileReader();
    reader.onload = (ev) => {
      const satirlar = ev.target.result.split(/\r?\n/);
      const ilk = satirlar.find((s) => s.trim());
      const uidler = satirlar.map((s) => s.trim()).filter(Boolean);
      setUidMetin(uidler.join("\n"));
    };
    reader.readAsText(dosya, "utf-8");
    e.target.value = "";
  };

  const uidSatir = uidMetin.split("\n").filter((s) => s.trim()).length;

  // ── Önizleme ──
  const onizleYukle = async () => {
    // Sadece boşlukları temizle, ham listeyi backend'e yolla
    const temizListe = uidMetin.split("\n").map((s) => s.trim()).filter(Boolean);

    if (!temizListe.length) return;
    setYukleniyor(true);
    try {
      const r = await invoke("stok.cikis_onizle", {
        uid_listesi: temizListe,
        depo_id: secilenDepo,
      });
      if (r?.basarili) {
        // Otomatik depo seçimi (bulunan ilk ürünün deposuna göre)
        if (r.urunler && r.urunler.length > 0) {
          const uDepoId = r.urunler[0].depo_id;
          if (uDepoId) {
            setSecilenDepo(uDepoId);
            setSecilenDepoAdi(r.urunler[0].depo_adi || "");
          }
        }
        
        setOnizleme(r);
        setAdim("onizleme");
      } else {
        alert(r?.mesaj || "Önizleme hatası");
      }
    } catch (e) {
      alert(String(e));
    } finally {
      setYukleniyor(false);
    }
  };

  // ── Çıkış onayla ──
  const cikisOnayla = async (secilenManuelMap = {}) => {
    const manuelEklenenler = (onizleme?.bulunamayan_detayli || []).filter(u => secilenManuelMap[u.uid]);
    if (!onizleme?.urunler?.length && !manuelEklenenler.length) return;
    
    setYukleniyor(true);
    try {
      const uidler = (onizleme?.urunler || []).map((u) => u.uid);
      const rawMap = {};
      (onizleme?.urunler || []).forEach(u => {
        if (u.raw_gs1 && u.raw_gs1 !== u.uid) {
          rawMap[u.uid] = u.raw_gs1;
        }
      });
      
      const r = await invoke("stok.cikis", {
        uid_listesi: uidler,
        raw_gs1_map: rawMap,
        manuel_eklenenler: manuelEklenenler,
        depo_id: secilenDepo,
        sebep,
        notlar,
      });
      setSonuc(r);
      
      // İşlem başarılıysa otomatik masaüstüne kaydet
      if (r?.basarili && r.gs1_listesi?.length > 0) {
        const icerik = r.gs1_listesi.join("\n");
        // Beklenen format: 16052026_00422 çıkış.txt
        const dateStr = new Date().toLocaleDateString('tr-TR', { day: '2-digit', month: '2-digit', year: 'numeric' }).replace(/\./g, '');
        const depoKisa = secilenDepoAdi.split('-').pop()?.trim() || "depo";
        const dosyaAdi = `${dateStr}_${depoKisa} çıkış.txt`;
        
        try {
          await invoke("dosya.kaydet", { dosya_adi: dosyaAdi, icerik });
        } catch (err) {
          console.error("Otomatik kaydetme hatası:", err);
        }
      }
      
      setAdim("tamamlandi");
    } catch (e) {
      alert(String(e));
    } finally {
      setYukleniyor(false);
    }
  };

  // ── Sıfırla ──
  const sifirla = () => {
    setAdim("giris");
    setUidMetin("");
    setTxtDosyaAdi("");
    setOnizleme(null);
    setSonuc(null);
    setAktifGiris("paste");
    setNotlar("");
  };

  // ── GS1 listesini kopyala / İndir ──
  const gs1Indir = async () => {
    if (!sonuc?.gs1_listesi) return;
    const icerik = sonuc.gs1_listesi.join("\n");
    const dateStr = new Date().toLocaleDateString('tr-TR', { day: '2-digit', month: '2-digit', year: 'numeric' }).replace(/\./g, '');
    const depoKisa = secilenDepoAdi.split('-').pop()?.trim() || "depo";
    const dosyaAdi = `${dateStr}_${depoKisa} çıkış.txt`;
    
    try {
      const r = await invoke("dosya.kaydet", { dosya_adi: dosyaAdi, icerik });
      if (r?.basarili) {
        setIndirildi(true);
        setTimeout(() => setIndirildi(false), 2500);
      } else {
        alert(r?.mesaj || "Dosya kaydedilemedi");
      }
    } catch (e) {
      alert(String(e));
    }
  };

  // ═════════════════════════════════════════════════════════════
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16, height: "100%", overflow: "hidden" }}>

      {/* ── ADIM GÖSTERGESİ ── */}
      <div style={{ display: "flex", alignItems: "center", gap: 0 }}>
        {[
          { id: "giris", label: "Giriş", no: 1 },
          { id: "onizleme", label: "Önizleme", no: 2 },
          { id: "tamamlandi", label: "Tamamlandı", no: 3 },
        ].map((s, i) => {
          const aktif = adim === s.id;
          const gecildi = (
            (s.id === "giris" && ["onizleme", "tamamlandi"].includes(adim)) ||
            (s.id === "onizleme" && adim === "tamamlandi")
          );
          const renk = gecildi ? C.green : aktif ? C.orange : C.muted;
          return (
            <div key={s.id} style={{ display: "flex", alignItems: "center" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                <div style={{
                  width: 26, height: 26, borderRadius: "50%",
                  border: `1px solid ${renk}`,
                  background: aktif ? `${C.orange}18` : gecildi ? `${C.green}12` : "transparent",
                  display: "flex", alignItems: "center", justifyContent: "center",
                  fontFamily: "Orbitron, monospace", fontSize: 10, color: renk,
                }}>
                  {gecildi ? <CheckCircle2 size={14} /> : s.no}
                </div>
                <span style={{ fontFamily: "Rajdhani, sans-serif", fontSize: 12, fontWeight: 600, color: renk, letterSpacing: "0.04em" }}>
                  {s.label}
                </span>
              </div>
              {i < 2 && (
                <div style={{ width: 32, height: 1, background: C.border, margin: "0 8px" }} />
              )}
            </div>
          );
        })}
        <div style={{ flex: 1 }} />
        {adim !== "giris" && (
          <button onClick={sifirla} style={{ display: "flex", alignItems: "center", gap: 5, padding: "5px 12px", background: "transparent", border: `1px solid ${C.border}`, borderRadius: 7, color: C.muted, fontFamily: "Rajdhani, sans-serif", fontSize: 11, cursor: "pointer" }}>
            <RotateCcw size={12} /> Yeni İşlem
          </button>
        )}
      </div>

      {/* ── ANA İÇERİK ── */}
      <div style={{ flex: 1, minHeight: 0, overflow: "hidden" }}>
        {adim === "giris" && (
          <GirisAdimi
            depolar={depolar}
            secilenDepo={secilenDepo} setSecilenDepo={setSecilenDepo}
            secilenDepoAdi={secilenDepoAdi} setSecilenDepoAdi={setSecilenDepoAdi}
            sebep={sebep} setSebep={setSebep}
            notlar={notlar} setNotlar={setNotlar}
            uidMetin={uidMetin} setUidMetin={setUidMetin}
            uidSatir={uidSatir}
            txtDosyaAdi={txtDosyaAdi}
            aktifGiris={aktifGiris} setAktifGiris={setAktifGiris}
            fileRef={fileRef} txtYukle={txtYukle}
            onizleYukle={onizleYukle}
            yukleniyor={yukleniyor}
          />
        )}
        {adim === "onizleme" && (
          <OnizlemeAdimi
            onizleme={onizleme}
            sebep={sebep} setSebep={setSebep}
            notlar={notlar} setNotlar={setNotlar}
            secilenDepoAdi={secilenDepoAdi}
            cikisOnayla={cikisOnayla}
            geriDon={() => setAdim("giris")}
            yukleniyor={yukleniyor}
          />
        )}
        {adim === "tamamlandi" && (
          <TamamlandiAdimi
            sonuc={sonuc}
            sebep={sebep}
            gs1Indir={gs1Indir}
            indirildi={indirildi}
            sifirla={sifirla}
          />
        )}
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════
// ADIM 1 — GİRİŞ
// ═══════════════════════════════════════════════════════════════

function GirisAdimi({ depolar, secilenDepo, setSecilenDepo, secilenDepoAdi, setSecilenDepoAdi, sebep, setSebep, notlar, setNotlar, uidMetin, setUidMetin, uidSatir, txtDosyaAdi, aktifGiris, setAktifGiris, fileRef, txtYukle, onizleYukle, yukleniyor }) {

  return (
    <div style={{ display: "flex", gap: 14, height: "100%" }}>

      {/* ── Sol: Ayarlar ── */}
      <div style={{ width: 280, flexShrink: 0, display: "flex", flexDirection: "column", gap: 12 }}>

        {/* Depo Seçimi */}
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <label style={{ fontFamily: "Orbitron, monospace", fontSize: 10, letterSpacing: "0.15em", color: C.muted, fontWeight: 700 }}>DEPO SEÇİMİ</label>
            {!secilenDepo && (
              <div style={{ 
                fontSize: 10, color: C.red, fontWeight: 800, fontFamily: "Rajdhani, sans-serif",
                background: `${C.red}18`, padding: "2px 8px", borderRadius: 4,
                animation: "pulse 2s infinite"
              }}>
                DEPO SEÇİNİZ!
              </div>
            )}
          </div>
          
          <div style={{ position: "relative" }}>
            <div style={{ 
              position: "absolute", left: 14, top: "50%", transform: "translateY(-50%)", 
              color: secilenDepo ? C.blue : C.muted, display: "flex", pointerEvents: "none" 
            }}>
              <Warehouse size={18} />
            </div>
            
            <select
              value={secilenDepo || ""}
              onChange={(e) => {
                const d = depolar.find((x) => x.id === Number(e.target.value));
                setSecilenDepo(d?.id || null);
                setSecilenDepoAdi(d?.ad || "");
              }}
              style={{ 
                width: "100%",
                background: C.panel, 
                border: `1px solid ${secilenDepo ? `${C.blue}66` : C.border}`, 
                borderRadius: 12, 
                padding: "14px 40px 14px 44px", 
                color: secilenDepo ? "#fff" : C.muted, 
                fontFamily: "Rajdhani, sans-serif", 
                fontSize: 15, 
                fontWeight: 600,
                outline: "none", 
                cursor: "pointer",
                appearance: "none",
                transition: "all 0.3s",
                boxShadow: secilenDepo ? `0 0 20px ${C.blue}12` : "none"
              }}
            >
              <option value="" disabled style={{ background: C.void, color: C.muted }}>Depo Seçiniz...</option>
              {depolar.map((d) => (
                <option key={d.id} value={d.id} style={{ background: C.void, color: "#fff" }}>
                  {d.ad}
                </option>
              ))}
            </select>

            <div style={{ 
              position: "absolute", right: 14, top: "50%", transform: "translateY(-50%)", 
              color: C.muted, display: "flex", pointerEvents: "none" 
            }}>
              <ChevronDown size={18} />
            </div>
          </div>

          {secilenDepo && (
            <div style={{ 
              fontSize: 11, color: C.green, fontFamily: "Rajdhani, sans-serif", 
              padding: "8px 12px", background: `${C.green}08`, borderRadius: 8,
              display: "flex", alignItems: "center", gap: 8,
              border: `1px solid ${C.green}22`
            }}>
              <CheckCircle2 size={13} /> <span style={{ opacity: 0.8 }}>Seçildi:</span> <span style={{ fontWeight: 700 }}>{secilenDepoAdi}</span>
            </div>
          )}
        </div>

        {/* Sebep */}
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          <label style={{ fontFamily: "Orbitron, monospace", fontSize: 9, letterSpacing: "0.08em", color: C.muted }}>ÇIKIŞ SEBEBİ</label>
          <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            {SEBEP_SECENEKLER.map((s) => (
              <button key={s} onClick={() => setSebep(s)} style={{
                padding: "8px 12px", textAlign: "left", border: `1px solid ${sebep === s ? `${C.orange}44` : C.border}`,
                borderRadius: 7, background: sebep === s ? `${C.orange}10` : "transparent",
                color: sebep === s ? C.orange : C.muted,
                fontFamily: "Rajdhani, sans-serif", fontSize: 13, fontWeight: 600, cursor: "pointer",
                display: "flex", alignItems: "center", gap: 8, transition: "all 0.15s",
              }}>
                <div style={{ width: 6, height: 6, borderRadius: "50%", background: sebep === s ? C.orange : C.border, flexShrink: 0 }} />
                {s}
              </button>
            ))}
          </div>
        </div>

        {/* Notlar */}
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          <label style={{ fontFamily: "Orbitron, monospace", fontSize: 9, letterSpacing: "0.08em", color: C.muted }}>NOTLAR (OPSİYONEL)</label>
          <textarea
            value={notlar}
            onChange={(e) => setNotlar(e.target.value)}
            placeholder="Çıkış notları..."
            rows={3}
            style={{ background: C.panel, border: `1px solid ${C.border}`, borderRadius: 8, padding: "8px 12px", color: "#e2e8f0", fontFamily: "Rajdhani, sans-serif", fontSize: 12, resize: "none", outline: "none" }}
          />
        </div>
      </div>

      {/* ── Sağ: UID Girişi ── */}
      <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 10 }}>

        {/* Giriş yöntemi seçici */}
        <div style={{ display: "flex", gap: 6 }}>
          {[
            { id: "paste", label: "UID Yapıştır", Icon: List },
            { id: "txt", label: "TXT Yükle", Icon: Upload },
          ].map(({ id, label, Icon }) => (
            <button key={id} onClick={() => { setAktifGiris(id); if (id === "txt") fileRef.current?.click(); }}
              style={{
                display: "flex", alignItems: "center", gap: 6, padding: "7px 14px",
                border: `1px solid ${aktifGiris === id ? `${C.blue}33` : C.border}`,
                borderRadius: 8, background: aktifGiris === id ? `${C.blue}10` : C.panel,
                color: aktifGiris === id ? C.blue : C.muted,
                fontFamily: "Rajdhani, sans-serif", fontSize: 12, fontWeight: 600, cursor: "pointer",
              }}>
              <Icon size={13} />{label}
            </button>
          ))}
          <input ref={fileRef} type="file" accept=".txt" onChange={txtYukle} style={{ display: "none" }} />

          {/* Satır sayacı */}
          <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 6, fontFamily: "Rajdhani, sans-serif", fontSize: 12, color: C.muted }}>
            {txtDosyaAdi && (
              <span style={{ fontFamily: "JetBrains Mono, monospace", fontSize: 10, color: `${C.green}AA` }}>
                {txtDosyaAdi}
              </span>
            )}
            <span style={{ background: `${C.blue}18`, color: C.blue, padding: "2px 8px", borderRadius: 10, fontWeight: 600 }}>
              {uidSatir} UID
            </span>
          </div>
        </div>

        {/* Textarea */}
        <textarea
          value={uidMetin}
          onChange={(e) => setUidMetin(e.target.value)}
          placeholder={
            "Taranan barkodları yapıştırın — tekil ürün, kutu veya palet UID'si olabilir.\n" +
            "Sistem otomatik açar ve tekil ürünlere çevirir.\n\n" +
            "Örnekler:\n" +
            "  21031318347          → tekil ürün\n" +
            "  22004981346          → palet (140 ürün açılır)\n" +
            "  26021386177          → süper palet (440 ürün açılır)\n\n" +
            "CK65'ten gelen TXT dosyası 'TXT Yükle' ile seçilebilir."
          }
          spellCheck={false}
          style={{
            flex: 1, background: "#000", borderWidth: 1, borderStyle: "solid", borderColor: `${C.orange}20`, borderRadius: 10,
            padding: 14, color: C.orange,
            fontFamily: "JetBrains Mono, monospace", fontSize: 11, lineHeight: 1.7,
            resize: "none", outline: "none",
          }}

        />

        {/* Devam butonu */}
        <button
          onClick={onizleYukle}
          disabled={yukleniyor || uidSatir === 0}
          style={{
            display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
            padding: "12px 0", border: `1px solid ${C.orange}55`, borderRadius: 9,
            background: `${C.orange}10`, color: C.orange,
            fontFamily: "Rajdhani, sans-serif", fontSize: 14, fontWeight: 700, letterSpacing: "0.06em",
            cursor: yukleniyor || uidSatir === 0 ? "not-allowed" : "pointer",
            opacity: yukleniyor || uidSatir === 0 ? 0.35 : 1, transition: "all 0.2s",
          }}
        >
          {yukleniyor ? <Loader2 size={16} style={{ animation: "spin 1s linear infinite" }} /> : <ArrowRight size={16} />}
          ÖNİZLE VE DOĞRULA
        </button>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════
// ADIM 2 — ÖNİZLEME
// ═══════════════════════════════════════════════════════════════

function OnizlemeAdimi({ onizleme, sebep, setSebep, notlar, setNotlar, secilenDepoAdi, cikisOnayla, geriDon, yukleniyor }) {
  const [goster, setGoster] = useState("gecerli"); // "gecerli"|"bulunamayan"
  const [grupluGoster, setGruplu] = useState(true);
  const [secilenManuel, setSecilenManuel] = useState({});

  const urunler = onizleme?.urunler || [];
  const bulunamayan = onizleme?.bulunamayan || [];
  const detayli = onizleme?.bulunamayan_detayli || [];
  const toplam_bulunamayan = bulunamayan.length + detayli.length;
  const ozet = onizleme?.ozet || {};
  
  const secilenManuelSayisi = Object.values(secilenManuel).filter(Boolean).length;

  // Kaynak UID'ye göre grupla
  const gruplar = {};
  urunler.forEach((u) => {
    const k = u.kaynak_uid;
    if (!gruplar[k]) gruplar[k] = [];
    gruplar[k].push(u);
  });

  const [acikGruplar, setAcikGruplar] = useState({});
  const toggleGrup = (uid) => setAcikGruplar((prev) => ({ ...prev, [uid]: !prev[uid] }));

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12, height: "100%" }}>

      {/* ── Özet kartlar ── */}
      <div style={{ display: "flex", gap: 10 }}>
        {[
          { l: "Taranan UID", v: ozet.taranan, c: C.blue },
          { l: "Açılan Ürün", v: ozet.acilan_urun, c: C.orange },
          { l: "Bulunamayan", v: ozet.bulunamayan, c: ozet.bulunamayan > 0 ? C.red : C.muted },
          { l: "Toplam Ağırlık", v: `${ozet.toplam_agirlik} kg`, c: C.green },
        ].map(({ l, v, c }) => (
          <div key={l} style={{ flex: 1, background: C.panel, border: `1px solid ${c}22`, borderRadius: 10, padding: "10px 14px" }}>
            <div style={{ fontFamily: "Orbitron, monospace", fontSize: 8, letterSpacing: "0.1em", color: C.muted, textTransform: "uppercase", marginBottom: 3 }}>{l}</div>
            <div style={{ fontFamily: "Rajdhani, sans-serif", fontSize: 20, fontWeight: 700, color: c, lineHeight: 1 }}>{v}</div>
          </div>
        ))}

        {/* Sebep özeti */}
        <div style={{ flex: 1, background: `${C.orange}08`, border: `1px solid ${C.orange}22`, borderRadius: 10, padding: "10px 14px" }}>
          <div style={{ fontFamily: "Orbitron, monospace", fontSize: 8, letterSpacing: "0.1em", color: C.muted, textTransform: "uppercase", marginBottom: 3 }}>SEBEP</div>
          <div style={{ fontFamily: "Rajdhani, sans-serif", fontSize: 16, fontWeight: 700, color: C.orange }}>{sebep}</div>
        </div>
      </div>

      {/* ── Sekme + liste ── */}
      <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
        {[
          { id: "gecerli", label: `Geçerli (${urunler.length})`, c: C.green },
          { id: "bulunamayan", label: `Bulunamayan (${toplam_bulunamayan})`, c: toplam_bulunamayan > 0 ? C.red : C.muted },
        ].map(({ id, label, c }) => (
          <button key={id} onClick={() => setGoster(id)} style={{
            padding: "6px 14px", border: `1px solid ${goster === id ? `${c}44` : C.border}`,
            borderRadius: 8, background: goster === id ? `${c}10` : C.panel,
            color: goster === id ? c : C.muted,
            fontFamily: "Rajdhani, sans-serif", fontSize: 12, fontWeight: 600, cursor: "pointer",
          }}>
            {label}
          </button>
        ))}
        {goster === "gecerli" && (
          <button onClick={() => setGruplu(!grupluGoster)} style={{
            marginLeft: "auto", display: "flex", alignItems: "center", gap: 5,
            padding: "5px 10px", background: "transparent", border: `1px solid ${C.border}`,
            borderRadius: 7, color: C.muted, fontFamily: "Rajdhani, sans-serif", fontSize: 11, cursor: "pointer",
          }}>
            <Layers size={12} /> {grupluGoster ? "Düz Liste" : "Gruplu Görünüm"}
          </button>
        )}
      </div>

      {/* ── Liste ── */}
      <div style={{ flex: 1, overflow: "auto", background: C.panel, border: `1px solid ${C.border}`, borderRadius: 10 }}>
        {goster === "gecerli" ? (
          grupluGoster ? (
            // Gruplu — kaynak UID başlığı altında tekil ürünler
            <div style={{ padding: 8, display: "flex", flexDirection: "column", gap: 4 }}>
              {Object.entries(gruplar).map(([kaynak, ler]) => {
                const acik = acikGruplar[kaynak] !== false; // varsayılan açık
                const coklu = kaynak !== ler[0]?.uid; // koli mi tekil mi
                return (
                  <div key={kaynak} style={{ border: `1px solid ${coklu ? `${C.orange}22` : C.border}`, borderRadius: 8, overflow: "hidden" }}>
                    {/* Grup başlığı */}
                    <div
                      onClick={() => coklu && toggleGrup(kaynak)}
                      style={{
                        display: "flex", alignItems: "center", gap: 8, padding: "8px 12px",
                        background: coklu ? `${C.orange}08` : "transparent",
                        cursor: coklu ? "pointer" : "default",
                      }}
                    >
                      {coklu
                        ? <Package size={13} style={{ color: C.orange, flexShrink: 0 }} />
                        : <div style={{ width: 13, height: 13, borderRadius: "50%", background: `${C.green}33`, flexShrink: 0 }} />
                      }
                      <span style={{ fontFamily: "JetBrains Mono, monospace", fontSize: 11, color: coklu ? C.orange : `${C.green}BB`, flex: 1 }}>
                        {kaynak}
                      </span>
                      <span style={{ fontFamily: "Rajdhani, sans-serif", fontSize: 11, color: C.muted }}>
                        {ler.length} ürün
                      </span>
                      {coklu && (acik
                        ? <ChevronUp size={13} style={{ color: C.muted }} />
                        : <ChevronDown size={13} style={{ color: C.muted }} />
                      )}
                    </div>
                    {/* Ürünler */}
                    {acik && ler.map((u, i) => (
                      <UrunSatir key={i} u={u} indent={coklu} />
                    ))}
                  </div>
                );
              })}
            </div>
          ) : (
            // Düz tablo
            <table style={{ width: "100%", borderCollapse: "collapse", fontFamily: "Rajdhani, sans-serif", fontSize: 12 }}>
              <thead>
                <tr>
                  {["UID", "GS1 (51 hane)", "Ürün Adı", "Lot", "SKT", "Ağırlık", "Depo"].map((b) => (
                    <th key={b} style={{ position: "sticky", top: 0, background: C.surface, padding: "9px 12px", textAlign: "left", fontFamily: "Orbitron, monospace", fontSize: 9, letterSpacing: "0.08em", color: C.muted, textTransform: "uppercase", borderBottom: `1px solid ${C.border}` }}>{b}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {urunler.map((u, i) => (
                  <tr key={i} style={{ borderBottom: `1px solid ${C.border}` }}>
                    <td style={{ padding: "7px 12px", fontFamily: "JetBrains Mono, monospace", fontSize: 10, color: `${C.blue}BB` }}>{u.uid}</td>
                    <td style={{ padding: "7px 12px", fontFamily: "JetBrains Mono, monospace", fontSize: 9, color: `${C.green}88`, maxWidth: 240, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={u.gs1}>{u.gs1}</td>
                    <td style={{ padding: "7px 12px", color: "#cbd5e1", maxWidth: 160, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{u.urun_adi || "-"}</td>
                    <td style={{ padding: "7px 12px", color: C.muted }}>{u.lot || "-"}</td>
                    <td style={{ padding: "7px 12px", color: C.muted }}>{u.skt || "-"}</td>
                    <td style={{ padding: "7px 12px", color: C.muted, textAlign: "right" }}>{u.agirlik ? `${u.agirlik} kg` : "-"}</td>
                    <td style={{ padding: "7px 12px", fontFamily: "Orbitron, monospace", fontSize: 9, color: `${C.purple}99` }}>{u.depo_kod || "-"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )
        ) : (
          // Bulunamayan listesi
          <div style={{ padding: 16, display: "flex", flexDirection: "column", gap: 6 }}>
            {toplam_bulunamayan === 0 ? (
              <div style={{ textAlign: "center", padding: "40px 0", color: C.muted, fontFamily: "Rajdhani, sans-serif" }}>
                Tüm UID'ler sistemde bulundu ✓
              </div>
            ) : (
              <>
                {detayli.length > 0 && (
                  <div style={{ marginBottom: 10, padding: 10, background: `${C.orange}11`, border: `1px solid ${C.orange}33`, borderRadius: 8 }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
                      <div style={{ color: C.orange, fontSize: 12, fontWeight: 700 }}>KAYITLI DEĞİL (MANUEL EKLENEBİLİR)</div>
                      <button
                        type="button"
                        onClick={() => {
                          const hepsiSecili = detayli.every(u => secilenManuel[u.uid]);
                          const yeniMap = {};
                          detayli.forEach(u => {
                            yeniMap[u.uid] = !hepsiSecili;
                          });
                          setSecilenManuel(prev => ({ ...prev, ...yeniMap }));
                        }}
                        style={{
                          background: "transparent",
                          border: `1px solid ${C.orange}44`,
                          color: C.orange,
                          borderRadius: 6,
                          padding: "2px 10px",
                          fontFamily: "Rajdhani, sans-serif",
                          fontSize: 11,
                          fontWeight: 700,
                          cursor: "pointer",
                          transition: "all 0.2s"
                        }}
                      >
                        {detayli.every(u => secilenManuel[u.uid]) ? "Seçimi Kaldır" : "Hepsini Seç"}
                      </button>
                    </div>
                    <div style={{ fontSize: 11, color: C.muted, marginBottom: 8 }}>Aşağıdaki ürünler sistemde bulunamadı ancak GS1 barkodları okunabildiği için manuel olarak çıkışa dahil edebilirsiniz.</div>
                    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                      {detayli.map((u, i) => {
                        const secili = !!secilenManuel[u.uid];
                        return (
                          <label key={`d-${i}`} style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 12px", background: secili ? `${C.green}15` : `${C.surface}`, border: `1px solid ${secili ? C.green : C.border}`, borderRadius: 7, cursor: "pointer", transition: "all 0.2s" }}>
                            <input 
                              type="checkbox" 
                              checked={secili} 
                              onChange={(e) => setSecilenManuel(p => ({...p, [u.uid]: e.target.checked}))} 
                              style={{ accentColor: C.green, transform: "scale(1.2)" }} 
                            />
                            <span style={{ fontFamily: "JetBrains Mono, monospace", fontSize: 11, color: secili ? C.green : `${C.orange}BB` }}>{u.uid}</span>
                            <span style={{ fontFamily: "Rajdhani, sans-serif", fontSize: 11, color: secili ? "#fff" : C.muted }}>{u.urun_adi} - {u.agirlik} kg</span>
                          </label>
                        );
                      })}
                    </div>
                  </div>
                )}
                
                {bulunamayan.length > 0 && (
                  <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                    <div style={{ color: C.red, fontSize: 12, fontWeight: 700, marginTop: 8, marginBottom: 4 }}>BİLİNMEYEN BARKODLAR</div>
                    {bulunamayan.map((uid, i) => (
                      <div key={`b-${i}`} style={{ display: "flex", alignItems: "center", gap: 8, padding: "8px 12px", background: `${C.red}08`, border: `1px solid ${C.red}22`, borderRadius: 7 }}>
                        <XCircle size={13} style={{ color: C.red, flexShrink: 0 }} />
                        <span style={{ fontFamily: "JetBrains Mono, monospace", fontSize: 11, color: `${C.red}BB` }}>{uid}</span>
                        <span style={{ fontSize: 11, color: C.muted, marginLeft: "auto" }}>Sistemde bulunamadı ve okunamadı</span>
                      </div>
                    ))}
                  </div>
                )}
              </>
            )}
          </div>
        )}
      </div>

      {/* ── Alt butonlar ── */}
      <div style={{ display: "flex", gap: 10 }}>
        <button onClick={geriDon} style={{ display: "flex", alignItems: "center", gap: 5, padding: "9px 16px", border: `1px solid ${C.border}`, borderRadius: 8, background: "transparent", color: C.muted, fontFamily: "Rajdhani, sans-serif", fontSize: 13, fontWeight: 600, cursor: "pointer" }}>
          ← Geri Dön
        </button>
        <div style={{ flex: 1 }} />
        <button
          onClick={() => cikisOnayla(secilenManuel)}
          disabled={yukleniyor || (urunler.length === 0 && secilenManuelSayisi === 0)}
          style={{
            display: "flex", alignItems: "center", gap: 8, padding: "11px 28px",
            border: `1px solid ${C.red}55`, borderRadius: 9,
            background: `${C.red}12`, color: C.red,
            fontFamily: "Orbitron, monospace", fontSize: 12, fontWeight: 600, letterSpacing: "0.06em",
            cursor: yukleniyor || (urunler.length === 0 && secilenManuelSayisi === 0) ? "not-allowed" : "pointer",
            opacity: yukleniyor || (urunler.length === 0 && secilenManuelSayisi === 0) ? 0.35 : 1,
          }}
        >
          {yukleniyor
            ? <Loader2 size={16} style={{ animation: "spin 1s linear infinite" }} />
            : <PackageMinus size={16} />
          }
          ÇIKIŞI ONAYLA — {urunler.length + secilenManuelSayisi} ÜRÜN
        </button>
      </div>
    </div>
  );
}

// ── Ürün satırı (gruplu görünüm) ──
function UrunSatir({ u, indent }) {
  return (
    <div style={{
      display: "flex", alignItems: "center", gap: 8,
      padding: `6px 12px 6px ${indent ? 28 : 12}px`,
      borderTop: `1px solid ${C.border}`,
    }}>
      <span style={{ fontFamily: "JetBrains Mono, monospace", fontSize: 10, color: `${C.blue}99`, width: 100, flexShrink: 0 }}>
        {u.uid}
      </span>
      <span style={{ fontFamily: "JetBrains Mono, monospace", fontSize: 9, color: `${C.green}66`, flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={u.gs1}>
        {u.gs1}
      </span>
      <span style={{ fontFamily: "Rajdhani, sans-serif", fontSize: 11, color: "#94a3b8", width: 120, flexShrink: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
        {u.urun_adi}
      </span>
      <span style={{ fontFamily: "Rajdhani, sans-serif", fontSize: 11, color: C.muted, width: 55, flexShrink: 0, textAlign: "right" }}>
        {u.agirlik ? `${u.agirlik} kg` : "-"}
      </span>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════
// ADIM 3 — TAMAMLANDI
// ═══════════════════════════════════════════════════════════════

function TamamlandiAdimi({ sonuc, sebep, gs1Indir, indirildi, sifirla }) {
  const [gs1Acik, setGs1Acik] = useState(false);

  if (!sonuc) return null;
  const basarili = sonuc.basarili;

  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 20, height: "100%" }}>

      {/* Sonuç ikonu */}
      <div style={{
        width: 80, height: 80, borderRadius: "50%",
        border: `2px solid ${basarili ? C.green : C.red}`,
        background: basarili ? `${C.green}10` : `${C.red}10`,
        display: "flex", alignItems: "center", justifyContent: "center",
        boxShadow: `0 0 40px ${basarili ? C.green : C.red}22`,
      }}>
        {basarili
          ? <CheckCircle2 size={36} style={{ color: C.green }} />
          : <XCircle size={36} style={{ color: C.red }} />
        }
      </div>

      {/* Mesaj */}
      <div style={{ textAlign: "center" }}>
        <div style={{ fontFamily: "Orbitron, monospace", fontSize: 14, letterSpacing: "0.08em", color: basarili ? C.green : C.red, marginBottom: 8 }}>
          {basarili ? "ÇIKIŞ TAMAMLANDI" : "HATA OLUŞTU"}
        </div>
        <div style={{ fontFamily: "Rajdhani, sans-serif", fontSize: 14, color: "#94a3b8", maxWidth: 400 }}>
          {sonuc.mesaj}
        </div>
      </div>

      {/* Özet kutucuklar */}
      {basarili && (
        <div style={{ display: "flex", gap: 12 }}>
          {[
            { l: "Çıkış No", v: sonuc.cikis_no, c: C.blue },
            { l: "Ürün Sayısı", v: sonuc.urun_sayisi, c: C.orange },
            { l: "Toplam Ağırlık", v: `${sonuc.toplam_agirlik} kg`, c: C.green },
            { l: "Sebep", v: sebep, c: C.purple },
          ].map(({ l, v, c }) => (
            <div key={l} style={{ background: C.panel, border: `1px solid ${c}22`, borderRadius: 10, padding: "12px 20px", textAlign: "center" }}>
              <div style={{ fontFamily: "Orbitron, monospace", fontSize: 8, color: C.muted, letterSpacing: "0.1em", textTransform: "uppercase", marginBottom: 4 }}>{l}</div>
              <div style={{ fontFamily: "Rajdhani, sans-serif", fontSize: 18, fontWeight: 700, color: c }}>{v}</div>
            </div>
          ))}
        </div>
      )}

      {/* GS1 listesi */}
      {basarili && sonuc.gs1_listesi?.length > 0 && (
        <div style={{ width: "100%", maxWidth: 600 }}>
          <button onClick={() => setGs1Acik(!gs1Acik)} style={{
            display: "flex", alignItems: "center", justifyContent: "space-between", width: "100%",
            padding: "9px 14px", background: C.panel, border: `1px solid ${C.border}`, borderRadius: 8,
            color: C.muted, fontFamily: "Rajdhani, sans-serif", fontSize: 12, fontWeight: 600, cursor: "pointer",
          }}>
            <span style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <FileText size={13} /> GS1 Listesi ({sonuc.gs1_listesi.length} satır — 51 hane)
            </span>
            {gs1Acik ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
          </button>

          {gs1Acik && (
            <div style={{ background: "#000", border: `1px solid ${C.green}22`, borderRadius: "0 0 8px 8px", padding: 12, maxHeight: 200, overflow: "auto" }}>
              {sonuc.gs1_listesi.slice(0, 50).map((line, i) => (
                <div key={i} style={{ fontFamily: "JetBrains Mono, monospace", fontSize: 10, color: `${C.green}BB`, lineHeight: 1.8 }}>
                  {line}
                </div>
              ))}
              {sonuc.gs1_listesi.length > 50 && (
                <div style={{ color: C.muted, fontSize: 11, marginTop: 4 }}>...+{sonuc.gs1_listesi.length - 50} satır daha</div>
              )}
            </div>
          )}

          <button onClick={gs1Indir} style={{
            marginTop: 8, display: "flex", alignItems: "center", justifyContent: "center", gap: 6, width: "100%",
            padding: "8px 0", border: `1px solid ${indirildi ? `${C.green}44` : C.border}`, borderRadius: 8,
            background: indirildi ? `${C.green}10` : "transparent",
            color: indirildi ? C.green : C.muted,
            fontFamily: "Rajdhani, sans-serif", fontSize: 12, fontWeight: 600, cursor: "pointer",
          }}>
            {indirildi ? <Check size={13} /> : <Download size={13} />}
            {indirildi ? "Masaüstü'ne Kaydedildi!" : "GS1 Listesini TXT İndir"}
          </button>
        </div>
      )}

      <button onClick={sifirla} style={{ padding: "9px 24px", border: `1px solid ${C.border}`, borderRadius: 8, background: "transparent", color: C.muted, fontFamily: "Rajdhani, sans-serif", fontSize: 13, fontWeight: 600, cursor: "pointer" }}>
        Yeni İşlem Başlat
      </button>
    </div>
  );
}