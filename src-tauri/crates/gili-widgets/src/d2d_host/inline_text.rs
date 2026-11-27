use crate::config::RgbaColor;
use crate::contrast::relative_luminance;
use crate::layout::{RectF, SceneNode, TextAlign, WidgetRenderItem};
use crate::widgets::group_b::sticky_note_metrics;
use std::time::Instant;

const TITLE_MAX_CHARS: usize = 60;
const BLINK_SOLID_MS: u128 = 500;
const BLINK_HALF_PERIOD_MS: u128 = 530;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum StickyEditField {
    Title,
    Body,
}

/// Self-contained editor state rendered directly inside the rotated Sticky Note scene graph.
#[derive(Debug, Clone)]
pub struct DirectInlineEdit {
    pub surface_hwnd_raw: isize,
    pub slot_id: String,
    pub widget_type: String,
    pub active_field: StickyEditField,
    pub title: String,
    pub body: String,
    pub caret: usize,
    pub select_all: bool,
    pub last_input_at: Instant,
    pub en: bool,
}

impl DirectInlineEdit {
    pub fn new(
        surface_hwnd_raw: isize,
        slot_id: String,
        widget_type: String,
        active_field: StickyEditField,
        initial_title: String,
        initial_body: String,
        en: bool,
    ) -> Self {
        let trimmed_title: String = initial_title.trim().chars().take(TITLE_MAX_CHARS).collect();
        let norm_body = initial_body.replace("\r\n", "\n");
        let caret = match active_field {
            StickyEditField::Title => trimmed_title.len(),
            StickyEditField::Body => norm_body.len(),
        };
        Self {
            surface_hwnd_raw,
            slot_id,
            widget_type,
            active_field,
            title: trimmed_title,
            body: norm_body,
            caret,
            select_all: false,
            last_input_at: Instant::now(),
            en,
        }
    }

    pub fn active_text(&self) -> &str {
        match self.active_field {
            StickyEditField::Title => &self.title,
            StickyEditField::Body => &self.body,
        }
    }

    fn active_text_mut(&mut self) -> &mut String {
        match self.active_field {
            StickyEditField::Title => &mut self.title,
            StickyEditField::Body => &mut self.body,
        }
    }

    pub fn insert_char(&mut self, ch: char) {
        if (ch as u32) < 0x20 && !(self.active_field == StickyEditField::Body && ch == '\n') {
            return;
        }
        if ch as u32 == 0x7F {
            return;
        }
        if self.select_all {
            self.active_text_mut().clear();
            self.caret = 0;
            self.select_all = false;
        }
        if self.active_field == StickyEditField::Title && self.title.chars().count() >= TITLE_MAX_CHARS {
            return;
        }
        let caret = self.clamp_caret();
        self.active_text_mut().insert(caret, ch);
        self.caret = caret + ch.len_utf8();
        self.last_input_at = Instant::now();
    }

    pub fn insert_str(&mut self, raw: &str) {
        let normalized = raw.replace("\r\n", "\n").replace('\r', "\n");
        if self.select_all && !normalized.is_empty() {
            self.active_text_mut().clear();
            self.caret = 0;
            self.select_all = false;
        }
        for ch in normalized.chars() {
            let mapped = if self.active_field == StickyEditField::Title && ch == '\n' {
                ' '
            } else {
                ch
            };
            self.insert_char(mapped);
        }
    }

    pub fn backspace(&mut self) {
        if self.select_all {
            self.active_text_mut().clear();
            self.caret = 0;
            self.select_all = false;
            self.last_input_at = Instant::now();
            return;
        }
        let caret = self.clamp_caret();
        if caret == 0 {
            return;
        }
        let prev = prev_char_boundary(self.active_text(), caret);
        self.active_text_mut().drain(prev..caret);
        self.caret = prev;
        self.last_input_at = Instant::now();
    }

    pub fn delete_forward(&mut self) {
        if self.select_all {
            self.active_text_mut().clear();
            self.caret = 0;
            self.select_all = false;
            self.last_input_at = Instant::now();
            return;
        }
        let caret = self.clamp_caret();
        let len = self.active_text().len();
        if caret >= len {
            return;
        }
        let next = next_char_boundary(self.active_text(), caret);
        self.active_text_mut().drain(caret..next);
        self.last_input_at = Instant::now();
    }

