use crate::config::{RgbaColor, WidgetInstance, WidgetSize, WidgetStackSlot};
use crate::layout::{RectF, SceneNode, TextAlign};
use crate::widgets::{action_pill, empty_state_nodes, is_english, text_node, WidgetBuildCtx};

/// 9. Catatan tempel: banyak catatan, warna, checklist (S, M, L)
pub fn build_sticky_notes(ctx: &WidgetBuildCtx<'_>) -> Vec<SceneNode> {
    let en = is_english(ctx);
    let inner = ctx.frame.inset(14.0);
    let notes = &ctx.hub.frontend.mini_notes;
    if notes.is_empty() {
        return empty_state_nodes(
            ctx,
            if en { "Mini Note" } else { "Catatan Mini" },
            if en {
                "No notes yet. Tap Add to open Quick Note."
            } else {
                "Belum ada catatan. Ketuk Tambah untuk membuka Quick Note."
            },
            if en { "+ Add" } else { "+ Tambah" },
            "open_quick_note",
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
                if en { "Note" } else { "Catatan" }
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
            if en {
                if notes.len() == 1 {
                    "1 note".to_string()
                } else {
                    format!("{} notes", notes.len())
                }
            } else {
                format!("{} catatan", notes.len())
            },
            11.0,
            500,
            ctx.pal.secondary,
            TextAlign::Right,
            true,
        ),
    ];

    if note.is_checklist && !note.checklist.is_empty() {
        let max_items = if ctx.size == WidgetSize::Large { 7 } else { 3 };
        let bottom_limit = inner.y + inner.h - 28.0;
        for (i, item) in note.checklist.iter().take(max_items).enumerate() {
            let y = inner.y + 28.0 + i as f32 * 24.0;
            if y + 18.0 > bottom_limit {
                break;
            }
            let mark = if item.checked { "☑" } else { "☐" };
            nodes.push(crate::widgets::text_node_line(
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
        if en { "+ Add" } else { "+ Tambah" },
        ctx.pal.surface_chip,
        ctx.pal.primary,
        "open_quick_note",
    ));
    nodes
}

/// 10. Kanban mini 3 kolom (L)
pub fn build_mini_kanban(ctx: &WidgetBuildCtx<'_>) -> Vec<SceneNode> {
    let en = is_english(ctx);
    let inner = ctx.frame.inset(14.0);
    let kb = &ctx.hub.kanban;
    let mut nodes = vec![text_node(
        RectF::new(inner.x, inner.y, inner.w - 90.0, 20.0),
        if en { "Mini Kanban" } else { "Kanban Mini" },
        15.0,
        600,
        ctx.pal.primary,
        TextAlign::Left,
        false,
    )];
    nodes.extend(action_pill(
        RectF::new(inner.x + inner.w - 86.0, inner.y - 2.0, 86.0, 24.0),
        if en { "+ Card" } else { "+ Kartu" },
        ctx.pal.accent.with_alpha(0.24),
        ctx.pal.primary,
        "open_widget_settings",
    ));

    let cols = [
        (if en { "To Do" } else { "Akan" }, &kb.todo, ctx.pal.secondary),
        (if en { "Doing" } else { "Proses" }, &kb.doing, ctx.pal.accent),
        (if en { "Done" } else { "Selesai" }, &kb.done, ctx.pal.positive),
    ];
    let gap = 8.0;
    let col_w = (inner.w - gap * 2.0) / 3.0;
    let top_y = inner.y + 30.0;
    let cards_bottom = inner.y + inner.h - 20.0;

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
                if en { "Empty" } else { "Kosong" },
                11.0,
                400,
                ctx.pal.secondary,
                TextAlign::Left,
                false,
            ));
        } else {
            for (ri, card) in cards.iter().take(4).enumerate() {
                let cy = top_y + 22.0 + ri as f32 * 52.0;
                if cy + 44.0 > cards_bottom {
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
                    RectF::new(x + 6.0, cy + 6.0, (col_w - 24.0).max(20.0), 32.0),
                    &card.title,
                    11.5,
                    500,
                    ctx.pal.primary,
                    TextAlign::Left,
                    false,
                ));
                nodes.push(SceneNode::Text {
                    rect: RectF::new(x + col_w - 18.0, cy + 3.0, 16.0, 16.0),
                    content: "x".to_string(),
                    font_size: 10.5,
                    font_weight: 700,
                    color: ctx.pal.secondary,
                    align: TextAlign::Center,
                    tabular_nums: false,
                    tight_kerning: false,
                    max_lines: 1,
                    interactive_action: Some(format!("kanban_delete:{}", card.id)),
                });
            }
        }
    }

    let total_cards = kb.todo.len() + kb.doing.len() + kb.done.len();
    nodes.push(crate::widgets::text_node_line(
        RectF::new(inner.x, inner.y + inner.h - 15.0, inner.w, 15.0),
        if total_cards == 0 {
            if en {
                "Click + Card to add tasks in Settings"
            } else {
                "Klik + Kartu untuk menambah tugas di Pengaturan"
            }
        } else if en {
            "Click card to move column . x to remove"
        } else {
            "Klik kartu untuk pindah kolom . x untuk hapus"
        },
        10.0,
        500,
        ctx.pal.secondary,
        TextAlign::Left,
        false,
    ));
    nodes
}

