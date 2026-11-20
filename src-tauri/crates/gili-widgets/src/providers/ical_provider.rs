use crate::providers::AgendaItem;
use serde::{Deserialize, Serialize};
use std::collections::{BTreeSet, HashSet};
use std::io::Read;
use std::time::Duration;

pub const ICAL_CRED_TARGET: &str = "GiliNotch/DesktopWidget/ical_url";
const MAX_ICS_BYTES: u64 = 4 * 1024 * 1024;
const MAX_EVENTS_OUT: usize = 128;

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct IcalFeedSnapshot {
    pub configured: bool,
    pub events: Vec<AgendaItem>,
    pub synced_count: usize,
    pub updated_label: String,
    pub error: Option<String>,
}

/// Validates and normalizes an iCal feed URL (`webcal://` -> `https://`), blocking local/private hosts.
pub fn validate_ical_url(raw: &str) -> Result<String, String> {
    let trimmed = raw.trim();
    if trimmed.is_empty() {
        return Err("URL iCal tidak boleh kosong.".to_string());
    }
    if trimmed
        .bytes()
        .any(|b| b <= 0x20 || b == 0x7F)
    {
        return Err("URL iCal mengandung spasi atau karakter tidak valid.".to_string());
    }
    let normalized = if let Some(rest) = trimmed
        .get(..9)
        .filter(|p| p.eq_ignore_ascii_case("webcal://"))
        .and_then(|_| trimmed.get(9..))
    {
        format!("https://{rest}")
    } else if trimmed
        .get(..8)
        .map(|p| p.eq_ignore_ascii_case("https://"))
        .unwrap_or(false)
    {
        trimmed.to_string()
    } else {
        return Err("URL iCal wajib menggunakan https:// atau webcal://.".to_string());
    };

    let after = &normalized["https://".len()..];
    let authority = after.split('/').next().unwrap_or("");
    let host_port = authority.rsplit('@').next().unwrap_or(authority);
    let host = if host_port.starts_with('[') {
        host_port
            .split(']')
            .next()
            .unwrap_or("")
            .trim_start_matches('[')
            .to_ascii_lowercase()
    } else {
        host_port.split(':').next().unwrap_or("").to_ascii_lowercase()
    };

    if is_disallowed_ical_host(&host) {
        return Err("Host lokal atau privat tidak diizinkan untuk feed iCal.".to_string());
    }
    Ok(normalized)
}

fn is_disallowed_ical_host(host: &str) -> bool {
    if host.is_empty()
        || host == "localhost"
        || host == "0.0.0.0"
        || host == "::1"
        || host.ends_with(".local")
        || host.ends_with(".internal")
        || host.starts_with("127.")
        || host.starts_with("10.")
        || host.starts_with("192.168.")
        || host.starts_with("169.254.")
    {
        return true;
    }
    if let Some(rest) = host.strip_prefix("172.") {
        if let Some(second_octet) = rest.split('.').next().and_then(|s| s.parse::<u8>().ok()) {
            if (16..=31).contains(&second_octet) {
                return true;
            }
        }
    }
    false
}

/// Converts Gregorian `(year, month 1..=12, day 1..=31)` to days since `1970-01-01`.
fn days_from_civil(y: i32, m: u32, d: u32) -> i64 {
    let mut yr = y as i64;
    let mn = m as i64;
    if mn <= 2 {
        yr -= 1;
    }
    let era = if yr >= 0 { yr } else { yr - 399 } / 400;
    let yoe = yr - era * 400;
    let adj_m = if mn > 2 { mn - 3 } else { mn + 9 };
    let doy = (153 * adj_m + 2) / 5 + d as i64 - 1;
    let doe = yoe * 365 + yoe / 4 - yoe / 100 + doy;
    era * 146_097 + doe - 719_468
}

/// Inverse of `days_from_civil`: returns `(year, month 1..=12, day 1..=31)`.
fn civil_from_days(z: i64) -> (i32, u32, u32) {
    let shifted = z + 719_468;
    let era = if shifted >= 0 {
        shifted
    } else {
        shifted - 146_096
    } / 146_097;
    let doe = shifted - era * 146_097;
    let yoe = (doe - doe / 1460 + doe / 36_524 - doe / 146_096) / 365;
    let mut y = yoe + era * 400;
    let doy = doe - (365 * yoe + yoe / 4 - yoe / 100);
    let mp = (5 * doy + 2) / 153;
    let d = doy - (153 * mp + 2) / 5 + 1;
    let m = if mp < 10 { mp + 3 } else { mp - 9 };
    if m <= 2 {
        y += 1;
    }
    (y as i32, m as u32, d as u32)
}

