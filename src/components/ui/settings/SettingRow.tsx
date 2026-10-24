import React from "react";

export interface SettingRowProps {
  icon: React.ReactNode;
  iconBgClass: string;
  iconColorClass: string;
  title: string;
  subtitle?: string;
  control: React.ReactNode;
}

export const SettingRow: React.FC<SettingRowProps> = ({
  icon,
  iconBgClass,
  iconColorClass,
  title,
  subtitle,
  control,
}) => {
  return (
    <div className="flex items-center justify-between px-3 py-1.5 rounded-[12px] hover:bg-white/[0.02] transition-colors min-h-[42px]">
      <div className="flex items-center gap-2.5 pr-2 min-w-0">
        <div
          className={`w-[32px] h-[32px] rounded-[9px] flex items-center justify-center shrink-0 ${iconBgClass} ${iconColorClass}`}
        >
          {icon}
        </div>
        <div className="flex flex-col min-w-0">
          <span className="text-[13px] font-semibold text-white leading-tight">
            {title}
          </span>
          {subtitle && (
            <span className="text-[10.5px] text-[#71717a] leading-tight mt-0.5 truncate">
              {subtitle}
            </span>
          )}
        </div>
      </div>

      <div className="shrink-0 flex items-center">{control}</div>
    </div>
  );
};
