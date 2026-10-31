import React, { useState, useRef, useEffect, useMemo, useCallback } from "react";
import { TodoItem, TodoRepeatRule } from "../../services/todoUtils";
import { parseDateNlp, formatNlpDateBadge, NlpDateResult } from "../../utils/dateNlpParser";
import { formatShortcutForBadge } from "../../services/shortcuts";
import { t, Language, getLanguage } from "../../services/i18n";

export { formatShortcutForBadge };

export interface QuickTodoNotchCardProps {
  todoItems: TodoItem[];
  optAccent?: string;
  optLanguage?: Language;
  shortcutLabel?: string;
  isIsland?: boolean;
  isLightMode?: boolean;
  onSave: (text: string, dueAt?: number | null, reminders?: number[], repeatRule?: TodoRepeatRule) => TodoItem | undefined;
  onToggleTodo: (id: string) => void;
  onDeleteTodo: (id: string) => void;
  onCancel: () => void;
  onOpenTodoList: () => void;
  onSavedStateChange?: (isSaved: boolean) => void;
}

type PresetDateType = "today" | "tomorrow" | "weekend" | "custom" | null;

export const QuickTodoNotchCard: React.FC<QuickTodoNotchCardProps> = ({
  todoItems,
  optAccent = "#3882F6",
  optLanguage,
  shortcutLabel = "CTRL ALT T",
  isIsland = false,
  isLightMode = false,
  onSave,
  onToggleTodo,
  onDeleteTodo,
  onCancel,
  onOpenTodoList,
  onSavedStateChange,
}) => {
  // Theme tokens — the card was dark-only (white text invisible on light island).
  const textMain = isLightMode ? "text-[#101828]" : "text-white";
  const textSub = isLightMode ? "text-[#667085]" : "text-[#8b8b95]";
  const chipSurface = isLightMode
    ? "bg-black/[0.05] hover:bg-black/[0.09] text-[#475467]"
    : "bg-[#17171c] hover:bg-[#22222a] text-[#c4c4cc]";
  const dividerColor = isLightMode ? "bg-black/10" : "bg-[#1f1f26]";
  const ghostBtn = isLightMode
    ? "text-[#475467] hover:bg-black/[0.06]"
    : "text-[#c4c4cc] hover:bg-white/[0.08]";

  const effectiveLang: Language = optLanguage || getLanguage();
  const [inputText, setInputText] = useState("");
  const [manualPreset, setManualPreset] = useState<PresetDateType>(null);
  const [manualDueAt, setManualDueAt] = useState<number | null>(null);
  const [manualHasTime, setManualHasTime] = useState<boolean>(false);
  const [reminderEnabled, setReminderEnabled] = useState(true);
  const [repeatRule, setRepeatRule] = useState<TodoRepeatRule>("none");
  
  // State 3: Saved confirmation view
  const [isSaved, setIsSaved] = useState(false);
  const [savedTask, setSavedTask] = useState<TodoItem | null>(null);
  const [selectedIndex, setSelectedIndex] = useState(0);

  const inputRef = useRef<HTMLInputElement>(null);
  const autoCloseTimerRef = useRef<number | null>(null);
  const datePickerInputRef = useRef<HTMLInputElement>(null);
  const savedAtRef = useRef<number>(0);

  // Focus input on mount, window focus, and animation completion
  useEffect(() => {
    const focusInput = () => {
      if (inputRef.current) {
        inputRef.current.focus();
      }
    };
    focusInput();
    const t1 = window.setTimeout(focusInput, 30);
    const t2 = window.setTimeout(focusInput, 80);
    const t3 = window.setTimeout(focusInput, 200);

    window.addEventListener("focus", focusInput);
    return () => {
      window.clearTimeout(t1);
      window.clearTimeout(t2);
      window.clearTimeout(t3);
      window.removeEventListener("focus", focusInput);
    };
  }, []);

  // Notify parent of state change (to adjust notch height 190 -> 330)
  useEffect(() => {
    onSavedStateChange?.(isSaved);
  }, [isSaved, onSavedStateChange]);

  // NLP parsing from input text
  const nlpResult: NlpDateResult = useMemo(() => {
    return parseDateNlp(inputText, new Date(), effectiveLang);
  }, [inputText, effectiveLang]);

  // Compute effective due date:
  // If NLP detected date, that takes precedence (or manual override if chosen)
  const effectiveDueAt: number | null = useMemo(() => {
    if (manualDueAt !== null) return manualDueAt;
    if (nlpResult.hasDate && nlpResult.dueAt) return nlpResult.dueAt;
    return null;
  }, [manualDueAt, nlpResult]);

  const effectiveHasTime: boolean = useMemo(() => {
    if (manualDueAt !== null) return manualHasTime;
    if (nlpResult.hasDate) return nlpResult.hasTime;
    return false;
  }, [manualDueAt, manualHasTime, nlpResult]);

  const activeDateBadge = useMemo(() => {
    if (!effectiveDueAt) return null;
    return formatNlpDateBadge(effectiveDueAt, new Date(), effectiveLang, effectiveHasTime);
  }, [effectiveDueAt, effectiveLang, effectiveHasTime]);

  // Auto-close in saved state after 5 seconds of inactivity & Enter/Escape dismiss
  useEffect(() => {
    if (isSaved) {
      autoCloseTimerRef.current = window.setTimeout(() => {
        onCancel();
      }, 5000);

      const handleGlobalSavedKeyDown = (e: KeyboardEvent) => {
        if (e.key === "Escape") {
          e.preventDefault();
          onCancel();
        } else if (e.key === "Enter") {
          if (e.repeat) return;
          if (Date.now() - savedAtRef.current < 250) return;
          e.preventDefault();
          onCancel();
        }
      };
      window.addEventListener("keydown", handleGlobalSavedKeyDown, true);
      return () => {
        if (autoCloseTimerRef.current) {
          clearTimeout(autoCloseTimerRef.current);
        }
        window.removeEventListener("keydown", handleGlobalSavedKeyDown, true);
      };
    }
  }, [isSaved, onCancel]);

  // Upcoming items for State 3: list of up to 3 non-completed tasks
  const upcomingTodos = useMemo(() => {
    return todoItems.filter((t) => !t.completed).slice(0, 3);
  }, [todoItems]);

  const handleManualPresetClick = (preset: "today" | "tomorrow" | "weekend") => {
    const now = new Date();
    let target = new Date();

    if (preset === "today") {
      target.setHours(23, 59, 0, 0);
    } else if (preset === "tomorrow") {
      target.setDate(now.getDate() + 1);
      target.setHours(23, 59, 0, 0);
    } else if (preset === "weekend") {
      const currentDay = now.getDay();
      const daysUntilSaturday = (6 - currentDay + 7) % 7 || 7;
      target.setDate(now.getDate() + daysUntilSaturday);
      target.setHours(23, 59, 0, 0);
    }

    if (manualPreset === preset) {
      // Toggle off
      setManualPreset(null);
      setManualDueAt(null);
      setManualHasTime(false);
    } else {
      setManualPreset(preset);
      setManualDueAt(target.getTime());
      setManualHasTime(false);
    }
  };

  const handleCustomDateTimeSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!e.target.value) return;
    const selected = new Date(e.target.value);
    if (!isNaN(selected.getTime())) {
      setManualPreset("custom");
      setManualDueAt(selected.getTime());
      setManualHasTime(true);
    }
  };

  const handleSave = useCallback(() => {
    const trimmed = inputText.trim();
    if (!trimmed) return;

    // Use cleanText from NLP if available, otherwise raw input
    const title = (nlpResult.hasDate && nlpResult.cleanText) ? nlpResult.cleanText : trimmed;
    const reminders = effectiveDueAt && reminderEnabled ? [0, 10] : [];

    const created = onSave(title, effectiveDueAt, reminders, repeatRule !== "none" ? repeatRule : undefined);
    if (created) {
      setSavedTask(created);
    } else {
      setSavedTask({
        id: `temp_${Date.now()}`,
        text: title,
        completed: false,
        createdAt: Date.now(),
        dueAt: effectiveDueAt,
        reminders,
      });
    }
    savedAtRef.current = Date.now();
    setIsSaved(true);
  }, [inputText, nlpResult, effectiveDueAt, reminderEnabled, repeatRule, onSave]);

  const handleUndo = useCallback(() => {
    if (savedTask) {
      onDeleteTodo(savedTask.id);
    }
    setIsSaved(false);
    setSavedTask(null);
    if (autoCloseTimerRef.current) {
      clearTimeout(autoCloseTimerRef.current);
    }
    window.setTimeout(() => {
      inputRef.current?.focus();
    }, 40);
  }, [savedTask, onDeleteTodo]);

  // Key navigation
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Escape") {
      e.preventDefault();
      onCancel();
      return;
    }

    if (!isSaved) {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        handleSave();
      }
    } else {
      // State 3 navigation
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setSelectedIndex((prev) => Math.min(upcomingTodos.length - 1, prev + 1));
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        setSelectedIndex((prev) => Math.max(0, prev - 1));
      } else if (e.key === " " || e.code === "Space") {
        e.preventDefault();
        const target = upcomingTodos[selectedIndex];
        if (target) {
          onToggleTodo(target.id);
        }
      } else if (e.key === "Enter") {
        if (e.repeat) return;
        if (Date.now() - savedAtRef.current < 250) return;
        e.preventDefault();
        onCancel();
      }
    }
  };

  // Helper to format due badge for list items in State 3
  const getBadgeInfo = (dueAt?: number | null) => {
    if (!dueAt) return null;
    const dt = new Date(dueAt);
    const isEndOfDay = dt.getHours() === 23 && dt.getMinutes() === 59;
    return formatNlpDateBadge(dueAt, new Date(), effectiveLang, !isEndOfDay);
  };

  return (
    <div
      className={`w-full h-full flex flex-col justify-between font-sans select-none ${textMain}`}
      style={{ padding: isIsland ? "18px 24px 22px" : "18px 24px 18px", boxSizing: "border-box" }}
      onKeyDown={handleKeyDown}
      tabIndex={0}
    >
      {/* Hidden native datetime-local for "Atur waktu" */}
      <input
        ref={datePickerInputRef}
        type="datetime-local"
        className="sr-only"
        tabIndex={-1}
        onChange={handleCustomDateTimeSelect}
      />

      {!isSaved ? (
        /* ================================================================
           STATE 1 & STATE 2: INPUT & NLP PREVIEW
           ================================================================ */
        <>
          {/* Header */}
          <div className="flex items-center gap-3 h-9">
            <div
              className="w-9 h-9 rounded-[10px] flex items-center justify-center flex-shrink-0"
              style={{
                background: "rgba(56, 130, 246, 0.18)",
                color: optAccent,
              }}
            >
              <svg
                width="20"
                height="20"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
              >
                <path d="m3 17 2 2 4-4" />
                <path d="m3 7 2 2 4-4" />
                <path d="M13 6h8" />
                <path d="M13 12h8" />
                <path d="M13 18h8" />
              </svg>
            </div>
            <div className="text-[12px] text-[#a1a1aa] font-medium">{t("quick_todo_title")}</div>
            <div className="flex-grow" />
            {shortcutLabel ? (
              <span className={`text-[11px] rounded-[6px] px-1.5 py-0.5 tracking-wider uppercase font-mono transition-colors ${
                isLightMode
                  ? "border border-black/10 bg-black/[0.04] text-[#71717a]"
                  : "text-[#a1a1aa] border border-[#34343c] bg-transparent"
              }`}>
                {shortcutLabel}
              </span>
            ) : null}
          </div>

          {/* Input Area with NLP Highlight Backdrop */}
          <div className="relative mt-2 min-h-[42px] flex items-center">
            {/* Syntax highlight backdrop */}
            {nlpResult.hasDate && (
              <div
                aria-hidden="true"
                className="absolute left-0 top-0 w-full h-full flex items-center pointer-events-none text-[17px] font-semibold tracking-[-0.01em] leading-[1.45] whitespace-pre overflow-hidden"
              >
                <span className="opacity-0">
                  {inputText.slice(0, nlpResult.startIndex)}
                </span>
                <span
                  className="rounded-[6px] px-1 -mx-0.5"
                  style={{
                    backgroundColor: "rgba(56, 130, 246, 0.2)",
                    boxShadow: `inset 0 -2px 0 ${optAccent}`,
                    color: "transparent",
                  }}
                >
                  {inputText.slice(nlpResult.startIndex, nlpResult.endIndex)}
                </span>
                <span className="opacity-0">
                  {inputText.slice(nlpResult.endIndex)}
                </span>
              </div>
            )}

            <input
              ref={inputRef}
              autoFocus
              type="text"
              value={inputText}
              onChange={(e) => {
                setInputText(e.target.value);
                if (manualPreset) {
                  setManualPreset(null);
                  setManualDueAt(null);
                  setManualHasTime(false);
                }
              }}
              placeholder={t("quick_todo_placeholder")}
              className={`relative w-full bg-transparent border-0 outline-none text-[17px] font-semibold tracking-[-0.01em] leading-[1.45] ${textMain} ${isLightMode ? "placeholder:text-[#98a2b3]" : "placeholder:text-[#8b8b95]"}`}
              style={{ caretColor: optAccent }}
              autoComplete="off"
              spellCheck={false}
            />
          </div>

          {/* Chips Row */}
          <div className="flex items-center gap-2 mt-2">
            {effectiveDueAt && activeDateBadge ? (
              // State 2: Time detected or manually selected chip
              <>
                <button
                  type="button"
                  onClick={() => {
                    if (nlpResult.hasDate && nlpResult.rawMatched) {
                      setInputText(nlpResult.cleanText);
                    }
                    setManualPreset(null);
                    setManualDueAt(null);
                    setManualHasTime(false);
                  }}
                  className="h-[30px] px-3 border-0 rounded-[15px] text-[12px] font-medium flex items-center gap-1.5 cursor-pointer transition-colors"
                  style={{
                    background: "rgba(56, 130, 246, 0.18)",
                    color: "#8db8ff",
                    boxShadow: "inset 0 0 0 1px rgba(56, 130, 246, 0.5)",
                  }}
                  title={t("quick_todo_remove_date_tip")}
                >
                  <svg
                    width="13"
                    height="13"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    aria-hidden="true"
                  >
                    <circle cx="12" cy="12" r="10" />
                    <path d="M12 6v6l4 2" />
                  </svg>
                  {activeDateBadge.chipLabel}
                </button>

                <button
                  type="button"
                  onClick={() => datePickerInputRef.current?.showPicker?.() || datePickerInputRef.current?.click()}
                  className={`h-[30px] px-3 border-0 rounded-[15px] text-[12px] font-medium flex items-center gap-1.5 cursor-pointer transition-colors ${chipSurface}`}
                >
                  <svg
                    width="13"
                    height="13"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    aria-hidden="true"
                  >
                    <rect x="3" y="4" width="18" height="18" rx="2" />
                    <path d="M16 2v4M8 2v4M3 10h18" />
                  </svg>
                  {t("quick_todo_set_time")}
                </button>

                <div className="flex-grow" />

                <button
                  type="button"
                  onClick={() => setReminderEnabled((prev) => !prev)}
                  className="h-[30px] px-3 border-0 rounded-[15px] text-[12px] font-medium flex items-center gap-1.5 cursor-pointer transition-colors"
                  style={{
                    background: reminderEnabled ? "rgba(56, 130, 246, 0.14)" : "#17171c",
                    color: reminderEnabled ? "#8db8ff" : "#8b8b95",
                  }}
                >
                  <svg
                    width="13"
                    height="13"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    aria-hidden="true"
                  >
                    <path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9" />
                    <path d="M10.3 21a1.94 1.94 0 0 0 3.4 0" />
                  </svg>
                  {t("quick_todo_remind_10m")}
                </button>
              </>
            ) : (
              // State 1: Quick Preset Chips
              <>
                <button
                  type="button"
                  onClick={() => handleManualPresetClick("today")}
                  className={`h-[30px] px-3 border-0 rounded-[15px] text-[12px] font-medium flex items-center gap-1.5 cursor-pointer transition-colors ${
                    manualPreset === "today"
                      ? "bg-[#3882f6]/20 text-[#8db8ff] ring-1 ring-[#3882f6]/50"
                      : isLightMode ? "bg-black/[0.05] hover:bg-black/[0.09] text-[#475467]" : "bg-[#17171c] hover:bg-[#22222a] text-[#c4c4cc]"
                  }`}
                >
                  {t("quick_todo_preset_today")}
                </button>

                <button
                  type="button"
                  onClick={() => handleManualPresetClick("tomorrow")}
                  className={`h-[30px] px-3 border-0 rounded-[15px] text-[12px] font-medium flex items-center gap-1.5 cursor-pointer transition-colors ${
                    manualPreset === "tomorrow"
                      ? "bg-[#3882f6]/20 text-[#8db8ff] ring-1 ring-[#3882f6]/50"
                      : isLightMode ? "bg-black/[0.05] hover:bg-black/[0.09] text-[#475467]" : "bg-[#17171c] hover:bg-[#22222a] text-[#c4c4cc]"
                  }`}
                >
                  {t("quick_todo_preset_tomorrow")}
                </button>

                <button
                  type="button"
                  onClick={() => handleManualPresetClick("weekend")}
                  className={`h-[30px] px-3 border-0 rounded-[15px] text-[12px] font-medium flex items-center gap-1.5 cursor-pointer transition-colors ${
                    manualPreset === "weekend"
                      ? "bg-[#3882f6]/20 text-[#8db8ff] ring-1 ring-[#3882f6]/50"
                      : isLightMode ? "bg-black/[0.05] hover:bg-black/[0.09] text-[#475467]" : "bg-[#17171c] hover:bg-[#22222a] text-[#c4c4cc]"
                  }`}
                >
                  {t("quick_todo_preset_weekend")}
                </button>

                <button
                  type="button"
                  onClick={() => datePickerInputRef.current?.showPicker?.() || datePickerInputRef.current?.click()}
                  className={`h-[30px] px-3 border-0 rounded-[15px] text-[12px] font-medium flex items-center gap-1.5 cursor-pointer transition-colors ${chipSurface}`}
                >
                  <svg
                    width="13"
                    height="13"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    aria-hidden="true"
                  >
                    <rect x="3" y="4" width="18" height="18" rx="2" />
                    <path d="M16 2v4M8 2v4M3 10h18" />
                  </svg>
                  {t("quick_todo_set_time")}
                </button>
              </>
            )}
          </div>

          {/* Repeat Rule — shown when a due date is active */}
          {effectiveDueAt && (
            <div className="flex items-center gap-1.5 mt-1.5 flex-wrap">
              {(["none", "daily", "weekdays", "weekly", "monthly"] as const).map((rule) => {
                const labels: Record<string, string> = {
                  none: "\u21BB Tidak",
                  daily: "Harian",
                  weekdays: "Hari Kerja",
                  weekly: "Mingguan",
                  monthly: "Bulanan",
                };
                const active = repeatRule === rule;
                return (
                  <button
                    key={rule}
                    type="button"
                    onClick={() => setRepeatRule(rule)}
                    className="h-[26px] px-2.5 border-0 rounded-full text-[11px] font-medium cursor-pointer transition-colors"
                    style={{
                      background: active ? "rgba(56,130,246,0.18)" : isLightMode ? "rgba(0,0,0,0.05)" : "#17171c",
                      color: active ? "#8db8ff" : isLightMode ? "#475467" : "#c4c4cc",
                      boxShadow: active ? "inset 0 0 0 1px rgba(56,130,246,0.5)" : undefined,
                    }}
                  >
                    {labels[rule]}
                  </button>
                );
              })}
            </div>
          )}

          {/* Bottom Row / Actions */}
          <div className="flex items-center gap-2 mt-auto pt-2.5 h-8">
            <span className={`text-[11.5px] ${textSub} truncate`}>
              {nlpResult.hasDate
                ? t("quick_todo_hint_nlp")
                : t("quick_todo_hint_example")}
            </span>

            <div className="flex-grow" />

            <button
              type="button"
              onClick={onCancel}
              className={`h-[30px] px-3 border-0 rounded-[9px] bg-transparent text-[12px] font-medium cursor-pointer transition-colors ${ghostBtn}`}
            >
              {t("quick_todo_cancel")}
            </button>

            <button
              type="button"
              onClick={handleSave}
              disabled={!inputText.trim()}
              className={`h-[30px] pl-3 pr-2 border-0 rounded-[9px] text-[12px] font-semibold flex items-center gap-2 transition-all ${
                inputText.trim()
                  ? "text-black cursor-pointer opacity-100 hover:brightness-110 active:scale-95"
                  : isLightMode ? `bg-black/[0.08] ${textSub} cursor-not-allowed opacity-75` : `bg-[#26262d] ${textSub} cursor-not-allowed opacity-75`
              }`}
              style={{
                backgroundColor: inputText.trim() ? optAccent : "#26262d",
              }}
            >
              {t("quick_todo_save")}
              <span className="text-[11px] font-medium border border-current rounded-[6px] px-1 py-0 opacity-70">
                Enter
              </span>
            </button>
          </div>
        </>
      ) : (
        /* ================================================================
           STATE 3: SAVED CONFIRMATION & UPCOMING LIST
           ================================================================ */
        <>
          {/* Saved Header */}
          <div className="flex items-center gap-3">
            <div
              className="w-9 h-9 rounded-full flex items-center justify-center flex-shrink-0"
              style={{
                background: "rgba(48, 209, 88, 0.18)",
                color: "#30d158",
              }}
            >
              <svg
                width="20"
                height="20"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
              >
                <path d="M20 6 9 17l-5-5" />
              </svg>
            </div>

            <div className="min-w-0 flex-grow">
              <div className="text-[12px] text-[#a1a1aa] font-medium">{t("quick_todo_task_added")}</div>
              <div className="text-[15px] font-semibold tracking-[-0.01em] leading-snug truncate">
                {savedTask?.text || inputText}
              </div>
            </div>

            <button
              type="button"
              onClick={handleUndo}
              className={`h-[30px] px-3 border-0 rounded-[9px] bg-transparent text-[12px] font-medium cursor-pointer transition-colors ${ghostBtn}`}
            >
              {t("quick_todo_undo")}
            </button>
          </div>

          {/* Divider */}
          <div className={`h-[1px] ${dividerColor} my-3`} />

          {/* Section: BERIKUTNYA */}
          <div className={`text-[10.5px] font-semibold tracking-[0.08em] ${textSub} h-5 flex items-center`}>
            {t("quick_todo_upcoming")}
            <div className="flex-grow" />
            <span className="font-medium tracking-normal text-[11px]">
              {t("quick_todo_active_count", { count: upcomingTodos.length })}
            </span>
          </div>

          {/* Tasks List */}
          <div role="list" className="mt-1 flex flex-col gap-0.5">
            {upcomingTodos.length === 0 ? (
              <div className={`text-[12px] ${textSub} italic py-2`}>
                {t("quick_todo_empty_upcoming")}
              </div>
            ) : (
              upcomingTodos.map((todo, idx) => {
                const isNewlySaved = savedTask?.id === todo.id;
                const isSelected = selectedIndex === idx;
                const badgeInfo = getBadgeInfo(todo.dueAt);

                return (
                  <div
                    key={todo.id}
                    onClick={() => onToggleTodo(todo.id)}
                    className={`flex items-center gap-3 h-[38px] px-2.5 -mx-2.5 rounded-[10px] text-[13.5px] font-medium cursor-pointer transition-colors ${
                      isNewlySaved
                        ? "bg-[#3882f6]/12"
                        : isSelected
                        ? "bg-white/[0.06]"
                        : "hover:bg-white/[0.03]"
                    }`}
                  >
                    {/* Checkbox */}
                    <span
                      className={`w-[18px] h-[18px] rounded-full border-[1.5px] flex items-center justify-center flex-shrink-0 transition-colors ${
                        todo.completed
                          ? "bg-[#30d158] border-[#30d158] text-black"
                          : "border-[#6b6b75] hover:border-white"
                      }`}
                    >
                      {todo.completed && (
                        <svg
                          width="12"
                          height="12"
                          viewBox="0 0 24 24"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="3"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        >
                          <path d="M20 6 9 17l-5-5" />
                        </svg>
                      )}
                    </span>

                    {/* Task Title */}
                    <span className="flex-grow truncate">
                      {todo.text}
                      {isNewlySaved && (
                        <span
                          className="ml-2 text-[10px] font-bold tracking-[0.04em] text-black rounded-[5px] px-1.5 py-0.5 inline-block align-middle"
                          style={{ backgroundColor: optAccent }}
                        >
                          {t("quick_todo_tag_new")}
                        </span>
                      )}
                    </span>

                    {/* Due Badge */}
                    {badgeInfo && (
                      <span
                        className={`text-[11px] font-semibold rounded-[8px] px-2 py-0.5 whitespace-nowrap ${
                          badgeInfo.badgeType === "am"
                            ? "bg-amber-400/15 text-amber-400"
                            : badgeInfo.badgeType === "bl"
                            ? "bg-[#3882f6]/20 text-[#8db8ff]"
                            : "bg-[#17171c] text-[#a1a1aa]"
                        }`}
                      >
                        {badgeInfo.badgeLabel}
                      </span>
                    )}
                  </div>
                );
              })
            )}
          </div>

          {/* Bottom Actions */}
          <div className="flex items-center gap-2 mt-auto pt-2.5 h-8">
            <span className={`text-[11.5px] ${textSub}`}>
              {t("quick_todo_keyboard_hint")}
            </span>

            <div className="flex-grow" />

            <button
              type="button"
              onClick={onOpenTodoList}
              className={`h-[30px] px-3 border-0 rounded-[9px] bg-transparent text-[12px] font-medium flex items-center gap-1.5 cursor-pointer transition-colors ${ghostBtn}`}
            >
              {t("quick_todo_open_full")}
              <svg
                width="13"
                height="13"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
              >
                <path d="m9 18 6-6-6-6" />
              </svg>
            </button>
          </div>
        </>
      )}
    </div>
  );
};
