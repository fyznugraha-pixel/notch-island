use crate::config::{RgbaColor, WidgetSize};
use crate::layout::{RectF, SceneNode, TextAlign};
use crate::widgets::{action_pill, empty_state_nodes, text_node, WidgetBuildCtx};

/// 16. Proses teratas: 5 proses paling boros CPU/RAM, HANYA-BACA tanpa tombol akhiri proses (M, L)
pub fn build_top_processes(ctx: &WidgetBuildCtx<'_>) -> Vec<SceneNode> {
    let procs = &ctx.hub.top_processes;
    if procs.is_empty() {
        return empty_state_nodes(
            ctx,
            "Proses Teratas",
            "Sedang mengumpulkan sampel pemakaian CPU dan RAM proses (hanya-baca).",
            "Segarkan",
            "refresh_processes",
        );
    }
    let inner = ctx.frame.inset(14.0);
    let mut nodes = vec![
        text_node(
            RectF::new(inner.x, inner.y, inner.w * 0.65, 20.0),
            "Proses Teratas",
            15.0,
            600,
            ctx.pal.primary,
            TextAlign::Left,
            false,
        ),
        text_node(
            RectF::new(inner.x + inner.w * 0.65, inner.y + 2.0, inner.w * 0.35, 16.0),
            "Hanya-baca",
            11.0,
            500,
            ctx.pal.secondary,
            TextAlign::Right,
            false,
        ),
    ];

    let max_rows = if ctx.size == WidgetSize::Large { 5 } else { 3 };
    let row_h = if ctx.size == WidgetSize::Large { 52.0 } else { 32.0 };
    for (i, p) in procs.iter().take(max_rows).enumerate() {
        let y = inner.y + 28.0 + i as f32 * row_h;
        nodes.push(text_node(
            RectF::new(inner.x, y, inner.w - 118.0, 18.0),
            &p.name,
            12.5,
            600,
            ctx.pal.primary,
            TextAlign::Left,
            false,
        ));
        nodes.push(text_node(
            RectF::new(inner.x + inner.w - 116.0, y, 52.0, 18.0),
            format!("{:.1}%", p.cpu_pct),
            12.0,
            600,
            ctx.pal.accent,
            TextAlign::Right,
            true,
        ));
        nodes.push(text_node(
            RectF::new(inner.x + inner.w - 60.0, y, 60.0, 18.0),
            format!("{:.0} MB", p.ram_mb),
            11.5,
            500,
            ctx.pal.secondary,
            TextAlign::Right,
            true,
        ));
        if ctx.size == WidgetSize::Large {
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
    let inner = ctx.frame.inset(14.0);
    let qc = &ctx.hub.quick_controls;
    let mut nodes = vec![text_node(
        RectF::new(inner.x, inner.y, inner.w, 18.0),
        "Kontrol Cepat",
        14.0,
        600,
        ctx.pal.primary,
        TextAlign::Left,
        false,
    )];

    let mut tiles: Vec<(&str, &str, bool)> = Vec::new();
    if let Some(wifi) = qc.wifi_enabled {
        tiles.push(("Wi-Fi", "quick_toggle:wifi", wifi));
    }
    if let Some(bt) = qc.bluetooth_enabled {
        tiles.push(("Bluetooth", "quick_toggle:bluetooth", bt));
    }
    tiles.push(("Mode Gelap", "quick_toggle:dark_mode", qc.dark_mode_enabled));
    if let Some(muted) = qc.audio_muted {
        tiles.push((
            if muted { "Bisukan Aktif" } else { "Audio Aktif" },
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
    let ch = ((inner.h - 28.0) - gap * (rows as f32 - 1.0)) / rows as f32;

    for (idx, (label, act, on)) in tiles.iter().take(cols * rows).enumerate() {
        let c = idx % cols;
        let r = idx / cols;
        let x = inner.x + c as f32 * (cw + gap);
        let y = inner.y + 26.0 + r as f32 * (ch + gap);
        let fill = if *on {
            ctx.pal.accent.with_alpha(0.28)
        } else {
            ctx.pal.surface_chip
        };
        nodes.push(SceneNode::RoundedRect {
            rect: RectF::new(x, y, cw, ch),
            radius: 14.0,
            smoothing: 0.55,
            fill: Some(fill),
            stroke: Some((
                if *on {
                    ctx.pal.accent.with_alpha(0.70)
                } else {
                    ctx.pal.secondary.with_alpha(0.18)
                },
                1.0,
            )),
            interactive_action: Some((*act).to_string()),
        });
        nodes.push(text_node(
            RectF::new(x + 6.0, y + ch * 0.30, cw - 12.0, 18.0),
            *label,
            12.0,
            600,
            ctx.pal.primary,
            TextAlign::Center,
            false,
        ));
        nodes.push(text_node(
            RectF::new(x + 6.0, y + ch * 0.30 + 18.0, cw - 12.0, 14.0),
            if *on { "Aktif" } else { "Mati" },
            10.5,
            500,
            if *on { ctx.pal.accent } else { ctx.pal.secondary },
            TextAlign::Center,
            false,
        ));
    }
    nodes
}

/// 18. Peta penyimpanan (treemap) on-demand ber-cache (M, L)
pub fn build_storage_treemap(ctx: &WidgetBuildCtx<'_>) -> Vec<SceneNode> {
    let Some(tm) = &ctx.hub.storage_treemap else {
        return empty_state_nodes(
            ctx,
            "Peta Penyimpanan",
            "Pemindaian folder dijalankan sesuai permintaan agar disk tetap hemat.",
            "Pindai Folder",
            "trigger_storage_scan",
        );
    };
    let inner = ctx.frame.inset(14.0);
    let total_gb = tm.total_scanned_bytes as f64 / (1024.0 * 1024.0 * 1024.0);

    let mut nodes = vec![
        text_node(
            RectF::new(inner.x, inner.y, inner.w - 76.0, 18.0),
            format!("Peta Penyimpanan ({:.1} GB)", total_gb),
            13.5,
            600,
            ctx.pal.primary,
            TextAlign::Left,
            true,
        ),
    ];
    nodes.extend(action_pill(
        RectF::new(inner.x + inner.w - 72.0, inner.y - 2.0, 72.0, 22.0),
        if tm.scanning { "Memindai" } else { "Pindai" },
        ctx.pal.surface_chip,
        ctx.pal.primary,
        "trigger_storage_scan",
    ));

    let palette = [
        ctx.pal.accent.with_alpha(0.75),
        ctx.pal.positive.with_alpha(0.75),
        RgbaColor::new(0xEC, 0x48, 0x99, 0.72),
        ctx.pal.warning.with_alpha(0.75),
        RgbaColor::new(0x8B, 0x5C, 0xF6, 0.72),
        ctx.pal.danger.with_alpha(0.72),
    ];
    let tiles: Vec<(String, f32, RgbaColor)> = tm
        .items
        .iter()
        .take(6)
        .enumerate()
        .map(|(i, it)| {
            let gb = it.bytes as f64 / (1024.0 * 1024.0 * 1024.0);
            (
                format!("{}\n{:.1} GB", it.name, gb),
                it.share_pct.max(2.0),
                palette[i % palette.len()],
            )
        })
        .collect();

    let treemap_h = if ctx.size == WidgetSize::Large {
        inner.h - 104.0
    } else {
        inner.h - 46.0
    };
    nodes.push(SceneNode::Treemap {
        rect: RectF::new(inner.x, inner.y + 26.0, inner.w, treemap_h.max(60.0)),
        items: tiles,
        text_color: RgbaColor::new(255, 255, 255, 0.95),
    });

    nodes.push(text_node(
        RectF::new(inner.x, inner.y + inner.h - 15.0, inner.w, 15.0),
        format!("Folder: {}", tm.root_path),
        10.5,
        400,
        ctx.pal.secondary,
        TextAlign::Left,
        false,
    ));
    nodes
}
