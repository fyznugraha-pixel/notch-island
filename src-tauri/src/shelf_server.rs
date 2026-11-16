use serde::{Deserialize, Serialize};
use std::fs::{File, OpenOptions};
use std::io::{ErrorKind, Read, Seek, SeekFrom, Write};
use std::net::UdpSocket;
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicBool, AtomicU64, Ordering};
use std::sync::{Arc, Mutex};
use std::time::{Duration, Instant, SystemTime, UNIX_EPOCH};
use tauri::{AppHandle, Emitter};
use tiny_http::{Header, Method, Response, Server, StatusCode};

fn with_header_safe<R: Read>(response: Response<R>, name: &[u8], value: &[u8]) -> Response<R> {
    match Header::from_bytes(name, value) {
        Ok(header) => response.with_header(header),
        Err(_) => response,
    }
}

fn escape_html(input: &str) -> String {
    let mut out = String::with_capacity(input.len());
    for ch in input.chars() {
        match ch {
            '&' => out.push_str("&amp;"),
            '<' => out.push_str("&lt;"),
            '>' => out.push_str("&gt;"),
            '"' => out.push_str("&quot;"),
            '\'' => out.push_str("&#39;"),
            _ => out.push(ch),
        }
    }
    out
}

fn percent_encode_rfc5987(input: &str) -> String {
    let mut encoded = String::with_capacity(input.len() * 3);
    for &b in input.as_bytes() {
        if b.is_ascii_alphanumeric()
            || matches!(
                b,
                b'!' | b'#' | b'$' | b'&' | b'+' | b'-' | b'.' | b'^' | b'_' | b'`' | b'|' | b'~'
            )
        {
            encoded.push(b as char);
        } else {
            encoded.push_str(&format!("%{:02X}", b));
        }
    }
    encoded
}

fn build_content_disposition(filename: &str) -> String {
    let safe_name: String = filename
        .chars()
        .filter(|c| !matches!(c, '/' | '\\' | '\0' | '\r' | '\n'))
        .collect();
    let trimmed = safe_name.trim();
    let final_name = if trimmed.is_empty() {
        "file.bin"
    } else {
        trimmed
    };

    let ascii_fallback: String = final_name
        .chars()
        .map(|c| {
            if c.is_ascii() && !c.is_ascii_control() && !matches!(c, '"' | ';' | '\\') {
                c
            } else {
                '_'
            }
        })
        .collect();
    let ascii_fallback = if ascii_fallback.trim().is_empty() {
        "file.bin".to_string()
    } else {
        ascii_fallback
    };

    format!(
        "attachment; filename=\"{}\"; filename*=UTF-8''{}",
        ascii_fallback,
        percent_encode_rfc5987(final_name)
    )
}

fn resolve_shelf_file_path(raw: &str) -> PathBuf {
    let trimmed = raw.trim().trim_matches('"');
    if let Some(rest) = trimmed.strip_prefix("file:///") {
        let decoded = urlencoding_decode(rest).replace('/', "\\");
        return PathBuf::from(decoded);
    }
    PathBuf::from(trimmed)
}

fn mime_type_for_filename(filename: &str) -> &'static str {
    let ext = filename.rsplit('.').next().unwrap_or("").to_lowercase();
    match ext.as_str() {
        "jpg" | "jpeg" | "jfif" => "image/jpeg",
        "png" => "image/png",
        "webp" => "image/webp",
        "gif" => "image/gif",
        "svg" => "image/svg+xml",
        "bmp" => "image/bmp",
        "ico" => "image/x-icon",
        "mp4" | "m4v" => "video/mp4",
        "mov" => "video/quicktime",
        "webm" => "video/webm",
        "mkv" => "video/x-matroska",
        "mp3" => "audio/mpeg",
        "wav" => "audio/wav",
        "pdf" => "application/pdf",
        "txt" | "md" | "log" => "text/plain; charset=utf-8",
        _ => "application/octet-stream",
    }
}

fn parse_single_byte_range(header_val: &str, total_len: u64) -> Option<(u64, u64)> {
    if total_len == 0 {
        return None;
    }
    let spec = header_val.trim().strip_prefix("bytes=")?;
    if spec.contains(',') {
        return None;
    }
    let (start_str, end_str) = spec.split_once('-')?;
    let start_s = start_str.trim();
    let end_s = end_str.trim();

    if start_s.is_empty() {
        let suffix: u64 = end_s.parse().ok()?;
        if suffix == 0 {
            return None;
        }
        let start = total_len.saturating_sub(suffix);
        return Some((start, total_len - 1));
    }

    let start: u64 = start_s.parse().ok()?;
    if start >= total_len {
        return None;
    }
    let end = if end_s.is_empty() {
        total_len - 1
    } else {
        end_s.parse::<u64>().ok()?.min(total_len - 1)
    };
    if end < start {
        return None;
    }
    Some((start, end))
}

fn escape_json_str(input: &str) -> String {
    input
        .replace('\\', "\\\\")
        .replace('"', "\\\"")
        .replace('\n', "\\n")
        .replace('\r', "\\r")
}

