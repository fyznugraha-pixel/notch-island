use crate::config::{ColorRoleSource, RgbaColor, WidgetStyleConfig};
use serde::{Deserialize, Serialize};
use std::path::{Path, PathBuf};
use std::time::SystemTime;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct WallpaperRegionAnalysis {
    pub avg_luminance: f32,
    pub recommended_text_primary: RgbaColor,
    pub recommended_text_secondary: RgbaColor,
    pub dominant_accent: RgbaColor,
    pub palette: Vec<String>,
    pub low_contrast_warning: bool,
    pub measured_contrast_ratio: f32,
    pub wallpaper_available: bool,
}

#[derive(Debug, Clone)]
pub struct CachedWallpaperSample {
    pub path: PathBuf,
    pub modified: Option<SystemTime>,
    pub width: u32,
    pub height: u32,
    /// Downscaled RGB24 buffer (max 320px on longest edge) for O(1) region sampling
    pub rgb: Vec<u8>,
    pub dominant_palette: Vec<RgbaColor>,
}

fn srgb_channel_to_linear(c: u8) -> f32 {
    let s = c as f32 / 255.0;
    if s <= 0.03928 {
        s / 12.92
    } else {
        ((s + 0.055) / 1.055).powf(2.4)
    }
}

pub fn relative_luminance(c: RgbaColor) -> f32 {
    0.2126 * srgb_channel_to_linear(c.r)
        + 0.7152 * srgb_channel_to_linear(c.g)
        + 0.0722 * srgb_channel_to_linear(c.b)
}

pub fn contrast_ratio(a: RgbaColor, b: RgbaColor) -> f32 {
    let la = relative_luminance(a);
    let lb = relative_luminance(b);
    let (hi, lo) = if la >= lb { (la, lb) } else { (lb, la) };
    (hi + 0.05) / (lo + 0.05)
}

pub fn contrast_ratio_against_luminance(fg: RgbaColor, bg_luminance: f32) -> f32 {
    let l_fg = relative_luminance(fg);
    let l_bg = bg_luminance.clamp(0.0, 1.0);
    let (hi, lo) = if l_fg >= l_bg {
        (l_fg, l_bg)
    } else {
        (l_bg, l_fg)
    };
    (hi + 0.05) / (lo + 0.05)
}

pub fn auto_text_colors_for_luminance(bg_luminance: f32) -> (RgbaColor, RgbaColor) {
    let light_fg = RgbaColor::new(0xF5, 0xF5, 0xF7, 1.0);
    let dark_fg = RgbaColor::new(0x11, 0x12, 0x16, 1.0);
    let c_light = contrast_ratio_against_luminance(light_fg, bg_luminance);
    let c_dark = contrast_ratio_against_luminance(dark_fg, bg_luminance);
    if c_light >= c_dark {
        (light_fg, RgbaColor::new(0xF5, 0xF5, 0xF7, 0.68))
    } else {
        (dark_fg, RgbaColor::new(0x11, 0x12, 0x16, 0.68))
    }
}

/// Discovers the current Windows wallpaper image file without taking screenshots.
pub fn resolve_wallpaper_file_path() -> Option<PathBuf> {
    #[cfg(windows)]
    {
        use windows::Win32::UI::WindowsAndMessaging::{
            SystemParametersInfoW, SPI_GETDESKWALLPAPER, SYSTEM_PARAMETERS_INFO_UPDATE_FLAGS,
        };
        let mut buf = [0u16; 520];
        let ok = unsafe {
            SystemParametersInfoW(
                SPI_GETDESKWALLPAPER,
                buf.len() as u32,
                Some(buf.as_mut_ptr() as *mut _),
                SYSTEM_PARAMETERS_INFO_UPDATE_FLAGS(0),
            )
            .is_ok()
        };
        if ok {
            let len = buf.iter().position(|&c| c == 0).unwrap_or(buf.len());
            if len > 0 {
                let p = PathBuf::from(String::from_utf16_lossy(&buf[..len]));
                if p.exists() && p.is_file() {
                    return Some(p);
                }
            }
        }
        // Fallback for Windows slideshow / Spotlight: TranscodedWallpaper file
        if let Ok(appdata) = std::env::var("APPDATA") {
            let transcoded = PathBuf::from(appdata)
                .join("Microsoft")
                .join("Windows")
                .join("Themes")
                .join("TranscodedWallpaper");
            if transcoded.exists() && transcoded.is_file() {
                return Some(transcoded);
            }
        }
    }
    None
}

