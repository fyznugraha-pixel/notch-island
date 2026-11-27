pub mod group_a;
pub mod group_b;
pub mod group_c;
pub mod group_d;
pub mod group_e;

use crate::config::{
    BackgroundMode, ColorRoleSource, RgbaColor, WidgetInstance, WidgetSize, WidgetStackSlot,
    WidgetStyleConfig,
};
use crate::contrast::WallpaperRegionAnalysis;
use crate::layout::{RectF, SceneNode, TextAlign, WidgetRenderItem};
use crate::providers::WidgetDataHub;
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct WidgetCatalogEntry {
    pub widget_type: String,
    pub group: String,
    pub group_label: String,
    pub name: String,
    pub description: String,
    pub supported_sizes: Vec<WidgetSize>,
    pub default_size: WidgetSize,
    pub data_source: String,
    pub requires_setup: bool,
    pub deep_link_feature: Option<String>,
}

pub fn widget_catalog() -> Vec<WidgetCatalogEntry> {
    use WidgetSize::*;
    let entry = |wt: &str,
                 g: &str,
                 gl: &str,
                 name: &str,
                 desc: &str,
                 sizes: &[WidgetSize],
                 def: WidgetSize,
                 src: &str,
                 setup: bool,
                 link: Option<&str>| WidgetCatalogEntry {
        widget_type: wt.into(),
        group: g.into(),
        group_label: gl.into(),
        name: name.into(),
        description: desc.into(),
        supported_sizes: sizes.to_vec(),
        default_size: def,
        data_source: src.into(),
        requires_setup: setup,
        deep_link_feature: link.map(Into::into),
    };

    vec![
        // Group A: Versi besar modul Gili
        entry("calendar_agenda", "A", "Modul Gili", "Kalender & Agenda", "4 tipe kalender (Bulan Minimalis, Bulan + Judul, Tanggal Fokus, Agenda Gili).", &[Small, Medium, Large], Small, "EventNavbarModule (gili_navbar_events_v1)", false, Some("calendar")),
        entry("class_schedule", "A", "Modul Gili", "Jadwal Kuliah Mingguan", "Daftar mata kuliah mingguan, jam, dan ruang belajar.", &[Medium, Large], Medium, "ClassScheduleNavbarModule (gili_class_schedule_v1)", false, Some("class_schedule")),
        entry("habit_heatmap", "A", "Modul Gili", "Heatmap Kebiasaan", "Grafik konsistensi kebiasaan harian bergaya kontribusi matriks.", &[Medium, Large], Medium, "StreakNavbarModule (riwayat harian kompatibel mundur)", false, Some("streak")),
        entry("system_performance", "A", "Modul Gili", "Performa Sistem", "Beban CPU per-core asli, RAM, GPU, disk, dan kecepatan jaringan.", &[Small, Medium, Large], Medium, "NtQuerySystemInformation, GlobalMemoryStatusEx, NVML/WMI", false, Some("system_monitor")),
        entry("now_playing", "A", "Modul Gili", "Now Playing & Lirik", "Lagu yang sedang diputar beserta lirik tersinkron dari sumber lirik Gili.", &[Small, Medium, Large], Medium, "media_lyrics_store (CURRENT_MEDIA & CURRENT_LYRICS)", false, Some("media")),
        entry("weather_forecast", "A", "Modul Gili", "Cuaca Lengkap", "Suhu saat ini, prakiraan per jam, dan prakiraan 5 hari.", &[Small, Medium, Large], Medium, "Open-Meteo (api.open-meteo.com)", false, Some("weather")),
        entry("todo_groups", "A", "Modul Gili", "To-Do dengan Grup", "Daftar tugas terkelompok beserta progres penyelesaian.", &[Small, Medium, Large], Medium, "todoUtils (island_todo_list)", false, Some("todo")),
        entry("drop_zone", "A", "Modul Gili", "Drop Zone", "Rak berkas cepat yang terhubung dengan Drop Zone Gili.", &[Small, Medium], Small, "shelf_server & shelf.json", false, Some("shelf")),

        // Group B: Produktif
        entry("sticky_notes", "B", "Produktif", "Catatan Mini", "Menampilkan Mini Note di Notch: catatan, warna, dan checklist yang sama, dengan tambah cepat dari desktop.", &[Small, Medium, Large], Medium, "Mini Note Notch (gili_mini_notes_v2)", false, None),
        entry("paper_sticky_note", "B", "Produktif", "Sticky Note", "Tempel kertas sticky note di desktop: bebas pilih warna, sudut terlipat/selotip/pin, dan miring alami.", &[Small, Medium, Large], Small, "Lokal (Pengaturan Widget)", false, None),
        entry("mini_kanban", "B", "Produktif", "Kanban Mini 3 Kolom", "Papan tugas 3 kolom (Akan, Dikerjakan, Selesai) dengan pindah kolom.", &[Large], Large, "Penyimpanan lokal kanban_board.json", false, None),
        entry("time_tracker", "B", "Produktif", "Pelacak Waktu Proyek", "Hitung durasi kerja per proyek (mulai/henti) dengan ekspor CSV.", &[Small, Medium], Medium, "Penyimpanan lokal time_tracker.json", false, None),
        entry("site_status", "B", "Produktif", "Status Situs", "Pantau uptime URL milik pengguna (interval min 60 dtk, maks 6 situs).", &[Medium, Large], Medium, "HTTP ping HTTPS ber-timeout via ureq", true, None),
        entry("github_status", "B", "Produktif", "Status GitHub", "Ringkasan PR, issue, dan hasil Actions dengan ETag & token Credential Manager.", &[Medium, Large], Medium, "GitHub REST API (read-only fine-grained PAT)", true, None),
        entry("shortcuts_grid", "B", "Produktif", "Pintasan Cepat", "Grid aplikasi, folder, dan tautan pilihan dengan ikon sistem ber-cache.", &[Small, Medium, Large], Medium, "Penyimpanan lokal shortcuts.json + IShellItemImageFactory", false, None),
        entry("recent_files", "B", "Produktif", "Berkas Terbaru", "Daftar berkas terbaru secara opt-in (metadata saja, tanpa baca isi).", &[Medium, Large], Medium, "Pemindaian metadata folder opt-in", true, None),
        entry("countdown_moment", "B", "Produktif", "Hitung Mundur Momen", "Hitung sisa hari menuju deadline, ujian, gajian, atau hari besar.", &[Small, Medium], Small, "Penyimpanan lokal desktop_countdowns.json", false, None),
        entry("quick_snippets", "B", "Produktif", "Papan Snippet Cepat", "Daftar template teks pilihan sendiri dengan salin 1 klik (bukan riwayat clipboard).", &[Small, Medium], Medium, "Penyimpanan lokal desktop_snippets.json", false, None),

        // Group C: Sistem
        entry("top_processes", "C", "Sistem", "Proses Teratas (Baca-Saja)", "5 proses paling aktif menggunakan CPU & RAM tanpa tombol akhiri proses.", &[Medium, Large], Medium, "Win32 EnumProcesses & GetProcessMemoryInfo (hanya-baca)", false, Some("system_monitor")),
        entry("quick_controls", "C", "Sistem", "Kontrol Cepat", "Toggle stabil berbasis API publik: Wi-Fi, Bluetooth, Mode Gelap, Bisukan.", &[Small, Medium], Medium, "Control Center Gili (WinRT Radio, Themes\\Personalize, Core Audio)", false, Some("control_center")),
        entry("storage_treemap", "C", "Sistem", "Peta Penyimpanan", "Visualisasi treemap pemakaian folder on-demand prioritas rendah.", &[Medium, Large], Medium, "Pemindai folder lokal on-demand ber-cache", true, Some("storage")),
        entry("screen_time", "C", "Sistem", "Screen Time Harian", "Durasi layar aktif hari ini, waktu nyala perangkat, dan ringkasan proses aktif.", &[Medium, Large], Medium, "compute_windows_screen_time & top proses baca-saja Gili", false, Some("system_monitor")),

        // Group D: Estetik & Gaya Hidup
        entry("styled_clock", "D", "Estetik & Gaya Hidup", "Jam Bergaya (8 Gaya)", "8 gaya jam termasuk analog, digital tipis, dan tipografi kata.", &[Small, Medium, Large], Medium, "Jam sistem lokal Windows", false, None),
        entry("world_clock", "D", "Estetik & Gaya Hidup", "Jam Dunia Multi-Zona", "Pantau hingga 4 zona waktu kota dunia sekaligus beserta indikator siang/malam.", &[Medium, Large], Medium, "Waktu UTC sistem (GetSystemTime) + offset zona", false, None),
        entry("photo_frame", "D", "Estetik & Gaya Hidup", "Bingkai Foto / Polaroid", "Bingkai foto kotak bersih dengan slideshow otomatis 5 detik, klik langsung untuk menambah foto.", &[Small, Medium, Large], Large, "Folder foto lokal baca-saja", true, None),
        entry("live_mascot", "D", "Estetik & Gaya Hidup", "Maskot Hidup Gili", "Karakter vektor orisinal ringan (8-12 fps) yang merespons klik & waktu.", &[Small, Medium], Small, "Animasi vektor native Direct2D", false, None),
        entry("audio_visualizer", "D", "Estetik & Gaya Hidup", "Visualizer Audio", "Spektrum audio langsung dari WASAPI loopback dengan FFT ringan.", &[Medium], Medium, "Windows WASAPI loopback + FFT 256-point", false, Some("media")),
        entry("quote_poster", "D", "Estetik & Gaya Hidup", "Poster Kutipan", "Tipografi kutipan harian atau teks sendiri dengan tata letak editorial.", &[Small, Medium, Large], Medium, "KutipanHarianNavbarModule + teks sendiri", false, None),

        // Global extensions redistributed across A, B, D
        entry("prayer_times", "A", "Modul Gili", "Jadwal Sholat", "Kalkulator jadwal sholat astronomis offline + mode Ramadan.", &[Small, Medium, Large], Medium, "Kalkulator astronomis offline (Subuh 20, Isya 18)", false, Some("prayer")),
        entry("air_quality", "A", "Modul Gili", "Kualitas Udara (AQI & UV)", "Indeks AQI, PM2.5, PM10, dan Indeks UV real-time untuk lokasi Anda.", &[Small, Medium], Medium, "Open-Meteo Air Quality API (air-quality-api.open-meteo.com)", false, Some("weather")),
        entry("currency_gold", "B", "Produktif", "Kurs & Harga Emas", "Kurs mata uang & harga spot emas XAU real-time via API publik.", &[Small, Medium], Medium, "open.er-api.com & api.gold-api.com", false, Some("currency")),
        entry("hijri_holidays", "D", "Estetik & Gaya Hidup", "Kalender Hijriyah & Libur", "Tanggal Hijriyah offline (+/-1 hari) & daftar hari libur.", &[Small, Medium], Medium, "Konverter Hijriyah offline + berkas JSON hari libur", false, None),
        entry("quick_expense", "B", "Produktif", "Catat Pengeluaran Cepat", "Catatan pengeluaran lokal terenkripsi DPAPI dengan bar anggaran bulanan.", &[Small, Medium], Medium, "Penyimpanan lokal terenkripsi Windows DPAPI (nol telemetri)", false, None),
        entry("football_scores", "D", "Estetik & Gaya Hidup", "Papan Skor Bola", "Skor pertandingan melalui antarmuka penyedia data berlisensi.", &[Medium], Medium, "Kontrak FootballScoreProvider (butuh API berlisensi)", true, None),
        entry("ai_quick_ask", "A", "Modul Gili", "Tanya Cepat AI", "Kirim pertanyaan singkat lewat router & kunci API BYOK Gili.", &[Medium], Medium, "aiRouterService & Windows Credential Manager Gili", true, Some("ai_chat")),
    ]
}

