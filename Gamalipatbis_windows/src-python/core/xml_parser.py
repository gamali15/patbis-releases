"""
GAMALI NEXUS PATBiS — XML Parser (FEEM-Std v1.0)
Desteklenen formatlar:
  - TR022: PL=03>PL=02>Items hiyerarsisi (Nitromak dinamit)
  - IN006: UID="" Unit > Items (fitil, harf+rakam UID)
  - IN002: UID="" Unit > Items (elektrik fitil, sayisal UID)
  - Tekil: PL=00 SummaryItem (palet/koli yok)
"""
import xml.etree.ElementTree as ET
from pathlib import Path
from dataclasses import dataclass, field


@dataclass
class ParseSonucu:
    paletler: list = field(default_factory=list)
    kutular:  list = field(default_factory=list)
    urunler:  list = field(default_factory=list)
    ozet:     dict = field(default_factory=dict)
    hatalar:  list = field(default_factory=list)
    sevkiyat_no: str = ""
    gonderen:    str = ""
    alici:       str = ""
    tarih:       str = ""


def xml_parse(dosya_yolu) -> ParseSonucu:
    sonuc = ParseSonucu()
    dosya_yolu = Path(dosya_yolu)
    try:
        tree = ET.parse(str(dosya_yolu))
        root = tree.getroot()
    except ET.ParseError as e:
        sonuc.hatalar.append(f"XML parse hatasi: {e}")
        return sonuc
    except FileNotFoundError:
        sonuc.hatalar.append(f"Dosya bulunamadi: {dosya_yolu}")
        return sonuc

    sonuc.sevkiyat_no = root.findtext("ShipmentNumber", "")
    sonuc.tarih       = root.findtext("ExpectedDeliveryDate", "")
    g = root.find("Sender")
    if g is not None: sonuc.gonderen = g.findtext("Name", "")
    a = root.find("Receiver")
    if a is not None: sonuc.alici = a.findtext("Name", "")

    # SummaryItems → meta harita (SID bazlı)
    meta_harita = {}
    si_el = root.find("SummaryItems")
    if si_el is not None:
        for si in si_el.findall("SummaryItem"):
            sid = si.get("SID", "")
            prod_code_full = si.findtext("ProducerProductCode", "")
            prod_code = prod_code_full[:3] if prod_code_full else ""
            meta_harita[sid] = {
                "urun_adi":      si.findtext("ProducerProductName", ""),
                "urun_kodu":     prod_code,
                "batch":         si.findtext("BatchNumber", ""),
                "skt":           _tarih_temizle(si.findtext("ExpiryDate", "")),
                "uretim_tarihi": _tarih_temizle(si.findtext("ProductionDate", "")),
                "psn":           si.get("PSN", ""),
            }

    units_el = root.find("Units")
    if units_el is None:
        sonuc.hatalar.append("XML'de <Units> elementi bulunamadi")
        return sonuc

    for unit in units_el.findall("Unit"):
        uid = unit.get("UID", "").strip()
        pl  = unit.findtext("PackagingLevel", "").strip()
        _unit_isle(unit, pl, uid, None, sonuc, meta_harita)

    sonuc.ozet = {
        "palet_sayisi": len(sonuc.paletler),
        "kutu_sayisi":  len(sonuc.kutular),
        "urun_sayisi":  len(sonuc.urunler),
        "dosya":        dosya_yolu.name,
        "sevkiyat_no":  sonuc.sevkiyat_no,
    }
    return sonuc


