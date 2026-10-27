import React, { useState, useEffect, useRef, useCallback } from "react";
import {
  Keyboard,
  RotateCcw,
  AlertCircle,
  Layers,
  PlusCircle,
  StickyNote,
  Music,
  Play,
  Moon,
  EyeOff,
} from "lucide-react";
import { IosSwitch } from "../../ios/IosSwitch";
import { t } from "../../../services/i18n";
import {
  SHORTCUT_ACTIONS,
  ShortcutActionId,
  ShortcutStatus,
  parseKeyEventToAccelerator,
  formatAcceleratorToChips,
  validateShortcut,
  shortcutManager,
} from "../../../services/shortcuts";

interface KeyboardShortcutsCardProps {
  shortcuts: Record<ShortcutActionId, string | null>;
  shortcutsEnabled: boolean;
  shortcutStatuses: Record<ShortcutActionId, ShortcutStatus>;
  onUpdateShortcut: (actionId: ShortcutActionId, shortcut: string | null) => Promise<{ success: boolean; error?: string }>;
  onResetShortcut: (actionId: ShortcutActionId) => Promise<void>;
  onToggleShortcutsEnabled: (enabled: boolean) => void;
  isLightMode?: boolean;
}

const ACTION_ICONS: Record<ShortcutActionId, React.ReactNode> = {
  toggle_notch: <Layers size={17} strokeWidth={2} />,
  quick_task: <PlusCircle size={17} strokeWidth={2} />,
  quick_note: <StickyNote size={17} strokeWidth={2} />,
  open_media: <Music size={17} strokeWidth={2} />,
  toggle_media_playback: <Play size={17} strokeWidth={2} />,
  toggle_focus_mode: <Moon size={17} strokeWidth={2} />,
  toggle_hide: <EyeOff size={17} strokeWidth={2} />,
};

const ACTION_COLORS: Record<ShortcutActionId, { bg: string; text: string }> = {
  toggle_notch: { bg: "bg-[#142333]", text: "text-[#3882F6]" },
  quick_task: { bg: "bg-[#132c1e]", text: "text-[#34c759]" },
  quick_note: { bg: "bg-[#2a2412]", text: "text-[#f59e0b]" },
  open_media: { bg: "bg-[#2c182e]", text: "text-[#d946ef]" },
  toggle_media_playback: { bg: "bg-[#2c2010]", text: "text-[#ff9f0a]" },
  toggle_focus_mode: { bg: "bg-[#1f1a3a]", text: "text-[#818cf8]" },
  toggle_hide: { bg: "bg-[#1e1e24]", text: "text-[#9ca3af]" },
};

const ACTION_COLORS_LIGHT: Record<ShortcutActionId, { bg: string; text: string }> = {
  toggle_notch: { bg: "bg-[#007aff]/15", text: "text-[#007aff]" },
  quick_task: { bg: "bg-[#34c759]/15", text: "text-[#28a745]" },
  quick_note: { bg: "bg-[#f59e0b]/15", text: "text-[#d97706]" },
  open_media: { bg: "bg-[#d946ef]/15", text: "text-[#c026d3]" },
  toggle_media_playback: { bg: "bg-[#ff9f0a]/15", text: "text-[#ea580c]" },
  toggle_focus_mode: { bg: "bg-[#818cf8]/15", text: "text-[#6366f1]" },
  toggle_hide: { bg: "bg-black/10", text: "text-neutral-600" },
};