    pub fn move_left(&mut self) {
        self.select_all = false;
        let caret = self.clamp_caret();
        if caret > 0 {
            self.caret = prev_char_boundary(self.active_text(), caret);
        }
        self.last_input_at = Instant::now();
    }

    pub fn move_right(&mut self) {
        self.select_all = false;
        let caret = self.clamp_caret();
        if caret < self.active_text().len() {
            self.caret = next_char_boundary(self.active_text(), caret);
        }
        self.last_input_at = Instant::now();
    }

    pub fn move_home(&mut self) {
        self.select_all = false;
        self.caret = 0;
        self.last_input_at = Instant::now();
    }

    pub fn move_end(&mut self) {
        self.select_all = false;
        self.caret = self.active_text().len();
        self.last_input_at = Instant::now();
    }

    pub fn select_all(&mut self) {
        self.caret = self.active_text().len();
        self.select_all = !self.active_text().is_empty();
        self.last_input_at = Instant::now();
    }

    pub fn switch_field(&mut self, field: StickyEditField) {
        self.active_field = field;
        self.caret = self.active_text().len();
        self.select_all = false;
        self.last_input_at = Instant::now();
    }

    pub fn caret_utf16_pos(&self) -> u32 {
        let caret = self.clamp_caret();
        self.active_text()[..caret].encode_utf16().count() as u32
    }

    pub fn caret_visible(&self, now: Instant) -> bool {
        let elapsed_ms = now.saturating_duration_since(self.last_input_at).as_millis();
        if elapsed_ms < BLINK_SOLID_MS {
            return true;
        }
        let blink_step = (elapsed_ms - BLINK_SOLID_MS) / BLINK_HALF_PERIOD_MS;
        blink_step % 2 == 1
    }

    pub fn field_for_click(frame: RectF, note_style: &str, local_click_y: f32) -> StickyEditField {
        let m = sticky_note_metrics(frame, note_style);
        if local_click_y <= m.divider_y {
            StickyEditField::Title
        } else {
            StickyEditField::Body
        }
    }

    fn clamp_caret(&self) -> usize {
        let text = self.active_text();
        let mut idx = self.caret.min(text.len());
        while idx > 0 && !text.is_char_boundary(idx) {
            idx -= 1;
        }
        idx
    }
}

fn prev_char_boundary(s: &str, idx: usize) -> usize {
    let mut pos = idx.saturating_sub(1).min(s.len());
    while pos > 0 && !s.is_char_boundary(pos) {
        pos -= 1;
    }
    pos
}

fn next_char_boundary(s: &str, idx: usize) -> usize {
    let mut pos = idx.saturating_add(1).min(s.len());
    while pos < s.len() && !s.is_char_boundary(pos) {
        pos += 1;
    }
    pos
}

