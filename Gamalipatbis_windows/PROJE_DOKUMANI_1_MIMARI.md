# GAMALI PATBİS — Proje Dokümantasyonu (Bölüm 1: Mimari)

## 1. Genel Bakış

**GAMALI PATBİS**, Özaltın İnşaat bünyesindeki patlayıcı madde depolarının T.C. İçişleri Bakanlığı PATBİS sistemine uyumlu envanter takibini sağlayan masaüstü otomasyon yazılımıdır.

- **Şirket:** GAMALI NEXUS
- **Sürüm:** v1.0.0
- **Lisans:** UNLICENSED (Kurumsal)
- **Platform:** Windows (Tauri 2 masaüstü uygulaması)

## 2. Teknoloji Yığını

| Katman | Teknoloji | Sürüm |
|--------|-----------|-------|
| Desktop Shell | Tauri 2 (Rust) | 2.x |
| Frontend | React 19 + Vite 8 | 19.2.6 / 8.0.12 |
| Backend Logic | Python 3 (JSON-RPC over stdin/stdout) | 3.x |
| Veritabanı | SQLite (WAL mode) | - |
| İkonlar | lucide-react | 1.14.0 |
| Fontlar | Google Fonts (Orbitron + Rajdhani) | - |
| Dosya Dialog | @tauri-apps/plugin-dialog | 2.7.1 |
| Drive Yedek | google-api-python-client + OAuth2 | 2.x |
| Excel Rapor | openpyxl | - |

## 3. Dizin Yapısı

```
Gamalipatbis_windows/
├── index.html                    # Vite giriş HTML
├── package.json                  # Node bağımlılıkları
├── vite.config.js                # Vite ayarları (port:1420)
├── requirements.txt              # Python bağımlılıkları
├── patbis_config.json            # Admin şifre hash, Drive ayarları
├── GUNCELLEME_REHBERI.md         # Güncelleme rehberi
│
├── src/                          # React Frontend
│   ├── main.jsx                  # ReactDOM entry
│   ├── App.jsx                   # Ana layout + routing + HakkindaModal
│   ├── styles/
│   │   └── globals.css           # Cyberpunk V2.0 tema (CSS değişkenleri)
│   ├── hooks/
│   │   └── usePython.js          # React↔Python köprüsü (+ mock data)
│   ├── components/
│   │   ├── Sidebar.jsx           # Sol menü (nav + profil + hakkında + çıkış)
│   │   ├── Header.jsx            # Üst bar (başlık + bridge durumu + saat)
│   │   ├── StatusCard.jsx        # Dashboard istatistik kartı
│   │   └── HakkindaModal.jsx     # Hakkında popup (sürüm + güncelleme kontrol)
│   └── pages/
│       ├── Login.jsx             # Şifre ile giriş ekranı
│       ├── Dashboard.jsx         # Ana sayfa (depo özeti + son yüklemeler)
│       ├── StokYukle.jsx         # XML+TXT dosya yükleme (3 adımlı wizard)
│       ├── BarkodSorgula.jsx     # UID ile hiyerarşik barkod sorgulama
│       ├── StokSayim.jsx         # Stok sayım ve karşılaştırma
│       ├── StokCikis.jsx         # Stok çıkış (patlatma) işlemleri
│       ├── Raporlar.jsx          # Rapor oluşturma arayüzü
│       ├── Rapor.jsx             # Rapor bileşeni
│       ├── DriveYedek.jsx        # Google Drive yedekleme arayüzü
│       └── Ayarlar.jsx           # Personel CRUD + sistem ayarları
│
├── src-python/                   # Python Backend
│   ├── bridge.py                 # Ana JSON-RPC köprüsü (2176 satır)
│   ├── patbis_config.json        # Config dosyası
│   ├── DB/
│   │   └── gamalipatbis.db       # SQLite veritabanı
│   └── core/
│       ├── __init__.py
│       ├── drive_manager.py      # Google Drive OAuth2 + yedekleme
│       ├── db_manager.py         # Eski DB yöneticisi (legacy)
│       ├── ck65_parser.py        # CK65 barkod TXT parser
│       ├── xml_parser.py         # FEEM XML parser
│       └── rapor_manager.py      # Excel rapor oluşturucu
│
├── src-tauri/                    # Tauri/Rust Katmanı
│   ├── Cargo.toml                # Rust bağımlılıkları
│   ├── tauri.conf.json           # Pencere, bundle, resource ayarları
│   ├── build.rs                  # Tauri build script
│   ├── capabilities/
│   │   └── default.json          # İzinler (shell, dialog)
│   └── src/
│       ├── main.rs               # Windows subsystem entry
│       └── lib.rs                # PythonBridge + Tauri commands
│
└── public/                       # Statik dosyalar
    ├── gamali-logo-full.png      # Tam logo
    └── gamali-logo-symbol.png    # Küçük logo
```

## 4. İletişim Mimarisi

```
React (JSX) ──usePython.call()──> Tauri invoke("python_cagir")
                                        │
                                        ▼
                                   Rust lib.rs
                                   PythonBridge.send()
                                        │
                                   stdin (JSON) ──────> Python bridge.py
                                        │                    │
                                   stdout (JSON) <────── handle() → dispatch()
                                        │
                                        ▼
                                   React state güncellenir
```

