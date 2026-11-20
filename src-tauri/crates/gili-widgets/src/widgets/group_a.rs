use crate::config::WidgetSize;
use crate::layout::{RectF, SceneNode, TextAlign};
use crate::widgets::{
    action_pill, empty_state_nodes, indonesian_day_name, indonesian_month_name,
    local_datetime_parts, text_node, WidgetBuildCtx,
};

/// 1. Kalender bulan + agenda (S, M, L)
pub fn build_calendar_agenda(ctx: &WidgetBuildCtx<'_>) -> Vec<SceneNode> {
    let inner = ctx.frame.inset(14.0);
    let (year, month, day, _, _, _, dow) = local_datetime_parts();
    let events = &ctx.hub.frontend.events;
    let mut nodes = Vec::new();

    nodes.push(text_node(
        RectF::new(inner.x, inner.y, inner.w, 16.0),
        format!("{} {}", indonesian_day_name(dow).to_uppercase(), indonesian_month_name(month).to_uppercase()),
        11.0,
        700,
        ctx.pal.accent,
        TextAlign::Left,
        false,
    ));
    nodes.push(text_node(
        RectF::new(inner.x, inner.y + 14.0, 72.0, 44.0),
        format!("{}", day),
        38.0,
        700,
        ctx.pal.primary,
        TextAlign::Left,
        true,
    ));

    match ctx.size {
        WidgetSize::Small => {
            if let Some(ev) = events.first() {
                nodes.push(text_node(
                    RectF::new(inner.x, inner.y + 70.0, inner.w, 18.0),
                    &ev.time,
                    11.5,
                    600,
                    ctx.pal.accent,
                    TextAlign::Left,
                    true,
                ));
                nodes.push(text_node(
                    RectF::new(inner.x, inner.y + 88.0, inner.w, 36.0),
                    &ev.title,
                    13.0,
                    600,
                    ctx.pal.primary,
                    TextAlign::Left,
                    false,
                ));
            } else {
                nodes.push(text_node(
                    RectF::new(inner.x, inner.y + 76.0, inner.w, 36.0),
                    "Tidak ada agenda hari ini",
                    12.5,
                    400,
                    ctx.pal.secondary,
                    TextAlign::Left,
                    false,
                ));
            }
        }
        WidgetSize::Medium | WidgetSize::Large => {
            let right_x = inner.x + inner.w * 0.44;
            let right_w = inner.w * 0.56;
            nodes.push(text_node(
                RectF::new(inner.x, inner.y + 62.0, inner.w * 0.40, 18.0),
                format!("{} {}", indonesian_month_name(month), year),
                12.0,
                500,
                ctx.pal.secondary,
                TextAlign::Left,
                false,
            ));

            if events.is_empty() {
                nodes.push(text_node(
                    RectF::new(right_x, inner.y + 18.0, right_w, 36.0),
                    "Agenda kosong. Ketuk untuk menambah di Gili.",
                    12.5,
                    400,
                    ctx.pal.secondary,
                    TextAlign::Left,
                    false,
                ));
            } else {
                let max_items = if ctx.size == WidgetSize::Large { 6 } else { 3 };
                for (i, ev) in events.iter().take(max_items).enumerate() {
                    let y = inner.y + 14.0 + i as f32 * 36.0;
                    if y + 30.0 > inner.y + inner.h {
                        break;
                    }
                    nodes.push(SceneNode::Line {
                        x1: right_x,
                        y1: y + 4.0,
                        x2: right_x,
                        y2: y + 26.0,
                        color: ctx.pal.accent,
                        width: 2.5,
                    });
                    nodes.push(text_node(
                        RectF::new(right_x + 8.0, y, right_w - 8.0, 16.0),
                        &ev.title,
                        13.0,
                        600,
                        ctx.pal.primary,
                        TextAlign::Left,
                        false,
                    ));
                    nodes.push(text_node(
                        RectF::new(right_x + 8.0, y + 16.0, right_w - 8.0, 14.0),
                        &ev.time,
                        11.0,
                        500,
                        ctx.pal.secondary,
                        TextAlign::Left,
                        true,
                    ));
                }
            }

            if ctx.size == WidgetSize::Large {
                // Mini month day strip at bottom left
                let labels = ["M", "S", "S", "R", "K", "J", "S"];
                let start_y = inner.y + 104.0;
                let cell = 18.0;
                for (i, lbl) in labels.iter().enumerate() {
                    nodes.push(text_node(
                        RectF::new(inner.x + i as f32 * cell, start_y, cell, 14.0),
                        *lbl,
                        10.0,
                        600,
                        ctx.pal.secondary,
                        TextAlign::Center,
                        false,
                    ));
                }
                for d in 1..=30u32 {
                    let col = (d - 1) % 7;
                    let row = (d - 1) / 7;
                    let cx = inner.x + col as f32 * cell;
                    let cy = start_y + 18.0 + row as f32 * 22.0;
                    if d == day {
                        nodes.push(SceneNode::RoundedRect {
                            rect: RectF::new(cx, cy - 1.0, cell - 1.0, 18.0),
                            radius: 9.0,
                            smoothing: 0.4,
                            fill: Some(ctx.pal.accent),
                            stroke: None,
                            interactive_action: None,
                        });
                    }
                    nodes.push(text_node(
                        RectF::new(cx, cy, cell - 1.0, 16.0),
                        format!("{}", d),
                        10.5,
                        if d == day { 700 } else { 400 },
                        ctx.pal.primary,
                        TextAlign::Center,
                        true,
                    ));
                }
            }
        }
    }

    nodes
}

