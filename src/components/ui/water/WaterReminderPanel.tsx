import React, { useState, useEffect, useCallback } from "react";
import { AnimatePresence, motion } from "framer-motion";
import {
  WATER_STORAGE_KEY,
  WaterData,
  loadWaterData,
  logDrink,
  updateWaterSettings,
  StreakCelebrationEvent,
} from "../../../services/waterService";
import { listenCrossWindowEvent } from "../../../utils/crossWindowSync";
import { playWaterDrinkSound } from "../../../services/soundService";
import { WaterCapsuleView } from "./WaterCapsuleView";
import { WaterStreakView } from "./WaterStreakView";
import { WaterHistoryView } from "./WaterHistoryView";
import { WaterSettingsView } from "./WaterSettingsView";
import { StreakCelebrationModal } from "./StreakCelebrationModal";

export type WaterPanelSubView = "capsule" | "streak" | "history" | "settings";

export interface WaterReminderPanelProps {
  optLanguage?: string;
  isLightMode?: boolean;
  onHeightChange?: (height: number) => void;
  onTriggerToast?: (type: "logged" | "streak_increased", amountMl?: number) => void;
}

export const WaterReminderPanel: React.FC<WaterReminderPanelProps> = ({
  isLightMode: propIsLightMode,
  onHeightChange,
  onTriggerToast,
}) => {
  const [data, setData] = useState<WaterData>(() => loadWaterData());
  const [subView, setSubView] = useState<WaterPanelSubView>("capsule");
  const [celebration, setCelebration] = useState<StreakCelebrationEvent | null>(null);

  // Detect light mode if not passed
  const isLightMode =
    propIsLightMode ??
    (typeof document !== "undefined" && document.documentElement.classList.contains("light"));

  // Live data sync across components
  useEffect(() => {
    const unsubChanged = listenCrossWindowEvent<WaterData>("gili_water_changed", (detail) => {
      setData(detail ?? loadWaterData());
    });
    const unsubCelebration = listenCrossWindowEvent<StreakCelebrationEvent>("gili_streak_celebration", (detail) => {
      if (detail) setCelebration(detail);
    });
    const onStorage = (e: StorageEvent) => {
      if (e.key === WATER_STORAGE_KEY) {
        setData(loadWaterData());
      }
    };
    window.addEventListener("storage", onStorage);
    return () => {
      unsubChanged();
      unsubCelebration();
      window.removeEventListener("storage", onStorage);
    };
  }, []);

  // Update panel height to slim unified tab height
  useEffect(() => {
    onHeightChange?.(292);
  }, [subView, onHeightChange]);

  const handleDrink = useCallback(() => {
    const cupMl = data.settings.defaultCupMl || 250;
    const result = logDrink(cupMl);
    playWaterDrinkSound();
    if (result.celebration) {
      setCelebration(result.celebration);
    } else {
      onTriggerToast?.("logged", cupMl);
    }
  }, [data.settings.defaultCupMl, onTriggerToast]);

  const handleAdjustCup = useCallback((delta: number) => {
    const next = Math.max(50, Math.min(1000, data.settings.defaultCupMl + delta));
    updateWaterSettings({ defaultCupMl: next });
  }, [data.settings.defaultCupMl]);

  return (
    <div
      className="w-full h-full flex flex-col justify-start relative overflow-hidden"
      style={{
        padding: "0 28px",
        boxSizing: "border-box",
      }}
    >
      <AnimatePresence mode="wait" initial={false}>
        {subView === "capsule" && (
          <motion.div
            key="capsule"
            initial={{ opacity: 0, scale: 0.98 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.98 }}
            transition={{ duration: 0.18 }}
            className="w-full h-full flex flex-col"
          >
            <WaterCapsuleView
              data={data}
              isLightMode={isLightMode}
              onDrink={handleDrink}
              onAdjustCup={handleAdjustCup}
              onOpenStreak={() => setSubView("streak")}
              onOpenHistory={() => setSubView("history")}
              onOpenSettings={() => setSubView("settings")}
            />
          </motion.div>
        )}

        {subView === "streak" && (
          <motion.div
            key="streak"
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -20 }}
            transition={{ duration: 0.2 }}
            className="w-full h-full flex flex-col"
          >
            <WaterStreakView
              data={data}
              isLightMode={isLightMode}
              onBack={() => setSubView("capsule")}
            />
          </motion.div>
        )}

        {subView === "history" && (
          <motion.div
            key="history"
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -20 }}
            transition={{ duration: 0.2 }}
            className="w-full h-full flex flex-col"
          >
            <WaterHistoryView
              data={data}
              isLightMode={isLightMode}
              onBack={() => setSubView("capsule")}
              onOpenSettings={() => setSubView("settings")}
            />
          </motion.div>
        )}

        {subView === "settings" && (
          <motion.div
            key="settings"
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -20 }}
            transition={{ duration: 0.2 }}
            className="w-full h-full flex flex-col"
          >
            <WaterSettingsView
              data={data}
              isLightMode={isLightMode}
              onBack={() => setSubView("capsule")}
            />
          </motion.div>
        )}
      </AnimatePresence>

      {/* Streak Opened / Checkpoint Reached Milestone Celebration Overlay */}
      <AnimatePresence>
        {celebration && (
          <StreakCelebrationModal
            type={celebration.type}
            streakDays={celebration.streakDays}
            isLightMode={isLightMode}
            onClose={() => setCelebration(null)}
          />
        )}
      </AnimatePresence>
    </div>
  );
};
