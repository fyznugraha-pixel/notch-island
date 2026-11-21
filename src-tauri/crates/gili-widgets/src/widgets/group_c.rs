use crate::config::{RgbaColor, WidgetSize};
use crate::layout::{RectF, SceneNode, TextAlign};
use crate::widgets::{action_pill, empty_state_nodes, is_english, text_node, WidgetBuildCtx};

/// 16. Proses teratas: 5 proses paling boros CPU/RAM, HANYA-BACA tanpa tombol akhiri proses (M, L)
pub fn build_top_processes(ctx: &WidgetBuildCtx<'_>) -> Vec<SceneNode> {
    let en = is_english(ctx);
    let procs = &ctx.hub.top_processes;
    if procs.is_empty() {
        return empty_state_nodes(
            ctx,
            if en { "Top Processes" } else { "Proses Teratas" },
            if en {
                "Sampling process CPU and RAM usage (read-only)."
            } else {
                "Sedang mengumpulkan sampel pemakaian CPU dan RAM proses (hanya-baca)."
            },
            if en { "Refresh" } else { "Segarkan" },
            "refresh_processes",
        );
    }
    let inner = ctx.frame.inset(14.0);
    let mut nodes = vec![
        text_node(
            RectF::new(inner.x, inner.y, inner.w * 0.65, 20.0),
            if en { "Top Processes" } else { "Proses Teratas" },
            15.0,
            600,
            ctx.pal.primary,
            TextAlign::Left,
            false,
        ),
        text_node(
            RectF::new(
                inner.x + inner.w * 0.65,
                inner.y + 2.0,
                inner.w * 0.35,
                16.0,
            ),
            if en { "Read-only" } else { "Hanya-baca" },
            11.0,
            500,
            ctx.pal.secondary,
            TextAlign::Right,
            false,
        ),
    ];

    let max_rows = if ctx.size == WidgetSize::Large { 5 } else { 3 };
    let row_h = if ctx.size == WidgetSize::Large {
        52.0
    } else {
        32.0
    };
    for (i, p) in procs.iter().take(max_rows).enumerate() {
        let y = inner.y + 28.0 + i as f32 * row_h;
        if y + 18.0 > inner.y + inner.h {
            break;
        }
        nodes.push(crate::widgets::text_node_line(
            RectF::new(inner.x, y, (inner.w - 118.0).max(40.0), 18.0),
            &p.name,
            12.5,
            600,
            ctx.pal.primary,
            TextAlign::Left,
            false,
        ));
        nodes.push(crate::widgets::text_node_line(
            RectF::new(inner.x + inner.w - 116.0, y, 52.0, 18.0),
            format!("{:.1}%", p.cpu_pct),
            12.0,
            600,
            ctx.pal.primary,
            TextAlign::Right,
            true,
        ));
        nodes.push(crate::widgets::text_node_line(
            RectF::new(inner.x + inner.w - 60.0, y, 60.0, 18.0),
            format!("{:.0} MB", p.ram_mb),
            11.5,
            500,
            ctx.pal.secondary,
            TextAlign::Right,
            true,
        ));
        if ctx.size == WidgetSize::Large && y + 27.0 <= inner.y + inner.h {
            nodes.push(SceneNode::ProgressBar {
                rect: RectF::new(inner.x, y + 22.0, inner.w, 5.0),
                progress: (p.cpu_pct / 100.0).clamp(0.02, 1.0),
                track_color: ctx.pal.surface_chip,
                fill_color: ctx.pal.accent,
                interactive_action: None,
            });
        }
    }
    nodes
}

