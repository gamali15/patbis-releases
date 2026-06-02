# GAMALI PATBİS — Bridge.py Tam İş Mantığı (Güncelleme Referansı)

Bu dosya, projeye güncelleme/yeni özellik eklemek isteyen bir yapay zekanın ihtiyaç duyacağı tüm backend iş mantığını içerir.

## GS1-128 Barkod Format Spesifikasyonu

### TXT Satır Formatı (CK65)
```
(90)TR022(250)21031318347(240)S53716(20)01(3103)000200
 │         │               │         │        │
 │         │               │         │        └── Ağırlık: 000200 / 1000 = 0.200 kg
 │         │               │         └── Paketleme seviyesi
 │         │               └── Kod (SID referansı) — ürün çeşidi kodu
 │         └── UID (tekil barkod numarası — 11 hane)
 └── PSN (ülke+tesit kodu — örn: TR022)
```

**Regex pattern:**
```python
gs1_pattern = re.compile(
    r"\(90\)([^(]+)"        # PSN
    r"\(250\)([^(]+)"       # UID
    r"\(240\)([^(]+)"       # Kod
    r"\(20\)([^(]+)"        # Paketleme
    r"(?:\(30\)\d+)?"       # Opsiyonel adet
    r"\(3[01]\d{2}\)(\d+)"  # Ağırlık (3103=3 ondalık)
)
```

### XML Yapısı (FEEM Sevkiyat)
```xml
<Shipment>
  <MessageID>186100</MessageID>
  <ShipmentNumber>FEEMTR_186100</ShipmentNumber>
  <ExpectedDeliveryDate>2026-04-30</ExpectedDeliveryDate>
  <Sender><Name>NITROMAK KAYSERİ</Name><Code>...</Code></Sender>
  <Receiver><Name>ÖZALTIN İNŞAAT</Name><Code>...</Code></Receiver>
  
  <!-- Ürün Çeşitleri -->
  <SummaryItem SID="S62672" PSN="TR022">
    <ProducerProductCode>010</ProducerProductCode>
    <ProducerProductName>N-DET LP 4 M 900 MS</ProducerProductName>
    <BatchNumber>10260428026</BatchNumber>
    <ExpiryDate>2027-04-28</ExpiryDate>
    <ProductionDate>2026-04-28</ProductionDate>
  </SummaryItem>

  <!-- Hiyerarşi: Unit(Palet) → Unit(Koli) → Item(Ürün) -->
  <Unit UID="palet_uid_123">
    <PackagingLevel>04</PackagingLevel>  <!-- 04=Palet -->
    <Unit UID="koli_uid_456">
      <PackagingLevel>02</PackagingLevel>  <!-- 02=Koli -->
      <Item UID="21031318347" SID="S62672"/>
      <Item UID="21031318348" SID="S62672"/>
    </Unit>
  </Unit>
</Shipment>
```

## Python Bridge — Tüm Fonksiyonlar

### Ana Döngü (main)
```python
def main():
    if os.name == "nt":
        import io
        sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8")
        sys.stdin  = io.TextIOWrapper(sys.stdin.buffer, encoding="utf-8")
    startup()  # {"ready": True, "versiyon": "2.3.0"}
    for line in sys.stdin:
        line = line.strip()
        if not line: continue
        try:
            req  = json.loads(line)
            resp = handle(req)
            print(json.dumps(resp, ensure_ascii=False), flush=True)
        except json.JSONDecodeError:
            print(json.dumps({"id":0,"result":None,"error":"Geçersiz JSON"}), flush=True)
```

### Yardımcılar
```python
def _text(element, tag):
    el = element.find(tag)
    return el.text.strip() if el is not None and el.text else ""

def _tarih_temizle(tarih):
    if tarih and "+" in tarih: return tarih.split("+")[0]
    if tarih and "T" in tarih: return tarih.split("T")[0]
    return tarih

def _db_yolu():
    # Öncelik: PATBIS_DB env → bridge.py yanındaki DB/gamalipatbis.db
    env_yol = os.environ.get("PATBIS_DB")
    if env_yol: return env_yol
    base = os.path.dirname(os.path.abspath(__file__))
    db_dir = os.path.join(base, "DB")
    os.makedirs(db_dir, exist_ok=True)
    return os.path.join(db_dir, "gamalipatbis.db")

def _yedek_dizini():
    db_dir = os.path.dirname(_db_yolu())
    yedek_dir = os.path.join(db_dir, "yedekler")
    os.makedirs(yedek_dir, exist_ok=True)
    return yedek_dir
```

### _db_baglanti() — Tablo oluşturma + migration
- SQLite bağlantısı aç, `PRAGMA journal_mode=WAL`, `PRAGMA foreign_keys=ON`
- 6 tablo oluştur (depolar, stok_yuklemeler, urun_cesitleri, urunler, birimler, personeller)
- Migration: `urunler.parent_uid`, `birimler.parent_uid`, `personeller.sifre` sütunlarını ekle
- İndeksler: `idx_urunler_yukleme`, `idx_urunler_uid_unique` (WHERE deleted_at IS NULL), `idx_urunler_sid`, `idx_cesitler_yukleme`, `idx_yuklemeler_depo`
- Mükerrer temizliği: UNIQUE index oluşturma başarısız olursa eski kayıtları siler

### _barkod_sorgula(uid) — Hiyerarşik Ağaç
1. `build_tree(uid)` recursive fonksiyonu:
   - Önce `birimler` tablosunda ara (seviye 04=palet, 02=koli)
   - Bulunduysa → alt birimleri + alt ürünleri recursive topla → `{tip, uid, cocuklar:[...]}`
   - Bulunamadıysa → `urunler` tablosunda ara → tekil ürün node döndür (ust_kutu, ust_palet ile)
