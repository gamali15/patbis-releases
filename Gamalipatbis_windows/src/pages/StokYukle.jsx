/**
 * GAMALI PATBİS — StokYukle Sayfası v3.0
 * ========================================
 * 3 Adımlı Wizard:
 *   Adım 1: Dosya Seç (XML + TXT otomatik + Depo)
 *   Adım 2: XML SummaryItem Özeti (ürün çeşitleri, lot, SKT, adet)
 *   Adım 3: TXT Ürünleri (UID, ağırlık) + XML eşleşme kontrolü + Kaydet
 */

import React, { useState, useRef, useEffect, useMemo, useCallback } from "react";
import { FileUp, FileText, Search, ChevronRight, ChevronLeft, CheckCircle, AlertTriangle, Package, Boxes, Save, RotateCcw, X, Warehouse, ChevronDown } from "lucide-react";

// ── Tauri / Bridge algılama — her çağrıda kontrol ──
function checkTauri() {
  return !!(window.__TAURI__?.core?.invoke);
}

async function tauriInvoke(cmd, args) {
  return window.__TAURI__?.core?.invoke(cmd, args);
}

// ── Yardımcı: Tauri dialog ile dosya seç ──
async function dosyaSecDialog(baslik, uzantilar) {
  if (!checkTauri()) return null;
  try {
    // Tauri v2 dialog API
    const { open } = await import("@tauri-apps/plugin-dialog");
    const selected = await open({
      title: baslik,
      filters: [{ name: baslik, extensions: uzantilar }],
      multiple: false,
    });
    if (!selected) return null;
    return typeof selected === "string" ? selected : selected.path;
  } catch {
    // Fallback: Tauri v1 dialog
    try {
      const { open } = window.__TAURI__.dialog;
      const selected = await open({
        title: baslik,
        filters: [{ name: baslik, extensions: uzantilar }],
        multiple: false,
      });
      return selected || null;
    } catch {
      return null;
    }
  }
}

// ── Python bridge çağrısı ──
async function pythonCall(method, params = {}) {
  if (!checkTauri()) return mockCall(method, params);
  return tauriInvoke("python_cagir", { method, params });
}

// ── Mock veriler (geliştirme için) ──
function mockCall(method, params) {
  return new Promise((resolve) => {
    setTimeout(() => {
      if (method === "db.depolar") {
        resolve([
          { id: 1, kod: "33-2019-00419", ad: "Özaltın 33-2019-00419" },
          { id: 2, kod: "33-2019-00422", ad: "Özaltın 33-2019-00422" },
          { id: 3, kod: "33-2019-00454", ad: "Özaltın 33-2019-00454" },
          { id: 4, kod: "33-2019-00457", ad: "Özaltın 33-2019-00457" },
        ]);
      } else if (method === "txt.bul") {
        resolve({ bulundu: true, yol: params.xml_yolu?.replace(".xml", ".txt"), tip: "otomatik" });
      } else if (method === "xml.parse") {
        // Mock SummaryItem verileri
        resolve({
          basarili: true,
          gonderi_bilgi: {
            mesaj_id: "186100",
            gonderi_no: "FEEMTR_186100",
            teslim_tarihi: "2026-04-30",
            gonderen: "NITROMAK KAYSERİ",
            alici: "Özaltın İnşaat",
          },
          summary_items: [
            { sid: "S53716", psn: "TR022", urun_kodu: "010", urun_adi: "N-DET EZDET 6 M 42/500 MS", lot: "10250416015", skt: "2026-04-16", uretim_tarihi: "2025-04-16", adet: 240 },
            { sid: "S53717", psn: "TR022", urun_kodu: "011", urun_adi: "N-DET LP 4 M 100 MS", lot: "10250415022", skt: "2026-04-15", uretim_tarihi: "2025-04-15", adet: 1200 },
            { sid: "S53718", psn: "TR022", urun_kodu: "012", urun_adi: "N-DET LP 4 M 300 MS", lot: "10250414033", skt: "2026-04-14", uretim_tarihi: "2025-04-14", adet: 800 },
            { sid: "S53719", psn: "TR022", urun_kodu: "013", urun_adi: "N-DET LP 4 M 500 MS", lot: "10250413044", skt: "2026-04-13", uretim_tarihi: "2025-04-13", adet: 600 },
            { sid: "S53720", psn: "TR022", urun_kodu: "020", urun_adi: "ANFO EMÜLSİYON KARTUŞ 60/500", lot: "10250412055", skt: "2026-04-12", uretim_tarihi: "2025-04-12", adet: 1620 },
          ],
          toplam_item: 4460,
          toplam_unit: 163,
        });
      } else if (method === "txt.parse") {
        // Mock TXT ürünleri
        const items = [];
        for (let i = 0; i < 50; i++) {
          items.push({
            uid: `2103131${8347 + i}`,
            psn: "TR022",
            sid: ["S53716", "S53717", "S53718", "S53719", "S53720"][i % 5],
            agirlik: (0.2 + Math.random() * 0.8).toFixed(4),
            kod: `24${1000 + i}`,
            paketleme: "20",
            xml_eslesme: true,
          });
        }
        resolve({
          basarili: true,
          urunler: items,
          toplam: items.length,
          eslesen: items.filter((u) => u.xml_eslesme).length,
          eslesmeyen: 0,
        });
      } else if (method === "stok.kaydet") {
        resolve({ basarili: true, mesaj: `${params.urun_sayisi} ürün "${params.depo_adi}" deposuna kaydedildi.` });
      } else {
        resolve({ basarili: false, mesaj: "Bilinmeyen komut" });
      }
    }, 600);
  });
}