#[derive(Debug, Clone, Copy)]
pub struct ResolvedPalette {
    pub primary: RgbaColor,
    pub secondary: RgbaColor,
    pub accent: RgbaColor,
    pub card_fill: Option<RgbaColor>,
    pub inner_border: Option<RgbaColor>,
    pub surface_chip: RgbaColor,
    pub positive: RgbaColor,
    pub warning: RgbaColor,
    pub danger: RgbaColor,
    pub is_monochrome: bool,
}

fn resolve_role(role: &ColorRoleSource, auto_color: RgbaColor, dominant: RgbaColor) -> RgbaColor {
    match role {
        ColorRoleSource::AutoContrast => auto_color,
        ColorRoleSource::WallpaperDominant => dominant,
        ColorRoleSource::Custom { color } => *color,
    }
}

fn is_achromatic_color(c: RgbaColor) -> bool {
    c.r.abs_diff(c.g) <= 14 && c.g.abs_diff(c.b) <= 14 && c.r.abs_diff(c.b) <= 14
}

pub fn resolve_palette(
    style: &WidgetStyleConfig,
    analysis: &WallpaperRegionAnalysis,
) -> ResolvedPalette {
    resolve_palette_with_policy(style, analysis, false)
}

pub fn resolve_palette_with_policy(
    style: &WidgetStyleConfig,
    analysis: &WallpaperRegionAnalysis,
    high_contrast: bool,
) -> ResolvedPalette {
    if high_contrast {
        return ResolvedPalette {
            primary: RgbaColor::new(255, 255, 255, 1.0),
            secondary: RgbaColor::new(235, 235, 240, 0.92),
            accent: RgbaColor::new(0x5E, 0xCA, 0xFF, 1.0),
            card_fill: Some(RgbaColor::new(0, 0, 0, 0.96)),
            inner_border: Some(RgbaColor::new(255, 255, 255, 0.85)),
            surface_chip: RgbaColor::new(255, 255, 255, 0.18),
            positive: RgbaColor::new(0x4A, 0xDE, 0x80, 1.0),
            warning: RgbaColor::new(0xFD, 0xE0, 0x47, 1.0),
            danger: RgbaColor::new(0xFF, 0x6B, 0x6B, 1.0),
            is_monochrome: false,
        };
    }

    let primary = resolve_role(
        &style.text_primary,
        analysis.recommended_text_primary,
        analysis.dominant_accent,
    );
    let secondary = match (&style.text_secondary, &style.text_primary) {
        (ColorRoleSource::AutoContrast, ColorRoleSource::Custom { color }) => {
            color.with_alpha(0.78)
        }
        (ColorRoleSource::AutoContrast, ColorRoleSource::WallpaperDominant) => {
            analysis.dominant_accent.with_alpha(0.78)
        }
        _ => resolve_role(
            &style.text_secondary,
            analysis.recommended_text_secondary,
            analysis.dominant_accent.with_alpha(0.72),
        ),
    };
    let accent = resolve_role(&style.accent, primary, analysis.dominant_accent);
    let raw_card = resolve_role(
        &style.card_color,
        if analysis.avg_luminance > 0.56 {
            RgbaColor::new(0xF4, 0xF6, 0xFA, 0.90)
        } else {
            RgbaColor::new(0x16, 0x18, 0x20, 0.88)
        },
        analysis.dominant_accent,
    );

    let (card_fill, inner_border) = match style.background_mode {
        BackgroundMode::None => (None, None),
        BackgroundMode::SubtleTint => (
            Some(raw_card.with_alpha(style.tint_opacity.clamp(0.10, 0.25))),
            Some(RgbaColor::new(255, 255, 255, 0.14)),
        ),
        BackgroundMode::Glass => (
            Some(raw_card.with_alpha(0.52)),
            Some(RgbaColor::new(255, 255, 255, 0.24)),
        ),
        BackgroundMode::Solid => (
            Some(raw_card.with_alpha(0.96)),
            Some(RgbaColor::new(255, 255, 255, 0.10)),
        ),
    };

    let primary_is_light = crate::contrast::relative_luminance(primary) > 0.45;
    let surface_chip = if primary_is_light {
        RgbaColor::new(255, 255, 255, 0.14)
    } else {
        RgbaColor::new(17, 20, 28, 0.08)
    };

    let monochrome = is_achromatic_color(primary)
        && is_achromatic_color(secondary)
        && is_achromatic_color(accent);

    ResolvedPalette {
        primary,
        secondary,
        accent,
        card_fill,
        inner_border,
        surface_chip,
        positive: if monochrome {
            primary
        } else if primary_is_light {
            RgbaColor::new(0x34, 0xC3, 0xA0, 1.0)
        } else {
            RgbaColor::new(0x0E, 0x7C, 0x66, 1.0)
        },
        warning: if monochrome {
            secondary
        } else if primary_is_light {
            RgbaColor::new(0xFB, 0xBF, 0x24, 1.0)
        } else {
            RgbaColor::new(0xB4, 0x53, 0x09, 1.0)
        },
        danger: if monochrome {
            primary.with_alpha(0.90)
        } else if primary_is_light {
            RgbaColor::new(0xF8, 0x71, 0x71, 1.0)
        } else {
            RgbaColor::new(0xC8, 0x1E, 0x1E, 1.0)
        },
        is_monochrome: monochrome,
    }
}

