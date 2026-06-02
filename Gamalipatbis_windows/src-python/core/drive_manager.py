"""
GAMALI NEXUS PATBİS — Google Drive Yöneticisi
OAuth2 ile Drive bağlantısı, TXT ve DB yedekleme
"""

import os
import json
import hashlib
from pathlib import Path
from datetime import datetime, date

# Google API
try:
    from google.oauth2.credentials import Credentials
    from google.auth.transport.requests import Request
    from google_auth_oauthlib.flow import InstalledAppFlow
    from googleapiclient.discovery import build
    from googleapiclient.http import MediaFileUpload
    DRIVE_AVAILABLE = True
except ImportError:
    DRIVE_AVAILABLE = False

SCOPES = ['https://www.googleapis.com/auth/drive.file']

CONFIG_DIR  = Path(os.environ.get("PATBIS_CONFIG_DIR", "."))
TOKEN_FILE  = CONFIG_DIR / "drive_token.json"
CREDS_FILE  = CONFIG_DIR / "drive_credentials.json"
CONFIG_FILE = CONFIG_DIR / "patbis_config.json"

# Varsayılan config
DEFAULT_CONFIG = {
    "admin_password_hash": hashlib.sha256("gamali2026".encode()).hexdigest(),
    "drive_folder_name": "GAMALI_PATBIS_YEDEK",
    "drive_folder_id": None,
    "son_yedek_tarihi": None,
}


# ─── Config ─────────────────────────────────────────────────────────────────

def config_yukle() -> dict:
    if CONFIG_FILE.exists():
        try:
            return json.loads(CONFIG_FILE.read_text(encoding='utf-8'))
        except: pass
    config_kaydet(DEFAULT_CONFIG)
    return DEFAULT_CONFIG.copy()


def config_kaydet(config: dict):
    CONFIG_FILE.write_text(
        json.dumps(config, ensure_ascii=False, indent=2),
        encoding='utf-8'
    )


# ─── Şifre ──────────────────────────────────────────────────────────────────

def sifre_kontrol(girilen: str) -> bool:
    config = config_yukle()
    girilen_hash = hashlib.sha256(girilen.encode()).hexdigest()
    return girilen_hash == config.get("admin_password_hash", "")


def sifre_degistir(yeni: str):
    config = config_yukle()
    config["admin_password_hash"] = hashlib.sha256(yeni.encode()).hexdigest()
    config_kaydet(config)


# ─── Drive Bağlantısı ───────────────────────────────────────────────────────

def drive_baglanti():
    """Drive servisini döndür, token yoksa OAuth akışı başlat"""
    if not DRIVE_AVAILABLE:
        raise ImportError("google-api-python-client kurulu değil. pip install google-api-python-client")

    if not CREDS_FILE.exists():
        raise FileNotFoundError(
            f"Google credentials dosyası bulunamadı: {CREDS_FILE}\n"
            "Google Cloud Console'dan credentials.json indirin."
        )

    creds = None
    if TOKEN_FILE.exists():
        try:
            creds = Credentials.from_authorized_user_file(str(TOKEN_FILE), SCOPES)
        except: pass

    if not creds or not creds.valid:
        if creds and creds.expired and creds.refresh_token:
            try:
                creds.refresh(Request())
            except:
                creds = None

        if not creds:
            flow = InstalledAppFlow.from_client_secrets_file(str(CREDS_FILE), SCOPES)
            creds = flow.run_local_server(port=0)

        TOKEN_FILE.write_text(creds.to_json(), encoding='utf-8')

    return build('drive', 'v3', credentials=creds)


def drive_bagli_mi() -> bool:
    """Drive bağlantısı var mı hızlıca kontrol et"""
    if not DRIVE_AVAILABLE or not CREDS_FILE.exists():
        return False
    if not TOKEN_FILE.exists():
        return False
    try:
        creds = Credentials.from_authorized_user_file(str(TOKEN_FILE), SCOPES)
        return creds.valid or (creds.expired and bool(creds.refresh_token))
    except:
        return False


# ─── Klasör Yönetimi ────────────────────────────────────────────────────────

