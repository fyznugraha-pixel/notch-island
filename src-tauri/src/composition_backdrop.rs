use std::sync::Mutex;
use windows::core::{implement, Interface, Result, GUID, HSTRING, PCWSTR};
use windows::Foundation::Numerics::Vector2;
use windows::Foundation::{IPropertyValue, PropertyValue};
use windows::Graphics::Effects::{
    IGraphicsEffect, IGraphicsEffectSource, IGraphicsEffectSource_Impl, IGraphicsEffect_Impl,
};
use windows::System::DispatcherQueueController;
use windows::UI::Composition::Desktop::DesktopWindowTarget;
use windows::UI::Composition::{
    CompositionEffectSourceParameter, CompositionRoundedRectangleGeometry, Compositor, SpriteVisual,
};
use windows::Win32::Foundation::{BOOL, E_INVALIDARG, HWND};
use windows::Win32::Graphics::Direct2D::Common::D2D1_BORDER_MODE_HARD;
use windows::Win32::Graphics::Direct2D::{
    CLSID_D2D1GaussianBlur, D2D1_GAUSSIANBLUR_OPTIMIZATION_BALANCED,
    D2D1_GAUSSIANBLUR_PROP_BORDER_MODE, D2D1_GAUSSIANBLUR_PROP_OPTIMIZATION,
    D2D1_GAUSSIANBLUR_PROP_STANDARD_DEVIATION,
};
use windows::Win32::System::WinRT::Composition::ICompositorDesktopInterop;
use windows::Win32::System::WinRT::Graphics::Direct2D::{
    IGraphicsEffectD2D1Interop, IGraphicsEffectD2D1Interop_Impl,
    GRAPHICS_EFFECT_PROPERTY_MAPPING, GRAPHICS_EFFECT_PROPERTY_MAPPING_DIRECT,
};
use windows::Win32::System::WinRT::{
    CreateDispatcherQueueController, DispatcherQueueOptions, RoInitialize, DQTAT_COM_STA,
    DQTYPE_THREAD_CURRENT, RO_INIT_SINGLETHREADED,
};

#[implement(IGraphicsEffect, IGraphicsEffectSource, IGraphicsEffectD2D1Interop)]
struct GaussianBlurEffect {
    name: Mutex<HSTRING>,
    source: IGraphicsEffectSource,
    blur_amount: f32,
}

impl GaussianBlurEffect {
    fn new(source: IGraphicsEffectSource, blur_amount: f32) -> Self {
        Self {
            name: Mutex::new(HSTRING::from("GiliBackdropBlur")),
            source,
            blur_amount,
        }
    }
}

impl IGraphicsEffectSource_Impl for GaussianBlurEffect_Impl {}

impl IGraphicsEffect_Impl for GaussianBlurEffect_Impl {
    fn Name(&self) -> Result<HSTRING> {
        Ok(self.name.lock().map(|g| g.clone()).unwrap_or_default())
    }

    fn SetName(&self, name: &HSTRING) -> Result<()> {
        if let Ok(mut g) = self.name.lock() {
            *g = name.clone();
        }
        Ok(())
    }
}

impl IGraphicsEffectD2D1Interop_Impl for GaussianBlurEffect_Impl {
    fn GetEffectId(&self) -> Result<GUID> {
        Ok(CLSID_D2D1GaussianBlur)
    }

    fn GetNamedPropertyMapping(
        &self,
        name: &PCWSTR,
        index: *mut u32,
        mapping: *mut GRAPHICS_EFFECT_PROPERTY_MAPPING,
    ) -> Result<()> {
        let wide = unsafe { name.as_wide() };
        let prop = String::from_utf16_lossy(wide);
        let mapped_idx = match prop.as_str() {
            "BlurAmount" => D2D1_GAUSSIANBLUR_PROP_STANDARD_DEVIATION.0 as u32,
            "Optimization" => D2D1_GAUSSIANBLUR_PROP_OPTIMIZATION.0 as u32,
            "BorderMode" => D2D1_GAUSSIANBLUR_PROP_BORDER_MODE.0 as u32,
            _ => return Err(E_INVALIDARG.into()),
        };
        unsafe {
            if !index.is_null() {
                *index = mapped_idx;
            }
            if !mapping.is_null() {
                *mapping = GRAPHICS_EFFECT_PROPERTY_MAPPING_DIRECT;
            }
        }
        Ok(())
    }

    fn GetPropertyCount(&self) -> Result<u32> {
        Ok(3)
    }

    fn GetProperty(&self, index: u32) -> Result<IPropertyValue> {
        let val = match index {
            0 => PropertyValue::CreateSingle(self.blur_amount)?,
            1 => PropertyValue::CreateUInt32(D2D1_GAUSSIANBLUR_OPTIMIZATION_BALANCED.0 as u32)?,
            2 => PropertyValue::CreateUInt32(D2D1_BORDER_MODE_HARD.0 as u32)?,
            _ => return Err(E_INVALIDARG.into()),
        };
        val.cast()
    }

    fn GetSource(&self, index: u32) -> Result<IGraphicsEffectSource> {
        if index == 0 {
            Ok(self.source.clone())
        } else {
            Err(E_INVALIDARG.into())
        }
    }

    fn GetSourceCount(&self) -> Result<u32> {
        Ok(1)
    }
}

