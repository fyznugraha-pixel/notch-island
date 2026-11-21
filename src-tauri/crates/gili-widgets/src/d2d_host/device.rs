use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SystemVisualPolicy {
    pub reduced_motion: bool,
    pub high_contrast: bool,
    pub transparency_enabled: bool,
    pub text_scale_factor: f32,
    pub power_saver: bool,
    pub fullscreen_or_game_active: bool,
}

impl Default for SystemVisualPolicy {
    fn default() -> Self {
        Self {
            reduced_motion: false,
            high_contrast: false,
            transparency_enabled: true,
            text_scale_factor: 1.0,
            power_saver: false,
            fullscreen_or_game_active: false,
        }
    }
}

pub fn query_system_visual_policy() -> SystemVisualPolicy {
    let mut policy = SystemVisualPolicy::default();

    #[cfg(windows)]
    {
        use windows::Win32::Foundation::BOOL;
        use windows::Win32::System::Power::{GetSystemPowerStatus, SYSTEM_POWER_STATUS};
        use windows::Win32::UI::Accessibility::{HCF_HIGHCONTRASTON, HIGHCONTRASTW};
        use windows::Win32::UI::Shell::{
            SHQueryUserNotificationState, QUNS_BUSY, QUNS_PRESENTATION_MODE,
            QUNS_RUNNING_D3D_FULL_SCREEN,
        };
        use windows::Win32::UI::WindowsAndMessaging::{
            GetClassNameW, GetForegroundWindow, SystemParametersInfoW, SPI_GETCLIENTAREAANIMATION,
            SPI_GETHIGHCONTRAST, SYSTEM_PARAMETERS_INFO_UPDATE_FLAGS,
        };

        unsafe {
            let mut anim_enabled = BOOL(1);
            if SystemParametersInfoW(
                SPI_GETCLIENTAREAANIMATION,
                0,
                Some(&mut anim_enabled as *mut _ as *mut _),
                SYSTEM_PARAMETERS_INFO_UPDATE_FLAGS(0),
            )
            .is_ok()
            {
                policy.reduced_motion = !anim_enabled.as_bool();
            }

            let mut hc = HIGHCONTRASTW {
                cbSize: std::mem::size_of::<HIGHCONTRASTW>() as u32,
                ..Default::default()
            };
            if SystemParametersInfoW(
                SPI_GETHIGHCONTRAST,
                hc.cbSize,
                Some(&mut hc as *mut _ as *mut _),
                SYSTEM_PARAMETERS_INFO_UPDATE_FLAGS(0),
            )
            .is_ok()
            {
                policy.high_contrast = (hc.dwFlags & HCF_HIGHCONTRASTON) == HCF_HIGHCONTRASTON;
            }

            let mut sps = SYSTEM_POWER_STATUS::default();
            if GetSystemPowerStatus(&mut sps).is_ok() {
                policy.power_saver = sps.SystemStatusFlag != 0;
            }

            if let Ok(state) = SHQueryUserNotificationState() {
                if state == QUNS_RUNNING_D3D_FULL_SCREEN || state == QUNS_PRESENTATION_MODE {
                    policy.fullscreen_or_game_active = true;
                } else if state == QUNS_BUSY {
                    // Ignore desktop shell / taskbar / our own widget host so minimizing apps to desktop
                    // never triggers a false-positive fullscreen pause.
                    let fg = GetForegroundWindow();
                    let mut is_desktop_shell = fg.0.is_null();
                    if !fg.0.is_null() {
                        let mut cls = [0u16; 64];
                        let len = GetClassNameW(fg, &mut cls);
                        if len > 0 {
                            let name = String::from_utf16_lossy(&cls[..len as usize]);
                            if matches!(
                                name.as_str(),
                                "Progman"
                                    | "WorkerW"
                                    | "Shell_TrayWnd"
                                    | "Shell_SecondaryTrayWnd"
                                    | "GiliDesktopWidgetsHostV1"
                            ) {
                                is_desktop_shell = true;
                            }
                        }
                    }
                    policy.fullscreen_or_game_active = !is_desktop_shell;
                }
            }
        }

        // Windows transparency preference via documented Personalize registry key
        if let Ok(key) = winreg::RegKey::predef(winreg::enums::HKEY_CURRENT_USER)
            .open_subkey("Software\\Microsoft\\Windows\\CurrentVersion\\Themes\\Personalize")
        {
            if let Ok(val) = key.get_value::<u32, _>("EnableTransparency") {
                policy.transparency_enabled = val != 0;
            }
        }

        // System text scale factor (1.0 .. 1.5) via WinRT UISettings
        if let Ok(ui_settings) = windows::UI::ViewManagement::UISettings::new() {
            if let Ok(scale) = ui_settings.TextScaleFactor() {
                let s = scale as f32;
                if s.is_finite() {
                    policy.text_scale_factor = s.clamp(1.0, 1.5);
                }
            }
        }
    }

    policy
}

