/**
 * GAMALI PATBİS — usePython Hook
 * 
 * React bileşenlerinden Python core'a erişim sağlar.
 * Tauri invoke → Rust bridge_baslat/python_cagir → Python bridge.py → core modülleri
 * 
 * Kullanım:
 *   const { call, ready, error, connect } = usePython();
 * 
 *   // Bağlantıyı başlat (App.jsx'te bir kere)
 *   await connect();
 * 
 *   // Herhangi bir sayfadan Python'a komut gönder
 *   const depolar = await call("db.depolar");
 *   const ozet = await call("db.depo_ozeti", { depo_kod: "D1" });
 *   const parsed = await call("ck65.parse", { dosya_yolu: "/path/to/file.txt" });
 */

import { useState, useCallback, useRef, useMemo } from "react";

// Tauri invoke — development'ta mock, Tauri'de gerçek
const invoke = window.__TAURI__?.core?.invoke || window.__TAURI__?.invoke;

// Tauri dışında çalışıyorsak (npm run dev, tarayıcıda test)
const isTauri = !!invoke;

// Mock data — Tauri olmadan frontend geliştirme için
const MOCK_RESPONSES = {
  "saglik": { durum: "OK", uygulama: "MOCK", versiyon: "2.1.0-dev" },
  "db.depolar": [
    { kod: "33-2019-00419", ad: "ÖZALTIN 33-2019-00419", aktif: 1 },
    { kod: "33-2019-00422", ad: "ÖZALTIN 33-2019-00422", aktif: 1 },
    { kod: "33-2019-00425", ad: "ÖZALTIN 33-2019-00425", aktif: 1 },
    { kod: "33-2019-00428", ad: "ÖZALTIN 33-2019-00428", aktif: 1 },
    { kod: "33-2019-00454", ad: "ÖZALTIN 33-2019-00454", aktif: 1 },
    { kod: "33-2019-00457", ad: "ÖZALTIN 33-2019-00457", aktif: 1 },
  ],
  "db.depo_ozeti": [
    { depo_kod: "33-2019-00419", stokta: 342, palet_sayisi: 12, kutu_sayisi: 86 },
    { depo_kod: "33-2019-00422", stokta: 218, palet_sayisi: 8, kutu_sayisi: 54 },
    { depo_kod: "33-2019-00425", stokta: 156, palet_sayisi: 6, kutu_sayisi: 38 },
    { depo_kod: "33-2019-00428", stokta: 89, palet_sayisi: 3, kutu_sayisi: 22 },
    { depo_kod: "33-2019-00454", stokta: 64, palet_sayisi: 2, kutu_sayisi: 16 },
    { depo_kod: "33-2019-00457", stokta: 31, palet_sayisi: 1, kutu_sayisi: 8 },
  ],
  "db.son_yuklemeler": [
    { id: 1, depo_kod: "33-2019-00419", dosya: "sevkiyat_001.xml", tarih: "2026-05-12 14:32:18", adet: 120 },
    { id: 2, depo_kod: "33-2019-00425", dosya: "sevkiyat_002.xml", tarih: "2026-05-12 14:30:22", adet: 85 },
    { id: 3, depo_kod: "33-2019-00422", dosya: "sevkiyat_003.xml", tarih: "2026-05-12 14:29:05", adet: 64 },
  ],
  "stok.ozet": {
    basarili: true,
    stats: { toplam_urun: 843, kutu_sayisi: 214, cesit_sayisi: 12, toplam_agirlik: 1240.5 },
    depolar: [
      { id: 1, kod: "33-2019-00419", ad: "ÖZALTIN 33-2019-00419", urun_sayisi: 342, agirlik: 420.5 },
      { id: 2, kod: "33-2019-00422", ad: "ÖZALTIN 33-2019-00422", urun_sayisi: 218, agirlik: 310.2 },
    ],
    cesitler: [
      { sid: "S62672", urun_adi: "N-DET LP 4 M 900 MS", adet: 120 },
      { sid: "S62700", urun_adi: "N-DET LP 4 M 3100 MS", adet: 85 },
    ],
    son_yuklemeler: [
      { id: 1, depo_adi: "ÖZALTIN 419", gonderi_no: "F-100", yukleme_tarihi: "2026-05-12T14:32:18", urun_sayisi: 120 },
    ]
  },
  "stok.sifirla": { basarili: true, mesaj: "MOCK: Stok sıfırlandı." },
  "stok.veritabani_sil": { basarili: true, mesaj: "MOCK: Veritabanı silindi." },
  "stok.cikis_onizle": { 
    basarili: true, 
    urunler: [{ uid: "21035887258", urun_adi: "MOCK ÜRÜN", agirlik: 0.037 }], 
    bulunamayan: [],
    ozet: { toplam_adet: 1, toplam_agirlik: 0.037 }
  },
  "stok.cikis": { basarili: true, mesaj: "MOCK: Çıkış yapıldı.", cikis_no: "MOCK-OUT-001", urun_sayisi: 1, toplam_agirlik: 0.037, gs1_listesi: ["MOCK-GS1"] },
  "stok.envanter": {
    basarili: true,
    data: [
      { id: 1, uid: "21035887258", urun_adi: "MOCK ÜRÜN", psn: "TR022", kod: "010", agirlik: 0.037, skt: "2027-04-28" }
    ],
    toplam: 1,
    sayfa: 1,
    limit: 100
  },
  "drive.durum": {
    basarili: true,
    bagli: false,
    klasor: "GAMALI_PATBIS_YEDEK",
    son_yedek: "2026-05-14",
    son_dosya: "gamalipatbis_20260514_120000.db",
    hata: "",
    drive_available: true
  },
  "drive.baglan": { basarili: true, mesaj: "MOCK: Drive bağlantısı kuruldu." },
  "drive.yedekle": { basarili: true, mesaj: "MOCK: Yedekleme tamamlandı.", dosya: "gamalipatbis_20260515_210000.db" },
  "drive.dosyalar": {
    basarili: true,
    dosyalar: [
      { id: "1", name: "gamalipatbis_20260514_120000.db", size: "12288", modifiedTime: "2026-05-14T12:00:00.000Z", webViewLink: "#" },
      { id: "2", name: "gamalipatbis_20260513_120000.db", size: "12288", modifiedTime: "2026-05-13T12:00:00.000Z", webViewLink: "#" },
    ]
  },
  "drive.login": { basarili: true, mesaj: "MOCK: Giriş başarılı." },
  "db.personeller": {
    basarili: true,
    personeller: [
      { id: 1, ad_soyad: "Ahmet Yılmaz", unvan: "Depo Sorumlusu", aktif: 1 },
      { id: 2, ad_soyad: "Mehmet Demir", unvan: "Operatör", aktif: 1 },
    ]
  },
  "db.personel_ekle": { basarili: true, mesaj: "MOCK: Personel eklendi." },
  "db.personel_guncelle": { basarili: true, mesaj: "MOCK: Personel güncellendi." },
  "db.personel_sil": { basarili: true, mesaj: "MOCK: Personel silindi." },
  "barkod.sorgula": {
    basarili: true,
    urun: {
      uid: "21035887258",
      sid: "S62672",
      kod: "010",
      agirlik: "0.037",
      urun_adi: "N-DET LP 4 M 900 MS",
      lot: "10260428026",
      skt: "2027-04-28",
    },
    yukleme: {
      id: 42,
      depo: "ÖZALTIN 33-2019-00422",
      depo_kod: "33-2019-00422",
      gonderi_no: "FEEMTR_186100",
      mesaj_id: "186100",
      gonderen: "NITROMAK KAYSERİ",
      alici: "ÖZALTIN İNŞAAT",
      teslim_tarihi: "2026-04-30",
      yukleme_tarihi: "2026-05-13 09:28:15",
    }
  },
};

