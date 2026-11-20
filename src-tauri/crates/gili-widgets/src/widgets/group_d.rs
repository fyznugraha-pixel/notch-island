use crate::config::{RgbaColor, WidgetSize};
use crate::layout::{RectF, SceneNode, TextAlign};
use crate::widgets::{
    empty_state_nodes, indonesian_day_name, indonesian_month_name, local_datetime_parts,
    text_node, WidgetBuildCtx,
};

fn indonesian_number_word(n: u32) -> &'static str {
    match n {
        0 => "kosong",
        1 => "satu",
        2 => "dua",
        3 => "tiga",
        4 => "empat",
        5 => "lima",
        6 => "enam",
        7 => "tujuh",
        8 => "delapan",
        9 => "sembilan",
        10 => "sepuluh",
        11 => "sebelas",
        12 => "dua belas",
        15 => "seperempat",
        30 => "setengah",
        45 => "kurang seperempat",
        _ => "",
    }
}

pub fn format_indonesian_word_clock(hour24: u32, minute: u32) -> String {
    let h12 = if hour24 % 12 == 0 { 12 } else { hour24 % 12 };
    let next_h12 = if (hour24 + 1) % 12 == 0 {
        12
    } else {
        (hour24 + 1) % 12
    };
    let period = match hour24 {
        4..=10 => "pagi",
        11..=14 => "siang",
        15..=17 => "sore",
        _ => "malam",
    };

    match minute {
        0..=2 => format!("Tepat pukul {} {}", indonesian_number_word(h12), period),
        13..=17 => format!(
            "Pukul {} lewat seperempat {}",
            indonesian_number_word(h12),
            period
        ),
        28..=32 => format!("Setengah {} {}", indonesian_number_word(next_h12), period),
        43..=47 => format!(
            "Pukul {} kurang seperempat {}",
            indonesian_number_word(next_h12),
            period
        ),
        _ => format!("Pukul {} lewat {} menit", indonesian_number_word(h12), minute),
    }
}