pub struct WidgetBuildCtx<'a> {
    pub slot_id: &'a str,
    pub frame: RectF,
    pub size: WidgetSize,
    pub pal: ResolvedPalette,
    pub instance: &'a WidgetInstance,
    pub hub: &'a WidgetDataHub,
    pub elapsed_secs: f32,
}

pub fn text_node(
    rect: RectF,
    content: impl Into<String>,
    font_size: f32,
    font_weight: u16,
    color: RgbaColor,
    align: TextAlign,
    tabular: bool,
) -> SceneNode {
    SceneNode::Text {
        rect,
        content: content.into(),
        font_size,
        font_weight,
        color,
        align,
        tabular_nums: tabular,
        tight_kerning: font_size >= 30.0,
        max_lines: 2,
        interactive_action: None,
    }
}

pub fn text_node_line(
    rect: RectF,
    content: impl Into<String>,
    font_size: f32,
    font_weight: u16,
    color: RgbaColor,
    align: TextAlign,
    tabular: bool,
) -> SceneNode {
    SceneNode::Text {
        rect,
        content: content.into(),
        font_size,
        font_weight,
        color,
        align,
        tabular_nums: tabular,
        tight_kerning: font_size >= 30.0,
        max_lines: 1,
        interactive_action: None,
    }
}

