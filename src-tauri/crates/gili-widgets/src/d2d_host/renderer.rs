#[cfg(windows)]
pub mod render {
    use crate::config::{BackgroundMode, RgbaColor, CARD_CORNER_SMOOTHING, CARD_RADIUS_DP};
    use crate::d2d_host::device::{
        gpu::{D2DDeviceResources, MonitorSwapChain},
        SystemVisualPolicy,
    };
    use crate::layout::{build_superellipse_points, RectF, SceneNode, TextAlign, WidgetRenderItem};
    use crate::spring::{DigitRollState, SpringParams, SpringValue};
    use std::collections::HashMap;
    use std::hash::{Hash, Hasher};
    use windows::core::{Interface, HSTRING, PCWSTR};
    use windows::Foundation::Numerics::Matrix3x2;
    use windows::Win32::Foundation::RECT;
    use windows::Win32::Graphics::Direct2D::Common::{
        D2D1_ALPHA_MODE_PREMULTIPLIED, D2D1_COLOR_F, D2D1_FIGURE_BEGIN_FILLED,
        D2D1_FIGURE_END_CLOSED, D2D1_GRADIENT_STOP, D2D1_PIXEL_FORMAT, D2D_POINT_2F, D2D_RECT_F,
        D2D_SIZE_U,
    };
    use windows::Win32::Graphics::Direct2D::{
        ID2D1Bitmap1, ID2D1LinearGradientBrush, ID2D1PathGeometry, ID2D1RenderTarget,
        ID2D1SolidColorBrush, ID2D1StrokeStyle, D2D1_ARC_SEGMENT, D2D1_ARC_SIZE_LARGE,
        D2D1_ARC_SIZE_SMALL, D2D1_BITMAP_OPTIONS_NONE, D2D1_BITMAP_OPTIONS_TARGET,
        D2D1_BITMAP_PROPERTIES1, D2D1_CAP_STYLE_ROUND, D2D1_DASH_STYLE_DASH,
        D2D1_DRAW_TEXT_OPTIONS_CLIP, D2D1_ELLIPSE, D2D1_EXTEND_MODE_CLAMP, D2D1_GAMMA_2_2,
        D2D1_INTERPOLATION_MODE_LINEAR, D2D1_LAYER_PARAMETERS1,
        D2D1_LINEAR_GRADIENT_BRUSH_PROPERTIES, D2D1_ROUNDED_RECT, D2D1_STROKE_STYLE_PROPERTIES1,
        D2D1_SWEEP_DIRECTION_CLOCKWISE, D2D1_TEXT_ANTIALIAS_MODE_GRAYSCALE,
    };
    use windows::Win32::Graphics::DirectWrite::{
        IDWriteTextFormat, IDWriteTextLayout, DWRITE_FONT_STRETCH_NORMAL, DWRITE_FONT_STYLE_NORMAL,
        DWRITE_FONT_WEIGHT, DWRITE_PARAGRAPH_ALIGNMENT_NEAR, DWRITE_TEXT_ALIGNMENT_CENTER,
        DWRITE_TEXT_ALIGNMENT_LEADING, DWRITE_TEXT_ALIGNMENT_TRAILING, DWRITE_TEXT_RANGE,
        DWRITE_TRIMMING, DWRITE_TRIMMING_GRANULARITY_CHARACTER, DWRITE_WORD_WRAPPING_NO_WRAP,
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
        if let Some(cf) = item.card_fill {
            cf.r.hash(&mut h);
            cf.g.hash(&mut h);
            cf.b.hash(&mut h);
            cf.a.to_bits().hash(&mut h);
        }
        if let Some((gt, gb)) = item.card_gradient {
            gt.r.hash(&mut h);
            gt.g.hash(&mut h);
            gt.b.hash(&mut h);
            gt.a.to_bits().hash(&mut h);
            gb.r.hash(&mut h);
            gb.g.hash(&mut h);
            gb.b.hash(&mut h);
            gb.a.to_bits().hash(&mut h);
        }
        item.font_family.hash(&mut h);
        item.text_scale.to_bits().hash(&mut h);
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

    struct ImageTransitionState {
        prev_path: String,
        current_path: String,
        progress: SpringValue,
    }

    fn compute_cover_src_rect(bmp: &ID2D1Bitmap1, rect: RectF) -> Option<D2D_RECT_F> {
        let bmp_sz = unsafe { bmp.GetSize() };
        if bmp_sz.width <= 0.0 || bmp_sz.height <= 0.0 || rect.w <= 0.0 || rect.h <= 0.0 {
            return None;
        }
        let src_aspect = bmp_sz.width / bmp_sz.height;
        let dst_aspect = rect.w / rect.h;
        if src_aspect > dst_aspect {
            let crop_w = bmp_sz.height * dst_aspect;
            let x0 = (bmp_sz.width - crop_w) * 0.5;
            Some(D2D_RECT_F {
                left: x0,
                top: 0.0,
                right: x0 + crop_w,
                bottom: bmp_sz.height,
            })
        } else {
            let crop_h = bmp_sz.width / dst_aspect;
            let y0 = (bmp_sz.height - crop_h) * 0.5;
            Some(D2D_RECT_F {
                left: 0.0,
                top: y0,
                right: bmp_sz.width,
                bottom: y0 + crop_h,
            })
        }
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
        photo_transitions: HashMap<String, ImageTransitionState>,
        prev_hashes: HashMap<String, (u64, RectF)>,
    }

    impl D2DWidgetRenderer {
        pub fn new(res: &D2DDeviceResources) -> Result<Self, String> {
            unsafe {
                let brush = res
                    .d2d_context
                    .CreateSolidColorBrush(
                        &D2D1_COLOR_F {
                            r: 1.0,
                            g: 1.0,
                            b: 1.0,
                            a: 1.0,
                        },
                        None,
                    )
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
                    photo_transitions: HashMap::new(),
                    prev_hashes: HashMap::new(),
                })
            }
        }