/// 19. Jam bergaya: 8 gaya termasuk tipografi kata Bahasa Indonesia (S, M, L)
pub fn build_styled_clock(ctx: &WidgetBuildCtx<'_>) -> Vec<SceneNode> {
    let inner = ctx.frame.inset(14.0);
    let (_year, month, day, hour, min, sec, dow) = local_datetime_parts();
    let style = ctx
        .instance
        .settings
        .get("clock_style")
        .and_then(|v| v.as_str())
        .unwrap_or("minimal_digital");
    let show_sec = ctx
        .instance
        .settings
        .get("show_seconds")
        .and_then(|v| v.as_bool())
        .unwrap_or(false);

    let time_str = if show_sec {
        format!("{:02}:{:02}:{:02}", hour, min, sec)
    } else {
        format!("{:02}:{:02}", hour, min)
    };
    let date_str = format!(
        "{}, {} {}",
        indonesian_day_name(dow),
        day,
        indonesian_month_name(month)
    );

    let hour_deg = ((hour % 12) as f32 + min as f32 / 60.0) * 30.0;
    let minute_deg = (min as f32 + sec as f32 / 60.0) * 6.0;
    let second_deg = if show_sec { Some(sec as f32 * 6.0) } else { None };

    match style {
        // Gaya 1: Tipografi kata Bahasa Indonesia
        "kata_indonesia" => vec![
            text_node(
                RectF::new(inner.x, inner.y, inner.w, 16.0),
                date_str.to_uppercase(),
                10.5,
                700,
                ctx.pal.accent,
                TextAlign::Left,
                false,
            ),
            text_node(
                RectF::new(inner.x, inner.y + 20.0, inner.w, inner.h - 42.0),
                format_indonesian_word_clock(hour, min),
                if ctx.size == WidgetSize::Small { 20.0 } else { 26.0 },
                700,
                ctx.pal.primary,
                TextAlign::Left,
                false,
            ),
            text_node(
                RectF::new(inner.x, inner.y + inner.h - 18.0, inner.w, 16.0),
                time_str,
                12.0,
                500,
                ctx.pal.secondary,
                TextAlign::Left,
                true,
            ),
        ],
        // Gaya 2 & 3: Analog Klasik & Analog Rangka (Skeleton)
        "analog_classic" | "analog_skeleton" => {
            let skeleton = style == "analog_skeleton";
            let radius = (inner.h.min(inner.w) * 0.44).clamp(42.0, 120.0);
            let cx = if ctx.size == WidgetSize::Medium {
                inner.x + radius + 8.0
            } else {
                inner.x + inner.w * 0.5
            };
            let cy = inner.y + inner.h * 0.5;
            let mut nodes = vec![SceneNode::AnalogClock {
                cx,
                cy,
                radius,
                hour_deg,
                minute_deg,
                second_deg,
                skeleton,
                dial_color: ctx.pal.secondary,
                hand_color: ctx.pal.primary,
                accent_color: ctx.pal.accent,
            }];
            if ctx.size == WidgetSize::Medium {
                let rx = cx + radius + 18.0;
                let rw = (inner.x + inner.w - rx).max(80.0);
                nodes.push(text_node(
                    RectF::new(rx, inner.y + 28.0, rw, 38.0),
                    time_str,
                    32.0,
                    700,
                    ctx.pal.primary,
                    TextAlign::Left,
                    true,
                ));
                nodes.push(text_node(
                    RectF::new(rx, inner.y + 72.0, rw, 22.0),
                    date_str,
                    12.5,
                    500,
                    ctx.pal.secondary,
                    TextAlign::Left,
                    false,
                ));
            }
            nodes
        }
        // Gaya 4: Tumpuk Vertikal (Stacked)
        "stacked_bold" => vec![
            text_node(
                RectF::new(inner.x, inner.y + 2.0, inner.w, 50.0),
                format!("{:02}", hour),
                44.0,
                800,
                ctx.pal.primary,
                TextAlign::Center,
                true,
            ),
            text_node(
                RectF::new(inner.x, inner.y + 48.0, inner.w, 50.0),
                format!("{:02}", min),
                44.0,
                800,
                ctx.pal.accent,
                TextAlign::Center,
                true,
            ),
            text_node(
                RectF::new(inner.x, inner.y + inner.h - 20.0, inner.w, 16.0),
                date_str,
                11.5,
                500,
                ctx.pal.secondary,
                TextAlign::Center,
                false,
            ),
        ],
        // Gaya 5: Flip Retro
        "retro_flip" => {
            let box_w = (inner.w * 0.44).min(120.0);
            let box_h = (inner.h * 0.62).min(96.0);
            let top = inner.y + 10.0;
            let gap = 10.0;
            let start_x = inner.x + (inner.w - (box_w * 2.0 + gap)) * 0.5;
            vec![
                SceneNode::RoundedRect {
                    rect: RectF::new(start_x, top, box_w, box_h),
                    radius: 14.0,
                    smoothing: 0.5,
                    fill: Some(ctx.pal.surface_chip),
                    stroke: Some((ctx.pal.secondary.with_alpha(0.22), 1.0)),
                    interactive_action: None,
                },
                SceneNode::RoundedRect {
                    rect: RectF::new(start_x + box_w + gap, top, box_w, box_h),
                    radius: 14.0,
                    smoothing: 0.5,
                    fill: Some(ctx.pal.surface_chip),
                    stroke: Some((ctx.pal.secondary.with_alpha(0.22), 1.0)),
                    interactive_action: None,
                },
                text_node(
                    RectF::new(start_x, top + box_h * 0.22, box_w, 48.0),
                    format!("{:02}", hour),
                    38.0,
                    700,
                    ctx.pal.primary,
                    TextAlign::Center,
                    true,
                ),
                text_node(
                    RectF::new(start_x + box_w + gap, top + box_h * 0.22, box_w, 48.0),
                    format!("{:02}", min),
                    38.0,
                    700,
                    ctx.pal.accent,
                    TextAlign::Center,
                    true,
                ),
                text_node(
                    RectF::new(inner.x, inner.y + inner.h - 20.0, inner.w, 16.0),
                    date_str,
                    11.5,
                    500,
                    ctx.pal.secondary,
                    TextAlign::Center,
                    false,
                ),
            ]
        }
        // Gaya 6: Editorial Tipis, Gaya 7: Jam Dunia Ganda, Gaya 8 (default): Minimal Digital
        "editorial_thin" => vec![
            text_node(
                RectF::new(inner.x, inner.y + 8.0, inner.w, 54.0),
                time_str,
                44.0,
                300,
                ctx.pal.primary,
                TextAlign::Left,
                true,
            ),
            SceneNode::Line {
                x1: inner.x,
                y1: inner.y + 68.0,
                x2: inner.x + inner.w * 0.45,
                y2: inner.y + 68.0,
                color: ctx.pal.accent,
                width: 2.0,
            },
            text_node(
                RectF::new(inner.x, inner.y + 78.0, inner.w, 20.0),
                date_str,
                13.0,
                500,
                ctx.pal.secondary,
                TextAlign::Left,
                false,
            ),
        ],
        "dual_zone" => {
            let utc_hour = (hour + 24 - 7) % 24;
            vec![
                text_node(
                    RectF::new(inner.x, inner.y, inner.w, 16.0),
                    "WIB (LOKAL)",
                    10.5,
                    700,
                    ctx.pal.accent,
                    TextAlign::Left,
                    false,
                ),
                text_node(
                    RectF::new(inner.x, inner.y + 14.0, inner.w, 46.0),
                    time_str,
                    38.0,
                    700,
                    ctx.pal.primary,
                    TextAlign::Left,
                    true,
                ),
                text_node(
                    RectF::new(inner.x, inner.y + 68.0, inner.w, 18.0),
                    format!("UTC  {:02}:{:02}", utc_hour, min),
                    14.0,
                    600,
                    ctx.pal.secondary,
                    TextAlign::Left,
                    true,
                ),
                text_node(
                    RectF::new(inner.x, inner.y + inner.h - 18.0, inner.w, 16.0),
                    date_str,
                    11.5,
                    400,
                    ctx.pal.secondary,
                    TextAlign::Left,
                    false,
                ),
            ]
        }
        _ => vec![
            text_node(
                RectF::new(inner.x, inner.y + 6.0, inner.w, 54.0),
                time_str,
                44.0,
                700,
                ctx.pal.primary,
                TextAlign::Left,
                true,
            ),
            text_node(
                RectF::new(inner.x, inner.y + 60.0, inner.w, 20.0),
                date_str,
                13.5,
                500,
                ctx.pal.secondary,
                TextAlign::Left,
                false,
            ),
        ],
    }
}

