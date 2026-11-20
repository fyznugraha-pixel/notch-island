use crate::config::WidgetSize;
use crate::layout::{RectF, SceneNode, TextAlign};
use crate::widgets::{action_pill, empty_state_nodes, text_node, WidgetBuildCtx};

fn format_idr(amount: i64) -> String {
    let neg = amount < 0;
    let digits = amount.unsigned_abs().to_string();
    let mut out = String::new();
    for (i, ch) in digits.chars().rev().enumerate() {
        if i > 0 && i % 3 == 0 {
            out.push('.');
        }
        out.push(ch);
    }
    let grouped: String = out.chars().rev().collect();
    if neg {
        format!("-Rp{}", grouped)
    } else {
        format!("Rp{}", grouped)
    }
}

/// 24. Jadwal sholat offline Kemenag RI + mode Ramadan (S, M, L)
pub fn build_prayer_times(ctx: &WidgetBuildCtx<'_>) -> Vec<SceneNode> {
    let inner = ctx.frame.inset(14.0);
    let p = &ctx.hub.prayer;
    let city = if p.city_name.is_empty() { "Jakarta" } else { &p.city_name };

    let mut nodes = vec![
        SceneNode::IconGlyph {
            rect: RectF::new(inner.x + inner.w - 22.0, inner.y - 2.0, 22.0, 22.0),
            glyph: "\u{E708}".into(),
            size: 15.0,
            color: ctx.pal.positive,
            interactive_action: None,
        },
        text_node(
            RectF::new(inner.x, inner.y, inner.w - 26.0, 16.0),
            format!("SHOLAT . {}", city.to_uppercase()),
            10.5,
            700,
            ctx.pal.positive,
            TextAlign::Left,
            false,
        ),
        text_node(
            RectF::new(inner.x, inner.y + 16.0, inner.w * 0.60, 42.0),
            if p.next_time.is_empty() { "--:--" } else { &p.next_time },
            34.0,
            700,
            ctx.pal.primary,
            TextAlign::Left,
            true,
        ),
        text_node(
            RectF::new(inner.x, inner.y + 56.0, inner.w, 18.0),
            format!("{} . {}", p.next_name, p.countdown_label),
            12.5,
            600,
            ctx.pal.secondary,
            TextAlign::Left,
            true,
        ),
    ];

    if p.ramadan_mode {
        nodes.push(text_node(
            RectF::new(inner.x + inner.w * 0.55, inner.y, inner.w * 0.45, 16.0),
            format!("Imsak {} | Buka {}", p.sahur_time, p.buka_time),
            10.5,
            600,
            ctx.pal.warning,
            TextAlign::Right,
            true,
        ));
    }

    if ctx.size != WidgetSize::Small {
        let rows = [
            ("Subuh", &p.times.subuh),
            ("Dzuhur", &p.times.dzuhur),
            ("Ashar", &p.times.ashar),
            ("Maghrib", &p.times.maghrib),
            ("Isya", &p.times.isya),
        ];
        if ctx.size == WidgetSize::Medium {
            let col_w = inner.w / 5.0;
            let base_y = inner.y + 84.0;
            for (i, (lbl, val)) in rows.iter().enumerate() {
                let x = inner.x + i as f32 * col_w;
                let active = *lbl == p.next_name;
                nodes.push(text_node(
                    RectF::new(x, base_y, col_w, 14.0),
                    *lbl,
                    10.5,
                    if active { 700 } else { 500 },
                    if active { ctx.pal.positive } else { ctx.pal.secondary },
                    TextAlign::Center,
                    false,
                ));
                nodes.push(text_node(
                    RectF::new(x, base_y + 16.0, col_w, 18.0),
                    *val,
                    12.5,
                    700,
                    ctx.pal.primary,
                    TextAlign::Center,
                    true,
                ));
            }
        } else {
            let mut y = inner.y + 92.0;
            for (lbl, val) in rows {
                let active = lbl == p.next_name;
                nodes.push(text_node(
                    RectF::new(inner.x, y, inner.w * 0.55, 22.0),
                    lbl,
                    14.0,
                    if active { 700 } else { 500 },
                    if active { ctx.pal.positive } else { ctx.pal.primary },
                    TextAlign::Left,
                    false,
                ));
                nodes.push(text_node(
                    RectF::new(inner.x + inner.w * 0.55, y, inner.w * 0.45, 22.0),
                    val,
                    14.0,
                    700,
                    ctx.pal.primary,
                    TextAlign::Right,
                    true,
                ));
                y += 34.0;
            }
            nodes.push(text_node(
                RectF::new(inner.x, inner.y + inner.h - 16.0, inner.w, 16.0),
                &p.method_label,
                10.5,
                400,
                ctx.pal.secondary,
                TextAlign::Left,
                false,
            ));
        }
    }
    nodes
}

