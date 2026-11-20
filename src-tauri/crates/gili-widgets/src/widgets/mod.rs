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
        entry("calendar_agenda", "A", "Modul Gili", "Kalender & Agenda", "Kalender bulan ringkas beserta agenda harian dari modul Kalender Gili.", &[Small, Medium, Large], Medium, "EventNavbarModule (gili_navbar_events_v1)", false, Some("calendar")),
        entry("class_schedule", "A", "Modul Gili", "Jadwal Kuliah Mingguan", "Daftar mata kuliah mingguan, jam, dan ruang belajar.", &[Medium, Large], Medium, "ClassScheduleNavbarModule (gili_class_schedule_v1)", false, Some("class_schedule")),
        entry("habit_heatmap", "A", "Modul Gili", "Heatmap Kebiasaan", "Grafik konsistensi kebiasaan harian bergaya kontribusi matriks.", &[Medium, Large], Medium, "StreakNavbarModule (riwayat harian kompatibel mundur)", false, Some("streak")),
        entry("system_performance", "A", "Modul Gili", "Performa Sistem", "Beban CPU per-core asli, RAM, GPU, disk, dan kecepatan jaringan.", &[Small, Medium, Large], Medium, "NtQuerySystemInformation, GlobalMemoryStatusEx, NVML/WMI", false, Some("system_monitor")),
        entry("now_playing", "A", "Modul Gili", "Now Playing & Lirik", "Lagu yang sedang diputar beserta lirik tersinkron dari sumber lirik Gili.", &[Small, Medium, Large], Medium, "media_lyrics_store (CURRENT_MEDIA & CURRENT_LYRICS)", false, Some("media")),
        entry("weather_forecast", "A", "Modul Gili", "Cuaca Lengkap", "Suhu saat ini, prakiraan per jam, dan prakiraan 5 hari.", &[Small, Medium, Large], Medium, "Open-Meteo (api.open-meteo.com)", false, Some("weather")),
        entry("todo_groups", "A", "Modul Gili", "To-Do dengan Grup", "Daftar tugas terkelompok beserta progres penyelesaian.", &[Small, Medium, Large], Medium, "todoUtils (island_todo_list)", false, Some("todo")),
        entry("drop_zone", "A", "Modul Gili", "Drop Zone", "Rak berkas cepat yang terhubung dengan Drop Zone Gili.", &[Small, Medium], Small, "shelf_server & shelf.json", false, Some("shelf")),

        // Group B: Produktif
        entry("sticky_notes", "B", "Produktif", "Catatan Tempel", "Banyak catatan berwarna dengan mode checklist dan editor teks native.", &[Small, Medium, Large], Medium, "Penyimpanan lokal catatan tempel", false, Some("notes")),
        entry("mini_kanban", "B", "Produktif", "Kanban Mini 3 Kolom", "Papan tugas 3 kolom (Akan, Dikerjakan, Selesai) dengan pindah kolom.", &[Large], Large, "Penyimpanan lokal kanban_board.json", false, None),
        entry("time_tracker", "B", "Produktif", "Pelacak Waktu Proyek", "Hitung durasi kerja per proyek (mulai/henti) dengan ekspor CSV.", &[Small, Medium], Medium, "Penyimpanan lokal time_tracker.json", false, None),
        entry("site_status", "B", "Produktif", "Status Situs", "Pantau uptime URL milik pengguna (interval min 60 dtk, maks 6 situs).", &[Medium, Large], Medium, "HTTP ping HTTPS ber-timeout via ureq", true, None),
        entry("github_status", "B", "Produktif", "Status GitHub", "Ringkasan PR, issue, dan hasil Actions dengan ETag & token Credential Manager.", &[Medium, Large], Medium, "GitHub REST API (read-only fine-grained PAT)", true, None),
        entry("shortcuts_grid", "B", "Produktif", "Pintasan Cepat", "Grid aplikasi, folder, dan tautan pilihan dengan ikon sistem ber-cache.", &[Small, Medium, Large], Medium, "Penyimpanan lokal shortcuts.json + IShellItemImageFactory", false, None),
        entry("recent_files", "B", "Produktif", "Berkas Terbaru", "Daftar berkas terbaru secara opt-in (metadata saja, tanpa baca isi).", &[Medium, Large], Medium, "Pemindaian metadata folder opt-in", true, None),

        // Group C: Sistem
        entry("top_processes", "C", "Sistem", "Proses Teratas (Baca-Saja)", "5 proses paling aktif menggunakan CPU & RAM tanpa tombol akhiri proses.", &[Medium, Large], Medium, "Win32 EnumProcesses & GetProcessMemoryInfo (hanya-baca)", false, Some("system_monitor")),
        entry("quick_controls", "C", "Sistem", "Kontrol Cepat", "Toggle stabil berbasis API publik: Wi-Fi, Bluetooth, Mode Gelap, Bisukan.", &[Small, Medium], Medium, "Control Center Gili (WinRT Radio, Themes\\Personalize, Core Audio)", false, Some("control_center")),
        entry("storage_treemap", "C", "Sistem", "Peta Penyimpanan", "Visualisasi treemap pemakaian folder on-demand prioritas rendah.", &[Medium, Large], Medium, "Pemindai folder lokal on-demand ber-cache", true, Some("storage")),

        // Group D: Estetik & Gaya Hidup
        entry("styled_clock", "D", "Estetik & Gaya Hidup", "Jam Bergaya (8 Gaya)", "8 gaya jam termasuk analog, digital tipis, dan tipografi kata Bahasa Indonesia.", &[Small, Medium, Large], Medium, "Jam sistem lokal Windows", false, None),
        entry("photo_frame", "D", "Estetik & Gaya Hidup", "Bingkai Foto / Polaroid", "Slideshow baca-saja dari folder foto pengguna dengan dukungan rotasi EXIF.", &[Small, Medium, Large], Small, "Folder foto lokal baca-saja", true, None),
        entry("live_mascot", "D", "Estetik & Gaya Hidup", "Maskot Hidup Gili", "Karakter vektor orisinal ringan (8-12 fps) yang merespons klik & waktu.", &[Small, Medium], Small, "Animasi vektor native Direct2D", false, None),
        entry("audio_visualizer", "D", "Estetik & Gaya Hidup", "Visualizer Audio", "Spektrum audio langsung dari WASAPI loopback dengan FFT ringan.", &[Medium], Medium, "Windows WASAPI loopback + FFT 256-point", false, Some("media")),
        entry("quote_poster", "D", "Estetik & Gaya Hidup", "Poster Kutipan", "Tipografi kutipan harian atau teks sendiri dengan tata letak editorial.", &[Small, Medium, Large], Medium, "KutipanHarianNavbarModule + teks sendiri", false, None),

        // Group E: Fokus Indonesia & Tambahan
        entry("prayer_times", "E", "Indonesia & Tambahan", "Jadwal Sholat (Kemenag RI)", "Kalkulator jadwal sholat offline metode Kemenag RI + mode Ramadan.", &[Small, Medium, Large], Medium, "Kalkulator astronomis offline Kemenag RI (Subuh 20, Isya 18)", false, Some("prayer")),
        entry("currency_gold", "E", "Indonesia & Tambahan", "Kurs & Harga Emas", "Kurs mata uang (open.er-api.com ber-cache) & antarmuka harga emas.", &[Small, Medium], Medium, "open.er-api.com (kurs) + kontrak GoldPriceProvider", false, Some("currency")),
        entry("hijri_holidays", "E", "Indonesia & Tambahan", "Kalender Hijriyah & Libur", "Tanggal Hijriyah offline (+/-1 hari) & daftar libur dari berkas SKB 3 Menteri.", &[Small, Medium], Medium, "Konverter Hijriyah offline + berkas JSON SKB 3 Menteri", false, None),
        entry("quick_expense", "E", "Indonesia & Tambahan", "Catat Pengeluaran Cepat", "Catatan pengeluaran lokal terenkripsi DPAPI dengan bar anggaran bulanan.", &[Small, Medium], Medium, "Penyimpanan lokal terenkripsi Windows DPAPI (nol telemetri)", false, None),
        entry("football_scores", "E", "Indonesia & Tambahan", "Papan Skor Bola", "Skor pertandingan melalui antarmuka penyedia data berlisensi.", &[Medium], Medium, "Kontrak FootballScoreProvider (butuh API berlisensi)", true, None),
        entry("ai_quick_ask", "E", "Indonesia & Tambahan", "Tanya Cepat AI", "Kirim pertanyaan singkat lewat router & kunci API BYOK Gili.", &[Medium], Medium, "aiRouterService & Windows Credential Manager Gili", true, Some("ai_chat")),
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
}