/// 20. Bingkai foto / polaroid: baca-saja dari folder pilihan pengguna, EXIF (S, M, L)
pub fn build_photo_frame(ctx: &WidgetBuildCtx<'_>) -> Vec<SceneNode> {
    let pf = &ctx.hub.photo_frame;
    if pf.folder_path.as_deref().unwrap_or("").is_empty() || pf.photos.is_empty() {
        return empty_state_nodes(
            ctx,
            "Bingkai Foto",
            "Pilih folder foto lokal untuk slideshow baca-saja dengan rotasi EXIF otomatis.",
            "Pilih Folder",
            "open_widget_settings",
        );
    }
    let idx = pf.current_index % pf.photos.len();
    let path = &pf.photos[idx];
    let polaroid = ctx
        .instance
        .settings
        .get("polaroid")
        .and_then(|v| v.as_bool())
        .unwrap_or(true);

    let pad = if polaroid { 10.0 } else { 4.0 };
    let bottom_extra = if polaroid { 28.0 } else { 4.0 };
    let img_rect = RectF::new(
        ctx.frame.x + pad,
        ctx.frame.y + pad,
        (ctx.frame.w - pad * 2.0).max(20.0),
        (ctx.frame.h - pad - bottom_extra).max(20.0),
    );

    let mut nodes = vec![SceneNode::ImageRef {
        rect: img_rect,
        radius: 16.0,
        source_path: path.clone(),
    }];
    if polaroid {
        let name = std::path::Path::new(path)
            .file_stem()
            .and_then(|s| s.to_str())
            .unwrap_or("Kenangan");
        nodes.push(text_node(
            RectF::new(
                ctx.frame.x + 12.0,
                ctx.frame.y + ctx.frame.h - 24.0,
                ctx.frame.w - 24.0,
                18.0,
            ),
            name,
            11.5,
            500,
            ctx.pal.primary,
            TextAlign::Center,
            false,
        ));
    }
    nodes
}

