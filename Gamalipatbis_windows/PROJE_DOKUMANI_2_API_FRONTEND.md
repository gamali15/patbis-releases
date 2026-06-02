# GAMALI PATBİS — Proje Dokümantasyonu (Bölüm 2: Backend API + Frontend)

## 8. Python Bridge API Referansı

Bridge `main()` fonksiyonu: Windows'ta UTF-8 encoding zorlar, `startup()` ile `{"ready":true}` gönderir, `sys.stdin`'den satır satır JSON okur, `handle()` → `dispatch()` → sonuç döner.

### Komut Listesi (method → fonksiyon)

| Method | Fonksiyon | Açıklama |
|--------|-----------|----------|
| `saglik` | inline | Durum kontrolü, versiyon bilgisi |
| `db.depolar` | `_depolar_getir()` | Depo listesi (eksik sabit depoları otomatik ekler) |
| `db.depo_ozeti` | `_depo_ozeti_getir()` | Her depo için stok, palet, kutu sayısı |
| `db.son_yuklemeler` | `_son_yuklemeler_getir(limit)` | Son XML/TXT yüklemeleri |
| `barkod.sorgula` | `_barkod_sorgula(uid)` | UID ile hiyerarşik ağaç sorgusu |
| `db.personeller` | `_personeller_getir()` | Aktif personel listesi |
| `db.personel_ekle` | `_personel_ekle(params)` | Yeni personel (ad_soyad, unvan, sifre) |
| `db.personel_guncelle` | `_personel_guncelle(params)` | Personel güncelle |
| `db.personel_sil` | `_personel_sil(params)` | Yumuşak silme (aktif=0) |
| `txt.bul` | `_txt_bul(xml_yolu)` | XML'e karşılık TXT dosyasını otomatik bul |
| `xml.parse` | `_xml_parse(dosya_yolu)` | FEEM XML parse (SummaryItem + gönderi bilgi + hiyerarşi) |
| `txt.parse` | `_txt_parse(txt_yolu, xml_yolu)` | TXT ürün parse + XML eşleşme |
| `stok.kaydet` | `_stok_kaydet(params)` | XML+TXT → DB kayıt (dosya yedekleme dahil) |
| `stok.ozet` | `_stok_ozet(params)` | Genel stok özeti (istatistikler + çeşitler + depolar) |
| `stok.sifirla` | `_stok_sifirla(params)` | Depo stokunu sıfırla |
| `stok.veritabani_sil` | `_stok_veritabani_sil()` | Tüm veritabanını sil |
| `stok.cikis_onizle` | `_stok_cikis_onizle(params)` | Çıkış önizleme (UID listesi ile) |
| `stok.cikis` | `_stok_cikis(params)` | Stok çıkış işlemi (soft delete) |
| `stok.envanter` | `_stok_envanter(params)` | Sayfalı envanter listesi |
| `stok.sayim_karsilastir` | `_stok_sayim_karsilastir(params)` | Sayım karşılaştırma (fazla/eksik) |
| `rapor.veri` | `_rapor_veri(params)` | Rapor verisi hazırla |
| `rapor.olustur` | `_rapor_olustur(params)` | Excel rapor oluştur (openpyxl) |
| `dosya.kaydet` | `_dosya_kaydet(params)` | Metin dosyası kaydet |
| `drive.durum` | `_drive_durum()` | Drive bağlantı durumu |
| `drive.baglan` | `_drive_baglan()` | Drive OAuth2 bağlantısı |
| `drive.yedekle` | `_drive_yedekle()` | DB'yi Drive'a yedekle |
| `drive.dosyalar` | `_drive_dosyalar()` | Drive'daki yedek dosyaları |
| `drive.login` | `_drive_login(params)` | Şifre doğrulama + personel girişi |

### Barkod Sorgulama Hiyerarşisi

Kullanıcı istekleri doğrultusunda ağaç, aranan UID'den başlar (yukarı çıkmaz):
- **Ürün UID aranırsa:** Sadece o ürün node döner, `ust_kutu` ve `ust_palet` alanları ile üst referanslar verilir
- **Koli UID aranırsa:** Koli + içindeki ürünler döner, `parent_uid` ile palet referansı verilir
- **Palet UID aranırsa:** Palet + koliler + ürünler tam ağaç döner
- **Lot numarası aranırsa:** O lot'a ait tüm ürünler sanal bir "Lot Grubu" altında gruplanır

## 9. Tauri Rust Katmanı

### lib.rs Yapısı

```rust
struct PythonBridge { child: Child, reader: BufReader<ChildStdout> }
struct AppState { bridge: Mutex<Option<PythonBridge>> }

// Komutlar:
#[tauri::command] fn bridge_baslat(...)  // Python sürecini başlat
#[tauri::command] fn python_cagir(...)   // method+params → Python → sonuç
#[tauri::command] fn saglik()            // Bridge olmadan çalışır

// Bridge yolu arama sırası:
// 1. resource_dir/_up_/src-python/bridge.py  (Production)
// 2. resource_dir/src-python/bridge.py       (Production alt)
// 3. current_dir/src-python/bridge.py        (Development)
// 4. current_dir/../src-python/bridge.py     (Development alt)

// Windows'ta CREATE_NO_WINDOW flag ile Python konsol penceresi gizlenir
```

### tauri.conf.json Özeti
- productName: "GAMALI PATBİS"
- identifier: "com.gamali.patbis"
- Pencere: 1280x800, min 960x600
- Bundle: MSI + NSIS, resources: `../src-python/**/*`
- CSP: null (kısıtlama yok)
- withGlobalTauri: true

### capabilities/default.json
İzinler: `core:default`, `shell:default`, `dialog:default`, `shell:allow-open`, `dialog:allow-open`, `dialog:allow-save`, `dialog:allow-message`