/// Returns Sunday-based weekday (`0 = SU .. 6 = SA`) for a day serial from `days_from_civil`.
fn weekday_from_days(day_serial: i64) -> u8 {
    // 1970-01-01 (day 0) was Thursday (4)
    (day_serial + 4).rem_euclid(7) as u8
}

fn days_in_month_gregorian(year: i32, month: u32) -> u32 {
    let leap = (year % 4 == 0 && year % 100 != 0) || (year % 400 == 0);
    match month {
        1 | 3 | 5 | 7 | 8 | 10 | 12 => 31,
        4 | 6 | 9 | 11 => 30,
        2 => {
            if leap {
                29
            } else {
                28
            }
        }
        _ => 30,
    }
}

fn unfold_ics_lines(raw: &str) -> Vec<String> {
    let mut lines: Vec<String> = Vec::new();
    for part in raw.split('\n') {
        let line = part.trim_end_matches('\r');
        if let Some(cont) = line.strip_prefix(' ').or_else(|| line.strip_prefix('\t')) {
            if let Some(prev) = lines.last_mut() {
                prev.push_str(cont);
            }
        } else if !line.is_empty() {
            lines.push(line.to_string());
        }
    }
    lines
}

fn unescape_ics_text(raw: &str) -> String {
    let mut out = String::with_capacity(raw.len());
    let mut chars = raw.chars();
    while let Some(ch) = chars.next() {
        if ch == '\\' {
            match chars.next() {
                Some('n') | Some('N') => out.push(' '),
                Some('\\') => out.push('\\'),
                Some(',') => out.push(','),
                Some(';') => out.push(';'),
                Some(other) => out.push(other),
                None => {}
            }
        } else {
            out.push(ch);
        }
    }
    out.split_whitespace().collect::<Vec<_>>().join(" ")
}

#[derive(Debug, Clone, Copy)]
struct ParsedIcsDt {
    day_serial: i64,
    ymd: (i32, u32, u32),
    hhmm: Option<(u32, u32)>,
}

fn parse_ics_datetime(params_upper: &str, val: &str, tz_offset_mins: i32) -> Option<ParsedIcsDt> {
    let s = val.trim();
    let force_date = params_upper.contains("VALUE=DATE") && !params_upper.contains("DATE-TIME");
    if s.len() < 8 {
        return None;
    }
    let y: i32 = s.get(0..4)?.parse().ok()?;
    let m: u32 = s.get(4..6)?.parse().ok()?;
    let d: u32 = s.get(6..8)?.parse().ok()?;
    if !(1..=12).contains(&m) || !(1..=31).contains(&d) {
        return None;
    }

    if force_date || s.len() == 8 {
        let ds = days_from_civil(y, m, d);
        return Some(ParsedIcsDt {
            day_serial: ds,
            ymd: (y, m, d),
            hhmm: None,
        });
    }

    if s.as_bytes().get(8) != Some(&b'T') || s.len() < 13 {
        let ds = days_from_civil(y, m, d);
        return Some(ParsedIcsDt {
            day_serial: ds,
            ymd: (y, m, d),
            hhmm: None,
        });
    }

    let hh: u32 = s.get(9..11)?.parse().ok()?;
    let mm: u32 = s.get(11..13)?.parse().ok()?;
    if hh >= 24 || mm >= 60 {
        return None;
    }

    if s.ends_with('Z') || s.ends_with('z') {
        let utc_days = days_from_civil(y, m, d);
        let total_mins = utc_days * 1440 + (hh as i64) * 60 + (mm as i64) + tz_offset_mins as i64;
        let local_days = total_mins.div_euclid(1440);
        let rem_mins = total_mins.rem_euclid(1440);
        let local_ymd = civil_from_days(local_days);
        return Some(ParsedIcsDt {
            day_serial: local_days,
            ymd: local_ymd,
            hhmm: Some(((rem_mins / 60) as u32, (rem_mins % 60) as u32)),
        });
    }

    let ds = days_from_civil(y, m, d);
    Some(ParsedIcsDt {
        day_serial: ds,
        ymd: (y, m, d),
        hhmm: Some((hh, mm)),
    })
}

