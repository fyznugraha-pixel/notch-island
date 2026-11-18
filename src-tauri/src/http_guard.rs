use std::collections::HashMap;
use std::io::BufRead;
use std::net::{IpAddr, Ipv4Addr, Ipv6Addr, ToSocketAddrs};

pub const MAX_AI_STREAM_LINE_BYTES: usize = 1024 * 1024;
pub const MAX_AI_STREAM_TOTAL_BYTES: usize = 32 * 1024 * 1024;
const GILI_SHELF_PORT: u16 = 8731;

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ParsedHttpUrl {
    pub is_https: bool,
    pub host: String,
    pub port: u16,
    pub is_explicit_loopback: bool,
}

fn is_disallowed_ipv4(ip: Ipv4Addr) -> bool {
    let octets = ip.octets();
    let is_cgnat = octets[0] == 100 && (octets[1] & 0xC0) == 64;
    ip.is_loopback()
        || ip.is_private()
        || ip.is_link_local()
        || ip.is_unspecified()
        || ip.is_broadcast()
        || ip.is_multicast()
        || ip.is_documentation()
        || is_cgnat
}

fn is_disallowed_ipv6(ip: Ipv6Addr) -> bool {
    if let Some(mapped) = ip.to_ipv4_mapped() {
        return is_disallowed_ipv4(mapped);
    }
    let seg0 = ip.segments()[0];
    let is_unique_local = (seg0 & 0xFE00) == 0xFC00;
    let is_link_local = (seg0 & 0xFFC0) == 0xFE80;
    ip.is_loopback()
        || ip.is_unspecified()
        || ip.is_multicast()
        || is_unique_local
        || is_link_local
}

pub fn is_disallowed_ip(ip: IpAddr) -> bool {
    match ip {
        IpAddr::V4(v4) => is_disallowed_ipv4(v4),
        IpAddr::V6(v6) => is_disallowed_ipv6(v6),
    }
}

fn parse_authority(raw: &str) -> Result<(bool, String, u16), String> {
    let (is_https, rest) = if let Some(s) = raw.strip_prefix("https://") {
        (true, s)
    } else if let Some(s) = raw.strip_prefix("http://") {
        (false, s)
    } else {
        return Err("Only http(s) URLs are allowed".to_string());
    };

    if rest.is_empty()
        || rest.chars().any(|c| c.is_control() || c.is_whitespace())
        || rest.contains('\\')
    {
        return Err("Malformed URL".to_string());
    }

    let authority = rest.split(['/', '?', '#']).next().unwrap_or("");
    if authority.is_empty() || authority.contains('@') {
        return Err("URL must not contain credentials or an empty host".to_string());
    }

    let (host, port_opt) = if let Some(after_open) = authority.strip_prefix('[') {
        let close_idx = after_open
            .find(']')
            .ok_or_else(|| "Malformed IPv6 host in URL".to_string())?;
        let host_inner = &after_open[..close_idx];
        let remainder = &after_open[close_idx + 1..];
        let port = if let Some(port_str) = remainder.strip_prefix(':') {
            Some(
                port_str
                    .parse::<u16>()
                    .map_err(|_| "Invalid port in URL".to_string())?,
            )
        } else if remainder.is_empty() {
            None
        } else {
            return Err("Malformed authority in URL".to_string());
        };
        (host_inner.to_ascii_lowercase(), port)
    } else if let Some((h, p)) = authority.rsplit_once(':') {
        let port = p
            .parse::<u16>()
            .map_err(|_| "Invalid port in URL".to_string())?;
        (h.to_ascii_lowercase(), Some(port))
    } else {
        (authority.to_ascii_lowercase(), None)
    };

    if host.is_empty() {
        return Err("Empty host in URL".to_string());
    }

    let port = port_opt.unwrap_or(if is_https { 443 } else { 80 });
    if port == 0 {
        return Err("Port 0 is not allowed".to_string());
    }

    Ok((is_https, host, port))
}

fn is_loopback_host(host: &str) -> bool {
    if host == "localhost" || host == "::1" {
        return true;
    }
    if let Ok(IpAddr::V4(v4)) = host.parse::<IpAddr>() {
        return v4.is_loopback();
    }
    if let Ok(IpAddr::V6(v6)) = host.parse::<IpAddr>() {
        return v6.is_loopback();
    }
    false
}