fn is_windows_reserved_stem(stem: &str) -> bool {
    matches!(
        stem.trim().to_ascii_uppercase().as_str(),
        "CON"
            | "PRN"
            | "AUX"
            | "NUL"
            | "COM1"
            | "COM2"
            | "COM3"
            | "COM4"
            | "COM5"
            | "COM6"
            | "COM7"
            | "COM8"
            | "COM9"
            | "LPT1"
            | "LPT2"
            | "LPT3"
            | "LPT4"
            | "LPT5"
            | "LPT6"
            | "LPT7"
            | "LPT8"
            | "LPT9"
    )
}

fn sanitize_upload_filename(raw: &str) -> String {
    let base = raw.rsplit(&['/', '\\'][..]).next().unwrap_or("").trim();
    let mut cleaned: String = base
        .chars()
        .map(|c| {
            if c.is_control() || matches!(c, '<' | '>' | ':' | '"' | '/' | '\\' | '|' | '?' | '*') {
                '_'
            } else {
                c
            }
        })
        .collect();

    cleaned = cleaned.trim().trim_end_matches(&['.', ' '][..]).to_string();
    if cleaned.is_empty() || cleaned == "." || cleaned == ".." {
        return format!("file_{}.bin", now_millis());
    }

    if let Some(dot_idx) = cleaned.rfind('.') {
        let raw_stem = &cleaned[..dot_idx];
        let ext = &cleaned[dot_idx + 1..];
        if dot_idx > 0 {
            let trimmed_stem = raw_stem.trim_end_matches(&['.', ' '][..]);
            let safe_stem = if trimmed_stem.is_empty() {
                "file".to_string()
            } else if is_windows_reserved_stem(trimmed_stem) {
                format!("_{}", trimmed_stem)
            } else {
                trimmed_stem.to_string()
            };
            cleaned = format!("{}.{}", safe_stem, ext);
        }
    } else if is_windows_reserved_stem(&cleaned) {
        cleaned = format!("_{}", cleaned);
    }

    const MAX_FILENAME_CHARS: usize = 160;
    if cleaned.chars().count() > MAX_FILENAME_CHARS {
        if let Some(dot_idx) = cleaned.rfind('.') {
            let ext = &cleaned[dot_idx..];
            let ext_chars = ext.chars().count();
            if dot_idx > 0 && ext_chars < MAX_FILENAME_CHARS {
                let stem_keep: String = cleaned[..dot_idx]
                    .chars()
                    .take(MAX_FILENAME_CHARS - ext_chars)
                    .collect();
                let trimmed_stem = stem_keep.trim_end_matches(&['.', ' '][..]);
                let base_stem = if trimmed_stem.is_empty() { "file" } else { trimmed_stem };
                cleaned = format!("{}{}", base_stem, ext);
            } else {
                cleaned = cleaned.chars().take(MAX_FILENAME_CHARS).collect();
            }
        } else {
            cleaned = cleaned.chars().take(MAX_FILENAME_CHARS).collect();
        }
    }

    cleaned
}

fn split_stem_ext(filename: &str) -> (&str, Option<&str>) {
    match filename.rfind('.') {
        Some(dot) if dot > 0 && dot + 1 < filename.len() => (&filename[..dot], Some(&filename[dot + 1..])),
        _ => (filename, None),
    }
}

