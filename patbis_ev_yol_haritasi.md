# 🗺️ PATBİS Sunucusu ve Canlı Entegrasyon — Ev Çalışma Yol Haritası

Ofiste başladığımız 128 GB USB disk entegrasyonunun büyük bir bölümünü tamamladık. Diskinizi başarıyla biçimlendirdik, mount ettik, reboot dayanıklı hale getirdik ve mevcut Docker verilerini USB diske eksiksiz aktardık.

Evde veya kendi çalışma ortamınızda süreci tamamlayıp canlı entegrasyonu (Android ↔ Masaüstü) devreye alabilmeniz için izlemeniz gereken **adım adım yol haritası** aşağıdadır.

---

## 💾 Aşama 1: Docker'ın USB Diskten Başlatılması (Ubuntu Sunucu)

Ofisteki sunucuya SSH veya doğrudan terminal üzerinden bağlandığınızda yapmanız gereken son 3 küçük adım kaldı:

### 1. Docker Yapılandırma Dosyasını (daemon.json) Düzenleme
Sunucunun NVIDIA ekran kartı (varsa) ayarlarını koruyarak Docker veri dizinini USB diske yönlendirmek için terminalde şu komutu çalıştırın:
```bash
sudo nano /etc/docker/daemon.json
```
Dosyanın içeriğini tamamen silip (veya var olanı aşağıdakiyle birleştirip) tam olarak şu hale getirin ve kaydedin (`Ctrl+O`, `Enter`, `Ctrl+X` ile nano'dan çıkabilirsiniz):
```json
{
  "data-root": "/mnt/patbis_usb/docker-data",
  "runtimes": {
    "nvidia": {
      "args": [],
      "path": "nvidia-container-runtime"
    }
  }
}
```

### 2. Docker Servisini Başlatma
Yapılandırma tamamlandıktan sonra Docker'ı yeni konumundan çalıştırın:
```bash
sudo systemctl start docker.socket
sudo systemctl start docker
```

### 3. Taşımanın Doğrulanması
Docker'ın 128 GB USB diskinizi kullandığını doğrulamak için şu komutu çalıştırın:
```bash
docker info | grep "Docker Root Dir"
```
Ekrandaki çıktının tam olarak şu olması gerekir:
> `Docker Root Dir: /mnt/patbis_usb/docker-data`

---

## 🏗️ Aşama 2: Sunucuyu USB Üzerinden Ayağa Kaldırma

Sunucudaki Docker artık tamamen 128 GB USB diskiniz üzerinde koşmaktadır. API sunucusunu başlatmak için:
```bash
cd /home/gamali/patbis_server
docker compose down
docker compose up -d --build
```
Sunucu artık Tailscale (`100.75.52.19:5001`) ve yerel ağınız (`10.33.0.253:5001`) üzerinden el terminalinin bağlantılarını kabul etmeye hazırdır!

---

## 📱 Aşama 3: Android Terminal ve Masaüstü Entegrasyon Geliştirmeleri

Siz evde dinlenirken veya sunucuyu test ederken, ben projenizin kod tabanında (Kotlin Android ve React Tauri masaüstü uygulamasında) canlı entegrasyon özelliklerini tamamlayacağım:

1. **`Ayarlar.jsx` (Tauri):** Ofis IP'si (`10.33.0.253`) ve Tailscale IP'sini (`100.75.52.19`) otomatik barındıran senkronizasyon QR kod ekranı, canlı işlem takibi (Audit Log) ve el terminalinden yüklenen hasar fotoğraflarının görüntüleneceği galeri arayüzünü geliştireceğim.
2. **`MainActivity.kt` (Android):** QR kod tarayarak otomatik IP/Port kaydetme, PIN ile güvenli giriş, canlı mükerrer kontrolü (hata flaşı ve özel bip sesiyle birlikte) ve hasarlı ürünler için kamera ile fotoğraf çekip sunucuya (`/api/sorun_gorseli`) yükleme modüllerini kodlayacağım.

---

## 🔍 Aşama 4: Canlı Testler ve Doğrulama

Evde veya ofise döndüğünüzde birlikte şu testleri gerçekleştireceğiz:
- [ ] **Bağlantı Testi:** Terminalden masaüstündeki QR kodu okutup sunucuyla eşleştirme.
- [ ] **Mükerrer Okuma Testi:** Aynı ürünü iki kez okutup terminalin kırmızı hata flaşı vermesini doğrulama.
- [ ] **Kamera Testi:** Hasarlı ürün resmi çekip sunucudaki USB diske anında kaydolduğunu ve masaüstü paneline düştüğünü izleme.