pub fn validate_ai_url_syntax(raw: &str) -> Result<ParsedHttpUrl, String> {
    let trimmed = raw.trim();
    let (is_https, host, port) = parse_authority(trimmed)?;
    let explicit_loopback = is_loopback_host(&host);

    if explicit_loopback {
        if port == GILI_SHELF_PORT {
            return Err("Blocked internal Gili service port".to_string());
        }
        return Ok(ParsedHttpUrl {
            is_https,
            host,
            port,
            is_explicit_loopback: true,
        });
    }

    if !is_https {
        return Err("HTTPS is required for non-local AI endpoints".to_string());
    }

    if host == "metadata.google.internal"
        || host.ends_with(".local")
        || host.ends_with(".internal")
        || host.ends_with(".localhost")
    {
        return Err(format!("Blocked internal or metadata host: {}", host));
    }

    if let Ok(ip) = host.parse::<IpAddr>() {
        if is_disallowed_ip(ip) {
            return Err(format!("Blocked private or link-local IP: {}", ip));
        }
    }

    Ok(ParsedHttpUrl {
        is_https,
        host,
        port,
        is_explicit_loopback: false,
    })
}

pub fn validate_ai_url(raw: &str) -> Result<ParsedHttpUrl, String> {
    let parsed = validate_ai_url_syntax(raw)?;
    if parsed.is_explicit_loopback || parsed.host.parse::<IpAddr>().is_ok() {
        return Ok(parsed);
    }

    if let Ok(addrs) = (parsed.host.as_str(), parsed.port).to_socket_addrs() {
        let mut saw_any = false;
        for addr in addrs {
            saw_any = true;
            if is_disallowed_ip(addr.ip()) {
                return Err("AI endpoint resolved to a blocked private/link-local address".to_string());
            }
        }
        if !saw_any {
            return Err("Unable to resolve AI endpoint host".to_string());
        }
    }
    Ok(parsed)
}

pub fn sanitize_headers(
    headers: Option<HashMap<String, String>>,
) -> Result<Vec<(String, String)>, String> {
    let Some(hdrs) = headers else {
        return Ok(Vec::new());
    };
    let mut clean = Vec::with_capacity(hdrs.len());
    for (k, v) in hdrs {
        if k.is_empty()
            || k.chars().any(|c| c == '\r' || c == '\n' || c == '\0' || c == ':')
            || v.chars().any(|c| c == '\r' || c == '\n' || c == '\0')
        {
            return Err("Invalid HTTP header name or value".to_string());
        }
        let lower = k.to_ascii_lowercase();
        if matches!(
            lower.as_str(),
            "host" | "content-length" | "transfer-encoding" | "connection"
        ) {
            continue;
        }
        clean.push((k, v));
    }
    Ok(clean)
}

pub fn resolve_redirect_url(current_url: &str, location: &str) -> Result<String, String> {
    let loc = location.trim();
    if loc.starts_with("https://") || loc.starts_with("http://") {
        return Ok(loc.to_string());
    }
    let scheme_end = current_url
        .find("://")
        .ok_or_else(|| "Invalid base URL".to_string())?;
    let scheme = &current_url[..scheme_end];
    let after_scheme = &current_url[scheme_end + 3..];
    let origin_len = after_scheme
        .find('/')
        .map(|i| scheme_end + 3 + i)
        .unwrap_or(current_url.len());
    let origin = &current_url[..origin_len];

    if let Some(rest) = loc.strip_prefix("//") {
        return Ok(format!("{}:{}", scheme, format!("//{}", rest)));
    }
    if loc.starts_with('/') {
        return Ok(format!("{}{}", origin, loc));
    }
    let dir_end = current_url[origin_len..]
        .rfind('/')
        .map(|i| origin_len + i + 1)
        .unwrap_or(origin_len);
    let prefix = &current_url[..dir_end];
    if prefix.ends_with('/') {
        Ok(format!("{}{}", prefix, loc))
    } else {
        Ok(format!("{}/{}", prefix, loc))
    }
}

