// GAMALI PATBİS — Tauri Backend v2
// Python bridge ile JSON-RPC over stdin/stdout

use std::io::{BufRead, BufReader, Write};
use std::process::{Child, Command, Stdio};
use std::sync::Mutex;
use tauri::{Manager, State};

// ── Python Bridge State ──

struct PythonBridge {
    child: Child,
    reader: BufReader<std::process::ChildStdout>,
}

impl PythonBridge {
    fn send(&mut self, method: &str, params: serde_json::Value) -> Result<serde_json::Value, String> {
        let request = serde_json::json!({
            "id": 1,
            "method": method,
            "params": params
        });

        let stdin = self.child.stdin.as_mut().ok_or("stdin erişilemedi")?;
        let line = serde_json::to_string(&request).map_err(|e| e.to_string())?;
        writeln!(stdin, "{}", line).map_err(|e| format!("stdin yazma hatası: {}", e))?;
        stdin.flush().map_err(|e| format!("flush hatası: {}", e))?;

        let mut response_line = String::new();
        self.reader
            .read_line(&mut response_line)
            .map_err(|e| format!("stdout okuma hatası: {}", e))?;
        
        if response_line.trim().is_empty() {
            return Err("Python'dan boş cevap geldi (Süreç kapanmış olabilir)".to_string());
        }

        let response: serde_json::Value =
            serde_json::from_str(&response_line).map_err(|e| format!("JSON parse hatası (Gelen: {}): {}", response_line, e))?;

        if let Some(err) = response.get("error") {
            if !err.is_null() {
                if let Some(msg) = err.get("message").and_then(|m| m.as_str()) {
                    return Err(format!("Python hatası: {}", msg));
                }
            }
        }

        Ok(response.get("result").cloned().unwrap_or(serde_json::Value::Null))
    }
}

struct AppState {
    bridge: Mutex<Option<PythonBridge>>,
}

// ── Tauri Commands ──

#[tauri::command]
fn bridge_baslat(app: tauri::AppHandle, state: State<AppState>) -> Result<String, String> {
    let mut guard = state.bridge.lock().map_err(|e| e.to_string())?;

    if guard.is_some() {
        return Ok("Bridge zaten çalışıyor".to_string());
    }

    // 1. Önce Kaynaklar (Resources) klasörüne bak (Prod)
    let mut bridge_path = app.path().resource_dir()
        .unwrap_or_default()
        .join("_up_/src-python/bridge.py"); // Tauri ../ yollarını _up_ olarak paketler

    if !bridge_path.exists() {
        // 2. Resource klasöründe direkt src-python olarak bak
        bridge_path = app.path().resource_dir()
            .unwrap_or_default()
            .join("src-python/bridge.py");
    }

    if !bridge_path.exists() {
        // 3. Geliştirme ortamı (Dev)
        bridge_path = std::env::current_dir().unwrap_or_default().join("src-python/bridge.py");
        if !bridge_path.exists() {
            bridge_path = std::env::current_dir().unwrap_or_default().join("../src-python/bridge.py");
        }
    }

    // Yolu kesinleştir (canonicalize)
    let absolute_bridge_path = bridge_path.canonicalize().map_err(|e| format!("Bridge yolu bulunamadı (Aranan: {:?}): {}", bridge_path, e))?;
    let project_root = absolute_bridge_path.parent().and_then(|p| p.parent()).ok_or("Proje kökü bulunamadı")?;

    // Öncelikli olarak paketlenmiş (embedded) Python'u kullanmaya çalış
    let mut try_paths = Vec::new();
    
    let embedded_python = absolute_bridge_path.parent().map(|p| p.join("python-embed").join("python.exe"));
    if let Some(ref path) = embedded_python {
        if path.exists() {
            if let Some(s) = path.to_str() {
                try_paths.push(s.to_string());
            }
        }
    }

    let venv_python = if cfg!(windows) {
        project_root.join("venv").join("Scripts").join("python.exe")
    } else {
        project_root.join("venv").join("bin").join("python")
    };
    if venv_python.exists() {
        if let Some(s) = venv_python.to_str() {
            try_paths.push(s.to_string());
        }
    }

    // Fallback olarak sistem Python yollarını dene
    let system_paths = if cfg!(windows) {
        vec!["python", "python3", "py"]
    } else {
        vec!["python3", "python"]
    };
    for p in system_paths {
        try_paths.push(p.to_string());
    }

    #[cfg(windows)]
    use std::os::windows::process::CommandExt;

    let mut child = None;
    for py in &try_paths {
        let mut cmd = Command::new(py);
        cmd.arg(&absolute_bridge_path)
            .current_dir(project_root)
            .stdin(Stdio::piped())
            .stdout(Stdio::piped())
            .stderr(Stdio::piped());

        #[cfg(windows)]
        {
            const CREATE_NO_WINDOW: u32 = 0x08000000;
            cmd.creation_flags(CREATE_NO_WINDOW);
        }

        match cmd.spawn() {
            Ok(c) => {
                child = Some(c);
                break;
            }
            Err(_) => continue,
        }
    }

    let mut child = child.ok_or("Python bulunamadı! python3 veya python kurulu olmalı.")?;

    // Startup mesajını oku
    let stdout = child.stdout.take().ok_or("stdout erişilemedi")?;
    let mut reader = BufReader::new(stdout);
    let mut startup_line = String::new();
    reader
        .read_line(&mut startup_line)
        .map_err(|e| format!("Startup okunamadı: {}", e))?;

    let startup: serde_json::Value =
        serde_json::from_str(&startup_line).map_err(|e| format!("Startup parse hatası: {}", e))?;

    if startup.get("ready").and_then(|r| r.as_bool()) != Some(true) {
        return Err("Python bridge başlatılamadı".to_string());
    }

    let versiyon = startup
        .get("versiyon")
        .and_then(|v| v.as_str())
        .unwrap_or("?")
        .to_string();

    *guard = Some(PythonBridge { child, reader });

    Ok(format!("Bridge başlatıldı — v{}", versiyon))
}

/// Genel komut: React → Tauri → Python → Tauri → React
#[tauri::command]
fn python_cagir(
    state: State<AppState>,
    method: String,
    params: serde_json::Value,
) -> Result<serde_json::Value, String> {
    let mut guard = state.bridge.lock().map_err(|e| e.to_string())?;
    let bridge = guard
        .as_mut()
        .ok_or("Bridge başlatılmamış! Önce bridge_baslat çağır.")?;

    bridge.send(&method, params)
}

/// Sağlık kontrolü — Bridge olmadan da çalışır
#[tauri::command]
fn saglik() -> String {
    serde_json::json!({
        "durum": "OK",
        "uygulama": "GAMALI PATBİS",
        "versiyon": "2.1.0",
        "tauri": true
    })
    .to_string()
}

// ── Tauri App ──

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_dialog::init())
        .manage(AppState {
            bridge: Mutex::new(None),
        })
        .invoke_handler(tauri::generate_handler![
            saglik,
            bridge_baslat,
            python_cagir,
        ])
        .setup(|app| {
            #[cfg(debug_assertions)]
            {
                let window = app.get_webview_window("main").unwrap();
                window.open_devtools();
            }
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("GAMALI PATBİS başlatılamadı");
}
