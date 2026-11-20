use std::f32::consts::PI;

pub const FFT_SIZE: usize = 256;
pub const REALTIME_FFT_SIZE: usize = 1024;
pub const BAND_COUNT: usize = 16;

fn radix2_fft_in_place(re: &mut [f32], im: &mut [f32]) {
    let n = re.len();
    debug_assert!(n.is_power_of_two() && im.len() == n);

    let mut j = 0usize;
    for i in 1..n {
        let mut bit = n >> 1;
        while j & bit != 0 {
            j ^= bit;
            bit >>= 1;
        }
        j ^= bit;
        if i < j {
            re.swap(i, j);
        }
    }

    let mut len = 2usize;
    while len <= n {
        let ang = -2.0 * PI / len as f32;
        let wlen_r = ang.cos();
        let wlen_i = ang.sin();
        let mut i = 0;
        while i < n {
            let mut wr = 1.0f32;
            let mut wi = 0.0f32;
            for k in 0..(len / 2) {
                let u_r = re[i + k];
                let u_i = im[i + k];
                let v_r = re[i + k + len / 2] * wr - im[i + k + len / 2] * wi;
                let v_i = re[i + k + len / 2] * wi + im[i + k + len / 2] * wr;
                re[i + k] = u_r + v_r;
                im[i + k] = u_i + v_i;
                re[i + k + len / 2] = u_r - v_r;
                im[i + k + len / 2] = u_i - v_i;
                let next_wr = wr * wlen_r - wi * wlen_i;
                wi = wr * wlen_i + wi * wlen_r;
                wr = next_wr;
            }
            i += len;
        }
        len <<= 1;
    }
}

/// Pure-Rust in-place iterative Radix-2 Cooley-Tukey FFT on a power-of-2 real buffer.
/// Computes 16 smoothed spectrum bands in [0.0..1.0] with zero heap allocation per frame.
pub fn compute_spectrum_bands(samples: &[f32; FFT_SIZE], out_bands: &mut [f32; BAND_COUNT]) {
    let mut re = [0.0f32; FFT_SIZE];
    let mut im = [0.0f32; FFT_SIZE];

    for i in 0..FFT_SIZE {
        let w = 0.5 * (1.0 - (2.0 * PI * i as f32 / (FFT_SIZE - 1) as f32).cos());
        re[i] = samples[i] * w;
    }

    radix2_fft_in_place(&mut re, &mut im);

    let half = FFT_SIZE / 2;
    let bins_per_band = half / BAND_COUNT;
    for b in 0..BAND_COUNT {
        let start = b * bins_per_band + 1;
        let end = ((b + 1) * bins_per_band).min(half);
        let mut acc = 0.0f32;
        let mut cnt = 0usize;
        for bin in start..end {
            let mag = (re[bin] * re[bin] + im[bin] * im[bin]).sqrt() / (FFT_SIZE as f32 * 0.25);
            acc += mag;
            cnt += 1;
        }
        let avg = if cnt > 0 { acc / cnt as f32 } else { 0.0 };
        let scaled = (avg * 2.2).clamp(0.0, 1.0);
        out_bands[b] = out_bands[b] * 0.55 + scaled * 0.45;
    }
}

/// Stateful 1024-sample rolling spectrum analyzer with logarithmic beat bands,
/// adaptive loudness normalization, and asymmetric attack/release smoothing.
pub struct RealtimeSpectrumAnalyzer {
    ring: [f32; REALTIME_FFT_SIZE],
    write_pos: usize,
    sample_rate: u32,
    bands: [f32; BAND_COUNT],
    env_peak: f32,
}

impl RealtimeSpectrumAnalyzer {
    pub fn new(sample_rate: u32) -> Self {
        Self {
            ring: [0.0; REALTIME_FFT_SIZE],
            write_pos: 0,
            sample_rate: sample_rate.max(8000),
            bands: [0.0; BAND_COUNT],
            env_peak: 0.08,
        }
    }

    pub fn push_mono_sample(&mut self, sample: f32) {
        self.ring[self.write_pos] = if sample.is_finite() { sample } else { 0.0 };
        self.write_pos = (self.write_pos + 1) % REALTIME_FFT_SIZE;
    }

    pub fn push_silence(&mut self, frames: usize) {
        let count = frames.min(REALTIME_FFT_SIZE);
        for _ in 0..count {
            self.push_mono_sample(0.0);
        }
    }

    pub fn current_bands(&self) -> [f32; BAND_COUNT] {
        self.bands
    }

