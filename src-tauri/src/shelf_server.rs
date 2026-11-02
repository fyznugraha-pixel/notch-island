use std::fs::File;
use std::io::{Read, Write};
use std::net::UdpSocket;
use std::path::PathBuf;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex};
use std::time::{Duration, Instant, SystemTime, UNIX_EPOCH};
use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Emitter};
use tiny_http::{Header, Method, Response, Server, StatusCode};

#[derive(Clone, Serialize, Deserialize, Debug)]
pub struct ShelfFileMeta {
    pub name: String,
    pub size: u64,
    pub size_formatted: String,
    pub path: String,
}

#[derive(Clone, Serialize, Deserialize, Debug)]
pub struct ShelfSessionInfo {
    pub token: String,
    pub url: String,
    pub port: u16,
    pub local_ip: String,
    pub expires_in_sec: u64,
    pub mode: String, // "send" | "receive"
    pub files: Option<Vec<ShelfFileMeta>>,
    pub computer_name: String,
}

#[derive(Clone, Serialize, Deserialize, Debug)]
pub struct ShelfTransferProgressPayload {
    pub id: String,
    pub name: String,
    pub size: u64,
    pub transferred: u64,
    pub progress: u8,
    pub status: String, // "transferring" | "completed" | "error"
    pub device_name: String,
    pub speed_formatted: Option<String>,
}

#[derive(Clone, Serialize, Deserialize, Debug)]
pub struct ShelfFileReceivedPayload {
    pub id: String,
    pub name: String,
    pub path: String,
    pub ext: String,
    pub size: u64,
    pub size_formatted: String,
    pub device_name: String,
    pub added_at: u64,
    pub thumbnail: Option<String>,
}

#[derive(Clone, Serialize, Deserialize, Debug)]
pub struct ShelfTransferCompletedPayload {
    pub device_name: String,
    pub total_files: usize,
    pub total_bytes: u64,
}

#[derive(Clone)]
enum ActiveSession {
    Send {
        token: String,
        created_at: Instant,
        files: Vec<ShelfFileMeta>,
    },
    Receive {
        token: String,
        created_at: Instant,
        target_dir: PathBuf,
    },
}

struct ServerManager {
    server: Option<Arc<Server>>,
    #[allow(dead_code)]
    is_running: Arc<AtomicBool>,
    active_session: Arc<Mutex<Option<ActiveSession>>>,
    port: u16,
}

static SERVER_MANAGER: Mutex<Option<ServerManager>> = Mutex::new(None);

fn now_millis() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_millis() as u64
}

pub fn format_file_size(bytes: u64) -> String {
    if bytes < 1024 {
        format!("{} B", bytes)
    } else if bytes < 1024 * 1024 {
        format!("{:.1} KB", bytes as f64 / 1024.0)
    } else if bytes < 1024 * 1024 * 1024 {
        format!("{:.1} MB", bytes as f64 / (1024.0 * 1024.0))
    } else {
        format!("{:.2} GB", bytes as f64 / (1024.0 * 1024.0 * 1024.0))
    }
}

pub fn get_local_ip() -> String {
    // 1. Try UDP routing to determine primary network adapter
    if let Ok(socket) = UdpSocket::bind("0.0.0.0:0") {
        if socket.connect("8.8.8.8:80").is_ok() {
            if let Ok(addr) = socket.local_addr() {
                let ip = addr.ip().to_string();
                if !ip.starts_with("127.") {
                    return ip;
                }
            }
        }
    }

    // 2. Fallback to common router gateway route check
    for test_target in &["192.168.1.1:80", "192.168.0.1:80", "10.0.0.1:80"] {
        if let Ok(socket) = UdpSocket::bind("0.0.0.0:0") {
            if socket.connect(test_target).is_ok() {
                if let Ok(addr) = socket.local_addr() {
                    let ip = addr.ip().to_string();
                    if !ip.starts_with("127.") {
                        return ip;
                    }
                }
            }
        }
    }

    "127.0.0.1".to_string()
}

pub fn get_computer_name() -> String {
    std::env::var("COMPUTERNAME")
        .or_else(|_| std::env::var("HOSTNAME"))
        .unwrap_or_else(|_| "LAPTOP-GILI".to_string())
}

fn generate_token() -> String {
    let charset = "abcdefghjkmnpqrstuvwxyz23456789";
    let now = now_millis();
    let mut rand_val = (now ^ (now >> 7)) as u32;
    let mut token = String::new();
    for _ in 0..7 {
        rand_val = rand_val.wrapping_mul(1103515245).wrapping_add(12345);
        let idx = (rand_val as usize) % charset.len();
        token.push(charset.chars().nth(idx).unwrap_or('x'));
    }
    token
}

fn detect_device_name(user_agent: &str, device_param: Option<&str>) -> String {
    if let Some(param) = device_param {
        let trimmed = param.trim();
        if !trimmed.is_empty() {
            return trimmed.to_string();
        }
    }

    let ua = user_agent.to_lowercase();
    if ua.contains("iphone") {
        "iPhone".to_string()
    } else if ua.contains("ipad") {
        "iPad".to_string()
    } else if ua.contains("sm-a54") {
        "Samsung A54".to_string()
    } else if ua.contains("sm-s9") {
        "Samsung S-Series".to_string()
    } else if ua.contains("samsung") || ua.contains("sm-") {
        "Samsung Galaxy".to_string()
    } else if ua.contains("pixel") {
        "Google Pixel".to_string()
    } else if ua.contains("xiaomi") || ua.contains("redmi") || ua.contains("poco") {
        "Xiaomi".to_string()
    } else if ua.contains("oppo") {
        "OPPO".to_string()
    } else if ua.contains("vivo") {
        "vivo".to_string()
    } else if ua.contains("android") {
        "Android Phone".to_string()
    } else {
        "HP / Smartphone".to_string()
    }
}

pub fn get_shelf_received_dir() -> PathBuf {
    if let Ok(userprofile) = std::env::var("USERPROFILE") {
        let dir = PathBuf::from(userprofile).join("Downloads").join("Gili Shelf");
        if std::fs::create_dir_all(&dir).is_ok() {
            return dir;
        }
    }
    std::env::temp_dir().join("gili_shelf")
}

fn parse_query_params(url: &str) -> std::collections::HashMap<String, String> {
    let mut map = std::collections::HashMap::new();
    if let Some(q_idx) = url.find('?') {
        let query_str = &url[q_idx + 1..];
        for pair in query_str.split('&') {
            let mut parts = pair.splitn(2, '=');
            if let Some(key) = parts.next() {
                let val = parts.next().unwrap_or("");
                let decoded = urlencoding_decode(val);
                map.insert(key.to_string(), decoded);
            }
        }
    }
    map
}

