import React, { useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { ArrowUpRight, FolderOpen, Terminal, Zap } from "lucide-react";
import { NavbarModuleProps } from "../registry";
import { NavbarPopoverShell, useNavbarIsLightSurface } from "./NavbarPopoverShell";
import { Tooltip } from "../../components/ui/Tooltip";
import { launchSystemTarget } from "../../services/taskbarLaunchService";
import { makeTriggerA11yProps, TRIGGER_FOCUS_RING } from "../../utils/triggerA11y";
import { getNavbarTooltipSide, tx, useTaskbarLang } from "../../services/taskbarI18n";

const LAUNCHER_HISTORY_KEY = "gili_launcher_history_v1";

function loadHistory(): string[] {
  try {
    const raw = localStorage.getItem(LAUNCHER_HISTORY_KEY);
    if (raw) {
      const arr = JSON.parse(raw);
      if (Array.isArray(arr)) {
        return arr.filter((x): x is string => typeof x === "string").slice(0, 5);
      }
    }
  } catch {}
  return [];
}

function normalizeTarget(input: string): string {
  const trimmed = input.trim();
  if (!trimmed) return "";
  if (
    !trimmed.includes("://") &&
    !trimmed.startsWith("ms-") &&
    !/^[a-zA-Z]:\\/.test(trimmed) &&
    /^[^\s]+\.[a-z]{2,}(?:\/.*)?$/i.test(trimmed)
  ) {
    return `https://${trimmed}`;
  }
  return trimmed;
}

export const QuickLauncherNavbarModule: React.FC<NavbarModuleProps> = ({
  view = "compact",
  config,
}) => {
  const lang = useTaskbarLang();
  const isLight = useNavbarIsLightSurface(config);
  const tooltipSide = getNavbarTooltipSide(config?.position);
  const isVertical = config?.position === "left" || config?.position === "right";
  const isCompact = view === "compact" || isVertical;
  const [isOpen, setIsOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [history, setHistory] = useState<string[]>(loadHistory);
  const anchorRef = useRef<HTMLDivElement>(null);

  const runTarget = async (rawTarget: string) => {
    const target = normalizeTarget(rawTarget);
    if (!target) return;
    const next = [target, ...history.filter((h) => h !== target)].slice(0, 5);
    setHistory(next);
    try {
      localStorage.setItem(LAUNCHER_HISTORY_KEY, JSON.stringify(next));
    } catch {}
    setQuery("");
    setIsOpen(false);
    await launchSystemTarget(target).catch(() => {});
  };

  const handleToggle = () => setIsOpen((v) => !v);

  return (
    <>
      <Tooltip
        content={tx(
          lang,
          "Quick Launcher for apps, commands, or URLs",
          "Peluncur cepat aplikasi, perintah, atau URL"
        )}
        side={tooltipSide}
        disabled={isOpen}
        isLightMode={isLight}
        wrapperClassName={isVertical ? "w-full" : undefined}
      >
        <div
          ref={anchorRef}
          onClick={handleToggle}
          {...makeTriggerA11yProps(
            handleToggle,
            tx(lang, "Quick launcher", "Peluncur cepat"),
            isOpen
          )}
          className={`flex items-center cursor-pointer select-none transition-all ${TRIGGER_FOCUS_RING} ${
            isCompact
              ? `gili-mod-compact${isVertical ? " gili-mod-vertical" : ""} justify-center rounded-[12px] bg-white/[0.06] hover:bg-white/[0.11]`
              : "gili-mod-pill px-3 gap-2 rounded-[12px] bg-white/[0.06] hover:bg-white/[0.11] border border-white/[0.07]"
          }`}
        >
          <Zap
            size={16}
            className={`${isLight ? "text-amber-600" : "text-yellow-400"} shrink-0`}
          />
          {!isCompact && (
            <>
              <span className="text-[11.5px] text-zinc-300 max-w-[95px] truncate">
                {tx(lang, "Quick open...", "Buka cepat...")}
              </span>
              <span className="text-[9.5px] font-medium px-1.5 py-0.5 rounded-[5px] bg-white/[0.09] text-zinc-300 shrink-0">
                Run / Web
              </span>
            </>
          )}
        </div>
      </Tooltip>

      <NavbarPopoverShell
        isOpen={isOpen}
        onClose={() => setIsOpen(false)}
        anchorRef={anchorRef}
        title={tx(lang, "Quick Launcher", "Peluncur Cepat")}
        moduleId="peluncur_cepat"
        currentView={view}
        config={config}
        needsKeyboardFocus
        width={272}
      >
        <form
          onSubmit={(e) => {
            e.preventDefault();
            runTarget(query);
          }}
          className="flex items-center gap-1.5"
        >
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key !== "Escape") e.stopPropagation();
            }}
            placeholder={tx(
              lang,
              "notepad, cmd, or url...",
              "notepad, cmd, atau url..."
            )}
            className={`flex-1 min-w-0 h-8 px-2.5 rounded-[8px] border text-[11.5px] outline-none ${TRIGGER_FOCUS_RING} ${
              isLight
                ? "bg-black/[0.06] border-black/15 text-zinc-900 placeholder:text-zinc-500 focus:border-amber-600"
                : "bg-black/50 border-white/15 text-white focus:border-yellow-400"
            }`}
          />
          <button
            type="submit"
            className={`h-8 px-2.5 shrink-0 rounded-[8px] bg-yellow-500 hover:bg-yellow-400 text-[#09090b] text-[11px] font-semibold cursor-pointer ${TRIGGER_FOCUS_RING}`}
          >
            {tx(lang, "Open", "Buka")}
          </button>
        </form>

        <div className="grid grid-cols-2 gap-1.5">
          <button
            type="button"
            onClick={() => runTarget("notepad")}
            className={`min-w-0 overflow-hidden px-2.5 py-1.5 rounded-[8px] bg-white/[0.06] hover:bg-white/[0.13] text-[11px] text-zinc-200 flex items-center gap-1.5 cursor-pointer ${TRIGGER_FOCUS_RING}`}
          >
            <ArrowUpRight size={12} className="text-sky-400 shrink-0" />
            <span className="truncate">Notepad</span>
          </button>
          <button
            type="button"
            onClick={() => runTarget("calc")}
            className={`min-w-0 overflow-hidden px-2.5 py-1.5 rounded-[8px] bg-white/[0.06] hover:bg-white/[0.13] text-[11px] text-zinc-200 flex items-center gap-1.5 cursor-pointer ${TRIGGER_FOCUS_RING}`}
          >
            <ArrowUpRight size={12} className="text-emerald-400 shrink-0" />
            <span className="truncate">{tx(lang, "Calculator", "Kalkulator")}</span>
          </button>
          <button
            type="button"
            onClick={() => {
              setIsOpen(false);
              invoke("trigger_file_explorer").catch(() => {});
            }}
            className={`min-w-0 overflow-hidden px-2.5 py-1.5 rounded-[8px] bg-white/[0.06] hover:bg-white/[0.13] text-[11px] text-zinc-200 flex items-center gap-1.5 cursor-pointer ${TRIGGER_FOCUS_RING}`}
          >
            <FolderOpen size={12} className="text-amber-400 shrink-0" />
            <span className="truncate">Explorer</span>
          </button>
          <button
            type="button"
            onClick={() => {
              setIsOpen(false);
              invoke("trigger_task_manager").catch(() => {});
            }}
            className={`min-w-0 overflow-hidden px-2.5 py-1.5 rounded-[8px] bg-white/[0.06] hover:bg-white/[0.13] text-[11px] text-zinc-200 flex items-center gap-1.5 cursor-pointer ${TRIGGER_FOCUS_RING}`}
          >
            <Terminal size={12} className="text-purple-400 shrink-0" />
            <span className="truncate">Task Mgr</span>
          </button>
        </div>

        {history.length > 0 && (
          <div className="flex flex-col gap-1 border-t border-white/[0.08] pt-2">
            <div className="flex items-center justify-between gap-2 text-[10px] text-zinc-400">
              <span>{tx(lang, "Recent history", "Riwayat terakhir")}</span>
              <button
                type="button"
                onClick={() => {
                  setHistory([]);
                  try {
                    localStorage.removeItem(LAUNCHER_HISTORY_KEY);
                  } catch {}
                }}
                className={`text-zinc-400 hover:text-zinc-200 cursor-pointer shrink-0 ${TRIGGER_FOCUS_RING}`}
              >
                {tx(lang, "Clear", "Bersihkan")}
              </button>
            </div>
            <div className="flex flex-wrap gap-1 w-full min-w-0">
              {history.map((item) => (
                <button
                  key={item}
                  type="button"
                  onClick={() => runTarget(item)}
                  className={`max-w-full min-w-0 truncate px-2 py-0.5 rounded-[6px] bg-white/[0.07] hover:bg-white/[0.14] text-[10.5px] text-zinc-200 cursor-pointer ${TRIGGER_FOCUS_RING}`}
                >
                  {item}
                </button>
              ))}
            </div>
          </div>
        )}
      </NavbarPopoverShell>
    </>
  );
};
