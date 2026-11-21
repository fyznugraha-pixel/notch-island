use std::f32::consts::PI;

#[derive(Debug, Clone, Copy)]
pub struct SpringParams {
    pub response: f32,
    pub damping_ratio: f32,
}

impl SpringParams {
    /// Smooth spring matching the requested ~0.4s response and ~0.8 damping.
    pub const DEFAULT: Self = Self {
        response: 0.40,
        damping_ratio: 0.80,
    };

    pub const SNAPPY: Self = Self {
        response: 0.28,
        damping_ratio: 0.85,
    };
}

#[derive(Debug, Clone, Copy)]
pub struct SpringValue {
    pub value: f32,
    pub velocity: f32,
    pub target: f32,
}

impl SpringValue {
    pub fn settled(val: f32) -> Self {
        Self {
            value: val,
            velocity: 0.0,
            target: val,
        }
    }

    pub fn set_target(&mut self, target: f32, reduced_motion: bool) {
        self.target = target;
        if reduced_motion {
            self.value = target;
            self.velocity = 0.0;
        }
    }

    pub fn is_settled(&self) -> bool {
        (self.target - self.value).abs() < 0.0015 && self.velocity.abs() < 0.004
    }

    /// Sub-stepped semi-implicit Euler integration so stiff springs (`SNAPPY`) stay
    /// unconditionally stable even at low frame rates (Battery Saver / multi-monitor).
    pub fn step(&mut self, dt_sec: f32, params: SpringParams, reduced_motion: bool) -> bool {
        if reduced_motion || !self.value.is_finite() || !self.velocity.is_finite() {
            self.value = self.target;
            self.velocity = 0.0;
            return false;
        }
        if self.is_settled() {
            self.value = self.target;
            self.velocity = 0.0;
            return false;
        }
        let total_dt = dt_sec.clamp(0.001, 0.05);
        let substeps = ((total_dt / 0.008).ceil() as usize).clamp(1, 8);
        let dt = total_dt / substeps as f32;
        let omega = (2.0 * PI) / params.response.max(0.08);
        let stiffness = omega * omega;
        let damping = 2.0 * params.damping_ratio.clamp(0.2, 1.5) * omega;

        for _ in 0..substeps {
            let disp = self.value - self.target;
            let accel = -stiffness * disp - damping * self.velocity;
            self.velocity += accel * dt;
            self.value += self.velocity * dt;
        }

        if !self.value.is_finite() || !self.velocity.is_finite() || self.is_settled() {
            self.value = self.target;
            self.velocity = 0.0;
            false
        } else {
            true
        }
    }
}

/// Edit-mode subtle jiggle (+/- 1.2 deg) with deterministic per-widget phase offset.
pub fn edit_jiggle_degrees(slot_hash: u64, time_secs: f32, reduced_motion: bool) -> f32 {
    if reduced_motion {
        return 0.0;
    }
    let phase = ((slot_hash % 628) as f32) * 0.01;
    let freq = 2.0 * PI * 3.1;
    (time_secs * freq + phase).sin() * 1.2
}

/// Smooth rolling digit transition helper (0.0 -> 1.0 progress).
#[derive(Debug, Clone)]
pub struct DigitRollState {
    pub prev_text: String,
    pub current_text: String,
    pub progress: SpringValue,
}

impl DigitRollState {
    pub fn new(initial: impl Into<String>) -> Self {
        let s = initial.into();
        Self {
            prev_text: s.clone(),
            current_text: s,
            progress: SpringValue::settled(1.0),
        }
    }

    pub fn update(&mut self, next: &str, reduced_motion: bool) {
        if next == self.current_text {
            return;
        }
        self.prev_text = std::mem::replace(&mut self.current_text, next.to_string());
        if reduced_motion {
            self.progress = SpringValue::settled(1.0);
        } else {
            self.progress = SpringValue {
                value: 0.0,
                velocity: 0.0,
                target: 1.0,
            };
        }
    }

    pub fn tick(&mut self, dt_sec: f32, reduced_motion: bool) -> bool {
        self.progress
            .step(dt_sec, SpringParams::SNAPPY, reduced_motion)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn spring_converges_and_settles_to_zero_fps() {
        let mut s = SpringValue::settled(0.96);
        s.set_target(1.0, false);
        let mut steps = 0;
        while s.step(1.0 / 60.0, SpringParams::DEFAULT, false) && steps < 240 {
            steps += 1;
        }
        assert!(steps > 5 && steps < 180);
        assert!(s.is_settled());
        assert!((s.value - 1.0).abs() < 1e-4);
    }

    #[test]
    fn reduced_motion_snaps_immediately_and_disables_jiggle() {
        let mut s = SpringValue::settled(0.0);
        s.set_target(1.0, true);
        assert_eq!(s.value, 1.0);
        assert!(s.is_settled());
        assert_eq!(edit_jiggle_degrees(12345, 0.5, true), 0.0);
    }
}
