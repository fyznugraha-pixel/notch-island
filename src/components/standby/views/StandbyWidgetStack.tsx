import React, { useCallback, useRef, useState } from "react";
import { ChevronUp, ChevronDown } from "lucide-react";
import { StandbyPalette } from "../standbyTheme";
import { Language } from "../../../services/i18n";
import { StandbyLeftWidget, StandbyRightWidget } from "../../../services/standbyService";
import { WeatherData } from "../../../services/weatherService";
import { PrayerScheduleData } from "../../../services/prayerService";
import { LyricsPayload, MediaPayload } from "../../../services/mediaLyricsStore";
import { PomodoroMode } from "../../../services/pomodoroService";
import { TodoItem } from "../../../services/todoUtils";
import { StandbyAnalogClockWidget } from "../widgets/StandbyAnalogClockWidget";
import { StandbyDigitalClockWidget, StandbyPowerState } from "../widgets/StandbyDigitalClockWidget";
import { StandbyCalendarWidget } from "../widgets/StandbyCalendarWidget";
import { StandbyWeatherPrayerWidget } from "../widgets/StandbyWeatherPrayerWidget";
import { StandbyMediaWidget } from "../widgets/StandbyMediaWidget";
import { StandbyFocusTodoWidget } from "../widgets/StandbyFocusTodoWidget";
import { StandbyHydrationMetricsWidget } from "../widgets/StandbyHydrationMetricsWidget";
import { createWheelStepTracker } from "./standbyWheelGesture";

const LEFT_ORDER: StandbyLeftWidget[] = ["clock_analog", "clock_digital", "pomodoro", "todo"];
const RIGHT_ORDER: StandbyRightWidget[] = ["weather_prayer", "media", "calendar", "hydration", "system"];

interface StandbyWidgetStackProps {
  now: Date;
  palette: StandbyPalette;
  language: Language;
  leftWidget: StandbyLeftWidget;
  rightWidget: StandbyRightWidget;
  onChangeLeft: (w: StandbyLeftWidget) => void;
  onChangeRight: (w: StandbyRightWidget) => void;
  interactiveControlsVisible: boolean;
  use24h: boolean;
  showSeconds: boolean;
  reducedMotion: boolean;
  deepEcoActive?: boolean;
  battery: StandbyPowerState | null;
  weather: WeatherData | null;
  weatherLoading: boolean;
  schedule: PrayerScheduleData;
  media: MediaPayload;
  lyrics: LyricsPayload;
  livePosition: number;
  liveDuration: number;
  activeLyricIndex: number;
  onSeekLocal: (pos: number) => void;
  pomoMode: PomodoroMode;
  remainingSec: number;
  totalSec: number;
  pomoRunning: boolean;
  onTogglePomo: () => void;
  onResetPomo: () => void;
  todos: TodoItem[];
  onToggleTodo: (id: string) => void;
}

function cycleList<T>(list: T[], current: T, delta: number): T {
  const idx = Math.max(0, list.indexOf(current));
  return list[(idx + delta + list.length) % list.length];
}