/// 2. Jadwal kuliah mingguan (M, L)
pub fn build_class_schedule(ctx: &WidgetBuildCtx<'_>) -> Vec<SceneNode> {
    let classes = &ctx.hub.frontend.classes;
    if classes.is_empty() {
        return empty_state_nodes(
            ctx,
            "Jadwal Kuliah",
            "Belum ada mata kuliah terdaftar di modul Jadwal Gili.",
            "Atur Jadwal",
            "open_class_schedule",
        );
    }
    let inner = ctx.frame.inset(14.0);
    let (_, _, _, _, _, _, dow) = local_datetime_parts();
    let mut nodes = vec![
        text_node(
            RectF::new(inner.x, inner.y, inner.w * 0.65, 20.0),
            "Jadwal Kuliah",
            15.0,
            600,
            ctx.pal.primary,
            TextAlign::Left,
            false,
        ),
        text_node(
            RectF::new(inner.x + inner.w * 0.65, inner.y + 2.0, inner.w * 0.35, 16.0),
            indonesian_day_name(dow),
            12.0,
            600,
            ctx.pal.accent,
            TextAlign::Right,
            false,
        ),
    ];

    let max_rows = if ctx.size == WidgetSize::Large { 6 } else { 3 };
    for (i, item) in classes.iter().take(max_rows).enumerate() {
        let y = inner.y + 28.0 + i as f32 * 36.0;
        if y + 30.0 > inner.y + inner.h {
            break;
        }
        nodes.push(SceneNode::RoundedRect {
            rect: RectF::new(inner.x, y, 56.0, 26.0),
            radius: 8.0,
            smoothing: 0.4,
            fill: Some(ctx.pal.surface_chip),
            stroke: None,
            interactive_action: None,
        });
        nodes.push(text_node(
            RectF::new(inner.x, y + 5.0, 56.0, 16.0),
            &item.time,
            11.0,
            700,
            ctx.pal.accent,
            TextAlign::Center,
            true,
        ));
        nodes.push(text_node(
            RectF::new(inner.x + 64.0, y, inner.w - 64.0, 16.0),
            &item.subject,
            13.0,
            600,
            ctx.pal.primary,
            TextAlign::Left,
            false,
        ));
        let day_tag = item
            .day
            .map(|d| format!("{} . ", indonesian_day_name(d as u32)))
            .unwrap_or_default();
        nodes.push(text_node(
            RectF::new(inner.x + 64.0, y + 16.0, inner.w - 64.0, 14.0),
            format!("{}{}", day_tag, item.room),
            11.0,
            400,
            ctx.pal.secondary,
            TextAlign::Left,
            false,
        ));
    }
    nodes
}