pub fn action_pill(
    rect: RectF,
    label: &str,
    bg: RgbaColor,
    fg: RgbaColor,
    action_id: &str,
) -> Vec<SceneNode> {
    vec![
        SceneNode::RoundedRect {
            rect,
            radius: rect.h * 0.5,
            smoothing: 0.4,
            fill: Some(bg),
            stroke: Some((fg.with_alpha(0.18), 1.0)),
            interactive_action: Some(action_id.to_string()),
        },
        SceneNode::Text {
            rect: RectF::new(
                rect.x + 6.0,
                rect.y + (rect.h - 14.0) * 0.42,
                rect.w - 12.0,
                18.0,
            ),
            content: label.to_string(),
            font_size: 11.5,
            font_weight: 600,
            color: fg,
            align: TextAlign::Center,
            tabular_nums: false,
            tight_kerning: false,
            max_lines: 1,
            interactive_action: Some(action_id.to_string()),
        },
    ]
}

pub fn empty_state_nodes(
    ctx: &WidgetBuildCtx<'_>,
    title: &str,
    subtitle: &str,
    cta_label: &str,
    action_id: &str,
) -> Vec<SceneNode> {
    let inner = ctx.frame.inset(14.0);
    let mut nodes = vec![
        text_node(
            RectF::new(inner.x, inner.y, inner.w, 22.0),
            title,
            14.5,
            600,
            ctx.pal.primary,
            TextAlign::Left,
            false,
        ),
        text_node(
            RectF::new(inner.x, inner.y + 24.0, inner.w, 42.0),
            subtitle,
            12.0,
            400,
            ctx.pal.secondary,
            TextAlign::Left,
            false,
        ),
    ];
    let btn_w = (inner.w * 0.78).clamp(96.0, 136.0).min(inner.w);
    let btn_y = (inner.y + 62.0).min(inner.y + inner.h - 30.0);
    let btn_rect = RectF::new(inner.x, btn_y, btn_w, 28.0);
    nodes.extend(action_pill(
        btn_rect,
        cta_label,
        ctx.pal.accent.with_alpha(0.24),
        ctx.pal.primary,
        action_id,
    ));
    nodes
}