pub fn load_wallpaper_sample(path: &Path) -> Option<CachedWallpaperSample> {
    let meta = std::fs::metadata(path).ok();
    let modified = meta.and_then(|m| m.modified().ok());
    let img = image::open(path).ok()?;
    let small = img.thumbnail(320, 320).to_rgb8();
    let (w, h) = small.dimensions();
    let rgb = small.into_raw();
    let dominant_palette = extract_dominant_palette(&rgb, 5);
    Some(CachedWallpaperSample {
        path: path.to_path_buf(),
        modified,
        width: w,
        height: h,
        rgb,
        dominant_palette,
    })
}

pub fn extract_dominant_palette(rgb: &[u8], max_colors: usize) -> Vec<RgbaColor> {
    use std::collections::HashMap;
    // Quantize to 4-bit per channel (16x16x16 buckets), preferring vibrant mid-tone accents
    let mut buckets: HashMap<(u8, u8, u8), (u64, u64, u64, u64)> = HashMap::new();
    for chunk in rgb.chunks_exact(3) {
        let (r, g, b) = (chunk[0], chunk[1], chunk[2]);
        let key = (r >> 4, g >> 4, b >> 4);
        let e = buckets.entry(key).or_insert((0, 0, 0, 0));
        e.0 += 1;
        e.1 += r as u64;
        e.2 += g as u64;
        e.3 += b as u64;
    }

    let mut ranked: Vec<(f32, RgbaColor)> = buckets
        .into_values()
        .filter(|(cnt, _, _, _)| *cnt > 0)
        .map(|(cnt, sr, sg, sb)| {
            let r = (sr / cnt) as u8;
            let g = (sg / cnt) as u8;
            let b = (sb / cnt) as u8;
            let max_c = r.max(g).max(b) as f32;
            let min_c = r.min(g).min(b) as f32;
            let sat = if max_c > 0.0 { (max_c - min_c) / max_c } else { 0.0 };
            let score = (cnt as f32) * (0.4 + sat * 1.4);
            (score, RgbaColor::new(r, g, b, 1.0))
        })
        .collect();

    ranked.sort_by(|a, b| b.0.partial_cmp(&a.0).unwrap_or(std::cmp::Ordering::Equal));
    ranked
        .into_iter()
        .take(max_colors.max(1))
        .map(|(_, c)| c)
        .collect()
}

/// Computes average luminance over a normalized monitor rect `(nx, ny, nw, nh)` in `[0..1]`.
pub fn sample_region_luminance(
    sample: &CachedWallpaperSample,
    nx: f32,
    ny: f32,
    nw: f32,
    nh: f32,
) -> f32 {
    if sample.width == 0 || sample.height == 0 || sample.rgb.is_empty() {
        return 0.08;
    }
    let x0 = ((nx.clamp(0.0, 1.0) * sample.width as f32) as u32).min(sample.width - 1);
    let y0 = ((ny.clamp(0.0, 1.0) * sample.height as f32) as u32).min(sample.height - 1);
    let x1 = (((nx + nw).clamp(0.0, 1.0) * sample.width as f32).ceil() as u32)
        .clamp(x0 + 1, sample.width);
    let y1 = (((ny + nh).clamp(0.0, 1.0) * sample.height as f32).ceil() as u32)
        .clamp(y0 + 1, sample.height);

    let mut sum_lum = 0.0f64;
    let mut count = 0u64;
    for y in y0..y1 {
        let row_off = (y * sample.width * 3) as usize;
        for x in x0..x1 {
            let idx = row_off + (x * 3) as usize;
            if idx + 2 < sample.rgb.len() {
                let c = RgbaColor::new(
                    sample.rgb[idx],
                    sample.rgb[idx + 1],
                    sample.rgb[idx + 2],
                    1.0,
                );
                sum_lum += relative_luminance(c) as f64;
                count += 1;
            }
        }
    }
    if count == 0 {
        0.08
    } else {
        (sum_lum / count as f64) as f32
    }
}