/// Lightweight periodic refresh that only queries power-saver and fullscreen/game state,
/// avoiding repeated registry and WinRT `UISettings` activation between `WM_SETTINGCHANGE` events.
pub fn query_dynamic_visual_policy(prev: &SystemVisualPolicy) -> SystemVisualPolicy {
    let mut policy = prev.clone();
    policy.fullscreen_or_game_active = false;

    #[cfg(windows)]
    {
        use windows::Win32::System::Power::{GetSystemPowerStatus, SYSTEM_POWER_STATUS};
        use windows::Win32::UI::Shell::{
            SHQueryUserNotificationState, QUNS_BUSY, QUNS_PRESENTATION_MODE,
            QUNS_RUNNING_D3D_FULL_SCREEN,
        };
        use windows::Win32::UI::WindowsAndMessaging::{GetClassNameW, GetForegroundWindow};

        unsafe {
            let mut sps = SYSTEM_POWER_STATUS::default();
            if GetSystemPowerStatus(&mut sps).is_ok() {
                policy.power_saver = sps.SystemStatusFlag != 0;
            }

            if let Ok(state) = SHQueryUserNotificationState() {
                if state == QUNS_RUNNING_D3D_FULL_SCREEN || state == QUNS_PRESENTATION_MODE {
                    policy.fullscreen_or_game_active = true;
                } else if state == QUNS_BUSY {
                    let fg = GetForegroundWindow();
                    let mut is_desktop_shell = fg.0.is_null();
                    if !fg.0.is_null() {
                        let mut cls = [0u16; 64];
                        let len = GetClassNameW(fg, &mut cls);
                        if len > 0 {
                            let name = String::from_utf16_lossy(&cls[..len as usize]);
                            if matches!(
                                name.as_str(),
                                "Progman"
                                    | "WorkerW"
                                    | "Shell_TrayWnd"
                                    | "Shell_SecondaryTrayWnd"
                                    | "GiliDesktopWidgetsHostV1"
                            ) {
                                is_desktop_shell = true;
                            }
                        }
                    }
                    policy.fullscreen_or_game_active = !is_desktop_shell;
                }
            }
        }
    }

    policy
}

