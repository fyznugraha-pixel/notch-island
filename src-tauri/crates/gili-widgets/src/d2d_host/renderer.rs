#[cfg(windows)]
pub mod render {
    use crate::config::{BackgroundMode, RgbaColor, CARD_CORNER_SMOOTHING, CARD_RADIUS_DP};
    use crate::d2d_host::device::{
        gpu::{D2DDeviceResources, MonitorSwapChain},
        SystemVisualPolicy,
    };
    use crate::layout::{build_superellipse_points, RectF, SceneNode, TextAlign, WidgetRenderItem};
    use crate::spring::DigitRollState;
    use std::collections::HashMap;
    use std::hash::{Hash, Hasher};
    use windows::core::{HSTRING, PCWSTR};
    use windows::Foundation::Numerics::Matrix3x2;
    use windows::Win32::Foundation::RECT;
    use windows::Win32::Graphics::Direct2D::Common::{
        D2D1_ALPHA_MODE_PREMULTIPLIED, D2D1_COLOR_F, D2D1_FIGURE_BEGIN_FILLED,
        D2D1_FIGURE_END_CLOSED, D2D1_PIXEL_FORMAT, D2D_POINT_2F, D2D_RECT_F, D2D_SIZE_U,
    };
    use windows::Win32::Graphics::Direct2D::{
        ID2D1Bitmap1, ID2D1PathGeometry, ID2D1SolidColorBrush, ID2D1StrokeStyle, D2D1_ARC_SEGMENT,
        D2D1_ARC_SIZE_LARGE, D2D1_ARC_SIZE_SMALL, D2D1_BITMAP_OPTIONS_NONE,
        D2D1_BITMAP_OPTIONS_TARGET, D2D1_BITMAP_PROPERTIES1, D2D1_CAP_STYLE_ROUND,
        D2D1_DASH_STYLE_DASH, D2D1_DRAW_TEXT_OPTIONS_CLIP, D2D1_ELLIPSE,
        D2D1_INTERPOLATION_MODE_LINEAR, D2D1_LAYER_PARAMETERS1, D2D1_ROUNDED_RECT,
        D2D1_STROKE_STYLE_PROPERTIES1, D2D1_SWEEP_DIRECTION_CLOCKWISE,
        D2D1_TEXT_ANTIALIAS_MODE_GRAYSCALE,
    };
    use windows::Win32::Graphics::DirectWrite::{
        IDWriteTextFormat, DWRITE_FONT_STRETCH_NORMAL, DWRITE_FONT_STYLE_NORMAL,
        DWRITE_FONT_WEIGHT, DWRITE_PARAGRAPH_ALIGNMENT_NEAR, DWRITE_TEXT_ALIGNMENT_CENTER,
        DWRITE_TEXT_ALIGNMENT_LEADING, DWRITE_TEXT_ALIGNMENT_TRAILING, DWRITE_TEXT_RANGE,
        DWRITE_WORD_WRAPPING_WRAP,
    };
    use windows::Win32::Graphics::Dxgi::Common::DXGI_FORMAT_B8G8R8A8_UNORM;

    fn d2d_color(c: RgbaColor) -> D2D1_COLOR_F {
        D2D1_COLOR_F {
            r: c.r as f32 / 255.0,
            g: c.g as f32 / 255.0,
            b: c.b as f32 / 255.0,
            a: c.a.clamp(0.0, 1.0),
        }
    }

    fn d2d_rect(r: RectF) -> D2D_RECT_F {
        D2D_RECT_F {
            left: r.x,
            top: r.y,
            right: r.x + r.w,
            bottom: r.y + r.h,
        }
    }

    fn hash_render_item(item: &WidgetRenderItem, edit_mode: bool, text_scale: f32) -> u64 {
        let mut h = std::collections::hash_map::DefaultHasher::new();
        item.slot_id.hash(&mut h);
        item.widget_type.hash(&mut h);
        item.frame.x.to_bits().hash(&mut h);
        item.frame.y.to_bits().hash(&mut h);
        item.frame.w.to_bits().hash(&mut h);
        item.frame.h.to_bits().hash(&mut h);
        (item.background_mode as u8).hash(&mut h);
        item.shadow_enabled.hash(&mut h);
        item.halo_enabled.hash(&mut h);
        item.font_family.hash(&mut h);
        item.stack_count.hash(&mut h);
        item.stack_index.hash(&mut h);
        item.edit_jiggle_deg.to_bits().hash(&mut h);
        item.scale.to_bits().hash(&mut h);
        item.opacity.to_bits().hash(&mut h);
        edit_mode.hash(&mut h);
        text_scale.to_bits().hash(&mut h);
        if let Ok(json) = serde_json::to_string(&item.nodes) {
            json.hash(&mut h);
        }
        h.finish()
    }

    struct CachedBitmapEntry {
        key_hash: u64,
        bitmap: ID2D1Bitmap1,
    }

    pub struct D2DWidgetRenderer {
        brush: ID2D1SolidColorBrush,
        dashed_stroke: ID2D1StrokeStyle,
        round_stroke: ID2D1StrokeStyle,
        text_formats: HashMap<(String, u16, u32, u8), IDWriteTextFormat>,
        /// Cached offscreen bitmaps for text shadow/halo passes so shadows are never recomputed every frame.
        shadow_cache: HashMap<String, CachedBitmapEntry>,
        image_cache: HashMap<String, ID2D1Bitmap1>,
        digit_rolls: HashMap<String, DigitRollState>,
        prev_hashes: HashMap<String, (u64, RectF)>,
    }