    pub fn is_silent(&self) -> bool {
        self.bands.iter().all(|&b| b <= 0.0001)
    }

    pub fn decay_silent(&mut self) -> [f32; BAND_COUNT] {
        for b in &mut self.bands {
            *b *= 0.78;
            if *b < 0.008 {
                *b = 0.0;
            }
        }
        self.env_peak = (self.env_peak * 0.96).max(0.045);
        self.bands
    }

    pub fn analyze(&mut self) -> [f32; BAND_COUNT] {
        let mut re = [0.0f32; REALTIME_FFT_SIZE];
        let mut im = [0.0f32; REALTIME_FFT_SIZE];
        let mut sq_sum = 0.0f32;

        for i in 0..REALTIME_FFT_SIZE {
            let s = self.ring[(self.write_pos + i) % REALTIME_FFT_SIZE];
            sq_sum += s * s;
            let w = 0.5 * (1.0 - (2.0 * PI * i as f32 / (REALTIME_FFT_SIZE - 1) as f32).cos());
            re[i] = s * w;
        }

        let rms = (sq_sum / REALTIME_FFT_SIZE as f32).sqrt();
        if rms < 0.0006 {
            return self.decay_silent();
        }

        radix2_fft_in_place(&mut re, &mut im);

        let half = REALTIME_FFT_SIZE / 2;
        let bin_hz = self.sample_rate as f32 / REALTIME_FFT_SIZE as f32;
        let f_min = 42.0f32;
        let f_max = (self.sample_rate as f32 * 0.44).min(14_000.0).max(f_min * 2.0);
        let ratio = f_max / f_min;
        let norm_div = REALTIME_FFT_SIZE as f32 * 0.25;

        let mut raw_bands = [0.0f32; BAND_COUNT];
        let mut frame_max = 0.0f32;
        let mut prev_end = 1usize;

        for (b, slot) in raw_bands.iter_mut().enumerate() {
            let lo_hz = f_min * ratio.powf(b as f32 / BAND_COUNT as f32);
            let hi_hz = f_min * ratio.powf((b + 1) as f32 / BAND_COUNT as f32);
            let bin_start = (lo_hz / bin_hz).floor().max(0.0) as usize;
            let bin_start = bin_start.max(prev_end).min(half - 1);
            let bin_end = (hi_hz / bin_hz).ceil().max(1.0) as usize;
            let bin_end = bin_end.max(bin_start + 1).min(half);
            prev_end = bin_end;

            let mut max_mag = 0.0f32;
            let mut sum_mag = 0.0f32;
            let cnt = bin_end - bin_start;
            for bin in bin_start..bin_end {
                let mag = (re[bin] * re[bin] + im[bin] * im[bin]).sqrt() / norm_div;
                max_mag = max_mag.max(mag);
                sum_mag += mag;
            }
            let avg_mag = sum_mag / cnt as f32;
            let tilt = 1.0 + (b as f32 / (BAND_COUNT - 1) as f32) * 1.85;
            let val = (0.60 * max_mag + 0.40 * avg_mag) * tilt;
            *slot = val;
            frame_max = frame_max.max(val);
        }

        if frame_max > self.env_peak {
            self.env_peak = self.env_peak * 0.65 + frame_max * 0.35;
        } else {
            self.env_peak = (self.env_peak * 0.992).max(0.045);
        }

        let inv_peak = 1.0 / self.env_peak.max(0.045);
        for (cur, raw) in self.bands.iter_mut().zip(raw_bands.iter()) {
            let target = ((raw * inv_peak).clamp(0.0, 1.35) / 1.35).powf(0.68);
            let next = if target > *cur {
                *cur * 0.20 + target * 0.80
            } else {
                *cur * 0.74 + target * 0.26
            };
            *cur = if next < 0.008 { 0.0 } else { next };
        }

        self.bands
    }
}

#[cfg(windows)]
mod wasapi_stream {
    use super::{RealtimeSpectrumAnalyzer, BAND_COUNT};
    use std::time::{Duration, Instant};
    use windows::Win32::Media::Audio::{
        eMultimedia, eRender, IAudioCaptureClient, IAudioClient, IMMDevice, IMMDeviceEnumerator,
        MMDeviceEnumerator, AUDCLNT_BUFFERFLAGS_SILENT, AUDCLNT_SHAREMODE_SHARED,
        AUDCLNT_STREAMFLAGS_LOOPBACK,
    };
    use windows::Win32::System::Com::{
        CoCreateInstance, CoInitializeEx, CoTaskMemFree, CoUninitialize, CLSCTX_ALL,
        COINIT_MULTITHREADED,
    };