fn resolve_role(
    role: &ColorRoleSource,
    auto_color: RgbaColor,
    dominant: RgbaColor,
) -> RgbaColor {
    match role {
        ColorRoleSource::AutoContrast => auto_color,
        ColorRoleSource::WallpaperDominant => dominant,
        ColorRoleSource::Custom { color } => *color,
    }
}

pub fn resolve_palette(
    style: &WidgetStyleConfig,
    analysis: &WallpaperRegionAnalysis,
) -> ResolvedPalette {
    let primary = resolve_role(
        &style.text_primary,
        analysis.recommended_text_primary,
        analysis.dominant_accent,
    );
    let secondary = resolve_role(
        &style.text_secondary,
        analysis.recommended_text_secondary,
        analysis.dominant_accent.with_alpha(0.70),
    );
    let accent = resolve_role(
        &style.accent,
        RgbaColor::new(0x38, 0x82, 0xF6, 1.0),
        analysis.dominant_accent,
    );
    let raw_card = resolve_role(
        &style.card_color,
        RgbaColor::new(0x14, 0x15, 0x1A, 0.88),
        analysis.dominant_accent,
    );

    let (card_fill, inner_border) = match style.background_mode {
        BackgroundMode::None => (None, None),
        BackgroundMode::SubtleTint => (
            Some(raw_card.with_alpha(style.tint_opacity.clamp(0.10, 0.25))),
            Some(RgbaColor::new(255, 255, 255, 0.10)),
        ),
        BackgroundMode::Glass => (
            Some(raw_card.with_alpha(0.32)),
            Some(RgbaColor::new(255, 255, 255, 0.12)),
        ),
        BackgroundMode::Solid => (
            Some(raw_card.with_alpha(0.96)),
            Some(RgbaColor::new(255, 255, 255, 0.08)),
        ),
    };

    let surface_chip = if primary.r > 180 {
        RgbaColor::new(255, 255, 255, 0.12)
    } else {
        RgbaColor::new(16, 18, 22, 0.10)
    };

    ResolvedPalette {
        primary,
        secondary,
        accent,
        card_fill,
        inner_border,
        surface_chip,
        positive: RgbaColor::new(0x34, 0xC3, 0xA0, 1.0),
        warning: RgbaColor::new(0xFB, 0xBF, 0x24, 1.0),
        danger: RgbaColor::new(0xF8, 0x71, 0x71, 1.0),
    }
}

