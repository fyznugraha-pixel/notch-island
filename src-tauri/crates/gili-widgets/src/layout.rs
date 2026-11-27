use crate::config::{
    BackgroundMode, RgbaColor, WidgetSize, WidgetStackSlot, CARD_CORNER_SMOOTHING, CARD_RADIUS_DP,
    GRID_GAP_DP, GRID_SMALL_DP,
};
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq)]
pub struct RectF {
    pub x: f32,
    pub y: f32,
    pub w: f32,
    pub h: f32,
}

impl RectF {
    pub const fn new(x: f32, y: f32, w: f32, h: f32) -> Self {
        Self { x, y, w, h }
    }

    pub fn contains(self, px: f32, py: f32) -> bool {
        px >= self.x && px <= self.x + self.w && py >= self.y && py <= self.y + self.h
    }

    pub fn inset(self, pad: f32) -> Self {
        Self {
            x: self.x + pad,
            y: self.y + pad,
            w: (self.w - pad * 2.0).max(0.0),
            h: (self.h - pad * 2.0).max(0.0),
        }
    }

    pub fn union(self, other: Self) -> Self {
        let x0 = self.x.min(other.x);
        let y0 = self.y.min(other.y);
        let x1 = (self.x + self.w).max(other.x + other.w);
        let y1 = (self.y + self.h).max(other.y + other.h);
        Self::new(x0, y0, (x1 - x0).max(0.0), (y1 - y0).max(0.0))
    }

    pub fn intersects_with_gap(self, other: Self, gap: f32) -> bool {
        self.x < other.x + other.w + gap
            && self.x + self.w + gap > other.x
            && self.y < other.y + other.h + gap
            && self.y + self.h + gap > other.y
    }
}

/// Concentric corner radius formula for nested elements inside a continuous-corner card.
pub fn concentric_radius(outer_radius: f32, inset_dp: f32) -> f32 {
    (outer_radius - inset_dp).max(4.0)
}