    unsafe fn default_endpoint_with_id(enumerator: &IMMDeviceEnumerator) -> Option<(IMMDevice, String)> {
        let device = enumerator
            .GetDefaultAudioEndpoint(eRender, eMultimedia)
            .ok()?;
        let id_pwstr = device.GetId().ok()?;
        let id = if id_pwstr.0.is_null() {
            String::new()
        } else {
            let mut len = 0usize;
            while *id_pwstr.0.add(len) != 0 {
                len += 1;
            }
            String::from_utf16_lossy(std::slice::from_raw_parts(id_pwstr.0, len))
        };
        CoTaskMemFree(Some(id_pwstr.0 as *const _));
        Some((device, id))
    }

    pub struct WasapiLoopbackStream {
        enumerator: Option<IMMDeviceEnumerator>,
        client: Option<IAudioClient>,
        capture: Option<IAudioCaptureClient>,
        device_id: String,
        channels: usize,
        bits: u16,
        last_device_check: Instant,
        silent_ticks: u32,
        analyzer: RealtimeSpectrumAnalyzer,
        com_owned: bool,
    }

    impl WasapiLoopbackStream {
        pub fn open() -> Option<Self> {
            unsafe {
                let com_owned = CoInitializeEx(None, COINIT_MULTITHREADED).is_ok();
                let opened = (|| -> Option<Self> {
                    let enumerator: IMMDeviceEnumerator =
                        CoCreateInstance(&MMDeviceEnumerator, None, CLSCTX_ALL).ok()?;
                    let (device, device_id) = default_endpoint_with_id(&enumerator)?;
                    let client: IAudioClient = device.Activate(CLSCTX_ALL, None).ok()?;
                    let mix_ptr = client.GetMixFormat().ok()?;
                    if mix_ptr.is_null() {
                        return None;
                    }
                    let channels = (*mix_ptr).nChannels.max(1) as usize;
                    let sample_rate = (*mix_ptr).nSamplesPerSec.max(8000);
                    let bits = (*mix_ptr).wBitsPerSample;

                    let init_res = client.Initialize(
                        AUDCLNT_SHAREMODE_SHARED,
                        AUDCLNT_STREAMFLAGS_LOOPBACK,
                        1_000_000,
                        0,
                        mix_ptr,
                        None,
                    );
                    CoTaskMemFree(Some(mix_ptr as *const _));
                    if init_res.is_err() {
                        return None;
                    }

                    let capture: IAudioCaptureClient = client.GetService().ok()?;
                    if client.Start().is_err() {
                        return None;
                    }

                    Some(Self {
                        enumerator: Some(enumerator),
                        client: Some(client),
                        capture: Some(capture),
                        device_id,
                        channels,
                        bits,
                        last_device_check: Instant::now(),
                        silent_ticks: 0,
                        analyzer: RealtimeSpectrumAnalyzer::new(sample_rate),
                        com_owned,
                    })
                })();
                if opened.is_none() && com_owned {
                    CoUninitialize();
                }
                opened
            }
        }