/// 17. Kontrol cepat: HANYA API publik stabil (Wi-Fi, Bluetooth, Mode Gelap, Bisukan Audio) (S, M)
pub fn build_quick_controls(ctx: &WidgetBuildCtx<'_>) -> Vec<SceneNode> {
    let en = is_english(ctx);
    let inner = ctx.frame.inset(16.0);
    let qc = &ctx.hub.quick_controls;
    let mut nodes = vec![crate::widgets::text_node_line(
        RectF::new(inner.x, inner.y, inner.w, 18.0),
        if en { "Quick Controls" } else { "Kontrol Cepat" },
        14.0,
        600,
        ctx.pal.primary,
        TextAlign::Left,
        false,
    )];

    let mut tiles: Vec<(&str, &str, &str, bool)> = Vec::new();
    if let Some(wifi) = qc.wifi_enabled {
        tiles.push(("\u{E701}", "Wi-Fi", "quick_toggle:wifi", wifi));
    }
    if let Some(bt) = qc.bluetooth_enabled {
        tiles.push(("\u{E702}", "Bluetooth", "quick_toggle:bluetooth", bt));
    }
    tiles.push((
        "\u{E708}",
        if en { "Dark Mode" } else { "Mode Gelap" },
        "quick_toggle:dark_mode",
        qc.dark_mode_enabled,
    ));
    if let Some(muted) = qc.audio_muted {
        tiles.push((
            if muted { "\u{E74F}" } else { "\u{E767}" },
            if muted {
                if en { "Muted" } else { "Bisukan" }
            } else {
                "Audio"
            },
            "quick_toggle:audio_mute",
            !muted,
        ));
    }

    let (cols, rows) = if ctx.size == WidgetSize::Small {
        (2, 2)
    } else {
        (tiles.len().clamp(2, 4), 1)
    };
    let gap = 8.0;
    let cw = (inner.w - gap * (cols as f32 - 1.0)) / cols as f32;
    let ch = ((inner.h - 26.0) - gap * (rows as f32 - 1.0)) / rows as f32;

    for (idx, (glyph, label, act, on)) in tiles.iter().take(cols * rows).enumerate() {
        let c = idx % cols;
        let r = idx / cols;
        let x = inner.x + c as f32 * (cw + gap);
        let y = inner.y + 24.0 + r as f32 * (ch + gap);
        let fill = if *on {
            ctx.pal.accent.with_alpha(0.26)
        } else {
            ctx.pal.surface_chip
        };
        let border = if *on {
            ctx.pal.accent.with_alpha(0.65)
        } else {
            ctx.pal
                .inner_border
                .map(|b| b.with_alpha(b.a * 0.65))
                .unwrap_or_else(|| ctx.pal.secondary.with_alpha(0.20))
        };
        nodes.push(SceneNode::RoundedRect {
            rect: RectF::new(x, y, cw, ch),
            radius: 16.0,
            smoothing: 0.65,
            fill: Some(fill),
            stroke: Some((border, 0.85)),
            interactive_action: Some((*act).to_string()),
        });
        let show_status = ch >= 54.0;
        let icon_y = if show_status {
            y + ch * 0.13
        } else {
            y + (ch * 0.12).max(3.0)
        };
        let icon_h = if show_status { 24.0 } else { (ch * 0.44).clamp(16.0, 20.0) };
        let icon_sz = if show_status { 18.0 } else { 14.5 };
        nodes.push(SceneNode::IconGlyph {
            rect: RectF::new(x, icon_y, cw, icon_h),
            glyph: (*glyph).to_string(),
            size: icon_sz,
            color: if *on {
                ctx.pal.primary
            } else {
                ctx.pal.secondary
            },
            interactive_action: Some((*act).to_string()),
        });
        let lbl_y = if show_status {
            y + ch * 0.50
        } else {
            (y + ch - 16.0).max(icon_y + icon_h - 1.0)
        };
        nodes.push(crate::widgets::text_node_line(
            RectF::new(x + 4.0, lbl_y, (cw - 8.0).max(16.0), 15.0),
            *label,
            if show_status { 11.5 } else { 10.0 },
            600,
            ctx.pal.primary,
            TextAlign::Center,
            false,
        ));
        if show_status {
            nodes.push(crate::widgets::text_node_line(
                RectF::new(x + 6.0, y + ch * 0.50 + 15.0, (cw - 12.0).max(16.0), 14.0),
                if *on {
                    if en { "On" } else { "Aktif" }
                } else if en {
                    "Off"
                } else {
                    "Mati"
                },
                10.0,
                500,
                if *on {
                    ctx.pal.accent
                } else {
                    ctx.pal.secondary
                },
                TextAlign::Center,
                false,
            ));
        }
    }
    nodes
}

fn srgb_relative_luminance(c: RgbaColor) -> f32 {
    let lin = |ch: u8| {
        let v = ch as f32 / 255.0;
        if v <= 0.03928 {
            v / 12.92
        } else {
            ((v + 0.055) / 1.055).powf(2.4)
        }
    };
    0.2126 * lin(c.r) + 0.7152 * lin(c.g) + 0.0722 * lin(c.b)
}

pub fn contrasting_tile_text(tile_bg: RgbaColor) -> RgbaColor {
    if tile_bg.a >= 0.45 && srgb_relative_luminance(tile_bg) > 0.36 {
        RgbaColor::new(17, 19, 24, 0.94)
    } else {
        RgbaColor::new(255, 255, 255, 0.96)
    }
}

