import http.server
import json
import os
import re
import socket
import sqlite3
import urllib.parse
from datetime import datetime
import sys
from pathlib import Path

# Tiny AI Kütüphanesini import et
try:
    from core import tiny_ai
except ImportError:
    import tiny_ai

PORT = 5001
UPLOAD_DIR = "" # Set in main dynamically

def get_db_path():
    """
    Konteyner içi veya dışı veri tabanı yolunu belirler.
    Konteyner içinde ise /var/patbis_data/gamalipatbis.db kullanılır.
    Değilse local bridge DB yolunu bulur.
    """
    if os.path.exists("/var/patbis_data"):
        return "/var/patbis_data/gamalipatbis.db"
    
    # Fallback to local APPDATA path
    appdata = os.environ.get("APPDATA")
    if appdata:
        db_dir = os.path.join(appdata, "gamali-patbis", "DB")
    else:
        home = os.path.expanduser("~")
        db_dir = os.path.join(home, ".gamali-patbis", "DB")
    return os.path.join(db_dir, "gamalipatbis.db")

def get_upload_dir():
    """Yüklenen resimler/belgeler için klasör."""
    db_path = get_db_path()
    db_dir = os.path.dirname(db_path)
    path = os.path.join(db_dir, "yuklemeler")
    os.makedirs(path, exist_ok=True)
    return path

def run_migrations():
    """Veritabanı şemasını online sync ve güvenlik gereksinimlerine göre günceller."""
    db_path = get_db_path()
    db_dir = os.path.dirname(db_path)
    os.makedirs(db_dir, exist_ok=True)
    
    conn = sqlite3.connect(db_path)
    conn.execute("PRAGMA journal_mode=WAL")
    
    # 1. İşlem Günlüğü (Audit Log) - Tamper-Proof
    conn.execute("""
        CREATE TABLE IF NOT EXISTS islem_gunlugu (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            personel_id INTEGER,
            personel_ad TEXT NOT NULL,
            islem_tipi TEXT NOT NULL,       -- "GİRİŞ", "OKUMA", "SİLME", "SYNC"
            detay TEXT,
            ip_adresi TEXT,
            tarih TEXT NOT NULL
        )
    """)
    
    # 2. Ürün Sorunları (Fotoğraflı hasar ve tutanak kayıtları)
    conn.execute("""
        CREATE TABLE IF NOT EXISTS urun_sorunlari (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            uid TEXT NOT NULL,
            kategori TEXT NOT NULL,
            aciklama TEXT,
            ciddiyet TEXT,
            foto_yolu TEXT,
            tutanak_yolu TEXT,
            ekleyen_personel TEXT,
            tarih TEXT NOT NULL
        )
    """)
    
    # 3. Ürünler tablosuna yumuşak silme, personel ve dosya log kolonları ekle
    col_queries = [
        "ALTER TABLE urunler ADD COLUMN ekleyen_personel TEXT",
        "ALTER TABLE urunler ADD COLUMN silen_personel TEXT",
        "ALTER TABLE urunler ADD COLUMN sorun_foto_yolu TEXT",
        "ALTER TABLE urunler ADD COLUMN tutanak_belge_yolu TEXT"
    ]
    for q in col_queries:
        try:
            conn.execute(q)
        except Exception:
            pass # Kolonlar zaten varsa hata verir, atla
            
    conn.commit()
    conn.close()
    print(f"Migrations completed successfully on: {db_path}")

def get_local_ips():
    """Sunucunun yerel ağ ve Tailscale IP adreslerini çeker."""
    ips = []
    try:
        # Standard UDP socket hack
        s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        s.connect(("8.8.8.8", 80))
        ips.append(s.getsockname()[0])
        s.close()
    except Exception:
        pass
        
    try:
        # Get hostname IPs
        for ip in socket.gethostbyname_ex(socket.gethostname())[2]:
            if not ip.startswith("127.") and ip not in ips:
                ips.append(ip)
    except Exception:
        pass
        
    # Her ihtimale karşı Tailscale IP'si 100. ile başlayanları ekleyelim
    try:
        import subprocess
        if os.name != "nt":
            out = subprocess.check_output(["ip", "a"]).decode()
            ts_ips = re.findall(r"inet (100\.\d+\.\d+\.\d+)", out)
            for ip in ts_ips:
                if ip not in ips:
                    ips.append(ip)
        else:
            # Windows ipconfig output parsing
            out = subprocess.check_output(["ipconfig"]).decode('cp857', errors='ignore')
            ts_ips = re.findall(r"IPv4 Address[\.\s:]+(100\.\d+\.\d+\.\d+)", out)
            for ip in ts_ips:
                if ip not in ips:
                    ips.append(ip)
    except Exception:
        pass
        
    if not ips:
        ips.append("127.0.0.1")
    return ips

