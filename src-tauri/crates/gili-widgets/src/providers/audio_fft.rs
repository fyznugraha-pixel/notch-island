use std::f32::consts::PI;

pub const FFT_SIZE: usize = 256;
pub const BAND_COUNT: usize = 16;

/// Pure-Rust in-place iterative Radix-2 Cooley-Tukey FFT on a power-of-2 real buffer.
/// Computes 16 smoothed logarithmic spectrum bands in [0.0..1.0] with zero heap allocation per frame.
pub fn compute_spectrum_bands(samples: &[f32; FFT_SIZE], out_bands: &mut [f32; BAND_COUNT]) {
    let mut re = [0.0f32; FFT_SIZE];
    let mut im = [0.0f32; FFT_SIZE];

    // Apply Hann window
    for i in 0..FFT_SIZE {
        let w = 0.5 * (1.0 - (2.0 * PI * i as f32 / (FFT_SIZE - 1) as f32).cos());
        re[i] = samples[i] * w;
    }

    // Bit-reversal permutation
    let mut j = 0usize;
    for i in 1..FFT_SIZE {
        let mut bit = FFT_SIZE >> 1;
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
    while len <= FFT_SIZE {
        let ang = -2.0 * PI / len as f32;
        let wlen_r = ang.cos();
        let wlen_i = ang.sin();
        let mut i = 0;
        while i < FFT_SIZE {
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

    // Group 128 positive-frequency bins into 16 bands
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
        // Smooth decay so bars fall gracefully
        out_bands[b] = out_bands[b] * 0.55 + scaled * 0.45;
    }
}

/// Captures one throttled loopback audio window from Windows WASAPI default render endpoint.
/// Returns false cleanly when silent, unavailable, or paused.
#[cfg(windows)]
pub fn sample_wasapi_loopback_bands(out_bands: &mut [f32; BAND_COUNT]) -> bool {
    use windows::Win32::Media::Audio::{
        eMultimedia, eRender, IAudioCaptureClient, IAudioClient, IMMDeviceEnumerator,
        MMDeviceEnumerator, AUDCLNT_SHAREMODE_SHARED, AUDCLNT_STREAMFLAGS_LOOPBACK,
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

            // 40ms buffer duration in 100ns units
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
}
