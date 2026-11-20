use serde::{Deserialize, Serialize};
use std::time::{Duration, Instant};

pub const MIN_UPTIME_INTERVAL_SECS: u64 = 60;
pub const MAX_UPTIME_SITES: usize = 6;
pub const GITHUB_CRED_TARGET: &str = "GiliNotch/DesktopWidget/github_pat";

/// Strict domain allowlist for built-in network providers.
pub const BUILTIN_ALLOWED_HOSTS: &[&str] = &[
    "api.open-meteo.com",
    "open.er-api.com",
    "api.github.com",
];

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct HourlyWeatherPoint {
    pub hour_label: String,
    pub temp_c: f32,
    pub code: i32,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct DailyWeatherPoint {
    pub day_label: String,
    pub min_c: f32,
    pub max_c: f32,
    pub code: i32,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct WeatherForecastSnapshot {
    pub available: bool,
    pub location_name: String,
    pub current_temp_c: f32,
    pub current_code: i32,
    pub hourly: Vec<HourlyWeatherPoint>,
    pub daily: Vec<DailyWeatherPoint>,
    pub updated_label: String,
    pub error: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SiteMonitorConfig {
    pub name: String,
    pub url: String,
    pub interval_secs: u64,
    pub timeout_ms: u64,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct SiteStatusSnapshot {
    pub name: String,
    pub url: String,
    pub up: Option<bool>,
    pub status_code: Option<u16>,
    pub latency_ms: Option<u32>,
    pub checked_label: String,
    pub error: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct GitHubStatusSnapshot {
    pub configured: bool,
    pub repo: String,
    pub open_prs: u32,
    pub open_issues: u32,
    pub latest_action_name: String,
    pub latest_action_conclusion: String,
    pub etag: Option<String>,
    pub updated_label: String,
    pub error: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct CurrencyGoldSnapshot {
    pub usd_to_idr: Option<f64>,
    pub eur_to_idr: Option<f64>,
    pub sgd_to_idr: Option<f64>,
    pub currency_source: String,
    pub currency_updated_at: String,
    pub gold_provider_configured: bool,
    pub gold_idr_per_gram: Option<f64>,
    pub gold_note: String,
}

/// Provider interface for licensed gold spot APIs (no fabricated prices).
pub trait GoldPriceProvider: Send + Sync {
    fn provider_name(&self) -> &'static str;
    fn fetch_idr_per_gram(&self) -> Result<Option<f64>, String>;
}

pub struct UnconfiguredGoldProvider;
impl GoldPriceProvider for UnconfiguredGoldProvider {
    fn provider_name(&self) -> &'static str {
        "Belum dikonfigurasi"
    }
    fn fetch_idr_per_gram(&self) -> Result<Option<f64>, String> {
        Ok(None)
    }
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct FootballMatchItem {
    pub league: String,
    pub home: String,
    pub away: String,
    pub score: String,
    pub status: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct FootballScoreSnapshot {
    pub provider_configured: bool,
    pub provider_note: String,
    pub matches: Vec<FootballMatchItem>,
}

/// Provider interface for licensed football score APIs (no scraping, no guessed free API).
pub trait FootballScoreProvider: Send + Sync {
    fn provider_name(&self) -> &'static str;
    fn fetch_matches(&self) -> Result<Vec<FootballMatchItem>, String>;
}

pub struct UnconfiguredFootballProvider;
impl FootballScoreProvider for UnconfiguredFootballProvider {
    fn provider_name(&self) -> &'static str {
        "Belum dikonfigurasi"
    }
    fn fetch_matches(&self) -> Result<Vec<FootballMatchItem>, String> {
        Ok(Vec::new())
    }
}

/// Exponential backoff helper shared across network pollers.
#[derive(Debug, Clone)]
pub struct BackoffState {
    pub failures: u32,
    pub base_secs: u64,
    pub max_secs: u64,
    pub next_allowed: Option<Instant>,
}

impl BackoffState {
    pub fn new(base_secs: u64, max_secs: u64) -> Self {
        Self {
            failures: 0,
            base_secs: base_secs.max(10),
            max_secs: max_secs.max(60),
            next_allowed: None,
        }
    }

    pub fn can_run(&self, now: Instant) -> bool {
        self.next_allowed.map(|t| now >= t).unwrap_or(true)
    }

    pub fn record_success(&mut self, now: Instant) {
        self.failures = 0;
        self.next_allowed = Some(now + Duration::from_secs(self.base_secs));
    }

    pub fn record_failure(&mut self, now: Instant) {
        self.failures = self.failures.saturating_add(1).min(8);
        let wait = (self.base_secs.saturating_mul(1u64 << self.failures.min(5))).min(self.max_secs);
        self.next_allowed = Some(now + Duration::from_secs(wait));
    }
}

pub fn validate_https_url_with_allowlist(url: &str, allowed_hosts: &[&str]) -> Result<String, String> {
    let trimmed = url.trim();
    if !trimmed.starts_with("https://") {
        return Err("Hanya URL HTTPS yang diizinkan.".to_string());
    }
    let after = &trimmed["https://".len()..];
    let host_port = after.split('/').next().unwrap_or("");
    let host = host_port.split(':').next().unwrap_or("").to_ascii_lowercase();
    if host.is_empty() || host == "localhost" || host.starts_with("127.") || host.starts_with("169.254.") {
        return Err("Host tidak diizinkan.".to_string());
    }
    if !allowed_hosts.is_empty() && !allowed_hosts.iter().any(|h| h.eq_ignore_ascii_case(&host)) {
        return Err(format!("Domain {host} tidak masuk daftar izin."));
    }
    Ok(trimmed.to_string())
}

pub fn fetch_open_meteo_forecast(
    location_name: &str,
    lat: f64,
    lon: f64,
) -> WeatherForecastSnapshot {
    let url = format!(
        "https://api.open-meteo.com/v1/forecast?latitude={lat:.4}&longitude={lon:.4}&current=temperature_2m,weather_code&hourly=temperature_2m,weather_code&daily=weather_code,temperature_2m_max,temperature_2m_min&forecast_days=5&timezone=auto"
    );
    if validate_https_url_with_allowlist(&url, BUILTIN_ALLOWED_HOSTS).is_err() {
        return WeatherForecastSnapshot {
            available: false,
            error: Some("URL cuaca tidak valid".into()),
            ..Default::default()
        };
    }

    let agent = ureq::AgentBuilder::new()
        .timeout(Duration::from_secs(8))
        .build();
    match agent.get(&url).call() {
        Ok(resp) => match resp
            .into_string()
            .ok()
            .and_then(|s| serde_json::from_str::<serde_json::Value>(&s).ok())
        {
            Some(v) => {
                let current_temp_c = v["current"]["temperature_2m"].as_f64().unwrap_or(0.0) as f32;
                let current_code = v["current"]["weather_code"].as_i64().unwrap_or(0) as i32;

                let mut hourly = Vec::new();
                if let (Some(ts), Some(temps), Some(codes)) = (
                    v["hourly"]["time"].as_array(),
                    v["hourly"]["temperature_2m"].as_array(),
                    v["hourly"]["weather_code"].as_array(),
                ) {
                    for i in 0..ts.len().min(6) {
                        let label = ts[i]
                            .as_str()
                            .and_then(|s| s.split('T').nth(1))
                            .unwrap_or("--:--")
                            .to_string();
                        hourly.push(HourlyWeatherPoint {
                            hour_label: label,
                            temp_c: temps.get(i).and_then(|x| x.as_f64()).unwrap_or(0.0) as f32,
                            code: codes.get(i).and_then(|x| x.as_i64()).unwrap_or(0) as i32,
                        });
                    }
                }

                let mut daily = Vec::new();
                if let (Some(ds), Some(mins), Some(maxs), Some(codes)) = (
                    v["daily"]["time"].as_array(),
                    v["daily"]["temperature_2m_min"].as_array(),
                    v["daily"]["temperature_2m_max"].as_array(),
                    v["daily"]["weather_code"].as_array(),
                ) {
                    for i in 0..ds.len().min(5) {
                        daily.push(DailyWeatherPoint {
                            day_label: ds[i].as_str().unwrap_or("---").to_string(),
                            min_c: mins.get(i).and_then(|x| x.as_f64()).unwrap_or(0.0) as f32,
                            max_c: maxs.get(i).and_then(|x| x.as_f64()).unwrap_or(0.0) as f32,
                            code: codes.get(i).and_then(|x| x.as_i64()).unwrap_or(0) as i32,
                        });
                    }
                }

                WeatherForecastSnapshot {
                    available: true,
                    location_name: location_name.to_string(),
                    current_temp_c,
                    current_code,
                    hourly,
                    daily,
                    updated_label: "Baru diperbarui".to_string(),
                    error: None,
                }
            }
            None => WeatherForecastSnapshot {
                available: false,
                location_name: location_name.to_string(),
                error: Some("Format respons cuaca tidak valid".into()),
                ..Default::default()
            },
        },
        Err(_) => WeatherForecastSnapshot {
            available: false,
            location_name: location_name.to_string(),
            error: Some("Offline atau layanan cuaca tidak terjangkau".into()),
            ..Default::default()
        },
    }
}

pub fn ping_user_site(cfg: &SiteMonitorConfig) -> SiteStatusSnapshot {
    let clean_url = match validate_https_url_with_allowlist(&cfg.url, &[]) {
        Ok(u) => u,
        Err(err) => {
            return SiteStatusSnapshot {
                name: cfg.name.clone(),
                url: cfg.url.clone(),
                up: Some(false),
                error: Some(err),
                ..Default::default()
            }
        }
    };
    let timeout = Duration::from_millis(cfg.timeout_ms.clamp(1500, 15_000));
    let agent = ureq::AgentBuilder::new().timeout(timeout).build();
    let started = Instant::now();
    match agent.head(&clean_url).call() {
        Ok(resp) => SiteStatusSnapshot {
            name: cfg.name.clone(),
            url: clean_url,
            up: Some(resp.status() < 500),
            status_code: Some(resp.status()),
            latency_ms: Some(started.elapsed().as_millis() as u32),
            checked_label: "Aktif".into(),
            error: None,
        },
        Err(ureq::Error::Status(code, _)) => SiteStatusSnapshot {
            name: cfg.name.clone(),
            url: clean_url,
            up: Some(code < 500),
            status_code: Some(code),
            latency_ms: Some(started.elapsed().as_millis() as u32),
            checked_label: format!("HTTP {code}"),
            error: None,
        },
        Err(_) => SiteStatusSnapshot {
            name: cfg.name.clone(),
            url: clean_url,
            up: Some(false),
            status_code: None,
            latency_ms: None,
            checked_label: "Gagal".into(),
            error: Some("Timeout atau tidak terjangkau".into()),
        },
    }
}

/// Fetches currency rates from Gili's existing provider `open.er-api.com`.
/// Gold price stays empty unless a licensed GoldPriceProvider is configured.
pub fn fetch_currency_and_gold(gold_provider: &dyn GoldPriceProvider) -> CurrencyGoldSnapshot {
    let url = "https://open.er-api.com/v6/latest/USD";
    let agent = ureq::AgentBuilder::new().timeout(Duration::from_secs(8)).build();
    let mut snap = CurrencyGoldSnapshot {
        currency_source: "open.er-api.com".to_string(),
        gold_provider_configured: false,
        gold_note: "Harga emas memerlukan penyedia API berlisensi.".to_string(),
        ..Default::default()
    };

    if let Ok(resp) = agent.get(url).call() {
        if let Some(v) = resp
            .into_string()
            .ok()
            .and_then(|s| serde_json::from_str::<serde_json::Value>(&s).ok())
        {
            let idr = v["rates"]["IDR"].as_f64();
            let eur = v["rates"]["EUR"].as_f64();
            let sgd = v["rates"]["SGD"].as_f64();
            snap.usd_to_idr = idr;
            if let (Some(i), Some(e)) = (idr, eur) {
                if e > 0.0 {
                    snap.eur_to_idr = Some(i / e);
                }
            }
            if let (Some(i), Some(s)) = (idr, sgd) {
                if s > 0.0 {
                    snap.sgd_to_idr = Some(i / s);
                }
            }
            snap.currency_updated_at = v["time_last_update_utc"]
                .as_str()
                .unwrap_or("Tersimpan")
                .to_string();
        }
    }

    if let Ok(Some(gram)) = gold_provider.fetch_idr_per_gram() {
        snap.gold_provider_configured = true;
        snap.gold_idr_per_gram = Some(gram);
        snap.gold_note = gold_provider.provider_name().to_string();
    }

    snap
}

/// Conditional ETag GitHub REST fetch using a read-only token from Windows Credential Manager.
/// Never logs token contents.
pub fn fetch_github_repo_status(
    repo: &str,
    token: &str,
    prev: &GitHubStatusSnapshot,
) -> GitHubStatusSnapshot {
    let clean_repo = repo.trim().trim_matches('/');
    if clean_repo.is_empty() || !clean_repo.contains('/') || token.trim().is_empty() {
        return GitHubStatusSnapshot {
            configured: false,
            repo: clean_repo.to_string(),
            error: None,
            ..Default::default()
        };
    }

    let url = format!("https://api.github.com/repos/{clean_repo}/actions/runs?per_page=1");
    if validate_https_url_with_allowlist(&url, BUILTIN_ALLOWED_HOSTS).is_err() {
        return GitHubStatusSnapshot {
            configured: true,
            repo: clean_repo.to_string(),
            error: Some("Nama repositori tidak valid".into()),
            ..prev.clone()
        };
    }

    let agent = ureq::AgentBuilder::new().timeout(Duration::from_secs(8)).build();
    let mut req = agent
        .get(&url)
        .set("Accept", "application/vnd.github+json")
        .set("User-Agent", "Gili-Desktop-Widgets/1.0")
        .set("Authorization", &format!("Bearer {}", token.trim()));

    if let Some(ref etag) = prev.etag {
        req = req.set("If-None-Match", etag);
    }

    match req.call() {
        Ok(resp) => {
            if resp.status() == 304 {
                return GitHubStatusSnapshot {
                    configured: true,
                    updated_label: "Tidak berubah (304)".into(),
                    error: None,
                    ..prev.clone()
                };
            }
            let next_etag = resp.header("ETag").map(|s| s.to_string());
            let mut next = prev.clone();
            next.configured = true;
            next.repo = clean_repo.to_string();
            next.etag = next_etag;
            if let Some(v) = resp
                .into_string()
                .ok()
                .and_then(|s| serde_json::from_str::<serde_json::Value>(&s).ok())
            {
                if let Some(run) = v["workflow_runs"].as_array().and_then(|a| a.first()) {
                    next.latest_action_name = run["name"].as_str().unwrap_or("Workflow").to_string();
                    next.latest_action_conclusion = run["conclusion"]
                        .as_str()
                        .or_else(|| run["status"].as_str())
                        .unwrap_or("unknown")
                        .to_string();
                }
            }
            next.updated_label = "Baru diperbarui".into();
            next.error = None;
            next
        }
        Err(_) => GitHubStatusSnapshot {
            configured: true,
            repo: clean_repo.to_string(),
            error: Some("Gagal memuat GitHub API (periksa token atau koneksi)".into()),
            ..prev.clone()
        },
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn url_validator_blocks_plaintext_and_loopback() {
        assert!(validate_https_url_with_allowlist("http://example.com", &[]).is_err());
        assert!(validate_https_url_with_allowlist("https://127.0.0.1/test", &[]).is_err());
        assert!(validate_https_url_with_allowlist("https://evil.test/x", BUILTIN_ALLOWED_HOSTS).is_err());
        assert!(validate_https_url_with_allowlist("https://api.github.com/repos/a/b", BUILTIN_ALLOWED_HOSTS).is_ok());
    }

    #[test]
    fn backoff_grows_exponentially_and_resets_on_success() {
        let mut b = BackoffState::new(60, 600);
        let t0 = Instant::now();
        b.record_failure(t0);
        assert_eq!(b.failures, 1);
        assert!(!b.can_run(t0 + Duration::from_secs(30)));
        b.record_success(t0 + Duration::from_secs(200));
        assert_eq!(b.failures, 0);
    }
}