fn urlencoding_decode(s: &str) -> String {
    let mut res = Vec::new();
    let bytes = s.as_bytes();
    let mut i = 0;
    while i < bytes.len() {
        if bytes[i] == b'%' && i + 2 < bytes.len() {
            if let Ok(byte_val) = u8::from_str_radix(std::str::from_utf8(&bytes[i + 1..i + 3]).unwrap_or(""), 16) {
                res.push(byte_val);
                i += 3;
                continue;
            }
        } else if bytes[i] == b'+' {
            res.push(b' ');
            i += 1;
            continue;
        }
        res.push(bytes[i]);
        i += 1;
    }
    String::from_utf8_lossy(&res).to_string()
}

fn ensure_server_running(app: &AppHandle) -> Result<(Arc<Server>, u16), String> {
    let mut mgr_guard = SERVER_MANAGER.lock().unwrap();
    if let Some(ref mgr) = *mgr_guard {
        if let Some(ref srv) = mgr.server {
            return Ok((srv.clone(), mgr.port));
        }
    }

    // Attempt preferred port 8731, then 8732, then OS auto-assigned
    let mut chosen_server = None;
    let mut chosen_port = 8731;

    for port in [8731, 8732, 8733, 0] {
        let addr = format!("0.0.0.0:{}", port);
        if let Ok(srv) = Server::http(&addr) {
            chosen_port = srv.server_addr().to_ip().map(|ip| ip.port()).unwrap_or(port);
            chosen_server = Some(Arc::new(srv));
            break;
        }
    }

    let srv = chosen_server.ok_or_else(|| "Gagal memulai local HTTP server pada port 8731+".to_string())?;
    let is_running = Arc::new(AtomicBool::new(true));
    let active_session = Arc::new(Mutex::new(None));

    let srv_clone = srv.clone();
    let is_running_clone = is_running.clone();
    let session_clone = active_session.clone();
    let app_handle = app.clone();

    std::thread::spawn(move || {
        while is_running_clone.load(Ordering::Relaxed) {
            let request = match srv_clone.recv_timeout(Duration::from_millis(500)) {
                Ok(Some(req)) => req,
                Ok(None) => continue,
                Err(_) => continue,
            };

            handle_http_request(request, &session_clone, &app_handle);
        }
    });

    let manager = ServerManager {
        server: Some(srv.clone()),
        is_running,
        active_session,
        port: chosen_port,
    };
    *mgr_guard = Some(manager);

    Ok((srv, chosen_port))
}

