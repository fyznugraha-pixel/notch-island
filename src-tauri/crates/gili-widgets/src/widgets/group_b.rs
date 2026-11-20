use crate::config::{RgbaColor, WidgetSize};
use crate::layout::{RectF, SceneNode, TextAlign};
use crate::widgets::{action_pill, empty_state_nodes, text_node, WidgetBuildCtx};

/// 9. Catatan tempel: banyak catatan, warna, checklist (S, M, L)
pub fn build_sticky_notes(ctx: &WidgetBuildCtx<'_>) -> Vec<SceneNode> {
    let inner = ctx.frame.inset(14.0);
    let notes = &ctx.hub.notes;
    if notes.is_empty() {
        return empty_state_nodes(
            ctx,
            "Catatan Tempel",
            "Belum ada catatan. Ketuk Tulis untuk membuka editor native.",
            "Tulis Catatan",
            "inline_edit:sticky_notes",
        );
    }
    let note = &notes[0];
    let badge_col = if ctx.pal.is_monochrome {
        ctx.pal.accent
    } else {
        match note.color.as_str() {
            "mint" => RgbaColor::new(0x5E, 0xEA, 0xD4, 1.0),
            "amber" => RgbaColor::new(0xFB, 0xBF, 0x24, 1.0),
            "coral" => RgbaColor::new(0xF8, 0x71, 0x71, 1.0),
            _ => ctx.pal.accent,
        }
    };

    let mut nodes = vec![
        SceneNode::Line {
            x1: inner.x,
            y1: inner.y + 4.0,
            x2: inner.x,
            y2: inner.y + 20.0,
            color: badge_col,
            width: 3.0,
        },
        text_node(
            RectF::new(inner.x + 8.0, inner.y, inner.w - 64.0, 20.0),
            if note.title.is_empty() {
                "Catatan"
            } else {
                &note.title
            },
            15.0,
            600,
            ctx.pal.primary,
            TextAlign::Left,
            false,
        ),
        text_node(
            RectF::new(inner.x + inner.w - 52.0, inner.y + 2.0, 52.0, 16.0),
            format!("{} catatan", notes.len()),
            11.0,
            500,
            ctx.pal.secondary,
            TextAlign::Right,
            true,
        ),
    ];

    if note.is_checklist && !note.checklist.is_empty() {
        let max_items = if ctx.size == WidgetSize::Large { 7 } else { 3 };
        for (i, item) in note.checklist.iter().take(max_items).enumerate() {
            let y = inner.y + 28.0 + i as f32 * 24.0;
            let mark = if item.checked { "☑" } else { "☐" };
            nodes.push(text_node(
                RectF::new(inner.x, y, inner.w, 20.0),
                format!("{} {}", mark, item.text),
                12.5,
                500,
                if item.checked {
                    ctx.pal.secondary
                } else {
                    ctx.pal.primary
                },
                TextAlign::Left,
                false,
            ));
        }
    } else {
        nodes.push(text_node(
            RectF::new(inner.x, inner.y + 28.0, inner.w, inner.h - 62.0),
            &note.content,
            13.0,
            400,
            ctx.pal.primary,
            TextAlign::Left,
            false,
        ));
    }

    nodes.extend(action_pill(
        RectF::new(inner.x, inner.y + inner.h - 26.0, 96.0, 24.0),
        "+ Tambah",
        ctx.pal.surface_chip,
        ctx.pal.primary,
        "inline_edit:sticky_notes",
    ));
    nodes
}