def drive_klasor_bul_veya_olustur(service, klasor_adi: str) -> str:
    """GAMALI_PATBIS_YEDEK klasörünü bul veya oluştur, ID döndür"""
    config = config_yukle()

    # Kayıtlı ID var mı?
    if config.get("drive_folder_id"):
        try:
            service.files().get(fileId=config["drive_folder_id"]).execute()
            return config["drive_folder_id"]
        except: pass

    # Klasörü ara
    q = f"name='{klasor_adi}' and mimeType='application/vnd.google-apps.folder' and trashed=false"
    results = service.files().list(q=q, fields="files(id,name)").execute()
    dosyalar = results.get("files", [])

    if dosyalar:
        folder_id = dosyalar[0]["id"]
    else:
        # Oluştur
        meta = {
            "name": klasor_adi,
            "mimeType": "application/vnd.google-apps.folder"
        }
        f = service.files().create(body=meta, fields="id").execute()
        folder_id = f["id"]

    config["drive_folder_id"] = folder_id
    config_kaydet(config)
    return folder_id


# ─── Dosya Yükleme ──────────────────────────────────────────────────────────

def dosya_yukle(dosya_yolu: str, aciklama: str = "") -> dict:
    """
    Dosyayı Drive'a yükle.
    Döner: {"id": ..., "name": ..., "webViewLink": ...}
    """
    dosya_yolu = Path(dosya_yolu)
    if not dosya_yolu.exists():
        raise FileNotFoundError(f"Dosya bulunamadı: {dosya_yolu}")

    service   = drive_baglanti()
    config    = config_yukle()
    folder_id = drive_klasor_bul_veya_olustur(service, config.get("drive_folder_name", "GAMALI_PATBIS_YEDEK"))

    # MIME type
    if dosya_yolu.suffix.lower() == '.txt':
        mime = 'text/plain'
    elif dosya_yolu.suffix.lower() == '.db':
        mime = 'application/x-sqlite3'
    else:
        mime = 'application/octet-stream'

    # Dosya adına tarih ekle (DB için)
    drive_adi = dosya_yolu.name
    if dosya_yolu.suffix.lower() == '.db':
        tarih = datetime.now().strftime("%Y%m%d_%H%M%S")
        drive_adi = f"{dosya_yolu.stem}_{tarih}{dosya_yolu.suffix}"

    meta = {
        "name": drive_adi,
        "parents": [folder_id],
        "description": aciklama or f"PATBİS yedek — {datetime.now():%d.%m.%Y %H:%M}"
    }

    media = MediaFileUpload(str(dosya_yolu), mimetype=mime, resumable=True)
    f = service.files().create(
        body=meta, media_body=media,
        fields="id,name,webViewLink,size"
    ).execute()

    return f


def gunluk_yedek(db_yolu: str) -> dict:
    """
    Günlük otomatik yedek — bugün zaten yedek alındıysa atla.
    Döner: {"yapildi": bool, "mesaj": str}
    """
    config = config_yukle()
    bugun  = str(date.today())

    if config.get("son_yedek_tarihi") == bugun:
        return {"yapildi": False, "mesaj": f"Bugün ({bugun}) zaten yedeklendi."}

    try:
        sonuc = dosya_yukle(db_yolu, "Günlük otomatik DB yedeği")
        config["son_yedek_tarihi"] = bugun
        config["son_yedek_dosya"]  = sonuc.get("name", "")
        config["son_drive_hata"]   = ""
        config_kaydet(config)
        return {"yapildi": True, "mesaj": f"Yedek alındı: {sonuc['name']}"}
    except Exception as e:
        hata_msg = str(e)
        config["son_drive_hata"] = f"{datetime.now():%d.%m.%Y %H:%M} — {hata_msg}"
        config_kaydet(config)
        return {"yapildi": False, "mesaj": f"Yedek hatası: {hata_msg}"}


def drive_dosyalari_listele(limit: int = 20) -> list:
    """
    GAMALI_PATBIS_YEDEK klasöründeki son dosyaları listele.
    Döner: [{"name", "size", "modifiedTime", "webViewLink"}, ...]
    """
    service   = drive_baglanti()
    config    = config_yukle()
    folder_id = drive_klasor_bul_veya_olustur(service, config.get("drive_folder_name", "GAMALI_PATBIS_YEDEK"))

    results = service.files().list(
        q=f"'{folder_id}' in parents and trashed=false",
        fields="files(id,name,size,modifiedTime,webViewLink)",
        orderBy="modifiedTime desc",
        pageSize=limit
    ).execute()

    return results.get("files", [])