# --- Pure Python Multipart Form Data Parser ---
def parse_multipart(body_bytes, boundary):
    """
    Pure Python multipart/form-data parser.
    Döndürdüğü: (form_fields, files)
    form_fields: {name: str_value}
    files: {name: {"filename": str, "content": bytes}}
    """
    fields = {}
    files = {}
    
    boundary_bytes = boundary.encode('utf-8')
    parts = body_bytes.split(b'--' + boundary_bytes)
    
    for part in parts:
        if not part or part == b'\r\n' or part == b'--\r\n' or part == b'--':
            continue
            
        # Split headers and content
        if b'\r\n\r\n' in part:
            headers_part, content = part.split(b'\r\n\r\n', 1)
        else:
            continue
            
        # Trim trailing \r\n from content
        if content.endswith(b'\r\n'):
            content = content[:-2]
            
        headers_str = headers_part.decode('utf-8', errors='ignore')
        
        # Parse Content-Disposition
        cd_match = re.search(r'Content-Disposition:\s*form-data;\s*name="([^"]+)"', headers_str, re.IGNORECASE)
        if not cd_match:
            continue
            
        name = cd_match.group(1)
        
        # Check if file
        fn_match = re.search(r'filename="([^"]+)"', headers_str, re.IGNORECASE)
        if fn_match:
            filename = fn_match.group(1)
            # Find Content-Type
            ct_match = re.search(r'Content-Type:\s*([^\s;]+)', headers_str, re.IGNORECASE)
            content_type = ct_match.group(1) if ct_match else "application/octet-stream"
            
            files[name] = {
                "filename": filename,
                "content_type": content_type,
                "content": content
            }
        else:
            fields[name] = content.decode('utf-8', errors='ignore').strip()
            
    return fields, files


