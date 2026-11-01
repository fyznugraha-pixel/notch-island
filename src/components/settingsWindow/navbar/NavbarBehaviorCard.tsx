import React, { useState } from "react";
import { NavbarConfig } from "../../../types/navbar";
import { Sliders, RotateCcw, AlertTriangle } from "lucide-react";

interface NavbarBehaviorCardProps {
  config: NavbarConfig;
  onChange: (patch: Partial<NavbarConfig>) => void;
  onReset: () => void;
  isLightMode?: boolean;
}

export const NavbarBehaviorCard: React.FC<NavbarBehaviorCardProps> = ({
  config,
  onChange,
  onReset,
  isLightMode = false,
}) => {
  const [showResetConfirm, setShowResetConfirm] = useState(false);

  const cardBg = isLightMode
    ? "bg-white/70 border-black/[0.08]"
    : "bg-white/[0.03] border-white/[0.07]";
  const textTitle = isLightMode ? "text-neutral-900" : "text-white";
  const textSub = isLightMode ? "text-neutral-500" : "text-zinc-400";

  const renderToggleRow = (
    title: string,
    desc: string,
    value: boolean,
    onToggle: () => void,
    warning?: string
  ) => (
    <div className="flex items-center justify-between py-2 border-b border-white/[0.05] last:border-b-0">
      <div className="flex flex-col pr-4">
        <span className={`text-[12.5px] font-medium ${textTitle}`}>{title}</span>
        <span className={`text-[11px] ${textSub}`}>{desc}</span>
        {warning && (
          <span className="flex items-center gap-1 text-[10.5px] text-amber-500/90 mt-1">
            <AlertTriangle size={12} />
            {warning}
          </span>
        )}
      </div>
      <button
        type="button"
        onClick={onToggle}
        className={`relative w-10 h-5 rounded-full transition-colors shrink-0 cursor-pointer ${
          value ? "bg-[#0a84ff]" : isLightMode ? "bg-black/20" : "bg-white/20"
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
    <div className={`flex flex-col gap-4 p-4 rounded-[16px] border ${cardBg}`}>
      {/* Title */}
      <div className="flex items-center gap-3">
        <div className="w-9 h-9 rounded-[10px] bg-emerald-500/10 text-emerald-500 flex items-center justify-center shrink-0">
          <Sliders size={18} />
        </div>
        <div className="flex flex-col">
          <span className={`text-[13px] font-semibold ${textTitle}`}>
            Perilaku & Interaksi
          </span>
          <span className={`text-[11px] ${textSub}`}>
            Pengaturan auto-hide, efek perbesaran dan sinkronisasi taskbar Windows
          </span>
        </div>
      </div>

      {/* Toggle Rows */}
      <div className="flex flex-col">
        {renderToggleRow(
          "Sembunyikan Otomatis (Auto-Hide)",
          "Dock meluncur keluar layar hingga kursor menyentuh tepi bawah",
          config.autoHide,
          () => onChange({ autoHide: !config.autoHide })
        )}

        {renderToggleRow(
          "Pratinjau Jendela (Window Previews)",
          "Menampilkan thumbnail live aplikasi saat kursor diarahkan ke ikon",
          config.windowPreviews,
          () => onChange({ windowPreviews: !config.windowPreviews })
        )}

        {renderToggleRow(
          "Perbesar Ikon saat Hover (Magnify)",
          "Efek pembesaran ikon yang halus dan interaktif saat disentuh",
          config.magnify,
          () => onChange({ magnify: !config.magnify })
        )}

        {renderToggleRow(
          "Tampilkan Label Aplikasi",
          "Teks nama aplikasi di bawah atau di samping ikon",
          config.appLabels,
          () => onChange({ appLabels: !config.appLabels })
        )}

        {/* 24-Hour Clock Toggle */}
        <div className="flex items-center justify-between py-2 border-b border-white/[0.05]">
          <div className="flex flex-col">
            <span className={`text-[12.5px] font-medium ${textTitle}`}>
              Format Jam 24 Jam
            </span>
            <span className={`text-[11px] ${textSub}`}>
              Gunakan format 24 jam (23:26) atau 12 jam (11:26 PM)
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
          "Sembunyikan Taskbar Asli Windows",
          "Gantikan taskbar bawaan sepenuhnya dengan Gili Navbar",
          config.hideWindowsTaskbar,
          () => onChange({ hideWindowsTaskbar: !config.hideWindowsTaskbar }),
          "Taskbar otomatis dikembalikan utuh jika Gili ditutup atau fitur dinonaktifkan."
        )}
      </div>

      {/* Reset to Default */}
      <div className="pt-2 border-t border-white/[0.06] flex items-center justify-between">
        <span className={`text-[11.5px] ${textSub}`}>
          Kembalikan seluruh preferensi navbar ke setelan pabrik
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
              Ya, Reset
            </button>
            <button
              type="button"
              onClick={() => setShowResetConfirm(false)}
              className={`px-2 py-1 rounded-[8px] text-[11px] transition-colors cursor-pointer ${
                isLightMode ? "text-neutral-600" : "text-zinc-400 hover:text-white"
              }`}
            >
              Batal
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
            <span>Reset ke Default</span>
          </button>
        )}
      </div>
    </div>
  );
};
