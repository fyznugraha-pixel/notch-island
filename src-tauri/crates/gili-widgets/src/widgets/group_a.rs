use crate::config::WidgetSize;
use crate::layout::{RectF, SceneNode, TextAlign};
use crate::widgets::{
    action_pill, empty_state_nodes, is_english, local_datetime_parts, localized_day_name,
    localized_month_name, text_node, WidgetBuildCtx,
};

pub fn days_in_month(year: i32, month: u32) -> u32 {
    let leap = (year % 4 == 0 && year % 100 != 0) || (year % 400 == 0);
    match month {
        1 | 3 | 5 | 7 | 8 | 10 | 12 => 31,
        4 | 6 | 9 | 11 => 30,
        2 => {
            if leap {
                29
            } else {
                28
            }
        }
        _ => 30,
    }
}

/// Returns Sunday-based index (`0 = Minggu .. 6 = Sabtu`) for day 1 of `(year, month)`.
pub fn first_weekday_of_month(year: i32, month: u32) -> u32 {
    const OFFSETS: [i32; 12] = [0, 3, 2, 5, 0, 3, 5, 1, 4, 6, 2, 4];
    let mut y = year;
    if month < 3 {
        y -= 1;
    }
    let m_idx = (month as usize).saturating_sub(1).min(11);
    ((y + y / 4 - y / 100 + y / 400 + OFFSETS[m_idx] + 1).rem_euclid(7)) as u32
}

fn push_month_grid_nodes(
    ctx: &WidgetBuildCtx<'_>,
    nodes: &mut Vec<SceneNode>,
    grid_rect: RectF,
    year: i32,
    month: u32,
    today: u32,
    mark_events: bool,
) {
    let total_days = days_in_month(year, month);
    let first_dow = first_weekday_of_month(year, month);
    let week_rows = ((first_dow + total_days + 6) / 7).clamp(4, 6);
    let total_rows = week_rows + 1; // +1 for weekday header

    let col_w = grid_rect.w / 7.0;
    let row_h = grid_rect.h / total_rows as f32;
    let cell_scale = col_w.min(row_h);
    let header_fs = (cell_scale * 0.56).clamp(9.5, 14.5);
    let day_fs = (cell_scale * 0.58).clamp(9.5, 15.0);

    let labels = if is_english(ctx) {
        ["S", "M", "T", "W", "T", "F", "S"]
    } else {
        ["M", "S", "S", "R", "K", "J", "S"]
    };
    for (i, lbl) in labels.iter().enumerate() {
        let x = grid_rect.x + i as f32 * col_w;
        let y = grid_rect.y + (row_h - header_fs * 1.25) * 0.5;
        nodes.push(text_node(
            RectF::new(x, y, col_w, row_h),
            *lbl,
            header_fs,
            700,
            ctx.pal.secondary,
            TextAlign::Center,
            false,
        ));
    }

    let dim_day = ctx
        .pal
        .primary
        .with_alpha((ctx.pal.primary.a * 0.72).clamp(0.0, 1.0));
    for d in 1..=total_days {
        let slot_idx = first_dow + (d - 1);
        let col = slot_idx % 7;
        let row = 1 + slot_idx / 7;
        let cx = grid_rect.x + col as f32 * col_w;
        let cy = grid_rect.y + row as f32 * row_h;

        let is_today = d == today;
        let cur_fs = if is_today { day_fs + 1.4 } else { day_fs };
        let text_y = cy + (row_h - cur_fs * 1.25) * 0.46;
        nodes.push(text_node(
            RectF::new(cx, text_y, col_w, row_h),
            format!("{}", d),
            cur_fs,
            if is_today { 900 } else { 400 },
            if is_today { ctx.pal.accent } else { dim_day },
            TextAlign::Center,
            true,
        ));

        if mark_events && !is_today && !ctx.hub.frontend.events.is_empty() {
            let day_suffix = format!("-{:02}-{:02}", month, d);
            let has_ev = ctx.hub.frontend.events.iter().any(|ev| {
                ev.date_key
                    .as_deref()
                    .map(|k| k.ends_with(&day_suffix))
                    .unwrap_or(false)
            });
            if has_ev {
                nodes.push(SceneNode::RoundedRect {
                    rect: RectF::new(cx + col_w * 0.5 - 1.5, cy + row_h - 3.5, 3.0, 3.0),
                    radius: 1.5,
                    smoothing: 0.0,
                    fill: Some(ctx.pal.accent),
                    stroke: None,
                    interactive_action: None,
                });
            }
        }
    }
}