        pub fn poll(&mut self) -> Result<[f32; BAND_COUNT], ()> {
            unsafe {
                if self.last_device_check.elapsed() >= Duration::from_secs(2) {
                    self.last_device_check = Instant::now();
                    if let Some(enumerator) = &self.enumerator {
                        match default_endpoint_with_id(enumerator) {
                            Some((_, id)) if id == self.device_id => {}
                            _ => return Err(()),
                        }
                    }
                }

                let capture = self.capture.as_ref().ok_or(())?;
                let mut saw_audio = false;
                let mut saw_silent_packet = false;
                let mut silent_frames = 0usize;

                loop {
                    let pkt = capture.GetNextPacketSize().map_err(|_| ())?;
                    if pkt == 0 {
                        break;
                    }
                    let mut data_ptr = std::ptr::null_mut();
                    let mut num_frames = 0u32;
                    let mut flags = 0u32;
                    capture
                        .GetBuffer(&mut data_ptr, &mut num_frames, &mut flags, None, None)
                        .map_err(|_| ())?;

                    let is_silent = (flags & (AUDCLNT_BUFFERFLAGS_SILENT.0 as u32)) != 0
                        || data_ptr.is_null();
                    let frames = num_frames as usize;

                    if frames > 0 {
                        if is_silent {
                            saw_silent_packet = true;
                            silent_frames += frames;
                        } else if self.bits == 32 {
                            let fslice = std::slice::from_raw_parts(
                                data_ptr as *const f32,
                                frames * self.channels,
                            );
                            let inv_ch = 1.0 / self.channels as f32;
                            for f in 0..frames {
                                let base = f * self.channels;
                                let mut sum = 0.0f32;
                                for c in 0..self.channels {
                                    sum += fslice[base + c];
                                }
                                self.analyzer.push_mono_sample(sum * inv_ch);
                            }
                            saw_audio = true;
                        } else if self.bits == 16 {
                            let islice = std::slice::from_raw_parts(
                                data_ptr as *const i16,
                                frames * self.channels,
                            );
                            let inv_ch = 1.0 / (self.channels as f32 * 32768.0);
                            for f in 0..frames {
                                let base = f * self.channels;
                                let mut sum = 0.0f32;
                                for c in 0..self.channels {
                                    sum += islice[base + c] as f32;
                                }
                                self.analyzer.push_mono_sample(sum * inv_ch);
                            }
                            saw_audio = true;
                        }
                    }

                    let _ = capture.ReleaseBuffer(num_frames);
                }

                if saw_audio {
                    self.silent_ticks = 0;
                    Ok(self.analyzer.analyze())
                } else if saw_silent_packet {
                    self.silent_ticks += 1;
                    self.analyzer.push_silence(silent_frames);
                    Ok(self.analyzer.analyze())
                } else {
                    self.silent_ticks = self.silent_ticks.saturating_add(1);
                    if self.silent_ticks <= 2 {
                        Ok(self.analyzer.current_bands())
                    } else {
                        Ok(self.analyzer.decay_silent())
                    }
                }
            }
        }
    }

    impl Drop for WasapiLoopbackStream {
        fn drop(&mut self) {
            unsafe {
                if let Some(client) = &self.client {
                    let _ = client.Stop();
                }
                self.capture = None;
                self.client = None;
                self.enumerator = None;
                if self.com_owned {
                    CoUninitialize();
                }
            }
        }
    }
}

#[cfg(not(windows))]
mod wasapi_stream {
    use super::BAND_COUNT;

    pub struct WasapiLoopbackStream;

    impl WasapiLoopbackStream {
        pub fn open() -> Option<Self> {
            None
        }

        pub fn poll(&mut self) -> Result<[f32; BAND_COUNT], ()> {
            Err(())
        }
    }
}

pub use wasapi_stream::WasapiLoopbackStream;

/// Captures one throttled loopback audio window from Windows WASAPI default render endpoint.
/// Returns false cleanly when silent, unavailable, or paused.
#[cfg(windows)]
pub fn sample_wasapi_loopback_bands(out_bands: &mut [f32; BAND_COUNT]) -> bool {
    use windows::Win32::Media::Audio::{
        eMultimedia, eRender, IAudioCaptureClient, IAudioClient, IMMDeviceEnumerator,
        MMDeviceEnumerator, AUDCLNT_BUFFERFLAGS_SILENT, AUDCLNT_SHAREMODE_SHARED,
        AUDCLNT_STREAMFLAGS_LOOPBACK,
    };
    use windows::Win32::System::Com::{
        CoCreateInstance, CoInitializeEx, CoTaskMemFree, CoUninitialize, CLSCTX_ALL,
        COINIT_MULTITHREADED,
    };

    unsafe {
        let hr_init = CoInitializeEx(None, COINIT_MULTITHREADED);
        let should_uninit = hr_init.is_ok();
        let res = (|| -> Option<bool> {
            let enumerator: IMMDeviceEnumerator =
                CoCreateInstance(&MMDeviceEnumerator, None, CLSCTX_ALL).ok()?;
            let device = enumerator
                .GetDefaultAudioEndpoint(eRender, eMultimedia)
                .ok()?;
            let client: IAudioClient = device.Activate(CLSCTX_ALL, None).ok()?;
            let mix_ptr = client.GetMixFormat().ok()?;
            if mix_ptr.is_null() {
                return Some(false);
            }
            let channels = (*mix_ptr).nChannels.max(1) as usize;
            let bits = (*mix_ptr).wBitsPerSample;

            let init_ok = client
                .Initialize(
                    AUDCLNT_SHAREMODE_SHARED,
                    AUDCLNT_STREAMFLAGS_LOOPBACK,
                    400_000,
                    0,
                    mix_ptr,
                    None,
                )
                .is_ok();
            CoTaskMemFree(Some(mix_ptr as *const _));
            if !init_ok {
                return Some(false);
            }

            let capture: IAudioCaptureClient = client.GetService().ok()?;
            if client.Start().is_err() {
                return Some(false);
            }
            std::thread::sleep(std::time::Duration::from_millis(18));

            let mut pcm = [0.0f32; FFT_SIZE];
            let mut written = 0usize;
            let mut data_ptr = std::ptr::null_mut();
            let mut num_frames = 0u32;
            let mut flags = 0u32;

            if capture
                .GetBuffer(&mut data_ptr, &mut num_frames, &mut flags, None, None)
                .is_ok()
                && !data_ptr.is_null()
                && num_frames > 0
                && (flags & (AUDCLNT_BUFFERFLAGS_SILENT.0 as u32)) == 0
            {
                let frames = (num_frames as usize).min(FFT_SIZE);
                if bits == 32 {
                    let fslice =
                        std::slice::from_raw_parts(data_ptr as *const f32, frames * channels);
                    for f in 0..frames {
                        pcm[f] = fslice[f * channels];
                    }
                    written = frames;
                } else if bits == 16 {
                    let islice =
                        std::slice::from_raw_parts(data_ptr as *const i16, frames * channels);
                    for f in 0..frames {
                        pcm[f] = islice[f * channels] as f32 / 32768.0;
                    }
                    written = frames;
                }
                let _ = capture.ReleaseBuffer(num_frames);
            } else if num_frames > 0 {
                let _ = capture.ReleaseBuffer(num_frames);
            }
            let _ = client.Stop();

            if written > 0 {
                compute_spectrum_bands(&pcm, out_bands);
                Some(true)
            } else {
                for b in out_bands.iter_mut() {
                    *b *= 0.6;
                }
                Some(false)
            }
        })();
        if should_uninit {
            CoUninitialize();
        }
        res.unwrap_or(false)
    }
}

