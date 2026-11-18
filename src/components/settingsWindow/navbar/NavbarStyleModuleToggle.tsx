import React from "react";
import { LayoutGrid } from "lucide-react";

interface NavbarStyleModuleToggleProps {
  checked: boolean;
  onChange: (checked: boolean) => void;
  title: string;
  subtitle: string;
  isLightMode?: boolean;
}

export const NavbarStyleModuleToggle: React.FC<NavbarStyleModuleToggleProps> = ({
  checked,
  onChange,
  title,
  subtitle,
  isLightMode = false,
}) => (
  <label
    className={`flex items-center justify-between gap-3 px-3 py-2 rounded-[10px] border text-[12px] cursor-pointer select-none transition-colors focus-within:border-[#3882F6] ${
      isLightMode
        ? "bg-white border-black/[0.08] text-neutral-800 hover:bg-black/[0.02]"
        : "bg-[#111624] border-[#21293d] text-zinc-200 hover:border-[#2f8bff]/40"
    }`}
  >
    <span className="flex items-start gap-2 min-w-0">
      <LayoutGrid size={14} className="text-[#3882F6] shrink-0 mt-0.5" />
      <span className="flex flex-col gap-0.5 min-w-0">
        <span className="font-semibold truncate">{title}</span>
        <span className={`text-[10.5px] ${isLightMode ? "text-neutral-500" : "text-zinc-400"}`}>
          {subtitle}
        </span>
      </span>
    </span>
    <input
      type="checkbox"
      checked={checked}
      onChange={(e) => onChange(e.target.checked)}
      className="h-4 w-4 accent-[#3882F6] rounded cursor-pointer shrink-0"
    />
  </label>
);