fn create_unique_dest_file(
    target_dir: &Path,
    safe_filename: &str,
) -> std::io::Result<(File, PathBuf, String)> {
    std::fs::create_dir_all(target_dir)?;
    let (stem, ext) = split_stem_ext(safe_filename);

    for attempt in 0..=9999u32 {
        let candidate_name = if attempt == 0 {
            safe_filename.to_string()
        } else if let Some(ext_str) = ext {
            format!("{} ({}).{}", stem, attempt, ext_str)
        } else {
            format!("{} ({})", stem, attempt)
        };
        let candidate_path = target_dir.join(&candidate_name);
        match OpenOptions::new()
            .write(true)
            .create_new(true)
            .open(&candidate_path)
        {
            Ok(file) => return Ok((file, candidate_path, candidate_name)),
            Err(e) if e.kind() == ErrorKind::AlreadyExists => continue,
            Err(e) => return Err(e),
        }
    }

    let fallback_name = if let Some(ext_str) = ext {
        format!("{}_{}.{}", stem, now_millis(), ext_str)
    } else {
        format!("{}_{}", stem, now_millis())
    };
    let fallback_path = target_dir.join(&fallback_name);
    let file = OpenOptions::new()
        .write(true)
        .create_new(true)
        .open(&fallback_path)?;
    Ok((file, fallback_path, fallback_name))
}

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
static NEXT_TRANSFER_ID: AtomicU64 = AtomicU64::new(1);

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
        let dir = PathBuf::from(userprofile)
            .join("Downloads")
            .join("Gili Shelf");
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
            if let Ok(byte_val) =
                u8::from_str_radix(std::str::from_utf8(&bytes[i + 1..i + 3]).unwrap_or(""), 16)
            {
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
            chosen_port = srv
                .server_addr()
                .to_ip()
                .map(|ip| ip.port())
                .unwrap_or(port);
            chosen_server = Some(Arc::new(srv));
            break;
        }
    }

    let srv = chosen_server
        .ok_or_else(|| "Gagal memulai local HTTP server pada port 8731+".to_string())?;
    let is_running = Arc::new(AtomicBool::new(true));
    let active_session = Arc::new(Mutex::new(None));

    let srv_clone = srv.clone();
    let is_running_clone = is_running.clone();
    let session_clone = active_session.clone();
    let app_handle = app.clone();

    let (req_tx, req_rx) = std::sync::mpsc::sync_channel::<tiny_http::Request>(64);
    let shared_rx = Arc::new(Mutex::new(req_rx));
    for _ in 0..8 {
        let rx_worker = Arc::clone(&shared_rx);
        let worker_session = session_clone.clone();
        let worker_app = app_handle.clone();
        std::thread::spawn(move || loop {
            let next_req = match rx_worker.lock() {
                Ok(guard) => guard.recv(),
                Err(_) => break,
            };
            match next_req {
                Ok(req) => handle_http_request(req, &worker_session, &worker_app),
                Err(_) => break,
            }
        });
    }

    std::thread::spawn(move || {
        while is_running_clone.load(Ordering::Relaxed) {
            let request = match srv_clone.recv_timeout(Duration::from_millis(500)) {
                Ok(Some(req)) => req,
                Ok(None) => continue,
                Err(_) => continue,
            };

            if req_tx.send(request).is_err() {
                break;
            }
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
    let session_opt = session_arc
        .lock()
        .ok()
        .and_then(|guard| guard.as_ref().cloned());

    let session = match session_opt {
        Some(s) => s,
        None => {
            let response = with_header_safe(
                Response::from_string("Sesi transfer belum aktif atau telah berakhir.")
                    .with_status_code(StatusCode(404)),
                b"Content-Type",
                b"text/plain; charset=utf-8",
            );
            let _ = request.respond(response);
            return;
        }
    };

    // Check expiration (5 minutes / 300 secs)
    let (created_at, active_token) = match &session {
        ActiveSession::Send {
            created_at, token, ..
        } => (*created_at, token.clone()),
        ActiveSession::Receive {
            created_at, token, ..
        } => (*created_at, token.clone()),
    };

    if created_at.elapsed() > Duration::from_secs(300) {
        let response = with_header_safe(
            Response::from_string(
                "Tautan telah kadaluarsa (berlaku 5 menit). Silakan scan ulang dari rak laptop.",
            )
            .with_status_code(StatusCode(410)),
            b"Content-Type",
            b"text/plain; charset=utf-8",
        );
        let _ = request.respond(response);
        return;
    }

    // Collect headers for device detection & HTTP byte range
    let mut user_agent = String::new();
    let mut range_header: Option<String> = None;
    for h in request.headers() {
        let field_name = h.field.as_str().as_str();
        if field_name.eq_ignore_ascii_case("User-Agent") {
            user_agent = h.value.as_str().to_string();
        } else if field_name.eq_ignore_ascii_case("Range") {
            range_header = Some(h.value.as_str().to_string());
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
                let response = with_header_safe(
                    with_header_safe(
                        Response::from_string(html),
                        b"Content-Type",
                        b"text/html; charset=utf-8",
                    ),
                    b"Cache-Control",
                    b"no-store",
                );
                let _ = request.respond(response);
                return;
            } else if parts.len() == 4 && parts[2] == "file" && method == Method::Get {
                // Serve specific file: /d/<token>/file/<index>
                if let Ok(idx) = parts[3].parse::<usize>() {
                    if idx < files.len() {
                        let file_meta = &files[idx];
                        let resolved_path = resolve_shelf_file_path(&file_meta.path);
                        let query = parse_query_params(&raw_url);
                        let is_inline = query.get("inline").map(|v| v == "1").unwrap_or(false);

                        if let Ok(mut f) = File::open(&resolved_path) {
                            let total_len = f.metadata().map(|m| m.len()).unwrap_or(file_meta.size);
                            let filename = resolved_path
                                .file_name()
                                .map(|n| n.to_string_lossy().to_string())
                                .unwrap_or_else(|| file_meta.name.clone());
                            let content_type = if is_inline {
                                mime_type_for_filename(&filename)
                            } else {
                                "application/octet-stream"
                            };
                            let disposition = if is_inline {
                                "inline".to_string()
                            } else {
                                build_content_disposition(&filename)
                            };

                            if let Some(ref raw_range) = range_header {
                                if let Some((start, end)) =
                                    parse_single_byte_range(raw_range, total_len)
                                {
                                    if let Ok(chunk_len) = usize::try_from(end - start + 1) {
                                        if f.seek(SeekFrom::Start(start)).is_ok() {
                                            let limited = f.take(chunk_len as u64);
                                            let range_val =
                                                format!("bytes {}-{}/{}", start, end, total_len);
                                            let mut resp = Response::new(
                                                StatusCode(206),
                                                vec![],
                                                limited,
                                                Some(chunk_len),
                                                None,
                                            );
                                            resp = with_header_safe(
                                                resp,
                                                b"Content-Type",
                                                content_type.as_bytes(),
                                            );
                                            resp = with_header_safe(
                                                resp,
                                                b"Content-Disposition",
                                                disposition.as_bytes(),
                                            );
                                            resp = with_header_safe(
                                                resp,
                                                b"Content-Range",
                                                range_val.as_bytes(),
                                            );
                                            resp =
                                                with_header_safe(resp, b"Accept-Ranges", b"bytes");
                                            resp = with_header_safe(
                                                resp,
                                                b"Cache-Control",
                                                b"no-store",
                                            );
                                            let _ = request.respond(resp);
                                            return;
                                        }
                                    }
                                } else {
                                    let range_err = format!("bytes */{}", total_len);
                                    let resp = with_header_safe(
                                        Response::empty(StatusCode(416)),
                                        b"Content-Range",
                                        range_err.as_bytes(),
                                    );
                                    let _ = request.respond(resp);
                                    return;
                                }
                            }

                            let mut response = with_header_safe(
                                with_header_safe(
                                    Response::from_file(f),
                                    b"Content-Type",
                                    content_type.as_bytes(),
                                ),
                                b"Content-Disposition",
                                disposition.as_bytes(),
                            );
                            response = with_header_safe(response, b"Accept-Ranges", b"bytes");
                            response = with_header_safe(response, b"Cache-Control", b"no-store");
                            let _ = request.respond(response);
                            return;
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
                let response = with_header_safe(
                    with_header_safe(
                        Response::from_string(html),
                        b"Content-Type",
                        b"text/html; charset=utf-8",
                    ),
                    b"Cache-Control",
                    b"no-store",
                );
                let _ = request.respond(response);
                return;
            } else if parts.len() == 3 && parts[2] == "upload" && method == Method::Post {
                // Handle file upload stream: /u/<token>/upload?name=...&size=...&device=...
                let query = parse_query_params(&raw_url);
                let raw_filename = query
                    .get("name")
                    .cloned()
                    .unwrap_or_else(|| format!("file_{}.bin", now_millis()));
                let safe_filename = sanitize_upload_filename(&raw_filename);

                const MAX_UPLOAD_BYTES: u64 = 2 * 1024 * 1024 * 1024;
                if request
                    .body_length()
                    .map_or(false, |len| (len as u64) > MAX_UPLOAD_BYTES)
                {
                    let response = with_header_safe(
                        Response::from_string(
                            r#"{"ok":false,"error":"File exceeds maximum upload limit"}"#,
                        )
                        .with_status_code(StatusCode(413)),
                        b"Content-Type",
                        b"application/json",
                    );
                    let _ = request.respond(response);
                    return;
                }

                let total_size: u64 = query
                    .get("size")
                    .and_then(|s| s.parse().ok())
                    .unwrap_or(0)
                    .min(MAX_UPLOAD_BYTES);
                let device_name =
                    detect_device_name(&user_agent, query.get("device").map(|s| s.as_str()));
                let seq = NEXT_TRANSFER_ID.fetch_add(1, Ordering::Relaxed);
                let file_id = format!("{}_{}_{}", now_millis(), seq, safe_filename);

                let (dest_path_opt, actual_filename) = match create_unique_dest_file(target_dir, &safe_filename) {
                    Ok((f, path, name)) => (Some((f, path)), name),
                    Err(e) => {
                        let _ = app.emit(
                            "shelf-transfer-progress",
                            ShelfTransferProgressPayload {
                                id: file_id,
                                name: safe_filename,
                                size: total_size,
                                transferred: 0,
                                progress: 0,
                                status: "error".to_string(),
                                device_name,
                                speed_formatted: None,
                            },
                        );
                        let err_msg = escape_json_str(&e.to_string());
                        let response = with_header_safe(
                            Response::from_string(format!(
                                r#"{{"ok":false,"error":"{}"}}"#,
                                err_msg
                            ))
                            .with_status_code(StatusCode(500)),
                            b"Content-Type",
                            b"application/json",
                        );
                        let _ = request.respond(response);
                        return;
                    }
                };
                let (mut dest_file, dest_path) = dest_path_opt.unwrap();

                // Stream request body directly into target file
                let reader = request.as_reader();
                let mut buffer = [0u8; 64 * 1024];
                let mut transferred = 0u64;

                let write_res = (|| -> std::io::Result<()> {
                    let start_time = Instant::now();
                    let mut last_emit = Instant::now();
                    loop {
                        let bytes_read = reader.read(&mut buffer)?;
                        if bytes_read == 0 {
                            break;
                        }
                        if transferred.saturating_add(bytes_read as u64) > MAX_UPLOAD_BYTES {
                            return Err(std::io::Error::new(
                                std::io::ErrorKind::InvalidData,
                                "File exceeds maximum upload limit",
                            ));
                        }
                        dest_file.write_all(&buffer[..bytes_read])?;
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

                            let _ = app.emit(
                                "shelf-transfer-progress",
                                ShelfTransferProgressPayload {
                                    id: file_id.clone(),
                                    name: actual_filename.clone(),
                                    size: total_size.max(transferred),
                                    transferred,
                                    progress,
                                    status: "transferring".to_string(),
                                    device_name: device_name.clone(),
                                    speed_formatted: Some(speed_formatted),
                                },
                            );
                        }
                    }
                    dest_file.flush()?;
                    Ok(())
                })();
                drop(dest_file);

                match write_res {
                    Ok(_) => {
                        let ext = actual_filename
                            .rsplit('.')
                            .next()
                            .filter(|_| actual_filename.contains('.'))
                            .unwrap_or("")
                            .to_lowercase();

                        let mut thumbnail: Option<String> = None;
                        let is_raster_img = matches!(
                            ext.as_str(),
                            "png" | "jpg" | "jpeg" | "webp" | "gif" | "bmp"
                        );
                        if (ext == "svg" || ext == "ico") && transferred <= 512 * 1024 {
                            if let Ok(bytes) = std::fs::read(&dest_path) {
                                use base64::{engine::general_purpose::STANDARD, Engine as _};
                                let mime = if ext == "svg" {
                                    "image/svg+xml"
                                } else {
                                    "image/x-icon"
                                };
                                let b64 = STANDARD.encode(&bytes);
                                thumbnail = Some(format!("data:{};base64,{}", mime, b64));
                            }
                        } else if is_raster_img && transferred <= 25 * 1024 * 1024 {
                            if let Some(img) = crate::decode_safe_image_from_path(&dest_path) {
                                use base64::{engine::general_purpose::STANDARD, Engine as _};
                                let thumb =
                                    img.resize(320, 320, image::imageops::FilterType::CatmullRom);
                                let mut buffer = std::io::Cursor::new(Vec::with_capacity(16384));
                                if thumb.write_to(&mut buffer, image::ImageFormat::Png).is_ok() {
                                    let b64 = STANDARD.encode(buffer.into_inner());
                                    thumbnail = Some(format!("data:image/png;base64,{}", b64));
                                }
                            }
                        }

                        let _ = app.emit(
                            "shelf-transfer-progress",
                            ShelfTransferProgressPayload {
                                id: file_id.clone(),
                                name: actual_filename.clone(),
                                size: transferred,
                                transferred,
                                progress: 100,
                                status: "completed".to_string(),
                                device_name: device_name.clone(),
                                speed_formatted: None,
                            },
                        );

                        let _ = app.emit(
                            "shelf-file-received",
                            ShelfFileReceivedPayload {
                                id: file_id,
                                name: actual_filename.clone(),
                                path: dest_path.to_string_lossy().to_string(),
                                ext,
                                size: transferred,
                                size_formatted: format_file_size(transferred),
                                device_name,
                                added_at: now_millis(),
                                thumbnail,
                            },
                        );

                        let response = with_header_safe(
                            Response::from_string(format!(
                                r#"{{"ok":true,"savedName":"{}"}}"#,
                                escape_json_str(&actual_filename)
                            )),
                            b"Content-Type",
                            b"application/json",
                        );
                        let _ = request.respond(response);
                        return;
                    }
                    Err(e) => {
                        let _ = std::fs::remove_file(&dest_path);
                        let _ = app.emit(
                            "shelf-transfer-progress",
                            ShelfTransferProgressPayload {
                                id: file_id,
                                name: actual_filename,
                                size: total_size.max(transferred),
                                transferred,
                                progress: 0,
                                status: "error".to_string(),
                                device_name,
                                speed_formatted: None,
                            },
                        );
                        let status = if e.kind() == std::io::ErrorKind::InvalidData {
                            StatusCode(413)
                        } else {
                            StatusCode(500)
                        };
                        let err_msg = escape_json_str(&e.to_string());
                        let response = with_header_safe(
                            Response::from_string(format!(
                                r#"{{"ok":false,"error":"{}"}}"#,
                                err_msg
                            ))
                            .with_status_code(status),
                            b"Content-Type",
                            b"application/json",
                        );
                        let _ = request.respond(response);
                        return;
                    }
                }
            } else if parts.len() == 3 && parts[2] == "complete" && method == Method::Post {
                let query = parse_query_params(&raw_url);
                let device_name =
                    detect_device_name(&user_agent, query.get("device").map(|s| s.as_str()));
                let count: usize = query.get("count").and_then(|s| s.parse().ok()).unwrap_or(0);
                let total_bytes: u64 = query.get("bytes").and_then(|s| s.parse().ok()).unwrap_or(0);

                let _ = app.emit(
                    "shelf-transfer-completed",
                    ShelfTransferCompletedPayload {
                        device_name,
                        total_files: count,
                        total_bytes,
                    },
                );

                let response = with_header_safe(
                    Response::from_string("{\"ok\":true}"),
                    b"Content-Type",
                    b"application/json",
                );
                let _ = request.respond(response);
                return;
            }
        }
    }

    let _ = request.respond(Response::from_string("Not Found").with_status_code(StatusCode(404)));
}

// -------------------------------------------------------------
// HTML Mobile Web UI Renderers (Design.html Board 64)
// -------------------------------------------------------------

fn render_upload_html(token: &str, hostname: &str) -> String {
    format!(
        r##"<!DOCTYPE html>
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
    .status-error {{
      color: #fb7185;
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

    <div class="dropzone" id="dropArea" onclick="openFilePicker()">
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
    let isUploading = false;
    let uploadGen = 0;

    const filePicker = document.getElementById('filePicker');
    const fileList = document.getElementById('fileList');
    const sendBtn = document.getElementById('sendBtn');

    function openFilePicker() {{
      if (isUploading) return;
      filePicker.click();
    }}

    filePicker.addEventListener('change', (e) => {{
      if (isUploading) {{
        e.target.value = '';
        return;
      }}
      const files = Array.from(e.target.files || []);
      e.target.value = '';
      if (files.length === 0) return;
      uploadGen++;
      selectedFiles = [...selectedFiles, ...files];
      sendBtn.style.background = '';
      sendBtn.style.boxShadow = '';
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

        const thumbBox = document.createElement('div');
        thumbBox.className = 'thumb-box';
        try {{
          const objUrl = URL.createObjectURL(f);
          if (isImg) {{
            const img = document.createElement('img');
            img.className = 'thumb-img';
            img.src = objUrl;
            img.alt = '';
            thumbBox.appendChild(img);
          }} else if (isVid) {{
            const vid = document.createElement('video');
            vid.className = 'thumb-img';
            vid.src = objUrl + '#t=0.5';
            vid.muted = true;
            vid.playsInline = true;
            vid.preload = 'metadata';
            const overlay = document.createElement('div');
            overlay.className = 'play-overlay';
            overlay.innerHTML = '<svg width="12" height="12" viewBox="0 0 24 24" fill="white"><polygon points="5 3 19 12 5 21 5 3"></polygon></svg>';
            thumbBox.appendChild(vid);
            thumbBox.appendChild(overlay);
          }} else {{
            const badge = document.createElement('span');
            badge.className = 'thumb-badge';
            badge.textContent = getExt(f.name);
            thumbBox.appendChild(badge);
          }}
        }} catch(e) {{
          const badge = document.createElement('span');
          badge.className = 'thumb-badge';
          badge.textContent = getExt(f.name);
          thumbBox.appendChild(badge);
        }}

        const fileMeta = document.createElement('div');
        fileMeta.className = 'file-meta';
        const fileNameEl = document.createElement('div');
        fileNameEl.className = 'file-name';
        fileNameEl.textContent = f.name;
        const fileSubEl = document.createElement('div');
        fileSubEl.className = 'file-sub';
        fileSubEl.textContent = formatSize(f.size);
        fileMeta.appendChild(fileNameEl);
        fileMeta.appendChild(fileSubEl);

        const statusBadge = document.createElement('div');
        statusBadge.className = 'status-badge';
        statusBadge.id = `status-${{idx}}`;
        statusBadge.textContent = 'Siap';

        const rowProg = document.createElement('div');
        rowProg.className = 'row-progress';
        rowProg.id = `prog-${{idx}}`;

        row.appendChild(thumbBox);
        row.appendChild(fileMeta);
        row.appendChild(statusBadge);
        row.appendChild(rowProg);
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
      if (isUploading || selectedFiles.length === 0) return;
      isUploading = true;
      const currentGen = ++uploadGen;
      const batch = [...selectedFiles];
      sendBtn.disabled = true;
      sendBtn.style.background = '';
      sendBtn.style.boxShadow = '';
      sendBtn.innerText = 'Mengirim ke Laptop...';

      let successCount = 0;
      let failCount = 0;
      let uploadedBytes = 0;

      for (let i = 0; i < batch.length; i++) {{
        const file = batch[i];
        const statusEl = document.getElementById(`status-${{i}}`);
        const progEl = document.getElementById(`prog-${{i}}`);
        statusEl.innerText = '0%';
        statusEl.className = 'status-badge';
        if (progEl) progEl.style.background = '#3882F6';

        const ok = await new Promise((resolve) => {{
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
            let parsed = null;
            try {{ parsed = JSON.parse(xhr.responseText || '{{}}'); }} catch {{}}
            if (xhr.status >= 200 && xhr.status < 300 && (!parsed || parsed.ok !== false)) {{
              statusEl.innerHTML = '✓ Selesai';
              statusEl.className = 'status-badge status-done';
              if (progEl) progEl.style.width = '100%';
              resolve(true);
            }} else {{
              statusEl.innerText = xhr.status === 410 ? 'Kadaluarsa' : xhr.status === 413 ? 'Terlalu besar' : 'Gagal';
              statusEl.className = 'status-badge status-error';
              if (progEl) {{
                progEl.style.width = '100%';
                progEl.style.background = '#ef4444';
              }}
              resolve(false);
            }}
          }};
          xhr.onerror = () => {{
            statusEl.innerText = 'Gagal';
            statusEl.className = 'status-badge status-error';
            if (progEl) {{
              progEl.style.width = '100%';
              progEl.style.background = '#ef4444';
            }}
            resolve(false);
          }};
          xhr.onabort = () => {{
            statusEl.innerText = 'Dibatalkan';
            statusEl.className = 'status-badge status-error';
            resolve(false);
          }};
          xhr.send(file);
        }});

        if (ok) {{
          successCount++;
          uploadedBytes += file.size;
        }} else {{
          failCount++;
        }}
      }}

      try {{
        await fetch(`/u/{token}/complete?count=${{successCount}}&bytes=${{uploadedBytes}}`, {{ method: 'POST' }});
      }} catch {{}}

      selectedFiles = [];
      isUploading = false;
      sendBtn.disabled = true;

      if (successCount > 0 && failCount === 0) {{
        sendBtn.innerText = 'Semua File Berhasil Masuk ke Rak Laptop! ✓';
        sendBtn.style.background = '#10b981';
        sendBtn.style.color = '#ffffff';
        sendBtn.style.boxShadow = '0 4px 20px rgba(16, 185, 129, 0.4)';
        if (navigator.vibrate) {{
          navigator.vibrate([40, 60, 40]);
        }}
      }} else if (successCount > 0) {{
        sendBtn.innerText = `${{successCount}} berhasil, ${{failCount}} gagal dikirim`;
        sendBtn.style.background = '#d97706';
        sendBtn.style.color = '#ffffff';
        sendBtn.style.boxShadow = '0 4px 20px rgba(217, 119, 6, 0.35)';
      }} else {{
        sendBtn.innerText = 'Pengiriman gagal · Pilih file lagi';
        sendBtn.style.background = '#ef4444';
        sendBtn.style.color = '#ffffff';
        sendBtn.style.boxShadow = '0 4px 20px rgba(239, 68, 68, 0.35)';
      }}

      setTimeout(() => {{
        if (currentGen !== uploadGen) return;
        sendBtn.style.background = '';
        sendBtn.style.color = '';
        sendBtn.style.boxShadow = '';
        sendBtn.disabled = true;
        sendBtn.innerText = 'Pilih file di atas untuk kirim lagi';
      }}, 3500);
    }}
  </script>
</body>
</html>"##,
        token = token,
        hostname = escape_html(hostname)
    )
}

fn render_download_html(token: &str, files: &[ShelfFileMeta], hostname: &str) -> String {
    let mut file_rows = String::new();
    for (idx, f) in files.iter().enumerate() {
        let ext = f.name.split('.').last().unwrap_or("FILE").to_lowercase();
        let is_img = ["jpg", "jpeg", "png", "webp", "gif", "bmp", "svg"].contains(&ext.as_str());
        let is_vid = ["mp4", "mov", "webm", "mkv"].contains(&ext.as_str());

        let thumb_html = if is_img {
            format!(
                r#"<img class="thumb-img" src="/d/{}/file/{}?inline=1" loading="lazy" alt="">"#,
                token, idx
            )
        } else if is_vid {
            format!(
                r#"<video class="thumb-img" src="/d/{}/file/{}?inline=1#t=0.5" muted playsinline preload="metadata"></video>
                <div class="play-overlay"><svg width="12" height="12" viewBox="0 0 24 24" fill="white"><polygon points="5 3 19 12 5 21 5 3"></polygon></svg></div>"#,
                token, idx
            )
        } else {
            format!(
                r#"<span class="thumb-badge">{}</span>"#,
                escape_html(&ext.to_uppercase())
            )
        };

        let escaped_name = escape_html(&f.name);
        let escaped_size = escape_html(&f.size_formatted);

        file_rows.push_str(&format!(
            r##"<div class="file-row">
        <div class="thumb-box">
          {}
        </div>
        <div class="file-meta">
          <div class="file-name">{}</div>
          <div class="file-sub">{}</div>
        </div>
        <button class="unduh-btn" type="button" data-idx="{}" data-filename="{}">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round">
            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
            <polyline points="7 10 12 15 17 10"></polyline>
            <line x1="12" y1="15" x2="12" y2="3"></line>
          </svg>
          Unduh
        </button>
      </div>"##,
            thumb_html, escaped_name, escaped_size, idx, escaped_name
        ));
    }

    format!(
        r##"<!DOCTYPE html>
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

    document.querySelector('.file-list')?.addEventListener('click', (e) => {{
      const btn = e.target.closest('.unduh-btn');
      if (!btn) return;
      const idx = Number(btn.dataset.idx);
      if (!Number.isInteger(idx)) return;
      downloadSingle(idx, btn.dataset.filename || '');
    }});

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
        hostname = escape_html(hostname),
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
    let mut missing_names = Vec::new();
    for p in &paths {
        let path_obj = resolve_shelf_file_path(p);
        let name = path_obj
            .file_name()
            .map(|n| n.to_string_lossy().to_string())
            .filter(|n| !n.is_empty())
            .unwrap_or_else(|| "file".to_string());

        let meta_res = std::fs::metadata(&path_obj);
        let can_open = meta_res.as_ref().is_ok_and(|m| m.is_file()) && File::open(&path_obj).is_ok();
        if !can_open {
            missing_names.push(name);
            continue;
        }
        let size = meta_res.map(|m| m.len()).unwrap_or(0);
        files_meta.push(ShelfFileMeta {
            name,
            size,
            size_formatted: format_file_size(size),
            path: path_obj.to_string_lossy().to_string(),
        });
    }

    if !missing_names.is_empty() || files_meta.is_empty() {
        return Err(format!(
            "File tidak ditemukan atau tidak bisa dibaca: {}",
            missing_names.join(", ")
        ));
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
                ActiveSession::Send {
                    token,
                    created_at,
                    files,
                } => {
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
                ActiveSession::Receive {
                    token, created_at, ..
                } => {
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

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_build_content_disposition_handles_non_ascii_and_quotes() {
        let cases = [
            "laporan-Keuangan 2026 🚀.pdf",
            "it's \"quoted\"; <script>\r\n.txt",
            "日本語ファイル.png",
            "   ",
        ];
        for name in cases {
            let disp = build_content_disposition(name);
            assert!(disp.is_ascii(), "header value must remain ASCII: {}", disp);
            assert!(
                Header::from_bytes(b"Content-Disposition", disp.as_bytes()).is_ok(),
                "Header::from_bytes should never fail for {}",
                name
            );
        }
        let quoted = build_content_disposition("cat's \"pic\".png");
        assert!(quoted.contains("filename=\"cat's _pic_.png\""));
        assert!(quoted.contains("filename*=UTF-8''cat%27s%20%22pic%22.png"));
    }

    #[test]
    fn test_render_download_html_escapes_filenames_and_hostname() {
        let files = vec![ShelfFileMeta {
            name: "a'b<img src=x onerror=alert(1)>.png".to_string(),
            size: 128,
            size_formatted: "128 B".to_string(),
            path: "C:\\tmp\\test.png".to_string(),
        }];
        let html = render_download_html("tok123", &files, "PC<Evil>'\"");
        assert!(html.contains("PC&lt;Evil&gt;&#39;&quot;"));
        assert!(!html.contains("onclick=\"downloadSingle("));
        assert!(html.contains("data-filename=\"a&#39;b&lt;img src=x onerror=alert(1)&gt;.png\""));
        assert!(html.contains("/d/tok123/file/0?inline=1"));
    }

    #[test]
    fn test_parse_single_byte_range_cases() {
        assert_eq!(parse_single_byte_range("bytes=0-1", 100), Some((0, 1)));
        assert_eq!(parse_single_byte_range("bytes=50-", 100), Some((50, 99)));
        assert_eq!(parse_single_byte_range("bytes=-10", 100), Some((90, 99)));
        assert_eq!(parse_single_byte_range("bytes=0-500", 100), Some((0, 99)));
        assert_eq!(parse_single_byte_range("bytes=100-120", 100), None);
        assert_eq!(parse_single_byte_range("bytes=20-10", 100), None);
        assert_eq!(parse_single_byte_range("bytes=0-0", 0), None);
    }

    #[test]
    fn test_resolve_shelf_file_path_strips_quotes_and_file_uri() {
        assert_eq!(
            resolve_shelf_file_path("  \"C:\\tmp\\raskur 2.jpg\"  "),
            PathBuf::from("C:\\tmp\\raskur 2.jpg")
        );
        assert_eq!(
            resolve_shelf_file_path("file:///C:/tmp/raskur%202.jpg"),
            PathBuf::from("C:\\tmp\\raskur 2.jpg")
        );
    }

    #[test]
    fn test_sanitize_upload_filename_strips_traversal_and_illegal_chars() {
        assert_eq!(
            sanitize_upload_filename("C:\\fakepath\\foto:liburan?.jpg"),
            "foto_liburan_.jpg"
        );
        assert_eq!(
            sanitize_upload_filename("../../etc/passwd"),
            "passwd"
        );
        assert_eq!(
            sanitize_upload_filename("  <bad>|name*   .  "),
            "_bad__name_"
        );
        assert_eq!(sanitize_upload_filename("CON.txt"), "_CON.txt");
        assert_eq!(sanitize_upload_filename("nul"), "_nul");
        assert_eq!(sanitize_upload_filename("..txt"), "file.txt");

        for empty_case in ["", ".", "..", "..."] {
            let clean = sanitize_upload_filename(empty_case);
            assert!(clean.starts_with("file_") && clean.ends_with(".bin"), "got {}", clean);
        }
    }

    #[test]
    fn test_create_unique_dest_file_prevents_overwrite() {
        let dir = std::env::temp_dir().join(format!("gili_shelf_test_{}", now_millis()));
        let _ = std::fs::remove_dir_all(&dir);

        let (f1, p1, n1) = create_unique_dest_file(&dir, "image.jpg").unwrap();
        drop(f1);
        assert_eq!(n1, "image.jpg");
        assert!(p1.exists());

        let (f2, p2, n2) = create_unique_dest_file(&dir, "image.jpg").unwrap();
        drop(f2);
        assert_eq!(n2, "image (1).jpg");
        assert!(p2.exists());

        let (f3, p3, n3) = create_unique_dest_file(&dir, "image.jpg").unwrap();
        drop(f3);
        assert_eq!(n3, "image (2).jpg");
        assert!(p3.exists());

        let (f4, p4, n4) = create_unique_dest_file(&dir, "README").unwrap();
        drop(f4);
        assert_eq!(n4, "README");
        assert!(p4.exists());

        let (f5, p5, n5) = create_unique_dest_file(&dir, "README").unwrap();
        drop(f5);
        assert_eq!(n5, "README (1)");
        assert!(p5.exists());

        let _ = std::fs::remove_dir_all(&dir);
    }

    #[test]
    fn test_render_upload_html_tracks_results_and_resets_picker() {
        let html = render_upload_html("tok123", "PC-TEST");
        assert!(html.contains("e.target.value = ''"));
        assert!(html.contains("status-error"));
        assert!(html.contains("successCount"));
        assert!(html.contains("failCount"));
    }
}
