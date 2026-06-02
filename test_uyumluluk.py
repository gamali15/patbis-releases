"""
Test Scripti — Android ↔ Masaüstü Uyumluluk Doğrulama
Simüle edilmiş Android TXT çıktısı + FEEM XML ile bridge.py _txt_parse test edilir.
"""
import sys
import os
import tempfile
import xml.etree.ElementTree as ET

# bridge.py'nin yolunu ekle
SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(SCRIPT_DIR, "Gamalipatbis_windows", "src-python"))

# ck65_parser'in yolunu ekle
sys.path.insert(0, os.path.join(SCRIPT_DIR, "Gamalipatbis_windows", "src-python", "core"))

# === Test Verileri ===

# Android uygulamasının export edeceği TXT dosyası (yeni format)
ANDROID_TXT = """Depo: OZALTIN 33-2019-00454
Kullanici: Ali
Kullanim_Yeri: T3 Tuneli
Tarih: 20.05.2026 17:55
Adet: 5
GS1: 3
Manuel: 2

Barcode
(90)TR022(250)21031318347(240)S53716(20)01(3103)000200
(90)TR022(250)21031318348(240)S53716(20)01(3103)000200
(90)TR022(250)21031318349(240)S53716(20)01(3103)000300
(250)21031318350
(250)ABCDEF12345
"""

# Eski format TXT (geriye dönük uyumluluk testi)
ESKI_TXT = """Depo: OZALTIN 33-2019-00454
Kullanici: Mehmet
Kullanim Yeri: Galeri
Tarih: 01.05.2026 10:00
Adet: 2

Barcode
(90)TR022(250)21031318347(240)S53716(20)01(3103)000200
(250)21031318350
"""

# FEEM XML (sevk irsaliyesi)
FEEM_XML = """<?xml version="1.0"?>
<Shipment FileType="FEEM-Std" FileVersion="1.0">
  <MessageID>999999</MessageID>
  <ShipmentNumber>TEST-001</ShipmentNumber>
  <ExpectedDeliveryDate>2026-05-01</ExpectedDeliveryDate>
  <Sender><Code>KAYSERI</Code><Name>NITROMAK KAYSERI</Name></Sender>
  <Receiver><Code>10330089</Code><Name>Ozaltin Insaat</Name></Receiver>
  <SummaryItems>
    <SummaryItem SID="S53716" PSN="TR022">
      <ProducerProductCode>010</ProducerProductCode>
      <ProducerProductName>N-DET EZDET 6 M 42/500 MS</ProducerProductName>
      <ProductionDate>2025-04-16+03:00</ProductionDate>
      <ExpiryDate>2026-04-16+03:00</ExpiryDate>
      <BatchNumber>10250416015</BatchNumber>
    </SummaryItem>
  </SummaryItems>
  <Units>
    <Unit PSN="TR022" UID="22004981346">
      <PackagingLevel>03</PackagingLevel>
      <Units>
        <Unit PSN="TR022" UID="22004981094">
          <PackagingLevel>02</PackagingLevel>
          <Items>
            <Item PSN="TR022" UID="21031318347" SID="S53716" />
            <Item PSN="TR022" UID="21031318348" SID="S53716" />
            <Item PSN="TR022" UID="21031318349" SID="S53716" />
            <Item PSN="TR022" UID="21031318350" SID="S53716" />
          </Items>
        </Unit>
      </Units>
    </Unit>
  </Units>
</Shipment>"""


