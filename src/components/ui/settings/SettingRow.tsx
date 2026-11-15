import React from "react";

export interface SettingRowProps {
  icon: React.ReactNode;
  iconBgClass: string;
  iconColorClass: string;
  title: string;
  subtitle?: string;
  control: React.ReactNode;
  isLightMode?: boolean;
}

export const SettingRow: React.FC<SettingRowProps> = ({
  icon,
  iconBgClass,
  iconColorClass,
  title,
  subtitle,
  control,
  isLightMode,
}) => {
  const light =
    isLightMode ??
    (typeof document !== "undefined" &&
      document.documentElement.classList.contains("light"));

  return (
    <div
      className={`flex items-center justify-between gap-4 px-3.5 py-2.5 rounded-[12px] transition-colors min-h-[48px] ${
        light ? "hover:bg-black/[0.03]" : "hover:bg-white/[0.03]"
      }`}
    >
      <div className="flex items-center gap-3 min-w-0">
        <div
          className={`w-8 h-8 rounded-[9px] flex items-center justify-center shrink-0 ${iconBgClass} ${iconColorClass}`}
        >
          {icon}
        </div>
        <div className="flex flex-col min-w-0">
          <span
            className={`text-[13px] font-semibold leading-tight ${
              light ? "text-neutral-900" : "text-zinc-100"
            }`}
          >
            {title}
          </span>
          {subtitle && (
            <span
              className={`text-[11px] leading-snug mt-0.5 line-clamp-2 ${
                light ? "text-neutral-500" : "text-zinc-400"
              }`}
            >
              {subtitle}
            </span>
          )}
        </div>
      </div>

      <div className="shrink-0 flex items-center">{control}</div>
    </div>
  );
};