    impl D2DWidgetRenderer {
        pub fn new(res: &D2DDeviceResources) -> Result<Self, String> {
            unsafe {
                let brush = res
                    .d2d_context
                    .CreateSolidColorBrush(&D2D1_COLOR_F { r: 1.0, g: 1.0, b: 1.0, a: 1.0 }, None)
                    .map_err(|e| format!("CreateSolidColorBrush gagal: {e}"))?;

                let dashed_props = D2D1_STROKE_STYLE_PROPERTIES1 {
                    startCap: D2D1_CAP_STYLE_ROUND,
                    endCap: D2D1_CAP_STYLE_ROUND,
                    dashCap: D2D1_CAP_STYLE_ROUND,
                    dashStyle: D2D1_DASH_STYLE_DASH,
                    ..Default::default()
                };
                let dashed_stroke = res
                    .d2d_factory
                    .CreateStrokeStyle(&dashed_props, None)
                    .map_err(|e| format!("CreateStrokeStyle dash gagal: {e}"))?;

                let round_props = D2D1_STROKE_STYLE_PROPERTIES1 {
                    startCap: D2D1_CAP_STYLE_ROUND,
                    endCap: D2D1_CAP_STYLE_ROUND,
                    ..Default::default()
                };
                let round_stroke = res
                    .d2d_factory
                    .CreateStrokeStyle(&round_props, None)
                    .map_err(|e| format!("CreateStrokeStyle round gagal: {e}"))?;

                Ok(Self {
                    brush,
                    dashed_stroke: dashed_stroke.into(),
                    round_stroke: round_stroke.into(),
                    text_formats: HashMap::new(),
                    shadow_cache: HashMap::new(),
                    image_cache: HashMap::new(),
                    digit_rolls: HashMap::new(),
                    prev_hashes: HashMap::new(),
                })
            }
        }

        pub fn clear_caches(&mut self) {
            self.text_formats.clear();
            self.shadow_cache.clear();
            self.image_cache.clear();
            self.prev_hashes.clear();
        }

        fn get_text_format(
            &mut self,
            res: &D2DDeviceResources,
            family: &str,
            weight: u16,
            size_dp: f32,
            align: TextAlign,
        ) -> Option<IDWriteTextFormat> {
            let size_q = (size_dp.clamp(8.0, 96.0) * 10.0).round() as u32;
            let align_key = match align {
                TextAlign::Left => 0,
                TextAlign::Center => 1,
                TextAlign::Right => 2,
            };
            let key = (family.to_string(), weight, size_q, align_key);
            if let Some(fmt) = self.text_formats.get(&key) {
                return Some(fmt.clone());
            }
            let fam_w = HSTRING::from(family);
            let locale = HSTRING::from("id-ID");
            let fmt = unsafe {
                res.dwrite_factory
                    .CreateTextFormat(
                        PCWSTR(fam_w.as_ptr()),
                        None,
                        DWRITE_FONT_WEIGHT(weight as i32),
                        DWRITE_FONT_STYLE_NORMAL,
                        DWRITE_FONT_STRETCH_NORMAL,
                        size_q as f32 / 10.0,
                        PCWSTR(locale.as_ptr()),
                    )
                    .ok()?
            };
            unsafe {
                let _ = fmt.SetTextAlignment(match align {
                    TextAlign::Left => DWRITE_TEXT_ALIGNMENT_LEADING,
                    TextAlign::Center => DWRITE_TEXT_ALIGNMENT_CENTER,
                    TextAlign::Right => DWRITE_TEXT_ALIGNMENT_TRAILING,
                });
                let _ = fmt.SetParagraphAlignment(DWRITE_PARAGRAPH_ALIGNMENT_NEAR);
                let _ = fmt.SetWordWrapping(DWRITE_WORD_WRAPPING_WRAP);
            }
            if self.text_formats.len() > 160 {
                self.text_formats.clear();
            }
            self.text_formats.insert(key, fmt.clone());
            Some(fmt)
        }

        fn build_superellipse_geometry(
            &self,
            res: &D2DDeviceResources,
            rect: RectF,
            radius: f32,
            smoothing: f32,
        ) -> Option<ID2D1PathGeometry> {
            let pts = build_superellipse_points(rect, radius, smoothing);
            if pts.len() < 3 {
                return None;
            }
            unsafe {
                let geom = res.d2d_factory.CreatePathGeometry().ok()?;
                let sink = geom.Open().ok()?;
                sink.BeginFigure(
                    D2D_POINT_2F {
                        x: pts[0].0,
                        y: pts[0].1,
                    },
                    D2D1_FIGURE_BEGIN_FILLED,
                );
                for &(x, y) in &pts[1..] {
                    sink.AddLine(D2D_POINT_2F { x, y });
                }
                sink.EndFigure(D2D1_FIGURE_END_CLOSED);
                sink.Close().ok()?;
                Some(geom.into())
            }
        }

        fn load_image_bitmap(
            &mut self,
            res: &D2DDeviceResources,
            source: &str,
        ) -> Option<ID2D1Bitmap1> {
            if let Some(bmp) = self.image_cache.get(source) {
                return Some(bmp.clone());
            }
            let img = if let Some(b64_part) = source
                .strip_prefix("data:")
                .and_then(|rest| rest.split_once(";base64,").map(|(_, b)| b))
            {
                use base64::Engine;
                let bytes = base64::engine::general_purpose::STANDARD.decode(b64_part).ok()?;
                image::load_from_memory(&bytes).ok()?
            } else {
                image::open(source).ok()?
            };
            let rgba = img.thumbnail(360, 360).to_rgba8();
            let (w, h) = rgba.dimensions();
            // Convert RGBA straight -> BGRA premultiplied for Direct2D
            let mut bgra = Vec::with_capacity((w * h * 4) as usize);
            for px in rgba.pixels() {
                let a = px[3] as u16;
                let r = ((px[0] as u16 * a) / 255) as u8;
                let g = ((px[1] as u16 * a) / 255) as u8;
                let b = ((px[2] as u16 * a) / 255) as u8;
                bgra.extend_from_slice(&[b, g, r, px[3]]);
            }
            let props = D2D1_BITMAP_PROPERTIES1 {
                pixelFormat: D2D1_PIXEL_FORMAT {
                    format: DXGI_FORMAT_B8G8R8A8_UNORM,
                    alphaMode: D2D1_ALPHA_MODE_PREMULTIPLIED,
                },
                dpiX: 96.0,
                dpiY: 96.0,
                bitmapOptions: D2D1_BITMAP_OPTIONS_NONE,
                ..Default::default()
            };
            let bmp = unsafe {
                res.d2d_context
                    .CreateBitmap(
                        D2D_SIZE_U { width: w, height: h },
                        Some(bgra.as_ptr() as *const _),
                        w * 4,
                        &props,
                    )
                    .ok()?
            };
            if self.image_cache.len() > 24 {
                self.image_cache.clear();
            }
            self.image_cache.insert(source.to_string(), bmp.clone());
            Some(bmp)
        }