def test_bridge_txt_parse():
    """bridge.py _txt_parse fonksiyonunu test et"""
    import bridge

    print("=" * 60)
    print("TEST 1: Yeni Android Format (GS1 + Manuel + Basliklar)")
    print("=" * 60)

    # Geçici dosyalar oluştur
    with tempfile.NamedTemporaryFile(mode="w", suffix=".txt", delete=False, encoding="utf-8") as f:
        f.write(ANDROID_TXT)
        txt_yolu = f.name

    with tempfile.NamedTemporaryFile(mode="w", suffix=".xml", delete=False, encoding="utf-8") as f:
        f.write(FEEM_XML)
        xml_yolu = f.name

    sonuc = bridge._txt_parse(txt_yolu, xml_yolu)

    print(f"  Basarili      : {sonuc['basarili']}")
    print(f"  Toplam urun   : {sonuc['toplam']}")
    print(f"  Eslesen (XML) : {sonuc['eslesen']}")
    print(f"  Eslesmeyen    : {sonuc['eslesmeyen']}")
    print(f"  Parse hatalari: {sonuc['parse_hatalari']}")
    if sonuc.get("hatalar_listesi"):
        for h in sonuc["hatalar_listesi"]:
            print(f"    [!] {h}")
    print()

    assert sonuc["basarili"] == True, "Parse basarisiz!"
    assert sonuc["toplam"] == 5, f"Beklenen 5 urun, bulunan {sonuc['toplam']}"
    assert sonuc["parse_hatalari"] == 0, f"Parse hatasi olmamali, bulunan: {sonuc['parse_hatalari']}"

    # Elle girilen 21031318350 XML'de var → eşleşmeli
    urunler = sonuc["urunler"]
    uid_map = {u["uid"]: u for u in urunler}

    # GS1 barkodlar
    assert "21031318347" in uid_map, "GS1 barkod 347 bulunamadi"
    assert uid_map["21031318347"]["xml_eslesme"] == True, "347 XML eslesmeli"
    assert uid_map["21031318347"]["psn"] == "TR022", "347 PSN=TR022 olmali"

    # Elle girilen ama XML'de var
    assert "21031318350" in uid_map, "Manuel UID 350 bulunamadi"
    assert uid_map["21031318350"]["xml_eslesme"] == True, "350 XML'de var, eslesmeli"
    assert uid_map["21031318350"]["sid"] == "S53716", f"350 SID=S53716 olmali, bulunan: {uid_map['21031318350']['sid']}"
    assert uid_map["21031318350"]["psn"] == "TR022", f"350 PSN hydrate edilmeli, bulunan: {uid_map['21031318350']['psn']}"

    # Elle girilen, XML'de yok
    assert "ABCDEF12345" in uid_map, "Manuel UID ABCDEF12345 bulunamadi"
    assert uid_map["ABCDEF12345"]["xml_eslesme"] == False, "ABCDEF12345 XML'de yok, eslesmemeli"

    print("  [OK] TEST 1 BASARILI -- Tum kontroller gecti!")
    print()

    # Temizle
    os.unlink(txt_yolu)

    print("=" * 60)
    print("TEST 2: Eski Android Format (geriye dönük uyumluluk)")
    print("=" * 60)

    with tempfile.NamedTemporaryFile(mode="w", suffix=".txt", delete=False, encoding="utf-8") as f:
        f.write(ESKI_TXT)
        txt_yolu = f.name

    sonuc2 = bridge._txt_parse(txt_yolu, xml_yolu)

    print(f"  Basarili      : {sonuc2['basarili']}")
    print(f"  Toplam urun   : {sonuc2['toplam']}")
    print(f"  Eslesen (XML) : {sonuc2['eslesen']}")
    print(f"  Eslesmeyen    : {sonuc2['eslesmeyen']}")
    print(f"  Parse hatalari: {sonuc2['parse_hatalari']}")
    if sonuc2.get("hatalar_listesi"):
        for h in sonuc2["hatalar_listesi"]:
            print(f"    [!] {h}")
    print()

    assert sonuc2["basarili"] == True, "Eski format parse basarisiz!"
    assert sonuc2["toplam"] == 2, f"Beklenen 2 urun, bulunan {sonuc2['toplam']}"
    assert sonuc2["parse_hatalari"] == 0, f"Parse hatasi olmamali! Eski 'Kullanim Yeri' filtre edilmeli. Hatalar: {sonuc2.get('hatalar_listesi')}"

    print("  [OK] TEST 2 BASARILI -- Eski format geriye donuk uyumlu!")
    print()

    # Temizle
    os.unlink(txt_yolu)
    os.unlink(xml_yolu)


