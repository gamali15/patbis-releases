# GAMALI PATBİS — Proje Dokümantasyonu (Bölüm 3: Konfigürasyon Dosyaları)

## 16. Temel Konfigürasyon Dosyaları

### package.json
```json
{
  "name": "gamali-patbis",
  "version": "2.1.0",
  "description": "GAMALI PATBİS — Patlayıcı Madde Takip Sistemi",
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "vite build",
    "preview": "vite preview",
    "tauri": "tauri",
    "tauri:dev": "tauri dev",
    "tauri:build": "tauri build"
  },
  "author": "GAMALI",
  "license": "UNLICENSED",
  "dependencies": {
    "@tauri-apps/plugin-dialog": "^2.7.1",
    "lucide-react": "^1.14.0",
    "react": "^19.2.6",
    "react-dom": "^19.2.6"
  },
  "devDependencies": {
    "@tauri-apps/api": "^2.11.0",
    "@tauri-apps/cli": "^2.11.1",
    "@vitejs/plugin-react": "^6.0.1",
    "vite": "^8.0.12"
  }
}
```

### vite.config.js
```javascript
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  clearScreen: false,
  server: {
    port: 1420,
    strictPort: true,
    watch: { ignored: ["**/src-tauri/**"] },
  },
});
```

### index.html
```html
<!DOCTYPE html>
<html lang="tr">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>GAMALI PATBİS</title>
    <link rel="preconnect" href="https://fonts.googleapis.com" />
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
    <link href="https://fonts.googleapis.com/css2?family=Orbitron:wght@400;500;600;700;800;900&family=Rajdhani:wght@300;400;500;600;700&display=swap" rel="stylesheet" />
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.jsx"></script>
  </body>
</html>
```

### Cargo.toml
```toml
[package]
name = "gamali-patbis"
version = "2.1.0"
description = "GAMALI PATBİS — Patlayıcı Madde Takip Sistemi"
authors = ["GAMALI"]
edition = "2021"

[lib]
name = "gamali_patbis_lib"
crate-type = ["lib", "cdylib", "staticlib"]

[build-dependencies]
tauri-build = { version = "2", features = [] }

[dependencies]
tauri = { version = "2", features = [] }
tauri-plugin-shell = "2"
tauri-plugin-dialog = "2"
serde = { version = "1", features = ["derive"] }
serde_json = "1"

[profile.release]
panic = "abort"
codegen-units = 1
lto = true
opt-level = "s"
strip = true
```

### tauri.conf.json
```json
{
  "$schema": "https://raw.githubusercontent.com/tauri-apps/tauri/dev/crates/tauri-config-schema/schema.json",
  "productName": "GAMALI PATBİS",
  "version": "2.1.0",
  "identifier": "com.gamali.patbis",
  "build": {
    "frontendDist": "../dist",
    "devUrl": "http://localhost:1420",
    "beforeDevCommand": "npm run dev",
    "beforeBuildCommand": "npm run build"
  },
  "app": {
    "windows": [{
      "title": "GAMALI PATBİS",
      "width": 1280, "height": 800,
      "minWidth": 960, "minHeight": 600,
      "resizable": true, "fullscreen": false, "decorations": true
    }],
    "security": { "csp": null },
    "withGlobalTauri": true
  },
  "bundle": {
    "active": true,
    "targets": ["msi", "nsis"],
    "icon": ["icons/32x32.png", "icons/128x128.png", "icons/128x128@2x.png", "icons/icon.ico"],
    "windows": { "wix": { "language": "tr-TR" } },
    "resources": ["../src-python/**/*"]
  }
}
```

### capabilities/default.json
```json
{
  "$schema": "../gen/schemas/desktop-capability.json",
  "identifier": "default",
  "description": "Default permissions for the main window",
  "windows": ["main"],
  "permissions": [
    "core:default", "shell:default", "dialog:default",
    "shell:allow-open", "dialog:allow-open", "dialog:allow-save", "dialog:allow-message"
  ]
}
```

### requirements.txt
```
PyQt6>=6.6.0
google-auth>=2.0.0
google-auth-oauthlib>=1.0.0
google-api-python-client>=2.0.0
openpyxl
```

### patbis_config.json
```json
{
  "admin_password_hash": "<SHA256 of GAMALI2026>",
  "drive_folder_name": "GAMALI_PATBIS_YEDEK",
  "drive_folder_id": null,
  "son_yedek_tarihi": null
}
```