## 10. usePython Hook

```javascript
// Kullanım:
const { call, ready, error, connecting, connect, isTauri } = usePython();

// Bağlantı (App.jsx'te bir kere):
await connect();  // invoke("bridge_baslat") çağırır

// Herhangi bir sayfadan:
const depolar = await call("db.depolar");
const sonuc = await call("stok.kaydet", { depo_id: 1, xml_yolu: "..." });
```

- Tauri yoksa (tarayıcıda test) → MOCK_RESPONSES ile sahte veri döner
- Tauri varsa → `invoke("python_cagir", {method, params})` çağırır

## 11. Frontend Sayfa Detayları

### Login.jsx
- Personel seçimi (dropdown) + şifre girişi
- `drive.login` komutu ile doğrulama
- Yönetici (id=0) veya personel girişi
- Cyberpunk glassmorphism tasarım

### App.jsx — Ana Layout
- State: `activeUser`, `activePage`, `sidebarCollapsed`, `showAbout`
- Login guard: `activeUser` null ise Login göster
- Sayfa routing: PAGES objesi ile component eşleme
- Sidebar'a `onAboutClick` prop ile HakkindaModal tetikleme

### Sidebar.jsx
- NAV_ITEMS: Dashboard, Stok Yükle, Barkod Sorgula, Stok Sayım, Çıkış/Patlatma, Raporlar, Drive Yedek
- ADMIN_ITEMS: Ayarlar (sadece id=0 için)
- Alt kısım: Kullanıcı profili + HAKKINDA butonu + ÇIKIŞ YAP butonu
- Collapsed mode destekli (64px ↔ 220px)

### Header.jsx
- Merkez: Sayfa başlığı (uppercase, Orbitron font)
- Sağ: Bridge durumu (yeşil/kırmızı LED) + canlı saat + tarih
- Sol: Hamburger menü toggle

### Dashboard.jsx
- StatusCard'lar ile depo istatistikleri
- Son yüklemeler tablosu
- `db.depo_ozeti` ve `db.son_yuklemeler` API çağrıları

### StokYukle.jsx (3 Adımlı Wizard)
1. XML dosya seç → `xml.parse` → SummaryItem özeti göster + otomatik TXT bul
2. TXT dosya seç → `txt.parse` → Ürün listesi + XML eşleşme durumu
3. Depo seç → `stok.kaydet` → Kayıt tamamla

### BarkodSorgula.jsx
- UID arama kutusu + ağaç görünümü + detay paneli
- `AgacDugumu`: Recursive tree component, auto-expand
- `DetayPaneli`: Hiyerarşi konumu (üst koli/palet), akıllı fallback + pivot search
- `bulNode`: Tree traversal helper
- `handleJump`: Ağaçta yoksa `onSorgula` ile yeni sorgu tetikler

### StokSayim.jsx
- Barkod tarama ile sayım
- `stok.sayim_karsilastir` ile DB karşılaştırma (fazla/eksik analizi)

### StokCikis.jsx
- UID listesi ile çıkış önizleme (`stok.cikis_onizle`)
- Onay sonrası `stok.cikis` (soft delete)

### Raporlar.jsx + Rapor.jsx
- `rapor.veri` ile veri çekme
- `rapor.olustur` ile Excel dosya oluşturma (Masaüstüne kaydeder)

### DriveYedek.jsx
- Drive bağlantı durumu
- Manuel yedekleme tetikleme
- Drive'daki yedek dosyaları listeleme

### Ayarlar.jsx (Sadece Yönetici)
- Personel CRUD (ekle/düzenle/sil)
- Şifre yönetimi
- Stok sıfırlama / veritabanı silme

### HakkindaModal.jsx
- Sürüm: `const SURUM = "1.0.0"`
- Güncelleme kontrolü: GitHub `gamali15/patbis-releases` reposundaki `version.json`
- Semver karşılaştırma ile güncel/güncelleme var/hata durumu
- AMACLAR listesi (PATBİS Uyumluluğu, Hiyerarşik Stok, Depo Yönetimi, XML/TXT, Çevrimdışı)

## 12. Güncelleme Mekanizması

1. `HakkindaModal.jsx` → `SURUM` değerini güncelle
2. GitHub `gamali15/patbis-releases/version.json` → aynı sürüm numarası yaz
3. `npm run tauri build` → EXE derle
4. EXE'yi dağıt

```json
// version.json formatı:
{
  "surum": "1.0.1",
  "notlar": "Değişiklik açıklaması",
  "tarih": "2026-XX-XX",
  "zorunlu": false
}
```

## 13. Kurulum ve Çalıştırma

### Gereksinimler
- Node.js 18+, Rust (rustup), Python 3.10+
- Windows 10/11

### İlk Kurulum
```bash
npm install
pip install -r requirements.txt
```

### Geliştirme
```bash
npm run tauri:dev    # Tauri + Vite + Python bridge
```

### Production Build
```bash
npm run tauri:build  # → src-tauri/target/release/GAMALI PATBiS.exe
```

## 14. Kimlik Doğrulama

- Varsayılan admin şifre: `GAMALI2026`
- SHA-256 hash olarak `patbis_config.json`'da saklanır
- `drive_manager.sifre_kontrol()` ile doğrulanır
- Personeller de şifre ile giriş yapabilir (personeller tablosundaki `sifre` alanı)

## 15. Google Drive Entegrasyonu

- OAuth2 ile `drive_credentials.json` + `drive_token.json`
- Klasör: `GAMALI_PATBIS_YEDEK`
- DB dosyası tarih damgalı isimle yüklenir
- Günlük otomatik yedek desteği (aynı gün tekrar almaz)