pub fn analyze_region_for_style(
    sample: Option<&CachedWallpaperSample>,
    style: &WidgetStyleConfig,
    nx: f32,
    ny: f32,
    nw: f32,
    nh: f32,
) -> WallpaperRegionAnalysis {
    let (avg_lum, palette_colors, available) = match sample {
        Some(s) => (
            sample_region_luminance(s, nx, ny, nw, nh),
            s.dominant_palette.clone(),
            true,
        ),
        None => (0.06, vec![RgbaColor::new(0x38, 0x82, 0xF6, 1.0)], false),
    };

    let (rec_primary, rec_secondary) = auto_text_colors_for_luminance(avg_lum);
    let dominant_accent = palette_colors
        .first()
        .copied()
        .unwrap_or(RgbaColor::new(0x38, 0x82, 0xF6, 1.0));

    let chosen_primary = match style.text_primary {
        ColorRoleSource::AutoContrast => rec_primary,
        ColorRoleSource::WallpaperDominant => dominant_accent,
        ColorRoleSource::Custom { color } => color,
    };

    let ratio = contrast_ratio_against_luminance(chosen_primary, avg_lum);
    // Warn when text over frameless wallpaper drops below WCAG AA 4.5:1
    let low_contrast_warning =
        style.background_mode == crate::config::BackgroundMode::None && ratio < 4.5;

    WallpaperRegionAnalysis {
        avg_luminance: avg_lum,
        recommended_text_primary: rec_primary,
        recommended_text_secondary: rec_secondary,
        dominant_accent,
        palette: palette_colors.into_iter().map(|c| c.to_hex()).collect(),
        low_contrast_warning,
        measured_contrast_ratio: (ratio * 100.0).round() / 100.0,
        wallpaper_available: available,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn wcag_contrast_and_auto_selection_behave_accurately() {
        let white = RgbaColor::new(255, 255, 255, 1.0);
        let black = RgbaColor::new(0, 0, 0, 1.0);
        assert!((contrast_ratio(white, black) - 21.0).abs() < 0.05);

        let (p_dark_bg, _) = auto_text_colors_for_luminance(0.05);
        assert!(p_dark_bg.r > 200);

        let (p_light_bg, _) = auto_text_colors_for_luminance(0.85);
        assert!(p_light_bg.r < 40);
    }

    #[test]
    fn region_luminance_and_low_contrast_warning_trigger_correctly() {
        // Synthetic 4x4 wallpaper: top half white, bottom half black
        let mut rgb = Vec::with_capacity(4 * 4 * 3);
        for y in 0..4 {
            for _x in 0..4 {
                let v = if y < 2 { 250u8 } else { 10u8 };
                rgb.extend_from_slice(&[v, v, v]);
            }
        }
        let sample = CachedWallpaperSample {
            path: PathBuf::from("test.png"),
            modified: None,
            width: 4,
            height: 4,
            rgb,
            dominant_palette: vec![RgbaColor::new(56, 130, 246, 1.0)],
        };

        // White text on top bright region must trigger low contrast warning
        let bad_style = WidgetStyleConfig {
            text_primary: ColorRoleSource::Custom {
                color: RgbaColor::new(245, 245, 247, 1.0),
            },
            ..WidgetStyleConfig::default()
        };
        let top = analyze_region_for_style(Some(&sample), &bad_style, 0.0, 0.0, 1.0, 0.5);
        assert!(top.avg_luminance > 0.8);
        assert!(top.low_contrast_warning);

        // Auto contrast on top bright region picks dark text with no warning
        let auto_style = WidgetStyleConfig::default();
        let top_auto = analyze_region_for_style(Some(&sample), &auto_style, 0.0, 0.0, 1.0, 0.5);
        assert!(!top_auto.low_contrast_warning);
        assert!(top_auto.recommended_text_primary.r < 40);
    }
}