/// 1. Kalender multi-tipe (Bulan Minimalis, Bulan + Judul, Tanggal Fokus, Tanggal + Agenda)
pub fn build_calendar_agenda(ctx: &WidgetBuildCtx<'_>) -> Vec<SceneNode> {
    let inner = ctx.frame.inset(16.0);
    let (year, month, day, _, _, _, dow) = local_datetime_parts();
    let style = ctx
        .instance
        .settings
        .get("calendar_style")
        .and_then(|v| v.as_str())
        .unwrap_or("bulan_minimal");
    let events = &ctx.hub.frontend.events;
    let mut nodes = Vec::new();

    match style {
        "bulan_minimal" => {
            if ctx.size == WidgetSize::Medium {
                let en = is_english(ctx);
                let left_w = (inner.w * 0.34).clamp(74.0, 108.0);
                nodes.push(text_node(
                    RectF::new(inner.x, inner.y + 4.0, left_w, 16.0),
                    localized_day_name(dow, en).to_uppercase(),
                    10.5,
                    600,
                    ctx.pal.secondary,
                    TextAlign::Left,
                    false,
                ));
                nodes.push(text_node(
                    RectF::new(inner.x, inner.y + 18.0, left_w, 46.0),
                    format!("{}", day),
                    38.0,
                    700,
                    ctx.pal.primary,
                    TextAlign::Left,
                    true,
                ));
                nodes.push(text_node(
                    RectF::new(inner.x, inner.y + 66.0, left_w, 18.0),
                    localized_month_name(month, en),
                    11.5,
                    500,
                    ctx.pal.secondary,
                    TextAlign::Left,
                    false,
                ));
                let grid_x = inner.x + left_w + 6.0;
                let grid_rect = RectF::new(grid_x, inner.y, inner.w - left_w - 6.0, inner.h);
                push_month_grid_nodes(ctx, &mut nodes, grid_rect, year, month, day, false);
            } else {
                let grid_pad = if ctx.size == WidgetSize::Large {
                    6.0
                } else {
                    0.0
                };
                push_month_grid_nodes(
                    ctx,
                    &mut nodes,
                    inner.inset(grid_pad),
                    year,
                    month,
                    day,
                    false,
                );
            }
        }
        "bulan_header" => {
            let head_h = if inner.h < 120.0 { 18.0 } else { 24.0 };
            let en = is_english(ctx);
            nodes.push(text_node(
                RectF::new(inner.x + 2.0, inner.y, inner.w - 4.0, head_h),
                format!("{} {}", localized_month_name(month, en), year),
                if ctx.size == WidgetSize::Large {
                    16.0
                } else {
                    12.5
                },
                700,
                ctx.pal.primary,
                TextAlign::Left,
                false,
            ));
            let grid_rect = RectF::new(
                inner.x,
                inner.y + head_h + 2.0,
                inner.w,
                (inner.h - head_h - 2.0).max(40.0),
            );
            push_month_grid_nodes(ctx, &mut nodes, grid_rect, year, month, day, true);
        }
        "tanggal_fokus" => {
            let en = is_english(ctx);
            let big_num_fs = if ctx.size == WidgetSize::Large {
                92.0
            } else if inner.h < 120.0 {
                44.0
            } else {
                54.0
            };
            nodes.push(text_node(
                RectF::new(inner.x, inner.y + 4.0, inner.w, 18.0),
                localized_day_name(dow, en).to_uppercase(),
                12.0,
                600,
                ctx.pal.secondary,
                TextAlign::Center,
                false,
            ));
            nodes.push(text_node(
                RectF::new(inner.x, inner.y + 22.0, inner.w, big_num_fs * 1.1),
                format!("{}", day),
                big_num_fs,
                700,
                ctx.pal.primary,
                TextAlign::Center,
                true,
            ));
            nodes.push(text_node(
                RectF::new(inner.x, inner.y + inner.h - 20.0, inner.w, 18.0),
                format!("{} {}", localized_month_name(month, en), year),
                12.5,
                500,
                ctx.pal.secondary,
                TextAlign::Center,
                false,
            ));
        }
        _ => {
            let en = is_english(ctx);
            // "tanggal_agenda": Tanggal & daftar agenda dari modul Kalender Gili
            nodes.push(text_node(
                RectF::new(inner.x, inner.y, inner.w, 16.0),
                format!(
                    "{}, {}",
                    localized_day_name(dow, en).to_uppercase(),
                    localized_month_name(month, en).to_uppercase()
                ),
                11.0,
                600,
                ctx.pal.secondary,
                TextAlign::Left,
                false,
            ));
            nodes.push(text_node(
                RectF::new(inner.x, inner.y + 15.0, 72.0, 44.0),
                format!("{}", day),
                if inner.h < 120.0 { 32.0 } else { 38.0 },
                700,
                ctx.pal.primary,
                TextAlign::Left,
                true,
            ));

            match ctx.size {
                WidgetSize::Small => {
                    if let Some(ev) = events.first() {
                        nodes.push(crate::widgets::text_node_line(
                            RectF::new(inner.x, inner.y + inner.h - 38.0, inner.w, 16.0),
                            &ev.time,
                            11.0,
                            600,
                            ctx.pal.secondary,
                            TextAlign::Left,
                            true,
                        ));
                        nodes.push(crate::widgets::text_node_line(
                            RectF::new(inner.x, inner.y + inner.h - 22.0, inner.w, 20.0),
                            &ev.title,
                            12.5,
                            600,
                            ctx.pal.primary,
                            TextAlign::Left,
                            false,
                        ));
                    } else {
                        nodes.push(text_node(
                            RectF::new(inner.x, inner.y + inner.h - 28.0, inner.w, 26.0),
                            if en {
                                "No events today"
                            } else {
                                "Tidak ada agenda hari ini"
                            },
                            11.5,
                            400,
                            ctx.pal.secondary,
                            TextAlign::Left,
                            false,
                        ));
                    }
                }
                WidgetSize::Medium | WidgetSize::Large => {
                    let right_x = inner.x + inner.w * 0.42;
                    let right_w = inner.w * 0.58;
                    nodes.push(crate::widgets::text_node_line(
                        RectF::new(inner.x, inner.y + 56.0, inner.w * 0.38, 18.0),
                        format!("{} {}", localized_month_name(month, en), year),
                        11.5,
                        500,
                        ctx.pal.secondary,
                        TextAlign::Left,
                        false,
                    ));

                    if events.is_empty() {
                        nodes.push(text_node(
                            RectF::new(right_x, inner.y + 18.0, right_w, 36.0),
                            if en {
                                "No events. Tap to add in Gili."
                            } else {
                                "Agenda kosong. Ketuk untuk menambah di Gili."
                            },
                            12.0,
                            400,
                            ctx.pal.secondary,
                            TextAlign::Left,
                            false,
                        ));
                    } else {
                        let max_items = if ctx.size == WidgetSize::Large { 6 } else { 3 };
                        let pill_stroke = ctx
                            .pal
                            .inner_border
                            .map(|b| (b.with_alpha(b.a * 0.55), 0.7));
                        for (i, ev) in events.iter().take(max_items).enumerate() {
                            let y = inner.y + 8.0 + i as f32 * 34.0;
                            if y + 30.0 > inner.y + inner.h {
                                break;
                            }
                            nodes.push(SceneNode::RoundedRect {
                                rect: RectF::new(right_x, y, right_w, 30.0),
                                radius: 10.0,
                                smoothing: 0.60,
                                fill: Some(ctx.pal.surface_chip),
                                stroke: pill_stroke,
                                interactive_action: None,
                            });
                            nodes.push(SceneNode::Line {
                                x1: right_x + 7.0,
                                y1: y + 6.0,
                                x2: right_x + 7.0,
                                y2: y + 24.0,
                                color: ctx.pal.accent,
                                width: 2.5,
                            });
                            nodes.push(crate::widgets::text_node_line(
                                RectF::new(right_x + 14.0, y + 2.0, right_w - 20.0, 15.0),
                                &ev.title,
                                12.0,
                                600,
                                ctx.pal.primary,
                                TextAlign::Left,
                                false,
                            ));
                            nodes.push(crate::widgets::text_node_line(
                                RectF::new(right_x + 14.0, y + 16.0, right_w - 20.0, 13.0),
                                &ev.time,
                                10.0,
                                500,
                                ctx.pal.secondary,
                                TextAlign::Left,
                                true,
                            ));
                        }
                    }

                    if ctx.size == WidgetSize::Large {
                        let grid_rect = RectF::new(
                            inner.x,
                            inner.y + 88.0,
                            (inner.w * 0.44).max(120.0),
                            (inner.h - 90.0).max(96.0),
                        );
                        push_month_grid_nodes(ctx, &mut nodes, grid_rect, year, month, day, false);
                    }
                }
            }
        }
    }

    nodes
}

