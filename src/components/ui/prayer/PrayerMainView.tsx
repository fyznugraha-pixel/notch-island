import React from "react";
import {
  PrayerId,
  PrayerScheduleData,
  PrayerSettings,
  NextPrayerStatus,
  PRAYER_ORDER,
  getPrayerDisplayName,
  timeStringToMinutes,
} from "../../../services/prayerService";
import { Language } from "../../../services/i18n";
import {
  PRAYER_ACCENT,
  PrayerIcon,
  PrayerBellIcon,
  PrayerBellOffIcon,
  PrayerCheckIcon,
  TimelineCelestialIcon,
  getRealtimeCelestialState,
  getNextPrayerProgressFraction,
  getDayTimelinePositions,
} from "./PrayerIcons";

interface PrayerMainViewProps {
  schedule: PrayerScheduleData;
  settings: PrayerSettings;
  completedList: PrayerId[];
  nextStatus: NextPrayerStatus;
  now: Date;
  optLanguage: Language;
  isLightMode: boolean;
  onTogglePrayerCompleted: (prayerId: PrayerId) => void;
  onToggleSinglePrayerNotif: (prayerId: PrayerId) => void;
}

export const PrayerMainView: React.FC<PrayerMainViewProps> = ({
  schedule,
  settings,
  completedList,
  nextStatus,
  now,
  optLanguage,
  isLightMode,
  onTogglePrayerCompleted,
  onToggleSinglePrayerNotif,
}) => {
  const isId = optLanguage === "id";
  const nextPrayerName = getPrayerDisplayName(nextStatus.nextPrayer, optLanguage);

  const ringFraction = getNextPrayerProgressFraction(schedule, now);
  const circumference = 2 * Math.PI * 28; // 175.93
  const dashLength = Number((ringFraction * circumference).toFixed(1));
  const totalCirc = Number(circumference.toFixed(1));

  const { currentPct, milestones } = getDayTimelinePositions(schedule, now);
  const celestialState = getRealtimeCelestialState(schedule, now);
  const currentMins = now.getHours() * 60 + now.getMinutes();

  const notifSummaryText = settings.reminderEnabled
    ? settings.preReminderEnabled
      ? settings.alsoAtAdzan !== false
        ? isId
          ? `Notif -${settings.preReminderMinutes}m & saat adzan`
          : `Notif -${settings.preReminderMinutes}m & at adzan`
        : isId
        ? `Notif -${settings.preReminderMinutes}m sebelum adzan`
        : `Notif -${settings.preReminderMinutes}m before adzan`
      : isId
      ? "Notif saat adzan"
      : "Notif at adzan"
    : isId
    ? "Pengingat mati"
    : "Reminders off";

  return (
    <>
      {/* 2-Column Main Section */}
      <div style={{ display: "flex", gap: 12, marginTop: 5 }}>
        {/* Left Column: Next Prayer Hero Card */}
        <div
          style={{
            position: "relative",
            width: 232,
            height: 146,
            boxSizing: "border-box",
            borderRadius: 22,
            padding: "10px 14px 9px",
            overflow: "hidden",
            background: "linear-gradient(155deg, #0E3B2C 0%, #0A2119 52%, #060B09 100%)",
            boxShadow:
              "inset 0 0 0 1px rgba(48,209,88,.28), inset 0 1px 0 rgba(255,255,255,.14), 0 14px 34px rgba(0,0,0,.5)",
            flexShrink: 0,
            color: "#fff",
          }}
        >
          <div
            aria-hidden="true"
            style={{
              position: "absolute",
              right: -50,
              top: -60,
              width: 190,
              height: 190,
              borderRadius: 95,
              background: "radial-gradient(circle, rgba(48,209,88,.32), transparent 68%)",
              pointerEvents: "none",
            }}
          />

          <div
            style={{
              position: "relative",
              display: "flex",
              alignItems: "flex-start",
              justifyContent: "space-between",
            }}
          >
            <div>
              <div style={{ display: "flex", alignItems: "center", gap: 7 }}>
                <span
                  style={{
                    width: 6,
                    height: 6,
                    borderRadius: 3,
                    background: PRAYER_ACCENT,
                    boxShadow: `0 0 8px ${PRAYER_ACCENT}`,
                  }}
                />
                <span
                  style={{
                    fontSize: 10,
                    fontWeight: 700,
                    letterSpacing: ".14em",
                    color: PRAYER_ACCENT,
                  }}
                >
                  {isId ? "SHOLAT BERIKUTNYA" : "NEXT PRAYER"}
                </span>
              </div>
              <div
                style={{
                  fontSize: 25,
                  fontWeight: 700,
                  letterSpacing: "-.03em",
                  marginTop: 4,
                  lineHeight: "27px",
                }}
              >
                {nextPrayerName}
              </div>
              <div
                style={{
                  fontSize: 30,
                  fontWeight: 300,
                  letterSpacing: "-.03em",
                  fontVariantNumeric: "tabular-nums",
                  lineHeight: "31px",
                  color: "#E9FFF1",
                }}
              >
                {nextStatus.nextPrayerTime}
              </div>
            </div>

            {/* 70x70 Circular Progress Ring */}
            <div style={{ position: "relative", width: 70, height: 70, flexShrink: 0 }}>
              <svg
                width="70"
                height="70"
                viewBox="0 0 70 70"
                aria-hidden="true"
                style={{ overflow: "visible" }}
              >
                <circle
                  cx="35"
                  cy="35"
                  r="28"
                  fill="none"
                  stroke="rgba(255,255,255,.1)"
                  strokeWidth="7"
                />
                <circle
                  cx="35"
                  cy="35"
                  r="28"
                  fill="none"
                  style={{
                    stroke: PRAYER_ACCENT,
                    filter: "drop-shadow(0 0 6px rgba(48,209,88,.55))",
                  }}
                  strokeWidth="7"
                  strokeLinecap="round"
                  strokeDasharray={`${dashLength} ${totalCirc}`}
                  transform="rotate(-90 35 35)"
                />
              </svg>
              <div
                style={{
                  position: "absolute",
                  inset: 0,
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                <span
                  style={{
                    fontSize: 13.5,
                    fontWeight: 700,
                    letterSpacing: "-.02em",
                    fontVariantNumeric: "tabular-nums",
                    lineHeight: 1.1,
                  }}
                >
                  {nextStatus.countdownText}
                </span>
                <span style={{ fontSize: 10, color: "#8e8e93", marginTop: 1 }}>
                  {isId ? "lagi" : "left"}
                </span>
              </div>
            </div>
          </div>

          <div
            style={{
              position: "relative",
              marginTop: 5,
              paddingTop: 5,
              borderTop: "1px solid rgba(255,255,255,.1)",
              display: "flex",
              flexDirection: "column",
              gap: 2,
              fontSize: 11,
              color: "#9fb8ab",
            }}
          >
            <div style={{ display: "flex", justifyContent: "space-between" }}>
              <span>
                Imsak{" "}
                <b style={{ color: "#d6f5e3", fontWeight: 600 }}>{schedule.timings.Imsak}</b>
              </span>
              <span>
                {isId ? "Terbit" : "Sunrise"}{" "}
                <b style={{ color: "#d6f5e3", fontWeight: 600 }}>{schedule.timings.Sunrise}</b>
              </span>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 6, color: "#7fa896" }}>
              <PrayerBellIcon size={11} strokeWidth={2.1} />
              <span className="truncate">{notifSummaryText}</span>
            </div>
          </div>
        </div>

        {/* Right Column: 5-Prayer Vertical List Card */}
        <div
          style={{
            flex: 1,
            minWidth: 0,
            height: 146,
            boxSizing: "border-box",
            borderRadius: 22,
            background: isLightMode ? "rgba(0,0,0,.045)" : "rgba(255,255,255,.055)",
            boxShadow: isLightMode
              ? "inset 0 0 0 1px rgba(0,0,0,.07)"
              : "inset 0 0 0 1px rgba(255,255,255,.07), inset 0 1px 0 rgba(255,255,255,.08)",
            padding: "4px 6px",
            display: "flex",
            flexDirection: "column",
            justifyContent: "space-between",
          }}
        >
          {PRAYER_ORDER.map((prayerId, idx) => {
            const isNext = nextStatus.nextPrayer === prayerId && !nextStatus.isTomorrow;
            const isCompleted = completedList.includes(prayerId);
            const pMins = timeStringToMinutes(schedule.timings[prayerId]);
            const isPast = !isNext && currentMins >= pMins && !nextStatus.isTomorrow;
            const isNotifOn = Boolean(settings.enabledPrayers[prayerId]);
            const pName = getPrayerDisplayName(prayerId, optLanguage);
            const pTime = schedule.timings[prayerId];
            const isLast = idx === PRAYER_ORDER.length - 1;

            const rowOpacity = isNext ? 1 : isPast ? (isCompleted ? 0.85 : 0.5) : 1;

            return (
              <div
                key={prayerId}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 9,
                  height: 27,
                  padding: "0 2px 0 8px",
                  borderRadius: 13.5,
                  background: isNext ? "rgba(48,209,88,.13)" : "transparent",
                  boxShadow: isNext
                    ? "inset 0 0 0 1px rgba(48,209,88,.4)"
                    : !isLast
                    ? isLightMode
                      ? "inset 0 -1px 0 rgba(0,0,0,.05)"
                      : "inset 0 -1px 0 rgba(255,255,255,.06)"
                    : "none",
                  opacity: rowOpacity,
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
                  }}
                >
                  <PrayerIcon prayerId={prayerId} size={19} colored={true} />
                </span>

                <span
                  style={{
                    fontSize: 13.5,
                    fontWeight: 600,
                    letterSpacing: "-.01em",
                    color: isLightMode ? "#18181b" : "#f5f5f7",
                  }}
                >
                  {pName}
                </span>

                {isNext && (
                  <span
                    style={{
                      fontSize: 9,
                      fontWeight: 700,
                      letterSpacing: ".08em",
                      color: "#04210F",
                      background: PRAYER_ACCENT,
                      padding: "2px 6px",
                      borderRadius: 6,
                      marginLeft: 2,
                    }}
                  >
                    NEXT
                  </span>
                )}

                <span style={{ flex: 1 }} />

                <span
                  style={{
                    fontSize: 14,
                    fontWeight: 600,
                    fontVariantNumeric: "tabular-nums",
                    color: isNext ? PRAYER_ACCENT : isLightMode ? "#18181b" : "#f5f5f7",
                    letterSpacing: "-.01em",
                  }}
                >
                  {pTime}
                </span>

                <button
                  type="button"
                  aria-label={`${pName} notification ${isNotifOn ? "on" : "off"}`}
                  onClick={() => onToggleSinglePrayerNotif(prayerId)}
                  style={{
                    width: 22,
                    height: 22,
                    border: 0,
                    background: "transparent",
                    color: isNotifOn
                      ? isNext
                        ? "#a1f0bd"
                        : "#8e8e93"
                      : "#636366",
                    padding: 0,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    cursor: "pointer",
                  }}
                >
                  {isNotifOn ? <PrayerBellIcon size={14} /> : <PrayerBellOffIcon size={14} />}
                </button>

                <button
                  type="button"
                  aria-label={`Mark ${pName} as prayed`}
                  onClick={() => onTogglePrayerCompleted(prayerId)}
                  style={
                    isCompleted
                      ? {
                          width: 24,
                          height: 24,
                          borderRadius: 12,
                          border: 0,
                          background: PRAYER_ACCENT,
                          color: "#04210F",
                          padding: 0,
                          cursor: "pointer",
                          flexShrink: 0,
                          display: "inline-flex",
                          alignItems: "center",
                          justifyContent: "center",
                        }
                      : {
                          width: 24,
                          height: 24,
                          borderRadius: 12,
                          border: isNext
                            ? "1.6px solid rgba(48,209,88,.9)"
                            : isLightMode
                            ? "1.6px solid rgba(0,0,0,.22)"
                            : "1.6px solid rgba(255,255,255,.22)",
                          background: "transparent",
                          color: PRAYER_ACCENT,
                          padding: 0,
                          cursor: "pointer",
                          flexShrink: 0,
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                        }
                  }
                >
                  {isCompleted && <PrayerCheckIcon size={14} strokeWidth={3} />}
                </button>
              </div>
            );
          })}
        </div>
      </div>

      {/* Bottom Day Progress Timeline Bar */}
      <div style={{ position: "relative", margin: "8px 8px 0", height: 24 }}>
        <div
          style={{
            position: "absolute",
            left: 0,
            right: 0,
            top: 0,
            height: 6,
            borderRadius: 3,
            background: isLightMode ? "rgba(0,0,0,.1)" : "rgba(255,255,255,.1)",
          }}
        />
        <div
          style={{
            position: "absolute",
            left: 0,
            top: 0,
            width: `${currentPct}%`,
            height: 6,
            borderRadius: 3,
            background: `linear-gradient(90deg, #1c8f46, ${PRAYER_ACCENT})`,
            boxShadow: "0 0 12px rgba(48,209,88,.5)",
          }}
        />

        {PRAYER_ORDER.map((prayerId) => {
          const pct = milestones[prayerId];
          const isCompleted = completedList.includes(prayerId);
          const pName = getPrayerDisplayName(prayerId, optLanguage);
          const isFirst = prayerId === "Fajr";
          const isLast = prayerId === "Isha";
          const isMaghrib = prayerId === "Maghrib";
          const isOverlappedByCelestial = Math.abs(pct - currentPct) < 2.8;

          return (
            <React.Fragment key={prayerId}>
              {!isOverlappedByCelestial && (
                <span
                  style={
                    isCompleted
                      ? {
                          position: "absolute",
                          left: `${pct}%`,
                          top: -3,
                          marginLeft: -6,
                          width: 12,
                          height: 12,
                          borderRadius: 6,
                          boxSizing: "border-box",
                          background: PRAYER_ACCENT,
                          boxShadow: `0 0 0 3px ${isLightMode ? "#fff" : "#000"}`,
                        }
                      : {
                          position: "absolute",
                          left: `${pct}%`,
                          top: -3,
                          marginLeft: -6,
                          width: 12,
                          height: 12,
                          borderRadius: 6,
                          boxSizing: "border-box",
                          background: isLightMode ? "#fff" : "#000",
                          border: isLightMode
                            ? "2px solid rgba(0,0,0,.3)"
                            : "2px solid rgba(255,255,255,.3)",
                        }
                  }
                />
              )}
              <span
                style={
                  isFirst
                    ? {
                        position: "absolute",
                        left: -4,
                        top: 10,
                        fontSize: 9.5,
                        lineHeight: "12px",
                        fontWeight: 500,
                        color: "#8e8e93",
                      }
                    : isLast
                    ? {
                        position: "absolute",
                        right: -4,
                        top: 10,
                        fontSize: 9.5,
                        lineHeight: "12px",
                        fontWeight: 500,
                        color: "#8e8e93",
                      }
                    : {
                        position: "absolute",
                        left: `${pct}%`,
                        marginLeft: isMaghrib ? -34 : -20,
                        top: 10,
                        fontSize: 9.5,
                        lineHeight: "12px",
                        fontWeight: 500,
                        color: "#8e8e93",
                        letterSpacing: ".02em",
                        width: 40,
                        textAlign: "center",
                      }
                }
              >
                {pName}
              </span>
            </React.Fragment>
          );
        })}

        {/* Real-time Celestial Sun / Moon Indicator at exact tip of progress bar */}
        <span
          style={{
            position: "absolute",
            left: `${currentPct}%`,
            top: 3,
            transform: "translate(-50%, -50%)",
            width: 18,
            height: 18,
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
            filter: `drop-shadow(0 0 6px ${celestialState.glowColor})`,
            zIndex: 3,
          }}
        >
          <TimelineCelestialIcon
            state={celestialState}
            size={18}
            bgMaskColor={isLightMode ? "#fff" : "#000"}
          />
        </span>
      </div>
    </>
  );
};