**Protokol:** JSON-RPC over stdin/stdout
- İstek: `{"id": 1, "method": "db.depolar", "params": {}}`
- Yanıt: `{"id": 1, "result": [...], "error": null}`

## 5. Veritabanı Şeması (SQLite)

### depolar
```sql
CREATE TABLE depolar (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    kod TEXT NOT NULL UNIQUE,       -- "33-2019-00419"
    ad TEXT NOT NULL,               -- "Özaltın 33-2019-00419"
    deleted_at TEXT
);
```

### stok_yuklemeler
```sql
CREATE TABLE stok_yuklemeler (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    depo_id INTEGER,
    depo_adi TEXT,
    gonderi_no TEXT,                -- "FEEMTR_186100"
    mesaj_id TEXT,
    gonderen TEXT,
    alici TEXT,
    teslim_tarihi TEXT,
    xml_dosya TEXT,
    txt_dosya TEXT,
    xml_yedek TEXT,                 -- Yedek kopya yolu
    txt_yedek TEXT,
    urun_sayisi INTEGER DEFAULT 0,
    cesit_sayisi INTEGER DEFAULT 0,
    toplam_agirlik REAL DEFAULT 0,
    yukleme_tarihi TEXT NOT NULL,
    deleted_at TEXT
);
```

### urun_cesitleri
```sql
CREATE TABLE urun_cesitleri (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    yukleme_id INTEGER NOT NULL,
    sid TEXT,                       -- "S62672"
    psn TEXT,
    urun_kodu TEXT,
    urun_adi TEXT,                  -- "N-DET LP 4 M 900 MS"
    lot TEXT,
    skt TEXT,
    uretim_tarihi TEXT,
    adet INTEGER DEFAULT 0,
    FOREIGN KEY (yukleme_id) REFERENCES stok_yuklemeler(id)
);
```

### urunler
```sql
CREATE TABLE urunler (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    yukleme_id INTEGER NOT NULL,
    uid TEXT NOT NULL,              -- Tekil barkod UID
    psn TEXT,
    sid TEXT,
    kod TEXT,
    paketleme TEXT,
    agirlik REAL DEFAULT 0,
    xml_eslesme INTEGER DEFAULT 0,
    urun_adi TEXT,
    lot TEXT,
    skt TEXT,
    deleted_at TEXT,
    parent_uid TEXT,                -- Üst koli/palet UID
    FOREIGN KEY (yukleme_id) REFERENCES stok_yuklemeler(id)
);
```

### birimler
```sql
CREATE TABLE birimler (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    yukleme_id INTEGER NOT NULL,
    uid TEXT NOT NULL UNIQUE,
    seviye TEXT,                    -- "02"=koli, "04"=palet
    adet INTEGER DEFAULT 0,
    parent_uid TEXT,
    FOREIGN KEY (yukleme_id) REFERENCES stok_yuklemeler(id)
);
```

### personeller
```sql
CREATE TABLE personeller (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    ad_soyad TEXT NOT NULL,
    unvan TEXT,
    aktif INTEGER DEFAULT 1,
    olusturma TEXT DEFAULT (datetime('now')),
    sifre TEXT                      -- Migration ile eklendi
);
```

## 6. Sabit Depolar

```python
[
    {"kod": "33-2019-00419", "ad": "Özaltın 33-2019-00419"},
    {"kod": "33-2019-00422", "ad": "Özaltın 33-2019-00422"},
    {"kod": "33-2019-00425", "ad": "Özaltın 33-2019-00425"},
    {"kod": "33-2019-00428", "ad": "Özaltın 33-2019-00428"},
    {"kod": "33-2019-00454", "ad": "Özaltın 33-2019-00454"},
    {"kod": "33-2019-00457", "ad": "Özaltın 33-2019-00457"},
]
```

## 7. CSS Tema Sistemi (Cyberpunk V2.0)

```css
:root {
  --bg-void: #020617;
  --bg-panel: #0f172a;
  --bg-surface: #1e293b;
  --neon-green: #00ff9d;
  --neon-blue: #00d4ff;
  --neon-purple: #bd00ff;
  --neon-orange: #ff9100;
  --neon-red: #ff0055;
  --accent: #4CAF50;
  --accent-dim: rgba(76, 175, 80, 0.15);
  --text-primary: #e2e8f0;
  --text-secondary: #94a3b8;
  --text-muted: #475569;
  --font-display: 'Orbitron', sans-serif;
  --font-body: 'Rajdhani', sans-serif;
  --transition-fast: 150ms ease;
  --transition-normal: 250ms ease;
  --glow-green: 0 0 20px rgba(0, 255, 157, 0.3);
  --glow-blue: 0 0 20px rgba(0, 212, 255, 0.3);
  --glow-red: 0 0 20px rgba(255, 0, 85, 0.3);
}
```

Animasyonlar: `fadeIn`, `pulse-glow`, `scan-line`, `spin`