/// Computes the visual collision offset `(dx, dy, cw, ch)` of a slot relative to its outer `slot_rect`.
/// For `BackgroundMode::None` (when not in high-contrast mode), this equals `item.visual_content_bounds()`
/// relative to `(0, 0)` so unused card space does not block neighboring widgets.
pub fn slot_content_offset_dp(
    slot: &WidgetStackSlot,
    outer_w: f32,
    outer_h: f32,
    global_theme: &WidgetStyleConfig,
    hub: &WidgetDataHub,
    high_contrast: bool,
) -> (f32, f32, f32, f32) {
    let style = slot
        .active_widget()
        .and_then(|w| w.style_override.as_ref())
        .unwrap_or(global_theme);
    if high_contrast || style.background_mode != BackgroundMode::None {
        return (0.0, 0.0, outer_w, outer_h);
    }
    let dummy_analysis = crate::contrast::analyze_region_for_style(None, style, 0.0, 0.0, 0.25, 0.25);
    let item = build_widget_render_item_with_policy(
        slot,
        RectF::new(0.0, 0.0, outer_w, outer_h),
        global_theme,
        &dummy_analysis,
        hub,
        0.0,
        false,
    );
    let vb = item.visual_content_bounds();
    (vb.x, vb.y, vb.w, vb.h)
}