/// 3. Heatmap kebiasaan gaya GitHub (M, L)
pub fn build_habit_heatmap(ctx: &WidgetBuildCtx<'_>) -> Vec<SceneNode> {
    let inner = ctx.frame.inset(14.0);
    let f = &ctx.hub.frontend;
    let title = if f.habit_title.is_empty() {
        "Kebiasaan Harian"
    } else {
        &f.habit_title
    };

    let cols = if ctx.size == WidgetSize::Large { 16 } else { 14 };
    let rows = 7;
    let total_cells = cols * rows;

    // Build levels from real recorded daily history (never fabricated counts)
    let mut levels = vec![0u8; total_cells];
    let mut sorted_vals: Vec<u32> = f.habit_history.values().copied().collect();
    if sorted_vals.len() > total_cells {
        sorted_vals = sorted_vals[sorted_vals.len() - total_cells..].to_vec();
    }
    let start_offset = total_cells.saturating_sub(sorted_vals.len());
    for (idx, val) in sorted_vals.iter().enumerate() {
        levels[start_offset + idx] = (*val).min(4) as u8;
    }

    let mut nodes = vec![
        text_node(
            RectF::new(inner.x, inner.y, inner.w * 0.68, 20.0),
            title,
            15.0,
            600,
            ctx.pal.primary,
            TextAlign::Left,
            false,
        ),
        text_node(
            RectF::new(inner.x + inner.w * 0.68, inner.y, inner.w * 0.32, 20.0),
            format!("{} hari", f.habit_count),
            13.0,
            700,
            ctx.pal.positive,
            TextAlign::Right,
            true,
        ),
        SceneNode::HeatmapGrid {
            rect: RectF::new(
                inner.x,
                inner.y + 28.0,
                inner.w,
                (inner.h - 46.0).max(60.0),
            ),
            cols,
            rows,
            levels,
            base_color: ctx.pal.surface_chip,
            accent_color: ctx.pal.positive,
        },
        text_node(
            RectF::new(inner.x, inner.y + inner.h - 15.0, inner.w, 15.0),
            format!("{} hari tercatat di riwayat", f.habit_history.len()),
            11.0,
            400,
            ctx.pal.secondary,
            TextAlign::Left,
            true,
        ),
    ];

    if f.habit_history.is_empty() && f.habit_count == 0 {
        nodes.extend(action_pill(
            RectF::new(inner.x + inner.w - 92.0, inner.y + inner.h - 24.0, 92.0, 24.0),
            "Mulai Catat",
            ctx.pal.positive.with_alpha(0.24),
            ctx.pal.primary,
            "open_streak",
        ));
    }
    nodes
}