export function usePython() {
  const [ready, setReady] = useState(!isTauri); // Mock modda hep hazır
  const [error, setError] = useState(null);
  const [connecting, setConnecting] = useState(false);
  const connectedRef = useRef(false);

  const connect = useCallback(async () => {
    if (connectedRef.current) return;
    
    if (!isTauri) {
      console.log("[PATBİS] Tauri yok — Mock mod aktif");
      setReady(true);
      connectedRef.current = true;
      return;
    }

    setConnecting(true);
    setError(null);

    try {
      const result = await invoke("bridge_baslat");
      console.log("[PATBİS] Bridge:", result);
      setReady(true);
      connectedRef.current = true;
    } catch (err) {
      console.error("[PATBİS] Bridge hatası:", err);
      setError(String(err));
      setReady(false);
    } finally {
      setConnecting(false);
    }
  }, []);

  const call = useCallback(async (method, params = {}) => {
    if (!isTauri) {
      // Mock mod — geliştirme kolaylığı
      console.log(`[PATBİS/MOCK] ${method}`, params);
      await new Promise((r) => setTimeout(r, 100 + Math.random() * 200)); // Simüle gecikme
      return MOCK_RESPONSES[method] || { durum: "MOCK", method, params };
    }

    try {
      return await invoke("python_cagir", { method, params });
    } catch (err) {
      console.error(`[PATBİS] ${method} hatası:`, err);
      throw err;
    }
  }, []);

  return useMemo(() => ({ 
    call, 
    ready, 
    error, 
    connecting, 
    connect, 
    isTauri 
  }), [call, ready, error, connecting, connect]);
}

export default usePython;