fn resolve_widget_card_gradient(
    widget_type: &str,
    style: &WidgetStyleConfig,
    pal: &ResolvedPalette,
    hub: &WidgetDataHub,
    high_contrast: bool,
) -> Option<(RgbaColor, RgbaColor)> {
    // Skip dark built-in gradients on monochrome, high-contrast, or light-ink cards so dark text never collides with dark cards
    if pal.is_monochrome
        || high_contrast
        || widget_type == "photo_frame"
        || crate::contrast::relative_luminance(pal.primary) <= 0.45
    {
        return None;
    }
    let alpha = match style.background_mode {
        BackgroundMode::Glass => 0.64,
        BackgroundMode::Solid => 0.95,
        _ => return None,
    };
    match widget_type {
        "weather_forecast" => {
            let (_, _, _, hour, _, _, _) = local_datetime_parts();
            let is_night = !(6..18).contains(&hour);
            let rainy = matches!(hub.weather.current_code, 45..=99);
            if is_night {
                Some((
                    RgbaColor::new(0x11, 0x1C, 0x36, alpha),
                    RgbaColor::new(0x24, 0x37, 0x5E, alpha),
                ))
            } else if rainy {
                Some((
                    RgbaColor::new(0x27, 0x38, 0x4E, alpha),
                    RgbaColor::new(0x43, 0x58, 0x70, alpha),
                ))
            } else {
                Some((
                    RgbaColor::new(0x1E, 0x5B, 0xA8, alpha),
                    RgbaColor::new(0x4A, 0x90, 0xD9, alpha),
                ))
            }
        }
        "air_quality" => Some((
            RgbaColor::new(0x1A, 0x29, 0x3E, alpha),
            RgbaColor::new(0x12, 0x1B, 0x2B, alpha),
        )),
        "prayer_times" => Some((
            RgbaColor::new(0x11, 0x2C, 0x27, alpha),
            RgbaColor::new(0x0C, 0x1B, 0x1A, alpha),
        )),
        "now_playing" => Some((
            RgbaColor::new(0x22, 0x24, 0x30, alpha),
            RgbaColor::new(0x12, 0x14, 0x1B, alpha),
        )),
        _ => None,
    }
}

pub fn build_widget_render_item(
    slot: &WidgetStackSlot,
    frame: RectF,
    global_theme: &WidgetStyleConfig,
    analysis: &WallpaperRegionAnalysis,
    hub: &WidgetDataHub,
    elapsed_secs: f32,
) -> WidgetRenderItem {
    build_widget_render_item_with_policy(
        slot,
        frame,
        global_theme,
        analysis,
        hub,
        elapsed_secs,
        false,
    )
}