/// 2. Jadwal kuliah mingguan (M, L)
pub fn build_class_schedule(ctx: &WidgetBuildCtx<'_>) -> Vec<SceneNode> {
    let en = is_english(ctx);
    let classes = &ctx.hub.frontend.classes;
    if classes.is_empty() {
        return empty_state_nodes(
            ctx,
            if en { "Class Schedule" } else { "Jadwal Kuliah" },
            if en {
                "No courses registered in the Gili Schedule module yet."
            } else {
                "Belum ada mata kuliah terdaftar di modul Jadwal Gili."
            },
            if en { "Set Schedule" } else { "Atur Jadwal" },
            "open_class_schedule",
        );
    }
    let inner = ctx.frame.inset(14.0);
    let (_, _, _, _, _, _, dow) = local_datetime_parts();
    let mut nodes = vec![
        text_node(
            RectF::new(inner.x, inner.y, inner.w * 0.65, 20.0),
            if en { "Class Schedule" } else { "Jadwal Kuliah" },
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
            localized_day_name(dow, en),
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
            .map(|d| format!("{} . ", localized_day_name(d as u32, en)))
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
    let en = is_english(ctx);
    let inner = ctx.frame.inset(14.0);
    let f = &ctx.hub.frontend;
    let title = if f.habit_title.is_empty() {
        if en {
            "Daily Habit"
        } else {
            "Kebiasaan Harian"
        }
    } else {
        &f.habit_title
    };

    let cols = if ctx.size == WidgetSize::Large {
        16
    } else {
        14
    };
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
            if en {
                format!("{} days", f.habit_count)
            } else {
                format!("{} hari", f.habit_count)
            },
            13.0,
            700,
            ctx.pal.positive,
            TextAlign::Right,
            true,
        ),
        SceneNode::HeatmapGrid {
            rect: RectF::new(inner.x, inner.y + 28.0, inner.w, (inner.h - 46.0).max(60.0)),
            cols,
            rows,
            levels,
            base_color: ctx.pal.surface_chip,
            accent_color: ctx.pal.positive,
        },
        text_node(
            RectF::new(inner.x, inner.y + inner.h - 15.0, inner.w, 15.0),
            if en {
                format!("{} days recorded in history", f.habit_history.len())
            } else {
                format!("{} hari tercatat di riwayat", f.habit_history.len())
            },
            11.0,
            400,
            ctx.pal.secondary,
            TextAlign::Left,
            true,
        ),
    ];

    if f.habit_history.is_empty() && f.habit_count == 0 {
        nodes.extend(action_pill(
            RectF::new(
                inner.x + inner.w - 92.0,
                inner.y + inner.h - 24.0,
                92.0,
                24.0,
            ),
            if en { "Start Log" } else { "Mulai Catat" },
            ctx.pal.positive.with_alpha(0.24),
            ctx.pal.primary,
            "open_streak",
        ));
    }
    nodes
}

