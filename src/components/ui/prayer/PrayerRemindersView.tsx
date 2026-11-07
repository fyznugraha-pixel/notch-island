import React from "react";
import {
  PrayerId,
  PrayerScheduleData,
  PrayerSettings,
  PRAYER_ORDER,
  getPrayerDisplayName,
} from "../../../services/prayerService";
import { Language } from "../../../services/i18n";
import { PRAYER_ACCENT, PrayerIcon, PrayerSpeakerIcon } from "./PrayerIcons";

interface PrayerRemindersViewProps {
  schedule: PrayerScheduleData;
  settings: PrayerSettings;
  optLanguage: Language;
  isLightMode: boolean;
  onUpdateSettings: (partial: Partial<PrayerSettings>) => void;
  onToggleSinglePrayerNotif: (prayerId: PrayerId) => void;
  onChangeCalculationMethod: (methodId: number) => void;
  onPlayPreview: () => void;
}

const CALC_METHODS = [
  { id: 4, label: "Makkah" },
  { id: 20, label: "Kemenag RI" },
  { id: 3, label: "MWL" },
];

export const PrayerRemindersView: React.FC<PrayerRemindersViewProps> = ({
  schedule,
  settings,
  optLanguage,
  isLightMode,
  onUpdateSettings,
  onToggleSinglePrayerNotif,
  onChangeCalculationMethod,
  onPlayPreview,
}) => {
  const isId = optLanguage === "id";
  const currentMethod =
    CALC_METHODS.find((m) => m.id === settings.calculationMethod) || CALC_METHODS[1];

  const handleCycleMethod = () => {
    const idx = CALC_METHODS.findIndex((m) => m.id === settings.calculationMethod);
    const next = CALC_METHODS[(idx + 1) % CALC_METHODS.length];
    onChangeCalculationMethod(next.id);
  };

  const volume = settings.adzanVolume ?? 70;
  const alsoAtAdzan = settings.alsoAtAdzan ?? true;

  const cardBg = isLightMode ? "rgba(0,0,0,.045)" : "rgba(255,255,255,.055)";
  const cardShadow = isLightMode
    ? "inset 0 0 0 1px rgba(0,0,0,.07)"
    : "inset 0 0 0 1px rgba(255,255,255,.07)";
  const rowBorder = isLightMode
    ? "inset 0 -1px 0 rgba(0,0,0,.06)"
    : "inset 0 -1px 0 rgba(255,255,255,.06)";
  const textPrimary = isLightMode ? "#18181b" : "#f5f5f7";

  return (
    <div style={{ display: "flex", gap: 14, marginTop: 8 }}>
      {/* Left Column: 5-Prayer Toggle Card */}
      <div style={{ width: 300, flexShrink: 0 }}>
        <div
          style={{
            borderRadius: 20,
            background: cardBg,
            boxShadow: cardShadow,
            padding: "0 14px",
          }}
        >
          {PRAYER_ORDER.map((prayerId, idx) => {
            const isEnabled = Boolean(settings.enabledPrayers[prayerId]);
            const pName = getPrayerDisplayName(prayerId, optLanguage);
            const pTime = schedule.timings[prayerId];
            const isLast = idx === PRAYER_ORDER.length - 1;

            return (
              <div
                key={prayerId}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 10,
                  height: 33,
                  boxShadow: !isLast ? rowBorder : "none",
                }}
              >
                <span
                  style={{
                    width: 24,
                    height: 24,
                    display: "inline-flex",
                    alignItems: "center",
                    justifyContent: "center",
                    flexShrink: 0,
                    color: isLightMode ? "#52525b" : "#a1a1aa",
                  }}
                >
                  <PrayerIcon prayerId={prayerId} size={19} />
                </span>
                <span
                  style={{
                    fontSize: 14,
                    fontWeight: 600,
                    color: textPrimary,
                  }}
                >
                  {pName}
                </span>
                <span style={{ flex: 1 }} />
                <span
                  style={{
                    fontSize: 13,
                    color: "#8e8e93",
                    fontVariantNumeric: "tabular-nums",
                  }}
                >
                  {pTime}
                </span>
                <button
                  type="button"
                  role="switch"
                  aria-checked={isEnabled}
                  aria-label={`${pName} reminder`}
                  onClick={() => onToggleSinglePrayerNotif(prayerId)}
                  style={{
                    position: "relative",
                    width: 40,
                    height: 24,
                    border: 0,
                    borderRadius: 12,
                    background: isEnabled ? PRAYER_ACCENT : "#39393d",
                    padding: 0,
                    cursor: "pointer",
                    flexShrink: 0,
                    transition: "background-color 150ms ease",
                  }}
                >
                  <span
                    style={{
                      position: "absolute",
                      top: 2,
                      left: isEnabled ? 18 : 2,
                      width: 20,
                      height: 20,
                      borderRadius: 10,
                      background: "#fff",
                      boxShadow: "0 2px 4px rgba(0,0,0,.35)",
                      transition: "left 150ms ease",
                    }}
                  />
                </button>
              </div>
            );
          })}
        </div>
      </div>

      {/* Right Column: Pre-reminder + Sound/Method + Volume */}
      <div style={{ flex: 1, minWidth: 0 }}>
        {/* Card 1: Remind me before + Also at adzan time */}
        <div
          style={{
            borderRadius: 20,
            background: cardBg,
            boxShadow: cardShadow,
            padding: "0 14px",
          }}
        >
          <div
            style={{
              padding: "8px 0 9px",
              boxShadow: rowBorder,
            }}
          >
            <div
              style={{
                fontSize: 13.5,
                fontWeight: 600,
                color: textPrimary,
                marginBottom: 6,
              }}
            >
              {isId ? "Ingatkan sebelum" : "Remind me before"}
            </div>
            <div
              style={{
                display: "flex",
                gap: 2,
                padding: 2,
                borderRadius: 10,
                background: "rgba(118,118,128,.24)",
              }}
            >
              {[
                { label: isId ? "Saat adzan" : "At adzan", mins: 0 },
                { label: "5 min", mins: 5 },
                { label: "10 min", mins: 10 },
                { label: "15 min", mins: 15 },
              ].map((opt) => {
                const isActive =
                  opt.mins === 0
                    ? !settings.preReminderEnabled
                    : settings.preReminderEnabled && settings.preReminderMinutes === opt.mins;

                return (
                  <button
                    key={opt.mins}
                    type="button"
                    onClick={() => {
                      if (opt.mins === 0) {
                        onUpdateSettings({ preReminderEnabled: false });
                      } else {
                        onUpdateSettings({
                          preReminderEnabled: true,
                          preReminderMinutes: opt.mins,
                        });
                      }
                    }}
                    style={{
                      flex: 1,
                      height: 28,
                      border: 0,
                      borderRadius: 8,
                      fontSize: 12,
                      fontWeight: 600,
                      cursor: "pointer",
                      fontFamily: "inherit",
                      background: isActive ? "#636366" : "transparent",
                      color: isLightMode && !isActive ? "#27272a" : "#fff",
                      boxShadow: isActive ? "0 2px 6px rgba(0,0,0,.35)" : "none",
                      transition: "background-color 140ms ease",
                    }}
                  >
                    {opt.label}
                  </button>
                );
              })}
            </div>
          </div>

          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 10,
              height: 33,
            }}
          >
            <span
              style={{
                fontSize: 13.5,
                fontWeight: 600,
                color: textPrimary,
              }}
            >
              {isId ? "Juga saat waktu adzan" : "Also at adzan time"}
            </span>
            <span style={{ flex: 1 }} />
            <button
              type="button"
              role="switch"
              aria-checked={alsoAtAdzan}
              aria-label="Also at adzan"
              onClick={() => onUpdateSettings({ alsoAtAdzan: !alsoAtAdzan })}
              style={{
                position: "relative",
                width: 40,
                height: 24,
                border: 0,
                borderRadius: 12,
                background: alsoAtAdzan ? PRAYER_ACCENT : "#39393d",
                padding: 0,
                cursor: "pointer",
                flexShrink: 0,
                transition: "background-color 150ms ease",
              }}
            >
              <span
                style={{
                  position: "absolute",
                  top: 2,
                  left: alsoAtAdzan ? 18 : 2,
                  width: 20,
                  height: 20,
                  borderRadius: 10,
                  background: "#fff",
                  boxShadow: "0 2px 4px rgba(0,0,0,.35)",
                  transition: "left 150ms ease",
                }}
              />
            </button>
          </div>
        </div>

        <div style={{ height: 8 }} />

        {/* Card 2: Adzan (Calculation Method & Preview) + Volume Slider */}
        <div
          style={{
            borderRadius: 20,
            background: cardBg,
            boxShadow: cardShadow,
            padding: "0 14px",
          }}
        >
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 10,
              height: 33,
              boxShadow: rowBorder,
            }}
          >
            <span
              style={{
                width: 26,
                height: 26,
                borderRadius: 8,
                background: "linear-gradient(145deg, #64D2FF, #0A84FF)",
                display: "inline-flex",
                alignItems: "center",
                justifyContent: "center",
                color: "#fff",
                flexShrink: 0,
              }}
            >
              <PrayerSpeakerIcon size={15} />
            </span>
            <span
              style={{
                fontSize: 13.5,
                fontWeight: 600,
                color: textPrimary,
              }}
            >
              Adzan
            </span>
            <span style={{ flex: 1 }} />
            <button
              type="button"
              onClick={handleCycleMethod}
              title={
                isId
                  ? "Klik untuk ganti metode hisab (Kemenag RI / Makkah / MWL)"
                  : "Click to cycle calculation method (Kemenag RI / Makkah / MWL)"
              }
              style={{
                fontSize: 13,
                color: "#8e8e93",
                background: "transparent",
                border: 0,
                padding: "2px 4px",
                cursor: "pointer",
                fontFamily: "inherit",
              }}
            >
              {currentMethod.label}
            </button>
            <button
              type="button"
              aria-label="Play preview"
              onClick={onPlayPreview}
              style={{
                width: 28,
                height: 28,
                borderRadius: 14,
                border: 0,
                background: "rgba(48,209,88,.18)",
                color: PRAYER_ACCENT,
                padding: 0,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                cursor: "pointer",
                flexShrink: 0,
              }}
            >
              <svg
                width="12"
                height="12"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
              >
                <path d="M7 4.5v15l12-7.5z" fill="currentColor" />
              </svg>
            </button>
          </div>

          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 10,
              height: 33,
            }}
          >
            <span
              style={{
                fontSize: 13.5,
                fontWeight: 600,
                color: textPrimary,
              }}
            >
              Volume
            </span>
            <span style={{ flex: 1 }} />
            <div
              data-no-swipe="true"
              style={{
                position: "relative",
                width: 150,
                height: 5,
                borderRadius: 3,
                background: "#39393d",
              }}
            >
              <div
                style={{
                  position: "absolute",
                  left: 0,
                  top: 0,
                  bottom: 0,
                  width: `${volume}%`,
                  borderRadius: 3,
                  background: PRAYER_ACCENT,
                }}
              />
              <div
                style={{
                  position: "absolute",
                  left: `${volume}%`,
                  top: -8,
                  marginLeft: -10,
                  width: 21,
                  height: 21,
                  borderRadius: 11,
                  background: "#fff",
                  boxShadow: "0 2px 6px rgba(0,0,0,.45)",
                  pointerEvents: "none",
                }}
              />
              <input
                type="range"
                min={0}
                max={100}
                value={volume}
                onChange={(e) => {
                  const nextVol = Number(e.target.value);
                  onUpdateSettings({
                    adzanVolume: nextVol,
                    soundEnabled: nextVol > 0,
                  });
                }}
                aria-label="Volume"
                style={{
                  position: "absolute",
                  inset: "-10px 0",
                  width: "100%",
                  height: 25,
                  opacity: 0,
                  cursor: "pointer",
                  margin: 0,
                }}
              />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