pub fn build_widget_render_item_with_policy(
    slot: &WidgetStackSlot,
    frame: RectF,
    global_theme: &WidgetStyleConfig,
    analysis: &WallpaperRegionAnalysis,
    hub: &WidgetDataHub,
    elapsed_secs: f32,
    high_contrast: bool,
) -> WidgetRenderItem {
    let fallback = WidgetInstance::default();
    let inst = slot.active_widget().unwrap_or(&fallback);
    let style = inst.style_override.as_ref().unwrap_or(global_theme);
    let pal = resolve_palette_with_policy(style, analysis, high_contrast);
    let card_gradient =
        resolve_widget_card_gradient(&inst.widget_type, style, &pal, hub, high_contrast);

    let ctx = WidgetBuildCtx {
        slot_id: &slot.slot_id,
        frame,
        size: slot.size,
        pal,
        instance: inst,
        hub,
        elapsed_secs,
    };

    let mut nodes = match inst.widget_type.as_str() {
        "calendar_agenda" => group_a::build_calendar_agenda(&ctx),
        "class_schedule" => group_a::build_class_schedule(&ctx),
        "habit_heatmap" => group_a::build_habit_heatmap(&ctx),
        "system_performance" => group_a::build_system_performance(&ctx),
        "now_playing" => group_a::build_now_playing(&ctx),
        "weather_forecast" => group_a::build_weather_forecast(&ctx),
        "todo_groups" => group_a::build_todo_groups(&ctx),
        "drop_zone" => group_a::build_drop_zone(&ctx),

        "sticky_notes" => group_b::build_sticky_notes(&ctx),
        "paper_sticky_note" => group_b::build_paper_sticky_note(&ctx),
        "mini_kanban" => group_b::build_mini_kanban(&ctx),
        "time_tracker" => group_b::build_time_tracker(&ctx),
        "site_status" => group_b::build_site_status(&ctx),
        "github_status" => group_b::build_github_status(&ctx),
        "shortcuts_grid" => group_b::build_shortcuts_grid(&ctx),
        "recent_files" => group_b::build_recent_files(&ctx),
        "countdown_moment" => group_b::build_countdown_moment(&ctx),
        "quick_snippets" => group_b::build_quick_snippets(&ctx),

        "top_processes" => group_c::build_top_processes(&ctx),
        "quick_controls" => group_c::build_quick_controls(&ctx),
        "storage_treemap" => group_c::build_storage_treemap(&ctx),
        "screen_time" => group_c::build_screen_time(&ctx),

        "styled_clock" => group_d::build_styled_clock(&ctx),
        "world_clock" => group_d::build_world_clock(&ctx),
        "photo_frame" => group_d::build_photo_frame(&ctx),
        "live_mascot" => group_d::build_live_mascot(&ctx),
        "audio_visualizer" => group_d::build_audio_visualizer(&ctx),
        "quote_poster" => group_d::build_quote_poster(&ctx),

        "prayer_times" => group_e::build_prayer_times(&ctx),
        "air_quality" => group_e::build_air_quality(&ctx),
        "currency_gold" => group_e::build_currency_gold(&ctx),
        "hijri_holidays" => group_e::build_hijri_holidays(&ctx),
        "quick_expense" => group_e::build_quick_expense(&ctx),
        "football_scores" => group_e::build_football_scores(&ctx),
        "ai_quick_ask" => group_e::build_ai_quick_ask(&ctx),

        _ => {
            let en = is_english(&ctx);
            empty_state_nodes(
                &ctx,
                if en {
                    "Unknown Widget"
                } else {
                    "Widget Tidak Dikenal"
                },
                if en {
                    "This widget type is not registered in this version of Gili."
                } else {
                    "Jenis widget ini belum terdaftar di versi Gili saat ini."
                },
                if en { "Configure" } else { "Atur" },
                "open_settings",
            )
        }
    };

    // Honor user-configured font_weight across all widgets relative to the 600 baseline
    let weight_delta = ((style.font_weight as i32 - 600) * 3) / 4;
    if weight_delta != 0 {
        for n in &mut nodes {
            if let SceneNode::Text { font_weight, .. } = n {
                *font_weight = (*font_weight as i32 + weight_delta).clamp(200, 900) as u16;
            }
        }
    }

    let base_rotation_deg = if inst.widget_type == "paper_sticky_note" {
        group_b::resolve_sticky_tilt_deg(&slot.slot_id, &inst.settings)
    } else {
        0.0
    };

    WidgetRenderItem {
        slot_id: slot.slot_id.clone(),
        widget_type: inst.widget_type.clone(),
        frame,
        background_mode: style.background_mode,
        card_fill: pal.card_fill,
        card_gradient,
        inner_border: pal.inner_border,
        shadow_enabled: style.shadow_enabled,
        halo_enabled: style.halo_enabled,
        shadow_color: style.shadow_color,
        font_family: style.font_family.clone(),
        text_scale: style.text_scale.clamp(0.85, 1.40),
        nodes,
        content_hit_rects: Vec::new(),
        stack_count: slot.widgets.len(),
        stack_index: slot.active_index % slot.widgets.len().max(1),
        edit_jiggle_deg: 0.0,
        base_rotation_deg,
        scale: 1.0,
        opacity: 1.0,
    }
}

pub fn local_datetime_parts() -> (i32, u32, u32, u32, u32, u32, u32) {
    #[cfg(windows)]
    {
        use windows::Win32::System::SystemInformation::GetLocalTime;
        let st = unsafe { GetLocalTime() };
        return (
            st.wYear as i32,
            st.wMonth as u32,
            st.wDay as u32,
            st.wHour as u32,
            st.wMinute as u32,
            st.wSecond as u32,
            st.wDayOfWeek as u32,
        );
    }
    #[cfg(not(windows))]
    {
        (2026, 1, 1, 8, 0, 0, 4)
    }
}

pub fn utc_hour_minute() -> (u32, u32) {
    #[cfg(windows)]
    {
        use windows::Win32::System::SystemInformation::GetSystemTime;
        let st = unsafe { GetSystemTime() };
        return (st.wHour as u32, st.wMinute as u32);
    }
    #[cfg(not(windows))]
    {
        (12, 0)
    }
}