pub fn format_storage_bytes(bytes: u64) -> String {
    const KB: f64 = 1024.0;
    const MB: f64 = 1024.0 * 1024.0;
    const GB: f64 = 1024.0 * 1024.0 * 1024.0;
    let b = bytes as f64;
    if b >= GB {
        format!("{:.1} GB", b / GB)
    } else if b >= 100.0 * MB {
        format!("{:.0} MB", b / MB)
    } else if b >= MB {
        format!("{:.1} MB", b / MB)
    } else if b >= KB {
        format!("{:.0} KB", b / KB)
    } else {
        "< 1 KB".to_string()
    }
}

/// 18. Peta penyimpanan (treemap) on-demand ber-cache (M, L)
pub fn build_storage_treemap(ctx: &WidgetBuildCtx<'_>) -> Vec<SceneNode> {
    let en = is_english(ctx);
    let Some(tm) = &ctx.hub.storage_treemap else {
        let inner = ctx.frame.inset(14.0);
        let mut nodes = vec![
            text_node(
                RectF::new(inner.x, inner.y, inner.w, 22.0),
                if en { "Storage Map" } else { "Peta Penyimpanan" },
                14.5,
                600,
                ctx.pal.primary,
                TextAlign::Left,
                false,
            ),
            text_node(
                RectF::new(inner.x, inner.y + 24.0, inner.w, 42.0),
                if en {
                    "Pick any folder or drive to map its largest subfolders on demand."
                } else {
                    "Pilih folder atau drive mana saja untuk memetakan subfolder terbesarnya."
                },
                12.0,
                400,
                ctx.pal.secondary,
                TextAlign::Left,
                false,
            ),
        ];
        let btn_w = ((inner.w - 8.0) * 0.5).clamp(84.0, 124.0);
        let btn_y = inner.y + inner.h - 30.0;
        nodes.extend(action_pill(
            RectF::new(inner.x, btn_y, btn_w, 28.0),
            if en { "Pick Folder" } else { "Pilih Folder" },
            ctx.pal.accent.with_alpha(0.26),
            ctx.pal.primary,
            "storage_pick_folder",
        ));
        nodes.extend(action_pill(
            RectF::new(inner.x + btn_w + 8.0, btn_y, btn_w, 28.0),
            if en { "Scan User" } else { "Pindai User" },
            ctx.pal.surface_chip,
            ctx.pal.primary,
            "trigger_storage_scan",
        ));
        return nodes;
    };
    let inner = ctx.frame.inset(14.0);
    let total_label = format_storage_bytes(tm.total_scanned_bytes);

    let scan_w = if tm.scanning { 76.0 } else { 58.0 };
    let folder_w = 60.0;
    let controls_w = folder_w + scan_w + 6.0;

    let mut nodes = vec![crate::widgets::text_node_line(
        RectF::new(inner.x, inner.y, (inner.w - controls_w - 6.0).max(60.0), 20.0),
        if en {
            format!("Storage Map ({})", total_label)
        } else {
            format!("Peta Penyimpanan ({})", total_label)
        },
        13.5,
        600,
        ctx.pal.primary,
        TextAlign::Left,
        true,
    )];
    nodes.extend(action_pill(
        RectF::new(
            inner.x + inner.w - controls_w,
            inner.y - 2.0,
            folder_w,
            22.0,
        ),
        "Folder",
        ctx.pal.surface_chip,
        ctx.pal.primary,
        "storage_pick_folder",
    ));
    nodes.extend(action_pill(
        RectF::new(inner.x + inner.w - scan_w, inner.y - 2.0, scan_w, 22.0),
        if tm.scanning {
            if en { "Scanning" } else { "Memindai" }
        } else if en {
            "Scan"
        } else {
            "Pindai"
        },
        ctx.pal.surface_chip,
        ctx.pal.primary,
        "trigger_storage_scan",
    ));

    let palette = if ctx.pal.is_monochrome {
        if srgb_relative_luminance(ctx.pal.primary) > 0.45 {
            [
                RgbaColor::new(252, 253, 255, 0.92),
                RgbaColor::new(230, 235, 244, 0.88),
                RgbaColor::new(206, 213, 226, 0.84),
                RgbaColor::new(182, 191, 208, 0.80),
                RgbaColor::new(158, 169, 189, 0.76),
                RgbaColor::new(136, 148, 170, 0.74),
            ]
        } else {
            [
                RgbaColor::new(24, 27, 35, 0.90),
                RgbaColor::new(38, 42, 54, 0.86),
                RgbaColor::new(52, 57, 72, 0.84),
                RgbaColor::new(66, 72, 90, 0.80),
                RgbaColor::new(82, 89, 108, 0.78),
                RgbaColor::new(98, 106, 126, 0.76),
            ]
        }
    } else {
        [
            ctx.pal.accent.with_alpha(0.84),
            ctx.pal.positive.with_alpha(0.84),
            RgbaColor::new(0xEC, 0x48, 0x99, 0.82),
            ctx.pal.warning.with_alpha(0.86),
            RgbaColor::new(0x8B, 0x5C, 0xF6, 0.82),
            ctx.pal.danger.with_alpha(0.82),
        ]
    };
    let tiles: Vec<(String, f32, RgbaColor)> = tm
        .items
        .iter()
        .take(6)
        .enumerate()
        .map(|(i, it)| {
            (
                format!("{}\n{}", it.name, format_storage_bytes(it.bytes)),
                it.share_pct.max(2.0),
                palette[i % palette.len()],
            )
        })
        .collect();

    let is_large = ctx.size == WidgetSize::Large;
    let treemap_h = if is_large {
        (inner.h - 134.0).max(96.0)
    } else {
        (inner.h - 48.0).max(58.0)
    };
    if tiles.is_empty() {
        nodes.push(text_node(
            RectF::new(inner.x, inner.y + 38.0, inner.w, 34.0),
            if tm.scanning {
                if en {
                    "Scanning folder..."
                } else {
                    "Memindai folder..."
                }
            } else if en {
                "No readable files found in this folder."
            } else {
                "Tidak ada berkas terbaca di folder ini."
            },
            12.0,
            500,
            ctx.pal.secondary,
            TextAlign::Left,
            false,
        ));
    } else {
        nodes.push(SceneNode::Treemap {
            rect: RectF::new(inner.x, inner.y + 26.0, inner.w, treemap_h),
            items: tiles,
            text_color: contrasting_tile_text(palette[0]),
        });
    }

    if is_large && !tm.items.is_empty() {
        let list_y = inner.y + 34.0 + treemap_h;
        for (i, it) in tm.items.iter().take(4).enumerate() {
            let y = list_y + i as f32 * 21.0;
            if y + 18.0 > inner.y + inner.h - 18.0 {
                break;
            }
            let dot_col = palette[i % palette.len()];
            nodes.push(SceneNode::RoundedRect {
                rect: RectF::new(inner.x, y + 4.0, 8.0, 8.0),
                radius: 3.0,
                smoothing: 0.4,
                fill: Some(dot_col),
                stroke: None,
                interactive_action: None,
            });
            nodes.push(crate::widgets::text_node_line(
                RectF::new(inner.x + 14.0, y, (inner.w - 118.0).max(60.0), 16.0),
                &it.name,
                11.5,
                600,
                ctx.pal.primary,
                TextAlign::Left,
                false,
            ));
            nodes.push(crate::widgets::text_node_line(
                RectF::new(inner.x + inner.w - 102.0, y, 62.0, 16.0),
                format_storage_bytes(it.bytes),
                11.0,
                500,
                ctx.pal.secondary,
                TextAlign::Right,
                true,
            ));
            nodes.push(crate::widgets::text_node_line(
                RectF::new(inner.x + inner.w - 38.0, y, 38.0, 16.0),
                format!("{:.0}%", it.share_pct),
                11.0,
                600,
                ctx.pal.primary,
                TextAlign::Right,
                true,
            ));
        }
    }

    nodes.push(SceneNode::Text {
        rect: RectF::new(inner.x, inner.y + inner.h - 16.0, inner.w, 16.0),
        content: format!("Folder: {}", tm.root_path),
        font_size: 10.5,
        font_weight: 500,
        color: ctx.pal.secondary,
        align: TextAlign::Left,
        tabular_nums: false,
        tight_kerning: false,
        max_lines: 1,
        interactive_action: Some("storage_pick_folder".to_string()),
    });
    nodes
}

