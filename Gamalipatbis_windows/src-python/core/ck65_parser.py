"""
GAMALI NEXUS PATBİS — GS1-128 & CK65 Parser v2.0
Dokümantasyon: GAMALI_PATBIS_DOKUMANTASYON.md

GİRİŞ formatları (otomatik tespit):
  FORMAT 1 — Parantezli GS1:
    (90)TR022(250)22005567797(240)010(20)03(30)220(37)22(3101)000085(3301)000092

  FORMAT 2 — CK65 Ham (GS separator 0x1D):
    90TR022\x1d25022005567797\x1d240010\x1d2003\x1d30220...

  FORMAT 3 — APK TXT (header + Barcode bölümü):
    Depo: ÖZALTIN DEPO 33-2019-00454
    Kullanici: Ali
    Kullanim Yeri: T3 Tüneli
    Tarih: 02.05.2026 14:38
    Adet: 7
    (boş satır)
    Barcode
    (90)TR022(250)...

  FORMAT 4 — INSICC Fitil:
    INSICC1X000001261991

AI (Application Identifier) Referansı:
  (90)  → PSN (Firma kodu: TR022, IN002, BA001 vb.)
  (250) → Seri Numara — BENZERSİZ, 11 hane
  (240) → Ek Ürün ID (3 hane: 001, 010 vb.)
  (20)  → Varyant (00=tekil, 02=koli PL02, 03=koli/palet PL03)
  (30)  → Miktar (adet)
  (37)  → Ambalaj adedi
  (3100)→ Net Ağırlık 0 desimal (kg)
  (3101)→ Net Ağırlık 1 desimal (kg*10)   — 000085 = 8.5 kg
  (3103)→ Net Ağırlık 3 desimal (kg*1000) — 000500 = 0.500 kg
  (3301)→ Brüt Ağırlık

ÇIKIŞ formatı (PATBİS):
  (90)PSN(250)UID(240)SID(20)00(3101)AGIRLIK
"""

import re
from pathlib import Path
from dataclasses import dataclass, field
from datetime import datetime

# ─── Regex Desenleri ────────────────────────────────────────────────────────

# Parantezli AI: (90)TR022(250)...
AI_PARANTEZ = re.compile(r'\((\d+)\)([^\(]+)')

# GS formatı: 90TR022[GS]25022005567797...
GS_CHAR = '\x1d'

# GS1 satır başlangıcı (parantezli)
GS1_BASLIK = re.compile(r'^\(90\)')

# INSICC
INSICC_BASLIK = re.compile(r'^INSICC', re.IGNORECASE)

# APK header alanları (Kullanim Yeri ve Kullanim_Yeri, GS1, Manuel hepsi desteklenir)
APK_HEADER = re.compile(r'^(Depo|Kullanici|Kullanim[_ ]Yeri|Kullanim|Tarih|Adet|GS1|Manuel)\s*:\s*(.+)$', re.IGNORECASE)

# Dosya adından depo kodu
DEPO_KOD_RE = re.compile(r'(\d{2}-\d{4}-\d{5})')

# PSN tablosu (dokümantasyondan)
PSN_TABLO = {
    "TR022": "Nitromak DNX Kimya A.Ş.",
    "TR011": "TR011",
    "TR006": "TR006",
    "TR003": "TR003",
    "TR029": "NPI",
    "BA001": "BA001",
    "IN002": "Yabancı",
    "IN006": "Yabancı",
    "INSICC": "Fitil",
}


# ─── Veri Sınıfları ──────────────────────────────────────────────────────────

@dataclass
class BarkodKayit:
    ham_satir:    str = ""
    format_tip:   str = ""   # GS1_PARANTEZ | GS1_HAM | INSICC | BILINMIYOR
    icerik_tip:   str = ""   # TEKIL | KOLI | PALET | FITIL

    # GS1 alanları
    psn:          str = ""   # (90)
    uid:          str = ""   # (250) — benzersiz seri numara
    sid:          str = ""   # (240) — ürün kodu (3 hane)
    varyant:      str = ""   # (20)
    adet:         int = 0    # (30)
    ambalaj_adet: int = 0    # (37)

    # Ağırlık — ham 6 haneli string
    agirlik_ham:  str = ""   # hangisi varsa
    agirlik_tip:  str = ""   # "3100" | "3101" | "3103" | ""
    agirlik_kg:   float = 0.0  # gerçek kg değeri

    # INSICC
    insicc_kod:   str = ""

    def agirlik_patis_fmt(self) -> str:
        """PATBİS için (3101) formatına çevir — 6 haneli string"""
        if self.agirlik_kg <= 0:
            return "000000"
        # (3101) = kg * 10, 6 hane
        return str(int(self.agirlik_kg * 10)).zfill(6)


