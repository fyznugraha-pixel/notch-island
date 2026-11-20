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
    pub scale: f32,
    pub opacity: f32,
}

impl WidgetRenderItem {
    /// Collects strict content hit regions so empty transparent space remains click-through.
    pub fn compute_hit_regions(&mut self, edit_mode: bool) {
        self.content_hit_rects.clear();
        if edit_mode || self.background_mode != BackgroundMode::None {
            self.content_hit_rects.push(HitRegion {
                bounds: self.frame,
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
                | SceneNode::Text {
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
                    // Slight 4dp grab margin around drawn content prevents accidental click-through
                    // between adjacent text lines while keeping unused transparent areas click-through.
                    let pad = 4.0;
                    let padded = RectF::new(
                        (rect.x - pad).max(self.frame.x),
                        (rect.y - pad).max(self.frame.y),
                        (rect.w + pad * 2.0).min((self.frame.x + self.frame.w - (rect.x - pad).max(self.frame.x)).max(0.0)),
                        (rect.h + pad * 2.0).min((self.frame.y + self.frame.h - (rect.y - pad).max(self.frame.y)).max(0.0)),
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
                | SceneNode::Treemap { rect, .. } => {
                    self.content_hit_rects.push(HitRegion {
                        bounds: *rect,
                        slot_id: self.slot_id.clone(),
                        action_id: None,
                    });
                }
                SceneNode::Line { .. } => {}
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
            let badge = RectF::new(item.frame.x - 8.0, item.frame.y - 8.0, 24.0, 24.0);
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

pub fn slot_rect_dp(slot: &WidgetStackSlot, grid_scale: f32, origin_x: f32, origin_y: f32) -> RectF {
    let cell = GRID_SMALL_DP * grid_scale;
    let gap = GRID_GAP_DP * grid_scale;
    let is_photo_frame = slot
        .active_widget()
        .map(|w| w.widget_type.as_str() == "photo_frame")
        .unwrap_or(false);
    let (w, h) = if is_photo_frame {
        let s = crate::config::sanitize_grid_scale(grid_scale);
        let side = match slot.size {
            WidgetSize::Small => 220.0 * s,
            WidgetSize::Medium => 268.0 * s,
            WidgetSize::Large => 336.0 * s,
        };
        (side, side)
    } else {
        slot.size.dimensions_dp(grid_scale)
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

pub fn default_card_radius_dp(grid_scale: f32) -> (f32, f32) {
    (CARD_RADIUS_DP * grid_scale, CARD_CORNER_SMOOTHING)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::config::WidgetInstance;

    #[test]
    fn empty_area_returns_transparent_for_desktop_click_through() {
        let mut item = WidgetRenderItem {
            slot_id: "s1".into(),
            widget_type: "styled_clock".into(),
            frame: RectF::new(100.0, 100.0, 336.0, 160.0),
            background_mode: BackgroundMode::None,
            card_fill: None,
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
        assert!(area > 24_000.0 && area < 25_600.0, "Superellipse area invalid: {area}");
    }
}