/// 10. Kanban mini 3 kolom, seret antar kolom (L)
pub fn build_mini_kanban(ctx: &WidgetBuildCtx<'_>) -> Vec<SceneNode> {
    let inner = ctx.frame.inset(14.0);
    let kb = &ctx.hub.kanban;
    let mut nodes = vec![text_node(
        RectF::new(inner.x, inner.y, inner.w - 90.0, 20.0),
        "Kanban Mini",
        15.0,
        600,
        ctx.pal.primary,
        TextAlign::Left,
        false,
    )];
    nodes.extend(action_pill(
        RectF::new(inner.x + inner.w - 86.0, inner.y - 2.0, 86.0, 24.0),
        "+ Kartu",
        ctx.pal.accent.with_alpha(0.24),
        ctx.pal.primary,
        "inline_edit:mini_kanban",
    ));

    let cols = [
        ("Akan", &kb.todo, ctx.pal.secondary),
        ("Proses", &kb.doing, ctx.pal.accent),
        ("Selesai", &kb.done, ctx.pal.positive),
    ];
    let gap = 8.0;
    let col_w = (inner.w - gap * 2.0) / 3.0;
    let top_y = inner.y + 30.0;

    for (ci, (title, cards, tint)) in cols.iter().enumerate() {
        let x = inner.x + ci as f32 * (col_w + gap);
        nodes.push(text_node(
            RectF::new(x, top_y, col_w, 16.0),
            format!("{} ({})", title, cards.len()),
            11.0,
            700,
            *tint,
            TextAlign::Left,
            true,
        ));
        if cards.is_empty() {
            nodes.push(text_node(
                RectF::new(x, top_y + 24.0, col_w, 28.0),
                "Kosong",
                11.0,
                400,
                ctx.pal.secondary,
                TextAlign::Left,
                false,
            ));
        } else {
            for (ri, card) in cards.iter().take(4).enumerate() {
                let cy = top_y + 22.0 + ri as f32 * 52.0;
                if cy + 44.0 > inner.y + inner.h {
                    break;
                }
                let next_col = match ci {
                    0 => "doing",
                    1 => "done",
                    _ => "todo",
                };
                nodes.push(SceneNode::RoundedRect {
                    rect: RectF::new(x, cy, col_w, 44.0),
                    radius: 10.0,
                    smoothing: 0.5,
                    fill: Some(ctx.pal.surface_chip),
                    stroke: Some((tint.with_alpha(0.35), 1.0)),
                    interactive_action: Some(format!("kanban_move:{}:{}", card.id, next_col)),
                });
                nodes.push(text_node(
                    RectF::new(x + 6.0, cy + 6.0, col_w - 12.0, 32.0),
                    &card.title,
                    11.5,
                    500,
                    ctx.pal.primary,
                    TextAlign::Left,
                    false,
                ));
            }
        }
    }
    nodes
}

/// 11. Pelacak waktu per proyek, mulai/berhenti, ekspor CSV (S, M)
pub fn build_time_tracker(ctx: &WidgetBuildCtx<'_>) -> Vec<SceneNode> {
    let tt = &ctx.hub.time_tracker;
    if tt.projects.is_empty() {
        return empty_state_nodes(
            ctx,
            "Pelacak Waktu",
            "Tambahkan proyek di Pengaturan Widget untuk mulai melacak durasi kerja.",
            "Atur Proyek",
            "open_widget_settings",
        );
    }
    let inner = ctx.frame.inset(14.0);
    let now_epoch = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_secs())
        .unwrap_or(0);

    let mut nodes = vec![text_node(
        RectF::new(inner.x, inner.y, inner.w - 76.0, 20.0),
        "Pelacak Waktu",
        15.0,
        600,
        ctx.pal.primary,
        TextAlign::Left,
        false,
    )];

    if ctx.size == WidgetSize::Medium {
        nodes.extend(action_pill(
            RectF::new(inner.x + inner.w - 76.0, inner.y - 2.0, 76.0, 22.0),
            "Ekspor CSV",
            ctx.pal.surface_chip,
            ctx.pal.primary,
            "export_time_csv",
        ));
    }

    let max_p = if ctx.size == WidgetSize::Small { 2 } else { 3 };
    for (i, p) in tt.projects.iter().take(max_p).enumerate() {
        let y = inner.y + 30.0 + i as f32 * 34.0;
        let running = p.running_since_epoch.is_some();
        let secs = p.total_seconds
            + p.running_since_epoch
                .map(|s| now_epoch.saturating_sub(s))
                .unwrap_or(0);
        let hms = format!(
            "{:02}:{:02}:{:02}",
            secs / 3600,
            (secs % 3600) / 60,
            secs % 60
        );

        nodes.push(text_node(
            RectF::new(inner.x, y, inner.w - 118.0, 18.0),
            &p.name,
            13.0,
            600,
            ctx.pal.primary,
            TextAlign::Left,
            false,
        ));
        nodes.push(text_node(
            RectF::new(inner.x, y + 16.0, 100.0, 14.0),
            hms,
            11.5,
            500,
            if running {
                ctx.pal.positive
            } else {
                ctx.pal.secondary
            },
            TextAlign::Left,
            true,
        ));
        nodes.extend(action_pill(
            RectF::new(inner.x + inner.w - 66.0, y + 2.0, 66.0, 24.0),
            if running { "Henti" } else { "Mulai" },
            if running {
                ctx.pal.danger.with_alpha(0.28)
            } else {
                ctx.pal.accent.with_alpha(0.24)
            },
            ctx.pal.primary,
            &format!("time_toggle:{}", p.id),
        ));
    }
    nodes
}