export const KeyboardShortcutsCard: React.FC<KeyboardShortcutsCardProps> = ({
  shortcuts,
  shortcutsEnabled,
  shortcutStatuses,
  onUpdateShortcut,
  onResetShortcut,
  onToggleShortcutsEnabled,
  isLightMode,
}) => {
  const isLight =
    isLightMode ??
    (typeof document !== "undefined" && document.documentElement.classList.contains("light"));
  const [recordingAction, setRecordingAction] = useState<ShortcutActionId | null>(null);
  const [recordingChips, setRecordingChips] = useState<string[]>([]);
  const [rowErrors, setRowErrors] = useState<Partial<Record<ShortcutActionId, string>>>({});
  const recordingContainerRef = useRef<HTMLDivElement | null>(null);

  const getActionLabels = useCallback((): Record<ShortcutActionId, string> => {
    const map: Partial<Record<ShortcutActionId, string>> = {};
    for (const act of SHORTCUT_ACTIONS) {
      map[act.id] = t(act.labelKey as any);
    }
    return map as Record<ShortcutActionId, string>;
  }, []);

  const startRecording = useCallback(
    async (actionId: ShortcutActionId) => {
      setRecordingAction(actionId);
      setRecordingChips([]);
      setRowErrors((prev) => ({ ...prev, [actionId]: undefined }));
      await shortcutManager.suspendAll();
    },
    []
  );

  const cancelRecording = useCallback(async () => {
    setRecordingAction(null);
    setRecordingChips([]);
    await shortcutManager.resumeAll(shortcutsEnabled);
  }, [shortcutsEnabled]);

  const handleClearShortcut = useCallback(
    async (actionId: ShortcutActionId) => {
      setRecordingAction(null);
      setRecordingChips([]);
      setRowErrors((prev) => ({ ...prev, [actionId]: undefined }));
      await onUpdateShortcut(actionId, null);
      await shortcutManager.resumeAll(shortcutsEnabled);
    },
    [onUpdateShortcut, shortcutsEnabled]
  );

  useEffect(() => {
    if (!recordingAction) return;

    const handleKeyDown = async (e: KeyboardEvent) => {
      e.preventDefault();
      e.stopPropagation();

      if (e.key === "Escape") {
        await cancelRecording();
        return;
      }

      if (e.key === "Backspace" && !e.ctrlKey && !e.altKey && !e.shiftKey) {
        await handleClearShortcut(recordingAction);
        return;
      }

      const parsed = parseKeyEventToAccelerator(e);

      if (!parsed.isComplete) {
        setRecordingChips(parsed.displayChips);
        if (parsed.error) {
          setRowErrors((prev) => ({ ...prev, [recordingAction]: t(parsed.error as any) }));
        }
        return;
      }

      if (parsed.error) {
        setRecordingChips(parsed.displayChips);
        setRowErrors((prev) => ({ ...prev, [recordingAction]: t(parsed.error as any) }));
        return;
      }

      if (parsed.accelerator) {
        const validation = validateShortcut(
          recordingAction,
          parsed.accelerator,
          shortcuts,
          getActionLabels()
        );

        if (!validation.valid && validation.error) {
          setRecordingChips(parsed.displayChips);
          let errMsg = "";
          if (validation.error.startsWith("shortcut_err_duplicate::")) {
            const duplicateTarget = validation.error.split("::")[1];
            errMsg = t("shortcut_err_duplicate", { action: duplicateTarget });
          } else {
            errMsg = t(validation.error as any);
          }
          setRowErrors((prev) => ({ ...prev, [recordingAction]: errMsg }));
          return;
        }

        const result = await onUpdateShortcut(recordingAction, parsed.accelerator);
        if (result.success) {
          setRecordingAction(null);
          setRecordingChips([]);
          setRowErrors((prev) => ({ ...prev, [recordingAction]: undefined }));
        } else {
          setRecordingChips(parsed.displayChips);
          setRowErrors((prev) => ({
            ...prev,
            [recordingAction]: result.error || t("shortcut_err_conflict"),
          }));
        }
        await shortcutManager.resumeAll(shortcutsEnabled);
      }
    };

    window.addEventListener("keydown", handleKeyDown, true);
    return () => {
      window.removeEventListener("keydown", handleKeyDown, true);
    };
  }, [recordingAction, shortcuts, cancelRecording, handleClearShortcut, onUpdateShortcut, shortcutsEnabled, getActionLabels]);

  return (
    <div
      ref={recordingContainerRef}
      className={`w-full rounded-[22px] p-3 flex flex-col gap-2.5 mt-3 transition-colors ${
        isLight
          ? "bg-white/80 border border-black/10 shadow-[0_4px_20px_rgba(0,0,0,0.06)] text-[#1d1d1f]"
          : "bg-[#111114] border border-white/[0.06] shadow-[0_8px_30px_rgba(0,0,0,0.5)] text-white"
      }`}
    >
      {/* Header with Master Switch */}
      <div className={`flex items-center justify-between pb-2 border-b px-1 ${
        isLight ? "border-black/[0.06]" : "border-white/[0.06]"
      }`}>
        <div className="flex items-center gap-2.5">
          <div className={`w-8 h-8 rounded-full flex items-center justify-center ${
            isLight ? "bg-[#007aff]/15 text-[#007aff]" : "bg-[#142333] text-[#3882F6]"
          }`}>
            <Keyboard size={18} strokeWidth={2} />
          </div>
          <div>
            <div className={`text-[13px] font-semibold tracking-tight ${
              isLight ? "text-[#1d1d1f]" : "text-white/95"
            }`}>
              {t("settings_shortcuts")}
            </div>
            <div className={`text-[11px] ${
              isLight ? "text-neutral-500" : "text-white/45"
            }`}>
              {t("settings_shortcuts_desc")}
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <span className={`text-[11px] hidden sm:inline ${
            isLight ? "text-neutral-500" : "text-white/50"
          }`}>
            {t("settings_shortcuts_enable")}
          </span>
          <IosSwitch
            checked={shortcutsEnabled}
            onChange={() => onToggleShortcutsEnabled(!shortcutsEnabled)}
            activeColor="blue"
          />
        </div>
      </div>

      {/* Shortcut Rows */}
      <div className="flex flex-col gap-1.5 pt-0.5">
        {SHORTCUT_ACTIONS.map((action) => {
          const shortcut = shortcuts[action.id];
          const isDefault = shortcut === action.defaultShortcut;
          const isRecording = recordingAction === action.id;
          const status = shortcutStatuses[action.id] || "inactive";
          const rowError = rowErrors[action.id];
          const hasError = Boolean(rowError);
          const colors = isLight
            ? ACTION_COLORS_LIGHT[action.id] || { bg: "bg-black/10", text: "text-neutral-600" }
            : ACTION_COLORS[action.id] || { bg: "bg-[#1e1e24]", text: "text-white/80" };

          const displayChips = isRecording
            ? recordingChips.length > 0
              ? recordingChips
              : null
            : formatAcceleratorToChips(shortcut);

          return (
            <div
              key={action.id}
              className={`flex flex-col rounded-xl px-2.5 py-2 transition-all ${
                isRecording
                  ? isLight
                    ? "bg-blue-50/90 border border-[#007aff]/50 shadow-[0_0_12px_rgba(0,122,255,0.18)]"
                    : "bg-[#181820] border border-[#3882F6]/60 shadow-[0_0_12px_rgba(56,130,246,0.25)]"
                  : hasError
                  ? isLight
                    ? "bg-red-50/90 border border-red-500/30"
                    : "bg-[#181112] border border-red-500/40"
                  : isLight
                  ? "bg-black/[0.02] hover:bg-black/[0.05] border border-black/[0.04]"
                  : "bg-white/[0.02] hover:bg-white/[0.04] border border-white/[0.04]"
              } ${!shortcutsEnabled ? "opacity-50 pointer-events-none" : ""}`}
            >
              <div className="flex items-center justify-between gap-2">
                {/* Left: Icon & Label */}
                <div className="flex items-center gap-2.5 min-w-0">
                  <div className={`w-7 h-7 rounded-lg flex items-center justify-center shrink-0 ${colors.bg} ${colors.text}`}>
                    {ACTION_ICONS[action.id]}
                  </div>
                  <div className="flex flex-col min-w-0">
                    <span className={`text-[12px] font-medium truncate ${
                      isLight ? "text-[#1d1d1f]" : "text-white/90"
                    }`}>
                      {t(action.labelKey as any)}
                    </span>
                    <span className={`text-[10px] truncate ${
                      isLight ? "text-neutral-500" : "text-white/40"
                    }`}>
                      {t(action.descKey as any)}
                    </span>
                  </div>
                </div>

                {/* Right: Chip & Controls */}
                <div className="flex items-center gap-1.5 shrink-0">
                  {/* Shortcut Chip */}
                  {isRecording ? (
                    <div className={`flex items-center gap-1 px-2.5 py-1 rounded-lg text-[11px] font-mono animate-pulse ${
                      isLight
                        ? "bg-[#007aff]/10 border border-[#007aff]/40 text-[#007aff]"
                        : "bg-[#3882F6]/15 border border-[#3882F6]/50 text-[#60a5fa]"
                    }`}>
                      {displayChips && displayChips.length > 0 ? (
                        displayChips.map((chip, idx) => (
                          <span
                            key={idx}
                            className={`px-1.5 py-0.5 rounded font-medium ${
                              isLight
                                ? "bg-white border border-[#007aff]/30 text-[#007aff] shadow-xs"
                                : "bg-black/40 border border-[#3882F6]/40 text-white"
                            }`}
                          >
                            {chip}
                          </span>
                        ))
                      ) : (
                        <span>{t("settings_shortcuts_record_prompt")}</span>
                      )}
                    </div>
                  ) : displayChips && displayChips.length > 0 ? (
                    <div className="flex items-center gap-1">
                      {displayChips.map((chip, idx) => (
                        <span
                          key={idx}
                          className={`px-1.5 py-0.5 rounded-md text-[11px] font-mono font-medium shadow-xs transition-colors ${
                            isLight
                              ? "bg-black/[0.06] border border-black/10 text-[#1d1d1f]"
                              : "bg-[#1a1a22] border border-white/10 text-white/85 shadow-sm"
                          }`}
                        >
                          {chip}
                        </span>
                      ))}
                    </div>
                  ) : (
                    <span className={`text-[11px] italic px-1 ${
                      isLight ? "text-neutral-400" : "text-white/30"
                    }`}>
                      {t("settings_shortcuts_empty")}
                    </span>
                  )}

                  {/* Conflict / Inactive indicator */}
                  {!isRecording && shortcut && status === "conflict" && (
                    <div
                      className="text-amber-400 p-1"
                      title={t("shortcut_err_conflict")}
                    >
                      <AlertCircle size={14} />
                    </div>
                  )}

                  {/* Change button */}
                  <button
                    type="button"
                    onClick={() => {
                      if (isRecording) {
                        cancelRecording();
                      } else {
                        startRecording(action.id);
                      }
                    }}
                    className={`px-2 py-1 rounded-lg text-[11px] font-medium transition-colors ${
                      isRecording
                        ? isLight
                          ? "bg-black/10 text-[#1d1d1f] hover:bg-black/15"
                          : "bg-white/15 text-white hover:bg-white/20"
                        : isLight
                        ? "bg-black/[0.06] text-[#1d1d1f] hover:bg-black/10"
                        : "bg-white/[0.07] text-white/80 hover:bg-white/[0.12] hover:text-white"
                    }`}
                  >
                    {isRecording ? t("onboarding_back") : t("settings_shortcuts_change")}
                  </button>

                  {/* Reset to default button */}
                  {!isDefault && (
                    <button
                      type="button"
                      onClick={() => onResetShortcut(action.id)}
                      className={`p-1.5 rounded-lg transition-colors ${
                        isLight
                          ? "text-neutral-500 hover:text-black hover:bg-black/[0.06]"
                          : "text-white/40 hover:text-white hover:bg-white/[0.08]"
                      }`}
                      title={t("settings_shortcuts_reset_default")}
                      aria-label={t("settings_shortcuts_reset_default")}
                    >
                      <RotateCcw size={12} strokeWidth={2} />
                    </button>
                  )}
                </div>
              </div>

              {/* Error message or recording tip */}
              {isRecording && (
                <div className={`text-[10px] mt-1.5 pl-9 flex items-center justify-between ${
                  isLight ? "text-neutral-500" : "text-white/45"
                }`}>
                  <span>{t("settings_shortcuts_clear_tip")}</span>
                </div>
              )}

              {hasError && (
                <div
                  className={`text-[10px] mt-1 pl-9 flex items-center gap-1 font-medium ${
                    isLight ? "text-red-600" : "text-red-400"
                  }`}
                  role="alert"
                  aria-live="polite"
                >
                  <AlertCircle size={11} className="shrink-0" />
                  <span>{rowError}</span>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
};