export const StandbyWidgetStack: React.FC<StandbyWidgetStackProps> = ({
  now,
  palette,
  language,
  leftWidget,
  rightWidget,
  onChangeLeft,
  onChangeRight,
  interactiveControlsVisible,
  use24h,
  showSeconds,
  reducedMotion,
  deepEcoActive = false,
  battery,
  weather,
  weatherLoading,
  schedule,
  media,
  lyrics,
  livePosition,
  liveDuration,
  activeLyricIndex,
  onSeekLocal,
  pomoMode,
  remainingSec,
  totalSec,
  pomoRunning,
  onTogglePomo,
  onResetPomo,
  todos,
  onToggleTodo,
}) => {
  const isId = language === "id";
  const leftWheelRef = useRef(createWheelStepTracker());
  const rightWheelRef = useRef(createWheelStepTracker());
  const [leftDir, setLeftDir] = useState<0 | 1 | -1>(0);
  const [rightDir, setRightDir] = useState<0 | 1 | -1>(0);

  const stepLeft = useCallback(
    (delta: 1 | -1) => {
      setLeftDir(delta);
      onChangeLeft(cycleList(LEFT_ORDER, leftWidget, delta));
    },
    [leftWidget, onChangeLeft],
  );

  const stepRight = useCallback(
    (delta: 1 | -1) => {
      setRightDir(delta);
      onChangeRight(cycleList(RIGHT_ORDER, rightWidget, delta));
    },
    [rightWidget, onChangeRight],
  );

  const handleSlotWheel = useCallback(
    (
      e: React.WheelEvent<HTMLDivElement>,
      tracker: ReturnType<typeof createWheelStepTracker>,
      onStep: (delta: 1 | -1) => void,
    ) => {
      // Ignore horizontal swipes so 2-finger horizontal jitter does not cycle vertical stacks
      if (Math.abs(e.deltaX) > Math.abs(e.deltaY)) return;
      const step = tracker.push({
        deltaY: e.deltaY,
        deltaMode: e.deltaMode,
        nowMs: performance.now(),
      });
      if (step !== 0) {
        onStep(step);
      }
    },
    [],
  );

  const renderLeft = () => {
    switch (leftWidget) {
      case "clock_analog":
        return (
          <StandbyAnalogClockWidget
            now={now}
            palette={palette}
            showSeconds={showSeconds}
            reducedMotion={reducedMotion}
            language={language}
          />
        );
      case "clock_digital":
        return (
          <StandbyDigitalClockWidget
            now={now}
            palette={palette}
            use24h={use24h}
            showSeconds={showSeconds}
            reducedMotion={reducedMotion}
            deepEcoActive={deepEcoActive}
            language={language}
            battery={battery}
          />
        );
      case "pomodoro":
      case "todo":
        return (
          <StandbyFocusTodoWidget
            mode={leftWidget}
            palette={palette}
            language={language}
            pomoMode={pomoMode}
            remainingSec={remainingSec}
            totalSec={totalSec}
            pomoRunning={pomoRunning}
            onTogglePomo={onTogglePomo}
            onResetPomo={onResetPomo}
            todos={todos}
            onToggleTodo={onToggleTodo}
          />
        );
    }
  };

  const renderRight = () => {
    switch (rightWidget) {
      case "weather_prayer":
        return (
          <StandbyWeatherPrayerWidget
            now={now}
            palette={palette}
            language={language}
            weather={weather}
            weatherLoading={weatherLoading}
            schedule={schedule}
          />
        );
      case "media":
        return (
          <StandbyMediaWidget
            media={media}
            lyrics={lyrics}
            livePosition={livePosition}
            liveDuration={liveDuration}
            activeLyricIndex={activeLyricIndex}
            onSeekLocal={onSeekLocal}
            palette={palette}
            language={language}
            reducedMotion={reducedMotion}
            deepEcoActive={deepEcoActive}
          />
        );
      case "calendar":
        return (
          <StandbyCalendarWidget
            now={now}
            palette={palette}
            language={language}
            todos={todos}
          />
        );
      case "hydration":
      case "system":
        return (
          <StandbyHydrationMetricsWidget
            mode={rightWidget}
            palette={palette}
            language={language}
          />
        );
    }
  };

  const renderCycler = (
    onStep: (delta: 1 | -1) => void,
    count: number,
    activeIndex: number,
    ariaPrefix: string,
  ) => (
    <div
      className={`flex flex-col items-center gap-1.5 transition-opacity duration-200 ${interactiveControlsVisible ? "opacity-100" : "opacity-0 pointer-events-none"
        }`}
    >
      <button
        type="button"
        aria-label={`${ariaPrefix} ${isId ? "sebelumnya" : "previous"}`}
        onClick={() => onStep(-1)}
        className="w-7 h-7 rounded-full flex items-center justify-center cursor-pointer transition-transform hover:scale-105 active:scale-95 focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#0a84ff]"
        style={{ backgroundColor: palette.controlBg, color: palette.textPrimary }}
      >
        <ChevronUp size={15} />
      </button>
      <div className="flex flex-col items-center gap-1.5 py-1">
        {Array.from({ length: count }, (_, idx) => {
          const isActive = idx === activeIndex;
          return (
            <span
              key={idx}
              className="w-1.5 rounded-full transition-all duration-300"
              style={{
                height: isActive ? 14 : 6,
                backgroundColor: isActive ? palette.textPrimary : palette.textSecondary,
                opacity: isActive ? 0.95 : 0.32,
              }}
            />
          );
        })}
      </div>
      <button
        type="button"
        aria-label={`${ariaPrefix} ${isId ? "berikutnya" : "next"}`}
        onClick={() => onStep(1)}
        className="w-7 h-7 rounded-full flex items-center justify-center cursor-pointer transition-transform hover:scale-105 active:scale-95 focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#0a84ff]"
        style={{ backgroundColor: palette.controlBg, color: palette.textPrimary }}
      >
        <ChevronDown size={15} />
      </button>
    </div>
  );

  const leftAnimClass =
    reducedMotion || leftDir === 0
      ? ""
      : leftDir > 0
      ? "animate-standby-widget-up"
      : "animate-standby-widget-down";

  const rightAnimClass =
    reducedMotion || rightDir === 0
      ? ""
      : rightDir > 0
      ? "animate-standby-widget-up"
      : "animate-standby-widget-down";

  return (
    <div className="w-[min(92vw,1560px)] max-h-screen mx-auto px-4 sm:px-8 py-16 grid grid-cols-1 md:grid-cols-2 gap-8 lg:gap-12 items-center">
      <div
        className="flex items-center gap-3 min-w-0"
        onWheel={(e) => handleSlotWheel(e, leftWheelRef.current, stepLeft)}
      >
        {renderCycler(
          stepLeft,
          LEFT_ORDER.length,
          Math.max(0, LEFT_ORDER.indexOf(leftWidget)),
          isId ? "Widget kiri" : "Left widget",
        )}
        <section
          aria-label={isId ? "Tumpukan widget kiri" : "Left widget stack"}
          className={`flex-1 min-w-0 ${
            leftWidget === "clock_analog"
              ? "flex items-center justify-center overflow-visible"
              : "overflow-hidden"
          }`}
          style={{
            height: "clamp(320px, 60vh, 580px)",
          }}
        >
          <div key={leftWidget} className={`w-full h-full ${leftAnimClass}`}>
            {renderLeft()}
          </div>
        </section>
      </div>

      <div
        className="flex items-center gap-3 min-w-0"
        onWheel={(e) => handleSlotWheel(e, rightWheelRef.current, stepRight)}
      >
        <section
          aria-label={isId ? "Tumpukan widget kanan" : "Right widget stack"}
          className="flex-1 min-w-0 overflow-hidden"
          style={{
            height: "clamp(320px, 60vh, 580px)",
          }}
        >
          <div key={rightWidget} className={`w-full h-full ${rightAnimClass}`}>
            {renderRight()}
          </div>
        </section>
        {renderCycler(
          stepRight,
          RIGHT_ORDER.length,
          Math.max(0, RIGHT_ORDER.indexOf(rightWidget)),
          isId ? "Widget kanan" : "Right widget",
        )}
      </div>
    </div>
  );
};
