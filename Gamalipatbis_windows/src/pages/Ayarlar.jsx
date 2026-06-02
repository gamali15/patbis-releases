/**
 * GAMALI PATBİS — Ayarlar Sayfası v3.0
 */
import React, { useState, useEffect } from "react";
import { 
  Settings, Trash2, AlertTriangle, CheckCircle2, 
  Database, RefreshCw, HardDrive, ShieldAlert,
  Info, Users, UserPlus, UserMinus, Edit2, X, Plus
} from "lucide-react";

export default function Ayarlar({ python }) {
  const [loading, setLoading] = useState(false);
  const [mesaj, setMesaj] = useState(null);
  const [aktifTab, setAktifTab] = useState("sistem"); // "sistem" | "personel" | "senkronize"

  // ── SİSTEM AYARLARI DURUMLARI ──
  const [onayBekleyen, setOnayBekleyen] = useState(null);

  // ── SENKRONİZASYON DURUMLARI ──
  const [sunucuDurumu, setSunucuDurumu] = useState(null);
  const [islemLoglari, setIslemLoglari] = useState([]);
  const [urunSorunlari, setUrunSorunlari] = useState([]);
  const [seciliFoto, setSeciliFoto] = useState(null);

  // ── PERSONEL DURUMLARI ──
  const [personeller, setPersoneller] = useState([]);
  const [formAcik, setFormAcik] = useState(false);
  const [duzenlemeId, setDuzenlemeId] = useState(null);
  const [formVeri, setFormVeri] = useState({ ad_soyad: "", unvan: "", sifre: "" });

  // ── Yükleme ──
  useEffect(() => {
    if (aktifTab === "personel") {
      personelYukle();
    } else if (aktifTab === "senkronize") {
      senkronizasyonVerileriYukle();
      const interval = setInterval(senkronizasyonVerileriYukle, 5000);
      return () => clearInterval(interval);
    }
  }, [aktifTab]);

  const senkronizasyonVerileriYukle = async () => {
    try {
      const respSunucu = await python.call("db.sunucu_durumu");
      if (respSunucu?.basarili) {
        setSunucuDurumu(respSunucu);
      }
      
      const respLog = await python.call("db.islem_gunlugu", { limit: 50 });
      if (respLog?.basarili) {
        setIslemLoglari(respLog.loglar || []);
      }
      
      const respSorun = await python.call("db.urun_sorunlari");
      if (respSorun?.basarili) {
        setUrunSorunlari(respSorun.sorunlar || []);
      }
    } catch (e) {
      console.error("Senkronizasyon verileri yükleme hatası", e);
    }
  };

  const personelYukle = async () => {
    setLoading(true);
    try {
      const resp = await python.call("db.personeller");
      if (resp?.basarili) setPersoneller(resp.personeller || []);
    } catch (e) {
      console.error("Personel yükleme hatası", e);
    } finally {
      setLoading(false);
    }
  };

  // ── Sistem İşlemleri ──
  const stokSifirlaHazirlik = (mod = "soft") => {
    let metin = "";
    if (mod === "soft") metin = "Mevcut stok verileri 'eski' olarak işaretlenecek ve envanterden gizlenecektir.";
    if (mod === "hard") metin = "Veritabanındaki tüm stok ve yükleme tabloları boşaltılacaktır.";
    if (mod === "aggressive") metin = "Veritabanı dosyası tamamen silinecektir. Bu işlem GERİ ALINAMAZ!";
    setOnayBekleyen({ mod, metin });
  };

  const stokSifirlaOnayla = async () => {
    if (!onayBekleyen) return;
    const { mod } = onayBekleyen;
    setOnayBekleyen(null);
    setLoading(true);
    setMesaj(null);
    try {
      const method = mod === "aggressive" ? "stok.veritabani_sil" : "stok.sifirla";
      const resp = await python.call(method, { mod });
      if (resp?.basarili) {
        setMesaj({ tip: "basari", metin: resp.mesaj });
        setTimeout(() => window.location.reload(), 2000);
      } else {
        setMesaj({ tip: "hata", metin: resp?.mesaj || "İşlem başarısız." });
      }
    } catch (err) {
      setMesaj({ tip: "hata", metin: "Bağlantı hatası: " + String(err) });
    } finally {
      setLoading(false);
    }
  };

  // ── Personel İşlemleri ──
  const personelKaydet = async (e) => {
    e.preventDefault();
    if (!formVeri.ad_soyad) return;
    setLoading(true);
    try {
      const method = duzenlemeId ? "db.personel_guncelle" : "db.personel_ekle";
      const params = duzenlemeId ? { id: duzenlemeId, ...formVeri } : formVeri;
      const resp = await python.call(method, params);
      if (resp?.basarili) {
        setMesaj({ tip: "basari", metin: resp.mesaj });
        setFormAcik(false);
        setDuzenlemeId(null);
        setFormVeri({ ad_soyad: "", unvan: "", sifre: "" });
        personelYukle();
      } else {
        setMesaj({ tip: "hata", metin: resp?.mesaj || "Kaydedilemedi." });
      }
    } catch (e) {
      setMesaj({ tip: "hata", metin: String(e) });
    } finally {
      setLoading(false);
    }
  };

  const personelSil = async (id) => {
    if (!window.confirm("Bu personeli silmek istediğinize emin misiniz?")) return;
    setLoading(true);
    try {
      const resp = await python.call("db.personel_sil", { id });
      if (resp?.basarili) {
        setMesaj({ tip: "basari", metin: resp.mesaj });
        personelYukle();
      }
    } catch (e) {
      setMesaj({ tip: "hata", metin: String(e) });
    } finally {
      setLoading(false);
    }
  };

  const duzenleAc = (p) => {
    setDuzenlemeId(p.id);
    setFormVeri({ ad_soyad: p.ad_soyad, unvan: p.unvan || "", sifre: "" });
    setFormAcik(true);
  };

  return (
    <div style={S.konteyner}>
      <div style={S.ustBar}>
        <div style={S.baslikGrup}>
          <Settings size={28} color="var(--neon-blue)" />
          <h2 style={S.baslik}>AYARLAR</h2>
        </div>

        {/* Tab Menü */}
        <div style={S.tabBar}>
          <button 
            onClick={() => setAktifTab("sistem")}
            style={{ ...S.tabBtn, ...(aktifTab === "sistem" ? S.tabBtnAktif : {}) }}
          >
            <Database size={16} /> Sistem
          </button>
          <button 
            onClick={() => setAktifTab("personel")}
            style={{ ...S.tabBtn, ...(aktifTab === "personel" ? S.tabBtnAktif : {}) }}
          >
            <Users size={16} /> Personel
          </button>
          <button 
            onClick={() => setAktifTab("senkronize")}
            style={{ ...S.tabBtn, ...(aktifTab === "senkronize" ? S.tabBtnAktif : {}) }}
          >
            <RefreshCw size={16} /> Terminal Senkronizasyonu
          </button>
        </div>
      </div>

      <div style={S.icerik}>
        {aktifTab === "sistem" && (
          <>
            <div style={S.kart}>
              <div style={S.kartBaslik}>
                <Database size={18} color="var(--neon-purple)" />
                <span>VERİTABANI VE STOK YÖNETİMİ</span>
              </div>
              <div style={S.kartIcerik}>
                <AyarItem 
                  ad="Stok Verilerini Gizle (Yumuşak)"
                  aciklama='Tüm ürünleri "eski" olarak işaretler. Veriler kalır ama görünmez.'
                  onClick={() => stokSifirlaHazirlik("soft")}
                  loading={loading}
                  label="GİZLE"
                  type="soft"
                />
                <AyarItem 
                  ad="Tabloları Boşalt (Hızlı)"
                  aciklama="Stok ve yükleme tablolarını tamamen temizler."
                  onClick={() => stokSifirlaHazirlik("hard")}
                  loading={loading}
                  label="TEMİZLE"
                  type="hard"
                />
                <AyarItem 
                  ad="Veritabanı Dosyasını Sil (Agresif)"
                  aciklama="Veritabanı dosyasını tamamen siler ve sıfırdan oluşturur."
                  onClick={() => stokSifirlaHazirlik("aggressive")}
                  loading={loading}
                  label="DOSYAYI SİL"
                  type="aggressive"
                />
              </div>
            </div>
            
            <div style={S.bilgiPanel}>
              <Info size={16} />
              <span><b>Önemli:</b> Temizlik işlemlerinden sonra sistem otomatik olarak yenilenecektir.</span>
            </div>
          </>
        )}

        {aktifTab === "personel" && (
          <div style={S.kart}>
            <div style={{ ...S.kartBaslik, justifyContent: "space-between" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                <Users size={18} color="var(--neon-green)" />
                <span>PERSONEL LİSTESİ</span>
              </div>
              <button 
                onClick={() => { setDuzenlemeId(null); setFormVeri({ ad_soyad: "", unvan: "" }); setFormAcik(true); }}
                style={S.yeniBtn}
              >
                <UserPlus size={16} /> YENİ PERSONEL
              </button>
            </div>
            
            <div style={S.kartIcerik}>
              {loading && personeller.length === 0 ? (
                <div style={S.loadingArea}><RefreshCw size={24} className="spin" /></div>
              ) : personeller.length === 0 ? (
                <div style={S.bosMesaj}>Kayıtlı personel bulunamadı.</div>
              ) : (
                <div style={S.personelGrid}>
                  {personeller.map(p => (
                    <div key={p.id} style={S.personelKart}>
                      <div style={S.pAvatar}>{p.ad_soyad[0]}</div>
                      <div style={S.pBilgi}>
                        <div style={S.pAd}>{p.ad_soyad}</div>
                        <div style={S.pUnvan}>{p.unvan || "Unvan Belirtilmedi"}</div>
                      </div>
                      <div style={S.pAksiyon}>
                        <button onClick={() => duzenleAc(p)} style={S.pIconBtn} title="Düzenle"><Edit2 size={14} /></button>
                        <button onClick={() => personelSil(p.id)} style={{ ...S.pIconBtn, color: "var(--neon-red)" }} title="Sil"><UserMinus size={14} /></button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {aktifTab === "senkronize" && (
          <div style={S.senkronizePanel}>
            {/* Üst Durum Özeti */}
            <div style={S.sunucuOzetiKart}>
              <div style={S.sunucuBaslik}>
                <div style={S.durumBadge}>
                  <span style={S.durumNokta}></span>
                  <span style={{ color: "var(--neon-green)" }}>SUNUCU AKTİF (PORT: {sunucuDurumu?.port || 5001})</span>
                </div>
                <button onClick={senkronizasyonVerileriYukle} style={S.refreshBtn} title="Yenile">
                  <RefreshCw size={14} className={loading ? "spin" : ""} /> Yenile
                </button>
              </div>
              <div style={S.ipListesi}>
                {sunucuDurumu?.ips?.map((ip, idx) => (
                  <div key={idx} style={S.ipAyar}>
                    <HardDrive size={14} color="var(--neon-blue)" />
                    <span>{ip.startsWith("100.") ? "Tailscale VPN" : "Yerel Ağ (LAN)"}: <b>{ip}</b></span>
                  </div>
                ))}
              </div>
            </div>

            {/* Orta Kısım: QR ve Canlı Log */}
            <div style={S.ortaGrup}>
              {/* Sol: QR Code */}
              <div style={S.qrKart}>
                <div style={S.kartBaslikText}>MOBİL CİHAZ EŞLEŞTİRME</div>
                <div style={S.qrAlan}>
                  {sunucuDurumu?.qr_data ? (
                    <img 
                      src={`https://api.qrserver.com/v1/create-qr-code/?size=180x180&color=00d4ff&bgcolor=0c101f&data=${encodeURIComponent(sunucuDurumu.qr_data)}`}
                      alt="Sync QR Code"
                      style={S.qrImage}
                    />
                  ) : (
                    <div style={S.qrPlaceholder}>QR Yükleniyor...</div>
                  )}
                </div>
                <div style={S.qrYazi}>
                  Honeywell CK65 terminalinizden bu QR kodu okutarak cihazı anında sunucuya bağlayabilirsiniz.
                </div>
              </div>

              {/* Canlı Terminal Log */}
              <div style={S.logKart}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "16px 20px 8px" }}>
                  <span style={{ letterSpacing: "1px", color: "var(--neon-green)", fontWeight: 700, fontSize: "0.85rem" }}>CANLI İŞLEM GÜNLÜĞÜ (AUDIT LOG)</span>
                  <span style={S.liveText}>● CANLI</span>
                </div>
                <div style={S.logEkran}>
                  {islemLoglari.length === 0 ? (
                    <div style={S.logBos}>İşlem logu bekleniyor...</div>
                  ) : (
                    islemLoglari.map((log) => (
                      <div key={log.id} style={S.logSatir}>
                        <span style={S.logTarih}>{log.tarih?.substring(11, 19) || "00:00:00"}</span>
                        <span style={S.logTip(log.islem_tipi)}>[{log.islem_tipi}]</span>
                        <span style={S.logPersonel}>{log.personel_ad}:</span>
                        <span style={S.logDetay}>{log.detay}</span>
                      </div>
                    ))
                  )}
                </div>
              </div>
            </div>

            {/* Alt Kısım: Hasarlı Ürün Fotoğraf Galerisi */}
            <div style={S.kart}>
              <div style={S.kartBaslik}>
                <AlertTriangle size={18} color="var(--neon-red)" />
                <span>HASARLI ÜRÜN VE TUTANAK GALERİSİ</span>
              </div>
              <div style={S.kartIcerik}>
                {urunSorunlari.length === 0 ? (
                  <div style={S.bosMesaj}>Hasarlı ürün bildirimi bulunmamaktadır.</div>
                ) : (
                  <div style={S.galeriGrid}>
                    {urunSorunlari.map((s) => {
                      const imgUrl = `http://localhost:${sunucuDurumu?.port || 5001}/api/dosyalar/${s.foto_yolu}`;
                      return (
                        <div key={s.id} style={S.galeriKart}>
                          <div style={S.galeriGorselKonteyner} onClick={() => setSeciliFoto(imgUrl)}>
                            <img src={imgUrl} alt={s.uid} style={S.galeriGorsel} onError={(e) => { e.target.src = "https://placehold.co/240x140?text=Gorsel+Bulunamadi"; }} />
                            <div style={S.galeriOverlay}>GÖRÜNTÜLE</div>
                          </div>
                          <div style={S.galeriDetay}>
                            <div style={S.galeriBaslik}>
                              <span style={S.galeriUid}>{s.uid}</span>
                              <span style={S.ciddiyetBadge(s.ciddiyet)}>{s.ciddiyet || "Normal"}</span>
                            </div>
                            <div style={S.galeriAciklama}>{s.aciklama || "Açıklama belirtilmedi."}</div>
                            <div style={S.galeriAlt}>
                              <span>👤 {s.ekleyen_personel}</span>
                              <span>📅 {s.tarih?.substring(0, 10)}</span>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>

            {/* Fotoğraf Görüntüleme Modalı */}
            {seciliFoto && (
              <div style={S.modalOverlay} onClick={() => setSeciliFoto(null)}>
                <div style={S.fotoModal} onClick={(e) => e.stopPropagation()}>
                  <button onClick={() => setSeciliFoto(null)} style={S.fotoKapatBtn}><X size={24} /></button>
                  <img src={seciliFoto} alt="Hasar Detayı" style={S.fotoFull} />
                </div>
              </div>
            )}
          </div>
        )}

        {/* MODALLAR VE MESAJLAR */}
        {onayBekleyen && (
          <div style={S.modalOverlay}>
            <div style={S.modal}>
              <AlertTriangle size={32} color="var(--neon-orange)" style={{ marginBottom: 16 }} />
              <div style={S.modalBaslik}>EMİN MİSİNİZ?</div>
              <div style={S.modalMetin}>{onayBekleyen.metin}</div>
              <div style={S.modalButonlar}>
                <button style={S.modalIptal} onClick={() => setOnayBekleyen(null)}>İPTAL</button>
                <button style={S.modalOnay} onClick={stokSifirlaOnayla}>EVET, DEVAM ET</button>
              </div>
            </div>
          </div>
        )}

        {formAcik && (
          <div style={S.modalOverlay}>
            <div style={S.modal}>
              <div style={S.formBaslik}>
                {duzenlemeId ? "PERSONEL DÜZENLE" : "YENİ PERSONEL EKLE"}
                <button onClick={() => setFormAcik(false)} style={S.kapatBtn}><X size={18} /></button>
              </div>
              <form onSubmit={personelKaydet} style={S.form}>
                <div style={S.formGrup}>
                  <label style={S.formLabel}>Ad Soyad</label>
                  <input 
                    autoFocus
                    style={S.input} 
                    value={formVeri.ad_soyad}
                    onChange={e => setFormVeri({ ...formVeri, ad_soyad: e.target.value })}
                    placeholder="Örn: Ahmet Yılmaz"
                    required
                  />
                </div>
                <div style={S.formGrup}>
                  <label style={S.formLabel}>Unvan / Görev</label>
                  <input 
                    style={S.input} 
                    value={formVeri.unvan}
                    onChange={e => setFormVeri({ ...formVeri, unvan: e.target.value })}
                    placeholder="Örn: Depo Sorumlusu"
                  />
                </div>
                <div style={S.formGrup}>
                  <label style={S.formLabel}>Sistem Şifresi {duzenlemeId && "(Değiştirmek istemiyorsanız boş bırakın)"}</label>
                  <input 
                    type="password"
                    style={S.input} 
                    value={formVeri.sifre || ""}
                    onChange={e => setFormVeri({ ...formVeri, sifre: e.target.value })}
                    placeholder="Personel giriş şifresi"
                    required={!duzenlemeId}
                  />
                </div>
                <button type="submit" disabled={loading} style={S.kaydetBtn}>
                  {loading ? <RefreshCw size={18} className="spin" /> : <Plus size={18} />}
                  {duzenlemeId ? "GÜNCELLE" : "KAYDET"}
                </button>
              </form>
            </div>
          </div>
        )}

        {mesaj && (
          <div style={{ 
            ...S.mesajKutu, 
            background: mesaj.tip === "basari" ? "rgba(0, 255, 157, 0.1)" : "rgba(255, 0, 85, 0.1)",
            borderColor: mesaj.tip === "basari" ? "var(--neon-green)" : "var(--neon-red)",
            color: mesaj.tip === "basari" ? "var(--neon-green)" : "var(--neon-red)",
          }}>
            {mesaj.tip === "basari" ? <CheckCircle2 size={18} /> : <AlertTriangle size={18} />}
            <span style={{ flex: 1 }}>{mesaj.metin}</span>
            <button onClick={() => setMesaj(null)} style={S.mesajKapat}>✕</button>
          </div>
        )}

        <div style={S.altBilgi}>
          <HardDrive size={14} />
          <span>Mimarisi: JSON-RPC Bridge v2.3 | DB: gamalipatbis.db</span>
        </div>
      </div>
    </div>
  );
}

function AyarItem({ ad, aciklama, onClick, loading, label, type }) {
  const bStyle = type === "soft" ? S.butonSoft : type === "hard" ? S.butonHard : S.butonAggressive;
  return (
    <div style={S.ayarSatir}>
      <div style={S.ayarBilgi}>
        <div style={S.ayarAd}>{ad}</div>
        <div style={S.ayarAciklama}>{aciklama}</div>
      </div>
      <button style={{ ...S.buton, ...bStyle }} onClick={onClick} disabled={loading}>
        {loading ? <RefreshCw size={16} className="spin" /> : type === "aggressive" ? <ShieldAlert size={16} /> : <Trash2 size={16} />}
        {label}
      </button>
    </div>
  );
}

const S = {
  konteyner: { padding: "24px", display: "flex", flexDirection: "column", gap: 24, animation: "fadeIn 0.5s ease" },
  ustBar: { display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 20 },
  baslikGrup: { display: "flex", alignItems: "center", gap: 16 },
  baslik: { fontFamily: "var(--font-display)", fontSize: "1.5rem", fontWeight: 700, letterSpacing: "2px", color: "var(--text-primary)", margin: 0 },
  tabBar: { display: "flex", background: "rgba(255,255,255,0.03)", padding: 4, borderRadius: 10, border: "1px solid rgba(255,255,255,0.05)" },
  tabBtn: { 
    display: "flex", alignItems: "center", gap: 8, padding: "8px 16px", border: "none", borderRadius: 8, 
    background: "transparent", color: "var(--text-muted)", fontFamily: "var(--font-body)", fontWeight: 600, 
    fontSize: "0.85rem", cursor: "pointer", transition: "all 0.2s" 
  },
  tabBtnAktif: { background: "rgba(0, 212, 255, 0.1)", color: "var(--neon-blue)" },
  icerik: { display: "flex", flexDirection: "column", gap: 20, maxWidth: 850 },
  kart: { background: "var(--bg-panel)", borderRadius: "16px", border: "1px solid rgba(255,255,255,0.05)", overflow: "hidden", boxShadow: "0 8px 32px rgba(0,0,0,0.15)" },
  kartBaslik: { padding: "16px 20px", background: "rgba(255,255,255,0.02)", borderBottom: "1px solid rgba(255,255,255,0.05)", display: "flex", alignItems: "center", gap: 12, fontSize: "0.85rem", fontWeight: 600, letterSpacing: "1px" },
  kartIcerik: { padding: "24px" },
  ayarSatir: { display: "flex", justifyContent: "space-between", alignItems: "center", gap: 30, marginBottom: 20 },
  ayarBilgi: { flex: 1 },
  ayarAd: { fontSize: "0.95rem", fontWeight: 700, color: "var(--text-primary)", marginBottom: 4 },
  ayarAciklama: { fontSize: "0.8rem", color: "var(--text-muted)", lineHeight: 1.5 },
  buton: { padding: "10px 20px", borderRadius: "8px", border: "none", fontSize: "0.8rem", fontWeight: 700, display: "flex", alignItems: "center", gap: 8, cursor: "pointer", transition: "all 0.2s", whiteSpace: "nowrap" },
  butonSoft: { background: "rgba(255,255,255,0.05)", color: "var(--text-secondary)", border: "1px solid rgba(255,255,255,0.1)" },
  butonHard: { background: "rgba(189, 0, 255, 0.1)", color: "var(--neon-purple)", border: "1px solid rgba(189, 0, 255, 0.3)" },
  butonAggressive: { background: "rgba(255, 0, 85, 0.1)", color: "var(--neon-red)", border: "1px solid rgba(255, 0, 85, 0.3)" },
  yeniBtn: { display: "flex", alignItems: "center", gap: 8, padding: "8px 16px", background: "rgba(0, 255, 157, 0.1)", border: "1px solid rgba(0, 255, 157, 0.3)", borderRadius: 8, color: "var(--neon-green)", fontSize: "0.75rem", fontWeight: 700, cursor: "pointer", transition: "all 0.2s" },
  loadingArea: { display: "flex", justifyContent: "center", padding: 40, color: "var(--neon-blue)" },
  bosMesaj: { textAlign: "center", padding: 40, color: "var(--text-muted)", fontSize: "0.9rem", fontStyle: "italic" },
  personelGrid: { display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(240px, 1fr))", gap: 16 },
  personelKart: { display: "flex", alignItems: "center", gap: 12, padding: 12, background: "rgba(255,255,255,0.02)", borderRadius: 12, border: "1px solid rgba(255,255,255,0.05)" },
  pAvatar: { width: 36, height: 36, borderRadius: 8, background: "var(--accent-dim)", color: "var(--accent)", display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 700, fontSize: "1.1rem" },
  pBilgi: { flex: 1, minWidth: 0 },
  pAd: { fontSize: "0.9rem", fontWeight: 700, color: "#e2e8f0", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" },
  pUnvan: { fontSize: "0.75rem", color: "var(--text-muted)" },
  pAksiyon: { display: "flex", gap: 4 },
  pIconBtn: { background: "transparent", border: "none", color: "var(--text-muted)", padding: 6, borderRadius: 6, cursor: "pointer", transition: "all 0.2s" },
  modalOverlay: { position: "fixed", top: 0, left: 0, right: 0, bottom: 0, background: "rgba(0,0,0,0.85)", backdropFilter: "blur(4px)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000 },
  modal: { width: "400px", background: "var(--bg-panel)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: "16px", padding: "24px", display: "flex", flexDirection: "column", boxShadow: "0 20px 50px rgba(0,0,0,0.5)" },
  modalBaslik: { fontFamily: "var(--font-display)", fontSize: "1.2rem", fontWeight: 700, color: "var(--neon-orange)", marginBottom: 12, textAlign: "center" },
  modalMetin: { fontSize: "0.9rem", color: "var(--text-secondary)", lineHeight: 1.6, marginBottom: 24, textAlign: "center" },
  modalButonlar: { display: "flex", gap: 12 },
  modalIptal: { flex: 1, padding: "12px", borderRadius: "8px", border: "1px solid rgba(255,255,255,0.1)", background: "rgba(255,255,255,0.05)", color: "var(--text-primary)", fontWeight: 600, cursor: "pointer" },
  modalOnay: { flex: 1, padding: "12px", borderRadius: "8px", border: "none", background: "var(--neon-red)", color: "#fff", fontWeight: 700, cursor: "pointer" },
  formBaslik: { display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: "1rem", fontWeight: 700, color: "var(--text-primary)", marginBottom: 20, letterSpacing: "1px" },
  kapatBtn: { background: "transparent", border: "none", color: "var(--text-muted)", cursor: "pointer" },
  form: { display: "flex", flexDirection: "column", gap: 16 },
  formGrup: { display: "flex", flexDirection: "column", gap: 6 },
  formLabel: { fontSize: "0.75rem", fontWeight: 600, color: "var(--text-muted)", textTransform: "uppercase" },
  input: { background: "rgba(0,0,0,0.2)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 8, padding: "10px 14px", color: "#fff", fontSize: "0.9rem", outline: "none" },
  kaydetBtn: { marginTop: 8, display: "flex", alignItems: "center", justifyContent: "center", gap: 10, padding: "12px", background: "var(--neon-blue)", border: "none", borderRadius: 8, color: "#000", fontWeight: 800, cursor: "pointer", transition: "all 0.2s" },
  bilgiPanel: { padding: "16px", background: "rgba(0, 212, 255, 0.05)", border: "1px solid rgba(0, 212, 255, 0.1)", borderRadius: "12px", display: "flex", gap: 12, fontSize: "0.8rem", color: "var(--text-secondary)", lineHeight: 1.6 },
  mesajKutu: { padding: "16px", borderRadius: "12px", border: "1px solid", display: "flex", alignItems: "center", gap: 12, fontSize: "0.9rem", fontWeight: 600 },
  mesajKapat: { background: "none", border: "none", color: "inherit", cursor: "pointer", fontSize: 16 },
  altBilgi: { marginTop: 20, display: "flex", alignItems: "center", gap: 8, fontSize: "0.7rem", color: "var(--text-muted)", opacity: 0.5 },

  // ── SENKRONİZASYON YENİ STİLLERİ ──
  senkronizePanel: { display: "flex", flexDirection: "column", gap: 20 },
  sunucuOzetiKart: { background: "var(--bg-panel)", borderRadius: "16px", border: "1px solid rgba(255,255,255,0.05)", padding: "16px 20px", display: "flex", flexDirection: "column", gap: 12, boxShadow: "0 8px 32px rgba(0,0,0,0.15)" },
  sunucuBaslik: { display: "flex", justifyContent: "space-between", alignItems: "center" },
  durumBadge: { display: "flex", alignItems: "center", gap: 8, fontSize: "0.85rem", fontWeight: 700, letterSpacing: "1px" },
  durumNokta: { width: 8, height: 8, borderRadius: "50%", background: "var(--neon-green)", boxShadow: "0 0 10px var(--neon-green)" },
  refreshBtn: { display: "flex", alignItems: "center", gap: 6, padding: "6px 12px", background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 6, color: "var(--text-secondary)", fontSize: "0.75rem", fontWeight: 600, cursor: "pointer", transition: "all 0.2s" },
  ipListesi: { display: "flex", gap: 24, flexWrap: "wrap" },
  ipAyar: { display: "flex", alignItems: "center", gap: 8, fontSize: "0.8rem", color: "var(--text-secondary)" },
  ortaGrup: { display: "grid", gridTemplateColumns: "250px 1fr", gap: 20, alignItems: "stretch" },
  qrKart: { background: "var(--bg-panel)", borderRadius: "16px", border: "1px solid rgba(255,255,255,0.05)", padding: 20, display: "flex", flexDirection: "column", alignItems: "center", gap: 12, boxShadow: "0 8px 32px rgba(0,0,0,0.15)" },
  kartBaslikText: { fontSize: "0.8rem", fontWeight: 700, letterSpacing: "1px", color: "var(--text-muted)", alignSelf: "flex-start", textTransform: "uppercase" },
  qrAlan: { width: 196, height: 196, background: "#0c101f", border: "1px solid var(--accent-dim)", borderRadius: 12, display: "flex", alignItems: "center", justifyContent: "center", padding: 8, boxShadow: "inset 0 0 20px rgba(0,212,255,0.1)" },
  qrImage: { width: "100%", height: "100%", borderRadius: 6 },
  qrPlaceholder: { color: "var(--text-muted)", fontSize: "0.8rem", fontFamily: "monospace" },
  qrYazi: { fontSize: "0.7rem", color: "var(--text-muted)", textAlign: "center", lineHeight: 1.4 },
  logKart: { background: "var(--bg-panel)", borderRadius: "16px", border: "1px solid rgba(255,255,255,0.05)", display: "flex", flexDirection: "column", boxShadow: "0 8px 32px rgba(0,0,0,0.15)", minHeight: 280 },
  liveText: { fontSize: "0.7rem", fontWeight: 700, color: "var(--neon-green)", letterSpacing: "1px", display: "flex", alignItems: "center", gap: 6 },
  logEkran: { flex: 1, background: "rgba(0,0,0,0.4)", margin: "0 16px 16px", borderRadius: 8, border: "1px solid rgba(255,255,255,0.03)", padding: 12, fontFamily: "monospace", fontSize: "0.75rem", overflowY: "auto", display: "flex", flexDirection: "column", gap: 6, maxHeight: 220, textAlign: "left" },
  logBos: { color: "var(--text-muted)", fontStyle: "italic", textAlign: "center", marginTop: 80 },
  logSatir: { display: "flex", gap: 8, lineHeight: 1.4, color: "#a0aec0" },
  logTarih: { color: "var(--text-muted)" },
  logTip: (tip) => {
    let color = "var(--neon-blue)";
    if (tip === "SİLME") color = "var(--neon-red)";
    if (tip === "SYNC") color = "var(--neon-purple)";
    if (tip === "GİRİŞ") color = "var(--neon-green)";
    return { color, fontWeight: 700 };
  },
  logPersonel: { color: "var(--text-secondary)", fontWeight: 600 },
  logDetay: { color: "#e2e8f0", wordBreak: "break-all" },
  galeriGrid: { display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(240px, 1fr))", gap: 16 },
  galeriKart: { background: "rgba(255,255,255,0.02)", borderRadius: 12, border: "1px solid rgba(255,255,255,0.05)", overflow: "hidden", display: "flex", flexDirection: "column" },
  galeriGorselKonteyner: { width: "100%", height: 140, background: "rgba(0,0,0,0.2)", position: "relative", cursor: "pointer", overflow: "hidden" },
  galeriGorsel: { width: "100%", height: "100%", objectFit: "cover", transition: "all 0.3s" },
  galeriOverlay: { position: "absolute", top: 0, left: 0, right: 0, bottom: 0, background: "rgba(0,212,255,0.2)", display: "flex", alignItems: "center", justifyContent: "center", color: "#fff", fontWeight: 700, fontSize: "0.8rem", letterSpacing: "1px", opacity: 0, transition: "all 0.2s", backdropFilter: "blur(2px)" },
  galeriDetay: { padding: 12, display: "flex", flexDirection: "column", gap: 6 },
  galeriBaslik: { display: "flex", justifyContent: "space-between", alignItems: "center" },
  galeriUid: { fontSize: "0.85rem", fontWeight: 700, color: "var(--neon-blue)", fontFamily: "monospace" },
  ciddiyetBadge: (c) => {
    let bg = "rgba(0, 212, 255, 0.1)";
    let border = "1px solid rgba(0, 212, 255, 0.3)";
    let color = "var(--neon-blue)";
    if (c === "Yüksek" || c === "Kritik" || c === "Resmi") {
      bg = "rgba(255, 0, 85, 0.1)";
      border = "1px solid rgba(255, 0, 85, 0.3)";
      color = "var(--neon-red)";
    } else if (c === "Orta") {
      bg = "rgba(255, 170, 0, 0.1)";
      border = "1px solid rgba(255, 170, 0, 0.3)";
      color = "var(--neon-orange)";
    }
    return { padding: "2px 8px", borderRadius: 6, fontSize: "0.65rem", fontWeight: 700, background: bg, border, color, textTransform: "uppercase" };
  },
  galeriAciklama: { fontSize: "0.75rem", color: "var(--text-secondary)", lineHeight: 1.4, height: 38, overflow: "hidden", display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", textOverflow: "ellipsis" },
  galeriAlt: { display: "flex", justifyContent: "space-between", fontSize: "0.65rem", color: "var(--text-muted)", borderTop: "1px solid rgba(255,255,255,0.03)", paddingTop: 6, marginTop: 4 },
  fotoModal: { position: "relative", maxWidth: "90vw", maxHeight: "90vh", display: "flex", alignItems: "center", justifyContent: "center" },
  fotoKapatBtn: { position: "absolute", top: -40, right: 0, background: "transparent", border: "none", color: "#fff", cursor: "pointer" },
  fotoFull: { maxWidth: "100%", maxHeight: "85vh", objectFit: "contain", borderRadius: 8, border: "2px solid rgba(255,255,255,0.1)" }
};
