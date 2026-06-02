# GAMALI PATBİS — Güncelleme Rehberi

## Güncelleme Nasıl Yayınlanır?

### 1. Uygulamada Versiyon Numarasını Güncelle

`src/components/HakkindaModal.jsx` dosyasını aç:

```js
const SURUM = "1.0.0";  // ← bunu değiştir
```

Örnek: `"1.0.0"` → `"1.0.1"`

---

### 2. GitHub'daki version.json'u Güncelle

Şu adrese git:
```
https://github.com/gamali15/patbis-releases/blob/main/version.json
```

Kalem ikonuna tıkla, `surum` değerini aynı numara yap:

```json
{
  "surum": "1.0.1",
  "notlar": "Buraya ne değişti yaz.",
  "tarih": "2026-XX-XX",
  "zorunlu": false
}
```

**Commit changes** → kaydet.

---

### 3. Uygulamayı Derle (Tauri Build)

```bash
npm run tauri build
```

Çıktı: `src-tauri/target/release/GAMALI PATBiS.exe`

---

### 4. EXE'yi Dağıt

Yeni EXE dosyasını kullanıcılara ilet (USB, paylaşımlı klasör, vb.)

---

## Versiyon Numaralama Kuralı

```
1 . 0 . 0
│   │   └── Küçük düzeltme / bug fix
│   └────── Yeni özellik
└────────── Büyük değişiklik
```

| Değişiklik | Örnek |
|------------|-------|
| Bug fix, küçük iyileştirme | 1.0.0 → 1.0.1 |
| Yeni sayfa / özellik | 1.0.0 → 1.1.0 |
| Büyük yeniden yazım | 1.0.0 → 2.0.0 |

---

## Zorunlu Güncelleme

Kritik bir güncelleme varsa `zorunlu: true` yap:

```json
{
  "surum": "1.1.0",
  "notlar": "Kritik güvenlik güncellemesi.",
  "tarih": "2026-06-01",
  "zorunlu": true
}
```

> ⚠️ Şu an `zorunlu` alanı sadece bilgi amaçlı — ileride uygulamayı kapatma/engelleme mantığı eklenebilir.

---

## GitHub Repo Adresi

```
https://github.com/gamali15/patbis-releases
```

Raw URL (uygulama bu adresi kullanır):
```
https://raw.githubusercontent.com/gamali15/patbis-releases/main/version.json
```

---

## Özet — Her Güncellemede Yapılacaklar

- [ ] `HakkindaModal.jsx` → `SURUM` değerini güncelle
- [ ] GitHub `version.json` → `surum` değerini aynı yap, `notlar` ve `tarih` yaz
- [ ] `npm run tauri build` → EXE derle
- [ ] EXE'yi dağıt