        pub fn clear_caches(&mut self) {
            self.text_formats.clear();
            self.shadow_cache.clear();
            self.image_cache.clear();
            self.digit_rolls.clear();
            self.photo_transitions.clear();
            self.prev_hashes.clear();
        }

        pub fn has_active_animations(&self) -> bool {
            self.digit_rolls
                .values()
                .any(|r| !r.progress.is_settled() && r.prev_text != r.current_text)
                || self
                    .photo_transitions
                    .values()
                    .any(|t| !t.progress.is_settled() && t.prev_path != t.current_path)
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

        fn create_vertical_gradient_brush(
            &self,
            res: &D2DDeviceResources,
            rect: RectF,
            top: RgbaColor,
            bottom: RgbaColor,
        ) -> Option<ID2D1LinearGradientBrush> {
            let stops = [
                D2D1_GRADIENT_STOP {
                    position: 0.0,
                    color: d2d_color(top),
                },
                D2D1_GRADIENT_STOP {
                    position: 1.0,
                    color: d2d_color(bottom),
                },
            ];
            let props = D2D1_LINEAR_GRADIENT_BRUSH_PROPERTIES {
                startPoint: D2D_POINT_2F {
                    x: rect.x,
                    y: rect.y,
                },
                endPoint: D2D_POINT_2F {
                    x: rect.x,
                    y: rect.y + rect.h,
                },
            };
            unsafe {
                let rt: ID2D1RenderTarget = res.d2d_context.cast().ok()?;
                let stop_col = rt
                    .CreateGradientStopCollection(&stops, D2D1_GAMMA_2_2, D2D1_EXTEND_MODE_CLAMP)
                    .ok()?;
                res.d2d_context
                    .CreateLinearGradientBrush(&props, None, &stop_col)
                    .ok()
            }
        }

        fn apply_single_line_trimming(
            res: &D2DDeviceResources,
            fmt: &IDWriteTextFormat,
            layout: &IDWriteTextLayout,
        ) {
            unsafe {
                let _ = layout.SetWordWrapping(DWRITE_WORD_WRAPPING_NO_WRAP);
                if let Ok(sign) = res.dwrite_factory.CreateEllipsisTrimmingSign(fmt) {
                    let trim = DWRITE_TRIMMING {
                        granularity: DWRITE_TRIMMING_GRANULARITY_CHARACTER,
                        delimiter: 0,
                        delimiterCount: 0,
                    };
                    let _ = layout.SetTrimming(&trim, Some(&sign));
                }
            }
        }

        fn draw_weather_icon(
            &self,
            res: &D2DDeviceResources,
            rect: RectF,
            code: i32,
            cloud_color: RgbaColor,
            accent_color: RgbaColor,
        ) {
            let s = rect.w.min(rect.h).max(8.0);
            let ox = rect.x + (rect.w - s) * 0.5;
            let oy = rect.y + (rect.h - s) * 0.5;
            let ctx = &res.d2d_context;

            let draw_sun = |cx: f32, cy: f32, r: f32, ray_in: f32, ray_out: f32, sw: f32, col: RgbaColor| unsafe {
                self.brush.SetColor(&d2d_color(col));
                ctx.FillEllipse(
                    &D2D1_ELLIPSE {
                        point: D2D_POINT_2F { x: cx, y: cy },
                        radiusX: r,
                        radiusY: r,
                    },
                    &self.brush,
                );
                for i in 0..8 {
                    let a = (i as f32) * std::f32::consts::FRAC_PI_4;
                    ctx.DrawLine(
                        D2D_POINT_2F {
                            x: cx + ray_in * a.cos(),
                            y: cy + ray_in * a.sin(),
                        },
                        D2D_POINT_2F {
                            x: cx + ray_out * a.cos(),
                            y: cy + ray_out * a.sin(),
                        },
                        &self.brush,
                        sw,
                        &self.round_stroke,
                    );
                }
            };

            let draw_cloud = |cx_base: f32, cy_base: f32, scale: f32, col: RgbaColor| unsafe {
                let u = s * scale;
                self.brush.SetColor(&d2d_color(col));
                ctx.FillRoundedRectangle(
                    &D2D1_ROUNDED_RECT {
                        rect: D2D_RECT_F {
                            left: cx_base - 0.36 * u,
                            top: cy_base - 0.08 * u,
                            right: cx_base + 0.36 * u,
                            bottom: cy_base + 0.16 * u,
                        },
                        radiusX: 0.12 * u,
                        radiusY: 0.12 * u,
                    },
                    &self.brush,
                );
                for (dx, dy, r) in [(-0.19, -0.02, 0.18), (0.02, -0.11, 0.22), (0.22, 0.01, 0.15)] {
                    ctx.FillEllipse(
                        &D2D1_ELLIPSE {
                            point: D2D_POINT_2F {
                                x: cx_base + dx * u,
                                y: cy_base + dy * u,
                            },
                            radiusX: r * u,
                            radiusY: r * u,
                        },
                        &self.brush,
                    );
                }
            };

            match code {
                0 => {
                    draw_sun(
                        ox + 0.50 * s,
                        oy + 0.50 * s,
                        0.21 * s,
                        0.29 * s,
                        0.39 * s,
                        (0.085 * s).max(1.3),
                        accent_color,
                    );
                }
                1..=2 => {
                    draw_sun(
                        ox + 0.67 * s,
                        oy + 0.33 * s,
                        0.14 * s,
                        0.20 * s,
                        0.27 * s,
                        (0.070 * s).max(1.1),
                        accent_color,
                    );
                    draw_cloud(ox + 0.45 * s, oy + 0.57 * s, 0.92, cloud_color);
                }
                3 => {
                    draw_cloud(
                        ox + 0.58 * s,
                        oy + 0.42 * s,
                        0.72,
                        cloud_color.with_alpha(cloud_color.a * 0.52),
                    );
                    draw_cloud(ox + 0.45 * s, oy + 0.57 * s, 0.94, cloud_color);
                }
                45 | 48 => {
                    draw_cloud(ox + 0.50 * s, oy + 0.43 * s, 0.92, cloud_color);
                    let mist_sw = (0.085 * s).max(1.4);
                    unsafe {
                        self.brush
                            .SetColor(&d2d_color(cloud_color.with_alpha(cloud_color.a * 0.75)));
                        for (x0, x1, y) in [(0.20, 0.80, 0.68), (0.26, 0.74, 0.81)] {
                            ctx.DrawLine(
                                D2D_POINT_2F {
                                    x: ox + x0 * s,
                                    y: oy + y * s,
                                },
                                D2D_POINT_2F {
                                    x: ox + x1 * s,
                                    y: oy + y * s,
                                },
                                &self.brush,
                                mist_sw,
                                &self.round_stroke,
                            );
                        }
                    }
                }
                51..=57 => {
                    draw_cloud(ox + 0.50 * s, oy + 0.43 * s, 0.92, cloud_color);
                    let drop_sw = (0.090 * s).max(1.4);
                    unsafe {
                        self.brush.SetColor(&d2d_color(accent_color));
                        for (dx, y0) in [(-0.14, 0.65), (0.10, 0.67)] {
                            ctx.DrawLine(
                                D2D_POINT_2F {
                                    x: ox + (0.50 + dx) * s,
                                    y: oy + y0 * s,
                                },
                                D2D_POINT_2F {
                                    x: ox + (0.50 + dx - 0.05) * s,
                                    y: oy + (y0 + 0.14) * s,
                                },
                                &self.brush,
                                drop_sw,
                                &self.round_stroke,
                            );
                        }
                    }
                }
                61..=67 | 80..=82 => {
                    draw_cloud(ox + 0.50 * s, oy + 0.41 * s, 0.94, cloud_color);
                    let rain_sw = (0.095 * s).max(1.45);
                    unsafe {
                        self.brush.SetColor(&d2d_color(accent_color));
                        for (dx, y0) in [(-0.20, 0.64), (0.00, 0.68), (0.20, 0.64)] {
                            ctx.DrawLine(
                                D2D_POINT_2F {
                                    x: ox + (0.50 + dx) * s,
                                    y: oy + y0 * s,
                                },
                                D2D_POINT_2F {
                                    x: ox + (0.50 + dx - 0.06) * s,
                                    y: oy + (y0 + 0.16) * s,
                                },
                                &self.brush,
                                rain_sw,
                                &self.round_stroke,
                            );
                        }
                    }
                }
                95..=99 => {
                    draw_cloud(ox + 0.50 * s, oy + 0.40 * s, 0.94, cloud_color);
                    let bolt_sw = (0.095 * s).max(1.45);
                    let rain_sw = (0.080 * s).max(1.2);
                    unsafe {
                        self.brush
                            .SetColor(&d2d_color(cloud_color.with_alpha(cloud_color.a * 0.72)));
                        for dx in [-0.22f32, 0.22] {
                            ctx.DrawLine(
                                D2D_POINT_2F {
                                    x: ox + (0.50 + dx) * s,
                                    y: oy + 0.63 * s,
                                },
                                D2D_POINT_2F {
                                    x: ox + (0.50 + dx - 0.05) * s,
                                    y: oy + 0.77 * s,
                                },
                                &self.brush,
                                rain_sw,
                                &self.round_stroke,
                            );
                        }
                        self.brush.SetColor(&d2d_color(accent_color));
                        let pts = [
                            (0.53, 0.56),
                            (0.43, 0.70),
                            (0.53, 0.70),
                            (0.45, 0.87),
                        ];
                        for w in pts.windows(2) {
                            ctx.DrawLine(
                                D2D_POINT_2F {
                                    x: ox + w[0].0 * s,
                                    y: oy + w[0].1 * s,
                                },
                                D2D_POINT_2F {
                                    x: ox + w[1].0 * s,
                                    y: oy + w[1].1 * s,
                                },
                                &self.brush,
                                bolt_sw,
                                &self.round_stroke,
                            );
                        }
                    }
                }
                _ => {
                    draw_cloud(ox + 0.50 * s, oy + 0.54 * s, 0.96, cloud_color);
                }
            }
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
            let trimmed = source.trim();
            if trimmed.is_empty() {
                return None;
            }
            if let Some(bmp) = self.image_cache.get(trimmed) {
                return Some(bmp.clone());
            }
            let img = if let Some(b64_part) = trimmed
                .strip_prefix("data:")
                .and_then(|rest| rest.split_once(";base64,").map(|(_, b)| b))
            {
                use base64::Engine;
                let cleaned: String = b64_part
                    .chars()
                    .filter(|c| !c.is_ascii_whitespace())
                    .collect();
                let bytes = base64::engine::general_purpose::STANDARD
                    .decode(&cleaned)
                    .or_else(|_| base64::engine::general_purpose::STANDARD_NO_PAD.decode(&cleaned))
                    .or_else(|_| base64::engine::general_purpose::URL_SAFE.decode(&cleaned))
                    .ok()?;
                image::load_from_memory(&bytes).ok()?
            } else {
                let path = trimmed
                    .strip_prefix("file:///")
                    .or_else(|| trimmed.strip_prefix("file://"))
                    .map(|p| p.replace("%20", " "))
                    .unwrap_or_else(|| trimmed.to_string());
                let decoded = image::open(&path).ok()?;
                let orient = crate::providers::local_stores::read_jpeg_exif_orientation(
                    std::path::Path::new(&path),
                );
                match orient {
                    2 => decoded.fliph(),
                    3 => decoded.rotate180(),
                    4 => decoded.flipv(),
                    5 => decoded.rotate90().fliph(),
                    6 => decoded.rotate90(),
                    7 => decoded.rotate270().fliph(),
                    8 => decoded.rotate270(),
                    _ => decoded,
                }
            };
            let rgba = img.thumbnail(512, 512).to_rgba8();
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
                        D2D_SIZE_U {
                            width: w,
                            height: h,
                        },
                        Some(bgra.as_ptr() as *const _),
                        w * 4,
                        &props,
                    )
                    .ok()?
            };
            if self.image_cache.len() > 24 {
                self.image_cache.clear();
            }
            self.image_cache.insert(trimmed.to_string(), bmp.clone());
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
            dt_sec: f32,
        ) -> (usize, windows::core::Result<()>) {
            let dpi_scale = swap.dpi / 96.0;
            let rolls_active = self.has_active_animations();
            let force_full = force_full || rolls_active;
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
            self.shadow_cache
                .retain(|k, _| self.prev_hashes.contains_key(k));
            self.digit_rolls.retain(|k, _| {
                k.split(':')
                    .next()
                    .map(|sid| self.prev_hashes.contains_key(sid))
                    .unwrap_or(false)
            });
            self.photo_transitions.retain(|k, _| {
                k.split(':')
                    .next()
                    .map(|sid| self.prev_hashes.contains_key(sid))
                    .unwrap_or(false)
            });

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
                self.draw_widget_item(res, item, edit_mode, policy, dpi_scale, dt_sec);
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
            dt_sec: f32,
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

            let is_loaded_photo = item.widget_type == "photo_frame"
                && item
                    .nodes
                    .iter()
                    .any(|n| matches!(n, crate::layout::SceneNode::ImageRef { .. }));

            if effective_bg != BackgroundMode::None {
                if !is_loaded_photo {
                    let fill = if policy.high_contrast {
                        RgbaColor::new(0, 0, 0, 0.96)
                    } else {
                        item.card_fill
                            .unwrap_or_else(|| RgbaColor::new(22, 24, 32, 0.52))
                    };
                    let (top_col, bot_col) = if policy.high_contrast {
                        (fill, fill)
                    } else if let Some((gt, gb)) = item.card_gradient {
                        (gt, gb)
                    } else {
                        let is_light_card = fill.r > 180 && fill.g > 180 && fill.b > 180;
                        let lift = if is_light_card { 10 } else { 20 };
                        let top = RgbaColor::new(
                            fill.r.saturating_add(lift),
                            fill.g.saturating_add(lift),
                            fill.b
                                .saturating_add(lift + if is_light_card { 0 } else { 4 }),
                            fill.a,
                        );
                        (top, fill)
                    };
                    if let Some(geom) = self.build_superellipse_geometry(
                        res,
                        item.frame,
                        CARD_RADIUS_DP,
                        CARD_CORNER_SMOOTHING,
                    ) {
                        if let Some(grad_brush) =
                            self.create_vertical_gradient_brush(res, item.frame, top_col, bot_col)
                        {
                            unsafe {
                                ctx.FillGeometry(&geom, &grad_brush, None);
                            }
                        } else {
                            unsafe {
                                self.brush.SetColor(&d2d_color(fill));
                                ctx.FillGeometry(&geom, &self.brush, None);
                            }
                        }

                        if policy.high_contrast {
                            unsafe {
                                self.brush
                                    .SetColor(&d2d_color(RgbaColor::new(255, 255, 255, 0.95)));
                                ctx.DrawGeometry(&geom, &self.brush, 1.2, None);
                            }
                        } else {
                            let is_light_surface =
                                bot_col.r > 180 && bot_col.g > 180 && bot_col.b > 180;
                            let rim_top = match effective_bg {
                                BackgroundMode::Glass => {
                                    if is_light_surface {
                                        RgbaColor::new(255, 255, 255, 0.72)
                                    } else {
                                        RgbaColor::new(255, 255, 255, 0.34)
                                    }
                                }
                                BackgroundMode::SubtleTint => RgbaColor::new(255, 255, 255, 0.22),
                                _ => RgbaColor::new(255, 255, 255, 0.14),
                            };
                            let rim_bot = RgbaColor::new(255, 255, 255, 0.08);
                            if let Some(rim_brush) = self
                                .create_vertical_gradient_brush(res, item.frame, rim_top, rim_bot)
                            {
                                unsafe {
                                    ctx.DrawGeometry(&geom, &rim_brush, 1.15, None);
                                }
                            } else {
                                let border_col = item
                                    .inner_border
                                    .unwrap_or_else(|| RgbaColor::new(255, 255, 255, 0.20));
                                unsafe {
                                    self.brush.SetColor(&d2d_color(border_col));
                                    ctx.DrawGeometry(&geom, &self.brush, 1.0, None);
                                }
                            }

                            if effective_bg == BackgroundMode::Glass
                                || effective_bg == BackgroundMode::SubtleTint
                            {
                                unsafe {
                                    self.brush.SetColor(&D2D1_COLOR_F {
                                        r: 1.0,
                                        g: 1.0,
                                        b: 1.0,
                                        a: if effective_bg == BackgroundMode::Glass {
                                            0.20
                                        } else {
                                            0.10
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
                self.draw_cached_text_shadow(
                    res,
                    item,
                    policy.text_scale_factor * item.text_scale,
                    dpi_scale,
                );
            }

            for (idx, node) in item.nodes.iter().enumerate() {
                let roll_key = format!("{}:{}:{}", item.slot_id, item.widget_type, idx);
                self.draw_scene_node(
                    res,
                    node,
                    &item.font_family,
                    policy.text_scale_factor * item.text_scale,
                    policy.reduced_motion,
                    Some(&roll_key),
                    dt_sec,
                );
            }

            if effective_bg != BackgroundMode::None && is_loaded_photo {
                if let Some(geom) = self.build_superellipse_geometry(res, item.frame, 24.0, 0.65) {
                    if let Some(rim_brush) = self.create_vertical_gradient_brush(
                        res,
                        item.frame,
                        RgbaColor::new(255, 255, 255, 0.34),
                        RgbaColor::new(255, 255, 255, 0.10),
                    ) {
                        unsafe {
                            ctx.DrawGeometry(&geom, &rim_brush, 1.15, None);
                        }
                    }
                }
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
            item.font_family.hash(&mut h);
            item.frame.w.to_bits().hash(&mut h);
            item.frame.h.to_bits().hash(&mut h);
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
                    font_weight,
                    rect,
                    ..
                } = node
                {
                    content.hash(&mut h);
                    font_size.to_bits().hash(&mut h);
                    font_weight.hash(&mut h);
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
                                let sc_near = item
                                    .shadow_color
                                    .with_alpha((item.shadow_color.a * 0.65).clamp(0.0, 0.72));
                                let sc_soft = item
                                    .shadow_color
                                    .with_alpha((item.shadow_color.a * 0.30).clamp(0.0, 0.38));
                                unsafe {
                                    self.brush.SetColor(&d2d_color(sc_soft));
                                    for (dx, dy) in [(-1.0, 2.2), (1.0, 2.2), (0.0, 3.0)] {
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
                                    self.brush.SetColor(&d2d_color(sc_near));
                                    res.d2d_context.DrawTextLayout(
                                        D2D_POINT_2F {
                                            x: local_x + 0.5,
                                            y: local_y + 1.4,
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
                                    for (dx, dy) in
                                        [(-1.0, 0.0), (1.0, 0.0), (0.0, -1.0), (0.0, 1.0)]
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
            dt_sec: f32,
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
                    max_lines,
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
                            let _ = roll.tick(dt_sec.clamp(0.008, 0.05), reduced_motion);
                            let p = roll.progress.value.clamp(0.0, 1.0);
                            if !roll.progress.is_settled() && roll.prev_text != roll.current_text {
                                let shift = scaled_size * 0.42;
                                let clip_r = d2d_rect(*rect);
                                unsafe {
                                    ctx.PushAxisAlignedClip(
                                        &clip_r,
                                        windows::Win32::Graphics::Direct2D::D2D1_ANTIALIAS_MODE_PER_PRIMITIVE,
                                    );
                                }
                                // Previous digit sliding out upward and fading rapidly
                                let prev_w: Vec<u16> = roll.prev_text.encode_utf16().collect();
                                if let Ok(prev_layout) = unsafe {
                                    res.dwrite_factory.CreateTextLayout(
                                        &prev_w,
                                        &fmt,
                                        rect.w.max(1.0),
                                        rect.h.max(1.0),
                                    )
                                } {
                                    if *max_lines == 1 {
                                        Self::apply_single_line_trimming(res, &fmt, &prev_layout);
                                    }
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
                                            color.with_alpha(color.a * (1.0 - p * 1.4).max(0.0)),
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
                                // Incoming digit rolling in smoothly from below
                                let cur_w: Vec<u16> = roll.current_text.encode_utf16().collect();
                                if let Ok(cur_layout) = unsafe {
                                    res.dwrite_factory.CreateTextLayout(
                                        &cur_w,
                                        &fmt,
                                        rect.w.max(1.0),
                                        rect.h.max(1.0),
                                    )
                                } {
                                    if *max_lines == 1 {
                                        Self::apply_single_line_trimming(res, &fmt, &cur_layout);
                                    }
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
                                unsafe {
                                    ctx.PopAxisAlignedClip();
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
                    if *max_lines == 1 {
                        Self::apply_single_line_trimming(res, &fmt, &layout);
                    }
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
                    let max_v = values.iter().copied().fold(1.0f32, f32::max);
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
                                .unwrap_or(RgbaColor::new(255, 255, 255, 0.9));
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
                        let tile =
                            RectF::new(x_cursor, rect.y, w.min(rect.x + rect.w - x_cursor), rect.h);
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
                                dt_sec,
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
                    let is_mini = *radius < 28.0;
                    let dial_ellipse = D2D1_ELLIPSE {
                        point: D2D_POINT_2F { x: *cx, y: *cy },
                        radiusX: *radius,
                        radiusY: *radius,
                    };
                    if !*skeleton {
                        self.brush
                            .SetColor(&d2d_color(dial_color.with_alpha(dial_color.a * 0.12)));
                        ctx.FillEllipse(&dial_ellipse, &self.brush);
                    }
                    self.brush.SetColor(&d2d_color(
                        dial_color.with_alpha(dial_color.a * if *skeleton { 0.45 } else { 0.62 }),
                    ));
                    ctx.DrawEllipse(
                        &dial_ellipse,
                        &self.brush,
                        if *skeleton {
                            1.1
                        } else if is_mini {
                            1.25
                        } else {
                            1.6
                        },
                        None,
                    );
                    if !is_mini {
                        for m in 0..60 {
                            let is_hour = m % 5 == 0;
                            let is_cardinal = m % 15 == 0;
                            let a = (m as f32) * std::f32::consts::TAU / 60.0
                                - std::f32::consts::FRAC_PI_2;
                            let r_in = if is_cardinal {
                                radius * 0.78
                            } else if is_hour {
                                radius * 0.83
                            } else {
                                radius * 0.89
                            };
                            let r_out = radius * 0.94;
                            let alpha = if *skeleton {
                                if is_hour {
                                    0.55
                                } else {
                                    0.20
                                }
                            } else if is_cardinal {
                                0.92
                            } else if is_hour {
                                0.72
                            } else {
                                0.26
                            };
                            self.brush
                                .SetColor(&d2d_color(dial_color.with_alpha(dial_color.a * alpha)));
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
                                if is_cardinal {
                                    2.1
                                } else if is_hour {
                                    1.4
                                } else {
                                    0.75
                                },
                                &self.round_stroke,
                            );
                        }
                    } else {
                        for i in 0..12 {
                            let is_cardinal = i % 3 == 0;
                            let a = (i as f32) * std::f32::consts::TAU / 12.0
                                - std::f32::consts::FRAC_PI_2;
                            let r_in = if is_cardinal {
                                radius * 0.72
                            } else {
                                radius * 0.83
                            };
                            let r_out = radius * 0.92;
                            self.brush.SetColor(&d2d_color(
                                dial_color.with_alpha(
                                    dial_color.a * if is_cardinal { 0.88 } else { 0.45 },
                                ),
                            ));
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
                                if is_cardinal { 1.35 } else { 0.8 },
                                &self.round_stroke,
                            );
                        }
                    }
                    let draw_hand =
                        |deg: f32, len_frac: f32, tail_frac: f32, width: f32, col: RgbaColor| {
                            let rad = (deg - 90.0).to_radians();
                            self.brush.SetColor(&d2d_color(col));
                            ctx.DrawLine(
                                D2D_POINT_2F {
                                    x: cx - radius * tail_frac * rad.cos(),
                                    y: cy - radius * tail_frac * rad.sin(),
                                },
                                D2D_POINT_2F {
                                    x: cx + radius * len_frac * rad.cos(),
                                    y: cy + radius * len_frac * rad.sin(),
                                },
                                &self.brush,
                                width,
                                &self.round_stroke,
                            );
                        };
                    let scale = if is_mini { 0.62 } else { 1.0 };
                    draw_hand(*hour_deg, 0.50, 0.08, 3.4 * scale, *hand_color);
                    draw_hand(*minute_deg, 0.76, 0.08, 2.3 * scale, *hand_color);
                    if let Some(sd) = second_deg {
                        draw_hand(*sd, 0.84, 0.18, 1.3 * scale, *accent_color);
                    }
                    let pin_r = if is_mini { 1.9 } else { 3.2 };
                    self.brush.SetColor(&d2d_color(*hand_color));
                    ctx.FillEllipse(
                        &D2D1_ELLIPSE {
                            point: D2D_POINT_2F { x: *cx, y: *cy },
                            radiusX: pin_r,
                            radiusY: pin_r,
                        },
                        &self.brush,
                    );
                    if second_deg.is_some() || !is_mini {
                        self.brush.SetColor(&d2d_color(*accent_color));
                        ctx.FillEllipse(
                            &D2D1_ELLIPSE {
                                point: D2D_POINT_2F { x: *cx, y: *cy },
                                radiusX: pin_r * 0.55,
                                radiusY: pin_r * 0.55,
                            },
                            &self.brush,
                        );
                    }
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
                    ..
                } => {
                    let (cur_bmp_opt, prev_bmp_opt, trans_p) = if let Some(rk) = roll_key {
                        let photo_spring = SpringParams {
                            response: 0.58,
                            damping_ratio: 0.94,
                        };
                        let (prev_path_opt, p_val) = {
                            let tr =
                                self.photo_transitions
                                    .entry(rk.to_string())
                                    .or_insert_with(|| ImageTransitionState {
                                        prev_path: source_path.clone(),
                                        current_path: source_path.clone(),
                                        progress: SpringValue::settled(1.0),
                                    });
                            if tr.current_path != *source_path {
                                tr.prev_path =
                                    std::mem::replace(&mut tr.current_path, source_path.clone());
                                if reduced_motion {
                                    tr.progress = SpringValue::settled(1.0);
                                } else {
                                    tr.progress = SpringValue {
                                        value: 0.0,
                                        velocity: 0.0,
                                        target: 1.0,
                                    };
                                }
                            }
                            let _ = tr.progress.step(
                                dt_sec.clamp(0.008, 0.05),
                                photo_spring,
                                reduced_motion,
                            );
                            if !tr.progress.is_settled() && tr.prev_path != tr.current_path {
                                (
                                    Some(tr.prev_path.clone()),
                                    tr.progress.value.clamp(0.0, 1.0),
                                )
                            } else {
                                (None, 1.0)
                            }
                        };
                        let cur_b = self.load_image_bitmap(res, source_path);
                        let prev_b = prev_path_opt.and_then(|pp| self.load_image_bitmap(res, &pp));
                        (cur_b, prev_b, p_val)
                    } else {
                        (self.load_image_bitmap(res, source_path), None, 1.0)
                    };

                    if let Some(cur_bmp) = &cur_bmp_opt {
                        if let Some(geom) =
                            self.build_superellipse_geometry(res, *rect, *radius, 0.5)
                        {
                            unsafe {
                                let mut layer_params = D2D1_LAYER_PARAMETERS1 {
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
                                if let Some(prev_bmp) = &prev_bmp_opt {
                                    let shift = rect.w * 0.08;
                                    let prev_dst = RectF::new(
                                        rect.x - shift * trans_p,
                                        rect.y,
                                        rect.w,
                                        rect.h,
                                    );
                                    let cur_dst = RectF::new(
                                        rect.x + shift * (1.0 - trans_p),
                                        rect.y,
                                        rect.w,
                                        rect.h,
                                    );
                                    let prev_src = compute_cover_src_rect(prev_bmp, *rect);
                                    let cur_src = compute_cover_src_rect(cur_bmp, *rect);
                                    ctx.DrawBitmap(
                                        prev_bmp,
                                        Some(&d2d_rect(prev_dst)),
                                        (1.0 - trans_p).clamp(0.0, 1.0),
                                        D2D1_INTERPOLATION_MODE_LINEAR,
                                        prev_src.as_ref().map(|r| r as *const _),
                                        None,
                                    );
                                    ctx.DrawBitmap(
                                        cur_bmp,
                                        Some(&d2d_rect(cur_dst)),
                                        trans_p,
                                        D2D1_INTERPOLATION_MODE_LINEAR,
                                        cur_src.as_ref().map(|r| r as *const _),
                                        None,
                                    );
                                } else {
                                    let src_rect = compute_cover_src_rect(cur_bmp, *rect);
                                    ctx.DrawBitmap(
                                        cur_bmp,
                                        Some(&d2d_rect(*rect)),
                                        1.0,
                                        D2D1_INTERPOLATION_MODE_LINEAR,
                                        src_rect.as_ref().map(|r| r as *const _),
                                        None,
                                    );
                                }
                                ctx.PopLayer();
                                std::mem::ManuallyDrop::drop(&mut layer_params.geometricMask);
                                std::mem::ManuallyDrop::drop(&mut layer_params.opacityBrush);
                            }
                        }
                    }
                }
                SceneNode::WeatherIcon {
                    rect,
                    code,
                    cloud_color,
                    accent_color,
                } => {
                    self.draw_weather_icon(res, *rect, *code, *cloud_color, *accent_color);
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
                    r: 0.10,
                    g: 0.11,
                    b: 0.14,
                    a: 0.92,
                });
                let rr = D2D1_ROUNDED_RECT {
                    rect: d2d_rect(btn),
                    radiusX: btn.h * 0.5,
                    radiusY: btn.h * 0.5,
                };
                ctx.FillRoundedRectangle(&rr, &self.brush);
                self.brush.SetColor(&D2D1_COLOR_F {
                    r: 1.0,
                    g: 1.0,
                    b: 1.0,
                    a: 0.24,
                });
                ctx.DrawRoundedRectangle(&rr, &self.brush, 1.0, None);
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
                0.016,
            );
        }
    }
}