/// 4. Performa sistem: CPU per core, RAM, GPU, disk, jaringan (S, M, L)
pub fn build_system_performance(ctx: &WidgetBuildCtx<'_>) -> Vec<SceneNode> {
    let inner = ctx.frame.inset(14.0);
    let sys = &ctx.hub.system;
    let mut nodes = Vec::new();

    match ctx.size {
        WidgetSize::Small => {
            nodes.push(text_node(
                RectF::new(inner.x, inner.y, inner.w, 16.0),
                "CPU & RAM",
                11.5,
                600,
                ctx.pal.secondary,
                TextAlign::Left,
                false,
            ));
            let cx = inner.x + inner.w * 0.5;
            let cy = inner.y + 62.0;
            nodes.push(SceneNode::ProgressRing {
                cx,
                cy,
                radius: 34.0,
                stroke_width: 6.0,
                progress: sys.cpu_total_pct / 100.0,
                track_color: ctx.pal.surface_chip,
                fill_color: ctx.pal.accent,
            });
            nodes.push(text_node(
                RectF::new(cx - 28.0, cy - 11.0, 56.0, 22.0),
                format!("{:.0}%", sys.cpu_total_pct),
                17.0,
                700,
                ctx.pal.primary,
                TextAlign::Center,
                true,
            ));
            nodes.push(text_node(
                RectF::new(inner.x, inner.y + inner.h - 18.0, inner.w, 16.0),
                format!("RAM {:.1}/{:.0} GB", sys.ram_used_gb, sys.ram_total_gb),
                11.5,
                500,
                ctx.pal.secondary,
                TextAlign::Center,
                true,
            ));
        }
        WidgetSize::Medium | WidgetSize::Large => {
            nodes.push(text_node(
                RectF::new(inner.x, inner.y, 130.0, 16.0),
                "PERFORMA SISTEM",
                11.0,
                700,
                ctx.pal.secondary,
                TextAlign::Left,
                false,
            ));
            nodes.push(text_node(
                RectF::new(inner.x, inner.y + 16.0, 110.0, 40.0),
                format!("{:.0}%", sys.cpu_total_pct),
                36.0,
                700,
                ctx.pal.primary,
                TextAlign::Left,
                true,
            ));

            // Real per-core CPU bars
            let core_vals: Vec<f32> = if sys.cpu_cores_pct.is_empty() {
                vec![sys.cpu_total_pct / 100.0]
            } else {
                sys.cpu_cores_pct
                    .iter()
                    .take(16)
                    .map(|p| (p / 100.0).clamp(0.05, 1.0))
                    .collect()
            };
            nodes.push(SceneNode::BarChart {
                rect: RectF::new(inner.x + 114.0, inner.y + 18.0, inner.w - 114.0, 42.0),
                values: core_vals,
                colors: vec![ctx.pal.accent],
                gap: 3.0,
            });

            // RAM progress bar
            let ram_y = inner.y + 72.0;
            nodes.push(text_node(
                RectF::new(inner.x, ram_y, inner.w, 15.0),
                format!(
                    "RAM {:.1} / {:.0} GB ({:.0}%)",
                    sys.ram_used_gb, sys.ram_total_gb, sys.ram_pct
                ),
                11.5,
                500,
                ctx.pal.secondary,
                TextAlign::Left,
                true,
            ));
            nodes.push(SceneNode::ProgressBar {
                rect: RectF::new(inner.x, ram_y + 17.0, inner.w, 6.0),
                progress: sys.ram_pct / 100.0,
                track_color: ctx.pal.surface_chip,
                fill_color: ctx.pal.positive,
                interactive_action: None,
            });

            // GPU & Network summary
            let gpu_label = match (sys.gpu_pct, sys.gpu_temp_c) {
                (Some(p), Some(t)) => format!("GPU {}% . {}C", p, t),
                (Some(p), None) => format!("GPU {}%", p),
                _ => "GPU siaga".to_string(),
            };
            nodes.push(text_node(
                RectF::new(inner.x, ram_y + 30.0, inner.w * 0.55, 16.0),
                gpu_label,
                11.5,
                600,
                ctx.pal.primary,
                TextAlign::Left,
                true,
            ));
            nodes.push(text_node(
                RectF::new(inner.x + inner.w * 0.55, ram_y + 30.0, inner.w * 0.45, 16.0),
                format!("↓{:.1} ↑{:.1} Mbps", sys.net_down_mbps, sys.net_up_mbps),
                11.0,
                500,
                ctx.pal.secondary,
                TextAlign::Right,
                true,
            ));

            if ctx.size == WidgetSize::Large {
                let mut dy = ram_y + 62.0;
                nodes.push(text_node(
                    RectF::new(inner.x, dy, inner.w, 16.0),
                    "PENYIMPANAN DISK",
                    11.0,
                    700,
                    ctx.pal.secondary,
                    TextAlign::Left,
                    false,
                ));
                dy += 20.0;
                for d in sys.disks.iter().take(4) {
                    nodes.push(text_node(
                        RectF::new(inner.x, dy, inner.w, 15.0),
                        format!("{}  {:.0} / {:.0} GB ({:.0}%)", d.mount, d.used_gb, d.total_gb, d.usage_pct),
                        12.0,
                        500,
                        ctx.pal.primary,
                        TextAlign::Left,
                        true,
                    ));
                    nodes.push(SceneNode::ProgressBar {
                        rect: RectF::new(inner.x, dy + 17.0, inner.w, 5.0),
                        progress: d.usage_pct / 100.0,
                        track_color: ctx.pal.surface_chip,
                        fill_color: if d.usage_pct > 85.0 { ctx.pal.danger } else { ctx.pal.accent },
                        interactive_action: None,
                    });
                    dy += 32.0;
                }
            }
        }
    }
    nodes
}