fn handle_http_request(
    mut request: tiny_http::Request,
    session_arc: &Arc<Mutex<Option<ActiveSession>>>,
    app: &AppHandle,
) {
    let raw_url = request.url().to_string();
    let path = raw_url.split('?').next().unwrap_or("").to_string();
    let method = request.method().clone();

    // 1. Check active session
    let session_opt = {
        let guard = session_arc.lock().unwrap();
        guard.as_ref().cloned()
    };

    let session = match session_opt {
        Some(s) => s,
        None => {
            let _ = request.respond(
                Response::from_string("Sesi transfer belum aktif atau telah berakhir.")
                    .with_status_code(StatusCode(404))
                    .with_header(Header::from_bytes(&b"Content-Type"[..], &b"text/plain; charset=utf-8"[..]).unwrap()),
            );
            return;
        }
    };

    // Check expiration (5 minutes / 300 secs)
    let (created_at, active_token) = match &session {
        ActiveSession::Send { created_at, token, .. } => (*created_at, token.clone()),
        ActiveSession::Receive { created_at, token, .. } => (*created_at, token.clone()),
    };

    if created_at.elapsed() > Duration::from_secs(300) {
        let _ = request.respond(
            Response::from_string("Tautan telah kadaluarsa (berlaku 5 menit). Silakan scan ulang dari rak laptop.")
                .with_status_code(StatusCode(410))
                .with_header(Header::from_bytes(&b"Content-Type"[..], &b"text/plain; charset=utf-8"[..]).unwrap()),
        );
        return;
    }

    // Collect headers for device detection
    let mut user_agent = String::new();
    for h in request.headers() {
        if h.field.as_str().as_str().eq_ignore_ascii_case("User-Agent") {
            user_agent = h.value.as_str().to_string();
        }
    }

    // 2. Route matching
    // Mode Download (Kirim ke HP): /d/<token> and /d/<token>/file/<index>
    if path.starts_with("/d/") {
        let parts: Vec<&str> = path.split('/').filter(|p| !p.is_empty()).collect();
        // parts: ["d", "<token>", ...]
        if parts.len() < 2 || parts[1] != active_token {
            let _ = request.respond(
                Response::from_string("Token download tidak valid.")
                    .with_status_code(StatusCode(403)),
            );
            return;
        }

        if let ActiveSession::Send { files, .. } = &session {
            if parts.len() == 2 && method == Method::Get {
                // Serve Download HTML page (Board 64)
                let html = render_download_html(&active_token, files, &get_computer_name());
                let response = Response::from_string(html)
                    .with_header(Header::from_bytes(&b"Content-Type"[..], &b"text/html; charset=utf-8"[..]).unwrap());
                let _ = request.respond(response);
                return;
            } else if parts.len() == 4 && parts[2] == "file" && method == Method::Get {
                // Serve specific file: /d/<token>/file/<index>
                if let Ok(idx) = parts[3].parse::<usize>() {
                    if idx < files.len() {
                        let file_meta = &files[idx];
                        if let Ok(mut f) = File::open(&file_meta.path) {
                            let mut buf = Vec::new();
                            if f.read_to_end(&mut buf).is_ok() {
                                let filename = PathBuf::from(&file_meta.path)
                                    .file_name()
                                    .map(|n| n.to_string_lossy().to_string())
                                    .unwrap_or_else(|| "file.bin".to_string());
                                let disposition = format!("attachment; filename=\"{}\"", filename);
                                let response = Response::from_data(buf)
                                    .with_header(Header::from_bytes(&b"Content-Type"[..], &b"application/octet-stream"[..]).unwrap())
                                    .with_header(Header::from_bytes(&b"Content-Disposition"[..], disposition.as_bytes()).unwrap());
                                let _ = request.respond(response);
                                return;
                            }
                        }
                    }
                }
            }
        }
    }

    // Mode Upload (Terima dari HP): /u/<token>, /u/<token>/upload, /u/<token>/complete
    if path.starts_with("/u/") {
        let parts: Vec<&str> = path.split('/').filter(|p| !p.is_empty()).collect();
        if parts.len() < 2 || parts[1] != active_token {
            let _ = request.respond(
                Response::from_string("Token upload tidak valid.")
                    .with_status_code(StatusCode(403)),
            );
            return;
        }

        if let ActiveSession::Receive { target_dir, .. } = &session {
            if parts.len() == 2 && method == Method::Get {
                // Serve Upload HTML page (Board 64)
                let html = render_upload_html(&active_token, &get_computer_name());
                let response = Response::from_string(html)
                    .with_header(Header::from_bytes(&b"Content-Type"[..], &b"text/html; charset=utf-8"[..]).unwrap());
                let _ = request.respond(response);
                return;
            } else if parts.len() == 3 && parts[2] == "upload" && method == Method::Post {
                // Handle file upload stream: /u/<token>/upload?name=...&size=...&device=...
                let query = parse_query_params(&raw_url);
                let raw_filename = query.get("name").cloned().unwrap_or_else(|| format!("file_{}.bin", now_millis()));
                let safe_filename = PathBuf::from(&raw_filename)
                    .file_name()
                    .map(|n| n.to_string_lossy().to_string())
                    .unwrap_or_else(|| format!("file_{}.bin", now_millis()));
                
                let total_size: u64 = query.get("size").and_then(|s| s.parse().ok()).unwrap_or(0);
                let device_name = detect_device_name(&user_agent, query.get("device").map(|s| s.as_str()));
                let file_id = format!("{}_{}", now_millis(), safe_filename);

                let dest_path = target_dir.join(&safe_filename);

                // Stream request body directly into target file
                let reader = request.as_reader();
                let mut buffer = [0u8; 64 * 1024];
                let mut transferred = 0u64;

                let write_res = File::create(&dest_path).and_then(|mut f| {
                    let start_time = Instant::now();
                    let mut last_emit = Instant::now();
                    loop {
                        let bytes_read = reader.read(&mut buffer)?;
                        if bytes_read == 0 {
                            break;
                        }
                        f.write_all(&buffer[..bytes_read])?;
                        transferred += bytes_read as u64;

                        if last_emit.elapsed() >= Duration::from_millis(150) {
                            last_emit = Instant::now();
                            let elapsed_sec = start_time.elapsed().as_secs_f64().max(0.001);
                            let speed_mbs = (transferred as f64 / 1_048_576.0) / elapsed_sec;
                            let speed_formatted = format!("{:.1} MB/s", speed_mbs);
                            let progress = if total_size > 0 {
                                ((transferred as f64 / total_size as f64) * 100.0).min(99.0) as u8
                            } else {
                                50
                            };

                            let _ = app.emit("shelf-transfer-progress", ShelfTransferProgressPayload {
                                id: file_id.clone(),
                                name: safe_filename.clone(),
                                size: total_size.max(transferred),
                                transferred,
                                progress,
                                status: "transferring".to_string(),
                                device_name: device_name.clone(),
                                speed_formatted: Some(speed_formatted),
                            });
                        }
                    }
                    Ok(())
                });

                match write_res {
                    Ok(_) => {
                        let ext = safe_filename
                            .split('.')
                            .last()
                            .unwrap_or("")
                            .to_lowercase();

                        let mut thumbnail: Option<String> = None;
                        let is_img = matches!(ext.as_str(), "png" | "jpg" | "jpeg" | "webp" | "gif" | "bmp" | "ico" | "svg");
                        if is_img && transferred <= 25 * 1024 * 1024 {
                            if let Ok(bytes) = std::fs::read(&dest_path) {
                                use base64::{Engine as _, engine::general_purpose::STANDARD};
                                if ext == "svg" && bytes.len() <= 512 * 1024 {
                                    let b64 = STANDARD.encode(&bytes);
                                    thumbnail = Some(format!("data:image/svg+xml;base64,{}", b64));
                                } else if ext == "ico" && bytes.len() <= 512 * 1024 {
                                    let b64 = STANDARD.encode(&bytes);
                                    thumbnail = Some(format!("data:image/x-icon;base64,{}", b64));
                                } else if let Ok(img) = image::load_from_memory(&bytes) {
                                    let thumb = img.resize(320, 320, image::imageops::FilterType::CatmullRom);
                                    let mut buffer = std::io::Cursor::new(Vec::with_capacity(16384));
                                    if thumb.write_to(&mut buffer, image::ImageFormat::Png).is_ok() {
                                        let b64 = STANDARD.encode(buffer.into_inner());
                                        thumbnail = Some(format!("data:image/png;base64,{}", b64));
                                    }
                                }
                            }
                        }

                        let _ = app.emit("shelf-transfer-progress", ShelfTransferProgressPayload {
                            id: file_id.clone(),
                            name: safe_filename.clone(),
                            size: transferred,
                            transferred,
                            progress: 100,
                            status: "completed".to_string(),
                            device_name: device_name.clone(),
                            speed_formatted: None,
                        });

                        let _ = app.emit("shelf-file-received", ShelfFileReceivedPayload {
                            id: file_id,
                            name: safe_filename.clone(),
                            path: dest_path.to_string_lossy().to_string(),
                            ext,
                            size: transferred,
                            size_formatted: format_file_size(transferred),
                            device_name,
                            added_at: now_millis(),
                            thumbnail,
                        });

                        let response = Response::from_string("{\"ok\":true}")
                            .with_header(Header::from_bytes(&b"Content-Type"[..], &b"application/json"[..]).unwrap());
                        let _ = request.respond(response);
                        return;
                    }
                    Err(_) => {
                        return;
                    }
                }
            } else if parts.len() == 3 && parts[2] == "complete" && method == Method::Post {
                let query = parse_query_params(&raw_url);
                let device_name = detect_device_name(&user_agent, query.get("device").map(|s| s.as_str()));
                let count: usize = query.get("count").and_then(|s| s.parse().ok()).unwrap_or(0);
                let total_bytes: u64 = query.get("bytes").and_then(|s| s.parse().ok()).unwrap_or(0);

                let _ = app.emit("shelf-transfer-completed", ShelfTransferCompletedPayload {
                    device_name,
                    total_files: count,
                    total_bytes,
                });

                let response = Response::from_string("{\"ok\":true}")
                    .with_header(Header::from_bytes(&b"Content-Type"[..], &b"application/json"[..]).unwrap());
                let _ = request.respond(response);
                return;
            }
        }
    }

    let _ = request.respond(
        Response::from_string("Not Found")
            .with_status_code(StatusCode(404)),
    );
}

// -------------------------------------------------------------
// HTML Mobile Web UI Renderers (Design.html Board 64)
// -------------------------------------------------------------