#[cfg(not(windows))]
pub fn sample_wasapi_loopback_bands(_out_bands: &mut [f32; BAND_COUNT]) -> bool {
    false
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn fft_detects_sine_wave_energy_without_nan() {
        let mut samples = [0.0f32; FFT_SIZE];
        for (i, s) in samples.iter_mut().enumerate() {
            *s = (2.0 * PI * 12.0 * i as f32 / FFT_SIZE as f32).sin();
        }
        let mut bands = [0.0f32; BAND_COUNT];
        compute_spectrum_bands(&samples, &mut bands);
        let peak = bands.iter().cloned().fold(0.0f32, f32::max);
        assert!(peak > 0.25 && peak <= 1.0);
        assert!(bands.iter().all(|b| b.is_finite()));
    }

    #[test]
    fn realtime_analyzer_separates_bass_and_treble_and_decays_to_silence() {
        let sr = 48_000u32;
        let mut bass_az = RealtimeSpectrumAnalyzer::new(sr);
        for i in 0..REALTIME_FFT_SIZE {
            let s = (2.0 * PI * 80.0 * i as f32 / sr as f32).sin() * 0.5;
            bass_az.push_mono_sample(s);
        }
        let bass_bands = bass_az.analyze();
        let low_peak = bass_bands[0..4].iter().copied().fold(0.0f32, f32::max);
        let high_peak = bass_bands[10..BAND_COUNT].iter().copied().fold(0.0f32, f32::max);
        assert!(low_peak > 0.5, "Nada bass 80Hz harus dominan di band rendah: {low_peak}");
        assert!(low_peak > high_peak * 2.0, "Bass 80Hz tidak boleh bocor kuat ke band tinggi");

        let mut treble_az = RealtimeSpectrumAnalyzer::new(sr);
        for i in 0..REALTIME_FFT_SIZE {
            let s = (2.0 * PI * 6_000.0 * i as f32 / sr as f32).sin() * 0.5;
            treble_az.push_mono_sample(s);
        }
        let treble_bands = treble_az.analyze();
        let treble_hi = treble_bands[10..BAND_COUNT].iter().copied().fold(0.0f32, f32::max);
        let treble_lo = treble_bands[0..4].iter().copied().fold(0.0f32, f32::max);
        assert!(treble_hi > 0.5, "Nada tinggi 6kHz harus muncul di band atas: {treble_hi}");
        assert!(treble_hi > treble_lo * 2.0);

        for _ in 0..40 {
            bass_az.decay_silent();
        }
        assert!(bass_az.is_silent(), "Setelah decay hening semua band harus kembali 0");
    }
}