/// 12. Status situs: ping uptime URL pengguna (min 60 dtk, maks 6 situs) (M, L)
pub fn build_site_status(ctx: &WidgetBuildCtx<'_>) -> Vec<SceneNode> {
    let sites = &ctx.hub.uptime_sites;
    if sites.is_empty() {
        return empty_state_nodes(
            ctx,
            "Status Situs",
            "Tambahkan hingga 6 URL HTTPS milik Anda (interval minimal 60 detik).",
            "Atur Situs",
            "open_widget_settings",
        );
    }
    let inner = ctx.frame.inset(14.0);
    let mut nodes = vec![text_node(
        RectF::new(inner.x, inner.y, inner.w, 20.0),
        "Status Situs",
        15.0,
        600,
        ctx.pal.primary,
        TextAlign::Left,
        false,
    )];
    let max_rows = if ctx.size == WidgetSize::Large { 6 } else { 3 };
    for (i, s) in sites.iter().take(max_rows).enumerate() {
        let y = inner.y + 30.0 + i as f32 * 34.0;
        let dot_col = match s.up {
            Some(true) => ctx.pal.positive,
            Some(false) => ctx.pal.danger,
            None => ctx.pal.warning,
        };
        nodes.push(SceneNode::RoundedRect {
            rect: RectF::new(inner.x, y + 4.0, 8.0, 8.0),
            radius: 4.0,
            smoothing: 0.0,
            fill: Some(dot_col),
            stroke: None,
            interactive_action: None,
        });
        nodes.push(text_node(
            RectF::new(inner.x + 14.0, y, inner.w - 104.0, 18.0),
            &s.name,
            13.0,
            600,
            ctx.pal.primary,
            TextAlign::Left,
            false,
        ));
        let stat = match (s.status_code, s.latency_ms) {
            (Some(c), Some(ms)) => format!("{} . {} ms", c, ms),
            _ => s.error.clone().unwrap_or_else(|| "Menunggu".into()),
        };
        nodes.push(text_node(
            RectF::new(inner.x + inner.w - 92.0, y, 92.0, 18.0),
            stat,
            11.5,
            500,
            ctx.pal.secondary,
            TextAlign::Right,
            true,
        ));
    }
    nodes
}

