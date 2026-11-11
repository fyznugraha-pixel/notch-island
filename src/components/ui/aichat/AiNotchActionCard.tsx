import React from "react";
import {
  CheckSquare,
  CheckCircle2,
  FileText,
  Timer,
  Music,
  Droplets,
  ArrowRight,
} from "lucide-react";

interface AiNotchActionCardProps {
  action: {
    type: string;
    success: boolean;
    message: string;
    tabTarget?: string;
  };
  onNavigateTab?: (tab: string) => void;
}

export const AiNotchActionCard: React.FC<AiNotchActionCardProps> = ({
  action,
  onNavigateTab,
}) => {
  const { type, message, tabTarget } = action;

  const handleOpen = () => {
    if (tabTarget) {
      if (onNavigateTab) {
        onNavigateTab(tabTarget);
      } else {
        window.dispatchEvent(
          new CustomEvent("gili_navigate_tab", { detail: { tab: tabTarget } })
        );
      }
    }
  };

  const getTheme = () => {
    switch (type) {
      case "add_todo":
      case "complete_todo":
        return {
          icon: type === "complete_todo" ? CheckCircle2 : CheckSquare,
          bg: "bg-emerald-950/40 border-emerald-500/30 text-emerald-300",
          iconBg: "bg-emerald-500/20 text-emerald-400",
          btnText: "Buka To-Do",
        };
      case "create_note":
        return {
          icon: FileText,
          bg: "bg-blue-950/40 border-blue-500/30 text-blue-300",
          iconBg: "bg-blue-500/20 text-blue-400",
          btnText: "Buka Catatan",
        };
      case "control_pomodoro":
        return {
          icon: Timer,
          bg: "bg-amber-950/40 border-amber-500/30 text-amber-300",
          iconBg: "bg-amber-500/20 text-amber-400",
          btnText: "Lihat Timer",
        };
      case "control_music":
        return {
          icon: Music,
          bg: "bg-purple-950/40 border-purple-500/30 text-purple-300",
          iconBg: "bg-purple-500/20 text-purple-400",
          btnText: "Buka Musik",
        };
      case "log_water":
        return {
          icon: Droplets,
          bg: "bg-cyan-950/40 border-cyan-500/30 text-cyan-300",
          iconBg: "bg-cyan-500/20 text-cyan-400",
          btnText: "Lihat Air",
        };
      default:
        return {
          icon: CheckCircle2,
          bg: "bg-blue-950/40 border-blue-500/30 text-blue-300",
          iconBg: "bg-blue-500/20 text-blue-400",
          btnText: "Lihat Fitur",
        };
    }
  };

  const theme = getTheme();
  const IconComp = theme.icon;

  return (
    <div
      className={`inline-flex items-center gap-2.5 px-3 py-1.5 rounded-[14px] border ${theme.bg} shadow-sm my-1 select-none`}
    >
      <div className={`w-6 h-6 rounded-[8px] ${theme.iconBg} flex items-center justify-center shrink-0`}>
        <IconComp size={13} strokeWidth={2.4} />
      </div>
      <span className="text-[12px] font-medium leading-tight">
        {message}
      </span>
      {tabTarget && (
        <button
          type="button"
          onClick={handleOpen}
          className="ml-1 px-2 py-0.5 rounded-[8px] bg-white/[0.08] hover:bg-white/[0.16] text-white text-[11px] font-semibold flex items-center gap-1 shrink-0 cursor-pointer transition-all active:scale-95"
        >
          <span>{theme.btnText}</span>
          <ArrowRight size={10} strokeWidth={2.6} />
        </button>
      )}
    </div>
  );
};