pub fn redact_url_secrets(input: &str) -> String {
    let lower = input.to_ascii_lowercase();
    let bytes = input.as_bytes();
    let lower_bytes = lower.as_bytes();
    const PATTERNS: &[&[u8]] = &[
        b"?key=",
        b"&key=",
        b"?api_key=",
        b"&api_key=",
        b"?token=",
        b"&token=",
        b"?access_token=",
        b"&access_token=",
    ];

    let mut out = String::with_capacity(input.len());
    let mut i = 0usize;
    while i < bytes.len() {
        let mut matched_len = None;
        for pat in PATTERNS {
            if lower_bytes[i..].starts_with(pat) {
                matched_len = Some(pat.len());
                break;
            }
        }
        if let Some(plen) = matched_len {
            out.push_str(&input[i..i + plen]);
            out.push_str("[REDACTED]");
            i += plen;
            while i < bytes.len() {
                let b = bytes[i];
                if matches!(
                    b,
                    b'&' | b' ' | b'\t' | b'\r' | b'\n' | b'"' | b'\'' | b')' | b']' | b'>' | b','
                ) {
                    break;
                }
                i += 1;
            }
        } else if let Some(ch) = input[i..].chars().next() {
            out.push(ch);
            i += ch.len_utf8();
        } else {
            break;
        }
    }
    out
}

pub fn read_bounded_line<R: BufRead>(
    reader: &mut R,
    max_bytes: usize,
) -> Result<Option<String>, String> {
    let mut raw = Vec::new();
    let mut total_read = 0usize;

    loop {
        let available = reader
            .fill_buf()
            .map_err(|e| format!("Read error: {}", e))?;
        if available.is_empty() {
            if raw.is_empty() {
                return Ok(None);
            }
            break;
        }

        if let Some(nl_pos) = available.iter().position(|&b| b == b'\n') {
            let chunk_len = nl_pos + 1;
            if total_read + chunk_len > max_bytes {
                return Err("AI stream line exceeds maximum allowed size".to_string());
            }
            raw.extend_from_slice(&available[..chunk_len]);
            reader.consume(chunk_len);
            break;
        }

        let chunk_len = available.len();
        if total_read + chunk_len > max_bytes {
            return Err("AI stream line exceeds maximum allowed size".to_string());
        }
        raw.extend_from_slice(available);
        total_read += chunk_len;
        reader.consume(chunk_len);
    }

    if raw.ends_with(b"\n") {
        raw.pop();
        if raw.ends_with(b"\r") {
            raw.pop();
        }
    }

    let line = String::from_utf8(raw)
        .map_err(|_| "Stream contained invalid UTF-8 bytes".to_string())?;
    Ok(Some(line))
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::io::Cursor;

    #[test]
    fn validates_ai_url_blocks_ssrf_and_plaintext_remote() {
        assert!(validate_ai_url_syntax("http://169.254.169.254/latest/meta-data/").is_err());
        assert!(validate_ai_url_syntax("https://169.254.169.254/latest").is_err());
        assert!(validate_ai_url_syntax("https://192.168.1.1/v1").is_err());
        assert!(validate_ai_url_syntax("https://10.0.0.5/v1").is_err());
        assert!(validate_ai_url_syntax("http://api.openai.com/v1/chat/completions").is_err());
        assert!(validate_ai_url_syntax("http://127.0.0.1:8731/d/test").is_err());
        assert!(validate_ai_url_syntax("http://localhost:8731/upload").is_err());

        assert!(validate_ai_url_syntax("http://localhost:11434/v1/chat/completions").is_ok());
        assert!(validate_ai_url_syntax("http://127.0.0.1:1234/v1/models").is_ok());
        assert!(validate_ai_url_syntax("https://generativelanguage.googleapis.com/v1beta/models").is_ok());
    }

    #[test]
    fn redacts_api_keys_in_urls_and_errors() {
        let raw = "Network error: https://generativelanguage.googleapis.com/v1beta/models?alt=sse&key=AIzaSySecret12345 failed";
        let redacted = redact_url_secrets(raw);
        assert!(!redacted.contains("AIzaSySecret12345"));
        assert!(redacted.contains("&key=[REDACTED] failed"));
    }

    #[test]
    fn bounded_line_reader_rejects_oversized_lines() {
        let mut ok_reader = Cursor::new(b"data: hello\r\ndata: world\n".as_slice());
        assert_eq!(read_bounded_line(&mut ok_reader, 64).unwrap(), Some("data: hello".to_string()));
        assert_eq!(read_bounded_line(&mut ok_reader, 64).unwrap(), Some("data: world".to_string()));
        assert_eq!(read_bounded_line(&mut ok_reader, 64).unwrap(), None);

        let long_payload = vec![b'x'; 200];
        let mut too_big = Cursor::new(long_payload);
        assert!(read_bounded_line(&mut too_big, 64).is_err());
    }
}