/// 4. Performa sistem: CPU per core, RAM, GPU, disk, jaringan (S, M, L)
pub fn build_system_performance(ctx: &WidgetBuildCtx<'_>) -> Vec<SceneNode> {
    let inner = ctx.frame.inset(16.0);
    let sys = &ctx.hub.system;
    let mut nodes = Vec::new();

    match ctx.size {
        WidgetSize::Small => {
            nodes.push(crate::widgets::text_node_line(
                RectF::new(inner.x, inner.y, inner.w, 16.0),
                "CPU & RAM",
                11.0,
                700,
                ctx.pal.secondary,
                TextAlign::Left,
                false,
            ));
            let cx = inner.x + inner.w * 0.5;
            let ring_r = (inner.h * 0.27).clamp(28.0, 35.0);
            let cy = inner.y + inner.h * 0.50;
            nodes.push(SceneNode::ProgressRing {
                cx,
                cy,
                radius: ring_r,
                stroke_width: 7.5,
                progress: sys.cpu_total_pct / 100.0,
                track_color: ctx.pal.surface_chip,
                fill_color: ctx.pal.accent,
            });
            nodes.push(crate::widgets::text_node_line(
                RectF::new(cx - 28.0, cy - 11.0, 56.0, 22.0),
                format!("{:.0}%", sys.cpu_total_pct),
                17.0,
                700,
                ctx.pal.primary,
                TextAlign::Center,
                true,
            ));
            nodes.push(crate::widgets::text_node_line(
                RectF::new(inner.x, inner.y + inner.h - 16.0, inner.w, 16.0),
                format!("RAM {:.1}/{:.0} GB", sys.ram_used_gb, sys.ram_total_gb),
                11.0,
                500,
                ctx.pal.secondary,
                TextAlign::Center,
                true,
            ));
        }
        WidgetSize::Medium | WidgetSize::Large => {
            let en = is_english(ctx);
            nodes.push(crate::widgets::text_node_line(
                RectF::new(inner.x, inner.y, inner.w * 0.52, 16.0),
                if en {
                    "SYSTEM PERFORMANCE"
                } else {
                    "PERFORMA SISTEM"
                },
                10.5,
                700,
                ctx.pal.secondary,
                TextAlign::Left,
                false,
            ));
            nodes.push(crate::widgets::text_node_line(
                RectF::new(inner.x + inner.w * 0.52, inner.y, inner.w * 0.48, 16.0),
                format!("RAM {:.1}/{:.0} GB", sys.ram_used_gb, sys.ram_total_gb),
                10.5,
                600,
                ctx.pal.secondary,
                TextAlign::Right,
                true,
            ));

            let area_y = inner.y + 20.0;
            let ring_r = if inner.h < 108.0 { 22.0 } else { 25.0 };
            let cy = area_y + ring_r + 2.0;
            let cx1 = inner.x + ring_r + 2.0;
            let cx2 = cx1 + ring_r * 2.0 + 12.0;

            nodes.push(SceneNode::ProgressRing {
                cx: cx1,
                cy,
                radius: ring_r,
                stroke_width: 6.0,
                progress: sys.cpu_total_pct / 100.0,
                track_color: ctx.pal.surface_chip,
                fill_color: ctx.pal.accent,
            });
            nodes.push(crate::widgets::text_node_line(
                RectF::new(cx1 - ring_r + 4.0, cy - 9.0, (ring_r - 4.0) * 2.0, 18.0),
                format!("{:.0}%", sys.cpu_total_pct),
                13.5,
                700,
                ctx.pal.primary,
                TextAlign::Center,
                true,
            ));
            nodes.push(crate::widgets::text_node_line(
                RectF::new(cx1 - ring_r, cy + ring_r + 3.0, ring_r * 2.0, 13.0),
                "CPU",
                9.5,
                600,
                ctx.pal.secondary,
                TextAlign::Center,
                false,
            ));

            nodes.push(SceneNode::ProgressRing {
                cx: cx2,
                cy,
                radius: ring_r,
                stroke_width: 6.0,
                progress: sys.ram_pct / 100.0,
                track_color: ctx.pal.surface_chip,
                fill_color: ctx.pal.positive,
            });
            nodes.push(crate::widgets::text_node_line(
                RectF::new(cx2 - ring_r + 4.0, cy - 9.0, (ring_r - 4.0) * 2.0, 18.0),
                format!("{:.0}%", sys.ram_pct),
                13.5,
                700,
                ctx.pal.primary,
                TextAlign::Center,
                true,
            ));
            nodes.push(crate::widgets::text_node_line(
                RectF::new(cx2 - ring_r, cy + ring_r + 3.0, ring_r * 2.0, 13.0),
                "RAM",
                9.5,
                600,
                ctx.pal.secondary,
                TextAlign::Center,
                false,
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
            let bars_x = cx2 + ring_r + 14.0;
            let bars_w = (inner.x + inner.w - bars_x).max(40.0);
            nodes.push(SceneNode::BarChart {
                rect: RectF::new(bars_x, area_y + 4.0, bars_w, ring_r * 2.0 - 2.0),
                values: core_vals,
                colors: vec![ctx.pal.accent],
                gap: 3.0,
            });

            // GPU & Network summary
            let gpu_label = match (sys.gpu_pct, sys.gpu_temp_c) {
                (Some(p), Some(t)) => format!("GPU {}% . {}C", p, t),
                (Some(p), None) => format!("GPU {}%", p),
                _ => sys
                    .gpu_name
                    .as_deref()
                    .map(|raw| {
                        let cleaned = raw
                            .replace("(R)", "")
                            .replace("(TM)", "")
                            .replace("Graphics", "")
                            .split_whitespace()
                            .collect::<Vec<_>>()
                            .join(" ");
                        if cleaned.is_empty() {
                            if en { "Active GPU" } else { "GPU aktif" }.to_string()
                        } else {
                            cleaned
                        }
                    })
                    .unwrap_or_else(|| if en { "Active GPU" } else { "GPU aktif" }.to_string()),
            };
            let footer_y = if ctx.size == WidgetSize::Large {
                cy + ring_r + 24.0
            } else {
                inner.y + inner.h - 15.0
            };
            nodes.push(crate::widgets::text_node_line(
                RectF::new(inner.x, footer_y, inner.w * 0.46, 15.0),
                gpu_label,
                11.0,
                600,
                ctx.pal.primary,
                TextAlign::Left,
                true,
            ));
            nodes.push(crate::widgets::text_node_line(
                RectF::new(inner.x + inner.w * 0.48, footer_y, inner.w * 0.52, 15.0),
                format!("D {:.1}  U {:.1} Mbps", sys.net_down_mbps, sys.net_up_mbps),
                11.0,
                500,
                ctx.pal.secondary,
                TextAlign::Right,
                true,
            ));

            if ctx.size == WidgetSize::Large {
                let mut dy = footer_y + 26.0;
                nodes.push(crate::widgets::text_node_line(
                    RectF::new(inner.x, dy, inner.w, 16.0),
                    if en {
                        "DISK STORAGE"
                    } else {
                        "PENYIMPANAN DISK"
                    },
                    10.5,
                    700,
                    ctx.pal.secondary,
                    TextAlign::Left,
                    false,
                ));
                dy += 20.0;
                for d in sys.disks.iter().take(4) {
                    nodes.push(crate::widgets::text_node_line(
                        RectF::new(inner.x, dy, inner.w, 15.0),
                        format!(
                            "{}  {:.0} / {:.0} GB ({:.0}%)",
                            d.mount, d.used_gb, d.total_gb, d.usage_pct
                        ),
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
                        fill_color: if d.usage_pct > 85.0 {
                            ctx.pal.danger
                        } else {
                            ctx.pal.accent
                        },
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
    let en = is_english(ctx);
    let m = &ctx.hub.media;
    if m.title.trim().is_empty() {
        return empty_state_nodes(
            ctx,
            "Now Playing",
            if en {
                "Play music on Spotify, browser, or any player to see lyrics here."
            } else {
                "Putar musik di Spotify, browser, atau pemutar lain untuk melihat lirik di sini."
            },
            if en { "Open Media" } else { "Buka Media" },
            "open_media",
        );
    }
    let inner = ctx.frame.inset(14.0);
    let art_src = m
        .thumbnail_path_or_data
        .as_deref()
        .map(str::trim)
        .filter(|s| !s.is_empty());
    let art_sz = match ctx.size {
        WidgetSize::Small => 40.0,
        WidgetSize::Medium => (inner.h * 0.44).clamp(46.0, 52.0),
        WidgetSize::Large => 56.0,
    };
    let art_rect = RectF::new(inner.x, inner.y, art_sz, art_sz);
    let art_radius = 14.0;
    let ctrl_reserved = if ctx.size == WidgetSize::Small { 28.0 } else { 86.0 };
    let text_x = inner.x + art_sz + 11.0;
    let text_w = (inner.x + inner.w - text_x - ctrl_reserved).max(40.0);

    let mut nodes = vec![SceneNode::RoundedRect {
        rect: art_rect,
        radius: art_radius,
        smoothing: 0.65,
        fill: Some(ctx.pal.surface_chip),
        stroke: ctx
            .pal
            .inner_border
            .map(|b| (b.with_alpha(b.a * 0.60), 0.75)),
        interactive_action: None,
    }];
    if let Some(src) = art_src {
        nodes.push(SceneNode::ImageRef {
            rect: art_rect,
            radius: art_radius,
            source_path: src.to_string(),
            interactive_action: None,
        });
    } else {
        nodes.push(SceneNode::IconGlyph {
            rect: RectF::new(
                art_rect.x + (art_sz - 18.0) * 0.5,
                art_rect.y + (art_sz - 18.0) * 0.5,
                18.0,
                18.0,
            ),
            glyph: "\u{E8D6}".into(),
            size: 16.0,
            color: ctx.pal.secondary,
            interactive_action: None,
        });
    }

    let ctrl_color = ctx
        .pal
        .primary
        .with_alpha((ctx.pal.primary.a * 0.92).clamp(0.0, 1.0));
    let btn_sz = 24.0;
    let btn_y = inner.y + ((art_sz - btn_sz) * 0.5).max(1.0);
    let push_ctrl_btn = |nodes: &mut Vec<SceneNode>, x: f32, glyph: &str, size: f32, act: &str| {
        nodes.push(SceneNode::RoundedRect {
            rect: RectF::new(x, btn_y, btn_sz, btn_sz),
            radius: btn_sz * 0.5,
            smoothing: 0.65,
            fill: Some(ctx.pal.surface_chip),
            stroke: ctx
                .pal
                .inner_border
                .map(|b| (b.with_alpha(b.a * 0.60), 0.7)),
            interactive_action: Some(act.to_string()),
        });
        nodes.push(SceneNode::IconGlyph {
            rect: RectF::new(x, btn_y, btn_sz, btn_sz),
            glyph: glyph.to_string(),
            size,
            color: ctrl_color,
            interactive_action: Some(act.to_string()),
        });
    };
    let play_glyph = if m.is_playing { "\u{E769}" } else { "\u{E768}" };
    if ctx.size == WidgetSize::Small {
        push_ctrl_btn(
            &mut nodes,
            inner.x + inner.w - btn_sz,
            play_glyph,
            11.0,
            "toggle_media_playback",
        );
    } else {
        let right_edge = inner.x + inner.w;
        push_ctrl_btn(&mut nodes, right_edge - 80.0, "\u{E892}", 10.5, "media_prev");
        push_ctrl_btn(
            &mut nodes,
            right_edge - 52.0,
            play_glyph,
            11.0,
            "toggle_media_playback",
        );
        push_ctrl_btn(&mut nodes, right_edge - 24.0, "\u{E893}", 10.5, "media_next");
    }

    let title_y = inner.y + ((art_sz - 34.0) * 0.5).max(1.0);
    nodes.push(crate::widgets::text_node_line(
        RectF::new(text_x, title_y, text_w, 18.0),
        &m.title,
        13.5,
        700,
        ctx.pal.primary,
        TextAlign::Left,
        false,
    ));
    nodes.push(crate::widgets::text_node_line(
        RectF::new(text_x, title_y + 18.0, text_w, 16.0),
        &m.artist,
        11.5,
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

    let bar_y = inner.y + inner.h - 5.0;
    let lyric_top = inner.y + art_sz + 7.0;
    let lyrics_avail_h = (bar_y - 6.0 - lyric_top).max(15.0);
    let lyric_text = if !m.active_lyric_line.is_empty() {
        m.active_lyric_line.clone()
    } else if m.lyrics_state == "loading" {
        if en {
            "Loading lyrics..."
        } else {
            "Memuat lirik..."
        }
        .to_string()
    } else {
        if en {
            "Lyrics unavailable for this track"
        } else {
            "Lirik tidak tersedia untuk lagu ini"
        }
        .to_string()
    };

    match ctx.size {
        WidgetSize::Small => {
            nodes.push(crate::widgets::text_node_line(
                RectF::new(inner.x, lyric_top, inner.w, lyrics_avail_h.min(20.0)),
                lyric_text,
                12.5,
                600,
                ctx.pal.primary,
                TextAlign::Left,
                false,
            ));
        }
        WidgetSize::Medium => {
            if lyrics_avail_h >= 42.0 && !m.next_lyric_line.is_empty() {
                nodes.push(crate::widgets::text_node_line(
                    RectF::new(inner.x, lyric_top, inner.w, 20.0),
                    lyric_text,
                    14.0,
                    700,
                    ctx.pal.primary,
                    TextAlign::Left,
                    false,
                ));
                nodes.push(crate::widgets::text_node_line(
                    RectF::new(
                        inner.x,
                        lyric_top + 21.0,
                        inner.w,
                        (bar_y - 6.0 - (lyric_top + 21.0)).max(15.0),
                    ),
                    &m.next_lyric_line,
                    12.0,
                    400,
                    ctx.pal.secondary,
                    TextAlign::Left,
                    false,
                ));
            } else {
                nodes.push(crate::widgets::text_node_line(
                    RectF::new(inner.x, lyric_top, inner.w, lyrics_avail_h.min(22.0)),
                    lyric_text,
                    14.0,
                    700,
                    ctx.pal.primary,
                    TextAlign::Left,
                    false,
                ));
            }
        }
        WidgetSize::Large => {
            if m.lyrics_lines.is_empty() {
                nodes.push(text_node(
                    RectF::new(inner.x, lyric_top + 6.0, inner.w, 40.0),
                    lyric_text,
                    14.5,
                    600,
                    ctx.pal.secondary,
                    TextAlign::Left,
                    false,
                ));
            } else {
                for (i, line) in m.lyrics_lines.iter().take(7).enumerate() {
                    let y = lyric_top + i as f32 * 28.0;
                    if y + 24.0 > bar_y - 4.0 {
                        break;
                    }
                    let is_active = line == &m.active_lyric_line;
                    nodes.push(text_node(
                        RectF::new(inner.x, y, inner.w, 24.0),
                        line,
                        if is_active { 14.5 } else { 12.5 },
                        if is_active { 700 } else { 400 },
                        if is_active {
                            ctx.pal.primary
                        } else {
                            ctx.pal.secondary
                        },
                        TextAlign::Left,
                        false,
                    ));
                }
            }
        }
    }

    nodes.push(SceneNode::ProgressBar {
        rect: RectF::new(inner.x, bar_y, inner.w, 4.5),
        progress,
        track_color: ctx.pal.surface_chip,
        fill_color: ctx.pal.accent,
        interactive_action: None,
    });
    nodes
}

fn weather_code_label(code: i32, en: bool) -> &'static str {
    if en {
        match code {
            0 => "Clear",
            1..=3 => "Cloudy",
            45 | 48 => "Foggy",
            51..=57 => "Drizzle",
            61..=67 | 80..=82 => "Rain",
            95..=99 => "Thunderstorm",
            _ => "Cloudy",
        }
    } else {
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
}

fn weather_icon_accent(ctx: &WidgetBuildCtx<'_>, code: i32) -> crate::config::RgbaColor {
    if ctx.pal.is_monochrome {
        return match code {
            0..=2 | 95..=99 => ctx.pal.primary,
            _ => ctx.pal.primary.with_alpha((ctx.pal.primary.a * 0.85).clamp(0.0, 1.0)),
        };
    }
    match code {
        0..=2 | 95..=99 => ctx.pal.warning,
        51..=67 | 80..=82 => crate::config::RgbaColor::new(0x60, 0xA5, 0xFA, 1.0),
        _ => ctx.pal.secondary,
    }
}

/// 6. Cuaca: sekarang, per jam, 5 hari (S, M, L)
pub fn build_weather_forecast(ctx: &WidgetBuildCtx<'_>) -> Vec<SceneNode> {
    let en = is_english(ctx);
    let w = &ctx.hub.weather;
    if !w.available {
        return empty_state_nodes(
            ctx,
            if en { "Weather" } else { "Cuaca" },
            w.error.as_deref().unwrap_or(if en {
                "Weather data not loaded. Check connection or set city."
            } else {
                "Data cuaca belum termuat. Periksa koneksi atau atur kota."
            }),
            if en { "Retry" } else { "Coba Lagi" },
            "refresh_weather",
        );
    }
    let inner = ctx.frame.inset(16.0);
    let mut nodes = vec![
        crate::widgets::text_node_line(
            RectF::new(inner.x, inner.y, inner.w - 30.0, 16.0),
            &w.location_name,
            12.5,
            600,
            ctx.pal.primary,
            TextAlign::Left,
            false,
        ),
        SceneNode::WeatherIcon {
            rect: RectF::new(inner.x + inner.w - 26.0, inner.y - 4.0, 26.0, 26.0),
            code: w.current_code,
            cloud_color: ctx.pal.primary,
            accent_color: weather_icon_accent(ctx, w.current_code),
        },
        crate::widgets::text_node_line(
            RectF::new(inner.x, inner.y + 15.0, 108.0, 48.0),
            format!("{:.0}°", w.current_temp_c),
            42.0,
            300,
            ctx.pal.primary,
            TextAlign::Left,
            true,
        ),
        crate::widgets::text_node_line(
            RectF::new(inner.x, inner.y + 62.0, 112.0, 16.0),
            weather_code_label(w.current_code, en),
            12.0,
            500,
            ctx.pal.secondary,
            TextAlign::Left,
            false,
        ),
    ];

    if let Some(today) = w.daily.first() {
        if inner.y + 78.0 + 14.0 <= inner.y + inner.h {
            nodes.push(crate::widgets::text_node_line(
                RectF::new(inner.x, inner.y + 78.0, 112.0, 14.0),
                if en {
                    format!("H:{:.0}° L:{:.0}°", today.max_c, today.min_c)
                } else {
                    format!("T:{:.0}° R:{:.0}°", today.max_c, today.min_c)
                },
                10.5,
                600,
                ctx.pal.secondary,
                TextAlign::Left,
                true,
            ));
        }
    }

    if ctx.size != WidgetSize::Small && !w.hourly.is_empty() {
        let cols = w.hourly.len().min(5);
        let start_x = inner.x + 108.0;
        let col_w = (inner.w - 108.0) / cols as f32;
        for (i, pt) in w.hourly.iter().take(cols).enumerate() {
            let x = start_x + i as f32 * col_w;
            nodes.push(crate::widgets::text_node_line(
                RectF::new(x, inner.y + 20.0, col_w, 14.0),
                &pt.hour_label,
                10.0,
                500,
                ctx.pal.secondary,
                TextAlign::Center,
                true,
            ));
            nodes.push(SceneNode::WeatherIcon {
                rect: RectF::new(x + (col_w - 20.0) * 0.5, inner.y + 36.0, 20.0, 20.0),
                code: pt.code,
                cloud_color: ctx.pal.primary,
                accent_color: weather_icon_accent(ctx, pt.code),
            });
            nodes.push(crate::widgets::text_node_line(
                RectF::new(x, inner.y + 58.0, col_w, 17.0),
                format!("{:.0}°", pt.temp_c),
                13.0,
                700,
                ctx.pal.primary,
                TextAlign::Center,
                true,
            ));
        }
    }

    if ctx.size == WidgetSize::Large && !w.daily.is_empty() {
        let min_all = w
            .daily
            .iter()
            .take(5)
            .map(|d| d.min_c)
            .fold(f32::INFINITY, f32::min);
        let max_all = w
            .daily
            .iter()
            .take(5)
            .map(|d| d.max_c)
            .fold(f32::NEG_INFINITY, f32::max);
        let span = (max_all - min_all).max(1.0);
        let bar_col = if ctx.pal.is_monochrome {
            ctx.pal.accent
        } else {
            ctx.pal.warning
        };

        let mut y = inner.y + 104.0;
        nodes.push(crate::widgets::text_node_line(
            RectF::new(inner.x, y, inner.w, 16.0),
            if en {
                "5-DAY FORECAST"
            } else {
                "PRAKIRAAN 5 HARI"
            },
            10.5,
            700,
            ctx.pal.secondary,
            TextAlign::Left,
            false,
        ));
        y += 22.0;
        for d in w.daily.iter().take(5) {
            let hi_x = inner.x + inner.w - 32.0;
            let track_w = 54.0;
            let track_x = hi_x - 6.0 - track_w;
            let lo_x = track_x - 36.0;
            let day_w = (lo_x - inner.x - 26.0).max(52.0);
            nodes.push(crate::widgets::text_node_line(
                RectF::new(inner.x, y, day_w, 18.0),
                &d.day_label,
                12.5,
                600,
                ctx.pal.primary,
                TextAlign::Left,
                false,
            ));
            nodes.push(SceneNode::WeatherIcon {
                rect: RectF::new(inner.x + day_w + 2.0, y - 1.0, 20.0, 20.0),
                code: d.code,
                cloud_color: ctx.pal.primary,
                accent_color: weather_icon_accent(ctx, d.code),
            });
            nodes.push(crate::widgets::text_node_line(
                RectF::new(lo_x, y, 32.0, 18.0),
                format!("{:.0}°", d.min_c),
                12.0,
                500,
                ctx.pal.secondary,
                TextAlign::Right,
                true,
            ));
            nodes.push(SceneNode::RoundedRect {
                rect: RectF::new(track_x, y + 6.5, track_w, 5.0),
                radius: 2.5,
                smoothing: 0.5,
                fill: Some(ctx.pal.surface_chip),
                stroke: None,
                interactive_action: None,
            });
            let lo_frac = ((d.min_c - min_all) / span).clamp(0.0, 0.90);
            let hi_frac = ((d.max_c - min_all) / span).clamp(lo_frac + 0.10, 1.0);
            nodes.push(SceneNode::RoundedRect {
                rect: RectF::new(
                    track_x + lo_frac * track_w,
                    y + 6.5,
                    ((hi_frac - lo_frac) * track_w).max(6.0),
                    5.0,
                ),
                radius: 2.5,
                smoothing: 0.5,
                fill: Some(bar_col),
                stroke: None,
                interactive_action: None,
            });
            nodes.push(crate::widgets::text_node_line(
                RectF::new(hi_x, y, 32.0, 18.0),
                format!("{:.0}°", d.max_c),
                12.5,
                600,
                ctx.pal.primary,
                TextAlign::Right,
                true,
            ));
            y += 30.0;
        }
    }

    nodes
}

/// 7. To-do dengan grup (S, M, L)
pub fn build_todo_groups(ctx: &WidgetBuildCtx<'_>) -> Vec<SceneNode> {
    let en = is_english(ctx);
    let todos = &ctx.hub.frontend.todos;
    if todos.is_empty() {
        return empty_state_nodes(
            ctx,
            if en { "To-Do List" } else { "Daftar Tugas" },
            if en {
                "All tasks completed or no tasks added in Gili yet."
            } else {
                "Semua tugas selesai atau belum ada daftar tugas di Gili."
            },
            if en { "Add Task" } else { "Tambah Tugas" },
            "open_todo",
        );
    }
    let inner = ctx.frame.inset(16.0);
    let done = todos.iter().filter(|t| t.completed).count();
    let count_str = format!("{}/{}", done, todos.len());
    let mut nodes = vec![
        crate::widgets::text_node_line(
            RectF::new(inner.x, inner.y, inner.w - 50.0, 20.0),
            if en { "Tasks" } else { "Tugas" },
            15.0,
            700,
            ctx.pal.primary,
            TextAlign::Left,
            false,
        ),
        SceneNode::RoundedRect {
            rect: RectF::new(inner.x + inner.w - 44.0, inner.y, 44.0, 20.0),
            radius: 10.0,
            smoothing: 0.65,
            fill: Some(ctx.pal.surface_chip),
            stroke: None,
            interactive_action: None,
        },
        crate::widgets::text_node_line(
            RectF::new(inner.x + inner.w - 44.0, inner.y + 2.0, 44.0, 16.0),
            count_str,
            11.5,
            700,
            ctx.pal.accent,
            TextAlign::Center,
            true,
        ),
        SceneNode::Line {
            x1: inner.x,
            y1: inner.y + 24.0,
            x2: inner.x + inner.w,
            y2: inner.y + 24.0,
            color: ctx.pal.secondary.with_alpha(0.18),
            width: 0.75,
        },
    ];

    let max_rows = match ctx.size {
        WidgetSize::Small => 3,
        WidgetSize::Medium => 4,
        WidgetSize::Large => 9,
    };

    for (i, t) in todos.iter().take(max_rows).enumerate() {
        let y = inner.y + 30.0 + i as f32 * 25.0;
        if y + 20.0 > inner.y + inner.h {
            break;
        }
        let bullet = if t.completed { "✓" } else { "○" };
        let grp = t
            .group
            .as_deref()
            .map(|g| format!("[{}] ", g))
            .unwrap_or_default();
        nodes.push(crate::widgets::text_node_line(
            RectF::new(inner.x, y, inner.w, 20.0),
            format!("{} {}{}", bullet, grp, t.text),
            12.5,
            if t.completed { 400 } else { 500 },
            if t.completed {
                ctx.pal.secondary
            } else {
                ctx.pal.primary
            },
            TextAlign::Left,
            false,
        ));
    }

    nodes
}

/// 8. Drop Zone (S, M)
pub fn build_drop_zone(ctx: &WidgetBuildCtx<'_>) -> Vec<SceneNode> {
    let en = is_english(ctx);
    let inner = ctx.frame.inset(14.0);
    let files = &ctx.hub.frontend.shelf_files;
    if files.is_empty() {
        return empty_state_nodes(
            ctx,
            "Drop Zone",
            if en {
                "File shelf is empty. Drag files into Gili Drop Zone."
            } else {
                "Rak berkas sementara kosong. Seret berkas ke Drop Zone Gili."
            },
            if en { "Open Shelf" } else { "Buka Rak" },
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
            if en {
                format!("{} files", files.len())
            } else {
                format!("{} berkas", files.len())
            },
            12.0,
            500,
            ctx.pal.secondary,
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