        /// Renders only dirty widgets onto the monitor swap chain and presents dirty rects.
        /// Returns `(dirty_rect_count, present_result)`.
        pub fn render_frame(
            &mut self,
            res: &D2DDeviceResources,
            swap: &mut MonitorSwapChain,
            items: &[WidgetRenderItem],
            edit_mode: bool,
            board_dim_backdrop: bool,
            add_button_rect: Option<RectF>,
            policy: &SystemVisualPolicy,
            force_full: bool,
        ) -> (usize, windows::core::Result<()>) {
            let dpi_scale = swap.dpi / 96.0;
            let mut dirty_rects_px: Vec<RECT> = Vec::new();
            let mut next_hashes: HashMap<String, (u64, RectF)> = HashMap::new();

            for item in items {
                let h = hash_render_item(item, edit_mode, policy.text_scale_factor);
                let changed = force_full
                    || !swap.has_presented_once
                    || self
                        .prev_hashes
                        .get(&item.slot_id)
                        .map(|(ph, pr)| *ph != h || *pr != item.frame)
                        .unwrap_or(true);
                if changed {
                    let pad = 20.0;
                    if let Some((_, old_r)) = self.prev_hashes.get(&item.slot_id) {
                        dirty_rects_px.push(RECT {
                            left: ((old_r.x - pad) * dpi_scale).floor() as i32,
                            top: ((old_r.y - pad) * dpi_scale).floor() as i32,
                            right: ((old_r.x + old_r.w + pad) * dpi_scale).ceil() as i32,
                            bottom: ((old_r.y + old_r.h + pad) * dpi_scale).ceil() as i32,
                        });
                    }
                    dirty_rects_px.push(RECT {
                        left: ((item.frame.x - pad) * dpi_scale).floor() as i32,
                        top: ((item.frame.y - pad) * dpi_scale).floor() as i32,
                        right: ((item.frame.x + item.frame.w + pad) * dpi_scale).ceil() as i32,
                        bottom: ((item.frame.y + item.frame.h + pad) * dpi_scale).ceil() as i32,
                    });
                }
                next_hashes.insert(item.slot_id.clone(), (h, item.frame));
            }

            // Detect removed slots
            for (old_id, (_, old_r)) in &self.prev_hashes {
                if !next_hashes.contains_key(old_id) {
                    let pad = 20.0;
                    dirty_rects_px.push(RECT {
                        left: ((old_r.x - pad) * dpi_scale).floor() as i32,
                        top: ((old_r.y - pad) * dpi_scale).floor() as i32,
                        right: ((old_r.x + old_r.w + pad) * dpi_scale).ceil() as i32,
                        bottom: ((old_r.y + old_r.h + pad) * dpi_scale).ceil() as i32,
                    });
                }
            }

            self.prev_hashes = next_hashes;

            if dirty_rects_px.is_empty() && !force_full && swap.has_presented_once {
                return (0, Ok(()));
            }

            let ctx = &res.d2d_context;
            unsafe {
                ctx.SetTarget(&swap.target_bitmap);
                ctx.SetDpi(swap.dpi, swap.dpi);
                ctx.SetTextAntialiasMode(D2D1_TEXT_ANTIALIAS_MODE_GRAYSCALE);
                ctx.BeginDraw();
                ctx.SetTransform(&Matrix3x2::identity());

                // True transparent clear (or subtle scrim when Widget Board overlay is open)
                if board_dim_backdrop {
                    ctx.Clear(Some(&D2D1_COLOR_F {
                        r: 0.03,
                        g: 0.04,
                        b: 0.06,
                        a: 0.42,
                    }));
                } else {
                    ctx.Clear(Some(&D2D1_COLOR_F {
                        r: 0.0,
                        g: 0.0,
                        b: 0.0,
                        a: 0.0,
                    }));
                }
            }

            for item in items {
                self.draw_widget_item(res, item, edit_mode, policy, dpi_scale);
            }

            if edit_mode {
                if let Some(btn) = add_button_rect {
                    self.draw_add_gallery_button(res, btn);
                }
            }

            let end_res = unsafe {
                ctx.SetTransform(&Matrix3x2::identity());
                ctx.EndDraw(None, None)
            };
            if let Err(e) = end_res {
                return (dirty_rects_px.len(), Err(e));
            }

            let present_rects = if force_full || board_dim_backdrop {
                Vec::new()
            } else {
                dirty_rects_px
            };
            let count = if present_rects.is_empty() {
                1
            } else {
                present_rects.len()
            };
            let pres = swap.present_dirty(&present_rects);
            (count, pres)
        }