/// 21. Maskot hidup orisinal Gili (vektor Direct2D 8-10 fps ringan; catatan aset desainer di LAPORAN) (S, M)
pub fn build_live_mascot(ctx: &WidgetBuildCtx<'_>) -> Vec<SceneNode> {
    let inner = ctx.frame.inset(14.0);
    let (_, _, _, hour, _, _, _) = local_datetime_parts();
    let bob = (ctx.elapsed_secs * 2.6).sin() * 4.5;
    let blink = ((ctx.elapsed_secs * 0.55) % 4.0) > 3.85;

    let cx = inner.x + inner.w * 0.5;
    let cy = inner.y + inner.h * 0.44 + bob;
    let body = RectF::new(cx - 34.0, cy - 26.0, 68.0, 52.0);
    let mood = match hour {
        5..=10 => "Selamat pagi! Semangat hari ini.",
        11..=14 => "Tetap fokus, jangan lupa minum.",
        15..=18 => "Sore santai bersama Gili.",
        _ => "Malam tenang, istirahat cukup ya.",
    };

    let mut nodes = vec![
        // Orisinal Gili Spirit (kapsul pulau ramah, placeholder vektor sebelum aset sprite desainer)
        SceneNode::RoundedRect {
            rect: body,
            radius: 26.0,
            smoothing: 0.65,
            fill: Some(ctx.pal.accent.with_alpha(0.88)),
            stroke: Some((RgbaColor::new(255, 255, 255, 0.25), 1.5)),
            interactive_action: Some("mascot_poke".to_string()),
        },
        // Mata kiri & kanan
        SceneNode::RoundedRect {
            rect: RectF::new(cx - 14.0, cy - 6.0, 8.0, if blink { 2.0 } else { 10.0 }),
            radius: 4.0,
            smoothing: 0.0,
            fill: Some(RgbaColor::new(255, 255, 255, 0.96)),
            stroke: None,
            interactive_action: None,
        },
        SceneNode::RoundedRect {
            rect: RectF::new(cx + 6.0, cy - 6.0, 8.0, if blink { 2.0 } else { 10.0 }),
            radius: 4.0,
            smoothing: 0.0,
            fill: Some(RgbaColor::new(255, 255, 255, 0.96)),
            stroke: None,
            interactive_action: None,
        },
        text_node(
            RectF::new(inner.x, inner.y + inner.h - 32.0, inner.w, 30.0),
            mood,
            11.5,
            500,
            ctx.pal.primary,
            TextAlign::Center,
            false,
        ),
    ];

    if ctx.size == WidgetSize::Medium {
        nodes.push(text_node(
            RectF::new(inner.x, inner.y, inner.w, 16.0),
            "MASKOT GILI",
            10.5,
            700,
            ctx.pal.secondary,
            TextAlign::Left,
            false,
        ));
    }
    nodes
}

