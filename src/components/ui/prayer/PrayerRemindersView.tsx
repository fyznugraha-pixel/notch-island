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

export const CALC_METHODS = [
  { id: 20, label: "Kemenag RI" },
  { id: 3, label: "MWL" },
  { id: 4, label: "Makkah" },
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
    CALC_METHODS.find((m) => m.id === settings.calculationMethod) || CALC_METHODS[0];

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
    <div style={{ display: "flex", gap: 14, marginTop: 6 }}>
      {/* Left Column: 5-Prayer Toggle Card */}
      <div style={{ width: 290, flexShrink: 0 }}>
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
                  height: 36,
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

      {/* Right Column: Pre-reminder + Sound/Volume + Calculation Method */}
      <div style={{ flex: 1, minWidth: 0 }}>
        {/* Card 1: Remind me before + Also at adzan time */}
        <div
          style={{
            borderRadius: 18,
            background: cardBg,
            boxShadow: cardShadow,
            padding: "0 13px",
          }}
        >
          <div
            style={{
              padding: "6px 0 7px",
              boxShadow: rowBorder,
            }}
          >
            <div
              style={{
                fontSize: 13,
                fontWeight: 600,
                color: textPrimary,
                marginBottom: 5,
              }}
            >
              {isId ? "Ingatkan sebelum" : "Remind me before"}
            </div>
            <div
              style={{
                display: "flex",
                gap: 2,
                padding: 2,
                borderRadius: 9,
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
                      height: 25,
                      border: 0,
                      borderRadius: 7,
                      fontSize: 11.5,
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
              height: 29,
            }}
          >
            <span
              style={{
                fontSize: 13,
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
                width: 38,
                height: 22,
                border: 0,
                borderRadius: 11,
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
                  width: 18,
                  height: 18,
                  borderRadius: 9,
                  background: "#fff",
                  boxShadow: "0 2px 4px rgba(0,0,0,.35)",
                  transition: "left 150ms ease",
                }}
              />
            </button>
          </div>
        </div>

        <div style={{ height: 6 }} />

        {/* Card 2: Adzan Preview + Volume Slider + Calculation Method */}
        <div
          style={{
            borderRadius: 18,
            background: cardBg,
            boxShadow: cardShadow,
            padding: "0 13px",
          }}
        >
          {/* Row 1: Adzan + Play Preview */}
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 9,
              height: 30,
              boxShadow: rowBorder,
            }}
          >
            <span
              style={{
                width: 22,
                height: 22,
                borderRadius: 7,
                background: "linear-gradient(145deg, #64D2FF, #0A84FF)",
                display: "inline-flex",
                alignItems: "center",
                justifyContent: "center",
                color: "#fff",
                flexShrink: 0,
              }}
            >
              <PrayerSpeakerIcon size={13} />
            </span>
            <span
              style={{
                fontSize: 13,
                fontWeight: 600,
                color: textPrimary,
              }}
            >
              Adzan
            </span>
            <span style={{ flex: 1 }} />
            <span style={{ fontSize: 12, color: "#8e8e93" }}>
              {currentMethod.label}
            </span>
            <button
              type="button"
              aria-label="Play preview"
              onClick={onPlayPreview}
              title={isId ? "Tes tampilan & suara pengingat adzan" : "Preview adzan alert"}
              style={{
                width: 24,
                height: 24,
                borderRadius: 12,
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
                width="11"
                height="11"
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

          {/* Row 2: Volume Slider */}
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 10,
              height: 29,
              boxShadow: rowBorder,
            }}
          >
            <span
              style={{
                fontSize: 13,
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
                  top: -7,
                  marginLeft: -9,
                  width: 19,
                  height: 19,
                  borderRadius: 10,
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
                  inset: "-8px 0",
                  width: "100%",
                  height: 22,
                  opacity: 0,
                  cursor: "pointer",
                  margin: 0,
                }}
              />
            </div>
          </div>

          {/* Row 3: Calculation Method Segmented Control */}
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              gap: 8,
              height: 31,
            }}
          >
            <span
              style={{
                fontSize: 12.5,
                fontWeight: 600,
                color: textPrimary,
                whiteSpace: "nowrap",
              }}
            >
              {isId ? "Metode Hisab" : "Method"}
            </span>

            <div
              style={{
                display: "flex",
                gap: 2,
                padding: 2,
                borderRadius: 8,
                background: "rgba(118,118,128,.24)",
              }}
            >
              {CALC_METHODS.map((m) => {
                const isActive = settings.calculationMethod === m.id;
                return (
                  <button
                    key={m.id}
                    type="button"
                    onClick={() => onChangeCalculationMethod(m.id)}
                    style={{
                      height: 21,
                      padding: "0 8px",
                      border: 0,
                      borderRadius: 6,
                      fontSize: 10.5,
                      fontWeight: 600,
                      cursor: "pointer",
                      fontFamily: "inherit",
                      background: isActive ? PRAYER_ACCENT : "transparent",
                      color: isActive
                        ? "#04210F"
                        : isLightMode
                        ? "#27272a"
                        : "#e4e4e7",
                      boxShadow: isActive ? "0 1px 4px rgba(0,0,0,.25)" : "none",
                      transition: "all 140ms ease",
                      whiteSpace: "nowrap",
                    }}
                  >
                    {m.label}
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