pub struct WidgetBuildCtx<'a> {
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
            rect: RectF::new(rect.x + 6.0, rect.y + (rect.h - 14.0) * 0.42, rect.w - 12.0, 18.0),
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
    let btn_w = (inner.w * 0.52).clamp(84.0, 128.0);
    let btn_rect = RectF::new(inner.x, inner.y + inner.h - 30.0, btn_w, 28.0);
    nodes.extend(action_pill(
        btn_rect,
        cta_label,
        ctx.pal.accent.with_alpha(0.24),
        ctx.pal.primary,
        action_id,
    ));
    nodes
}

pub fn build_widget_render_item(
    slot: &WidgetStackSlot,
    frame: RectF,
    global_theme: &WidgetStyleConfig,
    analysis: &WallpaperRegionAnalysis,
    hub: &WidgetDataHub,
    elapsed_secs: f32,
) -> WidgetRenderItem {
    let fallback = WidgetInstance::default();
    let inst = slot.active_widget().unwrap_or(&fallback);
    let style = inst.style_override.as_ref().unwrap_or(global_theme);
    let pal = resolve_palette(style, analysis);

    let ctx = WidgetBuildCtx {
        frame,
        size: slot.size,
        pal,
        instance: inst,
        hub,
        elapsed_secs,
    };

    let nodes = match inst.widget_type.as_str() {
        "calendar_agenda" => group_a::build_calendar_agenda(&ctx),
        "class_schedule" => group_a::build_class_schedule(&ctx),
        "habit_heatmap" => group_a::build_habit_heatmap(&ctx),
        "system_performance" => group_a::build_system_performance(&ctx),
        "now_playing" => group_a::build_now_playing(&ctx),
        "weather_forecast" => group_a::build_weather_forecast(&ctx),
        "todo_groups" => group_a::build_todo_groups(&ctx),
        "drop_zone" => group_a::build_drop_zone(&ctx),

        "sticky_notes" => group_b::build_sticky_notes(&ctx),
        "mini_kanban" => group_b::build_mini_kanban(&ctx),
        "time_tracker" => group_b::build_time_tracker(&ctx),
        "site_status" => group_b::build_site_status(&ctx),
        "github_status" => group_b::build_github_status(&ctx),
        "shortcuts_grid" => group_b::build_shortcuts_grid(&ctx),
        "recent_files" => group_b::build_recent_files(&ctx),

        "top_processes" => group_c::build_top_processes(&ctx),
        "quick_controls" => group_c::build_quick_controls(&ctx),
        "storage_treemap" => group_c::build_storage_treemap(&ctx),

        "styled_clock" => group_d::build_styled_clock(&ctx),
        "photo_frame" => group_d::build_photo_frame(&ctx),
        "live_mascot" => group_d::build_live_mascot(&ctx),
        "audio_visualizer" => group_d::build_audio_visualizer(&ctx),
        "quote_poster" => group_d::build_quote_poster(&ctx),

        "prayer_times" => group_e::build_prayer_times(&ctx),
        "currency_gold" => group_e::build_currency_gold(&ctx),
        "hijri_holidays" => group_e::build_hijri_holidays(&ctx),
        "quick_expense" => group_e::build_quick_expense(&ctx),
        "football_scores" => group_e::build_football_scores(&ctx),
        "ai_quick_ask" => group_e::build_ai_quick_ask(&ctx),

        _ => empty_state_nodes(
            &ctx,
            "Widget Tidak Dikenal",
            "Jenis widget ini belum terdaftar di versi Gili saat ini.",
            "Atur",
            "open_settings",
        ),
    };

    WidgetRenderItem {
        slot_id: slot.slot_id.clone(),
        widget_type: inst.widget_type.clone(),
        frame,
        background_mode: style.background_mode,
        card_fill: pal.card_fill,
        inner_border: pal.inner_border,
        shadow_enabled: style.shadow_enabled,
        halo_enabled: style.halo_enabled,
        shadow_color: style.shadow_color,
        font_family: style.font_family.clone(),
        nodes,
        content_hit_rects: Vec::new(),
        stack_count: slot.widgets.len(),
        stack_index: slot.active_index % slot.widgets.len().max(1),
        edit_jiggle_deg: 0.0,
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