pub fn local_utc_offset_hours() -> f64 {
    #[cfg(windows)]
    {
        use windows::Win32::System::Time::{GetTimeZoneInformation, TIME_ZONE_INFORMATION};
        let mut tzi = TIME_ZONE_INFORMATION::default();
        let tz_id = unsafe { GetTimeZoneInformation(&mut tzi) };
        if tz_id != u32::MAX {
            let bias_mins = tzi.Bias
                + if tz_id == 2 {
                    tzi.DaylightBias
                } else {
                    tzi.StandardBias
                };
            return -(bias_mins as f64) / 60.0;
        }
    }
    7.0
}

pub fn is_english(ctx: &WidgetBuildCtx<'_>) -> bool {
    ctx.hub.frontend.language.eq_ignore_ascii_case("en")
}

pub fn is_fahrenheit(ctx: &WidgetBuildCtx<'_>) -> bool {
    let raw = ctx.hub.frontend.temperature_unit.trim();
    raw.eq_ignore_ascii_case("fahrenheit") || raw.eq_ignore_ascii_case("f")
}

pub fn convert_temp_c(temp_c: f32, fahrenheit: bool) -> f32 {
    if fahrenheit {
        (temp_c * 9.0) / 5.0 + 32.0
    } else {
        temp_c
    }
}

fn round_temp_i32(temp_c: f32, fahrenheit: bool) -> i32 {
    let v = convert_temp_c(temp_c, fahrenheit);
    if !v.is_finite() {
        return 0;
    }
    let rounded = v.round();
    if rounded == 0.0 { 0 } else { rounded as i32 }
}

pub fn format_temp_with_unit(temp_c: f32, fahrenheit: bool) -> String {
    let n = round_temp_i32(temp_c, fahrenheit);
    if fahrenheit {
        format!("{n}°F")
    } else {
        format!("{n}°C")
    }
}

pub fn format_temp_short(temp_c: f32, fahrenheit: bool) -> String {
    let n = round_temp_i32(temp_c, fahrenheit);
    format!("{n}°")
}

pub fn localized_day_name(dow: u32, en: bool) -> &'static str {
    if en {
        match dow % 7 {
            0 => "Sunday",
            1 => "Monday",
            2 => "Tuesday",
            3 => "Wednesday",
            4 => "Thursday",
            5 => "Friday",
            _ => "Saturday",
        }
    } else {
        indonesian_day_name(dow)
    }
}

pub fn localized_month_name(month: u32, en: bool) -> &'static str {
    if en {
        match month {
            1 => "January",
            2 => "February",
            3 => "March",
            4 => "April",
            5 => "May",
            6 => "June",
            7 => "July",
            8 => "August",
            9 => "September",
            10 => "October",
            11 => "November",
            _ => "December",
        }
    } else {
        indonesian_month_name(month)
    }
}

pub fn localized_short_month_name(month: u32, en: bool) -> &'static str {
    if en {
        match month {
            1 => "Jan",
            2 => "Feb",
            3 => "Mar",
            4 => "Apr",
            5 => "May",
            6 => "Jun",
            7 => "Jul",
            8 => "Aug",
            9 => "Sep",
            10 => "Oct",
            11 => "Nov",
            _ => "Dec",
        }
    } else {
        match month {
            1 => "Jan",
            2 => "Feb",
            3 => "Mar",
            4 => "Apr",
            5 => "Mei",
            6 => "Jun",
            7 => "Jul",
            8 => "Agt",
            9 => "Sep",
            10 => "Okt",
            11 => "Nov",
            _ => "Des",
        }
    }
}

pub fn indonesian_day_name(dow: u32) -> &'static str {
    match dow % 7 {
        0 => "Minggu",
        1 => "Senin",
        2 => "Selasa",
        3 => "Rabu",
        4 => "Kamis",
        5 => "Jumat",
        _ => "Sabtu",
    }
}

pub fn indonesian_month_name(month: u32) -> &'static str {
    match month {
        1 => "Januari",
        2 => "Februari",
        3 => "Maret",
        4 => "April",
        5 => "Mei",
        6 => "Juni",
        7 => "Juli",
        8 => "Agustus",
        9 => "September",
        10 => "Oktober",
        11 => "November",
        _ => "Desember",
    }
}