/// Generates clockwise polygon points approximating a continuous superellipse corner (~60% smoothing).
pub fn build_superellipse_points(rect: RectF, radius: f32, smoothing: f32) -> Vec<(f32, f32)> {
    let r = radius.min(rect.w * 0.5).min(rect.h * 0.5).max(0.0);
    if r <= 0.5 {
        return vec![
            (rect.x, rect.y),
            (rect.x + rect.w, rect.y),
            (rect.x + rect.w, rect.y + rect.h),
            (rect.x, rect.y + rect.h),
        ];
    }
    // Superellipse exponent n blends circle (n=2.0) toward squircle (~n=3.56 at smoothing=0.60)
    let n = 2.0 + smoothing.clamp(0.0, 1.0) * 2.6;
    let inv_n = 2.0 / n;
    let steps = 10usize;
    let mut pts = Vec::with_capacity((steps + 1) * 4);

    // Strictly clockwise traversal in screen coordinates (+x right, +y down):
    // 0: top-right    (top -> right)
    // 1: bottom-right (right -> bottom)
    // 2: bottom-left  (bottom -> left)
    // 3: top-left     (left -> top)
    let corners = [
        (rect.x + rect.w - r, rect.y + r, 0usize),
        (rect.x + rect.w - r, rect.y + rect.h - r, 1usize),
        (rect.x + r, rect.y + rect.h - r, 2usize),
        (rect.x + r, rect.y + r, 3usize),
    ];

    for (cx, cy, quad) in corners {
        for i in 0..=steps {
            let theta = (i as f32 / steps as f32) * std::f32::consts::FRAC_PI_2;
            let c = theta.cos().abs().powf(inv_n) * r;
            let s = theta.sin().abs().powf(inv_n) * r;
            let (dx, dy) = match quad {
                0 => (s, -c),  // (0, -r) -> (+r, 0)
                1 => (c, s),   // (+r, 0) -> (0, +r)
                2 => (-s, c),  // (0, +r) -> (-r, 0)
                _ => (-c, -s), // (-r, 0) -> (0, -r)
            };
            pts.push((cx + dx, cy + dy));
        }
    }
    pts
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct HitRegion {
    pub bounds: RectF,
    pub slot_id: String,
    pub action_id: Option<String>,
}

/// Declarative scene graph node (serializable so a future third-party widget SDK can emit trees).
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "kind", rename_all = "snake_case")]
pub enum SceneNode {
    RoundedRect {
        rect: RectF,
        radius: f32,
        smoothing: f32,
        fill: Option<RgbaColor>,
        stroke: Option<(RgbaColor, f32)>,
        interactive_action: Option<String>,
    },
    Text {
        rect: RectF,
        content: String,
        font_size: f32,
        font_weight: u16,
        color: RgbaColor,
        align: TextAlign,
        tabular_nums: bool,
        tight_kerning: bool,
        max_lines: u32,
        interactive_action: Option<String>,
    },
    ProgressRing {
        cx: f32,
        cy: f32,
        radius: f32,
        stroke_width: f32,
        progress: f32,
        track_color: RgbaColor,
        fill_color: RgbaColor,
    },
    ProgressBar {
        rect: RectF,
        progress: f32,
        track_color: RgbaColor,
        fill_color: RgbaColor,
        interactive_action: Option<String>,
    },
    Sparkline {
        rect: RectF,
        values: Vec<f32>,
        stroke_color: RgbaColor,
        fill_color: RgbaColor,
    },
    BarChart {
        rect: RectF,
        values: Vec<f32>,
        colors: Vec<RgbaColor>,
        gap: f32,
    },
    HeatmapGrid {
        rect: RectF,
        cols: usize,
        rows: usize,
        levels: Vec<u8>,
        base_color: RgbaColor,
        accent_color: RgbaColor,
    },
    Treemap {
        rect: RectF,
        items: Vec<(String, f32, RgbaColor)>,
        text_color: RgbaColor,
    },
    AnalogClock {
        cx: f32,
        cy: f32,
        radius: f32,
        hour_deg: f32,
        minute_deg: f32,
        second_deg: Option<f32>,
        skeleton: bool,
        dial_color: RgbaColor,
        hand_color: RgbaColor,
        accent_color: RgbaColor,
    },
    Line {
        x1: f32,
        y1: f32,
        x2: f32,
        y2: f32,
        color: RgbaColor,
        width: f32,
    },
    ImageRef {
        rect: RectF,
        radius: f32,
        source_path: String,
        #[serde(default)]
        interactive_action: Option<String>,
    },
    IconGlyph {
        rect: RectF,
        glyph: String,
        size: f32,
        color: RgbaColor,
        interactive_action: Option<String>,
    },
    WeatherIcon {
        rect: RectF,
        code: i32,
        cloud_color: RgbaColor,
        accent_color: RgbaColor,
    },
    GiliMascot {
        rect: RectF,
        dome_color: RgbaColor,
        visor_color: RgbaColor,
        eye_color: RgbaColor,
        wave_color: RgbaColor,
        blink: bool,
        happy: bool,
        eye_dx: f32,
        wave_phase: f32,
        interactive_action: Option<String>,
    },
    StickyPaper {
        rect: RectF,
        paper_color: RgbaColor,
        style: String,
        show_lines: bool,
        line_color: RgbaColor,
        curl_left: bool,
        interactive_action: Option<String>,
    },
    EditableText {
        rect: RectF,
        content: String,
        placeholder: String,
        font_size: f32,
        font_weight: u16,
        color: RgbaColor,
        placeholder_color: RgbaColor,
        caret_color: RgbaColor,
        selection_fill: RgbaColor,
        caret_utf16: u32,
        show_caret: bool,
        select_all: bool,
        max_lines: u32,
    },
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum TextAlign {
    Left,
    Center,
    Right,
}

fn default_text_scale() -> f32 {
    1.0
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct WidgetRenderItem {
    pub slot_id: String,
    pub widget_type: String,
    pub frame: RectF,
    pub background_mode: BackgroundMode,
    pub card_fill: Option<RgbaColor>,
    #[serde(default)]
    pub card_gradient: Option<(RgbaColor, RgbaColor)>,
    pub inner_border: Option<RgbaColor>,
    pub shadow_enabled: bool,
    pub halo_enabled: bool,
    pub shadow_color: RgbaColor,
    pub font_family: String,
    #[serde(default = "default_text_scale")]
    pub text_scale: f32,
    pub nodes: Vec<SceneNode>,
    pub content_hit_rects: Vec<HitRegion>,
    pub stack_count: usize,
    pub stack_index: usize,
    pub edit_jiggle_deg: f32,
    #[serde(default)]
    pub base_rotation_deg: f32,
    pub scale: f32,
    pub opacity: f32,
}

impl WidgetRenderItem {
    pub fn node_visual_bounds(node: &SceneNode, text_scale: f32) -> Option<RectF> {
        match node {
            SceneNode::Text {
                rect,
                content,
                font_size,
                align,
                max_lines,
                ..
            } => {
                let trimmed = content.trim();
                if trimmed.is_empty() || rect.w <= 0.0 || rect.h <= 0.0 {
                    return None;
                }
                let fs = (font_size * text_scale.clamp(0.85, 1.35)).max(8.0);
                let max_line_chars = content
                    .lines()
                    .map(|l| l.chars().count())
                    .max()
                    .unwrap_or(0);
                if max_line_chars == 0 {
                    return None;
                }
                let raw_line_w = max_line_chars as f32 * fs * 0.58 + 4.0;
                let explicit_lines = content.lines().count().max(1);
                let max_allowed_lines = (*max_lines as usize).max(1);
                let wrapped_lines = if max_allowed_lines > 1 && raw_line_w > rect.w.max(1.0) {
                    let est = (raw_line_w / rect.w.max(1.0)).ceil() as usize;
                    explicit_lines.max(est).clamp(1, max_allowed_lines)
                } else {
                    explicit_lines.min(max_allowed_lines)
                };
                let tw = if wrapped_lines > explicit_lines {
                    rect.w
                } else {
                    raw_line_w.min(rect.w)
                };
                let tx = match align {
                    TextAlign::Left => rect.x,
                    TextAlign::Center => rect.x + (rect.w - tw).max(0.0) * 0.5,
                    TextAlign::Right => rect.x + (rect.w - tw).max(0.0),
                };
                let th = (wrapped_lines as f32 * fs * 1.32 + 2.0).min(rect.h);
                Some(RectF::new(tx, rect.y, tw, th))
            }
            SceneNode::RoundedRect { rect, .. }
            | SceneNode::ProgressBar { rect, .. }
            | SceneNode::Sparkline { rect, .. }
            | SceneNode::BarChart { rect, .. }
            | SceneNode::HeatmapGrid { rect, .. }
            | SceneNode::Treemap { rect, .. }
            | SceneNode::ImageRef { rect, .. }
            | SceneNode::IconGlyph { rect, .. }
            | SceneNode::WeatherIcon { rect, .. }
            | SceneNode::GiliMascot { rect, .. }
            | SceneNode::StickyPaper { rect, .. }
            | SceneNode::EditableText { rect, .. } => Some(*rect),
            SceneNode::ProgressRing {
                cx,
                cy,
                radius,
                stroke_width,
                ..
            } => {
                let r = radius + stroke_width * 0.5;
                Some(RectF::new(cx - r, cy - r, r * 2.0, r * 2.0))
            }
            SceneNode::AnalogClock { cx, cy, radius, .. } => {
                Some(RectF::new(cx - radius, cy - radius, radius * 2.0, radius * 2.0))
            }
            SceneNode::Line {
                x1,
                y1,
                x2,
                y2,
                width,
                ..
            } => {
                let half = width * 0.5;
                let min_x = x1.min(*x2) - half;
                let min_y = y1.min(*y2) - half;
                let max_x = x1.max(*x2) + half;
                let max_y = y1.max(*y2) + half;
                Some(RectF::new(
                    min_x,
                    min_y,
                    (max_x - min_x).max(*width),
                    (max_y - min_y).max(*width),
                ))
            }
        }
    }

    /// Computes the tight visual content bounding box of the widget.
    /// For Glass/Solid/SubtleTint cards, returns `self.frame`.
    /// For frameless (`BackgroundMode::None`) widgets, returns the union of rendered nodes
    /// clamped to `self.frame` so unused card space does not block neighboring widgets.
    pub fn visual_content_bounds(&self) -> RectF {
        if self.background_mode != BackgroundMode::None {
            return self.frame;
        }
        let mut union_rect: Option<RectF> = None;
        for node in &self.nodes {
            if let Some(nr) = Self::node_visual_bounds(node, self.text_scale) {
                union_rect = Some(match union_rect {
                    Some(acc) => acc.union(nr),
                    None => nr,
                });
            }
        }
        let Some(bounds) = union_rect else {
            return self.frame;
        };
        let pad = 4.0;
        let x0 = (bounds.x - pad).clamp(self.frame.x, self.frame.x + self.frame.w);
        let y0 = (bounds.y - pad).clamp(self.frame.y, self.frame.y + self.frame.h);
        let x1 = (bounds.x + bounds.w + pad).clamp(x0, self.frame.x + self.frame.w);
        let y1 = (bounds.y + bounds.h + pad).clamp(y0, self.frame.y + self.frame.h);
        let w = (x1 - x0).max(24.0).min(self.frame.w);
        let h = (y1 - y0).max(24.0).min(self.frame.h);
        RectF::new(x0, y0, w, h)
    }

    /// Collects strict content hit regions so empty transparent space remains click-through.
    pub fn compute_hit_regions(&mut self, edit_mode: bool) {
        self.content_hit_rects.clear();
        if self.background_mode != BackgroundMode::None {
            self.content_hit_rects.push(HitRegion {
                bounds: self.frame,
                slot_id: self.slot_id.clone(),
                action_id: None,
            });
        } else if edit_mode {
            self.content_hit_rects.push(HitRegion {
                bounds: self.visual_content_bounds(),
                slot_id: self.slot_id.clone(),
                action_id: None,
            });
        }
        for node in &self.nodes {
            match node {
                SceneNode::RoundedRect {
                    rect,
                    interactive_action,
                    ..
                }
                | SceneNode::ProgressBar {
                    rect,
                    interactive_action,
                    ..
                }
                | SceneNode::IconGlyph {
                    rect,
                    interactive_action,
                    ..
                } => {
                    let pad = 4.0;
                    let padded = RectF::new(
                        (rect.x - pad).max(self.frame.x),
                        (rect.y - pad).max(self.frame.y),
                        (rect.w + pad * 2.0).min(
                            (self.frame.x + self.frame.w - (rect.x - pad).max(self.frame.x))
                                .max(0.0),
                        ),
                        (rect.h + pad * 2.0).min(
                            (self.frame.y + self.frame.h - (rect.y - pad).max(self.frame.y))
                                .max(0.0),
                        ),
                    );
                    self.content_hit_rects.push(HitRegion {
                        bounds: padded,
                        slot_id: self.slot_id.clone(),
                        action_id: interactive_action.clone(),
                    });
                }
                SceneNode::Text {
                    rect,
                    interactive_action,
                    ..
                } => {
                    let base_rect = if self.background_mode == BackgroundMode::None
                        && interactive_action.is_none()
                    {
                        Self::node_visual_bounds(node, self.text_scale).unwrap_or(*rect)
                    } else {
                        *rect
                    };
                    let pad = 4.0;
                    let padded = RectF::new(
                        (base_rect.x - pad).max(self.frame.x),
                        (base_rect.y - pad).max(self.frame.y),
                        (base_rect.w + pad * 2.0).min(
                            (self.frame.x + self.frame.w - (base_rect.x - pad).max(self.frame.x))
                                .max(0.0),
                        ),
                        (base_rect.h + pad * 2.0).min(
                            (self.frame.y + self.frame.h - (base_rect.y - pad).max(self.frame.y))
                                .max(0.0),
                        ),
                    );
                    self.content_hit_rects.push(HitRegion {
                        bounds: padded,
                        slot_id: self.slot_id.clone(),
                        action_id: interactive_action.clone(),
                    });
                }
                SceneNode::ProgressRing { cx, cy, radius, .. }
                | SceneNode::AnalogClock { cx, cy, radius, .. } => {
                    self.content_hit_rects.push(HitRegion {
                        bounds: RectF::new(cx - radius, cy - radius, radius * 2.0, radius * 2.0),
                        slot_id: self.slot_id.clone(),
                        action_id: None,
                    });
                }
                SceneNode::ImageRef {
                    rect,
                    interactive_action,
                    ..
                }
                | SceneNode::GiliMascot {
                    rect,
                    interactive_action,
                    ..
                }
                | SceneNode::StickyPaper {
                    rect,
                    interactive_action,
                    ..
                } => {
                    self.content_hit_rects.push(HitRegion {
                        bounds: *rect,
                        slot_id: self.slot_id.clone(),
                        action_id: interactive_action.clone(),
                    });
                }
                SceneNode::Sparkline { rect, .. }
                | SceneNode::BarChart { rect, .. }
                | SceneNode::HeatmapGrid { rect, .. }
                | SceneNode::Treemap { rect, .. }
                | SceneNode::WeatherIcon { rect, .. } => {
                    self.content_hit_rects.push(HitRegion {
                        bounds: *rect,
                        slot_id: self.slot_id.clone(),
                        action_id: None,
                    });
                }
                SceneNode::Line { .. } | SceneNode::EditableText { .. } => {}
            }
        }
    }
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum HitTestResult {
    Transparent,
    WidgetContent {
        slot_id: String,
        action_id: Option<String>,
    },
    RemoveBadge {
        slot_id: String,
    },
    GalleryAddButton,
}

pub fn hit_test_scene(
    items: &[WidgetRenderItem],
    edit_mode: bool,
    add_button_rect: Option<RectF>,
    px: f32,
    py: f32,
) -> HitTestResult {
    if edit_mode {
        if let Some(btn) = add_button_rect {
            if btn.contains(px, py) {
                return HitTestResult::GalleryAddButton;
            }
        }
    }

    for item in items.iter().rev() {
        if edit_mode {
            let badge_anchor = if item.background_mode == BackgroundMode::None {
                item.visual_content_bounds()
            } else {
                item.frame
            };
            let badge = RectF::new(badge_anchor.x - 8.0, badge_anchor.y - 8.0, 24.0, 24.0);
            if badge.contains(px, py) {
                return HitTestResult::RemoveBadge {
                    slot_id: item.slot_id.clone(),
                };
            }
        }

        // First check explicit interactive action controls on top
        for hr in item.content_hit_rects.iter().rev() {
            if hr.action_id.is_some() && hr.bounds.contains(px, py) {
                return HitTestResult::WidgetContent {
                    slot_id: hr.slot_id.clone(),
                    action_id: hr.action_id.clone(),
                };
            }
        }
        // Then check general content pixels
        for hr in item.content_hit_rects.iter().rev() {
            if hr.bounds.contains(px, py) {
                return HitTestResult::WidgetContent {
                    slot_id: hr.slot_id.clone(),
                    action_id: None,
                };
            }
        }
    }

    HitTestResult::Transparent
}

pub fn slot_rect_dp(
    slot: &WidgetStackSlot,
    grid_scale: f32,
    origin_x: f32,
    origin_y: f32,
) -> RectF {
    let cell = GRID_SMALL_DP * grid_scale;
    let gap = GRID_GAP_DP * grid_scale;
    let widget_type = slot.active_widget().map(|w| w.widget_type.as_str());
    let s = crate::config::sanitize_grid_scale(grid_scale);
    let (w, h) = match widget_type {
        Some("photo_frame") => {
            let side = match slot.size {
                WidgetSize::Small => 220.0 * s,
                WidgetSize::Medium => 268.0 * s,
                WidgetSize::Large => 336.0 * s,
            };
            (side, side)
        }
        Some("paper_sticky_note") => {
            let side = match slot.size {
                WidgetSize::Small => 160.0 * s,
                WidgetSize::Medium => 240.0 * s,
                WidgetSize::Large => 336.0 * s,
            };
            (side, side)
        }
        _ => slot.size.dimensions_dp(grid_scale),
    };
    let x = slot
        .pos_x
        .unwrap_or_else(|| origin_x + (slot.grid_col as f32) * (cell + gap));
    let y = slot
        .pos_y
        .unwrap_or_else(|| origin_y + (slot.grid_row as f32) * (cell + gap));
    RectF::new(x, y, w, h)
}

pub fn snap_position_to_grid(
    px: f32,
    py: f32,
    grid_scale: f32,
    origin_x: f32,
    origin_y: f32,
) -> (i32, i32) {
    let step = (GRID_SMALL_DP + GRID_GAP_DP) * grid_scale;
    let col = ((px - origin_x) / step).round().max(0.0) as i32;
    let row = ((py - origin_y) / step).round().max(0.0) as i32;
    (col, row)
}

fn spans_overlap(c1: i32, r1: i32, s1: WidgetSize, c2: i32, r2: i32, s2: WidgetSize) -> bool {
    let (w1, h1) = s1.grid_span();
    let (w2, h2) = s2.grid_span();
    c1 < c2 + w2 && c1 + w1 > c2 && r1 < r2 + h2 && r1 + h1 > r2
}

/// Shifts colliding widgets neatly downward/sideways when a dragged widget snaps to a cell.
pub fn resolve_grid_collisions(slots: &mut [WidgetStackSlot], moved_slot_id: &str) {
    let Some(moved_idx) = slots.iter().position(|s| s.slot_id == moved_slot_id) else {
        return;
    };
    let moved_mon = slots[moved_idx].monitor_id.clone();
    let moved_col = slots[moved_idx].grid_col;
    let moved_row = slots[moved_idx].grid_row;
    let moved_size = slots[moved_idx].size;

    for i in 0..slots.len() {
        if i == moved_idx || slots[i].monitor_id != moved_mon {
            continue;
        }
        if spans_overlap(
            moved_col,
            moved_row,
            moved_size,
            slots[i].grid_col,
            slots[i].grid_row,
            slots[i].size,
        ) {
            let (_, mh) = moved_size.grid_span();
            slots[i].grid_row = moved_row + mh;
        }
    }
}

/// Computes the clamped on-screen DIP rect for a slot on a given monitor work area.
pub fn effective_slot_rect_dp(
    slot: &WidgetStackSlot,
    grid_scale: f32,
    work_w_dip: f32,
    work_h_dip: f32,
) -> RectF {
    let cell_step = (GRID_SMALL_DP + GRID_GAP_DP) * grid_scale.clamp(0.8, 1.35);
    let mut rect = slot_rect_dp(slot, grid_scale, 32.0, 48.0);
    if slot.pos_x.is_none()
        && slot.pos_y.is_none()
        && rect.y + rect.h > work_h_dip - 12.0
    {
        let max_rows = (((work_h_dip - 60.0) / cell_step).floor() as i32).max(1);
        let overflow_col = slot.grid_row / max_rows;
        let wrapped_row = slot.grid_row % max_rows;
        rect.x += (overflow_col as f32) * 2.0 * cell_step;
        rect.y = 48.0 + (wrapped_row as f32) * cell_step;
    }
    let max_x = (work_w_dip - rect.w - 8.0).max(8.0);
    let max_y = (work_h_dip - rect.h - 8.0).max(8.0);
    rect.x = rect.x.clamp(8.0, max_x);
    rect.y = rect.y.clamp(8.0, max_y);
    rect
}

/// Finds the closest valid position within the monitor work area that does not overlap `others`.
pub fn find_non_overlapping_pos(
    desired: RectF,
    others: &[RectF],
    work_w_dip: f32,
    work_h_dip: f32,
    grid_scale: f32,
) -> (f32, f32) {
    find_non_overlapping_pos_with_offset(
        desired,
        (0.0, 0.0, desired.w, desired.h),
        others,
        work_w_dip,
        work_h_dip,
        grid_scale,
    )
}

/// Finds the closest valid outer position `(x, y)` for `desired_outer` such that its visual content rect
/// `RectF::new(x + dx, y + dy, cw, ch)` does not overlap any rect in `others_content`.
pub fn find_non_overlapping_pos_with_offset(
    desired_outer: RectF,
    content_offset: (f32, f32, f32, f32),
    others_content: &[RectF],
    work_w_dip: f32,
    work_h_dip: f32,
    grid_scale: f32,
) -> (f32, f32) {
    let (dx, dy, cw, ch) = content_offset;
    let max_x = (work_w_dip - desired_outer.w - 8.0).max(8.0);
    let max_y = (work_h_dip - desired_outer.h - 8.0).max(8.0);
    let clamped_x = desired_outer.x.clamp(8.0, max_x);
    let clamped_y = desired_outer.y.clamp(8.0, max_y);
    let gap = (GRID_GAP_DP * grid_scale.clamp(0.8, 1.35)).max(6.0);

    let fits = |x: f32, y: f32, pad: f32| -> bool {
        if x < 8.0 - 0.5 || y < 8.0 - 0.5 || x > max_x + 0.5 || y > max_y + 0.5 {
            return false;
        }
        let cand = RectF::new(x + dx, y + dy, cw, ch);
        !others_content
            .iter()
            .any(|o| cand.intersects_with_gap(*o, pad))
    };

    if fits(clamped_x, clamped_y, gap) {
        return (clamped_x, clamped_y);
    }

    let search = |pad: f32| -> Option<(f32, f32)> {
        let mut best: Option<((f32, f32), f32)> = None;
        let mut consider = |cx: f32, cy: f32| {
            let x = cx.clamp(8.0, max_x);
            let y = cy.clamp(8.0, max_y);
            if !fits(x, y, pad) {
                return;
            }
            let diff_x = x - clamped_x;
            let diff_y = y - clamped_y;
            let dist2 = diff_x * diff_x + diff_y * diff_y;
            if best.map(|(_, d)| dist2 < d).unwrap_or(true) {
                best = Some(((x, y), dist2));
            }
        };

        // Try edge-aligned placements directly beside every existing widget's visual content first
        let push = pad;
        for o in others_content {
            let right_x = o.x + o.w + push - dx;
            let left_x = o.x - cw - push - dx;
            let below_y = o.y + o.h + push - dy;
            let above_y = o.y - ch - push - dy;
            let align_x = o.x - dx;
            let align_y = o.y - dy;
            consider(right_x, clamped_y);
            consider(right_x, align_y);
            consider(left_x, clamped_y);
            consider(left_x, align_y);
            consider(clamped_x, below_y);
            consider(align_x, below_y);
            consider(clamped_x, above_y);
            consider(align_x, above_y);
        }

        // Sweep the work area on an 8dp grid to guarantee finding a tight free spot even when crowded
        let step = 8.0f32;
        let mut y = 8.0f32;
        while y <= max_y {
            let mut x = 8.0f32;
            while x <= max_x {
                consider(x, y);
                x += step;
            }
            y += step;
        }

        best.map(|(pos, _)| pos)
    };

    if let Some(pos) = search(gap) {
        return pos;
    }
    if let Some(pos) = search(0.0) {
        return pos;
    }
    (clamped_x, clamped_y)
}

/// Ensures no two widgets sharing the same monitor overlap each other.
/// If `priority_slot_id` is set (e.g. a resized widget), that widget keeps its anchor while
/// colliding neighbors move cleanly to the nearest non-overlapping spot.
pub fn resolve_all_rect_collisions(
    slots: &mut [WidgetStackSlot],
    priority_slot_id: Option<&str>,
    grid_scale: f32,
    work_w_dip: f32,
    work_h_dip: f32,
) -> bool {
    resolve_all_rect_collisions_with_offsets(
        slots,
        &[],
        priority_slot_id,
        grid_scale,
        work_w_dip,
        work_h_dip,
    )
}

pub fn resolve_all_rect_collisions_with_offsets(
    slots: &mut [WidgetStackSlot],
    content_offsets: &[(f32, f32, f32, f32)],
    priority_slot_id: Option<&str>,
    grid_scale: f32,
    work_w_dip: f32,
    work_h_dip: f32,
) -> bool {
    let mut changed = false;
    let mut order: Vec<usize> = (0..slots.len()).collect();
    if let Some(pid) = priority_slot_id {
        if let Some(pos) = order.iter().position(|&idx| slots[idx].slot_id == pid) {
            let idx = order.remove(pos);
            order.insert(0, idx);
        }
    }

    let mut placed_by_mon: std::collections::HashMap<String, Vec<RectF>> =
        std::collections::HashMap::new();

    for idx in order {
        let mon = slots[idx].monitor_id.clone();
        let rect = effective_slot_rect_dp(&slots[idx], grid_scale, work_w_dip, work_h_dip);
        let (dx, dy, cw, ch) = content_offsets
            .get(idx)
            .copied()
            .unwrap_or((0.0, 0.0, rect.w, rect.h));
        let content_rect = RectF::new(rect.x + dx, rect.y + dy, cw, ch);
        let placed = placed_by_mon.entry(mon).or_default();
        let gap = (GRID_GAP_DP * grid_scale.clamp(0.8, 1.35)).max(6.0);
        let overlaps = placed
            .iter()
            .any(|o| content_rect.intersects_with_gap(*o, gap));

        let final_rect = if overlaps {
            let (nx, ny) = find_non_overlapping_pos_with_offset(
                rect,
                (dx, dy, cw, ch),
                placed,
                work_w_dip,
                work_h_dip,
                grid_scale,
            );
            let (col, row) = snap_position_to_grid(nx, ny, grid_scale, 32.0, 48.0);
            slots[idx].pos_x = Some(nx);
            slots[idx].pos_y = Some(ny);
            slots[idx].grid_col = col.max(0);
            slots[idx].grid_row = row.max(0);
            changed = true;
            RectF::new(nx, ny, rect.w, rect.h)
        } else {
            rect
        };
        placed.push(RectF::new(final_rect.x + dx, final_rect.y + dy, cw, ch));
    }

    changed
}

pub fn default_card_radius_dp(grid_scale: f32) -> (f32, f32) {
    (CARD_RADIUS_DP * grid_scale, CARD_CORNER_SMOOTHING)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::config::WidgetInstance;

    #[test]
    fn rect_collision_resolver_prevents_overlap_on_drag_resize_and_add() {
        let mut slots = vec![
            WidgetStackSlot {
                slot_id: "a".into(),
                monitor_id: "primary".into(),
                size: WidgetSize::Medium,
                pos_x: Some(32.0),
                pos_y: Some(48.0),
                widgets: vec![WidgetInstance::default()],
                ..Default::default()
            },
            WidgetStackSlot {
                slot_id: "b".into(),
                monitor_id: "primary".into(),
                size: WidgetSize::Medium,
                pos_x: Some(64.0),
                pos_y: Some(64.0),
                widgets: vec![WidgetInstance::default()],
                ..Default::default()
            },
        ];

        let changed = resolve_all_rect_collisions(&mut slots, Some("a"), 1.0, 1920.0, 1040.0);
        assert!(changed, "overlapping slots must be separated");
        let ra = effective_slot_rect_dp(&slots[0], 1.0, 1920.0, 1040.0);
        let rb = effective_slot_rect_dp(&slots[1], 1.0, 1920.0, 1040.0);
        assert!(
            !ra.intersects_with_gap(rb, GRID_GAP_DP - 0.5),
            "resolved rects must not overlap: {ra:?} vs {rb:?}"
        );
        assert_eq!(ra.x, 32.0);
        assert_eq!(ra.y, 48.0);

        // Dropping a third widget directly onto slot "a" must land in a clean free spot
        let desired = RectF::new(32.0, 48.0, 336.0, 160.0);
        let (nx, ny) = find_non_overlapping_pos(desired, &[ra, rb], 1920.0, 1040.0, 1.0);
        let rc = RectF::new(nx, ny, 336.0, 160.0);
        assert!(!rc.intersects_with_gap(ra, GRID_GAP_DP - 0.5));
        assert!(!rc.intersects_with_gap(rb, GRID_GAP_DP - 0.5));
    }

    #[test]
    fn empty_area_returns_transparent_for_desktop_click_through() {
        let mut item = WidgetRenderItem {
            slot_id: "s1".into(),
            widget_type: "styled_clock".into(),
            frame: RectF::new(100.0, 100.0, 336.0, 160.0),
            background_mode: BackgroundMode::None,
            card_fill: None,
            card_gradient: None,
            inner_border: None,
            shadow_enabled: true,
            halo_enabled: false,
            shadow_color: RgbaColor::new(0, 0, 0, 0.5),
            font_family: "Segoe UI Variable".into(),
            text_scale: 1.0,
            nodes: vec![SceneNode::Text {
                rect: RectF::new(116.0, 116.0, 140.0, 48.0),
                content: "21:30".into(),
                font_size: 40.0,
                font_weight: 700,
                color: RgbaColor::new(255, 255, 255, 1.0),
                align: TextAlign::Left,
                tabular_nums: true,
                tight_kerning: true,
                max_lines: 1,
                interactive_action: None,
            }],
            content_hit_rects: Vec::new(),
            stack_count: 1,
            stack_index: 0,
            edit_jiggle_deg: 0.0,
            base_rotation_deg: 0.0,
            scale: 1.0,
            opacity: 1.0,
        };
        item.compute_hit_regions(false);

        // Inside text pixels -> hit
        assert!(matches!(
            hit_test_scene(&[item.clone()], false, None, 150.0, 130.0),
            HitTestResult::WidgetContent { .. }
        ));
        // Inside widget frame but empty transparent area -> click-through!
        assert_eq!(
            hit_test_scene(&[item.clone()], false, None, 400.0, 240.0),
            HitTestResult::Transparent
        );
        // Outside widget completely -> click-through!
        assert_eq!(
            hit_test_scene(&[item], false, None, 10.0, 10.0),
            HitTestResult::Transparent
        );
    }

    #[test]
    fn grid_snap_and_collision_reflow_avoid_overlap() {
        let mut slots = vec![
            WidgetStackSlot {
                slot_id: "a".into(),
                monitor_id: "primary".into(),
                size: WidgetSize::Medium,
                grid_col: 0,
                grid_row: 0,
                widgets: vec![WidgetInstance::default()],
                ..Default::default()
            },
            WidgetStackSlot {
                slot_id: "b".into(),
                monitor_id: "primary".into(),
                size: WidgetSize::Medium,
                grid_col: 0,
                grid_row: 0,
                widgets: vec![WidgetInstance::default()],
                ..Default::default()
            },
        ];
        resolve_grid_collisions(&mut slots, "a");
        assert_eq!(slots[1].grid_row, 1);
        assert_eq!(concentric_radius(24.0, 12.0), 12.0);
        let pts = build_superellipse_points(RectF::new(0.0, 0.0, 160.0, 160.0), 24.0, 0.6);
        assert_eq!(pts.len(), 44);
        // Verify strictly clockwise non-self-intersecting polygon (positive shoelace area in screen coords)
        let mut area2 = 0.0f32;
        for i in 0..pts.len() {
            let (x1, y1) = pts[i];
            let (x2, y2) = pts[(i + 1) % pts.len()];
            area2 += x1 * y2 - x2 * y1;
        }
        let area = area2 * 0.5;
        assert!(
            area > 24_000.0 && area < 25_600.0,
            "Superellipse area invalid: {area}"
        );
    }
}