/// 22. Visualizer: audio sistem via WASAPI loopback + FFT ringan (M)
pub fn build_audio_visualizer(ctx: &WidgetBuildCtx<'_>) -> Vec<SceneNode> {
    let inner = ctx.frame.inset(14.0);
    let bands = ctx.hub.audio_bands;
    let peak = bands.iter().copied().fold(0.0f32, f32::max);
    let title = if ctx.hub.media.title.is_empty() {
        "Spektrum Audio Sistem"
    } else {
        &ctx.hub.media.title
    };

    let colors: Vec<RgbaColor> = (0..16)
        .map(|i| {
            let t = i as f32 / 15.0;
            RgbaColor::new(
                (ctx.pal.accent.r as f32 * (1.0 - t) + ctx.pal.positive.r as f32 * t) as u8,
                (ctx.pal.accent.g as f32 * (1.0 - t) + ctx.pal.positive.g as f32 * t) as u8,
                (ctx.pal.accent.b as f32 * (1.0 - t) + ctx.pal.positive.b as f32 * t) as u8,
                0.92,
            )
        })
        .collect();

    vec![
        text_node(
            RectF::new(inner.x, inner.y, inner.w - 72.0, 18.0),
            title,
            13.5,
            600,
            ctx.pal.primary,
            TextAlign::Left,
            false,
        ),
        text_node(
            RectF::new(inner.x + inner.w - 70.0, inner.y + 1.0, 70.0, 16.0),
            if peak > 0.04 { "WASAPI" } else { "Hening" },
            10.5,
            600,
            if peak > 0.04 { ctx.pal.positive } else { ctx.pal.secondary },
            TextAlign::Right,
            false,
        ),
        SceneNode::BarChart {
            rect: RectF::new(inner.x, inner.y + 28.0, inner.w, inner.h - 32.0),
            values: bands.to_vec(),
            colors,
            gap: 4.0,
        },
    ]
}

/// 23. Poster kutipan: tipografi kutipan harian atau teks sendiri (S, M, L)
pub fn build_quote_poster(ctx: &WidgetBuildCtx<'_>) -> Vec<SceneNode> {
    let inner = ctx.frame.inset(16.0);
    let q = &ctx.hub.frontend.quote;
    let body = q
        .custom_text
        .as_deref()
        .filter(|s| !s.trim().is_empty())
        .or_else(|| if q.text.trim().is_empty() { None } else { Some(q.text.as_str()) })
        .unwrap_or("Langkah kecil yang konsisten selalu mengalahkan rencana besar yang ditunda.");
    let author = if q.author.trim().is_empty() {
        "Kutipan Harian Gili"
    } else {
        &q.author
    };

    let font_sz = match ctx.size {
        WidgetSize::Small => 14.0,
        WidgetSize::Medium => 16.5,
        WidgetSize::Large => 22.0,
    };

    vec![
        SceneNode::Line {
            x1: inner.x,
            y1: inner.y + 4.0,
            x2: inner.x + 28.0,
            y2: inner.y + 4.0,
            color: ctx.pal.accent,
            width: 2.5,
        },
        text_node(
            RectF::new(inner.x, inner.y + 16.0, inner.w, inner.h - 42.0),
            format!("\"{}\"", body),
            font_sz,
            600,
            ctx.pal.primary,
            TextAlign::Left,
            false,
        ),
        text_node(
            RectF::new(inner.x, inner.y + inner.h - 18.0, inner.w, 16.0),
            author,
            11.5,
            500,
            ctx.pal.secondary,
            TextAlign::Left,
            false,
        ),
    ]
}