        fn draw_widget_item(
            &mut self,
            res: &D2DDeviceResources,
            item: &WidgetRenderItem,
            edit_mode: bool,
            policy: &SystemVisualPolicy,
            dpi_scale: f32,
        ) {
            let ctx = &res.d2d_context;
            let cx = item.frame.x + item.frame.w * 0.5;
            let cy = item.frame.y + item.frame.h * 0.5;

            let scale_mat = Matrix3x2 {
                M11: item.scale,
                M12: 0.0,
                M21: 0.0,
                M22: item.scale,
                M31: 0.0,
                M32: 0.0,
            };
            let transform = Matrix3x2::translation(-cx, -cy)
                * scale_mat
                * Matrix3x2::translation(cx, cy)
                * Matrix3x2::rotation(item.edit_jiggle_deg, cx, cy);

            unsafe {
                ctx.SetTransform(&transform);
            }

            let effective_bg = if policy.high_contrast {
                BackgroundMode::Solid
            } else if item.background_mode == BackgroundMode::Glass
                && (!policy.transparency_enabled || policy.power_saver)
            {
                BackgroundMode::Solid
            } else {
                item.background_mode
            };

            if effective_bg != BackgroundMode::None {
                let fill = if policy.high_contrast {
                    RgbaColor::new(0, 0, 0, 0.96)
                } else {
                    item.card_fill
                        .unwrap_or_else(|| RgbaColor::new(20, 21, 26, 0.88))
                };
                if let Some(geom) = self.build_superellipse_geometry(
                    res,
                    item.frame,
                    CARD_RADIUS_DP,
                    CARD_CORNER_SMOOTHING,
                ) {
                    unsafe {
                        self.brush.SetColor(&d2d_color(fill));
                        ctx.FillGeometry(&geom, &self.brush, None);
                        let border_col = if policy.high_contrast {
                            RgbaColor::new(255, 255, 255, 0.95)
                        } else {
                            item.inner_border
                                .unwrap_or_else(|| RgbaColor::new(255, 255, 255, 0.10))
                        };
                        self.brush.SetColor(&d2d_color(border_col));
                        ctx.DrawGeometry(&geom, &self.brush, 1.0, None);

                        // Subtle specular top edge sheen for Glass and SubtleTint cards
                        if !policy.high_contrast
                            && (effective_bg == BackgroundMode::Glass
                                || effective_bg == BackgroundMode::SubtleTint)
                        {
                            self.brush.SetColor(&D2D1_COLOR_F {
                                r: 1.0,
                                g: 1.0,
                                b: 1.0,
                                a: if effective_bg == BackgroundMode::Glass {
                                    0.16
                                } else {
                                    0.08
                                },
                            });
                            ctx.DrawLine(
                                D2D_POINT_2F {
                                    x: item.frame.x + CARD_RADIUS_DP * 0.85,
                                    y: item.frame.y + 1.0,
                                },
                                D2D_POINT_2F {
                                    x: item.frame.x + item.frame.w - CARD_RADIUS_DP * 0.85,
                                    y: item.frame.y + 1.0,
                                },
                                &self.brush,
                                1.0,
                                &self.round_stroke,
                            );
                        }
                    }
                }
            } else if edit_mode {
                // Frameless widget shows a dashed rounded outline ONLY while in edit mode
                if let Some(geom) = self.build_superellipse_geometry(
                    res,
                    item.frame,
                    CARD_RADIUS_DP,
                    CARD_CORNER_SMOOTHING,
                ) {
                    unsafe {
                        self.brush.SetColor(&D2D1_COLOR_F {
                            r: 1.0,
                            g: 1.0,
                            b: 1.0,
                            a: 0.45,
                        });
                        ctx.DrawGeometry(&geom, &self.brush, 1.5, &self.dashed_stroke);
                    }
                }
            }

            // Cached shadow / halo bitmap pass for frameless legibility
            if (item.shadow_enabled || item.halo_enabled) && effective_bg == BackgroundMode::None {
                self.draw_cached_text_shadow(res, item, policy.text_scale_factor, dpi_scale);
            }

            for (idx, node) in item.nodes.iter().enumerate() {
                let roll_key = format!("{}:{}", item.slot_id, idx);
                self.draw_scene_node(
                    res,
                    node,
                    &item.font_family,
                    policy.text_scale_factor,
                    policy.reduced_motion,
                    Some(&roll_key),
                );
            }

            // Stack indicator dots on right edge when slot holds >1 widget
            if item.stack_count > 1 {
                let dot_x = item.frame.x + item.frame.w - 8.0;
                let total_h = (item.stack_count as f32 - 1.0) * 8.0;
                let start_y = cy - total_h * 0.5;
                for i in 0..item.stack_count {
                    let active = i == item.stack_index;
                    let r = if active { 2.8 } else { 2.0 };
                    unsafe {
                        self.brush.SetColor(&D2D1_COLOR_F {
                            r: 1.0,
                            g: 1.0,
                            b: 1.0,
                            a: if active { 0.92 } else { 0.35 },
                        });
                        ctx.FillEllipse(
                            &D2D1_ELLIPSE {
                                point: D2D_POINT_2F {
                                    x: dot_x,
                                    y: start_y + i as f32 * 8.0,
                                },
                                radiusX: r,
                                radiusY: r,
                            },
                            &self.brush,
                        );
                    }
                }
            }

            // Edit-mode top-left remove badge ("-")
            if edit_mode {
                let bx = item.frame.x + 2.0;
                let by = item.frame.y + 2.0;
                unsafe {
                    self.brush.SetColor(&D2D1_COLOR_F {
                        r: 0.92,
                        g: 0.26,
                        b: 0.24,
                        a: 0.95,
                    });
                    ctx.FillEllipse(
                        &D2D1_ELLIPSE {
                            point: D2D_POINT_2F { x: bx, y: by },
                            radiusX: 11.0,
                            radiusY: 11.0,
                        },
                        &self.brush,
                    );
                    self.brush.SetColor(&D2D1_COLOR_F {
                        r: 1.0,
                        g: 1.0,
                        b: 1.0,
                        a: 1.0,
                    });
                    ctx.DrawLine(
                        D2D_POINT_2F { x: bx - 4.5, y: by },
                        D2D_POINT_2F { x: bx + 4.5, y: by },
                        &self.brush,
                        2.0,
                        &self.round_stroke,
                    );
                }
            }
        }