/// 11. Pelacak waktu per proyek, mulai/berhenti, ekspor CSV (S, M)
pub fn build_time_tracker(ctx: &WidgetBuildCtx<'_>) -> Vec<SceneNode> {
    let en = is_english(ctx);
    let tt = &ctx.hub.time_tracker;
    if tt.projects.is_empty() {
        return empty_state_nodes(
            ctx,
            if en { "Time Tracker" } else { "Pelacak Waktu" },
            if en {
                "Add projects in Widget Settings to start tracking work duration."
            } else {
                "Tambahkan proyek di Pengaturan Widget untuk mulai melacak durasi kerja."
            },
            if en { "Set Projects" } else { "Atur Proyek" },
            "open_widget_settings",
        );
    }
    let inner = ctx.frame.inset(14.0);
    let now_epoch = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_secs())
        .unwrap_or(0);

    let header_w = if ctx.size == WidgetSize::Medium {
        inner.w - 78.0
    } else {
        inner.w
    };
    let mut nodes = vec![crate::widgets::text_node_line(
        RectF::new(inner.x, inner.y, header_w, 20.0),
        if en { "Time Tracker" } else { "Pelacak Waktu" },
        14.5,
        600,
        ctx.pal.primary,
        TextAlign::Left,
        false,
    )];

    if ctx.size == WidgetSize::Medium {
        nodes.extend(action_pill(
            RectF::new(inner.x + inner.w - 76.0, inner.y - 2.0, 76.0, 22.0),
            if en { "Export CSV" } else { "Ekspor CSV" },
            ctx.pal.surface_chip,
            ctx.pal.primary,
            "export_time_csv",
        ));
    }

    let max_p = if ctx.size == WidgetSize::Small { 2 } else { 3 };
    let btn_w = if ctx.size == WidgetSize::Small { 54.0 } else { 66.0 };
    let name_w = (inner.w - btn_w - 8.0).max(48.0);
    for (i, p) in tt.projects.iter().take(max_p).enumerate() {
        let y = inner.y + 28.0 + i as f32 * 34.0;
        if y + 28.0 > inner.y + inner.h {
            break;
        }
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

        nodes.push(crate::widgets::text_node_line(
            RectF::new(inner.x, y, name_w, 17.0),
            &p.name,
            12.5,
            600,
            ctx.pal.primary,
            TextAlign::Left,
            false,
        ));
        nodes.push(crate::widgets::text_node_line(
            RectF::new(inner.x, y + 16.0, name_w, 14.0),
            hms,
            11.0,
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
            RectF::new(inner.x + inner.w - btn_w, y + 2.0, btn_w, 24.0),
            if running {
                if en { "Stop" } else { "Henti" }
            } else {
                if en { "Start" } else { "Mulai" }
            },
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
    let en = is_english(ctx);
    let sites = &ctx.hub.uptime_sites;
    if sites.is_empty() {
        return empty_state_nodes(
            ctx,
            if en { "Site Status" } else { "Status Situs" },
            if en {
                "Add up to 6 of your HTTPS URLs (min 60s interval)."
            } else {
                "Tambahkan hingga 6 URL HTTPS milik Anda (interval minimal 60 detik)."
            },
            if en { "Set Sites" } else { "Atur Situs" },
            "open_widget_settings",
        );
    }
    let inner = ctx.frame.inset(14.0);
    let mut nodes = vec![text_node(
        RectF::new(inner.x, inner.y, inner.w, 20.0),
        if en { "Site Status" } else { "Status Situs" },
        15.0,
        600,
        ctx.pal.primary,
        TextAlign::Left,
        false,
    )];
    let max_rows = if ctx.size == WidgetSize::Large { 6 } else { 3 };
    for (i, s) in sites.iter().take(max_rows).enumerate() {
        let y = inner.y + 30.0 + i as f32 * 32.0;
        if y + 18.0 > inner.y + inner.h {
            break;
        }
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
        nodes.push(crate::widgets::text_node_line(
            RectF::new(inner.x + 14.0, y, (inner.w - 108.0).max(48.0), 18.0),
            &s.name,
            13.0,
            600,
            ctx.pal.primary,
            TextAlign::Left,
            false,
        ));
        let stat = match (s.status_code, s.latency_ms) {
            (Some(c), Some(ms)) => format!("{} . {} ms", c, ms),
            _ => s.error.clone().unwrap_or_else(|| {
                if en { "Pending" } else { "Menunggu" }.into()
            }),
        };
        nodes.push(crate::widgets::text_node_line(
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
    let en = is_english(ctx);
    let gh = &ctx.hub.github;
    if !gh.configured {
        return empty_state_nodes(
            ctx,
            if en { "GitHub Status" } else { "Status GitHub" },
            if en {
                "Enter repository (owner/repo) and a read-only fine-grained token in Credential Manager."
            } else {
                "Masukkan repositori (owner/repo) dan token fine-grained read-only di Credential Manager."
            },
            if en { "Set GitHub" } else { "Atur GitHub" },
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
            if en { "Retry" } else { "Coba Lagi" },
            ctx.pal.surface_chip,
            ctx.pal.primary,
            "refresh_github",
        ));
        return nodes;
    }

    let col_w = inner.w * 0.48;
    let compact = inner.h < 116.0;
    let num_y = if compact { inner.y + 36.0 } else { inner.y + 44.0 };
    let num_fs = if compact { 26.0 } else { 32.0 };
    let lbl_y = if compact { inner.y + 66.0 } else { inner.y + 82.0 };
    nodes.push(crate::widgets::text_node_line(
        RectF::new(inner.x, num_y, col_w, 36.0),
        format!("{}", gh.open_prs),
        num_fs,
        700,
        ctx.pal.accent,
        TextAlign::Left,
        true,
    ));
    nodes.push(crate::widgets::text_node_line(
        RectF::new(inner.x, lbl_y, col_w, 16.0),
        if en { "Open PRs" } else { "PR Terbuka" },
        11.5,
        500,
        ctx.pal.secondary,
        TextAlign::Left,
        false,
    ));

    nodes.push(crate::widgets::text_node_line(
        RectF::new(inner.x + col_w + 8.0, num_y, col_w, 36.0),
        format!("{}", gh.open_issues),
        num_fs,
        700,
        ctx.pal.primary,
        TextAlign::Left,
        true,
    ));
    nodes.push(crate::widgets::text_node_line(
        RectF::new(inner.x + col_w + 8.0, lbl_y, col_w, 16.0),
        if en { "Open Issues" } else { "Issue Terbuka" },
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
    let act_label = if gh.latest_action_name.trim().is_empty() {
        if en {
            "Actions: No workflow runs yet".to_string()
        } else {
            "Actions: Belum ada workflow run".to_string()
        }
    } else if gh.latest_action_conclusion.trim().is_empty() {
        format!("Actions: {}", gh.latest_action_name)
    } else {
        format!(
            "Actions: {} ({})",
            gh.latest_action_name, gh.latest_action_conclusion
        )
    };
    nodes.push(crate::widgets::text_node_line(
        RectF::new(inner.x, inner.y + inner.h - 17.0, inner.w, 17.0),
        act_label,
        11.0,
        600,
        act_col,
        TextAlign::Left,
        false,
    ));
    nodes
}

/// 14. Pintasan: grid aplikasi, folder, link dengan path terlihat (S, M, L)
pub fn build_shortcuts_grid(ctx: &WidgetBuildCtx<'_>) -> Vec<SceneNode> {
    let en = is_english(ctx);
    let items = &ctx.hub.shortcuts;
    if items.is_empty() {
        return empty_state_nodes(
            ctx,
            if en {
                "Quick Shortcuts"
            } else {
                "Pintasan Cepat"
            },
            if en {
                "Add your own apps, folders, or links with explicit paths."
            } else {
                "Tambahkan aplikasi, folder, atau tautan sendiri beserta path yang jelas."
            },
            if en {
                "Add Shortcut"
            } else {
                "Tambah Pintasan"
            },
            "open_widget_settings",
        );
    }
    let inner = ctx.frame.inset(14.0);
    let mut nodes = vec![text_node(
        RectF::new(inner.x, inner.y, inner.w, 18.0),
        if en { "Shortcuts" } else { "Pintasan" },
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
        nodes.push(crate::widgets::text_node_line(
            RectF::new(x + 6.0, y + 6.0, (cw - 12.0).max(20.0), 16.0),
            &sc.label,
            11.5,
            600,
            ctx.pal.primary,
            TextAlign::Left,
            false,
        ));
        if ch >= 38.0 {
            nodes.push(crate::widgets::text_node_line(
                RectF::new(x + 6.0, y + 23.0, (cw - 12.0).max(20.0), 14.0),
                &sc.target_path,
                9.5,
                400,
                ctx.pal.secondary,
                TextAlign::Left,
                false,
            ));
        }
    }
    nodes
}

/// 15. File terbaru (M, L): opt-in, folder pengecualian, metadata saja
pub fn build_recent_files(ctx: &WidgetBuildCtx<'_>) -> Vec<SceneNode> {
    let en = is_english(ctx);
    let rf = &ctx.hub.recent_files;
    if !rf.opt_in_enabled || rf.watched_folders.is_empty() {
        return empty_state_nodes(
            ctx,
            if en { "Recent Files" } else { "Berkas Terbaru" },
            if en {
                "Opt-in feature. Pick folders to watch (metadata only, no file content read)."
            } else {
                "Fitur ini opt-in. Pilih folder yang ingin dipantau (hanya metadata, tanpa baca isi)."
            },
            if en { "Enable & Pick" } else { "Aktifkan & Pilih" },
            "open_widget_settings",
        );
    }
    let inner = ctx.frame.inset(14.0);
    let mut nodes = vec![text_node(
        RectF::new(inner.x, inner.y, inner.w, 20.0),
        if en { "Recent Files" } else { "Berkas Terbaru" },
        15.0,
        600,
        ctx.pal.primary,
        TextAlign::Left,
        false,
    )];
    if rf.files.is_empty() {
        nodes.push(text_node(
            RectF::new(inner.x, inner.y + 34.0, inner.w, 32.0),
            if en {
                "No files found in watched folders yet."
            } else {
                "Belum ada berkas ditemukan di folder pantauan."
            },
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
        let y = inner.y + 28.0 + i as f32 * 28.0;
        if y + 16.0 > inner.y + inner.h {
            break;
        }
        let kb = (f.size_bytes as f64 / 1024.0).max(1.0);
        let size_lbl = if kb >= 1024.0 {
            format!("{:.1} MB", kb / 1024.0)
        } else {
            format!("{:.0} KB", kb)
        };
        nodes.push(crate::widgets::text_node_line(
            RectF::new(inner.x, y, (inner.w - 64.0).max(40.0), 16.0),
            &f.name,
            12.5,
            500,
            ctx.pal.primary,
            TextAlign::Left,
            false,
        ));
        nodes.push(crate::widgets::text_node_line(
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
    let en = is_english(ctx);
    let items = &ctx.hub.countdowns;
    if items.is_empty() {
        return empty_state_nodes(
            ctx,
            if en { "Countdown" } else { "Hitung Mundur" },
            if en {
                "Add important milestones (deadlines, exams, payday, holidays) in Widget Settings."
            } else {
                "Tambahkan momen penting (deadline, ujian, gajian, liburan) di Pengaturan Widget."
            },
            if en { "Add Moment" } else { "Tambah Momen" },
            "open_widget_settings",
        );
    }
    let inner = ctx.frame.inset(16.0);
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
        (
            format!("{}", diff),
            if en { "days left" } else { "hari lagi" }.to_string(),
        )
    } else if diff == 0 {
        (
            if en { "D-0" } else { "H-0" }.to_string(),
            if en { "Today!" } else { "Hari ini!" }.to_string(),
        )
    } else {
        (
            format!("+{}", diff.abs()),
            if en { "days ago" } else { "hari lalu" }.to_string(),
        )
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
            if en { "COUNTDOWN" } else { "HITUNG MUNDUR" },
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
        crate::widgets::text_node_line(
            RectF::new(inner.x, inner.y + 62.0, left_w, 16.0),
            format!("{} . {}", suffix, first.target_date),
            11.5,
            500,
            ctx.pal.secondary,
            TextAlign::Left,
            true,
        ),
        crate::widgets::text_node_line(
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
        let chip_stroke = ctx
            .pal
            .inner_border
            .map(|b| (b.with_alpha(b.a * 0.60), 0.75));
        for (i, item) in items.iter().skip(1).take(3).enumerate() {
            let y = inner.y + 24.0 + i as f32 * 34.0;
            if y + 28.0 > inner.y + inner.h {
                break;
            }
            let d = crate::providers::local_stores::countdown_days_diff(
                cy,
                cm as i32,
                cd as i32,
                &item.target_date,
            )
            .unwrap_or(0);
            nodes.push(SceneNode::RoundedRect {
                rect: RectF::new(rx, y, rw, 28.0),
                radius: 12.0,
                smoothing: 0.60,
                fill: Some(ctx.pal.surface_chip),
                stroke: chip_stroke,
                interactive_action: None,
            });
            nodes.push(crate::widgets::text_node_line(
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
                    format!("{}-{}", if en { "D" } else { "H" }, d)
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
    let en = is_english(ctx);
    let items = &ctx.hub.snippets;
    if items.is_empty() {
        return empty_state_nodes(
            ctx,
            if en { "Snippet Board" } else { "Papan Snippet" },
            if en {
                "Save custom text templates for 1-click copy (not clipboard history)."
            } else {
                "Simpan template teks pilihan Anda sendiri untuk disalin 1 klik (bukan riwayat clipboard)."
            },
            if en { "Add Snippet" } else { "Tambah Snippet" },
            "open_widget_settings",
        );
    }
    let inner = ctx.frame.inset(16.0);
    let mut nodes = vec![
        crate::widgets::text_node_line(
            RectF::new(inner.x, inner.y, inner.w - 26.0, 18.0),
            if en { "Snippet Board" } else { "Papan Snippet" },
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
    let tile_stroke = ctx
        .pal
        .inner_border
        .map(|b| (b.with_alpha(b.a * 0.65), 0.75))
        .or_else(|| Some((ctx.pal.secondary.with_alpha(0.22), 0.75)));

    for (idx, sn) in items.iter().take(cols * rows).enumerate() {
        let c = idx % cols;
        let r = idx / cols;
        let x = inner.x + c as f32 * (cw + gap);
        let y = inner.y + 24.0 + r as f32 * (ch + gap);
        let act = format!("copy_snippet:{}", sn.id);
        nodes.push(SceneNode::RoundedRect {
            rect: RectF::new(x, y, cw, ch),
            radius: 12.0,
            smoothing: 0.60,
            fill: Some(ctx.pal.surface_chip),
            stroke: tile_stroke,
            interactive_action: Some(act.clone()),
        });
        nodes.push(crate::widgets::text_node_line(
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

pub const STICKY_PRESET_COLORS: [&str; 8] = [
    "#FFF07C",
    "#A7F3D0",
    "#FED7AA",
    "#BAE6FD",
    "#DDD6FE",
    "#FBCFE8",
    "#FEF3C7",
    "#27272A",
];

pub const STICKY_STYLES: [&str; 3] = ["tape", "curled", "pin"];

pub fn default_sticky_tilt_deg(seed: &str) -> f32 {
    const TILTS: [f32; 6] = [-3.2, 2.5, -1.8, 3.6, -2.7, 1.9];
    let hash = seed
        .bytes()
        .fold(0usize, |acc, b| acc.wrapping_mul(31).wrapping_add(b as usize));
    TILTS[hash % TILTS.len()]
}

pub fn resolve_sticky_tilt_deg(slot_id: &str, settings: &serde_json::Value) -> f32 {
    settings
        .get("tilt_deg")
        .and_then(|v| v.as_f64())
        .map(|v| (v as f32).clamp(-8.0, 8.0))
        .unwrap_or_else(|| default_sticky_tilt_deg(slot_id))
}

pub fn sticky_visual_scale(frame: RectF) -> f32 {
    let size_ratio = (frame.w.min(frame.h) / 160.0).clamp(0.85, 2.5);
    1.0 + (size_ratio - 1.0) * 0.72
}

#[derive(Debug, Clone, Copy)]
pub struct StickyNoteMetrics {
    pub scale: f32,
    pub top_pad: f32,
    pub edit_top_pad: f32,
    pub pad_x: f32,
    pub edit_pad_x: f32,
    pub title_font_size: f32,
    pub title_h: f32,
    pub title_gap: f32,
    pub body_font_size: f32,
    pub bottom_pad: f32,
    pub edit_bottom_pad: f32,
    pub divider_y: f32,
    pub edit_body_y: f32,
    pub footer_h: f32,
    pub footer_font_size: f32,
}

pub fn sticky_note_metrics(frame: RectF, note_style: &str) -> StickyNoteMetrics {
    let scale = sticky_visual_scale(frame);
    let top_pad = (if note_style == "curled" { 25.0 } else { 29.0 }) * scale;
    let edit_top_pad = (if note_style == "curled" { 24.0 } else { 28.0 }) * scale;
    let title_h = 20.0 * scale;
    let divider_y = frame.y + edit_top_pad + title_h + 2.0 * scale;
    StickyNoteMetrics {
        scale,
        top_pad,
        edit_top_pad,
        pad_x: 14.0 * scale,
        edit_pad_x: 13.0 * scale,
        title_font_size: 13.5 * scale,
        title_h,
        title_gap: 22.0 * scale,
        body_font_size: 12.5 * scale,
        bottom_pad: 22.0 * scale,
        edit_bottom_pad: 24.0 * scale,
        divider_y,
        edit_body_y: divider_y + 4.0 * scale,
        footer_h: 14.0 * scale,
        footer_font_size: 9.5 * scale,
    }
}

/// Paper Sticky Note widget: custom free paper color, natural curved silhouette, & inline editing (S, M, L)
pub fn build_paper_sticky_note(ctx: &WidgetBuildCtx<'_>) -> Vec<SceneNode> {
    let en = is_english(ctx);
    let settings = &ctx.instance.settings;

    let color_hex = settings
        .get("paper_color")
        .and_then(|v| v.as_str())
        .unwrap_or(STICKY_PRESET_COLORS[0]);
    let paper_color = RgbaColor::from_hex(color_hex, 0.98)
        .unwrap_or_else(|| RgbaColor::new(0xFF, 0xF0, 0x7C, 0.98));

    let note_style = settings
        .get("note_style")
        .and_then(|v| v.as_str())
        .filter(|s| STICKY_STYLES.contains(s))
        .unwrap_or("tape")
        .to_string();

    let show_lines = settings
        .get("show_lines")
        .and_then(|v| v.as_bool())
        .unwrap_or(true);

    let title = settings
        .get("title")
        .and_then(|v| v.as_str())
        .map(str::trim)
        .unwrap_or("");
    let body = settings
        .get("text")
        .and_then(|v| v.as_str())
        .map(str::trim_end)
        .unwrap_or("");

    let lum = crate::contrast::relative_luminance(paper_color);
    let (ink_primary, ink_muted, line_color) = if lum > 0.36 {
        (
            RgbaColor::new(0x1C, 0x19, 0x14, 0.96),
            RgbaColor::new(0x2A, 0x24, 0x1A, 0.56),
            RgbaColor::new(0x2A, 0x24, 0x1A, 0.11),
        )
    } else {
        (
            RgbaColor::new(0xF8, 0xFA, 0xFC, 0.96),
            RgbaColor::new(0xCB, 0xD5, 0xE1, 0.65),
            RgbaColor::new(0xFF, 0xFF, 0xFF, 0.11),
        )
    };

    let tilt = resolve_sticky_tilt_deg(ctx.slot_id, settings);
    let curl_left = tilt < 0.0;

    let mut nodes = vec![SceneNode::StickyPaper {
        rect: ctx.frame,
        paper_color,
        style: note_style.clone(),
        show_lines,
        line_color,
        curl_left,
        interactive_action: Some("inline_edit:paper_sticky_note".to_string()),
    }];

    let m = sticky_note_metrics(ctx.frame, &note_style);
    let text_x = ctx.frame.x + m.pad_x;
    let text_w = (ctx.frame.w - m.pad_x * 2.0).max(40.0);
    let mut body_y = ctx.frame.y + m.top_pad;

    if !title.is_empty() {
        nodes.push(crate::widgets::text_node_line(
            RectF::new(text_x, body_y, text_w, m.title_h),
            title,
            m.title_font_size,
            700,
            ink_primary,
            TextAlign::Left,
            false,
        ));
        body_y += m.title_gap;
    }

    let body_h = (ctx.frame.y + ctx.frame.h - m.bottom_pad - body_y).max(24.0);
    let (display_text, display_color) = if !body.is_empty() {
        (body.to_string(), ink_primary)
    } else if title.is_empty() {
        (
            if en {
                "Click to write note...\nCtrl+Enter to save"
            } else {
                "Klik untuk tulis catatan...\nCtrl+Enter untuk simpan"
            }
            .to_string(),
            ink_muted,
        )
    } else {
        (String::new(), ink_primary)
    };

    if !display_text.is_empty() {
        let max_lines = ((body_h / (m.body_font_size * 1.32)).floor() as u32).clamp(4, 14);
        nodes.push(SceneNode::Text {
            rect: RectF::new(text_x, body_y, text_w, body_h),
            content: display_text,
            font_size: m.body_font_size,
            font_weight: 500,
            color: display_color,
            align: TextAlign::Left,
            tabular_nums: false,
            tight_kerning: false,
            max_lines,
            interactive_action: Some("inline_edit:paper_sticky_note".to_string()),
        });
    }

    // Subtle quick-add (+) button in the top-right corner so users can spawn another note in 1 click
    let btn_sz = 18.0 * m.scale;
    let btn_x = ctx.frame.x + ctx.frame.w - btn_sz - 6.0 * m.scale;
    let btn_y = ctx.frame.y + 3.5 * m.scale;
    let btn_fill = ink_primary.with_alpha(if lum > 0.36 { 0.09 } else { 0.14 });
    let plus_col = ink_primary.with_alpha(0.76);
    let cx = btn_x + btn_sz * 0.5;
    let cy = btn_y + btn_sz * 0.5;
    let arm = btn_sz * 0.24;
    let stroke_w = (1.5 * m.scale.sqrt()).clamp(1.5, 2.2);
    nodes.push(SceneNode::RoundedRect {
        rect: RectF::new(btn_x, btn_y, btn_sz, btn_sz),
        radius: btn_sz * 0.5,
        smoothing: 0.4,
        fill: Some(btn_fill),
        stroke: None,
        interactive_action: Some("sticky_add_new".to_string()),
    });
    nodes.push(SceneNode::Line {
        x1: cx - arm,
        y1: cy,
        x2: cx + arm,
        y2: cy,
        color: plus_col,
        width: stroke_w,
    });
    nodes.push(SceneNode::Line {
        x1: cx,
        y1: cy - arm,
        x2: cx,
        y2: cy + arm,
        color: plus_col,
        width: stroke_w,
    });

    nodes
}

pub fn create_next_sticky_note_slot(
    existing_slots: &[WidgetStackSlot],
    source_slot_id: &str,
    source_rect: Option<RectF>,
    unique_suffix: u64,
) -> WidgetStackSlot {
    const TILTS: [f32; 6] = [-3.2, 2.5, -1.8, 3.6, -2.7, 1.9];
    let source = existing_slots.iter().find(|s| s.slot_id == source_slot_id);
    let source_widget = source.and_then(|s| s.active_widget());
    let paper_count = existing_slots
        .iter()
        .filter(|s| {
            s.active_widget()
                .map(|w| w.widget_type == "paper_sticky_note")
                .unwrap_or(false)
        })
        .count();

    let source_color = source_widget
        .and_then(|w| w.settings.get("paper_color"))
        .and_then(|v| v.as_str())
        .unwrap_or("");
    let mut color_idx = paper_count % STICKY_PRESET_COLORS.len();
    if STICKY_PRESET_COLORS[color_idx].eq_ignore_ascii_case(source_color) {
        color_idx = (color_idx + 1) % STICKY_PRESET_COLORS.len();
    }
    let note_style = source_widget
        .and_then(|w| w.settings.get("note_style"))
        .and_then(|v| v.as_str())
        .filter(|s| STICKY_STYLES.contains(s))
        .unwrap_or("tape");
    let show_lines = source_widget
        .and_then(|w| w.settings.get("show_lines"))
        .and_then(|v| v.as_bool())
        .unwrap_or(true);

    WidgetStackSlot {
        slot_id: format!("slot_sticky_{unique_suffix}"),
        monitor_id: source
            .map(|s| s.monitor_id.clone())
            .unwrap_or_else(|| "primary".to_string()),
        size: source.map(|s| s.size).unwrap_or(WidgetSize::Small),
        grid_col: 0,
        grid_row: 0,
        pos_x: source_rect.map(|r| r.x + r.w + 16.0),
        pos_y: source_rect.map(|r| r.y),
        active_index: 0,
        auto_rotate_minutes: 0,
        widgets: vec![WidgetInstance {
            instance_id: format!("w_sticky_{unique_suffix}"),
            widget_type: "paper_sticky_note".to_string(),
            style_override: None,
            settings: serde_json::json!({
                "paper_color": STICKY_PRESET_COLORS[color_idx],
                "note_style": note_style,
                "tilt_deg": TILTS[paper_count % TILTS.len()],
                "show_lines": show_lines,
                "title": "",
                "text": "",
            }),
        }],
    }
}