fn render_upload_html(token: &str, hostname: &str) -> String {
    format!(r##"<!DOCTYPE html>
<html lang="id">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no, viewport-fit=cover">
  <meta name="theme-color" content="#09090b">
  <title>gili · Kirim ke Laptop</title>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700;800&display=swap" rel="stylesheet">
  <style>
    * {{ box-sizing: border-box; margin: 0; padding: 0; -webkit-tap-highlight-color: transparent; }}
    body {{
      background: #09090b;
      color: #ffffff;
      font-family: 'Plus Jakarta Sans', -apple-system, BlinkMacSystemFont, sans-serif;
      min-height: 100vh;
      min-height: 100dvh;
      display: flex;
      flex-direction: column;
      padding: 16px 20px;
      padding-top: max(16px, env(safe-area-inset-top));
      padding-bottom: max(20px, env(safe-area-inset-bottom));
      overflow-x: hidden;
    }}
    .bg-glow {{
      position: fixed;
      top: -120px;
      left: 50%;
      transform: translateX(-50%);
      width: 320px;
      height: 240px;
      background: radial-gradient(circle, rgba(47, 123, 255, 0.15) 0%, rgba(9, 9, 11, 0) 70%);
      pointer-events: none;
      z-index: 0;
    }}
    .container {{
      position: relative;
      z-index: 1;
      display: flex;
      flex-direction: column;
      flex-grow: 1;
      max-width: 480px;
      margin: 0 auto;
      width: 100%;
    }}
    .header {{
      display: flex;
      align-items: center;
      gap: 12px;
      padding: 6px 0 14px;
    }}
    .logo-box {{
      width: 42px;
      height: 42px;
      border-radius: 12px;
      background: #ffffff;
      border: 1px solid rgba(255, 255, 255, 0.5);
      display: flex;
      align-items: center;
      justify-content: center;
      flex-shrink: 0;
      box-shadow: 0 4px 14px rgba(0, 0, 0, 0.35), 0 1px 3px rgba(0, 0, 0, 0.1);
      overflow: hidden;
    }}
    .header-text {{
      display: flex;
      flex-direction: column;
      gap: 1px;
    }}
    .title-row {{
      display: flex;
      align-items: center;
      gap: 8px;
    }}
    .brand-title {{
      font-size: 20px;
      font-weight: 800;
      letter-spacing: -0.03em;
      background: linear-gradient(180deg, #ffffff 0%, #d4d4d8 100%);
      -webkit-background-clip: text;
      -webkit-text-fill-color: transparent;
    }}
    .tag-badge {{
      font-size: 9.5px;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 0.04em;
      padding: 2px 7px;
      border-radius: 6px;
      background: rgba(56, 130, 246, 0.15);
      border: 1px solid rgba(56, 130, 246, 0.3);
      color: #60a5fa;
    }}
    .header-sub {{
      font-size: 11.5px;
      color: #71717a;
      font-weight: 500;
    }}
    .device-card {{
      margin: 6px 0 14px;
      border-radius: 16px;
      background: rgba(24, 24, 27, 0.65);
      backdrop-filter: blur(16px);
      -webkit-backdrop-filter: blur(16px);
      border: 1px solid rgba(255, 255, 255, 0.08);
      padding: 12px 14px;
      display: flex;
      align-items: center;
      gap: 12px;
      box-shadow: 0 4px 20px rgba(0, 0, 0, 0.25);
    }}
    .pulse-ring {{
      position: relative;
      width: 10px;
      height: 10px;
      border-radius: 5px;
      background: #10b981;
      box-shadow: 0 0 10px rgba(16, 185, 129, 0.6);
      flex-shrink: 0;
    }}
    .pulse-ring::after {{
      content: '';
      position: absolute;
      inset: -3px;
      border-radius: 8px;
      border: 1.5px solid rgba(16, 185, 129, 0.4);
      animation: ping 2s cubic-bezier(0, 0, 0.2, 1) infinite;
    }}
    @keyframes ping {{
      75%, 100% {{ transform: scale(1.6); opacity: 0; }}
    }}
    .device-info {{
      flex-grow: 1;
      min-width: 0;
    }}
    .host-name {{
      font-size: 13.5px;
      font-weight: 700;
      color: #f4f4f5;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }}
    .conn-label {{
      font-size: 11px;
      color: #10b981;
      font-weight: 500;
      margin-top: 1px;
    }}
    .wifi-pill {{
      display: flex;
      align-items: center;
      gap: 5px;
      font-size: 11px;
      color: #a1a1aa;
      background: rgba(255, 255, 255, 0.05);
      padding: 4px 9px;
      border-radius: 8px;
      border: 1px solid rgba(255, 255, 255, 0.06);
    }}
    .dropzone {{
      height: 126px;
      border-radius: 20px;
      border: 1.5px dashed rgba(255, 255, 255, 0.16);
      background: rgba(18, 18, 22, 0.6);
      backdrop-filter: blur(12px);
      -webkit-backdrop-filter: blur(12px);
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      gap: 8px;
      cursor: pointer;
      transition: all 0.2s cubic-bezier(0.16, 1, 0.3, 1);
    }}
    .dropzone:active {{
      transform: scale(0.98);
      border-color: #3882F6;
      background: rgba(56, 130, 246, 0.08);
    }}
    .upload-circle {{
      width: 42px;
      height: 42px;
      border-radius: 14px;
      background: rgba(56, 130, 246, 0.14);
      border: 1px solid rgba(56, 130, 246, 0.3);
      display: flex;
      align-items: center;
      justify-content: center;
      color: #60a5fa;
      box-shadow: 0 4px 12px rgba(56, 130, 246, 0.2);
    }}
    .drop-title {{
      font-size: 14.5px;
      font-weight: 700;
      color: #ffffff;
    }}
    .drop-sub {{
      font-size: 11.5px;
      color: #71717a;
    }}
    .file-list {{
      margin-top: 14px;
      display: flex;
      flex-direction: column;
      gap: 8px;
      flex-grow: 1;
      overflow-y: auto;
      max-height: calc(100vh - 360px);
      padding-right: 2px;
    }}
    .file-row {{
      display: flex;
      align-items: center;
      gap: 12px;
      min-height: 58px;
      padding: 8px 12px;
      border-radius: 14px;
      background: rgba(24, 24, 27, 0.6);
      border: 1px solid rgba(255, 255, 255, 0.06);
      position: relative;
      overflow: hidden;
      animation: fadeIn 0.2s ease-out;
    }}
    @keyframes fadeIn {{
      from {{ opacity: 0; transform: translateY(6px); }}
      to {{ opacity: 1; transform: translateY(0); }}
    }}
    .thumb-box {{
      width: 44px;
      height: 44px;
      border-radius: 10px;
      background: #18181b;
      border: 1px solid rgba(255, 255, 255, 0.08);
      overflow: hidden;
      flex-shrink: 0;
      display: flex;
      align-items: center;
      justify-content: center;
      position: relative;
    }}
    .thumb-img {{
      width: 100%;
      height: 100%;
      object-fit: cover;
      display: block;
    }}
    .play-overlay {{
      position: absolute;
      inset: 0;
      display: flex;
      align-items: center;
      justify-content: center;
      background: rgba(0, 0, 0, 0.35);
      border-radius: 9px;
      pointer-events: none;
    }}
    .thumb-badge {{
      font-size: 10px;
      font-weight: 800;
      color: #60a5fa;
      text-transform: uppercase;
      letter-spacing: 0.05em;
    }}
    .file-meta {{
      flex: 1;
      min-width: 0;
    }}
    .file-name {{
      font-size: 13px;
      font-weight: 600;
      color: #f4f4f5;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }}
    .file-sub {{
      font-size: 11px;
      color: #71717a;
      margin-top: 2px;
    }}
    .row-progress {{
      position: absolute;
      bottom: 0;
      left: 0;
      height: 2.5px;
      background: #3882F6;
      width: 0%;
      transition: width 0.15s ease-out;
    }}
    .status-badge {{
      font-size: 11.5px;
      font-weight: 600;
      color: #60a5fa;
      flex-shrink: 0;
    }}
    .status-done {{
      color: #10b981;
      display: flex;
      align-items: center;
      gap: 3px;
    }}
    .footer-bar {{
      margin-top: auto;
      padding-top: 14px;
      display: flex;
      flex-direction: column;
      gap: 10px;
    }}
    .send-btn {{
      width: 100%;
      height: 50px;
      border: 0;
      border-radius: 16px;
      background: #3882F6;
      color: #ffffff;
      font-size: 15px;
      font-weight: 700;
      font-family: inherit;
      cursor: pointer;
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 8px;
      box-shadow: 0 4px 20px rgba(56, 130, 246, 0.35);
      transition: all 0.2s cubic-bezier(0.16, 1, 0.3, 1);
    }}
    .send-btn:active:not(:disabled) {{
      transform: scale(0.98);
      filter: brightness(0.92);
    }}
    .send-btn:disabled {{
      background: rgba(255, 255, 255, 0.06);
      color: #52525b;
      box-shadow: none;
      cursor: not-allowed;
    }}
    .wifi-notice {{
      text-align: center;
      font-size: 11px;
      color: #71717a;
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 5px;
    }}
  </style>
</head>
<body>
  <div class="bg-glow"></div>

  <div class="container">
    <div class="header">
      <div class="logo-box">
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 120 120" width="30" height="30"><g transform="translate(0 .5)"><path d="M8 76A52 50 0 0 1 112 76Z" fill="#2F7BFF"/><path d="M38 30.7A52 50 0 0 1 82 30.7V44A14 14 0 0 1 68 58H52A14 14 0 0 1 38 44Z" fill="#0B0F14"/><rect x="48" y="36" width="6" height="12" rx="3" fill="#7FE3FF"/><rect x="66" y="36" width="6" height="12" rx="3" fill="#7FE3FF"/><path d="M10 90Q20 82 30 90T50 90T70 90T90 90T110 90" stroke="#2F7BFF" stroke-width="6" stroke-linecap="round" fill="none"/></g></svg>
      </div>
      <div class="header-text">
        <div class="title-row">
          <span class="brand-title">gili</span>
          <span class="tag-badge">File Shelf</span>
        </div>
        <span class="header-sub">Kirim File ke Laptop</span>
      </div>
    </div>

    <div class="device-card">
      <span class="pulse-ring"></span>
      <div class="device-info">
        <div class="host-name">{hostname}</div>
        <div class="conn-label">● Terhubung di Jaringan Lokal</div>
      </div>
      <div class="wifi-pill">
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
          <path d="M5 12.55a11 11 0 0 1 14.08 0"></path>
          <path d="M1.42 9a16 16 0 0 1 21.16 0"></path>
          <path d="M8.53 16.11a6 6 0 0 1 6.95 0"></path>
          <line x1="12" y1="20" x2="12.01" y2="20"></line>
        </svg>
        <span>Wi-Fi</span>
      </div>
    </div>

    <input type="file" id="filePicker" multiple style="display: none;">

    <div class="dropzone" id="dropArea" onclick="document.getElementById('filePicker').click()">
      <div class="upload-circle">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round">
          <path d="M12 16V5M7.5 9.5L12 5l4.5 4.5M5 15v3a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-3"></path>
        </svg>
      </div>
      <span class="drop-title">Pilih Foto, Video, atau File</span>
      <span class="drop-sub">Bisa pilih banyak sekaligus dari Galeri / File</span>
    </div>

    <div class="file-list" id="fileList"></div>

    <div class="footer-bar">
      <button class="send-btn" id="sendBtn" disabled onclick="startUpload()">Pilih file untuk mulai</button>
      <div class="wifi-notice">
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect>
          <path d="M7 11V7a5 5 0 0 1 10 0v4"></path>
        </svg>
        <span>Transfer langsung via Wi-Fi lokal · Aman tanpa internet</span>
      </div>
    </div>
  </div>

  <script>
    const token = "{token}";
    let selectedFiles = [];

    const filePicker = document.getElementById('filePicker');
    const fileList = document.getElementById('fileList');
    const sendBtn = document.getElementById('sendBtn');

    filePicker.addEventListener('change', (e) => {{
      const files = Array.from(e.target.files);
      if (files.length === 0) return;
      selectedFiles = [...selectedFiles, ...files];
      renderList();
    }});

    function formatSize(bytes) {{
      if (bytes < 1024) return bytes + ' B';
      if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
      return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
    }}

    function getExt(name) {{
      const p = name.split('.');
      return p.length > 1 ? p.pop().toUpperCase() : 'FILE';
    }}

    function renderList() {{
      fileList.innerHTML = '';
      selectedFiles.forEach((f, idx) => {{
        const row = document.createElement('div');
        row.className = 'file-row';

        const isImg = f.type.startsWith('image/') || /\.(jpe?g|png|webp|gif|bmp|heic|svg)$/i.test(f.name);
        const isVid = f.type.startsWith('video/') || /\.(mp4|mov|webm|mkv)$/i.test(f.name);

        let thumbHtml = '';
        try {{
          const objUrl = URL.createObjectURL(f);
          if (isImg) {{
            thumbHtml = `<img class="thumb-img" src="${{objUrl}}" alt="">`;
          }} else if (isVid) {{
            thumbHtml = `<video class="thumb-img" src="${{objUrl}}#t=0.5" muted playsinline preload="metadata"></video><div class="play-overlay"><svg width="12" height="12" viewBox="0 0 24 24" fill="white"><polygon points="5 3 19 12 5 21 5 3"></polygon></svg></div>`;
          }} else {{
            thumbHtml = `<span class="thumb-badge">${{getExt(f.name)}}</span>`;
          }}
        }} catch(e) {{
          thumbHtml = `<span class="thumb-badge">${{getExt(f.name)}}</span>`;
        }}

        row.innerHTML = `
          <div class="thumb-box">${{thumbHtml}}</div>
          <div class="file-meta">
            <div class="file-name">${{f.name}}</div>
            <div class="file-sub">${{formatSize(f.size)}}</div>
          </div>
          <div class="status-badge" id="status-${{idx}}">Siap</div>
          <div class="row-progress" id="prog-${{idx}}"></div>
        `;
        fileList.appendChild(row);
      }});

      if (selectedFiles.length > 0) {{
        sendBtn.disabled = false;
        sendBtn.innerText = `Kirim ${{selectedFiles.length}} File ke Laptop`;
      }} else {{
        sendBtn.disabled = true;
        sendBtn.innerText = 'Pilih file untuk mulai';
      }}
    }}

    async function startUpload() {{
      if (selectedFiles.length === 0) return;
      sendBtn.disabled = true;
      sendBtn.innerText = 'Mengirim ke Laptop...';

      let totalBytes = 0;
      for (let i = 0; i < selectedFiles.length; i++) {{
        const file = selectedFiles[i];
        const statusEl = document.getElementById(`status-${{i}}`);
        const progEl = document.getElementById(`prog-${{i}}`);
        statusEl.innerText = '0%';
        totalBytes += file.size;

        await new Promise((resolve) => {{
          const xhr = new XMLHttpRequest();
          const url = `/u/{token}/upload?name=${{encodeURIComponent(file.name)}}&size=${{file.size}}`;
          xhr.open('POST', url, true);
          xhr.upload.onprogress = (evt) => {{
            if (evt.lengthComputable) {{
              const pct = Math.round((evt.loaded / evt.total) * 100);
              statusEl.innerText = pct + '%';
              if (progEl) progEl.style.width = pct + '%';
            }}
          }};
          xhr.onload = () => {{
            if (xhr.status >= 200 && xhr.status < 300) {{
              statusEl.innerHTML = '✓ Selesai';
              statusEl.className = 'status-badge status-done';
              if (progEl) progEl.style.width = '100%';
              resolve();
            }} else {{
              statusEl.innerText = 'Gagal';
              resolve();
            }}
          }};
          xhr.onerror = () => {{
            statusEl.innerText = 'Gagal';
            resolve();
          }};
          xhr.send(file);
        }});
      }}

      // Notify completion
      fetch(`/u/{token}/complete?count=${{selectedFiles.length}}&bytes=${{totalBytes}}`, {{ method: 'POST' }});
      sendBtn.disabled = false;
      sendBtn.innerText = 'Semua File Berhasil Masuk ke Rak Laptop! ✓';
      sendBtn.style.background = '#10b981';
      sendBtn.style.boxShadow = '0 4px 20px rgba(16, 185, 129, 0.4)';

      if (navigator.vibrate) {{
        navigator.vibrate([40, 60, 40]);
      }}

      setTimeout(() => {{
        sendBtn.style.background = '#3882F6';
        sendBtn.style.boxShadow = '0 4px 20px rgba(56, 130, 246, 0.35)';
        sendBtn.innerText = 'Kirim File Lainnya';
        selectedFiles = [];
      }}, 3500);
    }}
  </script>
</body>
</html>"##, token = token, hostname = hostname)
}

fn render_download_html(token: &str, files: &[ShelfFileMeta], hostname: &str) -> String {
    let mut file_rows = String::new();
    for (idx, f) in files.iter().enumerate() {
        let ext = f.name.split('.').last().unwrap_or("FILE").to_lowercase();
        let is_img = ["jpg", "jpeg", "png", "webp", "gif", "bmp", "svg"].contains(&ext.as_str());
        let is_vid = ["mp4", "mov", "webm", "mkv"].contains(&ext.as_str());

        let thumb_html = if is_img {
            format!(r#"<img class="thumb-img" src="/d/{}/file/{}" loading="lazy" alt="">"#, token, idx)
        } else if is_vid {
            format!(
                r#"<video class="thumb-img" src="/d/{}/file/{}#t=0.5" muted playsinline preload="metadata"></video>
                <div class="play-overlay"><svg width="12" height="12" viewBox="0 0 24 24" fill="white"><polygon points="5 3 19 12 5 21 5 3"></polygon></svg></div>"#,
                token, idx
            )
        } else {
            format!(r#"<span class="thumb-badge">{}</span>"#, ext.to_uppercase())
        };

        file_rows.push_str(&format!(
            r##"<div class="file-row">
        <div class="thumb-box">
          {}
        </div>
        <div class="file-meta">
          <div class="file-name">{}</div>
          <div class="file-sub">{}</div>
        </div>
        <button class="unduh-btn" onclick="downloadSingle({}, '{}')">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round">
            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
            <polyline points="7 10 12 15 17 10"></polyline>
            <line x1="12" y1="15" x2="12" y2="3"></line>
          </svg>
          Unduh
        </button>
      </div>"##,
            thumb_html, f.name, f.size_formatted, idx, f.name
        ));
    }

    format!(r##"<!DOCTYPE html>
<html lang="id">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no, viewport-fit=cover">
  <meta name="theme-color" content="#09090b">
  <title>gili · Unduh dari Laptop</title>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700;800&display=swap" rel="stylesheet">
  <style>
    * {{ box-sizing: border-box; margin: 0; padding: 0; -webkit-tap-highlight-color: transparent; }}
    body {{
      background: #09090b;
      color: #ffffff;
      font-family: 'Plus Jakarta Sans', -apple-system, BlinkMacSystemFont, sans-serif;
      min-height: 100vh;
      min-height: 100dvh;
      display: flex;
      flex-direction: column;
      padding: 16px 20px;
      padding-top: max(16px, env(safe-area-inset-top));
      padding-bottom: max(20px, env(safe-area-inset-bottom));
      overflow-x: hidden;
    }}
    .bg-glow {{
      position: fixed;
      top: -120px;
      left: 50%;
      transform: translateX(-50%);
      width: 320px;
      height: 240px;
      background: radial-gradient(circle, rgba(47, 123, 255, 0.15) 0%, rgba(9, 9, 11, 0) 70%);
      pointer-events: none;
      z-index: 0;
    }}
    .container {{
      position: relative;
      z-index: 1;
      display: flex;
      flex-direction: column;
      flex-grow: 1;
      max-width: 480px;
      margin: 0 auto;
      width: 100%;
    }}
    .header {{
      display: flex;
      align-items: center;
      gap: 12px;
      padding: 6px 0 14px;
    }}
    .logo-box {{
      width: 42px;
      height: 42px;
      border-radius: 12px;
      background: #ffffff;
      border: 1px solid rgba(255, 255, 255, 0.5);
      display: flex;
      align-items: center;
      justify-content: center;
      flex-shrink: 0;
      box-shadow: 0 4px 14px rgba(0, 0, 0, 0.35), 0 1px 3px rgba(0, 0, 0, 0.1);
      overflow: hidden;
    }}
    .header-text {{
      display: flex;
      flex-direction: column;
      gap: 1px;
    }}
    .title-row {{
      display: flex;
      align-items: center;
      gap: 8px;
    }}
    .brand-title {{
      font-size: 20px;
      font-weight: 800;
      letter-spacing: -0.03em;
      background: linear-gradient(180deg, #ffffff 0%, #d4d4d8 100%);
      -webkit-background-clip: text;
      -webkit-text-fill-color: transparent;
    }}
    .tag-badge {{
      font-size: 9.5px;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 0.04em;
      padding: 2px 7px;
      border-radius: 6px;
      background: rgba(56, 130, 246, 0.15);
      border: 1px solid rgba(56, 130, 246, 0.3);
      color: #60a5fa;
    }}
    .header-sub {{
      font-size: 11.5px;
      color: #71717a;
      font-weight: 500;
    }}
    .device-card {{
      margin: 6px 0 14px;
      border-radius: 16px;
      background: rgba(24, 24, 27, 0.65);
      backdrop-filter: blur(16px);
      -webkit-backdrop-filter: blur(16px);
      border: 1px solid rgba(255, 255, 255, 0.08);
      padding: 12px 14px;
      display: flex;
      align-items: center;
      gap: 12px;
      box-shadow: 0 4px 20px rgba(0, 0, 0, 0.25);
    }}
    .pulse-ring {{
      position: relative;
      width: 10px;
      height: 10px;
      border-radius: 5px;
      background: #10b981;
      box-shadow: 0 0 10px rgba(16, 185, 129, 0.6);
      flex-shrink: 0;
    }}
    .pulse-ring::after {{
      content: '';
      position: absolute;
      inset: -3px;
      border-radius: 8px;
      border: 1.5px solid rgba(16, 185, 129, 0.4);
      animation: ping 2s cubic-bezier(0, 0, 0.2, 1) infinite;
    }}
    @keyframes ping {{
      75%, 100% {{ transform: scale(1.6); opacity: 0; }}
    }}
    .device-info {{
      flex-grow: 1;
      min-width: 0;
    }}
    .host-name {{
      font-size: 13.5px;
      font-weight: 700;
      color: #f4f4f5;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }}
    .conn-label {{
      font-size: 11px;
      color: #10b981;
      font-weight: 500;
      margin-top: 1px;
    }}
    .files-count-badge {{
      font-size: 12.5px;
      font-weight: 700;
      color: #a1a1aa;
      margin: 4px 0 10px;
      display: flex;
      align-items: center;
      gap: 6px;
    }}
    .file-list {{
      display: flex;
      flex-direction: column;
      gap: 8px;
      flex-grow: 1;
      overflow-y: auto;
      max-height: calc(100vh - 310px);
      padding-right: 2px;
    }}
    .file-row {{
      display: flex;
      align-items: center;
      gap: 12px;
      min-height: 58px;
      padding: 8px 12px;
      border-radius: 14px;
      background: rgba(24, 24, 27, 0.6);
      border: 1px solid rgba(255, 255, 255, 0.06);
    }}
    .thumb-box {{
      width: 44px;
      height: 44px;
      border-radius: 10px;
      background: #18181b;
      border: 1px solid rgba(255, 255, 255, 0.08);
      display: flex;
      align-items: center;
      justify-content: center;
      flex-shrink: 0;
      overflow: hidden;
      position: relative;
    }}
    .thumb-img {{
      width: 100%;
      height: 100%;
      object-fit: cover;
      display: block;
    }}
    .play-overlay {{
      position: absolute;
      inset: 0;
      display: flex;
      align-items: center;
      justify-content: center;
      background: rgba(0, 0, 0, 0.35);
      border-radius: 9px;
      pointer-events: none;
    }}
    .thumb-badge {{
      font-size: 10px;
      font-weight: 800;
      color: #60a5fa;
      text-transform: uppercase;
      letter-spacing: 0.05em;
    }}
    .file-meta {{
      flex: 1;
      min-width: 0;
    }}
    .file-name {{
      font-size: 13px;
      font-weight: 600;
      color: #f4f4f5;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }}
    .file-sub {{
      font-size: 11px;
      color: #71717a;
      margin-top: 2px;
    }}
    .unduh-btn {{
      height: 34px;
      padding: 0 14px;
      border: 0;
      border-radius: 10px;
      background: rgba(255, 255, 255, 0.08);
      border: 1px solid rgba(255, 255, 255, 0.1);
      color: #ffffff;
      font-size: 12px;
      font-weight: 600;
      cursor: pointer;
      font-family: inherit;
      display: flex;
      align-items: center;
      gap: 6px;
      transition: all 0.15s ease;
    }}
    .unduh-btn:active {{
      background: #3882F6;
      border-color: #3882F6;
      transform: scale(0.96);
    }}
    .footer-bar {{
      margin-top: auto;
      padding-top: 14px;
      display: flex;
      flex-direction: column;
      gap: 10px;
    }}
    .download-all-btn {{
      width: 100%;
      height: 50px;
      border: 0;
      border-radius: 16px;
      background: #3882F6;
      color: #ffffff;
      font-size: 15px;
      font-weight: 700;
      font-family: inherit;
      cursor: pointer;
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 8px;
      box-shadow: 0 4px 20px rgba(56, 130, 246, 0.35);
      transition: all 0.2s cubic-bezier(0.16, 1, 0.3, 1);
    }}
    .download-all-btn:active {{
      transform: scale(0.98);
      filter: brightness(0.92);
    }}
    .timer-notice {{
      text-align: center;
      font-size: 11px;
      color: #71717a;
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 5px;
    }}
  </style>
</head>
<body>
  <div class="bg-glow"></div>

  <div class="container">
    <div class="header">
      <div class="logo-box">
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 120 120" width="30" height="30"><g transform="translate(0 .5)"><path d="M8 76A52 50 0 0 1 112 76Z" fill="#2F7BFF"/><path d="M38 30.7A52 50 0 0 1 82 30.7V44A14 14 0 0 1 68 58H52A14 14 0 0 1 38 44Z" fill="#0B0F14"/><rect x="48" y="36" width="6" height="12" rx="3" fill="#7FE3FF"/><rect x="66" y="36" width="6" height="12" rx="3" fill="#7FE3FF"/><path d="M10 90Q20 82 30 90T50 90T70 90T90 90T110 90" stroke="#2F7BFF" stroke-width="6" stroke-linecap="round" fill="none"/></g></svg>
      </div>
      <div class="header-text">
        <div class="title-row">
          <span class="brand-title">gili</span>
          <span class="tag-badge">File Shelf</span>
        </div>
        <span class="header-sub">Unduh File dari Laptop</span>
      </div>
    </div>

    <div class="device-card">
      <span class="pulse-ring"></span>
      <div class="device-info">
        <div class="host-name">{hostname}</div>
        <div class="conn-label">● Terhubung di Jaringan Lokal</div>
      </div>
    </div>

    <div class="files-count-badge">
      <span>Daftar File yang Dibagikan ({count})</span>
    </div>

    <div class="file-list">
      {file_rows}
    </div>

    <div class="footer-bar">
      <button class="download-all-btn" onclick="downloadAll()">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round">
          <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
          <polyline points="7 10 12 15 17 10"></polyline>
          <line x1="12" y1="15" x2="12" y2="3"></line>
        </svg>
        Unduh Semua ({count} File)
      </button>
      <div class="timer-notice">
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <circle cx="12" cy="12" r="10"></circle>
          <polyline points="12 6 12 12 16 14"></polyline>
        </svg>
        <span>Tautan berlaku 5 menit · Transfer langsung lewat Wi-Fi lokal</span>
      </div>
    </div>
  </div>

  <script>
    const token = "{token}";
    const totalFiles = {count};

    function downloadSingle(idx, filename) {{
      const link = document.createElement('a');
      link.href = `/d/{token}/file/${{idx}}`;
      link.download = filename;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    }}

    async function downloadAll() {{
      for (let i = 0; i < totalFiles; i++) {{
        downloadSingle(i, '');
        await new Promise(r => setTimeout(r, 450));
      }}
    }}
  </script>
</body>
</html>"##,
        token = token,
        hostname = hostname,
        count = files.len(),
        file_rows = file_rows
    )
}

#[tauri::command]
pub fn start_shelf_send(app: AppHandle, paths: Vec<String>) -> Result<ShelfSessionInfo, String> {
    if paths.is_empty() {
        return Err("Tidak ada file yang dipilih untuk dikirim".to_string());
    }

    let (_, port) = ensure_server_running(&app)?;
    let token = generate_token();
    let local_ip = get_local_ip();
    let computer_name = get_computer_name();

    let mut files_meta = Vec::new();
    for p in &paths {
        let path_obj = PathBuf::from(p);
        let name = path_obj
            .file_name()
            .map(|n| n.to_string_lossy().to_string())
            .unwrap_or_else(|| "file".to_string());
        let size = std::fs::metadata(&path_obj).map(|m| m.len()).unwrap_or(0);
        files_meta.push(ShelfFileMeta {
            name,
            size,
            size_formatted: format_file_size(size),
            path: p.clone(),
        });
    }

    let mgr_guard = SERVER_MANAGER.lock().unwrap();
    if let Some(ref mgr) = *mgr_guard {
        let mut session_guard = mgr.active_session.lock().unwrap();
        *session_guard = Some(ActiveSession::Send {
            token: token.clone(),
            created_at: Instant::now(),
            files: files_meta.clone(),
        });
    }

    let url = format!("http://{}:{}/d/{}", local_ip, port, token);

    Ok(ShelfSessionInfo {
        token,
        url,
        port,
        local_ip,
        expires_in_sec: 300,
        mode: "send".to_string(),
        files: Some(files_meta),
        computer_name,
    })
}

#[tauri::command]
pub fn start_shelf_receive(app: AppHandle) -> Result<ShelfSessionInfo, String> {
    let (_, port) = ensure_server_running(&app)?;
    let token = generate_token();
    let local_ip = get_local_ip();
    let computer_name = get_computer_name();
    let target_dir = get_shelf_received_dir();

    let mgr_guard = SERVER_MANAGER.lock().unwrap();
    if let Some(ref mgr) = *mgr_guard {
        let mut session_guard = mgr.active_session.lock().unwrap();
        *session_guard = Some(ActiveSession::Receive {
            token: token.clone(),
            created_at: Instant::now(),
            target_dir,
        });
    }

    let url = format!("http://{}:{}/u/{}", local_ip, port, token);

    Ok(ShelfSessionInfo {
        token,
        url,
        port,
        local_ip,
        expires_in_sec: 300,
        mode: "receive".to_string(),
        files: None,
        computer_name,
    })
}

#[tauri::command]
pub fn stop_shelf_transfer() -> Result<(), String> {
    let mgr_guard = SERVER_MANAGER.lock().unwrap();
    if let Some(ref mgr) = *mgr_guard {
        let mut session_guard = mgr.active_session.lock().unwrap();
        *session_guard = None;
    }
    Ok(())
}

#[tauri::command]
pub fn get_shelf_transfer_status() -> Result<Option<ShelfSessionInfo>, String> {
    let mgr_guard = SERVER_MANAGER.lock().unwrap();
    if let Some(ref mgr) = *mgr_guard {
        let session_guard = mgr.active_session.lock().unwrap();
        if let Some(ref s) = *session_guard {
            let local_ip = get_local_ip();
            let computer_name = get_computer_name();
            match s {
                ActiveSession::Send { token, created_at, files } => {
                    let elapsed = created_at.elapsed().as_secs();
                    let remaining = 300u64.saturating_sub(elapsed);
                    return Ok(Some(ShelfSessionInfo {
                        token: token.clone(),
                        url: format!("http://{}:{}/d/{}", local_ip, mgr.port, token),
                        port: mgr.port,
                        local_ip,
                        expires_in_sec: remaining,
                        mode: "send".to_string(),
                        files: Some(files.clone()),
                        computer_name,
                    }));
                }
                ActiveSession::Receive { token, created_at, .. } => {
                    let elapsed = created_at.elapsed().as_secs();
                    let remaining = 300u64.saturating_sub(elapsed);
                    return Ok(Some(ShelfSessionInfo {
                        token: token.clone(),
                        url: format!("http://{}:{}/u/{}", local_ip, mgr.port, token),
                        port: mgr.port,
                        local_ip,
                        expires_in_sec: remaining,
                        mode: "receive".to_string(),
                        files: None,
                        computer_name,
                    }));
                }
            }
        }
    }
    Ok(None)
}