        /// Caches text shadow & optional halo in an offscreen D2D bitmap per slot so static frames never re-rasterize shadows.
        fn draw_cached_text_shadow(
            &mut self,
            res: &D2DDeviceResources,
            item: &WidgetRenderItem,
            text_scale: f32,
            dpi_scale: f32,
        ) {
            let mut h = std::collections::hash_map::DefaultHasher::new();
            item.slot_id.hash(&mut h);
            item.shadow_enabled.hash(&mut h);
            item.halo_enabled.hash(&mut h);
            item.shadow_color.r.hash(&mut h);
            item.shadow_color.g.hash(&mut h);
            item.shadow_color.b.hash(&mut h);
            item.shadow_color.a.to_bits().hash(&mut h);
            text_scale.to_bits().hash(&mut h);
            for node in &item.nodes {
                if let SceneNode::Text {
                    content,
                    font_size,
                    rect,
                    ..
                } = node
                {
                    content.hash(&mut h);
                    font_size.to_bits().hash(&mut h);
                    rect.x.to_bits().hash(&mut h);
                    rect.y.to_bits().hash(&mut h);
                }
            }
            let key_hash = h.finish();

            let needs_rebuild = self
                .shadow_cache
                .get(&item.slot_id)
                .map(|c| c.key_hash != key_hash)
                .unwrap_or(true);

            let pad = 6.0f32;
            let bmp_w = ((item.frame.w + pad * 2.0) * dpi_scale).ceil().max(1.0) as u32;
            let bmp_h = ((item.frame.h + pad * 2.0) * dpi_scale).ceil().max(1.0) as u32;

            if needs_rebuild {
                let props = D2D1_BITMAP_PROPERTIES1 {
                    pixelFormat: D2D1_PIXEL_FORMAT {
                        format: DXGI_FORMAT_B8G8R8A8_UNORM,
                        alphaMode: D2D1_ALPHA_MODE_PREMULTIPLIED,
                    },
                    dpiX: 96.0 * dpi_scale,
                    dpiY: 96.0 * dpi_scale,
                    bitmapOptions: D2D1_BITMAP_OPTIONS_TARGET,
                    ..Default::default()
                };
                if let Ok(offscreen) = unsafe {
                    res.d2d_context.CreateBitmap(
                        D2D_SIZE_U {
                            width: bmp_w,
                            height: bmp_h,
                        },
                        None,
                        0,
                        &props,
                    )
                } {
                    let prev_target = unsafe { res.d2d_context.GetTarget().ok() };
                    let mut prev_transform = Matrix3x2::identity();
                    unsafe {
                        res.d2d_context.GetTransform(&mut prev_transform);
                        res.d2d_context.SetTarget(&offscreen);
                        res.d2d_context.SetTransform(&Matrix3x2::identity());
                        res.d2d_context.Clear(Some(&D2D1_COLOR_F {
                            r: 0.0,
                            g: 0.0,
                            b: 0.0,
                            a: 0.0,
                        }));
                    }

                    let ox = item.frame.x - pad;
                    let oy = item.frame.y - pad;
                    for node in &item.nodes {
                        if let SceneNode::Text {
                            rect,
                            content,
                            font_size,
                            font_weight,
                            align,
                            tabular_nums,
                            ..
                        } = node
                        {
                            let scaled_size = font_size * text_scale;
                            let Some(fmt) = self.get_text_format(
                                res,
                                &item.font_family,
                                *font_weight,
                                scaled_size,
                                *align,
                            ) else {
                                continue;
                            };
                            let text_w: Vec<u16> = content.encode_utf16().collect();
                            let Ok(layout) = (unsafe {
                                res.dwrite_factory.CreateTextLayout(
                                    &text_w,
                                    &fmt,
                                    rect.w.max(1.0),
                                    rect.h.max(1.0),
                                )
                            }) else {
                                continue;
                            };
                            if *tabular_nums {
                                let _ = unsafe {
                                    layout.SetTypography(
                                        &res.tabular_typography,
                                        DWRITE_TEXT_RANGE {
                                            startPosition: 0,
                                            length: text_w.len() as u32,
                                        },
                                    )
                                };
                            }
                            let local_x = rect.x - ox;
                            let local_y = rect.y - oy;
                            if item.shadow_enabled {
                                let mut sc = item.shadow_color;
                                sc.a = (sc.a * 0.55).clamp(0.0, 0.75);
                                unsafe {
                                    self.brush.SetColor(&d2d_color(sc));
                                    res.d2d_context.DrawTextLayout(
                                        D2D_POINT_2F {
                                            x: local_x + 0.8,
                                            y: local_y + 1.8,
                                        },
                                        &layout,
                                        &self.brush,
                                        D2D1_DRAW_TEXT_OPTIONS_CLIP,
                                    );
                                }
                            }
                            if item.halo_enabled {
                                let mut hc = item.shadow_color;
                                hc.a = (hc.a * 0.45).clamp(0.0, 0.65);
                                unsafe {
                                    self.brush.SetColor(&d2d_color(hc));
                                    for (dx, dy) in [(-1.0, 0.0), (1.0, 0.0), (0.0, -1.0), (0.0, 1.0)]
                                    {
                                        res.d2d_context.DrawTextLayout(
                                            D2D_POINT_2F {
                                                x: local_x + dx,
                                                y: local_y + dy,
                                            },
                                            &layout,
                                            &self.brush,
                                            D2D1_DRAW_TEXT_OPTIONS_CLIP,
                                        );
                                    }
                                }
                            }
                        }
                    }

                    unsafe {
                        if let Some(t) = prev_target {
                            res.d2d_context.SetTarget(&t);
                        }
                        res.d2d_context.SetTransform(&prev_transform);
                    }
                    self.shadow_cache.insert(
                        item.slot_id.clone(),
                        CachedBitmapEntry {
                            key_hash,
                            bitmap: offscreen,
                        },
                    );
                }
            }

            if let Some(entry) = self.shadow_cache.get(&item.slot_id) {
                let dest = D2D_RECT_F {
                    left: item.frame.x - pad,
                    top: item.frame.y - pad,
                    right: item.frame.x + item.frame.w + pad,
                    bottom: item.frame.y + item.frame.h + pad,
                };
                unsafe {
                    res.d2d_context.DrawBitmap(
                        &entry.bitmap,
                        Some(&dest),
                        item.opacity,
                        D2D1_INTERPOLATION_MODE_LINEAR,
                        None,
                        None,
                    );
                }
            }
        }