fn parse_byday_code(code: &str) -> Option<u8> {
    let trimmed = code.trim();
    let suffix = if trimmed.len() >= 2 {
        &trimmed[trimmed.len() - 2..]
    } else {
        trimmed
    };
    match suffix {
        "SU" => Some(0),
        "MO" => Some(1),
        "TU" => Some(2),
        "WE" => Some(3),
        "TH" => Some(4),
        "FR" => Some(5),
        "SA" => Some(6),
        _ => None,
    }
}

#[derive(Default)]
struct RawVEvent {
    summary: String,
    dtstart_params: String,
    dtstart_val: String,
    rrule: Option<String>,
    exdates: Vec<(String, String)>,
    cancelled: bool,
}

fn expand_rrule_days(
    start: ParsedIcsDt,
    rrule: &str,
    tz_offset_mins: i32,
    win_start: i64,
    win_end: i64,
) -> Vec<i64> {
    let mut freq = "";
    let mut interval: i64 = 1;
    let mut count: Option<usize> = None;
    let mut until_day: Option<i64> = None;
    let mut bydays: Vec<u8> = Vec::new();

    for part in rrule.split(';') {
        let Some((k, v)) = part.split_once('=') else {
            continue;
        };
        match k.trim().to_ascii_uppercase().as_str() {
            "FREQ" => freq = v.trim(),
            "INTERVAL" => {
                if let Ok(n) = v.trim().parse::<i64>() {
                    interval = n.clamp(1, 52);
                }
            }
            "COUNT" => {
                if let Ok(n) = v.trim().parse::<usize>() {
                    count = Some(n.clamp(1, 2000));
                }
            }
            "UNTIL" => {
                if let Some(u) = parse_ics_datetime("", v.trim(), tz_offset_mins) {
                    until_day = Some(u.day_serial);
                }
            }
            "BYDAY" => {
                for tok in v.split(',') {
                    if let Some(wd) = parse_byday_code(tok) {
                        bydays.push(wd);
                    }
                }
            }
            _ => {}
        }
    }

    let max_day = until_day.map(|u| u.min(win_end)).unwrap_or(win_end);
    if start.day_serial > max_day {
        return Vec::new();
    }

    let mut days = Vec::new();
    let max_occ = count.unwrap_or(usize::MAX);

    match freq.to_ascii_uppercase().as_str() {
        "DAILY" => {
            let mut d = start.day_serial;
            let mut seen = 0usize;
            while d <= max_day && seen < max_occ {
                if d >= win_start {
                    days.push(d);
                }
                d += interval;
                seen += 1;
            }
        }
        "WEEKLY" => {
            if bydays.is_empty() {
                bydays.push(weekday_from_days(start.day_serial));
            }
            let start_dow = weekday_from_days(start.day_serial) as i64;
            let start_week_sunday = start.day_serial - start_dow;
            let mut week_idx: i64 = 0;
            let mut seen = 0usize;
            loop {
                let week_start = start_week_sunday + week_idx * 7 * interval;
                if week_start > max_day || seen >= max_occ {
                    break;
                }
                for offset in 0..7i64 {
                    let candidate = week_start + offset;
                    if candidate < start.day_serial {
                        continue;
                    }
                    if candidate > max_day || seen >= max_occ {
                        break;
                    }
                    if bydays.contains(&(offset as u8)) {
                        if candidate >= win_start {
                            days.push(candidate);
                        }
                        seen += 1;
                    }
                }
                week_idx += 1;
            }
        }
        "MONTHLY" => {
            let (mut y, mut m, target_d) = start.ymd;
            let mut seen = 0usize;
            for _ in 0..600 {
                let dim = days_in_month_gregorian(y, m);
                if target_d <= dim {
                    let cand = days_from_civil(y, m, target_d);
                    if cand > max_day || seen >= max_occ {
                        break;
                    }
                    if cand >= start.day_serial {
                        if cand >= win_start {
                            days.push(cand);
                        }
                        seen += 1;
                    }
                }
                let total_m = (y * 12 + (m as i32 - 1)) + interval as i32;
                y = total_m.div_euclid(12);
                m = total_m.rem_euclid(12) as u32 + 1;
            }
        }
        "YEARLY" => {
            let (mut y, target_m, target_d) = start.ymd;
            let mut seen = 0usize;
            for _ in 0..120 {
                if target_d <= days_in_month_gregorian(y, target_m) {
                    let cand = days_from_civil(y, target_m, target_d);
                    if cand > max_day || seen >= max_occ {
                        break;
                    }
                    if cand >= start.day_serial {
                        if cand >= win_start {
                            days.push(cand);
                        }
                        seen += 1;
                    }
                }
                y += interval as i32;
            }
        }
        _ => {
            if start.day_serial >= win_start && start.day_serial <= max_day {
                days.push(start.day_serial);
            }
        }
    }

    days
}