/// 13. Status GitHub: PR, issue, hasil Actions (M, L)
pub fn build_github_status(ctx: &WidgetBuildCtx<'_>) -> Vec<SceneNode> {
    let gh = &ctx.hub.github;
    if !gh.configured {
        return empty_state_nodes(
            ctx,
            "Status GitHub",
            "Masukkan repositori (owner/repo) dan token fine-grained read-only di Credential Manager.",
            "Atur GitHub",
            "open_widget_settings",
        );
    }
    let inner = ctx.frame.inset(14.0);
    let mut nodes = vec![
        text_node(
            RectF::new(inner.x, inner.y, inner.w, 16.0),
            "GITHUB",
            11.0,
            700,
            ctx.pal.secondary,
            TextAlign::Left,
            false,
        ),
        text_node(
            RectF::new(inner.x, inner.y + 16.0, inner.w, 20.0),
            &gh.repo,
            14.5,
            600,
            ctx.pal.primary,
            TextAlign::Left,
            false,
        ),
    ];

    if let Some(err) = &gh.error {
        nodes.push(text_node(
            RectF::new(inner.x, inner.y + 46.0, inner.w, 34.0),
            err,
            12.0,
            500,
            ctx.pal.warning,
            TextAlign::Left,
            false,
        ));
        nodes.extend(action_pill(
            RectF::new(inner.x, inner.y + inner.h - 28.0, 92.0, 26.0),
            "Coba Lagi",
            ctx.pal.surface_chip,
            ctx.pal.primary,
            "refresh_github",
        ));
        return nodes;
    }

    let col_w = inner.w * 0.48;
    nodes.push(text_node(
        RectF::new(inner.x, inner.y + 46.0, col_w, 38.0),
        format!("{}", gh.open_prs),
        32.0,
        700,
        ctx.pal.accent,
        TextAlign::Left,
        true,
    ));
    nodes.push(text_node(
        RectF::new(inner.x, inner.y + 84.0, col_w, 16.0),
        "PR Terbuka",
        11.5,
        500,
        ctx.pal.secondary,
        TextAlign::Left,
        false,
    ));

    nodes.push(text_node(
        RectF::new(inner.x + col_w + 8.0, inner.y + 46.0, col_w, 38.0),
        format!("{}", gh.open_issues),
        32.0,
        700,
        ctx.pal.primary,
        TextAlign::Left,
        true,
    ));
    nodes.push(text_node(
        RectF::new(inner.x + col_w + 8.0, inner.y + 84.0, col_w, 16.0),
        "Issue Terbuka",
        11.5,
        500,
        ctx.pal.secondary,
        TextAlign::Left,
        false,
    ));

    let act_col = match gh.latest_action_conclusion.as_str() {
        "success" => ctx.pal.positive,
        "failure" => ctx.pal.danger,
        _ => ctx.pal.warning,
    };
    nodes.push(text_node(
        RectF::new(inner.x, inner.y + inner.h - 20.0, inner.w, 18.0),
        format!(
            "Actions: {} ({})",
            gh.latest_action_name, gh.latest_action_conclusion
        ),
        11.5,
        600,
        act_col,
        TextAlign::Left,
        false,
    ));
    nodes
}

/// 14. Pintasan: grid aplikasi, folder, link dengan path terlihat (S, M, L)
pub fn build_shortcuts_grid(ctx: &WidgetBuildCtx<'_>) -> Vec<SceneNode> {
    let items = &ctx.hub.shortcuts;
    if items.is_empty() {
        return empty_state_nodes(
            ctx,
            "Pintasan Cepat",
            "Tambahkan aplikasi, folder, atau tautan sendiri beserta path yang jelas.",
            "Tambah Pintasan",
            "open_widget_settings",
        );
    }
    let inner = ctx.frame.inset(14.0);
    let mut nodes = vec![text_node(
        RectF::new(inner.x, inner.y, inner.w, 18.0),
        "Pintasan",
        14.0,
        600,
        ctx.pal.primary,
        TextAlign::Left,
        false,
    )];
    let (cols, rows) = match ctx.size {
        WidgetSize::Small => (2, 2),
        WidgetSize::Medium => (4, 2),
        WidgetSize::Large => (4, 4),
    };
    let gap = 8.0;
    let cw = (inner.w - gap * (cols as f32 - 1.0)) / cols as f32;
    let ch = ((inner.h - 26.0) - gap * (rows as f32 - 1.0)) / rows as f32;

    for (idx, sc) in items.iter().take(cols * rows).enumerate() {
        let c = idx % cols;
        let r = idx / cols;
        let x = inner.x + c as f32 * (cw + gap);
        let y = inner.y + 24.0 + r as f32 * (ch + gap);
        nodes.push(SceneNode::RoundedRect {
            rect: RectF::new(x, y, cw, ch),
            radius: 12.0,
            smoothing: 0.5,
            fill: Some(ctx.pal.surface_chip),
            stroke: None,
            interactive_action: Some(format!("launch_shortcut:{}", sc.id)),
        });
        nodes.push(text_node(
            RectF::new(x + 6.0, y + 8.0, cw - 12.0, 16.0),
            &sc.label,
            12.0,
            600,
            ctx.pal.primary,
            TextAlign::Left,
            false,
        ));
        nodes.push(text_node(
            RectF::new(x + 6.0, y + 25.0, cw - 12.0, 14.0),
            &sc.target_path,
            9.5,
            400,
            ctx.pal.secondary,
            TextAlign::Left,
            false,
        ));
    }
    nodes
}

