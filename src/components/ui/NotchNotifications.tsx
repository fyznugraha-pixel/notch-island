import React, { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Bell,
  Check,
  ChevronDown,
  X,
  AlertCircle,
} from "lucide-react";
import { NotifPayload } from "../../types";
import { NotifIcon } from "./NotifIcon";
import { ScrollingText } from "./ScrollingText";
import { iosSpring } from "../../utils/iosMotion";
import { t, getLanguage } from "../../services/i18n";
import { PomodoroMode, formatSecondsMMSS } from "../../services/pomodoroService";
import { PomodoroCompleteAlert } from "../../hooks/usePomodoro";
import { TodoDeadlineAlert, IdleUrgentTodo } from "../../hooks/useTodoReminders";

export const UNIFORM_HUD_ICONS = new Set([
  "volume",
  "brightness",
  "battery",
  "bluetooth",
  "headphones",
  "usb",
  "capslock",
  "wifi",
]);

export function isUniformHudNotif(notif: NotifPayload | null): boolean {
  if (!notif) return false;
  if (notif.type === "greeting" || notif.icon === "sun" || notif.icon === "moon") return false;
  return UNIFORM_HUD_ICONS.has(notif.icon || "");
}

export interface ParsedNotifContent {
  isClipboard: boolean;
  isUrl: boolean;
  subtitle: string;
  senderShort: string;
  headline: string;
  secondaryText: string;
}

export function parseNotifContent(notif: NotifPayload): ParsedNotifContent {
  const isClipboard = notif.icon === "clipboard";
  const bodyText = (notif.body || "").trim();
  const isUrl = /^https?:\/\/|^www\.|[a-z0-9-]+\.(com|id|org|net|io|ai|dev)\//i.test(bodyText);

  let subtitle = notif.subtitle || notif.title;
  let senderShort = notif.title;
  let headline = notif.headline || bodyText || notif.title;
  let secondaryText = notif.secondaryText || "";

  if (isClipboard) {
    subtitle = isUrl ? t("clipboard_notif_link") : t("clipboard_notif_text");
    headline = bodyText || notif.title;
  } else if (!notif.subtitle && !notif.headline) {
    if (bodyText.includes(" - ")) {
      const parts = bodyText.split(" - ");
      const sender = parts[0].trim();
      const rest = parts.slice(1).join(" - ").trim();
      senderShort = sender || notif.title;
      subtitle = `${notif.title} · ${sender}`;
      if (rest.length > 50) {
        headline = sender;
        secondaryText = rest;
      } else {
        headline = rest;
      }
    } else if (bodyText) {
      subtitle = notif.title;
      headline = bodyText;
    }
  }

  if (subtitle.includes(" · ")) {
    senderShort = subtitle.split(" · ").pop()?.trim() || notif.title;
  }

  return {
    isClipboard,
    isUrl,
    subtitle,
    senderShort,
    headline,
    secondaryText,
  };
}

