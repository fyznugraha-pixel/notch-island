import React, { useState } from "react";
import { NavbarConfig } from "../../../types/navbar";
import { Sliders, RotateCcw, AlertTriangle, Lock } from "lucide-react";
import { Language } from "../../../services/i18n";
import { NavbarOptionGroup } from "./NavbarOptionGroup";

interface NavbarBehaviorCardProps {
  config: NavbarConfig;
  onChange: (patch: Partial<NavbarConfig>) => void;
  onReset: () => void;
  isProLocked?: boolean;
  onRequirePro?: () => void;
  isLightMode?: boolean;
  optLanguage?: Language;
}

export const NavbarBehaviorCard: React.FC<NavbarBehaviorCardProps> = ({
  config,
  onChange,
  onReset,
  isProLocked = false,
  onRequirePro,
  isLightMode = false,
  optLanguage = "id",
}) => {
  const isId = optLanguage === "id";
  const [showResetConfirm, setShowResetConfirm] = useState(false);

  const cardBg = isLightMode
    ? "bg-white border-black/[0.08] shadow-[0_2px_10px_rgba(0,0,0,0.03)]"
    : "bg-[#121318] border-white/[0.07] shadow-[0_4px_20px_rgba(0,0,0,0.28)]";
  const textTitle = isLightMode ? "text-neutral-900" : "text-white";
  const textSub = isLightMode ? "text-neutral-600" : "text-zinc-400";

  const renderToggleRow = (
    title: string,
    desc: string,
    value: boolean,
    onToggle: () => void,
    warning?: string,
    requiresPro?: boolean
  ) => (
    <div
      className={`flex items-center justify-between py-2 border-b last:border-b-0 ${
        isLightMode ? "border-black/[0.06]" : "border-white/[0.05]"
      }`}
    >
      <div className="flex flex-col pr-4">
        <div className="flex items-center gap-2">
          <span className={`text-[12.5px] font-medium ${textTitle}`}>{title}</span>
          {requiresPro && (
            <span
              className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded-[6px] text-[9.5px] font-bold tracking-wide border ${
                isLightMode
                  ? "bg-[#eff6ff] text-[#1d4ed8] border-blue-600/25"
                  : "bg-[#0a84ff]/15 text-[#93c5fd] border-[#60a5fa]/30"
              }`}
            >
              <Lock size={9} strokeWidth={2.5} aria-hidden="true" />
              <span>PRO</span>
            </span>
          )}
        </div>
        <span className={`text-[11px] ${textSub}`}>{desc}</span>
        {warning && (
          <span
            className={`flex items-center gap-1 text-[10.5px] mt-1 ${
              isLightMode ? "text-amber-700" : "text-amber-500/90"
            }`}
          >
            <AlertTriangle size={12} aria-hidden="true" />
            {warning}
          </span>
        )}
      </div>
      <button
        type="button"
        aria-label={title}
        aria-pressed={value}
        onClick={onToggle}
        style={{
          backgroundColor: value ? config.accent : undefined,
        }}
        className={`relative w-10 h-5 rounded-full transition-colors shrink-0 cursor-pointer focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#60a5fa] ${
          value ? "" : isLightMode ? "bg-black/20" : "bg-white/20"
        }`}
      >
        <span
          className={`absolute top-0.5 left-0.5 w-4 h-4 rounded-full bg-white shadow-sm transition-transform ${
            value ? "translate-x-5" : "translate-x-0"
          }`}
        />
      </button>
    </div>
  );

  return (
    <div className={`flex flex-col gap-4 p-5 rounded-[18px] border ${cardBg}`}>
      {/* Title */}
      <div className="flex items-center gap-3">
        <div className="w-9 h-9 rounded-[10px] bg-emerald-500/10 text-emerald-500 flex items-center justify-center shrink-0">
          <Sliders size={18} />
        </div>
        <div className="flex flex-col">
          <span className={`text-[13px] font-semibold ${textTitle}`}>
            {isId ? "Perilaku & Interaksi" : "Behavior & Interaction"}
          </span>
          <span className={`text-[11px] ${textSub}`}>
            {isId
              ? "Atur auto-hide, efek zoom kursor, & integrasi sama taskbar Windows"
              : "Configure auto-hide, cursor magnification & Windows taskbar integration"}
          </span>
        </div>
      </div>

      {/* Toggle Rows */}
      <div className="flex flex-col">
        {renderToggleRow(
          isId ? "Sembunyikan Otomatis (Auto-Hide)" : "Auto-Hide Dock",
          isId
            ? "Dock bakal ngumpet otomatis, muncul lagi pas kursor lo mepet ke pinggir layar"
            : "Automatically hide dock when inactive, reveal when cursor hovers near screen edge",
          config.autoHide,
          () => onChange({ autoHide: !config.autoHide })
        )}

        {config.autoHide && (
          <NavbarOptionGroup
            label={isId ? "Pilihan Sembunyi Otomatis:" : "Auto-Hide Behavior:"}
            activeSummary={
              (config.autoHideMode || "normal") === "normal"
                ? isId
                  ? "Normal • Tampil di Desktop"
                  : "Normal • Visible on Desktop"
                : isId
                ? "Only Maxsize • Selalu Sembunyi"
                : "Only Maxsize • Always Hidden"
            }
            value={config.autoHideMode || "normal"}
            onChange={(autoHideMode) => onChange({ autoHideMode })}
            isLightMode={isLightMode}
            options={[
              {
                value: "normal",
                title: isId ? "Normal (Cerdas)" : "Normal",
                desc: isId
                  ? "Pas di desktop tetap muncul. Otomatis ngumpet pas ada jendela terbuka / maximized."
                  : "Stays visible on desktop. Auto-hides when windows are open or maximized.",
              },
              {
                value: "maxsize",
                title: "Only Maxsize",
                desc: isId
                  ? "Di desktop pun tetap ke-hide. Selalu ngumpet dan muncul pas kursor mepet layar."
                  : "Hides even on desktop. Always stays hidden until cursor moves to screen edge.",
              },
            ]}
          />
        )}

        <NavbarOptionGroup
          label={isId ? "Animasi Buka & Tutup Jendela:" : "Window & Module Animation:"}
          activeSummary={
            (config.windowAnimation || "genie") === "genie"
              ? isId
                ? "Genie • Sedot ke Tombol"
                : "Genie • Suction into Button"
              : isId
              ? "Normal • Hemat RAM"
              : "Normal • Light RAM"
          }
          value={config.windowAnimation || "genie"}
          onChange={(windowAnimation) => onChange({ windowAnimation })}
          isLightMode={isLightMode}
          options={[
            {
              value: "genie",
              title: isId ? "Genie (Sedot macOS)" : "Genie (macOS Suction)",
              desc: isId
                ? "Jendela, modul, & flyout tersedot halus ke tombolnya. Butuh cache snapshot tambahan di RAM."
                : "Windows, modules & flyouts funnel into their button. Uses extra snapshot cache in RAM.",
            },
            {
              value: "normal",
              title: isId ? "Normal (Ringan)" : "Normal (Light)",
              desc: isId
                ? "Animasi bawaan Windows & transisi standar. Lebih ringan tanpa cache snapshot di RAM."
                : "Uses native Windows minimize animation & standard transitions with zero snapshot cache.",
            },
          ]}
        />

        {renderToggleRow(
          isId ? "Pratinjau Jendela (Window Previews)" : "Window Previews",
          isId
            ? "Intip thumbnail live aplikasi pas kursor lo ngarah ke ikon"
            : "Peek live window thumbnails when hovering app icons",
          config.windowPreviews,
          () => onChange({ windowPreviews: !config.windowPreviews })
        )}

        {renderToggleRow(
          isId ? "Perbesar Ikon saat Hover (Magnify)" : "Hover Magnification (Magnify)",
          isId
            ? "Efek zoom halus ala macOS pas kursor ngedeketin ikon"
            : "Smooth macOS-style magnification as cursor gets close to icons",
          config.magnify,
          () => onChange({ magnify: !config.magnify })
        )}

        {renderToggleRow(
          isId ? "Tampilkan Label Aplikasi" : "Show App Tooltips",
          isId
            ? "Tampilin nama aplikasi biar gak bingung nebak ikon"
            : "Display app names on hover so you never guess an icon",
          config.appLabels,
          () => onChange({ appLabels: !config.appLabels })
        )}

        {/* 24-Hour Clock Toggle */}
        <div
          className={`flex items-center justify-between py-2 border-b ${
            isLightMode ? "border-black/[0.06]" : "border-white/[0.05]"
          }`}
        >
          <div className="flex flex-col">
            <span className={`text-[12.5px] font-medium ${textTitle}`}>
              {isId ? "Format Jam 24 Jam" : "24-Hour Time Format"}
            </span>
            <span className={`text-[11px] ${textSub}`}>
              {isId
                ? "Pilih mau format 24 jam (23:26) atau 12 jam (11:26 PM)"
                : "Toggle between 24-hour (23:26) or 12-hour (11:26 PM) format"}
            </span>
          </div>
          <div
            className={`flex items-center p-0.5 rounded-[8px] border ${
              isLightMode
                ? "bg-black/[0.04] border-black/[0.06]"
                : "bg-white/[0.05] border-white/[0.06]"
            }`}
          >
            <button
              type="button"
              onClick={() => onChange({ clock24h: true })}
              className={`px-2 py-0.5 rounded-[6px] text-[11px] font-medium transition-all ${
                config.clock24h
                  ? "bg-[#0a84ff] text-white shadow-sm"
                  : isLightMode
                  ? "text-neutral-600"
                  : "text-zinc-400"
              }`}
            >
              24h
            </button>
            <button
              type="button"
              onClick={() => onChange({ clock24h: false })}
              className={`px-2 py-0.5 rounded-[6px] text-[11px] font-medium transition-all ${
                !config.clock24h
                  ? "bg-[#0a84ff] text-white shadow-sm"
                  : isLightMode
                  ? "text-neutral-600"
                  : "text-zinc-400"
              }`}
            >
              12h
            </button>
          </div>
        </div>

        {/* Hide Windows Taskbar */}
        {renderToggleRow(
          isId ? "Sembunyikan Taskbar Asli Windows" : "Hide Native Windows Taskbar",
          isId
            ? "Auto-hide taskbar bawaan Windows biar gak dobel & makin clean"
            : "Auto-hide Windows taskbar to eliminate clutter & avoid duplicate bars",
          !isProLocked && config.hideWindowsTaskbar,
          () => {
            if (isProLocked) {
              onRequirePro?.();
              return;
            }
            onChange({ hideWindowsTaskbar: !config.hideWindowsTaskbar });
          },
          isId
            ? "Tenang, taskbar bawaan Windows bakal balik normal otomatis kalau Gili ditutup."
            : "Don't worry, the Windows taskbar restores automatically when Gili closes.",
          isProLocked
        )}

        {/* Jendela Sistem Taskbar (Per-Window Switch) */}
        <div
          className={`mt-4 pt-3 border-t flex flex-col gap-2.5 ${
            isLightMode ? "border-black/[0.08]" : "border-white/[0.08]"
          }`}
        >
          <div className="flex flex-col">
            <span className={`text-[12.5px] font-semibold ${textTitle}`}>
              {isId ? "Jendela Sistem Taskbar (Flyout)" : "Taskbar System Flyouts"}
            </span>
            <span className={`text-[11px] ${textSub}`}>
              {isId
                ? "Pilih untuk tiap fungsi: gunakan jendela kustom Gili atau jendela bawaan Windows asli."
                : "Choose per function: use Gili custom flyouts or native Windows surfaces."}
            </span>
          </div>

          <div
            className={`flex flex-col gap-1.5 p-2.5 rounded-[12px] border ${
              isLightMode
                ? "bg-black/[0.025] border-black/[0.06]"
                : "bg-white/[0.02] border-white/[0.05]"
            }`}
          >
            {renderToggleRow(
              isId ? "1. Output Suara & Mixer" : "1. Sound Output & Mixer",
              isId
                ? "Pakai jendela Gili (Board 95/97) untuk volume & output suara"
                : "Use Gili flyout (Board 95/97) for sound devices & volume mixer",
              !!config.useGiliVolumeOutput,
              () => onChange({ useGiliVolumeOutput: !config.useGiliVolumeOutput })
            )}

            {renderToggleRow(
              isId ? "2. Pengaturan Cepat" : "2. Quick Settings",
              isId
                ? "Pakai jendela Gili (Board 90/94) untuk Wi-Fi, Bluetooth, media, & baterai"
                : "Use Gili flyout (Board 90/94) for toggles, media, & battery",
              !!config.useGiliQuickSettings,
              () => onChange({ useGiliQuickSettings: !config.useGiliQuickSettings })
            )}

            {renderToggleRow(
              isId ? "3. Notifikasi + Kalender" : "3. Notifications + Calendar",
              isId
                ? "Pakai jendela Gili (Board 96/98) untuk daftar notifikasi & kalender"
                : "Use Gili flyout (Board 96/98) for notifications & calendar",
              !!config.useGiliNotificationsCalendar,
              () =>
                onChange({
                  useGiliNotificationsCalendar: !config.useGiliNotificationsCalendar,
                })
            )}

            {renderToggleRow(
              isId ? "4. Cari" : "4. Search",
              isId
                ? "Pakai jendela Gili (Board 88/92) untuk pencarian aplikasi & file"
                : "Use Gili flyout (Board 88/92) for system & web search",
              !!config.useGiliSearch,
              () => onChange({ useGiliSearch: !config.useGiliSearch })
            )}

            {renderToggleRow(
              isId ? "5. Menu Mulai" : "5. Start Menu",
              isId
                ? "Pakai jendela Gili (Board 87/91) untuk menu Mulai"
                : "Use Gili flyout (Board 87/91) for start menu",
              !!config.useGiliStart,
              () => onChange({ useGiliStart: !config.useGiliStart })
            )}

            {renderToggleRow(
              isId ? "6. Tray Tersembunyi" : "6. Hidden System Tray",
              isId
                ? "Aktif: pakai flyout Gili bertema. Nonaktif: buka tray overflow Windows (^) asli di dekat navbar."
                : "On: use Gili-themed tray flyout. Off: open native Windows tray overflow (^) anchored near the navbar.",
              !!config.useGiliTray,
              () => onChange({ useGiliTray: !config.useGiliTray })
            )}
          </div>

          {/* Kill-switch notice */}
          <div
            className={`flex items-center gap-2 p-2 rounded-[10px] border text-[11px] leading-relaxed ${
              isLightMode
                ? "bg-amber-500/12 border-amber-600/25 text-amber-900"
                : "bg-amber-500/10 border-amber-500/20 text-amber-300"
            }`}
          >
            <AlertTriangle
              size={14}
              className={`shrink-0 ${isLightMode ? "text-amber-600" : "text-amber-400"}`}
              aria-hidden="true"
            />
            <span>
              {isId
                ? "Kill-switch darurat: Tekan Ctrl+Alt+Shift+Backspace kapan saja untuk langsung menonaktifkan jendela Gili dan mengembalikan taskbar bawaan Windows."
                : "Emergency kill-switch: Press Ctrl+Alt+Shift+Backspace anytime to immediately deactivate Gili flyouts and restore the Windows taskbar."}
            </span>
          </div>
        </div>
      </div>

      {/* Reset to Default */}
      <div
        className={`pt-2 border-t flex items-center justify-between ${
          isLightMode ? "border-black/[0.07]" : "border-white/[0.06]"
        }`}
      >
        <span className={`text-[11.5px] ${textSub}`}>
          {isId
            ? "Balikin semua settingan taskbar ke default pabrik"
            : "Reset all dock settings back to defaults"}
        </span>
        {showResetConfirm ? (
          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={() => {
                onReset();
                setShowResetConfirm(false);
              }}
              className="px-2.5 py-1 rounded-[8px] bg-red-600 text-white text-[11px] font-medium hover:bg-red-700 transition-colors cursor-pointer"
            >
              {isId ? "Ya, Reset" : "Yes, Reset"}
            </button>
            <button
              type="button"
              onClick={() => setShowResetConfirm(false)}
              className={`px-2 py-1 rounded-[8px] text-[11px] transition-colors cursor-pointer ${
                isLightMode ? "text-neutral-600" : "text-zinc-400 hover:text-white"
              }`}
            >
              {isId ? "Batal" : "Cancel"}
            </button>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => setShowResetConfirm(true)}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-[9px] border text-[11px] font-medium transition-colors cursor-pointer ${
              isLightMode
                ? "bg-black/[0.03] border-black/[0.08] hover:bg-black/[0.06] text-neutral-700"
                : "bg-white/[0.04] border-white/[0.07] hover:bg-white/[0.08] text-zinc-300"
            }`}
          >
            <RotateCcw size={13} />
            <span>{isId ? "Reset ke Default" : "Reset to Defaults"}</span>
          </button>
        )}
      </div>
    </div>
  );
};