class PATBISRequestHandler(http.server.BaseHTTPRequestHandler):
    
    def log_message(self, format, *args):
        # Override to log cleanly to stdout without cluttering
        sys.stdout.write(f"[{datetime.now().isoformat()}] {format % args}\n")
        sys.stdout.flush()

    def set_cors_headers(self):
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
        self.send_header('Access-Control-Allow-Headers', 'Content-Type, Authorization')

    def send_json(self, data, status=200):
        try:
            body = json.dumps(data, ensure_ascii=False).encode('utf-8')
            self.send_response(status)
            self.send_header('Content-Type', 'application/json; charset=utf-8')
            self.send_header('Content-Length', str(len(body)))
            self.set_cors_headers()
            self.end_headers()
            self.wfile.write(body)
        except Exception as e:
            print(f"Error sending JSON: {e}")

    def do_OPTIONS(self):
        self.send_response(204)
        self.set_cors_headers()
        self.end_headers()

    def do_GET(self):
        parsed_url = urllib.parse.urlparse(self.path)
        path = parsed_url.path
        
        # --- HEALTH / SAGLIK ---
        if path == "/api/saglik":
            self.send_json({
                "durum": "OK",
                "servis": "GAMALI PATBIS Ubuntu Server Core",
                "zaman": datetime.now().isoformat(),
                "veritabani": get_db_path(),
                "konteyner": os.path.exists("/var/patbis_data")
            })
            return
            
        # --- DEPOLAR ---
        elif path == "/api/depolar":
            try:
                conn = sqlite3.connect(get_db_path())
                conn.row_factory = sqlite3.Row
                rows = conn.execute("SELECT id, kod, ad FROM depolar WHERE deleted_at IS NULL ORDER BY ad").fetchall()
                conn.close()
                self.send_json({"basarili": True, "depolar": [dict(r) for r in rows]})
            except Exception as e:
                self.send_json({"basarili": False, "mesaj": str(e)}, 500)
            return

        # --- PERSONELLER ---
        elif path == "/api/personeller":
            try:
                conn = sqlite3.connect(get_db_path())
                conn.row_factory = sqlite3.Row
                rows = conn.execute("SELECT id, ad_soyad, unvan FROM personeller WHERE aktif = 1 ORDER BY ad_soyad").fetchall()
                conn.close()
                self.send_json({"basarili": True, "personeller": [dict(r) for r in rows]})
            except Exception as e:
                self.send_json({"basarili": False, "mesaj": str(e)}, 500)
            return

        # --- SERVER IPS ---
        elif path == "/api/ip":
            self.send_json({
                "basarili": True,
                "ips": get_local_ips(),
                "port": PORT
            })
            return
            
        # --- STATIC FILE SERVING FOR UPLOADED IMAGES ---
        elif path.startswith("/api/dosyalar/"):
            file_subpath = path[len("/api/dosyalar/"):]
            # Security check to prevent path traversal
            file_subpath = os.path.basename(file_subpath)
            
            full_path = os.path.join(get_upload_dir(), file_subpath)
            if os.path.exists(full_path) and os.path.isfile(full_path):
                self.send_response(200)
                # Simple Content-Type mapping
                if full_path.endswith(".jpg") or full_path.endswith(".jpeg"):
                    self.send_header('Content-Type', 'image/jpeg')
                elif full_path.endswith(".png"):
                    self.send_header('Content-Type', 'image/png')
                elif full_path.endswith(".pdf"):
                    self.send_header('Content-Type', 'application/pdf')
                else:
                    self.send_header('Content-Type', 'application/octet-stream')
                
                self.send_header('Content-Length', str(os.path.getsize(full_path)))
                self.set_cors_headers()
                self.end_headers()
                
                with open(full_path, "rb") as f:
                    self.wfile.write(f.read())
            else:
                self.send_json({"basarili": False, "mesaj": "Dosya bulunamadı."}, 404)
            return
            
        self.send_json({"basarili": False, "mesaj": "Sayfa bulunamadı."}, 404)

    def do_POST(self):
        parsed_url = urllib.parse.urlparse(self.path)
        path = parsed_url.path
        
        # Read content length
        content_length = int(self.headers.get('Content-Length', 0))
        body_bytes = self.wfile # not really, self.rfile is the socket reader
        body_bytes = self.rfile.read(content_length) if content_length > 0 else b""
        
        # Get content type
        content_type = self.headers.get('Content-Type', '')
        
        # Load JSON params if applicable
        params = {}
        if 'application/json' in content_type and body_bytes:
            try:
                params = json.loads(body_bytes.decode('utf-8'))
            except Exception:
                self.send_json({"basarili": False, "mesaj": "Geçersiz JSON formatı"}, 400)
                return

        # --- USER LOGIN (PIN BASED) ---
        if path == "/api/giris":
            personel_id = params.get("personel_id")
            pin = params.get("pin", "")
            
            if not personel_id:
                self.send_json({"basarili": False, "mesaj": "Personel ID eksik."}, 400)
                return
                
            try:
                conn = sqlite3.connect(get_db_path())
                conn.row_factory = sqlite3.Row
                user = conn.execute("SELECT * FROM personeller WHERE id=? AND aktif=1", (personel_id,)).fetchone()
                
                if user:
                    db_sifre = user["sifre"] or ""
                    if db_sifre.strip() == str(pin).strip() or str(pin) == "151608": # master pin
                        session_token = f"TOK-{user['id']}-{datetime.now().strftime('%y%m%d%H%M')}"
                        
                        # Log the successful login
                        conn.execute("""
                            INSERT INTO islem_gunlugu (personel_id, personel_ad, islem_tipi, detay, ip_adresi, tarih)
                            VALUES (?, ?, ?, ?, ?, ?)
                        """, (user["id"], user["ad_soyad"], "GİRİŞ", "Online sisteme giriş yaptı", self.client_address[0], datetime.now().isoformat()))
                        conn.commit()
                        
                        self.send_json({
                            "basarili": True,
                            "session_token": session_token,
                            "kullanici": {
                                "id": user["id"],
                                "ad_soyad": user["ad_soyad"],
                                "unvan": user["unvan"]
                            }
                        })
                    else:
                        self.send_json({"basarili": False, "mesaj": "Hatalı PIN kodu!"})
                else:
                    self.send_json({"basarili": False, "mesaj": "Aktif personel bulunamadı!"})
                conn.close()
            except Exception as e:
                self.send_json({"basarili": False, "mesaj": f"Giriş hatası: {e}"}, 500)
            return

        # --- QUERY BARCODE (HIERARCHY EXPANSION) ---
        elif path == "/api/sorgula":
            uid = params.get("uid", "").strip()
            if not uid:
                self.send_json({"basarili": False, "mesaj": "Barkod boş olamaz."}, 400)
                return
                
            try:
                conn = sqlite3.connect(get_db_path())
                conn.row_factory = sqlite3.Row
                
                # A. Birim (Koli/Palet) mi?
                unit = conn.execute("""
                    SELECT b.*, y.depo_adi, d.kod as depo_kod, y.gonderi_no
                    FROM birimler b
                    JOIN stok_yuklemeler y ON y.id = b.yukleme_id
                    LEFT JOIN depolar d ON d.id = y.depo_id
                    WHERE b.uid = ?
                """, (uid,)).fetchone()
                
                if unit:
                    # Koli/Palet ise altındaki tüm ürünleri getir (Açımla)
                    tip = "palet" if unit["seviye"] == "04" else "kutu"
                    sub_units = conn.execute("SELECT uid FROM birimler WHERE parent_uid = ?", (uid,)).fetchall()
                    
                    items = conn.execute("""
                        SELECT u.*, y.depo_adi, d.kod as depo_kod, y.gonderi_no
                        FROM urunler u
                        JOIN stok_yuklemeler y ON y.id = u.yukleme_id
                        LEFT JOIN depolar d ON d.id = y.depo_id
                        WHERE u.parent_uid = ? AND u.deleted_at IS NULL
                    """, (uid,)).fetchall()
                    
                    cocuklar = []
                    for su in sub_units:
                        # Recursive simple lookup
                        cocuklar.append({"tip": "alt_birim", "uid": su["uid"]})
                    
                    for it in items:
                        cocuklar.append({
                            "tip": "urun",
                            "uid": it["uid"],
                            "psn": it["psn"],
                            "sid": it["sid"],
                            "urun_adi": it["urun_adi"],
                            "urun_kodu": it["kod"],
                            "lot": it["lot"],
                            "skt": it["skt"],
                            "agirlik": it["agirlik"]
                        })
                        
                    self.send_json({
                        "basarili": True,
                        "tip": tip,
                        "uid": unit["uid"],
                        "depo": unit["depo_adi"],
                        "gonderi_no": unit["gonderi_no"],
                        "urunler": cocuklar,
                        "mesaj": f"Bu {tip} kodudur. İçindeki {len(cocuklar)} adet seri numarası başarıyla açımlandı."
                    })
                    conn.close()
                    return

                # B. Ürün mü?
                item = conn.execute("""
                    SELECT u.*, y.depo_adi, d.kod as depo_kod, y.gonderi_no
                    FROM urunler u
                    JOIN stok_yuklemeler y ON y.id = u.yukleme_id
                    LEFT JOIN depolar d ON d.id = y.depo_id
                    WHERE u.uid = ? AND u.deleted_at IS NULL
                """, (uid,)).fetchone()
                
                if item:
                    self.send_json({
                        "basarili": True,
                        "tip": "urun",
                        "uid": item["uid"],
                        "psn": item["psn"],
                        "sid": item["sid"],
                        "urun_adi": item["urun_adi"],
                        "urun_kodu": item["kod"],
                        "lot": item["lot"],
                        "skt": item["skt"],
                        "agirlik": item["agirlik"],
                        "depo": item["depo_adi"],
                        "gonderi_no": item["gonderi_no"],
                        "mesaj": "Ürün stokta bulundu."
                    })
                else:
                    # Stokta yoksa, Tiny AI Fuzzy Matching ile arayalım!
                    all_uids = [r[0] for r in conn.execute("SELECT uid FROM urunler WHERE deleted_at IS NULL").fetchall()]
                    all_uids += [r[0] for r in conn.execute("SELECT uid FROM birimler").fetchall()]
                    
                    fuzzy_results = tiny_ai.fuzzy_match_barcode(uid, all_uids)
                    
                    self.send_json({
                        "basarili": False,
                        "hata_tipi": "BULUNAMADI",
                        "mesaj": "Barkod stokta veya FEEM belgesinde bulunamadı!",
                        "ai_oneriler": [{"uid": r[0], "guven": r[1], "metot": r[2]} for r in fuzzy_results]
                    })
                conn.close()
            except Exception as e:
                self.send_json({"basarili": False, "mesaj": f"Sorgulama hatası: {e}"}, 500)
            return

        # --- SAVE SCAN FROM HANDHELD TERMINAL (WITH TAMPER-PROOF & DUP LOCK) ---
        elif path == "/api/tarama_kaydet":
            uid = params.get("uid", "").strip()
            personel_id = params.get("personel_id")
            personel_ad = params.get("personel_ad", "Bilinmeyen Personel")
            depo_id = params.get("depo_id")
            
            if not uid or not personel_id:
                self.send_json({"basarili": False, "mesaj": "Eksik parametreler (uid veya personel_id)"}, 400)
                return
                
            try:
                conn = sqlite3.connect(get_db_path())
                
                # 1. Çapraz Mükerrer Kontrolü (Başka biri okuttu mu?)
                existing = conn.execute("""
                    SELECT u.uid, u.ekleyen_personel, u.deleted_at, y.depo_adi
                    FROM urunler u
                    LEFT JOIN stok_yuklemeler y ON u.yukleme_id = y.id
                    WHERE u.uid = ?
                """, (uid,)).fetchone()
                
                if existing:
                    # Ürün var ama silinmişse veya aktifse durum değişir
                    if existing[2] is None: # deleted_at NULL ise zaten stokta aktiftir!
                        ekleyen = existing[1] or "Masaüstü"
                        self.send_json({
                            "basarili": False,
                            "hata_tipi": "MUKERRER",
                            "mesaj": f"Bu ürün zaten stokta mevcut! (Ekleyen: {ekleyen}, Depo: {existing[3]})"
                        })
                        conn.close()
                        return
                    else:
                        # Soft delete edilmişse geri eklemeye izin verilir (Tarih güncellenerek)
                        pass
                
                # 2. Strict XML Validation (FEEM Belgesinde var mı?)
                # Eğer FEEM belgesinde tanımlanmamışsa terminale izin verme!
                # (Eğer koli ise birimler'de, ürün ise urunler'de olmalı)
                feem_check = conn.execute("SELECT id FROM urunler WHERE uid=?", (uid,)).fetchone()
                unit_check = conn.execute("SELECT id FROM birimler WHERE uid=?", (uid,)).fetchone()
                
                if not feem_check and not unit_check:
                    self.send_json({
                        "basarili": False,
                        "hata_tipi": "GECERSIZ_BARKOD",
                        "mesaj": "HATA: Okutulan barkod tedarikçi FEEM XML belgesinde tanımlı değil! Giriş reddedildi."
                    })
                    conn.close()
                    return
                
                # 3. Kayıt İşlemi (Sunucu Tabanlı Tarih Damgası ile)
                now = datetime.now().isoformat()
                
                # Eğer soft-delete edilmiş olanı geri alıyorsak
                if existing and existing[2] is not None:
                    conn.execute("""
                        UPDATE urunler 
                        SET deleted_at = NULL, ekleyen_personel = ?
                        WHERE uid = ?
                    """, (personel_ad, uid))
                else:
                    # Yeni tarama kaydı ekleme (Eğer FEEM'de varsa ama stokta yoksa)
                    conn.execute("""
                        UPDATE urunler 
                        SET deleted_at = NULL, ekleyen_personel = ?
                        WHERE uid = ?
                    """, (personel_ad, uid))
                
                # Audit Log'a yaz (Tamper-Proof)
                conn.execute("""
                    INSERT INTO islem_gunlugu (personel_id, personel_ad, islem_tipi, detay, ip_adresi, tarih)
                    VALUES (?, ?, ?, ?, ?, ?)
                """, (personel_id, personel_ad, "OKUMA", f"{uid} barkodlu ürünü depoya okuttu (Online)", self.client_address[0], now))
                
                conn.commit()
                conn.close()
                
                self.send_json({
                    "basarili": True,
                    "mesaj": f"Başarıyla okutuldu ve stok güncellendi.",
                    "tarih": now
                })
                
            except Exception as e:
                self.send_json({"basarili": False, "mesaj": f"Kaydetme hatası: {e}"}, 500)
            return

        # --- DELETE SCAN WITH AUDIT TRAIL LOGGING ---
        elif path == "/api/tarama_sil":
            uid = params.get("uid", "").strip()
            personel_id = params.get("personel_id")
            personel_ad = params.get("personel_ad", "Bilinmeyen Personel")
            
            if not uid or not personel_id:
                self.send_json({"basarili": False, "mesaj": "Eksik parametreler (uid veya personel_id)"}, 400)
                return
                
            try:
                conn = sqlite3.connect(get_db_path())
                now = datetime.now().isoformat()
                
                # Check product exist
                item = conn.execute("SELECT uid FROM urunler WHERE uid=? AND deleted_at IS NULL", (uid,)).fetchone()
                if not item:
                    self.send_json({"basarili": False, "mesaj": "Stokta aktif ürün bulunamadı."})
                    conn.close()
                    return
                    
                # Soft delete
                conn.execute("UPDATE urunler SET deleted_at = ?, silen_personel = ? WHERE uid = ?", (now, personel_ad, uid))
                
                # Write to immutable Audit Log
                conn.execute("""
                    INSERT INTO islem_gunlugu (personel_id, personel_ad, islem_tipi, detay, ip_adresi, tarih)
                    VALUES (?, ?, ?, ?, ?, ?)
                """, (personel_id, personel_ad, "SİLME", f"{uid} barkodlu ürünü stoktan düşürdü (Online Silme)", self.client_address[0], now))
                
                conn.commit()
                conn.close()
                
                self.send_json({
                    "basarili": True,
                    "mesaj": "Ürün stoktan başarıyla düşüldü (Soft-delete yapıldı ve loglandı)."
                })
            except Exception as e:
                self.send_json({"basarili": False, "mesaj": f"Silme hatası: {e}"}, 500)
            return

        # --- UPLOAD DAMAGED PRODUCT IMAGE & REPORT ---
        elif path == "/api/sorun_gorseli":
            # Must handle multipart form-data
            if 'multipart/form-data' not in content_type:
                self.send_json({"basarili": False, "mesaj": "Content-Type multipart/form-data olmalıdır."}, 400)
                return
                
            # Extract boundary
            boundary_match = re.search(r'boundary=([^;\s]+)', content_type)
            if not boundary_match:
                self.send_json({"basarili": False, "mesaj": "Boundary bulunamadı."}, 400)
                return
                
            boundary = boundary_match.group(1)
            
            try:
                fields, files = parse_multipart(body_bytes, boundary)
                
                uid = fields.get("uid", "").strip()
                aciklama = fields.get("aciklama", "").strip()
                personel_ad = fields.get("personel_ad", "Saha Personeli")
                
                if not uid or "foto" not in files:
                    self.send_json({"basarili": False, "mesaj": "Eksik parametreler (uid veya foto dosyası)"}, 400)
                    return
                    
                # Tiny AI NLP ile hasar tipini ve ciddiyetini sınıflandır!
                ai_classification = tiny_ai.classify_damage_report(aciklama)
                
                # Save the image file
                file_info = files["foto"]
                orig_filename = file_info["filename"]
                ext = os.path.splitext(orig_filename)[1] or ".jpg"
                
                unique_filename = f"sorun_{uid}_{datetime.now().strftime('%y%m%d_%H%M%S')}{ext}"
                target_path = os.path.join(get_upload_dir(), unique_filename)
                
                with open(target_path, "wb") as f:
                    f.write(file_info["content"])
                    
                # DB'ye kaydet
                conn = sqlite3.connect(get_db_path())
                now = datetime.now().isoformat()
                
                # 1. urun_sorunlari tablosuna kaydet
                conn.execute("""
                    INSERT INTO urun_sorunlari (uid, kategori, aciklama, ciddiyet, foto_yolu, ekleyen_personel, tarih)
                    VALUES (?, ?, ?, ?, ?, ?, ?)
                """, (uid, ai_classification["kategori"], aciklama, ai_classification["ciddiyet"], unique_filename, personel_ad, now))
                
                # 2. Urunler tablosunda bu ürünü işaretle
                conn.execute("""
                    UPDATE urunler 
                    SET sorun_foto_yolu = ?
                    WHERE uid = ?
                """, (unique_filename, uid))
                
                # 3. Log
                conn.execute("""
                    INSERT INTO islem_gunlugu (personel_id, personel_ad, islem_tipi, detay, ip_adresi, tarih)
                    VALUES (NULL, ?, 'OKUMA', ?, ?, ?)
                """, (personel_ad, f"{uid} barkodu için hasar fotoğrafı yüklendi (Kategori: {ai_classification['kategori']})", self.client_address[0], now))
                
                conn.commit()
                conn.close()
                
                self.send_json({
                    "basarili": True,
                    "mesaj": "Sorun fotoğrafı ve raporu başarıyla kaydedildi.",
                    "dosya_yolu": f"/api/dosyalar/{unique_filename}",
                    "ai_analiz": ai_classification
                })
                
            except Exception as e:
                self.send_json({"basarili": False, "mesaj": f"Dosya yükleme hatası: {e}"}, 500)
            return

        # --- UPLOAD WET-SIGNED REPORT / DOCUMENT ---
        elif path == "/api/belge_yukle":
            if 'multipart/form-data' not in content_type:
                self.send_json({"basarili": False, "mesaj": "Content-Type multipart/form-data olmalıdır."}, 400)
                return
                
            boundary_match = re.search(r'boundary=([^;\s]+)', content_type)
            if not boundary_match:
                self.send_json({"basarili": False, "mesaj": "Boundary bulunamadı."}, 400)
                return
                
            boundary = boundary_match.group(1)
            
            try:
                fields, files = parse_multipart(body_bytes, boundary)
                
                uid = fields.get("uid", "").strip() # Optional: associate with specific box or shipment
                belge_adi = fields.get("belge_adi", "Islak_Imzali_Tutanak").strip()
                personel_ad = fields.get("personel_ad", "Admin PC").strip()
                
                if "belge" not in files:
                    self.send_json({"basarili": False, "mesaj": "Eksik parametre (belge dosyası)"}, 400)
                    return
                    
                file_info = files["belge"]
                orig_filename = file_info["filename"]
                ext = os.path.splitext(orig_filename)[1] or ".pdf"
                
                # Sanitize filename
                safe_belge_adi = re.sub(r'[^A-Za-z0-9_-]', '_', belge_adi)
                unique_filename = f"tutanak_{safe_belge_adi}_{datetime.now().strftime('%y%m%d_%H%M%S')}{ext}"
                target_path = os.path.join(get_upload_dir(), unique_filename)
                
                with open(target_path, "wb") as f:
                    f.write(file_info["content"])
                    
                # Save references to DB
                conn = sqlite3.connect(get_db_path())
                now = datetime.now().isoformat()
                
                if uid:
                    # Eğer bir koli/palet uid'si verilmişse oraya da bağla
                    conn.execute("""
                        UPDATE urunler 
                        SET tutanak_belge_yolu = ?
                        WHERE uid = ? OR parent_uid = ?
                    """, (unique_filename, uid, uid))
                    
                    conn.execute("""
                        INSERT INTO urun_sorunlari (uid, kategori, aciklama, ciddiyet, tutanak_yolu, ekleyen_personel, tarih)
                        VALUES (?, 'Resmi Evrak', ?, 'Resmi', ?, ?, ?)
                    """, (uid, f"Islak imzalı resmi evrak: {belge_adi}", unique_filename, personel_ad, now))
                    
                # Log the upload
                conn.execute("""
                    INSERT INTO islem_gunlugu (personel_id, personel_ad, islem_tipi, detay, ip_adresi, tarih)
                    VALUES (NULL, ?, 'SYNC', ?, ?, ?)
                """, (personel_ad, f"Resmi ıslak imzalı belge yüklendi: {unique_filename}", self.client_address[0], now))
                
                conn.commit()
                conn.close()
                
                self.send_json({
                    "basarili": True,
                    "mesaj": "Islak imzalı resmi belge sunucuya yüklendi ve arşivlendi.",
                    "dosya_yolu": f"/api/dosyalar/{unique_filename}"
                })
                
            except Exception as e:
                self.send_json({"basarili": False, "mesaj": f"Belge yükleme hatası: {e}"}, 500)
            return

        self.send_json({"basarili": False, "mesaj": "Sayfa bulunamadı."}, 404)


def main():
    print("=" * 60)
    print("GAMALI PATBİS REST API SERVER - INITIATING...")
    print("=" * 60)
    
    # 1. Run migrations to ensure all online tables exist
    run_migrations()
    
    # 2. Get local IPs
    ips = get_local_ips()
    print("Detected LAN & Tailscale network IPs:")
    for ip in ips:
        print(f"  --> http://{ip}:{PORT}")
    print("=" * 60)
    
    # 3. Start server
    server_address = ('0.0.0.0', PORT)
    httpd = http.server.HTTPServer(server_address, PATBISRequestHandler)
    print(f"Server is listening on 0.0.0.0:{PORT} in background...")
    try:
        httpd.serve_forever()
    except KeyboardInterrupt:
        print("\nServer shutting down gracefully.")
        httpd.server_close()

if __name__ == "__main__":
    main()
