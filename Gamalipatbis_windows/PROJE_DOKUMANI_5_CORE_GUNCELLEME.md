# GAMALI PATBİS — Core Modülleri ve Drive Manager (Güncelleme Referansı)

## drive_manager.py — Tam Kod Referansı

### Sabitler ve Config
```python
SCOPES = ['https://www.googleapis.com/auth/drive.file']
CONFIG_DIR  = Path(os.environ.get("PATBIS_CONFIG_DIR", "."))
TOKEN_FILE  = CONFIG_DIR / "drive_token.json"
CREDS_FILE  = CONFIG_DIR / "drive_credentials.json"
CONFIG_FILE = CONFIG_DIR / "patbis_config.json"

DEFAULT_CONFIG = {
    "admin_password_hash": hashlib.sha256("GAMALI2026".encode()).hexdigest(),
    "drive_folder_name": "GAMALI_PATBIS_YEDEK",
    "drive_folder_id": None,
    "son_yedek_tarihi": None,
}
```

### Fonksiyonlar
- `config_yukle()` → dict: CONFIG_FILE'dan JSON oku, yoksa DEFAULT_CONFIG yaz ve döndür
- `config_kaydet(config)`: JSON olarak CONFIG_FILE'a yaz
- `sifre_kontrol(girilen)` → bool: SHA-256 hash karşılaştırması
- `sifre_degistir(yeni)`: Hash'i güncelle ve kaydet
- `drive_baglanti()` → service: OAuth2 akışı (token varsa refresh, yoksa InstalledAppFlow.run_local_server)
- `drive_bagli_mi()` → bool: Token dosyası var mı ve geçerli mi hızlı kontrol
- `drive_klasor_bul_veya_olustur(service, klasor_adi)` → folder_id: Kayıtlı ID kontrol → Drive'da ara → Yoksa oluştur
- `dosya_yukle(dosya_yolu, aciklama)` → {id, name, webViewLink}: Dosyayı Drive klasörüne yükle (DB ise tarih damgalı isim)
- `gunluk_yedek(db_yolu)` → {yapildi, mesaj}: Bugün zaten alındıysa atla
- `drive_dosyalari_listele(limit)` → list: Klasördeki dosyaları modifiedTime desc sırala

## HakkindaModal.jsx — Güncelleme Kontrol Mekanizması

```javascript
const SURUM = "1.0.0";
const GUNCELLEME_URL = "https://raw.githubusercontent.com/gamali15/patbis-releases/main/version.json";

// version.json formatı: {"surum":"1.0.1","notlar":"...","tarih":"...","zorunlu":false}

const guncellemeKontrol = async () => {
  const resp = await fetch(GUNCELLEME_URL, { cache: "no-store" });
  const data = await resp.json();
  const uzak = data.surum || data.version || "0.0.0";
  // Semver: [major,minor,patch] karşılaştır
  // Uzaktaki büyükse → "guncelleme_var" + yeniSurum
  // Aynı/küçükse → "guncel"
  // Hata → "hata" (sunucuya ulaşılamadı)
};
```

## Güncelleme Akışı (Her Sürümde)
1. `HakkindaModal.jsx` → `SURUM` değerini güncelle (örn: "1.0.1")
2. GitHub `gamali15/patbis-releases/version.json` → aynı numarayı yaz
3. `npm run tauri build` → EXE oluştur
4. EXE'yi dağıt

## Versiyon Numaralama
```
Major.Minor.Patch
  │      │      └── Bug fix / küçük iyileştirme
  │      └────── Yeni sayfa / özellik
  └────────── Büyük mimari değişiklik
```

## Sidebar NAV_ITEMS Yapısı

```javascript
const NAV_ITEMS = [
  { id: "dashboard",      icon: LayoutDashboard, label: "Dashboard" },
  { id: "stok_yukle",     icon: Upload,          label: "Stok Yükle" },
  { id: "barkod_sorgula", icon: ScanLine,        label: "Barkod Sorgula" },
  { id: "stok_sayim",     icon: ClipboardCheck,  label: "Stok Sayım" },
  { id: "patlatma",       icon: Bomb,            label: "Çıkış / Patlatma" },
  { id: "raporlar",       icon: BarChart3,        label: "Raporlar" },
  { id: "drive",          icon: HardDrive,       label: "Drive Yedek" },
];

const ADMIN_ITEMS = [
  { id: "ayarlar", icon: Settings, label: "Ayarlar" },
];
```

## Login Akışı
1. Uygulama açılır → `App.jsx` → `activeUser === null` → `Login.jsx` render
2. Login sayfası `db.personeller` çağırır → dropdown'ı doldurur
3. Kullanıcı personel seçer + şifre girer → `drive.login` çağrılır
4. Backend: personel seçildiyse personel şifresi kontrol, seçilmediyse admin şifre kontrol
5. Başarılı → `onLogin(kullanici)` → `activeUser` set → Ana uygulama render

## Tüm Dosya Listesi (Güncelleme İçin)

### Değişiklik yaparken dokunulacak dosyalar:
| İşlem | Dosyalar |
|-------|---------|
| Yeni backend komutu | `bridge.py` (fonksiyon + dispatch) |
| Yeni sayfa | `pages/Yeni.jsx` + `App.jsx` (import + PAGES) + `Sidebar.jsx` (NAV_ITEMS) |
| Yeni bileşen | `components/Yeni.jsx` + kullanan sayfa |
| DB şema değişikliği | `bridge.py` → `_db_baglanti()` (CREATE TABLE + migration ALTER) |
| Sürüm güncelleme | `HakkindaModal.jsx` (SURUM) + GitHub version.json + `package.json` + `Cargo.toml` + `tauri.conf.json` |
| Yeni Python paketi | `requirements.txt` |
| Yeni npm paketi | `package.json` |
| Tauri izin değişikliği | `capabilities/default.json` |