/// 33. Jam Dunia Multi-Zona: hingga 4 kota dunia sekaligus dengan indikator siang/malam (M, L)
pub fn build_world_clock(ctx: &WidgetBuildCtx<'_>) -> Vec<SceneNode> {
    let inner = ctx.frame.inset(14.0);
    let (utc_h, utc_m) = crate::widgets::utc_hour_minute();
    let utc_total = (utc_h * 60 + utc_m) as i32;
    let defaults = crate::providers::local_stores::default_world_clocks();
    let zones = if ctx.hub.world_clocks.is_empty() {
        &defaults
    } else {
        &ctx.hub.world_clocks
    };

    let mut nodes = vec![text_node(
        RectF::new(inner.x, inner.y, inner.w, 18.0),
        "JAM DUNIA",
        10.5,
        700,
        ctx.pal.accent,
        TextAlign::Left,
        false,
    )];

    if ctx.size == WidgetSize::Medium {
        let count = zones.len().clamp(1, 4);
        let gap = 8.0;
        let cw = (inner.w - gap * (count as f32 - 1.0)) / count as f32;
        for (i, z) in zones.iter().take(count).enumerate() {
            let local_m = (utc_total + z.utc_offset_minutes).rem_euclid(24 * 60);
            let hh = local_m / 60;
            let mm = local_m % 60;
            let is_day = (6..18).contains(&hh);
            let x = inner.x + i as f32 * (cw + gap);
            let y = inner.y + 24.0;
            let h = inner.h - 26.0;

            nodes.push(SceneNode::RoundedRect {
                rect: RectF::new(x, y, cw, h),
                radius: 14.0,
                smoothing: 0.55,
                fill: Some(ctx.pal.surface_chip),
                stroke: None,
                interactive_action: None,
            });
            nodes.push(SceneNode::IconGlyph {
                rect: RectF::new(x, y + 10.0, cw, 18.0),
                glyph: if is_day { "\u{E706}".into() } else { "\u{E708}".into() },
                size: 14.0,
                color: if is_day { ctx.pal.warning } else { ctx.pal.accent },
                interactive_action: None,
            });
            nodes.push(text_node(
                RectF::new(x + 4.0, y + 32.0, cw - 8.0, 26.0),
                format!("{:02}:{:02}", hh, mm),
                19.0,
                700,
                ctx.pal.primary,
                TextAlign::Center,
                true,
            ));
            nodes.push(text_node(
                RectF::new(x + 4.0, y + 60.0, cw - 8.0, 16.0),
                &z.city,
                11.0,
                600,
                ctx.pal.primary,
                TextAlign::Center,
                false,
            ));
            nodes.push(text_node(
                RectF::new(x + 4.0, y + 76.0, cw - 8.0, 14.0),
                &z.code,
                10.0,
                500,
                ctx.pal.secondary,
                TextAlign::Center,
                false,
            ));
        }
    } else {
        for (i, z) in zones.iter().take(4).enumerate() {
            let local_m = (utc_total + z.utc_offset_minutes).rem_euclid(24 * 60);
            let hh = local_m / 60;
            let mm = local_m % 60;
            let is_day = (6..18).contains(&hh);
            let off_h = z.utc_offset_minutes as f32 / 60.0;
            let off_str = if off_h >= 0.0 {
                format!("UTC+{:.0}", off_h)
            } else {
                format!("UTC{:.0}", off_h)
            };
            let y = inner.y + 28.0 + i as f32 * 66.0;
            nodes.push(SceneNode::RoundedRect {
                rect: RectF::new(inner.x, y, inner.w, 56.0),
                radius: 14.0,
                smoothing: 0.55,
                fill: Some(ctx.pal.surface_chip),
                stroke: None,
                interactive_action: None,
            });
            nodes.push(SceneNode::IconGlyph {
                rect: RectF::new(inner.x + 12.0, y + 18.0, 20.0, 20.0),
                glyph: if is_day { "\u{E706}".into() } else { "\u{E708}".into() },
                size: 16.0,
                color: if is_day { ctx.pal.warning } else { ctx.pal.accent },
                interactive_action: None,
            });
            nodes.push(text_node(
                RectF::new(inner.x + 40.0, y + 10.0, inner.w - 140.0, 20.0),
                &z.city,
                14.5,
                600,
                ctx.pal.primary,
                TextAlign::Left,
                false,
            ));
            nodes.push(text_node(
                RectF::new(inner.x + 40.0, y + 30.0, inner.w - 140.0, 16.0),
                format!("{} . {}", z.code, off_str),
                11.0,
                500,
                ctx.pal.secondary,
                TextAlign::Left,
                false,
            ));
            nodes.push(text_node(
                RectF::new(inner.x + inner.w - 96.0, y + 11.0, 84.0, 34.0),
                format!("{:02}:{:02}", hh, mm),
                26.0,
                700,
                ctx.pal.primary,
                TextAlign::Right,
                true,
            ));
        }
    }
    nodes
}