def _unit_isle(unit_el, pl, uid, ust_uid, sonuc, meta_harita):
    """
    Recursive unit işleyici.

    PL=03/04 → Palet → alt Units veya Items
    PL=02    → Koli  → Items
    UID=""   → Gruplama birimi (IN006/IN002 fitil) → direkt Items, kutu kayıt yok
    UID dolu, PL=""  → koli olarak işle
    """
    psn          = unit_el.get("PSN", "")
    alt_units_el = unit_el.find("Units")
    alt_items_el = unit_el.find("Items")
    has_sub  = alt_units_el is not None and len(list(alt_units_el)) > 0
    has_item = alt_items_el is not None and len(list(alt_items_el)) > 0

    # ── Boş UID: fitil/elektrik grubu — kutu kaydı yapma, ürünleri direkt ekle ──
    if uid == "":
        if has_item:
            for item in alt_items_el.findall("Item"):
                _item_isle(item, None, sonuc, meta_harita)
        elif has_sub:
            for alt in alt_units_el.findall("Unit"):
                alt_uid = alt.get("UID", "").strip()
                alt_pl  = alt.findtext("PackagingLevel", "").strip()
                _unit_isle(alt, alt_pl, alt_uid, uid, sonuc, meta_harita)
        return

    # ── Palet (PL=03 veya PL=04) ────────────────────────────────────────────────
    if pl in ("03", "04"):
        sonuc.paletler.append({"uid": uid, "psn": psn, "packaging_level": pl})
        if has_sub:
            for alt in alt_units_el.findall("Unit"):
                alt_uid = alt.get("UID", "").strip()
                alt_pl  = alt.findtext("PackagingLevel", "").strip()
                _unit_isle(alt, alt_pl, alt_uid, uid, sonuc, meta_harita)
        elif has_item:
            for item in alt_items_el.findall("Item"):
                _item_isle(item, uid, sonuc, meta_harita)
        return

    # ── Koli (PL=02 veya UID dolu PL="") ────────────────────────────────────────
    if pl == "02" or (pl == "" and uid and has_item):
        sonuc.kutular.append({
            "uid": uid, "psn": psn,
            "palet_uid": ust_uid,
            "packaging_level": pl or "02"
        })
        if has_item:
            for item in alt_items_el.findall("Item"):
                _item_isle(item, uid, sonuc, meta_harita)
        return

    # ── Alt Unit grubu (UID dolu, alt Units var) ─────────────────────────────────
    if has_sub:
        sonuc.paletler.append({"uid": uid, "psn": psn, "packaging_level": pl})
        for alt in alt_units_el.findall("Unit"):
            alt_uid = alt.get("UID", "").strip()
            alt_pl  = alt.findtext("PackagingLevel", "").strip()
            _unit_isle(alt, alt_pl, alt_uid, uid, sonuc, meta_harita)
        return

    sonuc.hatalar.append(f"Tanimsiz Unit (PL={pl!r}, UID={uid!r})")


def _item_isle(item_el, kutu_uid, sonuc, meta_harita):
    uid = item_el.get("UID", "")
    psn = item_el.get("PSN", "")
    sid = item_el.get("SID", "")
    meta = meta_harita.get(sid, {})

    # PSN meta'dan da alınabilir (SummaryItem'dan)
    if not psn:
        psn = meta.get("psn", "")

    sonuc.urunler.append({
        "uid": uid, "psn": psn, "sid": sid, "kutu_uid": kutu_uid,
        "urun_adi":      meta.get("urun_adi", ""),
        "urun_kodu":     meta.get("urun_kodu", ""),
        "batch":         meta.get("batch", ""),
        "skt":           meta.get("skt", ""),
        "uretim_tarihi": meta.get("uretim_tarihi", ""),
        "agirlik_net":   "000000",
        "agirlik_tip":   "3103",
    })


def _tarih_temizle(tarih):
    if tarih and "+" in tarih:
        return tarih.split("+")[0]
    return tarih



@dataclass
class ParseSonucu:
    paletler: list = field(default_factory=list)
    kutular:  list = field(default_factory=list)
    urunler:  list = field(default_factory=list)
    ozet:     dict = field(default_factory=dict)
    hatalar:  list = field(default_factory=list)
    sevkiyat_no: str = ""
    gonderen:    str = ""
    alici:       str = ""
    tarih:       str = ""


