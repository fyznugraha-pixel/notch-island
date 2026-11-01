import React from "react";
import { NavbarConfig, NavbarPosition } from "../../../types/navbar";
import { Monitor, ArrowDown, ArrowUp, ArrowLeft, ArrowRight } from "lucide-react";
import { MonitorSelector } from "../../ui/settings/MonitorSelector";

interface NavbarPositionCardProps {
  config: NavbarConfig;
  onChange: (patch: Partial<NavbarConfig>) => void;
  isLightMode?: boolean;
}

export const NavbarPositionCard: React.FC<NavbarPositionCardProps> = ({
  config,
  onChange,
  isLightMode = false,
}) => {
  const cardBg = isLightMode
    ? "bg-white/70 border-black/[0.08]"
    : "bg-white/[0.03] border-white/[0.07]";
  const textTitle = isLightMode ? "text-neutral-900" : "text-white";
  const textSub = isLightMode ? "text-neutral-500" : "text-zinc-400";

  const positions: { id: NavbarPosition; label: string; icon: React.ReactNode }[] = [
    { id: "bottom", label: "Bawah", icon: <ArrowDown size={14} /> },
    { id: "top", label: "Atas", icon: <ArrowUp size={14} /> },
    { id: "left", label: "Kiri", icon: <ArrowLeft size={14} /> },
    { id: "right", label: "Kanan", icon: <ArrowRight size={14} /> },
  ];

  return (
    <div className={`flex flex-col gap-4 p-4 rounded-[16px] border ${cardBg}`}>
      {/* Title */}
      <div className="flex items-center gap-3">
        <div className="w-9 h-9 rounded-[10px] bg-indigo-500/10 text-indigo-500 flex items-center justify-center shrink-0">
          <Monitor size={18} />
        </div>
        <div className="flex flex-col">
          <span className={`text-[13px] font-semibold ${textTitle}`}>
            Posisi Layar & Monitor
          </span>
          <span className={`text-[11px] ${textSub}`}>
            Tentukan tepi monitor tempat navbar ditampilkan
          </span>
        </div>
      </div>

      {/* Position Selector */}
      <div className="flex flex-col gap-1.5">
        <label className={`text-[11.5px] font-medium ${textTitle}`}>
          Tepi Layar
        </label>
        <div className="grid grid-cols-4 gap-2">
          {positions.map((pos) => {
            const isSelected = config.position === pos.id;
            return (
              <button
                key={pos.id}
                type="button"
                onClick={() => onChange({ position: pos.id })}
                className={`flex items-center justify-center gap-1.5 py-2 px-3 rounded-[10px] border text-[11.5px] font-medium transition-all cursor-pointer ${
                  isSelected
                    ? "bg-[#0a84ff] border-[#0a84ff] text-white shadow-sm"
                    : isLightMode
                    ? "bg-black/[0.03] border-black/[0.06] hover:bg-black/[0.06] text-neutral-700"
                    : "bg-white/[0.04] border-white/[0.06] hover:bg-white/[0.08] text-zinc-300"
                }`}
              >
                {pos.icon}
                <span>{pos.label}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Monitor Selector */}
      <div className="pt-2 border-t border-white/[0.06]">
        <MonitorSelector
          value={config.monitorId || "primary"}
          onChange={(monitorId) => onChange({ monitorId })}
          isLightMode={isLightMode}
        />
      </div>
    </div>
  );
};