// ============================================================================
// 1. Uniform HUD Pill (Volume, Brightness, Battery, Bluetooth/TWS, USB, CapsLock)
// Single rounded-square icon box (no inner circle)
// ============================================================================
export const UniformHudPill: React.FC<{
  notif: NotifPayload;
  isLightMode: boolean;
  isBot: boolean;
  onClick?: (e?: React.MouseEvent) => void;
}> = ({ notif, isLightMode, isBot, onClick }) => {
  const percentMatch = notif.body?.match(/(\d+)\s*%/);
  const percentValue = percentMatch ? Math.max(0, Math.min(100, parseInt(percentMatch[1], 10))) : null;
  const isBarHud =
    (notif.icon === "volume" || notif.icon === "brightness" || notif.icon === "battery") &&
    percentValue !== null;

  const barColor =
    notif.icon === "brightness"
      ? "bg-amber-400"
      : notif.icon === "battery"
      ? percentValue !== null && percentValue <= 20
        ? "bg-rose-500"
        : isLightMode
        ? "bg-emerald-700"
        : "bg-[#34c759]"
      : "bg-[#3882F6]";

  return (
    <motion.div
      onClick={onClick}
      initial={{ opacity: 0, y: isBot ? -6 : 6, scale: 0.94, filter: "blur(4px)" }}
      animate={{
        opacity: 1,
        y: 0,
        scale: 1,
        filter: "blur(0px)",
        transitionEnd: { filter: "none", transform: "none" },
      }}
      exit={{ opacity: 0, y: isBot ? 6 : -6, scale: 0.94, filter: "blur(4px)" }}
      transition={iosSpring.snappy}
      className="absolute inset-0 z-40 flex items-center justify-between gap-3 px-4 cursor-pointer select-none overflow-hidden"
    >
      <div className="flex items-center gap-2.5 min-w-0 flex-1">
        <NotifIcon type={notif.icon} size={17} boxClassName="w-8 h-8 rounded-[10px]" />
        <div className="flex flex-col justify-center min-w-0 flex-1 overflow-hidden">
          <ScrollingText
            text={notif.title}
            className={`text-[12.5px] font-semibold tracking-tight leading-tight ${
              isLightMode ? "text-[#1d1d1f]" : "text-white"
            }`}
          />
          {!isBarHud && notif.body && (
            <ScrollingText
              text={notif.body}
              className="text-[11px] font-medium text-[#a1a1aa] leading-tight mt-0.5"
            />
          )}
          {isBarHud && (
            <div className={`w-full h-1.5 ${isLightMode ? "bg-black/10" : "bg-white/15"} rounded-full overflow-hidden mt-1.5`}>
              <div
                style={{ width: `${percentValue}%` }}
                className={`h-full rounded-full transition-[width] duration-75 ease-out ${barColor}`}
              />
            </div>
          )}
        </div>
      </div>

      {isBarHud ? (
        <span
          className={`text-[13px] font-bold tabular-nums shrink-0 min-w-[36px] text-right ${
            notif.icon === "battery"
              ? isLightMode
                ? "text-emerald-700"
                : "text-[#34c759]"
              : isLightMode
              ? "text-[#1d1d1f]"
              : "text-white"
          }`}
        >
          {percentValue}%
        </span>
      ) : (
        <div className="w-2 h-2 rounded-full bg-[#3882F6] shadow-[0_0_8px_#3882F6] shrink-0" />
      )}
    </motion.div>
  );
};