@dataclass
class APKHeader:
    """APK TXT dosyasının başlık bilgileri"""
    depo_kod:     str = ""
    depo_adi:     str = ""
    kullanici:    str = ""
    kullanim_yeri: str = ""
    tarih:        str = ""
    adet:         int = 0


@dataclass
class ParseSonucu:
    dosya_adi:    str = ""
    toplam:       int = 0
    kayitlar:     list = field(default_factory=list)   # BarkodKayit listesi

    # Hızlı erişim listeleri
    tekil_uidler: list = field(default_factory=list)
    koli_uidler:  list = field(default_factory=list)
    fitil_uidler: list = field(default_factory=list)

    # APK header (varsa)
    apk_header:   APKHeader = field(default_factory=APKHeader)
    apk_format:   bool = False

    hatalar:      list = field(default_factory=list)


# ─── Ana Parser ──────────────────────────────────────────────────────────────

def txt_parse(dosya_yolu) -> ParseSonucu:
    """
    Her TXT formatını otomatik algıla ve ayrıştır.
    APK TXT, GS1 parantezli, GS1 ham, INSICC — hepsi desteklenir.
    """
    sonuc = ParseSonucu()
    dosya_yolu = Path(dosya_yolu)
    sonuc.dosya_adi = dosya_yolu.name

    # Dosya adından depo kodunu çıkar
    m = DEPO_KOD_RE.search(dosya_yolu.stem)
    if m:
        sonuc.apk_header.depo_kod = m.group(1)

    # Dosyayı oku
    try:
        try:
            metin = dosya_yolu.read_text(encoding="utf-8-sig")
        except UnicodeDecodeError:
            metin = dosya_yolu.read_text(encoding="latin-1")
    except FileNotFoundError:
        sonuc.hatalar.append(f"Dosya bulunamadı: {dosya_yolu}")
        return sonuc

    satirlar = metin.splitlines()
    barkod_bolumu = False  # "Barcode" satırından sonra True

    for satir in satirlar:
        satir_strip = satir.strip()
        if not satir_strip:
            continue

        # APK "Barcode" başlık satırı
        if satir_strip.lower() == "barcode":
            barkod_bolumu = True
            sonuc.apk_format = True
            continue

        # APK header satırları (Barcode'dan önce)
        if not barkod_bolumu:
            m = APK_HEADER.match(satir_strip)
            if m:
                _header_isle(sonuc.apk_header, m.group(1).strip(), m.group(2).strip())
                sonuc.apk_format = True
                continue

        # Barkod satırı
        kayit = _satir_parse(satir_strip)
        if kayit.format_tip == "BILINMIYOR":
            continue

        sonuc.kayitlar.append(kayit)
        sonuc.toplam += 1

        if kayit.format_tip == "INSICC":
            sonuc.fitil_uidler.append(kayit.insicc_kod)
        elif kayit.icerik_tip == "TEKIL":
            sonuc.tekil_uidler.append(kayit.uid)
        elif kayit.icerik_tip in ("KOLI", "PALET"):
            sonuc.koli_uidler.append(kayit.uid)

    return sonuc


def _header_isle(header: APKHeader, anahtar: str, deger: str):
    ak = anahtar.lower()
    if "depo" in ak:
        # "ÖZALTIN DEPO 33-2019-00454" → depo_kod çıkar
        header.depo_adi = deger
        m = DEPO_KOD_RE.search(deger)
        if m:
            header.depo_kod = m.group(1)
    elif "kullanim yeri" in ak or "kullanim_yeri" in ak:
        header.kullanim_yeri = deger
    elif "kullanici" in ak:
        header.kullanici = deger
    elif "tarih" in ak:
        header.tarih = deger
    elif "adet" in ak:
        try:
            header.adet = int(deger)
        except ValueError:
            pass


def _satir_parse(satir: str) -> BarkodKayit:
    kayit = BarkodKayit(ham_satir=satir)

    # INSICC
    if INSICC_BASLIK.match(satir):
        kayit.format_tip = "INSICC"
        kayit.icerik_tip = "FITIL"
        kayit.insicc_kod = satir
        return kayit

    # GS1 Ham format (0x1D separator)
    if GS_CHAR in satir and not GS1_BASLIK.match(satir):
        return _gs_ham_parse(satir)

    # GS1 Parantezli
    if GS1_BASLIK.match(satir):
        return _gs_parantez_parse(satir)

    # Elle girilen (250)UID formatı (Android APK manuel giriş)
    m_manual = re.match(r'^\(250\)([A-Za-z0-9_-]+)$', satir)
    if m_manual:
        kayit.format_tip = "MANUEL_UID"
        kayit.icerik_tip = "TEKIL"
        kayit.uid = m_manual.group(1).strip()
        return kayit

    # Yalın alfanümerik UID (5-30 karakter)
    if re.match(r'^[A-Za-z0-9_-]{5,30}$', satir):
        kayit.format_tip = "MANUEL_UID"
        kayit.icerik_tip = "TEKIL"
        kayit.uid = satir
        return kayit

    kayit.format_tip = "BILINMIYOR"
    return kayit