2. Ağaç boşsa → `urunler.lot` ile lot grubu araması yap → sanal kutu altında grupla

### _txt_bul(xml_yolu)
Sırasıyla: aynı isim .txt → klasördeki tek TXT → isim benzerliği

### _xml_parse(dosya_yolu)
XML'den çıkar: gonderi_bilgi, summary_items (SID bazlı), Item/Unit sayıları, parent_map (Item UID → Unit UID), unit_details

### _txt_parse(txt_yolu, xml_yolu)
- XML'den UID→SID map oluştur
- TXT satırlarını GS1 regex ile parse et
- Her ürün: {uid, psn, sid, kod, paketleme, agirlik, xml_eslesme}
- Özet: toplam, eslesen, eslesmeyen, parse_hatalari

### _stok_kaydet(params) — 7 Adımlı Kayıt
1. Dosya yedekleme (XML+TXT → DB/yedekler/)
2. XML parse → gönderi bilgi + SummaryItem'lar
3. TXT parse → tekil ürünler
4. Mükerrer kontrolü (DB'de mevcut + dosya içi tekrar)
5. stok_yuklemeler tablosuna ana kayıt
6. urun_cesitleri tablosuna SummaryItem'lar
7. urunler tablosuna tekil ürünler (batch INSERT OR IGNORE)
8. birimler tablosuna Unit detayları

### _stok_ozet(params) 
İstatistikler (toplam ürün, ağırlık, çeşit, kutu) + depo dağılımı + çeşit dağılımı (top 20) + son yüklemeler

### _stok_sifirla(params)
mod="soft" → deleted_at işaretle | mod="hard" → DELETE FROM

### _stok_veritabani_sil()
DB + WAL + SHM dosyalarını sil

### _stok_cikis_onizle(params)
- UID listesini temizle: (250)UID formatını ayıkla, 51 haneli parantezsiz formatı çöz
- Her UID için: önce urunler'de ara, yoksa birimler'de ara (koli/palet → altındaki ürünleri aç)
- Bulunamayanları GS1 parse ile detayla (psn, kod, agirlik çıkar)

### _stok_cikis(params)
- uid_listesi ile soft-delete (deleted_at=now)
- GS1 listesi oluştur (raw_gs1_map veya otomatik üret)
- Manuel eklenenler için sahte yükleme kaydı → hemen silinmiş olarak ekle
- Çıkış no: OUT-YYMMDDHHMM

### _stok_envanter(params)
Filtreleme: depo_id, arama (uid/sid/urun_adi LIKE), grup (hepsi/cesit/kutu)
Sayfalama: sayfa, sayfa_boyut, offset

### _stok_sayim_karsilastir(params)
Okutulan UID seti ↔ DB UID seti → eslesen, fazla, eksik + detay (ilk 100)

### _rapor_veri(params)
özet (giriş/çıkış/net), depo_dagilim, son_girisler, son_cikislar, lot_dagilim

### _rapor_olustur(params)
openpyxl ile 4 sekmeli Excel:
1. Özet (kartlar + depo tablosu)
2. Ürün Bazlı (tüm ürünler, durum: Stokta/Çıkış)
3. Lot Bazlı (lot/parti grupları)
4. Hareketler (giriş + çıkış kronolojisi)
Masaüstüne kaydeder, başarısızsa DB dizinine

### _dosya_kaydet(params)
Metin dosyasını Masaüstü'ne yaz (Desktop → OneDrive/Masaüstü → Home fallback)

### Drive İşlemleri
- `_drive_durum()`: drive_manager.drive_bagli_mi() + config son yedek bilgisi
- `_drive_baglan()`: drive_manager.drive_baglanti() tetikle
- `_drive_yedekle()`: drive_manager.dosya_yukle(db_yolu) + config güncelle
- `_drive_dosyalar()`: drive_manager.drive_dosyalari_listele()
- `_drive_login(params)`: Personel şifre kontrolü (personeller.sifre) veya admin şifre (drive_manager.sifre_kontrol)

### Personel İşlemleri
- `_personeller_getir()`: aktif=1 olan personelleri ad_soyad'a göre sırala
- `_personel_ekle(params)`: INSERT (ad_soyad, unvan, sifre)
- `_personel_guncelle(params)`: UPDATE (şifre varsa şifre de güncelle)
- `_personel_sil(params)`: UPDATE aktif=0 (soft delete)

## Yeni Komut Ekleme Rehberi

### 1. bridge.py'ye fonksiyon ekle
```python
def _yeni_fonksiyon(params):
    try:
        conn = _db_baglanti()
        # ... iş mantığı ...
        conn.close()
        return {"basarili": True, "mesaj": "OK", "data": ...}
    except Exception as e:
        return {"basarili": False, "mesaj": str(e)}
```

### 2. dispatch()'e route ekle
```python
elif method == "yeni.komut":
    return _yeni_fonksiyon(params)
```

### 3. Frontend'den çağır
```javascript
const sonuc = await python.call("yeni.komut", { param1: "değer" });
```

### 4. (Opsiyonel) Mock data ekle
usePython.js → MOCK_RESPONSES → `"yeni.komut": { ... }`

## Yeni Sayfa Ekleme Rehberi

1. `src/pages/YeniSayfa.jsx` oluştur
2. `src/App.jsx` → import + PAGES objesine ekle
3. `src/components/Sidebar.jsx` → NAV_ITEMS'a ikon+label ekle
4. Tasarım kuralları: inline style, CSS değişkenleri, Orbitron başlık, Rajdhani gövde, koyu tema
