import React from "react";
import { RefreshCw, X } from "lucide-react";
import { t } from "../../../services/i18n";

interface DropShelfReceivedBannerProps {
  count: number;
  deviceName: string;
  isLightMode?: boolean;
  onReceiveAgain: () => void;
  onDismiss: () => void;
}

export const DropShelfReceivedBanner: React.FC<DropShelfReceivedBannerProps> = ({
  count,
  deviceName,
  isLightMode = false,
  onReceiveAgain,
  onDismiss,
}) => {
  return (
    <div
      className={`h-7 px-3 mb-1.5 rounded-lg flex items-center justify-between shrink-0 animate-in fade-in slide-in-from-top-1 duration-200 ${
        isLightMode
          ? "bg-emerald-500/12 border border-emerald-600/25 text-[#1d1d1f]"
          : "bg-emerald-500/15 border border-emerald-500/25 text-white"
      }`}
    >
      <div className="flex items-center gap-2 min-w-0">
        <span className={`w-2 h-2 rounded-full shrink-0 ${isLightMode ? "bg-emerald-600" : "bg-emerald-400"}`} />
        <span className={`text-[11px] font-medium truncate ${isLightMode ? "text-emerald-800" : "text-emerald-200"}`}>
          {t("shelf_files_new_from", { count, device: deviceName || "HP" })}
        </span>
      </div>

      <div className="flex items-center gap-1.5 shrink-0 ml-2">
        <button
          type="button"
          onClick={onReceiveAgain}
          className={`h-5 px-2 rounded text-[10px] font-medium flex items-center gap-1 transition-colors cursor-pointer ${
            isLightMode
              ? "bg-emerald-500/15 hover:bg-emerald-500/25 text-emerald-800"
              : "bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-200 hover:text-white"
          }`}
        >
          <RefreshCw size={9} />
          <span>{t("shelf_receive_again")}</span>
        </button>
        <button
          type="button"
          onClick={onDismiss}
          className={`w-5 h-5 rounded flex items-center justify-center transition-colors cursor-pointer ${
            isLightMode
              ? "hover:bg-emerald-500/15 text-emerald-700"
              : "hover:bg-emerald-500/20 text-emerald-300 hover:text-white"
          }`}
        >
          <X size={10} strokeWidth={2.4} />
        </button>
      </div>
    </div>
  );
};