        fn draw_scene_node(
            &mut self,
            res: &D2DDeviceResources,
            node: &SceneNode,
            font_family: &str,
            text_scale: f32,
            reduced_motion: bool,
            roll_key: Option<&str>,
        ) {
            let ctx = &res.d2d_context;
            match node {
                SceneNode::RoundedRect {
                    rect,
                    radius,
                    smoothing,
                    fill,
                    stroke,
                    ..
                } => {
                    if *smoothing > 0.1 && *radius > 8.0 {
                        if let Some(geom) =
                            self.build_superellipse_geometry(res, *rect, *radius, *smoothing)
                        {
                            unsafe {
                                if let Some(c) = fill {
                                    self.brush.SetColor(&d2d_color(*c));
                                    ctx.FillGeometry(&geom, &self.brush, None);
                                }
                                if let Some((sc, sw)) = stroke {
                                    self.brush.SetColor(&d2d_color(*sc));
                                    ctx.DrawGeometry(&geom, &self.brush, *sw, None);
                                }
                            }
                        }
                    } else {
                        let rr = D2D1_ROUNDED_RECT {
                            rect: d2d_rect(*rect),
                            radiusX: *radius,
                            radiusY: *radius,
                        };
                        unsafe {
                            if let Some(c) = fill {
                                self.brush.SetColor(&d2d_color(*c));
                                ctx.FillRoundedRectangle(&rr, &self.brush);
                            }
                            if let Some((sc, sw)) = stroke {
                                self.brush.SetColor(&d2d_color(*sc));
                                ctx.DrawRoundedRectangle(&rr, &self.brush, *sw, None);
                            }
                        }
                    }
                }
                SceneNode::Text {
                    rect,
                    content,
                    font_size,
                    font_weight,
                    color,
                    align,
                    tabular_nums,
                    ..
                } => {
                    let scaled_size = font_size * text_scale;
                    let Some(fmt) =
                        self.get_text_format(res, font_family, *font_weight, scaled_size, *align)
                    else {
                        return;
                    };

                    // Rolling digit transition for large tabular clock/metric figures
                    if *tabular_nums && *font_size >= 24.0 && !reduced_motion {
                        if let Some(rk) = roll_key {
                            let roll = self
                                .digit_rolls
                                .entry(rk.to_string())
                                .or_insert_with(|| DigitRollState::new(content.clone()));
                            roll.update(content, reduced_motion);
                            let _ = roll.tick(1.0 / 60.0, reduced_motion);
                            let p = roll.progress.value.clamp(0.0, 1.0);
                            if p < 0.98 && roll.prev_text != roll.current_text {
                                let shift = scaled_size * 0.36;
                                // Previous digit sliding out upward
                                let prev_w: Vec<u16> = roll.prev_text.encode_utf16().collect();
                                if let Ok(prev_layout) = unsafe {
                                    res.dwrite_factory.CreateTextLayout(
                                        &prev_w,
                                        &fmt,
                                        rect.w.max(1.0),
                                        rect.h.max(1.0),
                                    )
                                } {
                                    let _ = unsafe {
                                        prev_layout.SetTypography(
                                            &res.tabular_typography,
                                            DWRITE_TEXT_RANGE {
                                                startPosition: 0,
                                                length: prev_w.len() as u32,
                                            },
                                        )
                                    };
                                    unsafe {
                                        self.brush.SetColor(&d2d_color(
                                            color.with_alpha(color.a * (1.0 - p)),
                                        ));
                                        ctx.DrawTextLayout(
                                            D2D_POINT_2F {
                                                x: rect.x,
                                                y: rect.y - shift * p,
                                            },
                                            &prev_layout,
                                            &self.brush,
                                            D2D1_DRAW_TEXT_OPTIONS_CLIP,
                                        );
                                    }
                                }
                                // Incoming digit rolling in from below
                                let cur_w: Vec<u16> = roll.current_text.encode_utf16().collect();
                                if let Ok(cur_layout) = unsafe {
                                    res.dwrite_factory.CreateTextLayout(
                                        &cur_w,
                                        &fmt,
                                        rect.w.max(1.0),
                                        rect.h.max(1.0),
                                    )
                                } {
                                    let _ = unsafe {
                                        cur_layout.SetTypography(
                                            &res.tabular_typography,
                                            DWRITE_TEXT_RANGE {
                                                startPosition: 0,
                                                length: cur_w.len() as u32,
                                            },
                                        )
                                    };
                                    unsafe {
                                        self.brush
                                            .SetColor(&d2d_color(color.with_alpha(color.a * p)));
                                        ctx.DrawTextLayout(
                                            D2D_POINT_2F {
                                                x: rect.x,
                                                y: rect.y + shift * (1.0 - p),
                                            },
                                            &cur_layout,
                                            &self.brush,
                                            D2D1_DRAW_TEXT_OPTIONS_CLIP,
                                        );
                                    }
                                }
                                return;
                            }
                        }
                    }

                    let text_w: Vec<u16> = content.encode_utf16().collect();
                    let Ok(layout) = (unsafe {
                        res.dwrite_factory.CreateTextLayout(
                            &text_w,
                            &fmt,
                            rect.w.max(1.0),
                            rect.h.max(1.0),
                        )
                    }) else {
                        return;
                    };
                    if *tabular_nums {
                        let _ = unsafe {
                            layout.SetTypography(
                                &res.tabular_typography,
                                DWRITE_TEXT_RANGE {
                                    startPosition: 0,
                                    length: text_w.len() as u32,
                                },
                            )
                        };
                    }
                    unsafe {
                        self.brush.SetColor(&d2d_color(*color));
                        ctx.DrawTextLayout(
                            D2D_POINT_2F {
                                x: rect.x,
                                y: rect.y,
                            },
                            &layout,
                            &self.brush,
                            D2D1_DRAW_TEXT_OPTIONS_CLIP,
                        );
                    }
                }
                SceneNode::ProgressRing {
                    cx,
                    cy,
                    radius,
                    stroke_width,
                    progress,
                    track_color,
                    fill_color,
                } => unsafe {
                    self.brush.SetColor(&d2d_color(*track_color));
                    ctx.DrawEllipse(
                        &D2D1_ELLIPSE {
                            point: D2D_POINT_2F { x: *cx, y: *cy },
                            radiusX: *radius,
                            radiusY: *radius,
                        },
                        &self.brush,
                        *stroke_width,
                        None,
                    );
                    let p = progress.clamp(0.0, 0.999);
                    if p > 0.01 {
                        if let Ok(geom) = res.d2d_factory.CreatePathGeometry() {
                            if let Ok(sink) = geom.Open() {
                                let start_angle = -std::f32::consts::FRAC_PI_2;
                                let end_angle = start_angle + p * std::f32::consts::TAU;
                                let sx = cx + radius * start_angle.cos();
                                let sy = cy + radius * start_angle.sin();
                                let ex = cx + radius * end_angle.cos();
                                let ey = cy + radius * end_angle.sin();
                                sink.BeginFigure(
                                    D2D_POINT_2F { x: sx, y: sy },
                                    D2D1_FIGURE_BEGIN_FILLED,
                                );
                                sink.AddArc(&D2D1_ARC_SEGMENT {
                                    point: D2D_POINT_2F { x: ex, y: ey },
                                    size: windows::Win32::Graphics::Direct2D::Common::D2D_SIZE_F {
                                        width: *radius,
                                        height: *radius,
                                    },
                                    rotationAngle: 0.0,
                                    sweepDirection: D2D1_SWEEP_DIRECTION_CLOCKWISE,
                                    arcSize: if p > 0.5 {
                                        D2D1_ARC_SIZE_LARGE
                                    } else {
                                        D2D1_ARC_SIZE_SMALL
                                    },
                                });
                                sink.EndFigure(
                                    windows::Win32::Graphics::Direct2D::Common::D2D1_FIGURE_END_OPEN,
                                );
                                let _ = sink.Close();
                                self.brush.SetColor(&d2d_color(*fill_color));
                                ctx.DrawGeometry(
                                    &geom,
                                    &self.brush,
                                    *stroke_width,
                                    &self.round_stroke,
                                );
                            }
                        }
                    }
                },
                SceneNode::ProgressBar {
                    rect,
                    progress,
                    track_color,
                    fill_color,
                    ..
                } => unsafe {
                    let r = rect.h * 0.5;
                    self.brush.SetColor(&d2d_color(*track_color));
                    ctx.FillRoundedRectangle(
                        &D2D1_ROUNDED_RECT {
                            rect: d2d_rect(*rect),
                            radiusX: r,
                            radiusY: r,
                        },
                        &self.brush,
                    );
                    let fill_w = (rect.w * progress.clamp(0.0, 1.0)).max(0.0);
                    if fill_w > 1.0 {
                        self.brush.SetColor(&d2d_color(*fill_color));
                        ctx.FillRoundedRectangle(
                            &D2D1_ROUNDED_RECT {
                                rect: D2D_RECT_F {
                                    left: rect.x,
                                    top: rect.y,
                                    right: rect.x + fill_w,
                                    bottom: rect.y + rect.h,
                                },
                                radiusX: r,
                                radiusY: r,
                            },
                            &self.brush,
                        );
                    }
                },
                SceneNode::Sparkline {
                    rect,
                    values,
                    stroke_color,
                    ..
                } => {
                    if values.len() < 2 {
                        return;
                    }
                    let max_v = values
                        .iter()
                        .copied()
                        .fold(1.0f32, f32::max);
                    let step_x = rect.w / (values.len() - 1) as f32;
                    unsafe {
                        self.brush.SetColor(&d2d_color(*stroke_color));
                        for i in 0..values.len() - 1 {
                            let x1 = rect.x + i as f32 * step_x;
                            let y1 = rect.y + rect.h * (1.0 - (values[i] / max_v).clamp(0.0, 1.0));
                            let x2 = rect.x + (i + 1) as f32 * step_x;
                            let y2 =
                                rect.y + rect.h * (1.0 - (values[i + 1] / max_v).clamp(0.0, 1.0));
                            ctx.DrawLine(
                                D2D_POINT_2F { x: x1, y: y1 },
                                D2D_POINT_2F { x: x2, y: y2 },
                                &self.brush,
                                2.0,
                                &self.round_stroke,
                            );
                        }
                    }
                }
                SceneNode::BarChart {
                    rect,
                    values,
                    colors,
                    gap,
                } => {
                    if values.is_empty() {
                        return;
                    }
                    let n = values.len() as f32;
                    let bw = ((rect.w - gap * (n - 1.0)) / n).max(2.0);
                    unsafe {
                        for (i, &val) in values.iter().enumerate() {
                            let h = (rect.h * val.clamp(0.05, 1.0)).max(2.0);
                            let x = rect.x + i as f32 * (bw + gap);
                            let y = rect.y + rect.h - h;
                            let col = colors
                                .get(i)
                                .or_else(|| colors.first())
                                .copied()
                                .unwrap_or(RgbaColor::new(56, 130, 246, 0.9));
                            self.brush.SetColor(&d2d_color(col));
                            ctx.FillRoundedRectangle(
                                &D2D1_ROUNDED_RECT {
                                    rect: D2D_RECT_F {
                                        left: x,
                                        top: y,
                                        right: x + bw,
                                        bottom: rect.y + rect.h,
                                    },
                                    radiusX: (bw * 0.4).min(4.0),
                                    radiusY: (bw * 0.4).min(4.0),
                                },
                                &self.brush,
                            );
                        }
                    }
                }
                SceneNode::HeatmapGrid {
                    rect,
                    cols,
                    rows,
                    levels,
                    base_color,
                    accent_color,
                } => {
                    if *cols == 0 || *rows == 0 {
                        return;
                    }
                    let gap = 3.0;
                    let cw = ((rect.w - gap * (*cols as f32 - 1.0)) / *cols as f32).max(4.0);
                    let ch = ((rect.h - gap * (*rows as f32 - 1.0)) / *rows as f32).max(4.0);
                    unsafe {
                        for c in 0..*cols {
                            for r in 0..*rows {
                                let idx = c * (*rows) + r;
                                let lv = levels.get(idx).copied().unwrap_or(0);
                                let col = match lv {
                                    0 => *base_color,
                                    1 => accent_color.with_alpha(0.32),
                                    2 => accent_color.with_alpha(0.55),
                                    3 => accent_color.with_alpha(0.78),
                                    _ => accent_color.with_alpha(1.0),
                                };
                                let x = rect.x + c as f32 * (cw + gap);
                                let y = rect.y + r as f32 * (ch + gap);
                                self.brush.SetColor(&d2d_color(col));
                                ctx.FillRoundedRectangle(
                                    &D2D1_ROUNDED_RECT {
                                        rect: D2D_RECT_F {
                                            left: x,
                                            top: y,
                                            right: x + cw,
                                            bottom: y + ch,
                                        },
                                        radiusX: 2.5,
                                        radiusY: 2.5,
                                    },
                                    &self.brush,
                                );
                            }
                        }
                    }
                }
                SceneNode::Treemap {
                    rect,
                    items,
                    text_color,
                } => {
                    if items.is_empty() {
                        return;
                    }
                    let total: f32 = items.iter().map(|(_, v, _)| v.max(0.01)).sum();
                    let mut x_cursor = rect.x;
                    for (label, val, col) in items {
                        let frac = (val.max(0.01) / total).clamp(0.05, 1.0);
                        let w = (rect.w * frac - 3.0).max(8.0);
                        let tile = RectF::new(x_cursor, rect.y, w.min(rect.x + rect.w - x_cursor), rect.h);
                        unsafe {
                            self.brush.SetColor(&d2d_color(*col));
                            ctx.FillRoundedRectangle(
                                &D2D1_ROUNDED_RECT {
                                    rect: d2d_rect(tile),
                                    radiusX: 8.0,
                                    radiusY: 8.0,
                                },
                                &self.brush,
                            );
                        }
                        if tile.w > 34.0 {
                            self.draw_scene_node(
                                res,
                                &SceneNode::Text {
                                    rect: tile.inset(5.0),
                                    content: label.clone(),
                                    font_size: 10.5,
                                    font_weight: 600,
                                    color: *text_color,
                                    align: TextAlign::Left,
                                    tabular_nums: false,
                                    tight_kerning: false,
                                    max_lines: 2,
                                    interactive_action: None,
                                },
                                font_family,
                                text_scale,
                                reduced_motion,
                                None,
                            );
                        }
                        x_cursor += w + 3.0;
                        if x_cursor >= rect.x + rect.w - 4.0 {
                            break;
                        }
                    }
                }
                SceneNode::AnalogClock {
                    cx,
                    cy,
                    radius,
                    hour_deg,
                    minute_deg,
                    second_deg,
                    skeleton,
                    dial_color,
                    hand_color,
                    accent_color,
                } => unsafe {
                    self.brush.SetColor(&d2d_color(*dial_color));
                    ctx.DrawEllipse(
                        &D2D1_ELLIPSE {
                            point: D2D_POINT_2F { x: *cx, y: *cy },
                            radiusX: *radius,
                            radiusY: *radius,
                        },
                        &self.brush,
                        if *skeleton { 1.2 } else { 2.0 },
                        None,
                    );
                    for i in 0..12 {
                        let a = (i as f32) * std::f32::consts::TAU / 12.0 - std::f32::consts::FRAC_PI_2;
                        let r_in = if i % 3 == 0 { radius * 0.80 } else { radius * 0.88 };
                        let r_out = radius * 0.94;
                        ctx.DrawLine(
                            D2D_POINT_2F {
                                x: cx + r_in * a.cos(),
                                y: cy + r_in * a.sin(),
                            },
                            D2D_POINT_2F {
                                x: cx + r_out * a.cos(),
                                y: cy + r_out * a.sin(),
                            },
                            &self.brush,
                            if i % 3 == 0 { 2.0 } else { 1.0 },
                            &self.round_stroke,
                        );
                    }
                    let draw_hand = |deg: f32, len_frac: f32, width: f32, col: RgbaColor| {
                        let rad = (deg - 90.0).to_radians();
                        self.brush.SetColor(&d2d_color(col));
                        ctx.DrawLine(
                            D2D_POINT_2F { x: *cx, y: *cy },
                            D2D_POINT_2F {
                                x: cx + radius * len_frac * rad.cos(),
                                y: cy + radius * len_frac * rad.sin(),
                            },
                            &self.brush,
                            width,
                            &self.round_stroke,
                        );
                    };
                    draw_hand(*hour_deg, 0.52, 3.2, *hand_color);
                    draw_hand(*minute_deg, 0.74, 2.2, *hand_color);
                    if let Some(sd) = second_deg {
                        draw_hand(*sd, 0.82, 1.2, *accent_color);
                    }
                    self.brush.SetColor(&d2d_color(*accent_color));
                    ctx.FillEllipse(
                        &D2D1_ELLIPSE {
                            point: D2D_POINT_2F { x: *cx, y: *cy },
                            radiusX: 3.0,
                            radiusY: 3.0,
                        },
                        &self.brush,
                    );
                },
                SceneNode::Line {
                    x1,
                    y1,
                    x2,
                    y2,
                    color,
                    width,
                } => unsafe {
                    self.brush.SetColor(&d2d_color(*color));
                    ctx.DrawLine(
                        D2D_POINT_2F { x: *x1, y: *y1 },
                        D2D_POINT_2F { x: *x2, y: *y2 },
                        &self.brush,
                        *width,
                        &self.round_stroke,
                    );
                },
                SceneNode::ImageRef {
                    rect,
                    radius,
                    source_path,
                } => {
                    if let Some(bmp) = self.load_image_bitmap(res, source_path) {
                        if let Some(geom) = self.build_superellipse_geometry(res, *rect, *radius, 0.5)
                        {
                            unsafe {
                                let layer_params = D2D1_LAYER_PARAMETERS1 {
                                    contentBounds: d2d_rect(*rect),
                                    geometricMask: std::mem::ManuallyDrop::new(Some(geom.into())),
                                    maskAntialiasMode:
                                        windows::Win32::Graphics::Direct2D::D2D1_ANTIALIAS_MODE_PER_PRIMITIVE,
                                    maskTransform: Matrix3x2::identity(),
                                    opacity: 1.0,
                                    opacityBrush: std::mem::ManuallyDrop::new(None),
                                    layerOptions:
                                        windows::Win32::Graphics::Direct2D::D2D1_LAYER_OPTIONS1_NONE,
                                };
                                ctx.PushLayer(&layer_params, None);
                                ctx.DrawBitmap(
                                    &bmp,
                                    Some(&d2d_rect(*rect)),
                                    1.0,
                                    D2D1_INTERPOLATION_MODE_LINEAR,
                                    None,
                                    None,
                                );
                                ctx.PopLayer();
                            }
                        }
                    }
                }
                SceneNode::IconGlyph {
                    rect,
                    glyph,
                    size,
                    color,
                    ..
                } => {
                    let fmt = self
                        .get_text_format(res, "Segoe Fluent Icons", 400, *size, TextAlign::Center)
                        .or_else(|| {
                            self.get_text_format(
                                res,
                                "Segoe MDL2 Assets",
                                400,
                                *size,
                                TextAlign::Center,
                            )
                        });
                    let Some(fmt) = fmt else { return };
                    let text_w: Vec<u16> = glyph.encode_utf16().collect();
                    if let Ok(layout) = unsafe {
                        res.dwrite_factory.CreateTextLayout(
                            &text_w,
                            &fmt,
                            rect.w.max(1.0),
                            rect.h.max(1.0),
                        )
                    } {
                        unsafe {
                            self.brush.SetColor(&d2d_color(*color));
                            ctx.DrawTextLayout(
                                D2D_POINT_2F {
                                    x: rect.x,
                                    y: rect.y,
                                },
                                &layout,
                                &self.brush,
                                D2D1_DRAW_TEXT_OPTIONS_CLIP,
                            );
                        }
                    }
                }
            }
        }

        fn draw_add_gallery_button(&mut self, res: &D2DDeviceResources, btn: RectF) {
            let ctx = &res.d2d_context;
            unsafe {
                ctx.SetTransform(&Matrix3x2::identity());
                self.brush.SetColor(&D2D1_COLOR_F {
                    r: 0.22,
                    g: 0.51,
                    b: 0.96,
                    a: 0.94,
                });
                ctx.FillRoundedRectangle(
                    &D2D1_ROUNDED_RECT {
                        rect: d2d_rect(btn),
                        radiusX: btn.h * 0.5,
                        radiusY: btn.h * 0.5,
                    },
                    &self.brush,
                );
            }
            self.draw_scene_node(
                res,
                &SceneNode::Text {
                    rect: RectF::new(btn.x, btn.y + 8.0, btn.w, btn.h - 8.0),
                    content: "+ Tambah Widget".to_string(),
                    font_size: 13.0,
                    font_weight: 600,
                    color: RgbaColor::new(255, 255, 255, 1.0),
                    align: TextAlign::Center,
                    tabular_nums: false,
                    tight_kerning: false,
                    max_lines: 1,
                    interactive_action: None,
                },
                "Segoe UI Variable",
                1.0,
                true,
                None,
            );
        }
    }
}