/// Replaces static text nodes of `paper_sticky_note` with live in-paper editable Title + Body nodes.
pub fn apply_direct_edit_overlay(
    item: &mut WidgetRenderItem,
    edit: &DirectInlineEdit,
    note_style: &str,
    paper_color: RgbaColor,
    caret_visible: bool,
) {
    item.nodes
        .retain(|node| matches!(node, SceneNode::StickyPaper { .. }));

    let lum = relative_luminance(paper_color);
    let (ink_primary, ink_muted, focus_fill, divider_col, caret_color) = if lum > 0.36 {
        (
            RgbaColor::new(0x1C, 0x19, 0x14, 0.96),
            RgbaColor::new(0x2A, 0x24, 0x1A, 0.50),
            RgbaColor::new(0x00, 0x00, 0x00, 0.055),
            RgbaColor::new(0x2A, 0x24, 0x1A, 0.16),
            RgbaColor::new(0x0A, 0x84, 0xFF, 0.96),
        )
    } else {
        (
            RgbaColor::new(0xF8, 0xFA, 0xFC, 0.96),
            RgbaColor::new(0xCB, 0xD5, 0xE1, 0.58),
            RgbaColor::new(0xFF, 0xFF, 0xFF, 0.08),
            RgbaColor::new(0xFF, 0xFF, 0xFF, 0.18),
            RgbaColor::new(0x60, 0xA5, 0xFA, 0.98),
        )
    };
    let selection_fill = RgbaColor::new(10, 132, 255, 0.28);

    let m = sticky_note_metrics(item.frame, note_style);
    let text_x = item.frame.x + m.edit_pad_x;
    let text_w = (item.frame.w - m.edit_pad_x * 2.0).max(40.0);
    let title_y = item.frame.y + m.edit_top_pad;
    let title_h = m.title_h;
    let divider_y = m.divider_y;
    let body_y = m.edit_body_y;
    let footer_h = m.footer_h;
    let body_h = (item.frame.y + item.frame.h - m.edit_bottom_pad - body_y).max(26.0);

    let title_active = edit.active_field == StickyEditField::Title;
    let body_active = edit.active_field == StickyEditField::Body;
    let caret_u16 = edit.caret_utf16_pos();

    let pad_x = 4.0 * m.scale;
    let pad_y = 2.0 * m.scale;
    let focus_rect = if title_active {
        RectF::new(
            text_x - pad_x,
            title_y - pad_y,
            text_w + pad_x * 2.0,
            title_h + 3.0 * m.scale,
        )
    } else {
        RectF::new(
            text_x - pad_x,
            body_y - pad_y,
            text_w + pad_x * 2.0,
            body_h + pad_y,
        )
    };
    item.nodes.push(SceneNode::RoundedRect {
        rect: focus_rect,
        radius: 6.0 * m.scale,
        smoothing: 0.4,
        fill: Some(focus_fill),
        stroke: None,
        interactive_action: Some("inline_edit:paper_sticky_note".to_string()),
    });

    item.nodes.push(SceneNode::EditableText {
        rect: RectF::new(text_x, title_y, text_w, title_h),
        content: edit.title.clone(),
        placeholder: if edit.en {
            "Title (optional)...".to_string()
        } else {
            "Judul (opsional)...".to_string()
        },
        font_size: m.title_font_size,
        font_weight: 700,
        color: ink_primary,
        placeholder_color: ink_muted,
        caret_color,
        selection_fill,
        caret_utf16: if title_active { caret_u16 } else { 0 },
        show_caret: title_active && caret_visible,
        select_all: title_active && edit.select_all,
        max_lines: 1,
    });

    item.nodes.push(SceneNode::RoundedRect {
        rect: RectF::new(
            text_x,
            divider_y,
            text_w,
            (1.0 * m.scale.sqrt()).clamp(1.0, 1.5),
        ),
        radius: 0.5,
        smoothing: 0.0,
        fill: Some(divider_col),
        stroke: None,
        interactive_action: None,
    });

    let body_max_lines = ((body_h / (m.body_font_size * 1.32)).floor() as u32).clamp(4, 14);
    item.nodes.push(SceneNode::EditableText {
        rect: RectF::new(text_x, body_y, text_w, body_h),
        content: edit.body.clone(),
        placeholder: if edit.en {
            "Write note...".to_string()
        } else {
            "Tulis catatan...".to_string()
        },
        font_size: m.body_font_size,
        font_weight: 500,
        color: ink_primary,
        placeholder_color: ink_muted,
        caret_color,
        selection_fill,
        caret_utf16: if body_active { caret_u16 } else { 0 },
        show_caret: body_active && caret_visible,
        select_all: body_active && edit.select_all,
        max_lines: body_max_lines,
    });

    item.nodes.push(SceneNode::Text {
        rect: RectF::new(
            text_x,
            item.frame.y + item.frame.h - footer_h - 6.0 * m.scale,
            text_w,
            footer_h,
        ),
        content: if edit.en {
            "Ctrl+Enter save \u{00B7} Esc cancel".to_string()
        } else {
            "Ctrl+Enter simpan \u{00B7} Esc batal".to_string()
        },
        font_size: m.footer_font_size,
        font_weight: 500,
        color: ink_muted,
        align: TextAlign::Center,
        tabular_nums: false,
        tight_kerning: false,
        max_lines: 1,
        interactive_action: Some("inline_edit:paper_sticky_note".to_string()),
    });
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::config::BackgroundMode;

    #[test]
    fn direct_inline_edit_handles_unicode_arrows_selection_and_limits() {
        let mut ed = DirectInlineEdit::new(
            1,
            "slot_1".into(),
            "paper_sticky_note".into(),
            StickyEditField::Title,
            "Ide".into(),
            "Awal".into(),
            false,
        );
        assert_eq!(ed.title, "Ide");
        assert_eq!(ed.caret, 3);

        ed.insert_char('!');
        assert_eq!(ed.title, "Ide!");
        ed.move_left();
        ed.insert_char('😀');
        assert_eq!(ed.title, "Ide😀!");
        assert_eq!(ed.caret_utf16_pos(), "Ide😀".encode_utf16().count() as u32);

        ed.backspace();
        assert_eq!(ed.title, "Ide!");
        ed.delete_forward();
        assert_eq!(ed.title, "Ide");

        ed.move_home();
        assert_eq!(ed.caret, 0);
        ed.move_end();
        assert_eq!(ed.caret, 3);

        ed.select_all();
        assert!(ed.select_all);
        ed.insert_str("Baris\nBaru");
        assert_eq!(ed.title, "Baris Baru");

        ed.insert_str(&"x".repeat(80));
        assert_eq!(ed.title.chars().count(), TITLE_MAX_CHARS);

        ed.switch_field(StickyEditField::Body);
        assert_eq!(ed.active_field, StickyEditField::Body);
        ed.insert_char('\n');
        ed.insert_str("Baris 2");
        assert_eq!(ed.body, "Awal\nBaris 2");
    }

    #[test]
    fn apply_direct_edit_overlay_renders_title_body_and_caret_on_paper() {
        let frame = RectF::new(10.0, 20.0, 160.0, 160.0);
        let paper_color = RgbaColor::new(0xFF, 0xF0, 0x7C, 0.98);
        let mut item = WidgetRenderItem {
            slot_id: "s1".into(),
            widget_type: "paper_sticky_note".into(),
            frame,
            background_mode: BackgroundMode::Glass,
            card_fill: None,
            card_gradient: None,
            inner_border: None,
            shadow_enabled: false,
            halo_enabled: false,
            shadow_color: RgbaColor::new(0, 0, 0, 0.3),
            font_family: "Segoe UI Variable".into(),
            text_scale: 1.0,
            nodes: vec![
                SceneNode::StickyPaper {
                    rect: frame,
                    paper_color,
                    style: "curled".into(),
                    show_lines: true,
                    line_color: RgbaColor::new(0, 0, 0, 0.1),
                    curl_left: true,
                    interactive_action: Some("inline_edit:paper_sticky_note".into()),
                },
                SceneNode::Text {
                    rect: frame,
                    content: "Old text".into(),
                    font_size: 13.0,
                    font_weight: 500,
                    color: RgbaColor::new(0, 0, 0, 1.0),
                    align: TextAlign::Left,
                    tabular_nums: false,
                    tight_kerning: false,
                    max_lines: 6,
                    interactive_action: None,
                },
            ],
            content_hit_rects: Vec::new(),
            stack_count: 1,
            stack_index: 0,
            edit_jiggle_deg: 0.0,
            base_rotation_deg: -3.2,
            scale: 1.0,
            opacity: 1.0,
        };

        let mut edit = DirectInlineEdit::new(
            1,
            "s1".into(),
            "paper_sticky_note".into(),
            StickyEditField::Title,
            "Belanja".into(),
            "Kopi".into(),
            false,
        );
        apply_direct_edit_overlay(&mut item, &edit, "curled", paper_color, true);

        let editable: Vec<_> = item
            .nodes
            .iter()
            .filter_map(|n| match n {
                SceneNode::EditableText {
                    content,
                    show_caret,
                    max_lines,
                    ..
                } => Some((content.clone(), *show_caret, *max_lines)),
                _ => None,
            })
            .collect();
        assert_eq!(editable.len(), 2);
        assert_eq!(editable[0], ("Belanja".to_string(), true, 1));
        assert_eq!(editable[1].0, "Kopi".to_string());
        assert!(!editable[1].1);
        assert!(editable[1].2 >= 4);

        edit.switch_field(StickyEditField::Body);
        apply_direct_edit_overlay(&mut item, &edit, "curled", paper_color, true);
        let editable_body: Vec<_> = item
            .nodes
            .iter()
            .filter_map(|n| match n {
                SceneNode::EditableText { show_caret, .. } => Some(*show_caret),
                _ => None,
            })
            .collect();
        assert_eq!(editable_body, vec![false, true]);
    }
}