// ============================================================================
// 2. Auto-Layout & Streak Notification Card (Boards 13, 14, 14b)
// ============================================================================
export const AutoLayoutNotifCard: React.FC<{
  notif: NotifPayload;
  queuedNotifs?: NotifPayload[];
  durationMs: number;
  isBot: boolean;
  onOpen: (e?: React.MouseEvent, targetNotif?: NotifPayload) => void;
  onDismiss: (e: React.MouseEvent) => void;
  onDismissAll?: (e: React.MouseEvent) => void;
}> = ({ notif, queuedNotifs = [], durationMs, isBot, onOpen, onDismiss, onDismissAll }) => {
  const { isClipboard, isUrl, subtitle, headline, secondaryText } = parseNotifContent(notif);
  const olderNotifs = queuedNotifs.filter((n) => !isUniformHudNotif(n) && n.icon !== "clipboard").slice(0, 2);
  const isStreak = !isClipboard && olderNotifs.length > 0;
  const totalCount = 1 + olderNotifs.length;

  return (
    <motion.div
      onClick={(e) => onOpen(e, notif)}
      initial={{ opacity: 0, y: isBot ? -8 : 8, scale: 0.95, filter: "blur(6px)" }}
      animate={{
        opacity: 1,
        y: 0,
        scale: 1,
        filter: "blur(0px)",
        transitionEnd: { filter: "none", transform: "none" },
      }}
      exit={{ opacity: 0, y: isBot ? 8 : -8, scale: 0.95, filter: "blur(6px)" }}
      transition={iosSpring.snappy}
      className="absolute inset-0 z-40 flex flex-col justify-center px-4 py-3 cursor-pointer select-none overflow-hidden group"
    >
      {/* Streak Header (Board 14) */}
      {isStreak && (
        <div className="flex items-center justify-between h-[18px] mb-2 shrink-0">
          <span className="text-[10.5px] font-semibold tracking-[0.08em] text-[#a1a1aa] uppercase">
            {totalCount} {t("notif_streak_count")}
          </span>
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              if (onDismissAll) onDismissAll(e);
              else onDismiss(e);
            }}
            className="h-[20px] px-2 rounded-[6px] text-[#a1a1aa] hover:text-white hover:bg-white/[0.08] text-[11px] font-medium cursor-pointer transition-colors"
          >
            {t("notif_close_all")}
          </button>
        </div>
      )}

      {/* Primary Notification Row */}
      <div className={`flex ${secondaryText || headline.length > 36 ? "items-start" : "items-center"} gap-3 min-w-0 w-full`}>
        <NotifIcon
          type={notif.icon}
          size={20}
          boxClassName="w-[38px] h-[38px] rounded-[11px]"
          isUrl={isUrl}
        />

        <div className="min-w-0 flex-1">
          <div className="flex items-center justify-between gap-2">
            <div className="text-[11.5px] font-medium text-[#a1a1aa] truncate flex items-center gap-1.5">
              <span className="truncate">{subtitle}</span>
              {isStreak ? (
                <>
                  <span>·</span>
                  <span className="shrink-0 text-white/40">{t("notif_just_now")}</span>
                </>
              ) : (
                <span className="text-[10px] text-white/40 shrink-0">{t("notif_just_now")}</span>
              )}
            </div>

            {!isClipboard && !isStreak && (
              <div className="flex items-center gap-1.5 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    onOpen(e, notif);
                  }}
                  className="h-[22px] px-2 rounded-[7px] bg-[#3882F6] hover:bg-[#2563eb] text-white text-[11px] font-semibold cursor-pointer transition-colors"
                >
                  {t("notif_open")}
                </button>
                <button
                  type="button"
                  onClick={onDismiss}
                  className="h-[22px] px-1.5 rounded-[7px] border border-[#3a3a43] hover:bg-white/10 text-[#e4e4e7] text-[11px] font-medium cursor-pointer transition-colors"
                >
                  {t("notif_dismiss")}
                </button>
              </div>
            )}
          </div>

          <div
            className={`${
              isClipboard
                ? "text-[14px]"
                : secondaryText
                ? "text-[14.5px]"
                : headline.length <= 28
                ? "text-[16px]"
                : "text-[14.5px]"
            } font-semibold tracking-[-0.01em] text-white leading-[1.3] mt-0.5 ${
              isClipboard && isUrl ? "truncate" : "line-clamp-2 break-words"
            }`}
          >
            {headline}
          </div>

          {secondaryText && (
            <div className="text-[12.5px] text-[#c4c4cc] leading-[1.4] mt-0.5 line-clamp-2">
              {secondaryText}
            </div>
          )}
        </div>
      </div>

      {/* Streak Action Buttons & Older Compact Items (Board 14) */}
      {isStreak && (
        <>
          <div className="flex items-center gap-2 pl-[50px] mt-2 shrink-0">
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onOpen(e, notif);
              }}
              className="h-[28px] px-3.5 rounded-[8px] bg-[#3882F6] hover:bg-[#2563eb] text-white text-[11.5px] font-semibold cursor-pointer transition-colors shadow-sm"
            >
              {t("notif_open")}
            </button>
            <button
              type="button"
              onClick={onDismiss}
              className="h-[28px] px-3 rounded-[8px] bg-white/[0.08] hover:bg-white/[0.14] text-[#e4e4e7] text-[11.5px] font-medium cursor-pointer transition-colors"
            >
              {t("notif_dismiss")}
            </button>
          </div>

          <div className="h-px bg-white/10 my-2 shrink-0" />

          <div className="flex flex-col gap-1.5 shrink-0">
            {olderNotifs.map((older, idx) => {
              const parsedOlder = parseNotifContent(older);
              return (
                <div
                  key={`${older.title}_${idx}`}
                  onClick={(e) => {
                    e.stopPropagation();
                    onOpen(e, older);
                  }}
                  className="flex items-center gap-2.5 h-[30px] rounded-[8px] px-1 hover:bg-white/[0.04] transition-colors cursor-pointer"
                >
                  <NotifIcon
                    type={older.icon}
                    size={14}
                    boxClassName="w-[26px] h-[26px] rounded-[8px]"
                  />
                  <span className="text-[12.5px] font-semibold text-white shrink-0 max-w-[110px] truncate">
                    {parsedOlder.senderShort}
                  </span>
                  <span className="text-[12.5px] text-[#a1a1aa] flex-1 min-w-0 truncate">
                    {parsedOlder.headline}
                  </span>
                  <span className="text-[11px] text-[#a1a1aa] tabular-nums shrink-0">
                    {t("notif_just_now")}
                  </span>
                </div>
              );
            })}
          </div>
        </>
      )}

      {/* Bottom progress indicator bar */}
      <motion.div
        key={`progress_${notif.title}_${notif.body}`}
        initial={{ width: "100%" }}
        animate={{ width: "0%" }}
        transition={{ duration: durationMs / 1000, ease: "linear" }}
        className="absolute left-0 bottom-0 h-[3px] bg-white/[0.28]"
      />
    </motion.div>
  );
};