#[cfg(windows)]
pub mod gpu {
    use windows::core::{Interface, HRESULT};
    use windows::Win32::Foundation::{HWND, RECT};
    use windows::Win32::Graphics::Direct2D::Common::{
        D2D1_ALPHA_MODE_PREMULTIPLIED, D2D1_PIXEL_FORMAT,
    };
    use windows::Win32::Graphics::Direct2D::{
        D2D1CreateFactory, ID2D1Bitmap1, ID2D1Device, ID2D1DeviceContext, ID2D1Factory1,
        D2D1_BITMAP_OPTIONS_CANNOT_DRAW, D2D1_BITMAP_OPTIONS_TARGET, D2D1_BITMAP_PROPERTIES1,
        D2D1_DEVICE_CONTEXT_OPTIONS_NONE, D2D1_FACTORY_OPTIONS,
        D2D1_FACTORY_TYPE_SINGLE_THREADED, D2D1_TEXT_ANTIALIAS_MODE_GRAYSCALE,
    };
    use windows::Win32::Graphics::Direct3D::{
        D3D_DRIVER_TYPE_HARDWARE, D3D_DRIVER_TYPE_UNKNOWN, D3D_DRIVER_TYPE_WARP,
        D3D_FEATURE_LEVEL_10_0, D3D_FEATURE_LEVEL_11_0, D3D_FEATURE_LEVEL_11_1,
    };
    use windows::Win32::Graphics::Direct3D11::{
        D3D11CreateDevice, ID3D11Device, D3D11_CREATE_DEVICE_BGRA_SUPPORT, D3D11_SDK_VERSION,
    };
    use windows::Win32::Graphics::DirectComposition::{
        DCompositionCreateDevice, IDCompositionDevice, IDCompositionTarget, IDCompositionVisual,
    };
    use windows::Win32::Graphics::DirectWrite::{
        DWriteCreateFactory, IDWriteFactory, IDWriteFontCollection, IDWriteTypography,
        DWRITE_FACTORY_TYPE_SHARED, DWRITE_FONT_FEATURE, DWRITE_FONT_FEATURE_TAG_TABULAR_FIGURES,
    };
    use windows::Win32::Graphics::Dxgi::Common::{
        DXGI_ALPHA_MODE_PREMULTIPLIED, DXGI_FORMAT_B8G8R8A8_UNORM, DXGI_SAMPLE_DESC,
    };
    use windows::Win32::Graphics::Dxgi::{
        CreateDXGIFactory2, IDXGIAdapter1, IDXGIDevice, IDXGIFactory2, IDXGIFactory6,
        IDXGISurface, IDXGISwapChain1, DXGI_CREATE_FACTORY_FLAGS, DXGI_ERROR_DEVICE_REMOVED,
        DXGI_ERROR_DEVICE_RESET, DXGI_GPU_PREFERENCE_MINIMUM_POWER, DXGI_PRESENT,
        DXGI_PRESENT_PARAMETERS, DXGI_SCALING_STRETCH, DXGI_SWAP_CHAIN_DESC1,
        DXGI_SWAP_CHAIN_FLAG, DXGI_SWAP_EFFECT_FLIP_SEQUENTIAL, DXGI_USAGE_RENDER_TARGET_OUTPUT,
    };

    const D2DERR_RECREATE_TARGET_HR: HRESULT = HRESULT(0x8899_000Cu32 as i32);

    pub struct D2DDeviceResources {
        pub dxgi_factory: IDXGIFactory2,
        pub d3d_device: ID3D11Device,
        pub d2d_factory: ID2D1Factory1,
        pub d2d_device: ID2D1Device,
        pub d2d_context: ID2D1DeviceContext,
        pub dwrite_factory: IDWriteFactory,
        pub tabular_typography: IDWriteTypography,
        pub dcomp_device: IDCompositionDevice,
        pub adapter_name: String,
        pub icon_font_family: &'static str,
    }