def test_unit_expansion():
    """Koli barkodu okunduğunda içindeki tüm ürünlerin otomatik açımlanmasını test et"""
    import bridge

    print("=" * 60)
    print("TEST 4: Koli Acimlama (Unit Expansion) Testi")
    print("=" * 60)

    # Sadece koli barkodu içeren TXT
    koli_txt = """Depo: OZALTIN 33-2019-00454
Kullanici: Hakan
Kullanim_Yeri: T3 Tuneli
Tarih: 21.05.2026 11:00
Adet: 1

Barcode
(250)22004981094
"""

    with tempfile.NamedTemporaryFile(mode="w", suffix=".txt", delete=False, encoding="utf-8") as f:
        f.write(koli_txt)
        txt_yolu = f.name

    # FEEM_XML is global
    with tempfile.NamedTemporaryFile(mode="w", suffix=".xml", delete=False, encoding="utf-8") as f:
        f.write(FEEM_XML)
        xml_yolu = f.name

    sonuc = bridge._txt_parse(txt_yolu, xml_yolu)

    print(f"  Basarili      : {sonuc['basarili']}")
    print(f"  Toplam urun   : {sonuc['toplam']}")
    print(f"  Eslesen (XML) : {sonuc['eslesen']}")
    print(f"  Eslesmeyen    : {sonuc['eslesmeyen']}")
    
    # 22004981094 nolu koli açıldığında içindeki 4 ürün gelmeli
    assert sonuc["basarili"] == True
    assert sonuc["toplam"] == 4, f"Kolideki 4 urun acilmaliydi, bulunan: {sonuc['toplam']}"
    
    uids = [u["uid"] for u in sonuc["urunler"]]
    assert "21031318347" in uids, "Urun 347 bulunamadi"
    assert "21031318348" in uids, "Urun 348 bulunamadi"
    assert "21031318349" in uids, "Urun 349 bulunamadi"
    assert "21031318350" in uids, "Urun 350 bulunamadi"

    # Her birinin koli_uid bilgisi 22004981094 olmalı
    for urun in sonuc["urunler"]:
        assert urun["koli_uid"] == "22004981094", f"Koli UID hatali: {urun['koli_uid']}"

    print("  [OK] TEST 4 BASARILI -- Koli ve icindeki tum urunler basariyla acimlandi!")
    print()

    os.unlink(txt_yolu)
    os.unlink(xml_yolu)


def test_ck65_parser():
    """ck65_parser.py txt_parse fonksiyonunu test et"""
    from ck65_parser import txt_parse

    print("=" * 60)
    print("TEST 3: ck65_parser.py — Android APK TXT parse")
    print("=" * 60)

    with tempfile.NamedTemporaryFile(mode="w", suffix=".txt", delete=False, encoding="utf-8") as f:
        f.write(ANDROID_TXT)
        txt_yolu = f.name

    sonuc = txt_parse(txt_yolu)

    print(f"  APK format    : {sonuc.apk_format}")
    print(f"  Toplam kayit  : {sonuc.toplam}")
    print(f"  Tekil UID'ler : {len(sonuc.tekil_uidler)}")
    print(f"  Hatalar       : {len(sonuc.hatalar)}")
    print(f"  Depo kodu     : {sonuc.apk_header.depo_kod}")
    print(f"  Kullanici     : {sonuc.apk_header.kullanici}")
    print()

    assert sonuc.apk_format == True, "APK format algılanamadı!"
    assert sonuc.toplam == 5, f"Beklenen 5 kayıt, bulunan {sonuc.toplam}"
    assert sonuc.apk_header.depo_kod == "33-2019-00454", f"Depo kodu yanlış: {sonuc.apk_header.depo_kod}"
    assert len(sonuc.hatalar) == 0, f"Hata olmamalı: {sonuc.hatalar}"

    # Manuel UID kontrolü
    manuel_kayitlar = [k for k in sonuc.kayitlar if k.format_tip == "MANUEL_UID"]
    assert len(manuel_kayitlar) == 2, f"Beklenen 2 manuel UID, bulunan {len(manuel_kayitlar)}"

    print("  [OK] TEST 3 BASARILI -- ck65_parser APK TXT destegi calisiyor!")
    print()

    os.unlink(txt_yolu)


if __name__ == "__main__":
    print()
    print("GAMALI PATBIS -- Android <-> Masaustu Uyumluluk Testi")
    print("=" * 60)
    print()

    hatalar = []

    try:
        test_bridge_txt_parse()
        test_unit_expansion()
    except AssertionError as e:
        hatalar.append(f"bridge.py: {e}")
    except Exception as e:
        hatalar.append(f"bridge.py beklenmeyen hata: {e}")

    try:
        test_ck65_parser()
    except AssertionError as e:
        hatalar.append(f"ck65_parser: {e}")
    except Exception as e:
        hatalar.append(f"ck65_parser beklenmeyen hata: {e}")

    print("=" * 60)
    if hatalar:
        print("[FAIL] BASARISIZ TESTLER:")
        for h in hatalar:
            print(f"  - {h}")
    else:
        print("[OK] TUM TESTLER BASARILI!")
    print("=" * 60)