// ============================================================================
// 3. Board 11: Expanded To-Do Deadline Reminder Alert
// ============================================================================
export const TodoDeadlineAlertCard: React.FC<{
  alert: TodoDeadlineAlert;
  onSnooze: (minutes: number) => void;
  onComplete: () => void;
  onDismiss: () => void;
}> = ({ alert, onSnooze, onComplete, onDismiss }) => {
  const [showSnoozeMenu, setShowSnoozeMenu] = useState(false);
  const { task, diffMinutes } = alert;

  const isOverdue = diffMinutes <= 0;
  const headerText = isOverdue
    ? t("todo_alert_due_now")
    : t("todo_alert_due_in", { min: Math.max(1, diffMinutes), m: Math.max(1, diffMinutes) });

  const dueTimeStr = task.dueAt
    ? new Date(task.dueAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", hour12: false })
    : "";

  const progressRatio = isOverdue ? 1 : Math.max(0.15, Math.min(1, (60 - diffMinutes) / 60));
  const circumference = 2 * Math.PI * 22;
  const dashArray = `${(progressRatio * circumference).toFixed(1)} ${circumference.toFixed(1)}`;

  return (
    <motion.div
      key={`todo_deadline_alert_${task.id}`}
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.95 }}
      transition={iosSpring.snappy}
      onClick={(e) => e.stopPropagation()}
      className="absolute inset-0 flex items-center gap-3.5 px-5 text-white select-none"
    >
      {/* Bell with countdown ring */}
      <div className="relative w-[50px] h-[50px] shrink-0">
        <svg width="50" height="50" viewBox="0 0 50 50" className="absolute inset-0">
          <circle cx="25" cy="25" r="22" fill="none" stroke="#2a2a31" strokeWidth="3" />
          <circle
            cx="25"
            cy="25"
            r="22"
            fill="none"
            stroke={isOverdue ? "#ff8a7a" : "#fbbf24"}
            strokeWidth="3"
            strokeLinecap="round"
            strokeDasharray={dashArray}
            transform="rotate(-90 25 25)"
          />
        </svg>
        <div
          className={`absolute left-[6px] top-[6px] w-[38px] h-[38px] rounded-full flex items-center justify-center ${
            isOverdue
              ? "bg-[#ff8a7a]/16 text-[#ff8a7a]"
              : "bg-[#fbbf24]/14 text-[#fbbf24]"
          }`}
        >
          <Bell size={18} strokeWidth={2.1} />
        </div>
      </div>

      {/* Text info */}
      <div className="flex-1 min-w-0">
        <div
          className={`text-[10px] font-bold tracking-[0.08em] uppercase ${
            isOverdue ? "text-[#ff8a7a]" : "text-[#fbbf24]"
          }`}
        >
          {headerText}
        </div>
        <div className="text-[16px] font-semibold tracking-tight text-white truncate mt-0.5">
          {task.text}
        </div>
        <div className="text-[11.5px] text-[#a1a1aa] tabular-nums mt-0.5">
          {t("todo_due_time_meta", { time: dueTimeStr })}
        </div>
      </div>

      {/* Actions */}
      <div className="flex items-center gap-2 shrink-0 relative">
        <div className="flex h-[36px] rounded-[11px] border border-[#3a3a43] overflow-hidden bg-white/[0.02]">
          <button
            type="button"
            onClick={() => onSnooze(10)}
            className="px-3 text-[#e4e4e7] hover:bg-white/[0.06] text-[12px] font-medium cursor-pointer transition-colors"
          >
            {t("todo_snooze_10m")}
          </button>
          <button
            type="button"
            onClick={() => setShowSnoozeMenu((v) => !v)}
            className="w-7 border-l border-[#3a3a43] text-[#c4c4cc] hover:bg-white/[0.06] flex items-center justify-center cursor-pointer transition-colors"
          >
            <ChevronDown size={13} />
          </button>
        </div>

        <AnimatePresence>
          {showSnoozeMenu && (
            <motion.div
              initial={{ opacity: 0, y: -4, scale: 0.95 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: -4, scale: 0.95 }}
              className="absolute right-[95px] bottom-[42px] bg-[#17171c] border border-[#2e2e38] rounded-[11px] p-1 shadow-xl flex gap-1 z-50"
            >
              {[5, 15, 30, 60].map((m) => (
                <button
                  key={m}
                  type="button"
                  onClick={() => {
                    setShowSnoozeMenu(false);
                    onSnooze(m);
                  }}
                  className="px-2 py-1 rounded-[7px] text-[11px] font-medium text-[#e4e4e7] hover:bg-white/10 cursor-pointer whitespace-nowrap"
                >
                  +{m}m
                </button>
              ))}
            </motion.div>
          )}
        </AnimatePresence>

        <button
          type="button"
          onClick={onComplete}
          className="h-[36px] px-3.5 rounded-[11px] bg-[#3882F6] hover:bg-[#2563eb] text-white text-[12px] font-semibold flex items-center gap-1.5 cursor-pointer transition-colors"
        >
          <Check size={14} strokeWidth={2.6} />
          <span>{t("todo_done_btn")}</span>
        </button>
      </div>

      <button
        type="button"
        onClick={onDismiss}
        className="absolute right-3 top-2.5 w-5 h-5 rounded-full text-[#a1a1aa] hover:text-white hover:bg-white/10 flex items-center justify-center cursor-pointer transition-colors"
      >
        <X size={11} strokeWidth={2.5} />
      </button>
    </motion.div>
  );
};