/// 15. File terbaru (M, L): opt-in, folder pengecualian, metadata saja
pub fn build_recent_files(ctx: &WidgetBuildCtx<'_>) -> Vec<SceneNode> {
    let rf = &ctx.hub.recent_files;
    if !rf.opt_in_enabled || rf.watched_folders.is_empty() {
        return empty_state_nodes(
            ctx,
            "Berkas Terbaru",
            "Fitur ini opt-in. Pilih folder yang ingin dipantau (hanya metadata, tanpa baca isi).",
            "Aktifkan & Pilih",
            "open_widget_settings",
        );
    }
    let inner = ctx.frame.inset(14.0);
    let mut nodes = vec![text_node(
        RectF::new(inner.x, inner.y, inner.w, 20.0),
        "Berkas Terbaru",
        15.0,
        600,
        ctx.pal.primary,
        TextAlign::Left,
        false,
    )];
    if rf.files.is_empty() {
        nodes.push(text_node(
            RectF::new(inner.x, inner.y + 34.0, inner.w, 32.0),
            "Belum ada berkas ditemukan di folder pantauan.",
            12.0,
            400,
            ctx.pal.secondary,
            TextAlign::Left,
            false,
        ));
        return nodes;
    }
    let max_rows = if ctx.size == WidgetSize::Large { 8 } else { 3 };
    for (i, f) in rf.files.iter().take(max_rows).enumerate() {
        let y = inner.y + 28.0 + i as f32 * 30.0;
        let kb = (f.size_bytes as f64 / 1024.0).max(1.0);
        let size_lbl = if kb >= 1024.0 {
            format!("{:.1} MB", kb / 1024.0)
        } else {
            format!("{:.0} KB", kb)
        };
        nodes.push(text_node(
            RectF::new(inner.x, y, inner.w - 62.0, 16.0),
            &f.name,
            12.5,
            500,
            ctx.pal.primary,
            TextAlign::Left,
            false,
        ));
        nodes.push(text_node(
            RectF::new(inner.x + inner.w - 60.0, y, 60.0, 16.0),
            size_lbl,
            11.0,
            400,
            ctx.pal.secondary,
            TextAlign::Right,
            true,
        ));
    }
    nodes
}

/// 30. Hitung mundur momen / Countdown (S, M)
pub fn build_countdown_moment(ctx: &WidgetBuildCtx<'_>) -> Vec<SceneNode> {
    let items = &ctx.hub.countdowns;
    if items.is_empty() {
        return empty_state_nodes(
            ctx,
            "Hitung Mundur",
            "Tambahkan momen penting (deadline, ujian, gajian, liburan) di Pengaturan Widget.",
            "Tambah Momen",
            "open_widget_settings",
        );
    }
    let inner = ctx.frame.inset(14.0);
    let (cy, cm, cd, _, _, _, _) = crate::widgets::local_datetime_parts();
    let first = &items[0];
    let diff = crate::providers::local_stores::countdown_days_diff(
        cy,
        cm as i32,
        cd as i32,
        &first.target_date,
    )
    .unwrap_or(0);

    let (num_str, suffix) = if diff > 0 {
        (format!("{}", diff), "hari lagi".to_string())
    } else if diff == 0 {
        ("H-0".to_string(), "Hari ini!".to_string())
    } else {
        (format!("+{}", diff.abs()), "hari lalu".to_string())
    };

    let has_right_list = ctx.size == WidgetSize::Medium && items.len() > 1;
    let left_w = if has_right_list {
        inner.w * 0.47
    } else {
        inner.w
    };

    let mut nodes = vec![
        SceneNode::IconGlyph {
            rect: RectF::new(inner.x + inner.w - 22.0, inner.y - 2.0, 22.0, 22.0),
            glyph: "\u{E787}".into(),
            size: 15.0,
            color: ctx.pal.secondary,
            interactive_action: None,
        },
        text_node(
            RectF::new(inner.x, inner.y, inner.w - 26.0, 16.0),
            "HITUNG MUNDUR",
            10.5,
            700,
            ctx.pal.secondary,
            TextAlign::Left,
            false,
        ),
        text_node(
            RectF::new(inner.x, inner.y + 18.0, left_w, 44.0),
            num_str,
            38.0,
            700,
            ctx.pal.primary,
            TextAlign::Left,
            true,
        ),
        text_node(
            RectF::new(inner.x, inner.y + 62.0, left_w, 16.0),
            format!("{} . {}", suffix, first.target_date),
            11.5,
            500,
            ctx.pal.secondary,
            TextAlign::Left,
            true,
        ),
        text_node(
            RectF::new(inner.x, inner.y + inner.h - 22.0, left_w, 20.0),
            &first.title,
            13.5,
            600,
            ctx.pal.primary,
            TextAlign::Left,
            false,
        ),
    ];

    if has_right_list {
        let rx = inner.x + inner.w * 0.50;
        let rw = inner.w * 0.50;
        for (i, item) in items.iter().skip(1).take(3).enumerate() {
            let y = inner.y + 24.0 + i as f32 * 34.0;
            let d = crate::providers::local_stores::countdown_days_diff(
                cy,
                cm as i32,
                cd as i32,
                &item.target_date,
            )
            .unwrap_or(0);
            nodes.push(SceneNode::RoundedRect {
                rect: RectF::new(rx, y, rw, 28.0),
                radius: 9.0,
                smoothing: 0.45,
                fill: Some(ctx.pal.surface_chip),
                stroke: None,
                interactive_action: None,
            });
            nodes.push(text_node(
                RectF::new(rx + 8.0, y + 6.0, rw - 54.0, 16.0),
                &item.title,
                11.5,
                600,
                ctx.pal.primary,
                TextAlign::Left,
                false,
            ));
            nodes.push(text_node(
                RectF::new(rx + rw - 46.0, y + 6.0, 40.0, 16.0),
                if d >= 0 {
                    format!("H-{}", d)
                } else {
                    format!("+{}", d.abs())
                },
                11.0,
                700,
                ctx.pal.accent,
                TextAlign::Right,
                true,
            ));
        }
    }
    nodes
}