/// Parses an RFC 5545 `.ics` calendar string into sorted `AgendaItem`s around `today_ymd`.
pub fn parse_ics_events(
    ics_text: &str,
    today_ymd: (i32, u32, u32),
    tz_offset_mins: i32,
) -> Vec<AgendaItem> {
    let today_serial = days_from_civil(today_ymd.0, today_ymd.1, today_ymd.2);
    let win_start = today_serial - 3;
    let win_end = today_serial + 45;

    let mut raw_events: Vec<RawVEvent> = Vec::new();
    let mut current: Option<RawVEvent> = None;

    for line in unfold_ics_lines(ics_text) {
        if line.eq_ignore_ascii_case("BEGIN:VEVENT") {
            current = Some(RawVEvent::default());
            continue;
        }
        if line.eq_ignore_ascii_case("END:VEVENT") {
            if let Some(ev) = current.take() {
                if !ev.cancelled && !ev.summary.is_empty() && !ev.dtstart_val.is_empty() {
                    raw_events.push(ev);
                }
            }
            continue;
        }
        let Some(ref mut ev) = current else {
            continue;
        };
        let Some((head, val)) = line.split_once(':') else {
            continue;
        };
        let (name_raw, params_raw) = head.split_once(';').unwrap_or((head, ""));
        let name = name_raw.trim().to_ascii_uppercase();
        let params_upper = params_raw.to_ascii_uppercase();

        match name.as_str() {
            "SUMMARY" => ev.summary = unescape_ics_text(val),
            "DTSTART" => {
                ev.dtstart_params = params_upper;
                ev.dtstart_val = val.trim().to_string();
            }
            "RRULE" => ev.rrule = Some(val.trim().to_string()),
            "EXDATE" => ev.exdates.push((params_upper, val.trim().to_string())),
            "STATUS" => {
                if val.trim().eq_ignore_ascii_case("CANCELLED") {
                    ev.cancelled = true;
                }
            }
            _ => {}
        }
    }

    // Tuple: (date_key, sort_time, display_time, title)
    let mut collected: BTreeSet<(String, String, String, String)> = BTreeSet::new();

    for ev in raw_events {
        let Some(dtstart) = parse_ics_datetime(&ev.dtstart_params, &ev.dtstart_val, tz_offset_mins)
        else {
            continue;
        };
        let mut excluded_days: HashSet<i64> = HashSet::new();
        for (ex_params, ex_vals) in &ev.exdates {
            for item in ex_vals.split(',') {
                if let Some(ex_dt) = parse_ics_datetime(ex_params, item, tz_offset_mins) {
                    excluded_days.insert(ex_dt.day_serial);
                }
            }
        }

        let occ_days = if let Some(ref rrule) = ev.rrule {
            expand_rrule_days(dtstart, rrule, tz_offset_mins, win_start, win_end)
        } else if dtstart.day_serial >= win_start && dtstart.day_serial <= win_end {
            vec![dtstart.day_serial]
        } else {
            Vec::new()
        };

        let (sort_time, display_time) = match dtstart.hhmm {
            Some((hh, mm)) => {
                let t = format!("{hh:02}:{mm:02}");
                (t.clone(), t)
            }
            None => ("00:00_ALLDAY".to_string(), "all_day".to_string()),
        };

        for day_serial in occ_days {
            if excluded_days.contains(&day_serial) {
                continue;
            }
            let (y, m, d) = civil_from_days(day_serial);
            let date_key = format!("{y:04}-{m:02}-{d:02}");
            collected.insert((date_key, sort_time.clone(), display_time.clone(), ev.summary.clone()));
        }
    }

    collected
        .into_iter()
        .take(MAX_EVENTS_OUT)
        .enumerate()
        .map(|(i, (date_key, _, time, title))| AgendaItem {
            id: format!("ical_{i}"),
            title,
            time,
            date_key: Some(date_key),
        })
        .collect()
}

