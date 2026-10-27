import React, { useState, useEffect } from "react";
import { getLanguage } from "../../../services/i18n";

export interface WaterHourPickerProps {
  value: number; // 0 to 23
  onChange: (hour: number) => void;
  isLightMode: boolean;
  ariaLabel?: string;
}

export const WaterHourPicker: React.FC<WaterHourPickerProps> = ({
  value,
  onChange,
  isLightMode,
  ariaLabel,
}) => {
  const isEn = getLanguage() === "en";
  const defaultAriaLabel = ariaLabel || (isEn ? "Hour input" : "Input jam");
  const formatHour = (h: number) => `${String(Math.max(0, Math.min(23, h))).padStart(2, "0")}.00`;
  const [inputText, setInputText] = useState(() => formatHour(value));

  // Keep in sync with external value
  useEffect(() => {
    setInputText(formatHour(value));
  }, [value]);

  const commitValue = (text: string) => {
    const cleaned = text.trim();
    // Accept "3", "03", "03.00", "03:00", "3.00", "21", "21:30"
    const match = cleaned.match(/^(\d{1,2})/);
    if (match) {
      const parsedHour = parseInt(match[1], 10);
      if (!isNaN(parsedHour) && parsedHour >= 0 && parsedHour <= 23) {
        onChange(parsedHour);
        setInputText(formatHour(parsedHour));
        return;
      }
    }
    // Revert if invalid
    setInputText(formatHour(value));
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      commitValue(inputText);
      (e.target as HTMLInputElement).blur();
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      const next = (value + 1) % 24;
      onChange(next);
      setInputText(formatHour(next));
    } else if (e.key === "ArrowDown") {
      e.preventDefault();
      const prev = (value + 23) % 24;
      onChange(prev);
      setInputText(formatHour(prev));
    }
  };

  const btnBg = isLightMode ? "#E7ECF3" : "#17171c";
  const btnColor = isLightMode ? "#344054" : "#e4e4e7";

  return (
    <div
      className="inline-flex items-center gap-1.5 h-[30px] px-2.5 rounded-full border border-transparent focus-within:border-sky-500/50 focus-within:ring-1 focus-within:ring-sky-500/30 transition-all select-none"
      style={{ background: btnBg, color: btnColor }}
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
        className="shrink-0 opacity-70 pointer-events-none"
        aria-hidden="true"
      >
        <path d="M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM12 7v5l3 2" />
      </svg>
      <input
        type="text"
        value={inputText}
        onChange={(e) => setInputText(e.target.value)}
        onBlur={() => commitValue(inputText)}
        onKeyDown={handleKeyDown}
        onFocus={(e) => e.target.select()}
        aria-label={defaultAriaLabel}
        title={isEn ? "Type hour directly (e.g. 03:00, 3, 21)" : "Ketik jam langsung (contoh: 03.00, 3, 21)"}
        className="w-[44px] bg-transparent text-center font-bold text-[13px] border-0 outline-none tabular-nums p-0 cursor-text"
        style={{ color: isLightMode ? "#101828" : "#ffffff" }}
      />
    </div>
  );
};