// ============================================================================
// 4. Board 12: Idle Notch To-Do Countdown Pill
// ============================================================================
export const TodoIdleCountdownPill: React.FC<{
  urgent: IdleUrgentTodo;
  onClick: () => void;
}> = ({ urgent, onClick }) => {
  const { task, diffMinutes } = urgent;
  const isOverdue = diffMinutes < 0;
  const isUrgentSoon = diffMinutes >= 0 && diffMinutes <= 10;

  const strokeColor = isOverdue || isUrgentSoon ? "#ff9b8f" : "#fbbf24";
  const circumference = 56.5;
  const ratio = isOverdue ? 1 : Math.max(0.12, Math.min(1, diffMinutes / 45));
  const dash = `${(ratio * circumference).toFixed(1)} ${circumference}`;

  const unitMin = getLanguage() === "id" ? "mnt" : "min";
  const badgeText = isOverdue
    ? t("todo_overdue_by", { time: `${Math.abs(diffMinutes)} ${unitMin}`, m: Math.abs(diffMinutes) })
    : `${Math.max(1, diffMinutes)} ${unitMin}`;

  return (
    <motion.div
      key="todo_idle_countdown"
      initial={{ opacity: 0, scale: 0.96 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.96 }}
      onClick={onClick}
      className="absolute inset-0 flex items-center justify-between px-4 cursor-pointer select-none text-white"
    >
      <div className="flex items-center gap-2 min-w-0">
        {isOverdue ? (
          <AlertCircle size={15} className="text-[#ff9b8f] shrink-0" />
        ) : (
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" className="shrink-0">
            <circle cx="12" cy="12" r="9" stroke="#3a3a43" strokeWidth="3" />
            <circle
              cx="12"
              cy="12"
              r="9"
              stroke={strokeColor}
              strokeWidth="3"
              strokeLinecap="round"
              strokeDasharray={dash}
              transform="rotate(-90 12 12)"
            />
          </svg>
        )}
        <span className="text-[12px] font-medium truncate max-w-[140px]">{task.text}</span>
      </div>

      {isOverdue ? (
        <span className="text-[11.5px] font-semibold text-[#ff9b8f] bg-[#ff6b5a]/14 rounded-[8px] px-2 py-0.5 tabular-nums shrink-0">
          {badgeText}
        </span>
      ) : (
        <span
          className="text-[12px] font-semibold tabular-nums shrink-0"
          style={{ color: strokeColor }}
        >
          {badgeText}
        </span>
      )}
    </motion.div>
  );
};