def xml_parse(dosya_yolu) -> ParseSonucu:
    sonuc = ParseSonucu()
    dosya_yolu = Path(dosya_yolu)
    try:
        tree = ET.parse(str(dosya_yolu))
        root = tree.getroot()
    except ET.ParseError as e:
        sonuc.hatalar.append(f"XML parse hatasi: {e}")
        return sonuc
    except FileNotFoundError:
        sonuc.hatalar.append(f"Dosya bulunamadi: {dosya_yolu}")
        return sonuc

    sonuc.sevkiyat_no = root.findtext("ShipmentNumber", "")
    sonuc.tarih       = root.findtext("ExpectedDeliveryDate", "")
    g = root.find("Sender")
    if g is not None: sonuc.gonderen = g.findtext("Name", "")
    a = root.find("Receiver")
    if a is not None: sonuc.alici = a.findtext("Name", "")

    meta_harita = {}
    si_el = root.find("SummaryItems")
    if si_el is not None:
        for si in si_el.findall("SummaryItem"):
            sid = si.get("SID", "")
            prod_code_full = si.findtext("ProducerProductCode", "")
            prod_code = prod_code_full[:3] if prod_code_full else ""
            meta_harita[sid] = {
                "urun_adi":      si.findtext("ProducerProductName", ""),
                "urun_kodu":     prod_code,
                "batch":         si.findtext("BatchNumber", ""),
                "skt":           _tarih_temizle(si.findtext("ExpiryDate", "")),
                "uretim_tarihi": _tarih_temizle(si.findtext("ProductionDate", "")),
                "psn":           si.get("PSN", ""),
            }

    units_el = root.find("Units")
    if units_el is None:
        sonuc.hatalar.append("XML'de <Units> elementi bulunamadi")
        return sonuc

    for unit in units_el.findall("Unit"):
        pl = unit.findtext("PackagingLevel", "").strip()
        _unit_isle(unit, pl, None, sonuc, meta_harita)

    sonuc.ozet = {
        "palet_sayisi": len(sonuc.paletler),
        "kutu_sayisi":  len(sonuc.kutular),
        "urun_sayisi":  len(sonuc.urunler),
        "dosya":        dosya_yolu.name,
        "sevkiyat_no":  sonuc.sevkiyat_no,
    }
    return sonuc


def _unit_isle(unit_el, pl, ust_palet_uid, sonuc, meta_harita):
    uid = unit_el.get("UID", "")
    psn = unit_el.get("PSN", "")
    alt_units_el = unit_el.find("Units")
    alt_items_el = unit_el.find("Items")
    has_sub  = alt_units_el is not None and len(alt_units_el) > 0
    has_item = alt_items_el is not None and len(alt_items_el) > 0

    if pl in ("04", "03"):
        sonuc.paletler.append({"uid": uid, "psn": psn, "packaging_level": pl, "urun_psn": psn})
        if has_sub:
            for alt in alt_units_el.findall("Unit"):
                alt_pl = alt.findtext("PackagingLevel", "").strip()
                _unit_isle(alt, alt_pl, uid, sonuc, meta_harita)
        elif has_item:
            for item in alt_items_el.findall("Item"):
                _item_isle(item, uid, sonuc, meta_harita)

    elif pl == "02" or (pl == "" and has_item):
        sonuc.kutular.append({"uid": uid, "psn": psn, "palet_uid": ust_palet_uid, "packaging_level": pl})
        if has_item:
            for item in alt_items_el.findall("Item"):
                _item_isle(item, uid, sonuc, meta_harita)

    elif pl == "" and has_sub:
        sonuc.paletler.append({"uid": uid, "psn": psn, "packaging_level": pl})
        for alt in alt_units_el.findall("Unit"):
            alt_pl = alt.findtext("PackagingLevel", "").strip()
            _unit_isle(alt, alt_pl, uid, sonuc, meta_harita)
    else:
        sonuc.hatalar.append(f"Tanimsiz Unit (PL={pl}, UID={uid})")


def _item_isle(item_el, kutu_uid, sonuc, meta_harita):
    uid = item_el.get("UID", "")
    psn = item_el.get("PSN", "")
    sid = item_el.get("SID", "")
    meta = meta_harita.get(sid, {})
    sonuc.urunler.append({
        "uid": uid, "psn": psn, "sid": sid, "kutu_uid": kutu_uid,
        "urun_adi":      meta.get("urun_adi", ""),
        "urun_kodu":     meta.get("urun_kodu", ""),
        "batch":         meta.get("batch", ""),
        "skt":           meta.get("skt", ""),
        "uretim_tarihi": meta.get("uretim_tarihi", ""),
        "agirlik_net":   "000000",
        "agirlik_tip":   "3103",
    })


def _tarih_temizle(tarih):
    if tarih and "+" in tarih:
        return tarih.split("+")[0]
    return tarih


def demo_xml_olustur():
    return """<?xml version="1.0"?>
<Shipment xmlns:xsd="http://www.w3.org/2001/XMLSchema"
          xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
          FileType="FEEM-Std" FileVersion="1.0">
  <MessageID>999999</MessageID><ShipmentNumber>DEMO-001</ShipmentNumber>
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
          </Items>
        </Unit>
      </Units>
    </Unit>
  </Units>
</Shipment>"""