    impl D2DDeviceResources {
        /// Initializes D3D11/D2D1/DirectWrite/DirectComposition preferring the minimum-power iGPU.
        pub fn create() -> Result<Self, String> {
            unsafe {
                let factory6: Option<IDXGIFactory6> =
                    CreateDXGIFactory2(DXGI_CREATE_FACTORY_FLAGS(0)).ok();
                let dxgi_factory: IDXGIFactory2 = if let Some(ref f6) = factory6 {
                    f6.cast().map_err(|e| format!("Cast IDXGIFactory2 gagal: {e}"))?
                } else {
                    CreateDXGIFactory2(DXGI_CREATE_FACTORY_FLAGS(0))
                        .map_err(|e| format!("CreateDXGIFactory2 gagal: {e}"))?
                };

                // Prefer minimum-power adapter (iGPU) on dual-GPU laptops
                let min_power_adapter: Option<IDXGIAdapter1> = factory6
                    .as_ref()
                    .and_then(|f6| {
                        f6.EnumAdapterByGpuPreference::<IDXGIAdapter1>(
                            0,
                            DXGI_GPU_PREFERENCE_MINIMUM_POWER,
                        )
                        .ok()
                    })
                    .or_else(|| dxgi_factory.EnumAdapters1(0).ok());

                let mut adapter_name = "GPU Default".to_string();
                if let Some(ref ad) = min_power_adapter {
                    if let Ok(desc) = ad.GetDesc1() {
                        let len = desc
                            .Description
                            .iter()
                            .position(|&c| c == 0)
                            .unwrap_or(desc.Description.len());
                        adapter_name = String::from_utf16_lossy(&desc.Description[..len]);
                    }
                }

                let levels = [
                    D3D_FEATURE_LEVEL_11_1,
                    D3D_FEATURE_LEVEL_11_0,
                    D3D_FEATURE_LEVEL_10_0,
                ];
                let flags = D3D11_CREATE_DEVICE_BGRA_SUPPORT;
                let mut d3d_opt: Option<ID3D11Device> = None;

                let created = if let Some(ref ad) = min_power_adapter {
                    D3D11CreateDevice(
                        ad,
                        D3D_DRIVER_TYPE_UNKNOWN,
                        None,
                        flags,
                        Some(&levels),
                        D3D11_SDK_VERSION,
                        Some(&mut d3d_opt),
                        None,
                        None,
                    )
                } else {
                    D3D11CreateDevice(
                        None,
                        D3D_DRIVER_TYPE_HARDWARE,
                        None,
                        flags,
                        Some(&levels),
                        D3D11_SDK_VERSION,
                        Some(&mut d3d_opt),
                        None,
                        None,
                    )
                };

                if created.is_err() {
                    adapter_name = "Microsoft WARP (Software Fallback)".to_string();
                    D3D11CreateDevice(
                        None,
                        D3D_DRIVER_TYPE_WARP,
                        None,
                        flags,
                        Some(&levels),
                        D3D11_SDK_VERSION,
                        Some(&mut d3d_opt),
                        None,
                        None,
                    )
                    .map_err(|e| format!("D3D11CreateDevice WARP gagal: {e}"))?;
                }

                let d3d_device = d3d_opt.ok_or_else(|| "ID3D11Device kosong".to_string())?;
                let dxgi_device: IDXGIDevice = d3d_device
                    .cast()
                    .map_err(|e| format!("Cast IDXGIDevice gagal: {e}"))?;

                let d2d_factory: ID2D1Factory1 = D2D1CreateFactory(
                    D2D1_FACTORY_TYPE_SINGLE_THREADED,
                    Some(&D2D1_FACTORY_OPTIONS::default()),
                )
                .map_err(|e| format!("D2D1CreateFactory gagal: {e}"))?;

                let d2d_device = d2d_factory
                    .CreateDevice(&dxgi_device)
                    .map_err(|e| format!("D2D CreateDevice gagal: {e}"))?;

                let d2d_context = d2d_device
                    .CreateDeviceContext(D2D1_DEVICE_CONTEXT_OPTIONS_NONE)
                    .map_err(|e| format!("CreateDeviceContext gagal: {e}"))?;

                // Grayscale AA is mandatory on transparent surfaces (ClearType causes color fringing)
                d2d_context.SetTextAntialiasMode(D2D1_TEXT_ANTIALIAS_MODE_GRAYSCALE);

                let dwrite_factory: IDWriteFactory = DWriteCreateFactory(DWRITE_FACTORY_TYPE_SHARED)
                    .map_err(|e| format!("DWriteCreateFactory gagal: {e}"))?;

                let tabular_typography = dwrite_factory
                    .CreateTypography()
                    .map_err(|e| format!("CreateTypography gagal: {e}"))?;
                tabular_typography
                    .AddFontFeature(DWRITE_FONT_FEATURE {
                        nameTag: DWRITE_FONT_FEATURE_TAG_TABULAR_FIGURES,
                        parameter: 1,
                    })
                    .map_err(|e| format!("AddFontFeature tnum gagal: {e}"))?;

                let dcomp_device: IDCompositionDevice = DCompositionCreateDevice(&dxgi_device)
                    .map_err(|e| format!("DCompositionCreateDevice gagal: {e}"))?;

                let icon_font_family = {
                    let mut coll: Option<IDWriteFontCollection> = None;
                    let mut has_fluent = false;
                    if dwrite_factory.GetSystemFontCollection(&mut coll, false).is_ok() {
                        if let Some(c) = coll {
                            let mut idx = 0u32;
                            let mut exists = windows::Win32::Foundation::BOOL(0);
                            let name = windows::core::w!("Segoe Fluent Icons");
                            if c.FindFamilyName(name, &mut idx, &mut exists).is_ok() {
                                has_fluent = exists.as_bool();
                            }
                        }
                    }
                    if has_fluent {
                        "Segoe Fluent Icons"
                    } else {
                        "Segoe MDL2 Assets"
                    }
                };

                Ok(Self {
                    dxgi_factory,
                    d3d_device,
                    d2d_factory,
                    d2d_device,
                    d2d_context,
                    dwrite_factory,
                    tabular_typography,
                    dcomp_device,
                    adapter_name,
                    icon_font_family,
                })
            }
        }

