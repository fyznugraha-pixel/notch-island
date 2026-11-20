import React from "react";
import { CheckCircle2 } from "lucide-react";
import { StandbyPalette } from "../standbyTheme";
import { Language } from "../../../services/i18n";
import { TodoItem } from "../../../services/todoUtils";

interface StandbyCalendarWidgetProps {
  now: Date;
  palette: StandbyPalette;
  language: Language;
  todos: TodoItem[];
}

export const StandbyCalendarWidget: React.FC<StandbyCalendarWidgetProps> = ({
  now,
  palette,
  language,
  todos,
}) => {
  const isId = language === "id";
  const locale = isId ? "id-ID" : "en-US";
  const year = now.getFullYear();
  const month = now.getMonth();
  const todayDate = now.getDate();

  const firstDayOfMonth = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const monthLabel = now.toLocaleDateString(locale, { month: "long", year: "numeric" }).toUpperCase();
  const dayNames = isId
    ? ["M", "S", "S", "R", "K", "J", "S"]
    : ["S", "M", "T", "W", "T", "F", "S"];

  const cells: (number | null)[] = [];
  for (let i = 0; i < firstDayOfMonth; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(d);
  while (cells.length % 7 !== 0) cells.push(null);

  const pendingCount = todos.filter((t) => !t.completed).length;

  return (
    <div className="flex flex-col justify-between w-full h-full px-3 sm:px-5 py-2 select-none overflow-hidden">
      <div className="flex items-center justify-between gap-2 shrink-0">
        <span
          className="font-bold tracking-[0.08em] truncate"
          style={{
            color: palette.night ? palette.textPrimary : "#ff453a",
            fontSize: "clamp(13px, min(1.3vw, 2.2vh), 18px)",
          }}
        >
          {monthLabel}
        </span>
        <span
          className="flex items-center gap-1.5 text-[12.5px] font-medium px-3 py-1 rounded-full shrink-0"
          style={{ backgroundColor: palette.mutedChipBg, color: palette.textSecondary }}
        >
          <CheckCircle2 size={13} />
          <span className="tabular-nums">
            {pendingCount > 0
              ? isId
                ? `${pendingCount} tugas aktif`
                : `${pendingCount} pending`
              : isId
              ? "Semua selesai"
              : "All clear"}
          </span>
        </span>
      </div>

      <div className="grid grid-cols-7 gap-y-1 text-center my-auto pt-2">
        {dayNames.map((name, idx) => (
          <div
            key={`${name}-${idx}`}
            className="text-[11.5px] font-bold pb-1"
            style={{ color: palette.textSecondary }}
          >
            {name}
          </div>
        ))}
        {cells.map((day, idx) => {
          const isToday = day === todayDate;
          return (
            <div
              key={idx}
              className="flex items-center justify-center"
              style={{ height: "clamp(26px, min(4vw, 4.2vh), 40px)" }}
            >
              {day !== null && (
                <span
                  className="rounded-full flex items-center justify-center font-semibold tabular-nums"
                  style={{
                    width: "clamp(26px, min(3.8vw, 4vh), 38px)",
                    height: "clamp(26px, min(3.8vw, 4vh), 38px)",
                    fontSize: "clamp(12.5px, min(1.25vw, 2.1vh), 17px)",
                    ...(isToday
                      ? {
                          backgroundColor: palette.night ? palette.textPrimary : "#ff453a",
                          color: "#000000",
                          fontWeight: 800,
                        }
                      : {
                          color: palette.textPrimary,
                        }),
                  }}
                >
                  {day}
                </span>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
};