/// 25. Kurs & harga emas (S, M)
pub fn build_currency_gold(ctx: &WidgetBuildCtx<'_>) -> Vec<SceneNode> {
    let cg = &ctx.hub.currency_gold;
    if cg.usd_to_idr.is_none() && cg.gold_idr_per_gram.is_none() {
        return empty_state_nodes(
            ctx,
            "Kurs & Emas",
            "Data kurs belum termuat. Ketuk Coba Lagi untuk mengambil dari open.er-api.com.",
            "Coba Lagi",
            "refresh_currency",
        );
    }
    let inner = ctx.frame.inset(14.0);
    let usd_str = cg
        .usd_to_idr
        .map(|v| format_idr(v.round() as i64))
        .unwrap_or_else(|| "Belum tersedia".into());

    let mut nodes = vec![
        text_node(
            RectF::new(inner.x, inner.y, inner.w, 16.0),
            "KURS USD / IDR",
            10.5,
            700,
            ctx.pal.accent,
            TextAlign::Left,
            false,
        ),
        text_node(
            RectF::new(inner.x, inner.y + 16.0, inner.w, 36.0),
            usd_str,
            28.0,
            700,
            ctx.pal.primary,
            TextAlign::Left,
            true,
        ),
    ];

    if ctx.size == WidgetSize::Medium {
        let eur = cg
            .eur_to_idr
            .map(|v| format!("EUR {}", format_idr(v.round() as i64)))
            .unwrap_or_default();
        let sgd = cg
            .sgd_to_idr
            .map(|v| format!("SGD {}", format_idr(v.round() as i64)))
            .unwrap_or_default();
        nodes.push(text_node(
            RectF::new(inner.x, inner.y + 56.0, inner.w, 18.0),
            format!("{}   {}", eur, sgd),
            12.0,
            500,
            ctx.pal.secondary,
            TextAlign::Left,
            true,
        ));
    }

    let gold_lbl = match cg.gold_idr_per_gram {
        Some(g) => format!("Emas/gr: {}", format_idr(g.round() as i64)),
        None => "Emas: butuh API berlisensi (Atur)".to_string(),
    };
    nodes.push(text_node(
        RectF::new(inner.x, inner.y + inner.h - 32.0, inner.w, 16.0),
        gold_lbl,
        11.5,
        600,
        ctx.pal.warning,
        TextAlign::Left,
        true,
    ));
    nodes.push(text_node(
        RectF::new(inner.x, inner.y + inner.h - 15.0, inner.w, 14.0),
        format!("Sumber kurs: {}", cg.currency_source),
        10.0,
        400,
        ctx.pal.secondary,
        TextAlign::Left,
        false,
    ));
    nodes
}

/// 26. Kalender hijriyah + hari libur SKB 3 Menteri (S, M)
pub fn build_hijri_holidays(ctx: &WidgetBuildCtx<'_>) -> Vec<SceneNode> {
    let inner = ctx.frame.inset(14.0);
    let hh = &ctx.hub.hijri_holidays;
    let mut nodes = vec![
        text_node(
            RectF::new(inner.x, inner.y, inner.w, 16.0),
            "KALENDER HIJRIYAH",
            10.5,
            700,
            ctx.pal.positive,
            TextAlign::Left,
            false,
        ),
        text_node(
            RectF::new(inner.x, inner.y + 16.0, inner.w, 28.0),
            if hh.hijri_formatted.is_empty() {
                "Memuat..."
            } else {
                &hh.hijri_formatted
            },
            20.0,
            700,
            ctx.pal.primary,
            TextAlign::Left,
            true,
        ),
    ];

    if hh.upcoming_holidays.is_empty() {
        nodes.push(text_node(
            RectF::new(inner.x, inner.y + 52.0, inner.w, 46.0),
            if hh.holiday_source_note.is_empty() {
                "Data libur SKB 3 Menteri belum dimuat."
            } else {
                &hh.holiday_source_note
            },
            11.5,
            400,
            ctx.pal.secondary,
            TextAlign::Left,
            false,
        ));
    } else {
        for (i, h) in hh.upcoming_holidays.iter().take(2).enumerate() {
            let y = inner.y + 54.0 + i as f32 * 30.0;
            nodes.push(text_node(
                RectF::new(inner.x, y, inner.w, 16.0),
                format!("{} . {}", h.date, h.name),
                12.0,
                600,
                ctx.pal.primary,
                TextAlign::Left,
                true,
            ));
        }
    }
    nodes
}