// ============================================================================
// 5. Board 16: Idle Notch Pomodoro Timer Pill
// ============================================================================
export const PomodoroIdlePill: React.FC<{
  mode: PomodoroMode;
  remainingSec: number;
  totalSec: number;
  isRunning: boolean;
  taskTitle?: string | null;
  onClick: () => void;
}> = ({ mode, remainingSec, totalSec, isRunning, taskTitle, onClick }) => {
  const circumference = 56.5;
  const progress = totalSec > 0 ? Math.max(0, Math.min(1, remainingSec / totalSec)) : 0;
  const dash = `${(progress * circumference).toFixed(1)} ${circumference}`;

  const ringColor = !isRunning
    ? "#7a7a86"
    : mode === "focus"
    ? "#ff8a7a"
    : "#5eead4";

  const timeColor = !isRunning
    ? "text-[#a1a1aa]"
    : mode === "focus"
    ? "text-white"
    : "text-[#5eead4]";

  return (
    <motion.div
      key="pomo_idle"
      initial={{ opacity: 0, scale: 0.96 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.96 }}
      onClick={onClick}
      className="absolute inset-0 flex items-center justify-between px-5 cursor-pointer select-none text-white"
    >
      <div className="flex items-center gap-2 min-w-0">
        <div className="relative w-5 h-5 shrink-0">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" className="absolute inset-0">
            <circle cx="12" cy="12" r="9" stroke="#2a2a31" strokeWidth="3" />
            <circle
              cx="12"
              cy="12"
              r="9"
              stroke={ringColor}
              strokeWidth="3"
              strokeLinecap="round"
              strokeDasharray={dash}
              transform="rotate(-90 12 12)"
            />
          </svg>
          {!isRunning && (
            <svg width="20" height="20" viewBox="0 0 24 24" fill="#c4c4cc" className="absolute inset-0">
              <rect x="9" y="8.5" width="2" height="7" rx="0.8" />
              <rect x="13" y="8.5" width="2" height="7" rx="0.8" />
            </svg>
          )}
        </div>
        {taskTitle && (
          <span className="text-[12px] font-medium text-white/85 truncate max-w-[125px]">
            {taskTitle}
          </span>
        )}
      </div>

      <span className={`text-[14px] font-semibold tabular-nums tracking-[0.01em] ${timeColor}`}>
        {formatSecondsMMSS(remainingSec)}
      </span>
    </motion.div>
  );
};