/// 5. Now Playing + lirik penuh (S, M, L), memakai sumber lirik yang sama dengan mini player
pub fn build_now_playing(ctx: &WidgetBuildCtx<'_>) -> Vec<SceneNode> {
    let m = &ctx.hub.media;
    if m.title.trim().is_empty() {
        return empty_state_nodes(
            ctx,
            "Now Playing",
            "Putar musik di Spotify, browser, atau pemutar lain untuk melihat lirik di sini.",
            "Buka Media",
            "open_media",
        );
    }
    let inner = ctx.frame.inset(14.0);
    let has_art = m
        .thumbnail_path_or_data
        .as_deref()
        .map(|s| !s.trim().is_empty())
        .unwrap_or(false);
    let art_sz = if ctx.size == WidgetSize::Small { 34.0 } else { 42.0 };
    let text_x = if has_art { inner.x + art_sz + 10.0 } else { inner.x };
    let text_w = (inner.x + inner.w - text_x - 24.0).max(40.0);

    let mut nodes = Vec::new();
    if let Some(src) = m.thumbnail_path_or_data.as_deref().filter(|s| !s.trim().is_empty()) {
        nodes.push(SceneNode::ImageRef {
            rect: RectF::new(inner.x, inner.y, art_sz, art_sz),
            radius: crate::layout::concentric_radius(24.0, 12.0),
            source_path: src.to_string(),
        });
    }
    nodes.push(SceneNode::IconGlyph {
        rect: RectF::new(inner.x + inner.w - 22.0, inner.y + 2.0, 22.0, 22.0),
        glyph: if m.is_playing { "\u{E769}".into() } else { "\u{E768}".into() },
        size: 14.0,
        color: ctx.pal.accent,
        interactive_action: Some("toggle_media_playback".into()),
    });
    nodes.push(text_node(
        RectF::new(text_x, inner.y + 1.0, text_w, 20.0),
        &m.title,
        14.5,
        700,
        ctx.pal.primary,
        TextAlign::Left,
        false,
    ));
    nodes.push(text_node(
        RectF::new(text_x, inner.y + 21.0, text_w, 16.0),
        &m.artist,
        12.0,
        500,
        ctx.pal.secondary,
        TextAlign::Left,
        false,
    ));

    let progress = if m.duration_sec > 0.0 {
        (m.position_sec / m.duration_sec).clamp(0.0, 1.0) as f32
    } else {
        0.0
    };

    let lyric_top = inner.y + art_sz + 10.0;
    let lyric_text = if !m.active_lyric_line.is_empty() {
        m.active_lyric_line.clone()
    } else if m.lyrics_state == "loading" {
        "Memuat lirik...".to_string()
    } else {
        "Lirik tidak tersedia untuk lagu ini".to_string()
    };

    match ctx.size {
        WidgetSize::Small => {
            nodes.push(text_node(
                RectF::new(inner.x, lyric_top, inner.w, 52.0),
                lyric_text,
                13.0,
                600,
                ctx.pal.accent,
                TextAlign::Left,
                false,
            ));
        }
        WidgetSize::Medium => {
            nodes.push(text_node(
                RectF::new(inner.x, lyric_top, inner.w, 26.0),
                lyric_text,
                14.5,
                700,
                ctx.pal.primary,
                TextAlign::Left,
                false,
            ));
            if !m.next_lyric_line.is_empty() {
                nodes.push(text_node(
                    RectF::new(inner.x, lyric_top + 28.0, inner.w, 22.0),
                    &m.next_lyric_line,
                    12.5,
                    400,
                    ctx.pal.secondary,
                    TextAlign::Left,
                    false,
                ));
            }
        }
        WidgetSize::Large => {
            if m.lyrics_lines.is_empty() {
                nodes.push(text_node(
                    RectF::new(inner.x, lyric_top + 8.0, inner.w, 40.0),
                    lyric_text,
                    14.5,
                    600,
                    ctx.pal.secondary,
                    TextAlign::Left,
                    false,
                ));
            } else {
                for (i, line) in m.lyrics_lines.iter().take(7).enumerate() {
                    let is_active = line == &m.active_lyric_line;
                    nodes.push(text_node(
                        RectF::new(inner.x, lyric_top + i as f32 * 30.0, inner.w, 26.0),
                        line,
                        if is_active { 15.0 } else { 13.0 },
                        if is_active { 700 } else { 400 },
                        if is_active { ctx.pal.primary } else { ctx.pal.secondary },
                        TextAlign::Left,
                        false,
                    ));
                }
            }
        }
    }

    nodes.push(SceneNode::ProgressBar {
        rect: RectF::new(inner.x, inner.y + inner.h - 8.0, inner.w, 5.0),
        progress,
        track_color: ctx.pal.surface_chip,
        fill_color: ctx.pal.accent,
        interactive_action: None,
    });
    nodes
}