/// Fetches and parses a remote iCal (`.ics`) feed without ever leaking the secret URL in errors.
pub fn fetch_ical_feed(
    raw_url: &str,
    today_ymd: (i32, u32, u32),
    tz_offset_mins: i32,
) -> Result<IcalFeedSnapshot, String> {
    let url = validate_ical_url(raw_url)?;
    let agent = ureq::AgentBuilder::new()
        .timeout(Duration::from_secs(10))
        .build();

    let resp = agent
        .get(&url)
        .set("User-Agent", "Gili-Desktop-Widgets/1.0")
        .set("Accept", "text/calendar, text/plain, */*")
        .call()
        .map_err(|err| match err {
            ureq::Error::Status(code, _) => {
                format!("Server kalender mengembalikan status HTTP {code}.")
            }
            ureq::Error::Transport(_) => {
                "Gagal terhubung ke server kalender (periksa koneksi atau URL).".to_string()
            }
        })?;

    let mut buf = Vec::with_capacity(16 * 1024);
    resp.into_reader()
        .take(MAX_ICS_BYTES)
        .read_to_end(&mut buf)
        .map_err(|_| "Gagal membaca data kalender iCal.".to_string())?;
    let body = String::from_utf8_lossy(&buf);

    if !body.contains("BEGIN:VCALENDAR") {
        return Err("URL tidak mengembalikan berkas iCal (.ics) yang valid.".to_string());
    }

    let events = parse_ics_events(&body, today_ymd, tz_offset_mins);
    Ok(IcalFeedSnapshot {
        configured: true,
        synced_count: events.len(),
        events,
        updated_label: "iCal".to_string(),
        error: None,
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn url_validation_normalizes_webcal_and_blocks_private_hosts() {
        assert_eq!(
            validate_ical_url("webcal://calendar.google.com/calendar/ical/test/basic.ics")
                .expect("webcal upgrades to https"),
            "https://calendar.google.com/calendar/ical/test/basic.ics"
        );
        assert!(validate_ical_url("http://calendar.google.com/a.ics").is_err());
        assert!(validate_ical_url("https://localhost/cal.ics").is_err());
        assert!(validate_ical_url("https://127.0.0.1:8080/cal.ics").is_err());
        assert!(validate_ical_url("https://192.168.1.5/cal.ics").is_err());
        assert!(validate_ical_url("https://172.20.0.1/cal.ics").is_err());
    }

    #[test]
    fn ics_parser_handles_folding_utc_rollover_rrule_exdate_and_allday() {
        let sample = concat!(
            "BEGIN:VCALENDAR\r\n",
            "VERSION:2.0\r\n",
            "BEGIN:VEVENT\r\n",
            "SUMMARY:Late UTC Sync\\, Team\r\n",
            " Wrap\r\n",
            "DTSTART:20261121T183000Z\r\n",
            "END:VEVENT\r\n",
            "BEGIN:VEVENT\r\n",
            "SUMMARY:All Day Holiday\r\n",
            "DTSTART;VALUE=DATE:20261122\r\n",
            "END:VEVENT\r\n",
            "BEGIN:VEVENT\r\n",
            "SUMMARY:Cancelled Meeting\r\n",
            "DTSTART:20261121T100000\r\n",
            "STATUS:CANCELLED\r\n",
            "END:VEVENT\r\n",
            "BEGIN:VEVENT\r\n",
            "SUMMARY:Weekly Standup\r\n",
            "DTSTART;TZID=Asia/Jakarta:20261114T093000\r\n",
            "RRULE:FREQ=WEEKLY;BYDAY=SA;COUNT=3\r\n",
            "EXDATE;TZID=Asia/Jakarta:20261128T093000\r\n",
            "END:VEVENT\r\n",
            "END:VCALENDAR\r\n",
        );

        // UTC+7 (420 mins): 2026-11-21T18:30Z becomes 2026-11-22 01:30 local
        let events = parse_ics_events(sample, (2026, 11, 21), 420);
        assert!(
            !events.iter().any(|e| e.title == "Cancelled Meeting"),
            "CANCELLED events must be omitted"
        );
        assert!(
            events.iter().any(|e| {
                e.title == "Late UTC Sync, TeamWrap"
                    && e.date_key.as_deref() == Some("2026-11-22")
                    && e.time == "01:30"
            }),
            "UTC event must fold cleanly and roll over to local date: {events:?}"
        );
        assert!(
            events.iter().any(|e| {
                e.title == "All Day Holiday"
                    && e.date_key.as_deref() == Some("2026-11-22")
                    && e.time == "all_day"
            }),
            "All-day event must parse with all_day marker"
        );
        let standups: Vec<_> = events
            .iter()
            .filter(|e| e.title == "Weekly Standup")
            .collect();
        assert_eq!(standups.len(), 1);
        assert_eq!(standups[0].date_key.as_deref(), Some("2026-11-21"));
        assert_eq!(standups[0].time, "09:30");
    }
}