def _gs_parantez_parse(satir: str) -> BarkodKayit:
    """(90)TR022(250)... formatını parse et"""
    kayit = BarkodKayit(ham_satir=satir, format_tip="GS1_PARANTEZ")

    alanlar = {k.strip(): v.strip() for k, v in AI_PARANTEZ.findall(satir)}

    kayit.psn    = alanlar.get("90", "")
    kayit.uid    = alanlar.get("250", "")
    kayit.sid    = alanlar.get("240", "")[:3]  # Max 3 hane
    kayit.varyant = alanlar.get("20", "")

    try: kayit.adet = int(alanlar.get("30", "0"))
    except: pass
    try: kayit.ambalaj_adet = int(alanlar.get("37", "0"))
    except: pass

    # Ağırlık — öncelik sırası: 3101 > 3103 > 3100
    kayit.agirlik_ham, kayit.agirlik_tip, kayit.agirlik_kg = _agirlik_hesapla(alanlar)

    # İçerik tipi
    kayit.icerik_tip = _icerik_tip(kayit.varyant)

    return kayit


def _gs_ham_parse(satir: str) -> BarkodKayit:
    """CK65 ham GS (0x1D) formatını parse et"""
    kayit = BarkodKayit(ham_satir=satir, format_tip="GS1_HAM")

    # Her segmenti parse et: "90TR022", "25022005567797" vb.
    segmentler = satir.split(GS_CHAR)
    alanlar = {}

    # Bilinen GS1 AI'lar (uzunluk sıralı — daha uzun önce)
    BILINEN_AI = {
        "3301":4, "3303":4, "3100":4, "3101":4, "3102":4, "3103":4,
        "250":3, "240":3, "310":3, "330":3,
        "90":2, "20":2, "30":2, "37":2, "10":2, "11":2, "17":2,
    }
    for seg in segmentler:
        seg = seg.strip()
        if not seg:
            continue
        eslesme = False
        # Bilinen AI'larla eşleştir
        for ai, uzunluk in sorted(BILINEN_AI.items(), key=lambda x: -x[1]):
            if seg.startswith(ai) and len(seg) > uzunluk:
                alanlar[ai] = seg[uzunluk:].strip()
                eslesme = True
                break
        if not eslesme:
            # Fallback: 4,3,2 hane dene
            for uz in [4,3,2]:
                if len(seg) > uz and seg[:uz].isdigit():
                    alanlar[seg[:uz]] = seg[uz:].strip()
                    break

    kayit.psn    = alanlar.get("90", "")
    kayit.uid    = alanlar.get("250", "")
    kayit.sid    = alanlar.get("240", "")[:3]
    kayit.varyant = alanlar.get("20", "")

    try: kayit.adet = int(alanlar.get("30", "0"))
    except: pass

    kayit.agirlik_ham, kayit.agirlik_tip, kayit.agirlik_kg = _agirlik_hesapla(alanlar)
    kayit.icerik_tip = _icerik_tip(kayit.varyant)

    return kayit


def _agirlik_hesapla(alanlar: dict) -> tuple:
    """
    Ağırlık alanını bul ve kg'a çevir.
    Döner: (ham_string, tip_str, kg_float)

    (3100) = kg (0 desimal)   — 000025 = 25 kg
    (3101) = kg*10 (1 des)    — 000085 = 8.5 kg
    (3103) = kg*1000 (3 des)  — 000500 = 0.500 kg
    """
    for ai, carpan in [("3101", 10.0), ("3103", 1000.0), ("3100", 1.0)]:
        val = alanlar.get(ai, "")
        if val:
            try:
                kg = int(val) / carpan
                return (val, ai, kg)
            except: pass
    return ("000000", "", 0.0)


def _icerik_tip(varyant: str) -> str:
    """(20) değerinden içerik tipini belirle"""
    if varyant == "02":
        return "KOLI"
    elif varyant == "03":
        return "PALET"
    else:
        return "TEKIL"  # 00, boş veya bilinmeyen


# ─── PATBİS TXT Üreticisi ────────────────────────────────────────────────────



def patbis_dosya_adi(depo_kod: str = "") -> str:
    tarih = datetime.now().strftime("%Y%m%d_%H%M%S")
    if depo_kod:
        son = depo_kod.split("-")[-1].lstrip("0") or depo_kod.split("-")[-1]
        return f"patbis_cikis_{son}_{tarih}.txt"
    return f"patbis_cikis_{tarih}.txt"
