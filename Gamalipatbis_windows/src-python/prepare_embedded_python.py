import os
import sys
import shutil
import urllib.request
import zipfile
import subprocess
from pathlib import Path

# Config
PYTHON_VERSION = "3.12.3"
DOWNLOAD_URL = f"https://www.python.org/ftp/python/{PYTHON_VERSION}/python-{PYTHON_VERSION}-embed-amd64.zip"
BASE_DIR = Path(__file__).parent.resolve()
EMBED_DIR = BASE_DIR / "python-embed"
ZIP_PATH = BASE_DIR / "python_embed.zip"
REQ_FILE = BASE_DIR.parent / "requirements.txt"

def log(msg):
    print(f"[PREPARE-PYTHON] {msg}", flush=True)

def main():
    # 1. Skip if already exists and works
    exe_path = EMBED_DIR / "python.exe"
    if exe_path.exists():
        log("Embedded Python interpreter already exists. Running integrity check...")
        try:
            res = subprocess.run(
                [str(exe_path), "-c", "import openpyxl, google.oauth2.credentials; print('OK')"],
                capture_output=True, text=True, timeout=5
            )
            if res.stdout.strip() == "OK":
                log("Embedded Python integrity check passed. Skipping setup.")
                return
            else:
                log(f"Integrity check failed: {res.stderr or res.stdout}. Re-installing...")
        except Exception as e:
            log(f"Integrity check failed with error: {e}. Re-installing...")

    # 2. Clean previous directory if exists
    if EMBED_DIR.exists():
        log("Cleaning up old python-embed directory...")
        shutil.rmtree(EMBED_DIR)
    EMBED_DIR.mkdir(parents=True, exist_ok=True)

    # 3. Download official embedded zip
    log(f"Downloading Python {PYTHON_VERSION} Embedded distribution from {DOWNLOAD_URL}...")
    try:
        urllib.request.urlretrieve(DOWNLOAD_URL, ZIP_PATH)
        log("Download complete.")
    except Exception as e:
        log(f"Download failed: {e}")
        sys.exit(1)

    # 4. Extract Zip
    log("Extracting archive...")
    try:
        with zipfile.ZipFile(ZIP_PATH, 'r') as zip_ref:
            zip_ref.extractall(EMBED_DIR)
        log("Extraction complete.")
    except Exception as e:
        log(f"Extraction failed: {e}")
        if ZIP_PATH.exists():
            ZIP_PATH.unlink()
        sys.exit(1)
    finally:
        if ZIP_PATH.exists():
            ZIP_PATH.unlink()

    # 5. Configure python312._pth to enable standard imports and site-packages
    pth_file = EMBED_DIR / "python312._pth"
    if not pth_file.exists():
        # Look for any ._pth file
        pths = list(EMBED_DIR.glob("*._pth"))
        if pths:
            pth_file = pths[0]
        else:
            pth_file = None

    if pth_file and pth_file.exists():
        log(f"Configuring path file: {pth_file.name}")
        content = pth_file.read_text(encoding='utf-8')
        
        # We need to uncomment 'import site' and add 'site-packages'
        new_lines = []
        for line in content.splitlines():
            trimmed = line.strip()
            if trimmed == "#import site":
                new_lines.append("import site")
            else:
                new_lines.append(line)
        
        # Add site-packages folder to path
        if "site-packages" not in new_lines:
            # Add site-packages above or below '.'
            new_lines.append("site-packages")
            
        pth_file.write_text("\n".join(new_lines) + "\n", encoding='utf-8')
        log("Path file successfully configured.")
    else:
        log("WARNING: Could not find path file (*._pth) to configure.")

    # 6. Install dependencies into site-packages
    site_packages = EMBED_DIR / "site-packages"
    site_packages.mkdir(exist_ok=True)
    
    log(f"Installing dependencies from requirements.txt: {REQ_FILE.name}...")
    try:
        # Run local pip to install into targeted site-packages
        cmd = [
            sys.executable, "-m", "pip", "install",
            "-r", str(REQ_FILE),
            "--target", str(site_packages),
            "--no-cache-dir",
            "--only-binary=:all:"
        ]
        log(f"Running pip command: {' '.join(cmd)}")
        res = subprocess.run(cmd, capture_output=True, text=True, check=True)
        log("Pip installation completed successfully.")
    except subprocess.CalledProcessError as e:
        log(f"Pip installation failed! Error output:\n{e.stderr or e.stdout}")
        sys.exit(1)

    # 7. Size Optimization (Pruning googleapiclient discovery cache and __pycache__)
    log("Optimizing package size...")
    
    # Prune googleapiclient discovery cache
    documents_dir = site_packages / "googleapiclient" / "discovery_cache" / "documents"
    if documents_dir.exists():
        log("Pruning unused googleapiclient discovery cache JSON files...")
        removed_api_count = 0
        for f in documents_dir.glob("*.json"):
            if "drive" not in f.name.lower():
                try:
                    f.unlink()
                    removed_api_count += 1
                except Exception:
                    pass
        log(f"Removed {removed_api_count} unused discovery JSON files.")

    pruned_count = 0
    for pycache in EMBED_DIR.rglob("__pycache__"):
        if pycache.is_dir():
            shutil.rmtree(pycache)
            pruned_count += 1
    log(f"Cleaned {pruned_count} __pycache__ directories.")

    # Verify installation
    try:
        res = subprocess.run(
            [str(exe_path), "-c", "import openpyxl, google.oauth2.credentials; print('VERIFIED')"],
            capture_output=True, text=True, timeout=5
        )
        if res.stdout.strip() == "VERIFIED":
            log("Embedded Python verified successfully! Ready to bundle.")
        else:
            log(f"Warning: Verification script did not return expected value: {res.stderr or res.stdout}")
    except Exception as e:
        log(f"Warning: Verification failed with error: {e}")

if __name__ == "__main__":
    main()