fn weather_code_label(code: i32) -> &'static str {
    match code {
        0 => "Cerah",
        1..=3 => "Berawan",
        45 | 48 => "Berkabut",
        51..=57 => "Gerimis",
        61..=67 | 80..=82 => "Hujan",
        95..=99 => "Badai Petir",
        _ => "Berawan",
    }
}

fn weather_code_fluent_glyph(code: i32) -> &'static str {
    match code {
        0 => "\u{E706}",
        1..=3 | 45 | 48 => "\u{E753}",
        51..=67 | 80..=82 => "\u{E9C0}",
        95..=99 => "\u{E945}",
        _ => "\u{E753}",
    }
}

/// 6. Cuaca: sekarang, per jam, 5 hari (S, M, L)
pub fn build_weather_forecast(ctx: &WidgetBuildCtx<'_>) -> Vec<SceneNode> {
    let w = &ctx.hub.weather;
    if !w.available {
        return empty_state_nodes(
            ctx,
            "Cuaca",
            w.error
                .as_deref()
                .unwrap_or("Data cuaca belum termuat. Periksa koneksi atau atur kota."),
            "Coba Lagi",
            "refresh_weather",
        );
    }
    let inner = ctx.frame.inset(14.0);
    let mut nodes = vec![
        text_node(
            RectF::new(inner.x, inner.y, inner.w - 28.0, 16.0),
            &w.location_name,
            13.0,
            600,
            ctx.pal.primary,
            TextAlign::Left,
            false,
        ),
        SceneNode::IconGlyph {
            rect: RectF::new(inner.x + inner.w - 26.0, inner.y - 2.0, 26.0, 26.0),
            glyph: weather_code_fluent_glyph(w.current_code).to_string(),
            size: 18.0,
            color: ctx.pal.warning,
            interactive_action: None,
        },
        text_node(
            RectF::new(inner.x, inner.y + 16.0, 120.0, 48.0),
            format!("{:.0}°", w.current_temp_c),
            40.0,
            700,
            ctx.pal.primary,
            TextAlign::Left,
            true,
        ),
        text_node(
            RectF::new(inner.x, inner.y + 64.0, 130.0, 16.0),
            weather_code_label(w.current_code),
            12.5,
            500,
            ctx.pal.secondary,
            TextAlign::Left,
            false,
        ),
    ];

    if ctx.size != WidgetSize::Small && !w.hourly.is_empty() {
        let cols = w.hourly.len().min(5);
        let start_x = inner.x + 120.0;
        let col_w = (inner.w - 120.0) / cols as f32;
        for (i, pt) in w.hourly.iter().take(cols).enumerate() {
            let x = start_x + i as f32 * col_w;
            nodes.push(text_node(
                RectF::new(x, inner.y + 22.0, col_w, 14.0),
                &pt.hour_label,
                10.5,
                500,
                ctx.pal.secondary,
                TextAlign::Center,
                true,
            ));
            nodes.push(text_node(
                RectF::new(x, inner.y + 42.0, col_w, 18.0),
                format!("{:.0}°", pt.temp_c),
                13.5,
                700,
                ctx.pal.primary,
                TextAlign::Center,
                true,
            ));
        }
    }

    if ctx.size == WidgetSize::Large && !w.daily.is_empty() {
        let mut y = inner.y + 104.0;
        nodes.push(text_node(
            RectF::new(inner.x, y, inner.w, 16.0),
            "PRAKIRAAN 5 HARI",
            11.0,
            700,
            ctx.pal.secondary,
            TextAlign::Left,
            false,
        ));
        y += 22.0;
        for d in w.daily.iter().take(5) {
            nodes.push(text_node(
                RectF::new(inner.x, y, 100.0, 18.0),
                &d.day_label,
                12.5,
                600,
                ctx.pal.primary,
                TextAlign::Left,
                false,
            ));
            nodes.push(text_node(
                RectF::new(inner.x + 105.0, y, 90.0, 18.0),
                weather_code_label(d.code),
                11.5,
                400,
                ctx.pal.secondary,
                TextAlign::Left,
                false,
            ));
            nodes.push(text_node(
                RectF::new(inner.x + inner.w - 92.0, y, 92.0, 18.0),
                format!("{:.0}° / {:.0}°", d.min_c, d.max_c),
                12.5,
                600,
                ctx.pal.primary,
                TextAlign::Right,
                true,
            ));
            y += 32.0;
        }
    }

    nodes
}