/// Hardware-composited behind-window blur visual clipped to an exact rounded pill path.
pub struct CompositionRoundedBackdrop {
    _dq_controller: DispatcherQueueController,
    _compositor: Compositor,
    _target: DesktopWindowTarget,
    sprite: SpriteVisual,
    rect_geom: CompositionRoundedRectangleGeometry,
}

impl CompositionRoundedBackdrop {
    pub fn attach(hwnd: HWND) -> Result<Self> {
        unsafe {
            let _ = RoInitialize(RO_INIT_SINGLETHREADED);
        }
        let dq_opts = DispatcherQueueOptions {
            dwSize: std::mem::size_of::<DispatcherQueueOptions>() as u32,
            threadType: DQTYPE_THREAD_CURRENT,
            apartmentType: DQTAT_COM_STA,
        };
        let dq_controller = unsafe { CreateDispatcherQueueController(dq_opts)? };
        let compositor = Compositor::new()?;
        let interop: ICompositorDesktopInterop = compositor.cast()?;
        let target = unsafe { interop.CreateDesktopWindowTarget(hwnd, BOOL(0))? };

        let source_param = CompositionEffectSourceParameter::Create(&HSTRING::from("backdrop"))?;
        let blur_effect: IGraphicsEffect =
            GaussianBlurEffect::new(source_param.cast()?, 11.0).into();
        let factory = compositor.CreateEffectFactory(&blur_effect)?;
        let effect_brush = factory.CreateBrush()?;
        let host_backdrop = compositor.CreateHostBackdropBrush()?;
        effect_brush.SetSourceParameter(&HSTRING::from("backdrop"), &host_backdrop)?;

        let rect_geom = compositor.CreateRoundedRectangleGeometry()?;
        let clip = compositor.CreateGeometricClipWithGeometry(&rect_geom)?;

        let sprite = compositor.CreateSpriteVisual()?;
        sprite.SetBrush(&effect_brush)?;
        sprite.SetClip(&clip)?;
        sprite.SetIsVisible(false)?;
        target.SetRoot(&sprite)?;

        Ok(Self {
            _dq_controller: dq_controller,
            _compositor: compositor,
            _target: target,
            sprite,
            rect_geom,
        })
    }

    pub fn update(&self, width: i32, height: i32, radius: i32, visible: bool) {
        if !visible || width <= 2 || height <= 2 {
            let _ = self.sprite.SetIsVisible(false);
            return;
        }
        // Tuck 0.5px inside CSS border ring so subpixel blur never bleeds outside pill edges.
        let inset = if radius > 2 && width > 8 && height > 8 {
            0.5_f32
        } else {
            0.0_f32
        };
        let clip_w = (width as f32 - inset * 2.0).max(1.0);
        let clip_h = (height as f32 - inset * 2.0).max(1.0);
        let clamped_r = (radius as f32).max(0.0).min(clip_w * 0.5).min(clip_h * 0.5);

        let _ = self.sprite.SetSize(Vector2 {
            X: width as f32,
            Y: height as f32,
        });
        let _ = self.rect_geom.SetOffset(Vector2 { X: inset, Y: inset });
        let _ = self.rect_geom.SetSize(Vector2 {
            X: clip_w,
            Y: clip_h,
        });
        let _ = self.rect_geom.SetCornerRadius(Vector2 {
            X: clamped_r,
            Y: clamped_r,
        });
        let _ = self.sprite.SetIsVisible(true);
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use windows::core::w;
    use windows::Win32::Foundation::{LPARAM, LRESULT, WPARAM};
    use windows::Win32::System::LibraryLoader::GetModuleHandleW;
    use windows::Win32::UI::WindowsAndMessaging::{
        CreateWindowExW, DefWindowProcW, DestroyWindow, RegisterClassW, HMENU, WNDCLASSW,
        WS_EX_NOACTIVATE, WS_EX_NOREDIRECTIONBITMAP, WS_EX_TOOLWINDOW, WS_POPUP,
    };

    unsafe extern "system" fn test_wndproc(
        hwnd: HWND,
        msg: u32,
        wparam: WPARAM,
        lparam: LPARAM,
    ) -> LRESULT {
        DefWindowProcW(hwnd, msg, wparam, lparam)
    }

    #[test]
    fn composition_rounded_host_backdrop_initializes_on_win11() {
        let handle = std::thread::spawn(|| unsafe {
            let hinst = GetModuleHandleW(None).unwrap_or_default();
            let cls = w!("GiliCompBackdropTestCls");
            let wc = WNDCLASSW {
                lpfnWndProc: Some(test_wndproc),
                hInstance: hinst.into(),
                lpszClassName: cls,
                ..Default::default()
            };
            let _ = RegisterClassW(&wc);
            let hwnd = CreateWindowExW(
                WS_EX_NOREDIRECTIONBITMAP | WS_EX_TOOLWINDOW | WS_EX_NOACTIVATE,
                cls,
                w!("TestComp"),
                WS_POPUP,
                -10000,
                -10000,
                200,
                60,
                HWND::default(),
                HMENU::default(),
                hinst,
                None,
            )
            .expect("create test HWND");

            let comp = CompositionRoundedBackdrop::attach(hwnd)
                .expect("WinRT Composition HostBackdrop + GaussianBlur + RoundedClip should attach cleanly");
            comp.update(800, 60, 24, true);
            comp.update(0, 0, 0, false);
            drop(comp);
            let _ = DestroyWindow(hwnd);
        });
        handle.join().expect("test thread panicked");
    }
}
