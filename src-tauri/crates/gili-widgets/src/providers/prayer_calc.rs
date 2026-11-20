use serde::{Deserialize, Serialize};
use std::f64::consts::PI;
use std::path::Path;

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct PrayerTimes {
    pub imsak: String,
    pub subuh: String,
    pub terbit: String,
    pub dzuhur: String,
    pub ashar: String,
    pub maghrib: String,
    pub isya: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct PrayerDaySnapshot {
    pub city_name: String,
    pub latitude: f64,
    pub longitude: f64,
    pub tz_offset_hours: f64,
    pub times: PrayerTimes,
    pub next_name: String,
    pub next_time: String,
    pub countdown_label: String,
    pub ramadan_mode: bool,
    pub sahur_time: String,
    pub buka_time: String,
    pub method_label: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct NationalHolidayEntry {
    pub date: String,
    pub name: String,
    pub is_joint_leave: bool,
    pub source: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct HolidayCalendarFile {
    pub year: i32,
    pub source_reference: String,
    pub entries: Vec<NationalHolidayEntry>,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct HijriHolidaySnapshot {
    pub hijri_day: i32,
    pub hijri_month: i32,
    pub hijri_month_name: String,
    pub hijri_year: i32,
    pub hijri_formatted: String,
    pub offset_days: i32,
    pub is_ramadan: bool,
    pub holidays_loaded: bool,
    pub holiday_source_note: String,
    pub upcoming_holidays: Vec<NationalHolidayEntry>,
}

fn deg_to_rad(d: f64) -> f64 {
    d * PI / 180.0
}

fn rad_to_deg(r: f64) -> f64 {
    r * 180.0 / PI
}

fn fix_angle(a: f64) -> f64 {
    let mut v = a % 360.0;
    if v < 0.0 {
        v += 360.0;
    }
    v
}

fn fix_hour(h: f64) -> f64 {
    let mut v = h % 24.0;
    if v < 0.0 {
        v += 24.0;
    }
    v
}

pub fn julian_day(year: i32, month: i32, day: i32) -> f64 {
    let (y, m) = if month <= 2 {
        (year - 1, month + 12)
    } else {
        (year, month)
    };
    let a = (y as f64 / 100.0).floor();
    let b = 2.0 - a + (a / 4.0).floor();
    (365.25 * (y + 4716) as f64).floor()
        + (30.6001 * (m + 1) as f64).floor()
        + day as f64
        + b
        - 1524.5
}

fn sun_position(jd: f64) -> (f64, f64) {
    let d = jd - 2451545.0;
    let g = fix_angle(357.529 + 0.98560028 * d);
    let q = fix_angle(280.459 + 0.98564736 * d);
    let l = fix_angle(q + 1.915 * deg_to_rad(g).sin() + 0.020 * deg_to_rad(2.0 * g).sin());
    let e = 23.439 - 0.00000036 * d;
    let ra = rad_to_deg(deg_to_rad(e).cos().mul_add(deg_to_rad(l).sin(), 0.0).atan2(deg_to_rad(l).cos())) / 15.0;
    let decl = rad_to_deg((deg_to_rad(e).sin() * deg_to_rad(l).sin()).asin());
    let eq_time = q / 15.0 - fix_hour(ra);
    (decl, eq_time)
}

fn hour_angle_for_sun_altitude(lat_deg: f64, decl_deg: f64, alt_deg: f64) -> f64 {
    let num = deg_to_rad(alt_deg).sin() - deg_to_rad(lat_deg).sin() * deg_to_rad(decl_deg).sin();
    let den = deg_to_rad(lat_deg).cos() * deg_to_rad(decl_deg).cos();
    let ratio = (num / den).clamp(-1.0, 1.0);
    rad_to_deg(ratio.acos()) / 15.0
}

pub fn format_hours_hhmm(hours_float: f64) -> String {
    let total_mins = (fix_hour(hours_float) * 60.0).round() as i32;
    let hh = (total_mins / 60).rem_euclid(24);
    let mm = total_mins.rem_euclid(60);
    format!("{:02}:{:02}", hh, mm)
}

/// Calculates offline prayer times using Kemenag RI parameters:
/// Subuh depression = 20.0 deg, Isya depression = 18.0 deg, Asr Syafi'i = 1,
/// Ihtiyat safety margin = +2 minutes (standard Indonesian Kementerian Agama).
pub fn calculate_kemenag_prayer_times(
    year: i32,
    month: i32,
    day: i32,
    lat: f64,
    lon: f64,
    tz_offset_hours: f64,
) -> PrayerTimes {
    let jd = julian_day(year, month, day) - lon / 360.0;
    let (decl, eq_time) = sun_position(jd + 0.5);
    let transit = 12.0 + tz_offset_hours - lon / 15.0 - eq_time;

    let ihtiyat_hr = 2.0 / 60.0;

    let subuh_ha = hour_angle_for_sun_altitude(lat, decl, -20.0);
    let sunrise_ha = hour_angle_for_sun_altitude(lat, decl, -0.8333);
    let isya_ha = hour_angle_for_sun_altitude(lat, decl, -18.0);

    let asr_alt = rad_to_deg((1.0 / (1.0 + deg_to_rad((lat - decl).abs()).tan())).atan());
    let asr_ha = hour_angle_for_sun_altitude(lat, decl, asr_alt);

    let subuh_h = transit - subuh_ha + ihtiyat_hr;
    let imsak_h = subuh_h - (10.0 / 60.0);
    let terbit_h = transit - sunrise_ha - ihtiyat_hr;
    let dzuhur_h = transit + ihtiyat_hr;
    let ashar_h = transit + asr_ha + ihtiyat_hr;
    let maghrib_h = transit + sunrise_ha + ihtiyat_hr;
    let isya_h = transit + isya_ha + ihtiyat_hr;

    PrayerTimes {
        imsak: format_hours_hhmm(imsak_h),
        subuh: format_hours_hhmm(subuh_h),
        terbit: format_hours_hhmm(terbit_h),
        dzuhur: format_hours_hhmm(dzuhur_h),
        ashar: format_hours_hhmm(ashar_h),
        maghrib: format_hours_hhmm(maghrib_h),
        isya: format_hours_hhmm(isya_h),
    }
}

fn hhmm_to_minutes(hhmm: &str) -> i32 {
    let mut parts = hhmm.split(':');
    let h = parts.next().and_then(|s| s.parse::<i32>().ok()).unwrap_or(0);
    let m = parts.next().and_then(|s| s.parse::<i32>().ok()).unwrap_or(0);
    h * 60 + m
}

pub fn build_prayer_snapshot(
    city_name: &str,
    lat: f64,
    lon: f64,
    tz_offset_hours: f64,
    year: i32,
    month: i32,
    day: i32,
    cur_hour: i32,
    cur_min: i32,
    ramadan_mode: bool,
) -> PrayerDaySnapshot {
    let times = calculate_kemenag_prayer_times(year, month, day, lat, lon, tz_offset_hours);
    let now_m = cur_hour * 60 + cur_min;
    let schedule = [
        ("Subuh", &times.subuh),
        ("Dzuhur", &times.dzuhur),
        ("Ashar", &times.ashar),
        ("Maghrib", &times.maghrib),
        ("Isya", &times.isya),
    ];

    let mut next_name = "Subuh".to_string();
    let mut next_time = times.subuh.clone();
    let mut diff_mins = (hhmm_to_minutes(&times.subuh) + 24 * 60) - now_m;

    for (name, t) in schedule {
        let m = hhmm_to_minutes(t);
        if m > now_m {
            next_name = name.to_string();
            next_time = t.clone();
            diff_mins = m - now_m;
            break;
        }
    }

    let dh = diff_mins / 60;
    let dm = diff_mins % 60;
    let countdown_label = if dh > 0 {
        format!("{dh} jam {dm} mnt")
    } else {
        format!("{dm} menit")
    };

    PrayerDaySnapshot {
        city_name: city_name.to_string(),
        latitude: lat,
        longitude: lon,
        tz_offset_hours,
        sahur_time: times.imsak.clone(),
        buka_time: times.maghrib.clone(),
        times,
        next_name,
        next_time,
        countdown_label,
        ramadan_mode,
        method_label: "Kemenag RI (20 / 18 deg)".to_string(),
    }
}

const HIJRI_MONTHS_ID: [&str; 12] = [
    "Muharram",
    "Safar",
    "Rabiul Awal",
    "Rabiul Akhir",
    "Jumadil Awal",
    "Jumadil Akhir",
    "Rajab",
    "Syaban",
    "Ramadan",
    "Syawal",
    "Dzulkaidah",
    "Dzulhijjah",
];

/// Converts Gregorian date to tabular Hijri date with user +/-1 day adjustment.
pub fn gregorian_to_hijri(year: i32, month: i32, day: i32, offset_days: i32) -> (i32, i32, i32) {
    let clamped_offset = offset_days.clamp(-1, 1);
    let jd = julian_day(year, month, day).floor() as i64 + clamped_offset as i64;
    let l = jd - 1948440 + 10632;
    let n = (l - 1) / 10631;
    let l = l - 10631 * n + 354;
    let j = ((10985 - l) / 5316) * ((50 * l) / 17719) + (l / 5670) * ((43 * l) / 15238);
    let l = l - ((30 - j) / 15) * ((17719 * j) / 50) - (j / 16) * ((15238 * j) / 43) + 29;
    let h_month = ((24 * l) / 709) as i32;
    let h_day = (l - (709 * h_month as i64) / 24) as i32;
    let h_year = (30 * n + j - 30) as i32;
    (h_year, h_month.clamp(1, 12), h_day.clamp(1, 30))
}

/// Loads official SKB 3 Menteri holiday JSON if provided by user/update file.
/// Never fabricates holiday dates when the official data file is absent.
pub fn build_hijri_holiday_snapshot(
    year: i32,
    month: i32,
    day: i32,
    offset_days: i32,
    holidays_file_path: &Path,
) -> HijriHolidaySnapshot {
    let (hy, hm, hd) = gregorian_to_hijri(year, month, day, offset_days);
    let m_name = HIJRI_MONTHS_ID[(hm - 1).clamp(0, 11) as usize].to_string();
    let today_iso = format!("{:04}-{:02}-{:02}", year, month, day);

    let (loaded, source_note, upcoming) = match std::fs::read_to_string(holidays_file_path)
        .ok()
        .and_then(|s| serde_json::from_str::<HolidayCalendarFile>(&s).ok())
    {
        Some(cal) if !cal.entries.is_empty() => {
            let mut list: Vec<NationalHolidayEntry> = cal
                .entries
                .into_iter()
                .filter(|e| e.date >= today_iso)
                .collect();
            list.sort_by(|a, b| a.date.cmp(&b.date));
            list.truncate(4);
            (true, cal.source_reference, list)
        }
        _ => (
            false,
            "Data libur SKB 3 Menteri belum tersedia. Impor berkas resmi di Pengaturan.".to_string(),
            Vec::new(),
        ),
    };

    HijriHolidaySnapshot {
        hijri_day: hd,
        hijri_month: hm,
        hijri_month_name: m_name.clone(),
        hijri_year: hy,
        hijri_formatted: format!("{hd} {m_name} {hy} H"),
        offset_days: offset_days.clamp(-1, 1),
        is_ramadan: hm == 9,
        holidays_loaded: loaded,
        holiday_source_note: source_note,
        upcoming_holidays: upcoming,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn kemenag_jakarta_equinox_matches_official_tolerance() {
        // Jakarta Pusat (-6.2088, 106.8456, WIB UTC+7) on 2026-03-20 (equinox)
        // Official Kemenag RI Jakarta Pusat reference around 20 March:
        // Subuh ~04:41, Dzuhur ~12:01, Ashar ~15:13, Maghrib ~18:03, Isya ~19:12
        let t = calculate_kemenag_prayer_times(2026, 3, 20, -6.2088, 106.8456, 7.0);
        let subuh_m = hhmm_to_minutes(&t.subuh);
        let dzuhur_m = hhmm_to_minutes(&t.dzuhur);
        let ashar_m = hhmm_to_minutes(&t.ashar);
        let maghrib_m = hhmm_to_minutes(&t.maghrib);
        let isya_m = hhmm_to_minutes(&t.isya);

        assert!((subuh_m - hhmm_to_minutes("04:41")).abs() <= 3, "Subuh got {}", t.subuh);
        assert!((dzuhur_m - hhmm_to_minutes("12:01")).abs() <= 3, "Dzuhur got {}", t.dzuhur);
        assert!((ashar_m - hhmm_to_minutes("15:13")).abs() <= 3, "Ashar got {}", t.ashar);
        assert!((maghrib_m - hhmm_to_minutes("18:03")).abs() <= 3, "Maghrib got {}", t.maghrib);
        assert!((isya_m - hhmm_to_minutes("19:12")).abs() <= 3, "Isya got {}", t.isya);
    }

    #[test]
    fn hijri_offset_shifts_day_and_missing_holiday_file_never_fabricates() {
        let (_, _, d0) = gregorian_to_hijri(2026, 3, 20, 0);
        let (_, _, dp) = gregorian_to_hijri(2026, 3, 20, 1);
        assert_ne!(d0, dp);

        let missing = Path::new("nonexistent_skb_holidays.json");
        let snap = build_hijri_holiday_snapshot(2026, 3, 20, 0, missing);
        assert!(!snap.holidays_loaded);
        assert!(snap.upcoming_holidays.is_empty());
    }
}