/// 7. To-do dengan grup (S, M, L)
pub fn build_todo_groups(ctx: &WidgetBuildCtx<'_>) -> Vec<SceneNode> {
    let todos = &ctx.hub.frontend.todos;
    if todos.is_empty() {
        return empty_state_nodes(
            ctx,
            "Daftar Tugas",
            "Semua tugas selesai atau belum ada daftar tugas di Gili.",
            "Tambah Tugas",
            "open_todo",
        );
    }
    let inner = ctx.frame.inset(14.0);
    let done = todos.iter().filter(|t| t.completed).count();
    let mut nodes = vec![
        text_node(
            RectF::new(inner.x, inner.y, inner.w * 0.7, 20.0),
            "Tugas",
            15.0,
            600,
            ctx.pal.primary,
            TextAlign::Left,
            false,
        ),
        text_node(
            RectF::new(inner.x + inner.w * 0.7, inner.y + 1.0, inner.w * 0.3, 18.0),
            format!("{}/{}", done, todos.len()),
            13.0,
            700,
            ctx.pal.accent,
            TextAlign::Right,
            true,
        ),
    ];

    let max_rows = match ctx.size {
        WidgetSize::Small => 3,
        WidgetSize::Medium => 4,
        WidgetSize::Large => 9,
    };

    for (i, t) in todos.iter().take(max_rows).enumerate() {
        let y = inner.y + 28.0 + i as f32 * 26.0;
        if y + 20.0 > inner.y + inner.h {
            break;
        }
        let bullet = if t.completed { "✓" } else { "○" };
        let grp = t
            .group
            .as_deref()
            .map(|g| format!("[{}] ", g))
            .unwrap_or_default();
        nodes.push(text_node(
            RectF::new(inner.x, y, inner.w, 20.0),
            format!("{} {}{}", bullet, grp, t.text),
            12.5,
            if t.completed { 400 } else { 500 },
            if t.completed { ctx.pal.secondary } else { ctx.pal.primary },
            TextAlign::Left,
            false,
        ));
    }

    nodes
}

/// 8. Drop Zone (S, M)
pub fn build_drop_zone(ctx: &WidgetBuildCtx<'_>) -> Vec<SceneNode> {
    let inner = ctx.frame.inset(14.0);
    let files = &ctx.hub.frontend.shelf_files;
    if files.is_empty() {
        return empty_state_nodes(
            ctx,
            "Drop Zone",
            "Rak berkas sementara kosong. Seret berkas ke Drop Zone Gili.",
            "Buka Rak",
            "open_shelf",
        );
    }

    let mut nodes = vec![
        text_node(
            RectF::new(inner.x, inner.y, inner.w * 0.7, 20.0),
            "Drop Zone",
            15.0,
            600,
            ctx.pal.primary,
            TextAlign::Left,
            false,
        ),
        text_node(
            RectF::new(inner.x + inner.w * 0.7, inner.y, inner.w * 0.3, 20.0),
            format!("{} berkas", files.len()),
            12.0,
            600,
            ctx.pal.accent,
            TextAlign::Right,
            true,
        ),
    ];

    for (i, f) in files.iter().take(3).enumerate() {
        let y = inner.y + 30.0 + i as f32 * 30.0;
        nodes.push(SceneNode::RoundedRect {
            rect: RectF::new(inner.x, y, inner.w, 24.0),
            radius: 8.0,
            smoothing: 0.4,
            fill: Some(ctx.pal.surface_chip),
            stroke: None,
            interactive_action: Some(format!("open_shelf_file:{}", f.id)),
        });
        nodes.push(text_node(
            RectF::new(inner.x + 8.0, y + 4.0, inner.w - 64.0, 16.0),
            &f.name,
            12.0,
            500,
            ctx.pal.primary,
            TextAlign::Left,
            false,
        ));
        nodes.push(text_node(
            RectF::new(inner.x + inner.w - 56.0, y + 4.0, 48.0, 16.0),
            &f.size_formatted,
            10.5,
            400,
            ctx.pal.secondary,
            TextAlign::Right,
            true,
        ));
    }

    nodes
}