/// 31. Papan Snippet Cepat: template teks pilihan pengguna, 1 klik salin (S, M)
pub fn build_quick_snippets(ctx: &WidgetBuildCtx<'_>) -> Vec<SceneNode> {
    let items = &ctx.hub.snippets;
    if items.is_empty() {
        return empty_state_nodes(
            ctx,
            "Papan Snippet",
            "Simpan template teks pilihan Anda sendiri untuk disalin 1 klik (bukan riwayat clipboard).",
            "Tambah Snippet",
            "open_widget_settings",
        );
    }
    let inner = ctx.frame.inset(14.0);
    let mut nodes = vec![
        text_node(
            RectF::new(inner.x, inner.y, inner.w - 26.0, 18.0),
            "Papan Snippet",
            14.5,
            600,
            ctx.pal.primary,
            TextAlign::Left,
            false,
        ),
        SceneNode::IconGlyph {
            rect: RectF::new(inner.x + inner.w - 22.0, inner.y - 1.0, 22.0, 22.0),
            glyph: "\u{E8C8}".into(),
            size: 14.0,
            color: ctx.pal.secondary,
            interactive_action: None,
        },
    ];

    let cols = if ctx.size == WidgetSize::Small { 1 } else { 2 };
    let rows = 3;
    let gap = 7.0;
    let cw = (inner.w - gap * (cols as f32 - 1.0)) / cols as f32;
    let ch = ((inner.h - 26.0) - gap * (rows as f32 - 1.0)) / rows as f32;

    for (idx, sn) in items.iter().take(cols * rows).enumerate() {
        let c = idx % cols;
        let r = idx / cols;
        let x = inner.x + c as f32 * (cw + gap);
        let y = inner.y + 24.0 + r as f32 * (ch + gap);
        let act = format!("copy_snippet:{}", sn.id);
        nodes.push(SceneNode::RoundedRect {
            rect: RectF::new(x, y, cw, ch),
            radius: 10.0,
            smoothing: 0.5,
            fill: Some(ctx.pal.surface_chip),
            stroke: Some((ctx.pal.accent.with_alpha(0.25), 1.0)),
            interactive_action: Some(act.clone()),
        });
        nodes.push(text_node(
            RectF::new(x + 8.0, y + (ch - 15.0) * 0.44, cw - 30.0, 16.0),
            &sn.label,
            12.0,
            600,
            ctx.pal.primary,
            TextAlign::Left,
            false,
        ));
        nodes.push(SceneNode::IconGlyph {
            rect: RectF::new(x + cw - 22.0, y + (ch - 14.0) * 0.44, 16.0, 16.0),
            glyph: "\u{E8C8}".into(),
            size: 11.5,
            color: ctx.pal.secondary,
            interactive_action: Some(act),
        });
    }
    nodes
}