// ══════════════════════════════════════════════════════════════════════════════
// ANA BİLEŞEN
// ══════════════════════════════════════════════════════════════════════════════

export default function StokYukle() {
  // ── Adım State ──
  const [adim, setAdim] = useState(1);

  // ── Adım 1 State ──
  const [xmlDosya, setXmlDosya] = useState(null);     // { name, path }
  const [txtDosya, setTxtDosya] = useState(null);      // { name, path }
  const [txtDurum, setTxtDurum] = useState("");         // "✅ Otomatik" vs
  const [depolar, setDepolar] = useState([]);
  const [aktifDepo, setAktifDepo] = useState("");
  const [hata, setHata] = useState("");
  const [yukleniyor, setYukleniyor] = useState(false);

  // ── Adım 2 State (XML SummaryItem) ──
  const [gonderiBilgi, setGonderiBilgi] = useState(null);
  const [summaryItems, setSummaryItems] = useState([]);
  const [toplamItem, setToplamItem] = useState(0);
  const [toplamUnit, setToplamUnit] = useState(0);

  // ── Adım 3 State (TXT Ürünler) ──
  const [txtUrunler, setTxtUrunler] = useState([]);
  const [txtToplam, setTxtToplam] = useState(0);
  const [txtEslesen, setTxtEslesen] = useState(0);
  const [txtEslesmeyen, setTxtEslesmeyen] = useState(0);
  const [aramaMetni, setAramaMetni] = useState("");
  const [seciliSid, setSeciliSid] = useState("hepsi");
  const [kaydediliyor, setKaydediliyor] = useState(false);
  const [kayitSonuc, setKayitSonuc] = useState(null);

  // Refs
  const xmlInputRef = useRef(null);
  const txtInputRef = useRef(null);

  // ── Depoları yükle ──
  useEffect(() => {
    pythonCall("db.depolar").then((d) => {
      if (Array.isArray(d)) {
        setDepolar(d);
      }
    });
  }, []);

  // ═══════════════════════════════════════════════════════════════════════════
  // ADIM 1: DOSYA SEÇ
  // ═══════════════════════════════════════════════════════════════════════════

  const xmlSec = async () => {
    setHata("");
    if (checkTauri()) {
      const yol = await dosyaSecDialog("XML Dosya Seç", ["xml"]);
      if (!yol) return;
      const isim = yol.split(/[\\/]/).pop();
      setXmlDosya({ name: isim, path: yol });

      // TXT otomatik bul
      try {
        const sonuc = await pythonCall("txt.bul", { xml_yolu: yol });
        if (sonuc?.bulundu) {
          const txtIsim = sonuc.yol.split(/[\\/]/).pop();
          setTxtDosya({ name: txtIsim, path: sonuc.yol });
          setTxtDurum(sonuc.tip === "otomatik" ? "✅ Otomatik bulundu" : "✅ Benzer isimli bulundu");
        } else {
          setTxtDosya(null);
          setTxtDurum("⚠️ TXT bulunamadı — manuel seçin");
        }
      } catch {
        setTxtDurum("⚠️ TXT arama hatası");
      }
    } else {
      // Browser fallback
      xmlInputRef.current?.click();
    }
  };

  const xmlSecFallback = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setXmlDosya({ name: file.name, path: file.name, _file: file });
    // Mock modda TXT otomatik bul
    pythonCall("txt.bul", { xml_yolu: file.name }).then((sonuc) => {
      if (sonuc?.bulundu) {
        setTxtDosya({ name: sonuc.yol.split(/[\\/]/).pop(), path: sonuc.yol });
        setTxtDurum("✅ Otomatik bulundu");
      } else {
        setTxtDurum("⚠️ TXT bulunamadı — manuel seçin");
      }
    });
  };

  const txtSec = async () => {
    setHata("");
    if (checkTauri()) {
      const yol = await dosyaSecDialog("TXT Dosya Seç", ["txt"]);
      if (!yol) return;
      setTxtDosya({ name: yol.split(/[\\/]/).pop(), path: yol });
      setTxtDurum("✅ Manuel seçildi");
    } else {
      txtInputRef.current?.click();
    }
  };

  const txtSecFallback = (e) => {
    const file = e.target.files?.[0];
    if (file) {
      setTxtDosya({ name: file.name, path: file.name, _file: file });
      setTxtDurum("✅ Manuel seçildi");
    }
  };

  // ── Adım 1 → 2: XML Parse ──
  const adim1Ileri = async () => {
    if (!xmlDosya) { setHata("XML dosyası seçiniz."); return; }
    if (!aktifDepo) { setHata("Depo seçiniz."); return; }
    setHata("");
    setYukleniyor(true);

    try {
      const sonuc = await pythonCall("xml.parse", { dosya_yolu: xmlDosya.path });
      if (!sonuc?.basarili) {
        setHata(sonuc?.mesaj || "XML parse hatası");
        setYukleniyor(false);
        return;
      }
      setGonderiBilgi(sonuc.gonderi_bilgi || null);
      setSummaryItems(sonuc.summary_items || []);
      setToplamItem(sonuc.toplam_item || 0);
      setToplamUnit(sonuc.toplam_unit || 0);
      setAdim(2);
    } catch (err) {
      setHata(`XML parse hatası: ${err}`);
    } finally {
      setYukleniyor(false);
    }
  };

  // ═══════════════════════════════════════════════════════════════════════════
  // ADIM 2 → 3: TXT Parse
  // ═══════════════════════════════════════════════════════════════════════════

  const adim2Ileri = async () => {
    if (!txtDosya) { setHata("TXT dosyası seçiniz."); return; }
    setHata("");
    setYukleniyor(true);

    try {
      const sonuc = await pythonCall("txt.parse", {
        txt_yolu: txtDosya.path,
        xml_yolu: xmlDosya.path,
      });
      if (!sonuc?.basarili) {
        setHata(sonuc?.mesaj || "TXT parse hatası");
        setYukleniyor(false);
        return;
      }
      setTxtUrunler(sonuc.urunler || []);
      setTxtToplam(sonuc.toplam || 0);
      setTxtEslesen(sonuc.eslesen || 0);
      setTxtEslesmeyen(sonuc.eslesmeyen || 0);
      setAdim(3);
    } catch (err) {
      setHata(`TXT parse hatası: ${err}`);
    } finally {
      setYukleniyor(false);
    }
  };

  // ═══════════════════════════════════════════════════════════════════════════
  // ADIM 3: KAYDET
  // ═══════════════════════════════════════════════════════════════════════════

  const kaydet = async () => {
    setKaydediliyor(true);
    setHata("");
    try {
      const depo = depolar.find((d) => String(d.id) === String(aktifDepo));
      const sonuc = await pythonCall("stok.kaydet", {
        xml_yolu: xmlDosya.path,
        txt_yolu: txtDosya.path,
        depo_id: aktifDepo,
        depo_adi: depo?.ad || aktifDepo,
        urun_sayisi: txtToplam,
      });
      if (sonuc?.basarili) {
        setKayitSonuc({ tip: "basari", mesaj: sonuc.mesaj });
      } else {
        setKayitSonuc({ tip: "hata", mesaj: sonuc?.mesaj || "Kayıt hatası" });
      }
    } catch (err) {
      setKayitSonuc({ tip: "hata", mesaj: String(err) });
    } finally {
      setKaydediliyor(false);
    }
  };

  const sifirla = () => {
    setAdim(1);
    setXmlDosya(null);
    setTxtDosya(null);
    setTxtDurum("");
    setAktifDepo("");
    setHata("");
    setGonderiBilgi(null);
    setSummaryItems([]);
    setToplamItem(0);
    setToplamUnit(0);
    setTxtUrunler([]);
    setTxtToplam(0);
    setTxtEslesen(0);
    setTxtEslesmeyen(0);
    setAramaMetni("");
    setSeciliSid("hepsi");
    setKayitSonuc(null);
  };

  // ── Adım 3: Filtrelenmiş ürünler ──
  const filtrelenmisUrunler = useMemo(() => {
    let liste = txtUrunler;
    if (seciliSid !== "hepsi") {
      liste = liste.filter((u) => u.sid === seciliSid);
    }
    if (aramaMetni.trim()) {
      const q = aramaMetni.trim().toLowerCase();
      liste = liste.filter(
        (u) =>
          u.uid?.toLowerCase().includes(q) ||
          u.sid?.toLowerCase().includes(q) ||
          u.kod?.toLowerCase().includes(q)
      );
    }
    return liste;
  }, [txtUrunler, seciliSid, aramaMetni]);

  // ── SID listesi (filtre chip'leri için) ──
  const sidListesi = useMemo(() => {
    const map = {};
    txtUrunler.forEach((u) => {
      if (!map[u.sid]) map[u.sid] = 0;
      map[u.sid]++;
    });
    return Object.entries(map).sort((a, b) => b[1] - a[1]);
  }, [txtUrunler]);

  // SummaryItem'dan SID → ürün adı map
  const sidAdMap = useMemo(() => {
    const m = {};
    summaryItems.forEach((si) => { m[si.sid] = si.urun_adi; });
    return m;
  }, [summaryItems]);

  // ═══════════════════════════════════════════════════════════════════════════
  // RENDER
  // ═══════════════════════════════════════════════════════════════════════════

  return (
    <div style={S.sayfa}>
      {/* ── Başlık ── */}
      <div style={S.baslik}>
        <div style={S.baslikSol}>
          <Package size={22} color="var(--neon-green)" />
          <h2 style={S.baslikMetin}>STOK YÜKLE</h2>
          {!checkTauri() && <span style={S.mockBadge}>MOCK MOD</span>}
        </div>
        {adim > 1 && (
          <button style={S.sifirlaBtn} onClick={sifirla}>
            <RotateCcw size={14} /> Sıfırla
          </button>
        )}
      </div>

      {/* ── Adım Göstergesi ── */}
      <div style={S.adimBar}>
        {[
          { no: 1, label: "Dosya Seç", icon: FileUp },
          { no: 2, label: "XML Özet", icon: Boxes },
          { no: 3, label: "Ürünler & Kayıt", icon: Save },
        ].map(({ no, label, icon: Icon }) => (
          <div key={no} style={{ ...S.adimItem, ...(adim >= no ? S.adimAktif : {}) }}>
            <div style={{ ...S.adimDaire, ...(adim > no ? S.adimTamam : adim === no ? S.adimAktifDaire : {}) }}>
              {adim > no ? <CheckCircle size={16} /> : <Icon size={16} />}
            </div>
            <span style={S.adimLabel}>{no}. {label}</span>
            {no < 3 && <ChevronRight size={14} style={{ opacity: 0.3, margin: "0 8px" }} />}
          </div>
        ))}
      </div>

      {/* ── Hata Mesajı ── */}
      {hata && (
        <div style={S.hataKutu}>
          <AlertTriangle size={16} />
          <span>{hata}</span>
          <button style={S.hataKapat} onClick={() => setHata("")}><X size={14} /></button>
        </div>
      )}

      {/* ══════════════════════════════════════════════════════════════════════ */}
      {/* ADIM 1: DOSYA SEÇ */}
      {/* ══════════════════════════════════════════════════════════════════════ */}
      {adim === 1 && (
        <div style={S.adimIcerik}>
          {/* XML Dosya */}
          <div style={S.dosyaSatir}>
            <label style={S.label}>XML Dosya</label>
            <div style={S.dosyaSecRow}>
              <button style={S.dosyaBtn} onClick={xmlSec}>
                <FileUp size={16} /> XML Seç
              </button>
              {xmlDosya && <span style={S.dosyaIsim}>{xmlDosya.name}</span>}
            </div>
            <input ref={xmlInputRef} type="file" accept=".xml" style={{ display: "none" }} onChange={xmlSecFallback} />
          </div>

          {/* TXT Dosya */}
          <div style={S.dosyaSatir}>
            <label style={S.label}>TXT Dosya (CK65 Barkod)</label>
            <div style={S.dosyaSecRow}>
              <button style={{ ...S.dosyaBtn, ...(txtDosya ? S.dosyaBtnOk : {}) }} onClick={txtSec}>
                <FileText size={16} /> TXT Seç
              </button>
              {txtDosya && <span style={S.dosyaIsim}>{txtDosya.name}</span>}
              {txtDurum && <span style={S.txtDurum}>{txtDurum}</span>}
            </div>
            <input ref={txtInputRef} type="file" accept=".txt" style={{ display: "none" }} onChange={txtSecFallback} />
          </div>

          {/* Depo Seçimi */}
          <div style={S.dosyaSatir}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", maxWidth: 400 }}>
              <label style={S.label}>Hedef Depo</label>
              {!aktifDepo && (
                <div style={{ 
                  fontSize: 10, color: "#ff0055", fontWeight: 800, fontFamily: "Rajdhani, sans-serif",
                  background: "rgba(255,0,85,0.15)", padding: "2px 8px", borderRadius: 4,
                  animation: "pulse 2s infinite"
                }}>
                  DEPO SEÇİNİZ!
                </div>
              )}
            </div>
            
            <div style={{ position: "relative", maxWidth: 400 }}>
              <div style={{ 
                position: "absolute", left: 12, top: "50%", transform: "translateY(-50%)", 
                color: aktifDepo ? "#00d4ff" : "#64748b", display: "flex", pointerEvents: "none" 
              }}>
                <Warehouse size={18} />
              </div>
              
              <select
                style={{ 
                  ...S.select,
                  width: "100%",
                  maxWidth: "100%",
                  paddingLeft: 40,
                  paddingRight: 40,
                  paddingTop: 12,
                  paddingBottom: 12,
                  borderRadius: 10,
                  appearance: "none",
                  border: `1px solid ${aktifDepo ? "rgba(0,212,255,0.4)" : "rgba(255,255,255,0.12)"}`,
                  boxShadow: aktifDepo ? "0 0 15px rgba(0,212,255,0.1)" : "none",
                  cursor: "pointer",
                  outline: "none"
                }}
                value={aktifDepo}
                onChange={(e) => setAktifDepo(e.target.value)}
              >
                <option value="" disabled style={{ background: "#020617", color: "#64748b" }}>— Depo Seçiniz —</option>
                {depolar.map((d) => (
                  <option key={d.id} value={d.id} style={{ background: "#020617" }}>{d.ad}</option>
                ))}
              </select>

              <div style={{ 
                position: "absolute", right: 12, top: "50%", transform: "translateY(-50%)", 
                color: "#64748b", display: "flex", pointerEvents: "none" 
              }}>
                <ChevronDown size={18} />
              </div>
            </div>
          </div>

          {/* İleri Butonu */}
          <div style={S.btnSatir}>
            <button
              style={{ ...S.ileriBtn, ...(yukleniyor ? S.disabled : {}) }}
              onClick={adim1Ileri}
              disabled={yukleniyor}
            >
              {yukleniyor ? "XML okunuyor..." : "İleri — XML Oku"}
              <ChevronRight size={18} />
            </button>
          </div>
        </div>
      )}

      {/* ══════════════════════════════════════════════════════════════════════ */}
      {/* ADIM 2: XML SUMMARYITEM ÖZETİ */}
      {/* ══════════════════════════════════════════════════════════════════════ */}
      {adim === 2 && (
        <div style={S.adimIcerik}>
          {/* Gönderi Bilgisi */}
          {gonderiBilgi && (
            <div style={S.gonderiPanel}>
              <div style={S.gonderiBaslik}>📦 Gönderi Bilgisi</div>
              <div style={S.gonderiGrid}>
                <GonderiAlani label="Gönderi No" deger={gonderiBilgi.gonderi_no} />
                <GonderiAlani label="Mesaj ID" deger={gonderiBilgi.mesaj_id} />
                <GonderiAlani label="Gönderen" deger={gonderiBilgi.gonderen} />
                <GonderiAlani label="Alıcı" deger={gonderiBilgi.alici} />
                <GonderiAlani label="Teslim Tarihi" deger={gonderiBilgi.teslim_tarihi} />
                <GonderiAlani label="Depo" deger={depolar.find((d) => String(d.id) === String(aktifDepo))?.ad || aktifDepo} />
              </div>
            </div>
          )}

          {/* İstatistik Kartları */}
          <div style={S.istatistikRow}>
            <StatKart label="Ürün Çeşidi" deger={summaryItems.length} renk="var(--neon-blue)" />
            <StatKart label="Toplam Ürün" deger={toplamItem} renk="var(--neon-green)" />
            <StatKart label="Koli (Unit)" deger={toplamUnit} renk="var(--neon-purple)" />
          </div>

          {/* SummaryItem Tablosu */}
          <div style={S.tabloKonteyner}>
            <div style={S.tabloBaslik}>
              <Boxes size={16} color="var(--neon-blue)" />
              <span>Ürün Çeşitleri (SummaryItem)</span>
            </div>
            <div style={S.tabloScroll}>
              <table style={S.tablo}>
                <thead>
                  <tr>
                    <th style={S.th}>#</th>
                    <th style={S.th}>Ürün Adı</th>
                    <th style={S.th}>Ürün Kodu</th>
                    <th style={S.th}>Lot/Batch</th>
                    <th style={S.th}>SKT</th>
                    <th style={S.th}>Üretim Tarihi</th>
                    <th style={{ ...S.th, textAlign: "right" }}>Adet</th>
                  </tr>
                </thead>
                <tbody>
                  {summaryItems.map((si, i) => (
                    <tr key={si.sid} style={i % 2 === 0 ? S.trCift : S.trTek}>
                      <td style={S.td}>{i + 1}</td>
                      <td style={{ ...S.td, ...S.urunAdi }}>{si.urun_adi}</td>
                      <td style={S.td}><code style={S.kod}>{si.urun_kodu}</code></td>
                      <td style={S.td}><code style={S.kod}>{si.lot}</code></td>
                      <td style={S.td}>{si.skt}</td>
                      <td style={S.td}>{si.uretim_tarihi}</td>
                      <td style={{ ...S.td, textAlign: "right", fontWeight: 700, color: "var(--neon-green)" }}>{si.adet?.toLocaleString("tr-TR")}</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr style={S.tfootRow}>
                    <td colSpan={6} style={{ ...S.td, fontWeight: 700, textAlign: "right" }}>TOPLAM</td>
                    <td style={{ ...S.td, textAlign: "right", fontWeight: 700, color: "var(--neon-green)", fontSize: "1rem" }}>
                      {summaryItems.reduce((t, si) => t + (si.adet || 0), 0).toLocaleString("tr-TR")}
                    </td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </div>

          {/* Navigasyon */}
          <div style={S.btnSatirCift}>
            <button style={S.geriBtn} onClick={() => setAdim(1)}>
              <ChevronLeft size={18} /> Geri
            </button>
            <button
              style={{ ...S.ileriBtn, ...(yukleniyor ? S.disabled : {}) }}
              onClick={adim2Ileri}
              disabled={yukleniyor}
            >
              {yukleniyor ? "TXT okunuyor..." : "İleri — TXT Oku & Eşleştir"}
              <ChevronRight size={18} />
            </button>
          </div>
        </div>
      )}

      {/* ══════════════════════════════════════════════════════════════════════ */}
      {/* ADIM 3: TXT ÜRÜNLERİ + EŞLEŞME + KAYDET */}
      {/* ══════════════════════════════════════════════════════════════════════ */}
      {adim === 3 && (
        <div style={S.adimIcerik}>
          {/* Eşleşme Durumu */}
          <div style={S.istatistikRow}>
            <StatKart label="TXT Toplam" deger={txtToplam} renk="var(--neon-blue)" />
            <StatKart label="XML Eşleşen" deger={txtEslesen} renk="var(--neon-green)" />
            <StatKart
              label="Eşleşmeyen"
              deger={txtEslesmeyen}
              renk={txtEslesmeyen > 0 ? "var(--neon-red)" : "var(--neon-green)"}
            />
          </div>

          {/* Eşleşmeyen uyarı */}
          {txtEslesmeyen > 0 && (
            <div style={S.uyariKutu}>
              <AlertTriangle size={16} />
              <span>{txtEslesmeyen} ürün XML'de bulunamadı! Kayıt öncesi kontrol edin.</span>
            </div>
          )}

          {/* Filtre: SID chip'leri + arama */}
          <div style={S.filtreRow}>
            <div style={S.chipRow}>
              <button
                style={{ ...S.chip, ...(seciliSid === "hepsi" ? S.chipAktif : {}) }}
                onClick={() => setSeciliSid("hepsi")}
              >
                Hepsi ({txtToplam})
              </button>
              {sidListesi.map(([sid, adet]) => (
                <button
                  key={sid}
                  style={{ ...S.chip, ...(seciliSid === sid ? S.chipAktif : {}) }}
                  onClick={() => setSeciliSid(sid)}
                  title={sidAdMap[sid] || sid}
                >
                  {sidAdMap[sid]?.substring(0, 20) || sid} ({adet})
                </button>
              ))}
            </div>
            <div style={S.aramaKutu}>
              <Search size={14} color="#64748b" />
              <input
                style={S.aramaInput}
                placeholder="UID, SID veya kod ara..."
                value={aramaMetni}
                onChange={(e) => setAramaMetni(e.target.value)}
              />
            </div>
          </div>

          {/* Ürün Tablosu */}
          <div style={S.tabloKonteyner}>
            <div style={S.tabloBaslik}>
              <FileText size={16} color="var(--neon-green)" />
              <span>TXT Ürünleri ({filtrelenmisUrunler.length} / {txtToplam})</span>
            </div>
            <div style={{ ...S.tabloScroll, maxHeight: 400 }}>
              <table style={S.tablo}>
                <thead>
                  <tr>
                    <th style={S.th}>#</th>
                    <th style={S.th}>UID</th>
                    <th style={S.th}>Ürün Tipi (SID)</th>
                    <th style={S.th}>Kod</th>
                    <th style={{ ...S.th, textAlign: "right" }}>Ağırlık (kg)</th>
                    <th style={{ ...S.th, textAlign: "center" }}>XML Eşleşme</th>
                  </tr>
                </thead>
                <tbody>
                  {filtrelenmisUrunler.slice(0, 200).map((u, i) => (
                    <tr key={u.uid + i} style={i % 2 === 0 ? S.trCift : S.trTek}>
                      <td style={S.td}>{i + 1}</td>
                      <td style={S.td}><code style={S.kod}>{u.uid}</code></td>
                      <td style={S.td}>
                        <span style={S.sidBadge}>{sidAdMap[u.sid]?.substring(0, 25) || u.sid}</span>
                      </td>
                      <td style={S.td}><code style={S.kodSmall}>{u.kod}</code></td>
                      <td style={{ ...S.td, textAlign: "right", fontFamily: "monospace" }}>{u.agirlik}</td>
                      <td style={{ ...S.td, textAlign: "center" }}>
                        {u.xml_eslesme
                          ? <CheckCircle size={16} color="var(--neon-green)" />
                          : <AlertTriangle size={16} color="var(--neon-red)" />
                        }
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {filtrelenmisUrunler.length > 200 && (
                <div style={S.daha}>...ve {filtrelenmisUrunler.length - 200} ürün daha (ilk 200 gösterildi)</div>
              )}
            </div>
          </div>

          {/* Kayıt Sonucu */}
          {kayitSonuc && (
            <div style={kayitSonuc.tip === "basari" ? S.basariKutu : S.hataKutu}>
              {kayitSonuc.tip === "basari" ? <CheckCircle size={16} /> : <AlertTriangle size={16} />}
              <span>{kayitSonuc.mesaj}</span>
            </div>
          )}

          {/* Navigasyon */}
          <div style={S.btnSatirCift}>
            <button style={S.geriBtn} onClick={() => setAdim(2)}>
              <ChevronLeft size={18} /> Geri
            </button>
            {!kayitSonuc ? (
              <button
                style={{ ...S.kaydetBtn, ...(kaydediliyor ? S.disabled : {}) }}
                onClick={kaydet}
                disabled={kaydediliyor}
              >
                <Save size={18} />
                {kaydediliyor ? "Kaydediliyor..." : `${txtToplam} Ürünü Kaydet`}
              </button>
            ) : (
              <button style={S.ileriBtn} onClick={sifirla}>
                <RotateCcw size={16} /> Yeni Yükleme
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
// YARDIMCI BİLEŞENLER
// ══════════════════════════════════════════════════════════════════════════════

function GonderiAlani({ label, deger }) {
  return (
    <div style={S.gonderiAlani}>
      <span style={S.gonderiLabel}>{label}</span>
      <span style={S.gonderiDeger}>{deger || "—"}</span>
    </div>
  );
}

function StatKart({ label, deger, renk }) {
  return (
    <div style={S.statKart}>
      <div style={{ ...S.statDeger, color: renk }}>{typeof deger === "number" ? deger.toLocaleString("tr-TR") : deger}</div>
      <div style={S.statLabel}>{label}</div>
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
// STİLLER — Cyberpunk V2.0
// ══════════════════════════════════════════════════════════════════════════════

const S = {
  sayfa: {
    padding: "20px 24px",
    minHeight: "100%",
    fontFamily: "'Rajdhani', sans-serif",
    color: "#e2e8f0",
  },
  baslik: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 16,
  },
  baslikSol: {
    display: "flex",
    alignItems: "center",
    gap: 10,
  },
  baslikMetin: {
    fontFamily: "'Orbitron', sans-serif",
    fontSize: "1.1rem",
    fontWeight: 700,
    color: "#e2e8f0",
    margin: 0,
    letterSpacing: "0.05em",
  },
  mockBadge: {
    padding: "2px 8px",
    borderRadius: 4,
    fontSize: "0.65rem",
    fontWeight: 700,
    background: "rgba(255,145,0,0.15)",
    color: "#ff9100",
    border: "1px solid rgba(255,145,0,0.3)",
    letterSpacing: "0.08em",
  },
  sifirlaBtn: {
    display: "flex",
    alignItems: "center",
    gap: 6,
    background: "transparent",
    border: "1px solid rgba(255,255,255,0.12)",
    color: "#94a3b8",
    padding: "6px 14px",
    borderRadius: 6,
    fontSize: "0.8rem",
    cursor: "pointer",
    fontFamily: "'Rajdhani', sans-serif",
  },

  // ── Adım Göstergesi ──
  adimBar: {
    display: "flex",
    alignItems: "center",
    gap: 4,
    marginBottom: 20,
    padding: "12px 16px",
    background: "var(--bg-panel, #0f172a)",
    borderRadius: 8,
    border: "1px solid rgba(255,255,255,0.06)",
  },
  adimItem: {
    display: "flex",
    alignItems: "center",
    gap: 8,
    opacity: 0.4,
    transition: "opacity 0.2s",
  },
  adimAktif: { opacity: 1 },
  adimDaire: {
    width: 30,
    height: 30,
    borderRadius: "50%",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    background: "rgba(255,255,255,0.06)",
    color: "#64748b",
    border: "1px solid rgba(255,255,255,0.1)",
  },
  adimAktifDaire: {
    background: "rgba(0,255,157,0.12)",
    color: "var(--neon-green, #00ff9d)",
    borderColor: "var(--neon-green, #00ff9d)",
  },
  adimTamam: {
    background: "rgba(0,255,157,0.2)",
    color: "var(--neon-green, #00ff9d)",
    borderColor: "var(--neon-green, #00ff9d)",
  },
  adimLabel: {
    fontSize: "0.82rem",
    fontWeight: 600,
    whiteSpace: "nowrap",
  },

  // ── Adım İçerik ──
  adimIcerik: {
    display: "flex",
    flexDirection: "column",
    gap: 16,
  },

  // ── Dosya Seçimi ──
  dosyaSatir: { display: "flex", flexDirection: "column", gap: 6 },
  label: {
    fontSize: "0.78rem",
    fontWeight: 600,
    color: "#94a3b8",
    textTransform: "uppercase",
    letterSpacing: "0.06em",
  },
  dosyaSecRow: {
    display: "flex",
    alignItems: "center",
    gap: 10,
    flexWrap: "wrap",
  },
  dosyaBtn: {
    display: "flex",
    alignItems: "center",
    gap: 6,
    padding: "8px 16px",
    background: "var(--bg-panel, #0f172a)",
    border: "1px solid rgba(0,212,255,0.3)",
    borderRadius: 6,
    color: "var(--neon-blue, #00d4ff)",
    fontSize: "0.82rem",
    fontWeight: 600,
    cursor: "pointer",
    fontFamily: "'Rajdhani', sans-serif",
    transition: "all 0.15s",
  },
  dosyaBtnOk: {
    borderColor: "rgba(0,255,157,0.3)",
    color: "var(--neon-green, #00ff9d)",
  },
  dosyaIsim: {
    fontSize: "0.82rem",
    color: "#e2e8f0",
    background: "rgba(255,255,255,0.04)",
    padding: "4px 10px",
    borderRadius: 4,
    fontFamily: "monospace",
  },
  txtDurum: {
    fontSize: "0.75rem",
    color: "#94a3b8",
  },
  select: {
    padding: "8px 12px",
    background: "var(--bg-panel, #0f172a)",
    border: "1px solid rgba(255,255,255,0.12)",
    borderRadius: 6,
    color: "#e2e8f0",
    fontSize: "0.85rem",
    fontFamily: "'Rajdhani', sans-serif",
    maxWidth: 360,
  },

  // ── Butonlar ──
  btnSatir: { display: "flex", justifyContent: "flex-end", marginTop: 8 },
  btnSatirCift: { display: "flex", justifyContent: "space-between", marginTop: 8 },
  ileriBtn: {
    display: "flex",
    alignItems: "center",
    gap: 8,
    padding: "10px 24px",
    background: "rgba(0,255,157,0.1)",
    border: "1px solid var(--neon-green, #00ff9d)",
    borderRadius: 6,
    color: "var(--neon-green, #00ff9d)",
    fontSize: "0.88rem",
    fontWeight: 700,
    cursor: "pointer",
    fontFamily: "'Rajdhani', sans-serif",
    letterSpacing: "0.03em",
  },
  geriBtn: {
    display: "flex",
    alignItems: "center",
    gap: 6,
    padding: "10px 20px",
    background: "transparent",
    border: "1px solid rgba(255,255,255,0.12)",
    borderRadius: 6,
    color: "#94a3b8",
    fontSize: "0.85rem",
    fontWeight: 600,
    cursor: "pointer",
    fontFamily: "'Rajdhani', sans-serif",
  },
  kaydetBtn: {
    display: "flex",
    alignItems: "center",
    gap: 8,
    padding: "10px 28px",
    background: "rgba(0,212,255,0.12)",
    border: "1px solid var(--neon-blue, #00d4ff)",
    borderRadius: 6,
    color: "var(--neon-blue, #00d4ff)",
    fontSize: "0.9rem",
    fontWeight: 700,
    cursor: "pointer",
    fontFamily: "'Rajdhani', sans-serif",
  },
  disabled: { opacity: 0.4, pointerEvents: "none" },

  // ── Hata / Uyarı / Başarı Kutuları ──
  hataKutu: {
    display: "flex",
    alignItems: "center",
    gap: 10,
    padding: "10px 14px",
    background: "rgba(255,0,85,0.08)",
    border: "1px solid rgba(255,0,85,0.3)",
    borderRadius: 6,
    color: "var(--neon-red, #ff0055)",
    fontSize: "0.82rem",
    fontWeight: 600,
  },
  hataKapat: {
    marginLeft: "auto",
    background: "transparent",
    border: "none",
    color: "var(--neon-red, #ff0055)",
    cursor: "pointer",
    padding: 4,
  },
  uyariKutu: {
    display: "flex",
    alignItems: "center",
    gap: 10,
    padding: "10px 14px",
    background: "rgba(255,145,0,0.08)",
    border: "1px solid rgba(255,145,0,0.3)",
    borderRadius: 6,
    color: "var(--neon-orange, #ff9100)",
    fontSize: "0.82rem",
    fontWeight: 600,
  },
  basariKutu: {
    display: "flex",
    alignItems: "center",
    gap: 10,
    padding: "10px 14px",
    background: "rgba(0,255,157,0.08)",
    border: "1px solid rgba(0,255,157,0.3)",
    borderRadius: 6,
    color: "var(--neon-green, #00ff9d)",
    fontSize: "0.82rem",
    fontWeight: 600,
  },

  // ── Gönderi Panel ──
  gonderiPanel: {
    padding: "14px 18px",
    background: "var(--bg-panel, #0f172a)",
    borderRadius: 8,
    border: "1px solid rgba(255,255,255,0.06)",
  },
  gonderiBaslik: {
    fontFamily: "'Orbitron', sans-serif",
    fontSize: "0.78rem",
    fontWeight: 600,
    color: "var(--neon-blue, #00d4ff)",
    marginBottom: 10,
    letterSpacing: "0.04em",
  },
  gonderiGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fill, minmax(180px, 1fr))",
    gap: 10,
  },
  gonderiAlani: {
    display: "flex",
    flexDirection: "column",
    gap: 2,
  },
  gonderiLabel: {
    fontSize: "0.68rem",
    color: "#64748b",
    textTransform: "uppercase",
    letterSpacing: "0.06em",
  },
  gonderiDeger: {
    fontSize: "0.85rem",
    color: "#e2e8f0",
    fontWeight: 600,
  },

  // ── İstatistik Kartları ──
  istatistikRow: {
    display: "flex",
    gap: 12,
    flexWrap: "wrap",
  },
  statKart: {
    flex: "1 1 120px",
    padding: "14px 18px",
    background: "var(--bg-panel, #0f172a)",
    borderRadius: 8,
    border: "1px solid rgba(255,255,255,0.06)",
    textAlign: "center",
  },
  statDeger: {
    fontFamily: "'Orbitron', sans-serif",
    fontSize: "1.4rem",
    fontWeight: 800,
    lineHeight: 1.2,
  },
  statLabel: {
    fontSize: "0.72rem",
    color: "#64748b",
    fontWeight: 600,
    marginTop: 4,
    textTransform: "uppercase",
    letterSpacing: "0.06em",
  },

  // ── Tablo ──
  tabloKonteyner: {
    background: "var(--bg-panel, #0f172a)",
    borderRadius: 8,
    border: "1px solid rgba(255,255,255,0.06)",
    overflow: "hidden",
  },
  tabloBaslik: {
    display: "flex",
    alignItems: "center",
    gap: 8,
    padding: "10px 16px",
    borderBottom: "1px solid rgba(255,255,255,0.06)",
    fontFamily: "'Orbitron', sans-serif",
    fontSize: "0.75rem",
    fontWeight: 600,
    letterSpacing: "0.04em",
    color: "#94a3b8",
  },
  tabloScroll: {
    overflowX: "auto",
    overflowY: "auto",
    maxHeight: 320,
  },
  tablo: {
    width: "100%",
    borderCollapse: "collapse",
    fontSize: "0.8rem",
  },
  th: {
    padding: "8px 12px",
    textAlign: "left",
    fontWeight: 700,
    fontSize: "0.7rem",
    color: "#64748b",
    textTransform: "uppercase",
    letterSpacing: "0.06em",
    borderBottom: "1px solid rgba(255,255,255,0.08)",
    position: "sticky",
    top: 0,
    background: "var(--bg-panel, #0f172a)",
    zIndex: 1,
  },
  td: {
    padding: "7px 12px",
    borderBottom: "1px solid rgba(255,255,255,0.03)",
    verticalAlign: "middle",
  },
  trCift: { background: "transparent" },
  trTek: { background: "rgba(255,255,255,0.015)" },
  tfootRow: {
    background: "rgba(0,255,157,0.04)",
    borderTop: "1px solid rgba(0,255,157,0.15)",
  },
  urunAdi: {
    fontWeight: 600,
    color: "#e2e8f0",
    maxWidth: 300,
    whiteSpace: "nowrap",
    overflow: "hidden",
    textOverflow: "ellipsis",
  },
  kod: {
    background: "rgba(255,255,255,0.06)",
    padding: "2px 6px",
    borderRadius: 3,
    fontSize: "0.75rem",
    fontFamily: "monospace",
    color: "var(--neon-blue, #00d4ff)",
  },
  kodSmall: {
    background: "rgba(255,255,255,0.04)",
    padding: "1px 5px",
    borderRadius: 3,
    fontSize: "0.72rem",
    fontFamily: "monospace",
    color: "#94a3b8",
  },
  sidBadge: {
    display: "inline-block",
    padding: "2px 8px",
    borderRadius: 4,
    fontSize: "0.72rem",
    fontWeight: 600,
    background: "rgba(189,0,255,0.08)",
    color: "var(--neon-purple, #bd00ff)",
    border: "1px solid rgba(189,0,255,0.2)",
    maxWidth: 200,
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  },

  // ── Filtre ──
  filtreRow: {
    display: "flex",
    flexDirection: "column",
    gap: 10,
  },
  chipRow: {
    display: "flex",
    gap: 6,
    flexWrap: "wrap",
  },
  chip: {
    padding: "4px 12px",
    borderRadius: 20,
    fontSize: "0.72rem",
    fontWeight: 600,
    fontFamily: "'Rajdhani', sans-serif",
    background: "rgba(255,255,255,0.04)",
    border: "1px solid rgba(255,255,255,0.1)",
    color: "#94a3b8",
    cursor: "pointer",
    transition: "all 0.15s",
    whiteSpace: "nowrap",
  },
  chipAktif: {
    borderColor: "var(--neon-green, #00ff9d)",
    color: "var(--neon-green, #00ff9d)",
    background: "rgba(0,255,157,0.08)",
  },
  aramaKutu: {
    display: "flex",
    alignItems: "center",
    gap: 8,
    padding: "6px 12px",
    background: "rgba(255,255,255,0.04)",
    border: "1px solid rgba(255,255,255,0.1)",
    borderRadius: 6,
    maxWidth: 300,
  },
  aramaInput: {
    background: "transparent",
    border: "none",
    outline: "none",
    color: "#e2e8f0",
    fontSize: "0.82rem",
    fontFamily: "'Rajdhani', sans-serif",
    width: "100%",
  },
  daha: {
    textAlign: "center",
    padding: "10px",
    fontSize: "0.75rem",
    color: "#64748b",
    fontStyle: "italic",
  },
};