        pub fn is_device_lost(hr: HRESULT) -> bool {
            hr == DXGI_ERROR_DEVICE_REMOVED
                || hr == DXGI_ERROR_DEVICE_RESET
                || hr == D2DERR_RECREATE_TARGET_HR
        }
    }

    pub struct MonitorSwapChain {
        pub hwnd: HWND,
        pub width_px: u32,
        pub height_px: u32,
        pub dpi: f32,
        pub swap_chain: IDXGISwapChain1,
        pub dcomp_target: IDCompositionTarget,
        pub dcomp_visual: IDCompositionVisual,
        pub target_bitmap: Option<ID2D1Bitmap1>,
        pub has_presented_once: bool,
    }

    impl MonitorSwapChain {
        pub fn create(
            res: &D2DDeviceResources,
            hwnd: HWND,
            width_px: u32,
            height_px: u32,
            dpi: f32,
        ) -> Result<Self, String> {
            let w = width_px.max(1);
            let h = height_px.max(1);
            unsafe {
                let desc = DXGI_SWAP_CHAIN_DESC1 {
                    Width: w,
                    Height: h,
                    Format: DXGI_FORMAT_B8G8R8A8_UNORM,
                    Stereo: false.into(),
                    SampleDesc: DXGI_SAMPLE_DESC {
                        Count: 1,
                        Quality: 0,
                    },
                    BufferUsage: DXGI_USAGE_RENDER_TARGET_OUTPUT,
                    BufferCount: 2,
                    Scaling: DXGI_SCALING_STRETCH,
                    SwapEffect: DXGI_SWAP_EFFECT_FLIP_SEQUENTIAL,
                    AlphaMode: DXGI_ALPHA_MODE_PREMULTIPLIED,
                    Flags: 0,
                };
                let swap_chain = res
                    .dxgi_factory
                    .CreateSwapChainForComposition(&res.d3d_device, &desc, None)
                    .map_err(|e| format!("CreateSwapChainForComposition gagal: {e}"))?;

                let dcomp_target = res
                    .dcomp_device
                    .CreateTargetForHwnd(hwnd, true)
                    .map_err(|e| format!("CreateTargetForHwnd gagal: {e}"))?;
                let dcomp_visual = res
                    .dcomp_device
                    .CreateVisual()
                    .map_err(|e| format!("CreateVisual gagal: {e}"))?;
                dcomp_visual
                    .SetContent(&swap_chain)
                    .map_err(|e| format!("Visual SetContent gagal: {e}"))?;
                dcomp_target
                    .SetRoot(&dcomp_visual)
                    .map_err(|e| format!("Target SetRoot gagal: {e}"))?;
                res.dcomp_device
                    .Commit()
                    .map_err(|e| format!("DComp Commit gagal: {e}"))?;

                let target_bitmap = Some(Self::bind_backbuffer(&res.d2d_context, &swap_chain, dpi)?);

                Ok(Self {
                    hwnd,
                    width_px: w,
                    height_px: h,
                    dpi,
                    swap_chain,
                    dcomp_target,
                    dcomp_visual,
                    target_bitmap,
                    has_presented_once: false,
                })
            }
        }