/// 27. Catat pengeluaran cepat: DPAPI lokal terenkripsi + bar anggaran (S, M)
pub fn build_quick_expense(ctx: &WidgetBuildCtx<'_>) -> Vec<SceneNode> {
    let inner = ctx.frame.inset(14.0);
    let exp = &ctx.hub.expenses;
    let spent = exp.total_spent();
    let ratio = exp.budget_ratio();

    let mut nodes = vec![
        text_node(
            RectF::new(inner.x, inner.y, inner.w - 72.0, 16.0),
            "PENGELUARAN",
            10.5,
            700,
            ctx.pal.secondary,
            TextAlign::Left,
            false,
        ),
        text_node(
            RectF::new(inner.x, inner.y + 18.0, inner.w, 34.0),
            format_idr(spent),
            26.0,
            700,
            ctx.pal.primary,
            TextAlign::Left,
            true,
        ),
        SceneNode::ProgressBar {
            rect: RectF::new(inner.x, inner.y + 58.0, inner.w, 7.0),
            progress: ratio,
            track_color: ctx.pal.surface_chip,
            fill_color: if ratio > 0.85 { ctx.pal.danger } else { ctx.pal.accent },
            interactive_action: None,
        },
        text_node(
            RectF::new(inner.x, inner.y + 70.0, inner.w, 16.0),
            if exp.monthly_budget_idr > 0 {
                format!(
                    "Anggaran {} ({:.0}%)",
                    format_idr(exp.monthly_budget_idr),
                    ratio * 100.0
                )
            } else {
                "Terenkripsi lokal DPAPI . Nol telemetri".into()
            },
            11.0,
            500,
            ctx.pal.secondary,
            TextAlign::Left,
            true,
        ),
    ];

    nodes.extend(action_pill(
        RectF::new(inner.x, inner.y + inner.h - 26.0, 118.0, 24.0),
        "+ Catat (Label nominal)",
        ctx.pal.accent.with_alpha(0.24),
        ctx.pal.primary,
        "inline_edit:quick_expense",
    ));
    nodes
}

/// 28. Papan skor bola: antarmuka provider berlisensi (M)
pub fn build_football_scores(ctx: &WidgetBuildCtx<'_>) -> Vec<SceneNode> {
    let fb = &ctx.hub.football;
    if !fb.provider_configured || fb.matches.is_empty() {
        return empty_state_nodes(
            ctx,
            "Papan Skor Bola",
            if fb.provider_note.is_empty() {
                "Membutuhkan penyedia data pertandingan berlisensi (tanpa scraping atau skor palsu)."
            } else {
                &fb.provider_note
            },
            "Atur Provider",
            "open_widget_settings",
        );
    }
    let inner = ctx.frame.inset(14.0);
    let mut nodes = vec![text_node(
        RectF::new(inner.x, inner.y, inner.w, 18.0),
        "Skor Pertandingan",
        14.5,
        600,
        ctx.pal.primary,
        TextAlign::Left,
        false,
    )];
    for (i, m) in fb.matches.iter().take(3).enumerate() {
        let y = inner.y + 28.0 + i as f32 * 32.0;
        nodes.push(text_node(
            RectF::new(inner.x, y, inner.w - 72.0, 18.0),
            format!("{} vs {}", m.home, m.away),
            13.0,
            600,
            ctx.pal.primary,
            TextAlign::Left,
            false,
        ));
        nodes.push(text_node(
            RectF::new(inner.x + inner.w - 70.0, y, 70.0, 18.0),
            &m.score,
            13.0,
            700,
            ctx.pal.accent,
            TextAlign::Right,
            true,
        ));
    }
    nodes
}

/// 29. Tanya cepat AI: memakai router & BYOK Gili (M)
pub fn build_ai_quick_ask(ctx: &WidgetBuildCtx<'_>) -> Vec<SceneNode> {
    let ai = &ctx.hub.frontend.ai_quick;
    if !ai.configured {
        return empty_state_nodes(
            ctx,
            "Tanya Cepat AI",
            "Hubungkan kunci API BYOK di Pengaturan AI Gili (disimpan aman di Credential Manager).",
            "Atur AI",
            "open_ai_settings",
        );
    }
    let inner = ctx.frame.inset(14.0);
    let mut nodes = vec![
        text_node(
            RectF::new(inner.x, inner.y, inner.w * 0.65, 18.0),
            "Tanya Cepat AI",
            14.5,
            600,
            ctx.pal.primary,
            TextAlign::Left,
            false,
        ),
        text_node(
            RectF::new(inner.x + inner.w * 0.65, inner.y + 2.0, inner.w * 0.35, 16.0),
            &ai.active_model_label,
            10.5,
            600,
            ctx.pal.accent,
            TextAlign::Right,
            false,
        ),
    ];

    let body = if ai.is_streaming {
        "Menjawab...".to_string()
    } else if let Some(err) = &ai.error {
        err.clone()
    } else if !ai.last_response.is_empty() {
        ai.last_response.clone()
    } else {
        "Ketuk tombol di bawah untuk mengetik pertanyaan singkat langsung dari desktop.".to_string()
    };

    nodes.push(text_node(
        RectF::new(inner.x, inner.y + 24.0, inner.w, inner.h - 56.0),
        body,
        12.0,
        400,
        ctx.pal.secondary,
        TextAlign::Left,
        false,
    ));

    nodes.extend(action_pill(
        RectF::new(inner.x, inner.y + inner.h - 26.0, 128.0, 24.0),
        "Tanya sesuatu...",
        ctx.pal.accent.with_alpha(0.24),
        ctx.pal.primary,
        "inline_edit:ai_quick_ask",
    ));
    nodes
}