// ============================================================================
// 6. Board 17: Expanded Pomodoro Session Complete Alert
// ============================================================================
export const PomodoroCompleteAlertCard: React.FC<{
  alert: PomodoroCompleteAlert;
  focusedTaskTitle?: string | null;
  todayFocusMinutes: number;
  isLightMode?: boolean;
  onAccept: () => void;
  onSkip: () => void;
  onDismiss: () => void;
}> = ({
  alert,
  focusedTaskTitle,
  todayFocusMinutes,
  isLightMode = false,
  onAccept,
  onSkip,
  onDismiss,
}) => {
  const isFocusDone = alert.finishedMode === "focus";
  const headerLabel = isFocusDone ? t("pomo_done_focus_title") : t("pomo_done_break_title");
  const mainTitle = isFocusDone
    ? t("pomo_time_for_break", { min: alert.nextDurationMin })
    : t("pomo_time_for_focus", { min: alert.nextDurationMin });

  const actionLabel = isFocusDone ? t("pomo_start_break") : t("pomo_start_focus");

  return (
    <motion.div
      key="pomo_complete_alert"
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.95 }}
      transition={iosSpring.snappy}
      onClick={(e) => e.stopPropagation()}
      className={`absolute inset-0 flex items-center gap-3.5 px-5 select-none ${
        isLightMode ? "text-[#1d1d1f]" : "text-white"
      }`}
    >
      {/* Full ring with checkmark */}
      <div className="relative w-[50px] h-[50px] shrink-0">
        <svg width="50" height="50" viewBox="0 0 50 50" className="absolute inset-0">
          <circle
            cx="25"
            cy="25"
            r="22"
            fill="none"
            stroke={
              isFocusDone
                ? isLightMode
                  ? "#f43f5e"
                  : "#ff8a7a"
                : isLightMode
                ? "#0d9488"
                : "#5eead4"
            }
            strokeWidth="3"
          />
        </svg>
        <div
          className={`absolute left-[6px] top-[6px] w-[38px] h-[38px] rounded-full flex items-center justify-center ${
            isFocusDone
              ? isLightMode
                ? "bg-rose-50 text-rose-600"
                : "bg-[#ff8a7a]/16 text-[#ff9b8f]"
              : isLightMode
              ? "bg-teal-50 text-teal-700"
              : "bg-[#5eead4]/16 text-[#5eead4]"
          }`}
        >
          <Check size={20} strokeWidth={2.6} />
        </div>
      </div>

      <div className="flex-1 min-w-0">
        <div
          className={`text-[10px] font-bold tracking-[0.08em] uppercase ${
            isFocusDone
              ? isLightMode
                ? "text-rose-600"
                : "text-[#ff9b8f]"
              : isLightMode
              ? "text-teal-700"
              : "text-[#5eead4]"
          }`}
        >
          {headerLabel}
        </div>
        <div
          className={`text-[16px] font-semibold tracking-tight truncate mt-0.5 ${
            isLightMode ? "text-[#1d1d1f]" : "text-white"
          }`}
        >
          {mainTitle}
        </div>
        <div
          className={`text-[11.5px] truncate mt-0.5 ${
            isLightMode ? "text-neutral-500" : "text-[#a1a1aa]"
          }`}
        >
          {focusedTaskTitle ? `${focusedTaskTitle} · ` : ""}
          {t("pomo_cycle_label", {
            curr: alert.cycleSession,
            current: alert.cycleSession,
            total: alert.sessionsPerCycle,
          })}{" "}
          · {todayFocusMinutes} {t("unit_min")}
        </div>
      </div>

      <div className="flex items-center gap-2 shrink-0">
        <button
          type="button"
          onClick={onSkip}
          className={`h-[36px] px-3 rounded-[11px] border text-[12px] font-medium cursor-pointer transition-colors ${
            isLightMode
              ? "border-black/15 bg-black/5 hover:bg-black/10 text-[#1d1d1f]"
              : "border-[#3a3a43] hover:bg-white/[0.06] text-[#e4e4e7]"
          }`}
        >
          {t("pomo_skip")}
        </button>
        <button
          type="button"
          onClick={onAccept}
          className={`h-[36px] px-4 rounded-[11px] text-[12px] font-semibold cursor-pointer transition-colors ${
            isFocusDone
              ? "bg-[#5eead4] hover:bg-[#4fd1bd] text-[#04201c]"
              : "bg-[#ff8a7a] hover:bg-[#ff7664] text-[#1a0907]"
          }`}
        >
          {actionLabel}
        </button>
      </div>

      <button
        type="button"
        onClick={onDismiss}
        className={`absolute right-3 top-2.5 w-5 h-5 rounded-full flex items-center justify-center cursor-pointer transition-colors ${
          isLightMode
            ? "text-neutral-400 hover:text-black hover:bg-black/5"
            : "text-[#a1a1aa] hover:text-white hover:bg-white/10"
        }`}
      >
        <X size={11} strokeWidth={2.5} />
      </button>
    </motion.div>
  );
};