        fn bind_backbuffer(
            ctx: &ID2D1DeviceContext,
            swap_chain: &IDXGISwapChain1,
            dpi: f32,
        ) -> Result<ID2D1Bitmap1, String> {
            unsafe {
                let surface: IDXGISurface = swap_chain
                    .GetBuffer(0)
                    .map_err(|e| format!("SwapChain GetBuffer gagal: {e}"))?;
                let props = D2D1_BITMAP_PROPERTIES1 {
                    pixelFormat: D2D1_PIXEL_FORMAT {
                        format: DXGI_FORMAT_B8G8R8A8_UNORM,
                        alphaMode: D2D1_ALPHA_MODE_PREMULTIPLIED,
                    },
                    dpiX: dpi,
                    dpiY: dpi,
                    bitmapOptions: D2D1_BITMAP_OPTIONS_TARGET | D2D1_BITMAP_OPTIONS_CANNOT_DRAW,
                    ..Default::default()
                };
                ctx.CreateBitmapFromDxgiSurface(&surface, Some(&props))
                    .map_err(|e| format!("CreateBitmapFromDxgiSurface gagal: {e}"))
            }
        }

        pub fn resize(
            &mut self,
            res: &D2DDeviceResources,
            width_px: u32,
            height_px: u32,
            dpi: f32,
        ) -> Result<(), String> {
            let w = width_px.max(1);
            let h = height_px.max(1);
            if w == self.width_px && h == self.height_px && (dpi - self.dpi).abs() < 0.5 {
                return Ok(());
            }
            unsafe {
                // Release backbuffer reference before ResizeBuffers while keeping the DComp target intact
                res.d2d_context.SetTarget(None);
                self.target_bitmap = None;
                self.swap_chain
                    .ResizeBuffers(2, w, h, DXGI_FORMAT_B8G8R8A8_UNORM, DXGI_SWAP_CHAIN_FLAG(0))
                    .map_err(|e| format!("SwapChain ResizeBuffers gagal: {e}"))?;
                let bmp = Self::bind_backbuffer(&res.d2d_context, &self.swap_chain, dpi)?;
                self.target_bitmap = Some(bmp);
                self.width_px = w;
                self.height_px = h;
                self.dpi = dpi;
                self.has_presented_once = false;
                let _ = res.dcomp_device.Commit();
            }
            Ok(())
        }

        pub fn present_dirty(&mut self, dirty_rects: &[RECT]) -> windows::core::Result<()> {
            unsafe {
                if !self.has_presented_once || dirty_rects.is_empty() {
                    let params = DXGI_PRESENT_PARAMETERS::default();
                    let hr = self.swap_chain.Present1(1, DXGI_PRESENT(0), &params);
                    if hr.is_ok() {
                        self.has_presented_once = true;
                    }
                    hr.ok()
                } else {
                    let mut clamped: Vec<RECT> = dirty_rects
                        .iter()
                        .filter_map(|r| {
                            let left = r.left.clamp(0, self.width_px as i32);
                            let top = r.top.clamp(0, self.height_px as i32);
                            let right = r.right.clamp(left, self.width_px as i32);
                            let bottom = r.bottom.clamp(top, self.height_px as i32);
                            if right > left && bottom > top {
                                Some(RECT {
                                    left,
                                    top,
                                    right,
                                    bottom,
                                })
                            } else {
                                None
                            }
                        })
                        .collect();
                    if clamped.is_empty() {
                        return Ok(());
                    }
                    let params = DXGI_PRESENT_PARAMETERS {
                        DirtyRectsCount: clamped.len() as u32,
                        pDirtyRects: clamped.as_mut_ptr(),
                        pScrollRect: std::ptr::null_mut(),
                        pScrollOffset: std::ptr::null_mut(),
                    };
                    self.swap_chain.Present1(1, DXGI_PRESENT(0), &params).ok()
                }
            }
        }
    }
}