/// 34. Kualitas Udara (AQI) & Indeks UV via Open-Meteo Air Quality API (S, M)
pub fn build_air_quality(ctx: &WidgetBuildCtx<'_>) -> Vec<SceneNode> {
    let aq = &ctx.hub.air_quality;
    if !aq.available {
        return empty_state_nodes(
            ctx,
            "Kualitas Udara",
            aq.error
                .as_deref()
                .unwrap_or("Data AQI dan Indeks UV belum termuat dari Open-Meteo."),
            "Coba Lagi",
            "refresh_air_quality",
        );
    }
    let inner = ctx.frame.inset(14.0);
    let badge_col = match aq.us_aqi {
        0..=50 => ctx.pal.positive,
        51..=100 => ctx.pal.warning,
        101..=150 => crate::config::RgbaColor::new(0xFB, 0x92, 0x3C, 1.0),
        _ => ctx.pal.danger,
    };

    let mut nodes = vec![
        text_node(
            RectF::new(inner.x, inner.y, inner.w - 28.0, 16.0),
            format!("AQI . {}", aq.location_name.to_uppercase()),
            10.5,
            700,
            badge_col,
            TextAlign::Left,
            false,
        ),
        SceneNode::IconGlyph {
            rect: RectF::new(inner.x + inner.w - 22.0, inner.y - 2.0, 22.0, 22.0),
            glyph: "\u{E9CA}".into(),
            size: 15.0,
            color: badge_col,
            interactive_action: None,
        },
        text_node(
            RectF::new(inner.x, inner.y + 16.0, 110.0, 44.0),
            format!("{}", aq.us_aqi),
            38.0,
            700,
            ctx.pal.primary,
            TextAlign::Left,
            true,
        ),
        text_node(
            RectF::new(inner.x, inner.y + 62.0, inner.w, 18.0),
            &aq.category_label,
            13.0,
            600,
            badge_col,
            TextAlign::Left,
            false,
        ),
        SceneNode::ProgressBar {
            rect: RectF::new(inner.x, inner.y + 84.0, inner.w, 6.0),
            progress: (aq.us_aqi as f32 / 250.0).clamp(0.05, 1.0),
            track_color: ctx.pal.surface_chip,
            fill_color: badge_col,
            interactive_action: None,
        },
    ];

    if ctx.size == WidgetSize::Small {
        nodes.push(text_node(
            RectF::new(inner.x, inner.y + inner.h - 18.0, inner.w, 16.0),
            format!("PM2.5 {:.0} . UV {:.1}", aq.pm2_5, aq.uv_index),
            11.0,
            500,
            ctx.pal.secondary,
            TextAlign::Left,
            true,
        ));
    } else {
        let pills = [
            ("PM2.5", format!("{:.1}", aq.pm2_5)),
            ("PM10", format!("{:.1}", aq.pm10)),
            ("Indeks UV", format!("{:.1}", aq.uv_index)),
        ];
        let start_x = inner.x + 114.0;
        let gap = 6.0;
        let pw = (inner.w - 114.0 - gap * 2.0) / 3.0;
        for (i, (lbl, val)) in pills.iter().enumerate() {
            let x = start_x + i as f32 * (pw + gap);
            nodes.push(SceneNode::RoundedRect {
                rect: RectF::new(x, inner.y + 20.0, pw, 48.0),
                radius: 10.0,
                smoothing: 0.45,
                fill: Some(ctx.pal.surface_chip),
                stroke: None,
                interactive_action: None,
            });
            nodes.push(text_node(
                RectF::new(x + 2.0, inner.y + 25.0, pw - 4.0, 14.0),
                *lbl,
                9.5,
                600,
                ctx.pal.secondary,
                TextAlign::Center,
                false,
            ));
            nodes.push(text_node(
                RectF::new(x + 2.0, inner.y + 41.0, pw - 4.0, 18.0),
                val,
                14.0,
                700,
                ctx.pal.primary,
                TextAlign::Center,
                true,
            ));
        }
        nodes.push(text_node(
            RectF::new(inner.x, inner.y + inner.h - 16.0, inner.w, 14.0),
            "Sumber: Open-Meteo Air Quality",
            10.0,
            400,
            ctx.pal.secondary,
            TextAlign::Left,
            false,
        ));
    }
    nodes
}