fn format_duration_hm(total_secs: u64, en: bool) -> String {
    let hours = total_secs / 3600;
    let mins = (total_secs % 3600) / 60;
    if hours > 0 {
        if en {
            format!("{}h {}m", hours, mins)
        } else {
            format!("{}j {}m", hours, mins)
        }
    } else if en {
        format!("{}m", mins)
    } else {
        format!("{} mnt", mins)
    }
}

/// 32. Screen Time Harian: durasi layar aktif hari ini & aktivitas proses (M, L)
pub fn build_screen_time(ctx: &WidgetBuildCtx<'_>) -> Vec<SceneNode> {
    let en = is_english(ctx);
    let inner = ctx.frame.inset(16.0);
    let st = &ctx.hub.screen_time;
    let limit = if st.daily_limit_secs > 0 {
        st.daily_limit_secs
    } else {
        8 * 3600
    };
    let raw_ratio = st.today_secs as f32 / limit as f32;
    let ratio = raw_ratio.clamp(0.0, 1.0);

    let mut nodes = vec![
        SceneNode::IconGlyph {
            rect: RectF::new(inner.x + inner.w - 22.0, inner.y - 2.0, 22.0, 22.0),
            glyph: "\u{E7F4}".into(),
            size: 15.0,
            color: ctx.pal.secondary,
            interactive_action: None,
        },
        crate::widgets::text_node_line(
            RectF::new(inner.x, inner.y, inner.w - 26.0, 16.0),
            if en {
                "TODAY'S SCREEN TIME"
            } else {
                "SCREEN TIME HARI INI"
            },
            10.5,
            700,
            ctx.pal.secondary,
            TextAlign::Left,
            false,
        ),
        crate::widgets::text_node_line(
            RectF::new(inner.x, inner.y + 18.0, inner.w * 0.60, 44.0),
            format_duration_hm(st.today_secs, en),
            36.0,
            700,
            ctx.pal.primary,
            TextAlign::Left,
            true,
        ),
        crate::widgets::text_node_line(
            RectF::new(
                inner.x + inner.w * 0.60,
                inner.y + 34.0,
                inner.w * 0.40,
                18.0,
            ),
            if en {
                format!("Uptime {}", format_duration_hm(st.uptime_secs, en))
            } else {
                format!("Nyala {}", format_duration_hm(st.uptime_secs, en))
            },
            11.5,
            500,
            ctx.pal.secondary,
            TextAlign::Right,
            true,
        ),
        SceneNode::ProgressBar {
            rect: RectF::new(inner.x, inner.y + 68.0, inner.w, 6.5),
            progress: ratio,
            track_color: ctx.pal.surface_chip,
            fill_color: if ratio > 0.90 {
                ctx.pal.warning
            } else {
                ctx.pal.accent
            },
            interactive_action: None,
        },
        crate::widgets::text_node_line(
            RectF::new(inner.x, inner.y + 80.0, inner.w, 16.0),
            if en {
                format!(
                    "Daily limit {} ({:.0}%)",
                    format_duration_hm(limit, en),
                    raw_ratio * 100.0
                )
            } else {
                format!(
                    "Batas harian {} ({:.0}%)",
                    format_duration_hm(limit, en),
                    raw_ratio * 100.0
                )
            },
            11.0,
            500,
            ctx.pal.secondary,
            TextAlign::Left,
            true,
        ),
    ];

    if ctx.size == WidgetSize::Large {
        let mut y = inner.y + 112.0;
        nodes.push(crate::widgets::text_node_line(
            RectF::new(inner.x, y, inner.w, 16.0),
            if en {
                "ACTIVE PROCESSES NOW (READ-ONLY)"
            } else {
                "PROSES AKTIF SAAT INI (BACA-SAJA)"
            },
            10.5,
            700,
            ctx.pal.secondary,
            TextAlign::Left,
            false,
        ));
        y += 22.0;
        let max_y = inner.y + inner.h;
        for p in ctx.hub.top_processes.iter().take(4) {
            if y + 25.0 > max_y {
                break;
            }
            nodes.push(crate::widgets::text_node_line(
                RectF::new(inner.x, y, inner.w - 76.0, 16.0),
                &p.name,
                12.5,
                600,
                ctx.pal.primary,
                TextAlign::Left,
                false,
            ));
            nodes.push(text_node(
                RectF::new(inner.x + inner.w - 70.0, y, 70.0, 16.0),
                format!("{:.0} MB", p.ram_mb),
                11.5,
                500,
                ctx.pal.secondary,
                TextAlign::Right,
                true,
            ));
            nodes.push(SceneNode::ProgressBar {
                rect: RectF::new(inner.x, y + 19.0, inner.w, 5.0),
                progress: (p.cpu_pct / 100.0).clamp(0.04, 1.0),
                track_color: ctx.pal.surface_chip,
                fill_color: ctx.pal.positive,
                interactive_action: None,
            });
            y += 38.0;
        }
    }
    nodes
}