### .gitignore
```
node_modules/
dist/
src-tauri/target/
__pycache__/
*.pyc
*.pyo
.vscode/
.idea/
.DS_Store
Thumbs.db
.env
.env.local
```

## 17. Python Bridge main() Giriş Noktası

```python
def main():
    if os.name == "nt":
        import io
        sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8")
        sys.stdin = io.TextIOWrapper(sys.stdin.buffer, encoding="utf-8")

    startup()  # {"ready": True, "versiyon": "2.3.0"} gönder

    for line in sys.stdin:
        line = line.strip()
        if not line: continue
        try:
            req = json.loads(line)
            resp = handle(req)
            print(json.dumps(resp, ensure_ascii=False), flush=True)
        except json.JSONDecodeError:
            err = {"id": 0, "result": None, "error": "Geçersiz JSON"}
            print(json.dumps(err), flush=True)

if __name__ == "__main__":
    main()
```

## 18. Rust lib.rs Tam Yapısı

```rust
// main.rs
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]
fn main() { gamali_patbis_lib::run() }

// lib.rs — PythonBridge
struct PythonBridge { child: Child, reader: BufReader<ChildStdout> }

impl PythonBridge {
    fn send(&mut self, method: &str, params: Value) -> Result<Value, String> {
        // JSON-RPC request stdin'e yaz, stdout'tan yanıt oku
    }
}

// Tauri commands
fn bridge_baslat(app, state) -> Result<String, String>
    // Python'u bul ve başlat, startup mesajını oku
fn python_cagir(state, method, params) -> Result<Value, String>
    // Bridge üzerinden Python'a komut gönder
fn saglik() -> String
    // Sağlık kontrolü

pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_dialog::init())
        .manage(AppState { bridge: Mutex::new(None) })
        .invoke_handler(generate_handler![saglik, bridge_baslat, python_cagir])
        .setup(|app| { /* debug'da devtools aç */ })
        .run(generate_context!())
}
```

## 19. Yapay Zekaya Yaptırma Notları

Bu projeyi sıfırdan yaptırırken şu sırayı takip edin:

1. **Tauri 2 projesi oluştur:** `npx -y create-tauri-app@latest` ile Vite+React seç
2. **package.json bağımlılıklarını ekle** (yukarıdaki tam listeyi kopyala)
3. **Cargo.toml'u düzenle** (tauri-plugin-shell, tauri-plugin-dialog ekle)
4. **tauri.conf.json'u düzenle** (pencere, bundle, resources ayarları)
5. **capabilities/default.json'u düzenle** (izinler)
6. **globals.css tema dosyasını oluştur** (Cyberpunk V2.0 değişkenleri)
7. **index.html'e Google Fonts linklerini ekle** (Orbitron + Rajdhani)
8. **src-tauri/src/lib.rs'i yaz** (PythonBridge + Tauri commands)
9. **src-python/bridge.py'yi yaz** (JSON-RPC köprüsü + tüm iş mantığı)
10. **src-python/core/ modüllerini yaz** (drive_manager, rapor_manager, vb.)
11. **usePython.js hook'unu yaz** (React↔Tauri↔Python bağlantısı + mock data)
12. **Bileşenleri oluştur:** Sidebar → Header → StatusCard → HakkindaModal
13. **Sayfaları oluştur:** Login → App → Dashboard → StokYukle → BarkodSorgula → StokSayim → StokCikis → Raporlar → DriveYedek → Ayarlar
14. **public/ klasörüne logo dosyalarını koy**
15. **patbis_config.json'u oluştur** (varsayılan admin şifre hash)
16. **Test:** `npm run tauri:dev` ile çalıştır

### Kritik Tasarım Kuralları:
- Tüm UI inline style ile yazılmıştır (CSS-in-JS), Tailwind/module CSS kullanılmaz
- Tema renkleri CSS değişkenlerinden okunur (`var(--neon-blue)` vb.)
- Font: başlıklar Orbitron, gövde Rajdhani, kod JetBrains Mono
- Koyu tema zorunlu, açık tema yok
- Tüm silme işlemleri "yumuşak" (soft delete — `deleted_at` veya `aktif=0`)
- Python bridge her zaman UTF-8 zorlar (Windows cp1254 sorunu)
- Tauri'de Python konsolu `CREATE_NO_WINDOW` ile gizlenir
