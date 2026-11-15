import React from "react";
import { invoke } from "@tauri-apps/api/core";
import { Moon, Type, Layout, Smile, Scaling, Activity, Sliders, MoveVertical, Palette } from "lucide-react";
import { SettingRow } from "./SettingRow";
import { NotchPositionPreviewSelector } from "./NotchPositionPreviewSelector";
import { MonitorSelector } from "./MonitorSelector";
import { TransparencyControlSection } from "./TransparencyControlSection";
import { CustomColorPicker } from "./CustomColorPicker";
import { IosSwitch } from "../../ios/IosSwitch";
import { IosSegmentedControl } from "../../ios/IosSegmentedControl";
import { t, Language } from "../../../services/i18n";
import { NotchPosition } from "../../../utils/notchGeometry";

export interface AppearanceTabProps {
  optTheme: "dark" | "light" | "auto";
  onChangeTheme: (theme: "dark" | "light" | "auto") => void;
  notchShape: "notch" | "island";
  onChangeNotchShape: (shape: "notch" | "island") => void;
  islandTopOffset: number;
  onChangeIslandTopOffset: (offset: number) => void;
  optPosition: NotchPosition;
  onChangePosition: (pos: NotchPosition) => void;
  targetMonitor?: string;
  onChangeTargetMonitor?: (id: string) => void;
  showPositionSetting?: boolean;
  isLightMode?: boolean;
  optLanguage?: Language;
  optFontSize: "small" | "default" | "large";
  onChangeFontSize: (size: "small" | "default" | "large") => void;
  optIdleSize: "compact" | "default" | "large";
  onChangeIdleSize: (size: "compact" | "default" | "large") => void;
  optTabSize: "compact" | "default" | "large";
  onChangeTabSize: (size: "compact" | "default" | "large") => void;
  optEars: boolean;
  onToggleEars: () => void;
  optOpacity: number;
  onChangeOpacity: (val: number) => void;
  optBlur?: number;
  onChangeBlur?: (val: number) => void;
  optIdleColorEnabled?: boolean;
  onChangeIdleColorEnabled?: (val: boolean) => void;
  optIdleColor?: string;
  onChangeIdleColor?: (color: string) => void;
  optIdleTextColorEnabled?: boolean;
  onChangeIdleTextColorEnabled?: (val: boolean) => void;
  optIdleTextColor?: string;
  onChangeIdleTextColor?: (color: string) => void;
  optAnimSpeed: "snappy" | "smooth" | "bouncy";
  onChangeAnimSpeed: (speed: "snappy" | "smooth" | "bouncy") => void;
}

export const AppearanceTab: React.FC<AppearanceTabProps> = ({
  optTheme,
  onChangeTheme,
  notchShape,
  onChangeNotchShape,
  islandTopOffset,
  onChangeIslandTopOffset,
  optPosition,
  onChangePosition,
  targetMonitor = "primary",
  onChangeTargetMonitor,
  showPositionSetting = false,
  isLightMode = false,
  optLanguage = "id",
  optFontSize,
  onChangeFontSize,
  optIdleSize,
  onChangeIdleSize,
  optTabSize,
  onChangeTabSize,
  optEars,
  onToggleEars,
  optOpacity,
  onChangeOpacity,
  optBlur,
  onChangeBlur,
  optIdleColorEnabled = false,
  onChangeIdleColorEnabled,
  optIdleColor = "#0f172a",
  onChangeIdleColor,
  optIdleTextColorEnabled = false,
  onChangeIdleTextColorEnabled,
  optIdleTextColor = "#ffffff",
  onChangeIdleTextColor,
  optAnimSpeed,
  onChangeAnimSpeed,
}) => {
  const [followSystemTextScale, setFollowSystemTextScale] = React.useState<boolean>(() => {
    try {
      return localStorage.getItem("gili_follow_system_text_scale") !== "false";
    } catch {
      return true;
    }
  });

  const handleToggleFollowSystemTextScale = React.useCallback(async (enabled: boolean) => {
    setFollowSystemTextScale(enabled);
    try {
      localStorage.setItem("gili_follow_system_text_scale", String(enabled));
      await invoke("set_follow_system_text_scale", { follow: enabled });
    } catch (e) {
      console.error("Failed to update follow_system_text_scale setting:", e);
    }
  }, []);

  const isId = optLanguage === "id";
  const cardClass = isLightMode
    ? "w-full rounded-[18px] bg-white border border-black/[0.08] p-3 flex flex-col gap-1.5 shadow-[0_2px_10px_rgba(0,0,0,0.03)]"
    : "w-full rounded-[18px] bg-[#121318] border border-white/[0.07] p-3 flex flex-col gap-1.5 shadow-[0_4px_20px_rgba(0,0,0,0.28)]";
  const sectionLabelClass = `px-1 text-[11px] font-semibold uppercase tracking-[0.06em] ${
    isLightMode ? "text-neutral-500" : "text-zinc-500"
  }`;

  return (
    <div className="flex flex-col gap-5 w-full">
      {/* 1. Shape & Screen Position */}
      <div className="flex flex-col gap-2">
        <span className={sectionLabelClass}>
          {isId ? "Bentuk & Posisi Layar" : "Shape & Screen Position"}
        </span>
        <div className={cardClass}>
          {/* Bentuk (Shape: Notch vs Island) */}
          <div
            className={`flex flex-col gap-2.5 px-3.5 py-2.5 rounded-[12px] transition-colors ${
              isLightMode ? "hover:bg-black/[0.02]" : "hover:bg-white/[0.02]"
            }`}
          >
            <div className="flex flex-col">
              <span
                className={`text-[13px] font-semibold leading-tight ${
                  isLightMode ? "text-neutral-900" : "text-zinc-100"
                }`}
              >
                {t("settings_shape")}
              </span>
              <span
                className={`text-[11px] leading-snug mt-0.5 ${
                  isLightMode ? "text-neutral-500" : "text-zinc-400"
                }`}
              >
                {t("settings_shape_desc")}
              </span>
            </div>

            <div
              role="radiogroup"
              aria-label={t("settings_shape")}
              className="grid grid-cols-2 gap-2.5"
            >
              {/* Notch Card (Menempel) */}
              <div
                role="radio"
                aria-checked={notchShape === "notch"}
                tabIndex={0}
                onClick={() => onChangeNotchShape("notch")}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    onChangeNotchShape("notch");
                  }
                }}
                className={`flex flex-col items-center justify-center gap-2 py-3 px-2 rounded-[14px] cursor-pointer transition-all outline-none focus-visible:ring-2 focus-visible:ring-[#3882F6] ${
                  notchShape === "notch"
                    ? "border border-[#3882F6] ring-1 ring-[#3882F6] bg-[#3882F6]/[0.08]"
                    : isLightMode
                    ? "border border-black/[0.08] bg-neutral-50 hover:bg-neutral-100"
                    : "border border-white/[0.07] bg-white/[0.03] hover:border-white/15 hover:bg-white/[0.05]"
                }`}
              >
                <svg
                  width="84"
                  height="36"
                  viewBox="0 0 84 36"
                  fill="none"
                  xmlns="http://www.w3.org/2000/svg"
                  className="overflow-visible"
                >
                  <line
                    x1="4"
                    y1="3"
                    x2="80"
                    y2="3"
                    stroke={
                      notchShape === "notch"
                        ? isLightMode
                          ? "rgba(0,0,0,0.28)"
                          : "rgba(255,255,255,0.35)"
                        : isLightMode
                        ? "rgba(0,0,0,0.18)"
                        : "rgba(255,255,255,0.14)"
                    }
                    strokeWidth="1.5"
                    strokeLinecap="round"
                  />
                  <path
                    d="M 18 3 H 26 C 29 3 31 5 32 8 V 16 C 32 23 37 28 44 28 C 51 28 56 23 56 16 V 8 C 57 5 59 3 62 3 H 66"
                    fill={
                      notchShape === "notch"
                        ? isLightMode
                          ? "rgba(56, 130, 246, 0.16)"
                          : "rgba(56, 130, 246, 0.22)"
                        : isLightMode
                        ? "rgba(0, 0, 0, 0.05)"
                        : "rgba(255, 255, 255, 0.05)"
                    }
                    stroke={
                      notchShape === "notch"
                        ? "#3882F6"
                        : isLightMode
                        ? "rgba(0, 0, 0, 0.45)"
                        : "rgba(255, 255, 255, 0.32)"
                    }
                    strokeWidth="2"
                    strokeLinejoin="round"
                  />
                </svg>
                <span
                  className={`text-[12px] font-medium leading-none ${
                    notchShape === "notch"
                      ? isLightMode
                        ? "text-[#007aff] font-semibold"
                        : "text-white font-semibold"
                      : isLightMode
                      ? "text-[#636366]"
                      : "text-[#a1a1aa]"
                  }`}
                >
                  {t("settings_shape_notch")}
                </span>
              </div>

              {/* Island Card (Melayang) */}
              <div
                role="radio"
                aria-checked={notchShape === "island"}
                tabIndex={0}
                onClick={() => onChangeNotchShape("island")}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    onChangeNotchShape("island");
                  }
                }}
                className={`flex flex-col items-center justify-center gap-2 py-3 px-2 rounded-[14px] cursor-pointer transition-all outline-none focus-visible:ring-2 focus-visible:ring-[#3882F6] ${
                  notchShape === "island"
                    ? "border border-[#3882F6] ring-1 ring-[#3882F6] bg-[#3882F6]/[0.08]"
                    : isLightMode
                    ? "border border-black/[0.08] bg-neutral-50 hover:bg-neutral-100"
                    : "border border-white/[0.07] bg-white/[0.03] hover:border-white/15 hover:bg-white/[0.05]"
                }`}
              >
                <svg
                  width="84"
                  height="36"
                  viewBox="0 0 84 36"
                  fill="none"
                  xmlns="http://www.w3.org/2000/svg"
                  className="overflow-visible"
                >
                  <line
                    x1="4"
                    y1="3"
                    x2="80"
                    y2="3"
                    stroke={
                      notchShape === "island"
                        ? isLightMode
                          ? "rgba(0,0,0,0.28)"
                          : "rgba(255,255,255,0.35)"
                        : isLightMode
                        ? "rgba(0,0,0,0.18)"
                        : "rgba(255,255,255,0.14)"
                    }
                    strokeWidth="1.5"
                    strokeLinecap="round"
                  />
                  <rect
                    x="24"
                    y="11"
                    width="36"
                    height="18"
                    rx="9"
                    ry="9"
                    fill={
                      notchShape === "island"
                        ? isLightMode
                          ? "rgba(56, 130, 246, 0.16)"
                          : "rgba(56, 130, 246, 0.22)"
                        : isLightMode
                        ? "rgba(0, 0, 0, 0.05)"
                        : "rgba(255, 255, 255, 0.05)"
                    }
                    stroke={
                      notchShape === "island"
                        ? "#3882F6"
                        : isLightMode
                        ? "rgba(0, 0, 0, 0.45)"
                        : "rgba(255, 255, 255, 0.32)"
                    }
                    strokeWidth="2"
                  />
                </svg>
                <span
                  className={`text-[12px] font-medium leading-none ${
                    notchShape === "island"
                      ? isLightMode
                        ? "text-[#007aff] font-semibold"
                        : "text-white font-semibold"
                      : isLightMode
                      ? "text-[#636366]"
                      : "text-[#a1a1aa]"
                  }`}
                >
                  {t("settings_shape_island")}
                </span>
              </div>
            </div>
          </div>

          {/* Jarak dari atas (Island Top Offset) - hanya muncul saat Island */}
          {notchShape === "island" && (
            <SettingRow
              isLightMode={isLightMode}
              icon={<Sliders size={18} />}
              iconBgClass={isLightMode ? "bg-[#3882F6]/12" : "bg-[#142333]"}
              iconColorClass="text-[#3882F6]"
              title={t("settings_top_offset")}
              subtitle={t("settings_top_offset_desc")}
              control={
                <div className="flex items-center gap-3">
                  <input
                    type="range"
                    min={6}
                    max={16}
                    step={1}
                    value={islandTopOffset}
                    onChange={(e) => onChangeIslandTopOffset(Number(e.target.value))}
                    className={`w-[110px] h-1.5 ${
                      isLightMode ? "bg-black/10" : "bg-white/10"
                    } rounded-full appearance-none cursor-pointer accent-[#3882F6]`}
                    aria-label={t("settings_top_offset")}
                  />
                  <span
                    className={`text-[12px] font-mono ${
                      isLightMode ? "text-neutral-700 font-semibold" : "text-[#a1a1aa] font-medium"
                    } min-w-[34px] text-right`}
                  >
                    {islandTopOffset}px
                  </span>
                </div>
              }
            />
          )}

          {/* Pilih Monitor (Multi-Monitor Support) */}
          {showPositionSetting && onChangeTargetMonitor && (
            <MonitorSelector
              value={targetMonitor}
              onChange={onChangeTargetMonitor}
              isLightMode={isLightMode}
            />
          )}

          {/* Posisi (8 Titik Layar + Preview Penempatan) */}
          {showPositionSetting && (
            <div
              className={`flex flex-col gap-2.5 px-3.5 py-2.5 rounded-[12px] transition-colors ${
                isLightMode ? "hover:bg-black/[0.02]" : "hover:bg-white/[0.02]"
              }`}
            >
              <div className="flex items-center gap-3">
                <div
                  className={`w-8 h-8 rounded-[9px] flex items-center justify-center shrink-0 ${
                    isLightMode ? "bg-[#32ade6]/12" : "bg-[#142333]"
                  } text-[#32ade6]`}
                >
                  <MoveVertical size={18} />
                </div>
                <div className="flex flex-col">
                  <span
                    className={`text-[13px] font-semibold leading-tight ${
                      isLightMode ? "text-neutral-900" : "text-zinc-100"
                    }`}
                  >
                    {t("settings_position")}
                  </span>
                  <span
                    className={`text-[11px] leading-snug mt-0.5 ${
                      isLightMode ? "text-neutral-500" : "text-zinc-400"
                    }`}
                  >
                    {t("settings_position_desc")}
                  </span>
                </div>
              </div>
              <NotchPositionPreviewSelector
                value={optPosition}
                onChange={onChangePosition}
                notchShape={notchShape}
                optEars={optEars}
                isLightMode={isLightMode}
              />
            </div>
          )}

          {/* Telinga Gili (Disabled in Island mode) */}
          <div
            className={
              notchShape === "island"
                ? "opacity-40 pointer-events-none select-none transition-opacity"
                : "transition-opacity"
            }
            aria-disabled={notchShape === "island"}
          >
            <SettingRow
              isLightMode={isLightMode}
              icon={<Smile size={18} />}
              iconBgClass={isLightMode ? "bg-[#af52de]/12" : "bg-[#26182e]"}
              iconColorClass="text-[#af52de]"
              title={t("settings_ears")}
              subtitle={notchShape === "island" ? t("settings_ears_disabled_island") : t("settings_ears_desc")}
              control={
                <IosSwitch
                  checked={notchShape === "island" ? false : optEars}
                  onChange={onToggleEars}
                  activeColor="blue"
                  disabled={notchShape === "island"}
                />
              }
            />
          </div>
        </div>
      </div>

      {/* 2. Theme & Surface Material */}
      <div className="flex flex-col gap-2">
        <span className={sectionLabelClass}>
          {isId ? "Tema & Material Permukaan" : "Theme & Surface Material"}
        </span>
        <div className={cardClass}>
          <SettingRow
            isLightMode={isLightMode}
            icon={<Moon size={18} />}
            iconBgClass={isLightMode ? "bg-[#5e5ce6]/12" : "bg-[#161c33]"}
            iconColorClass="text-[#5e5ce6]"
            title={t("settings_mode")}
            control={
              <IosSegmentedControl
                value={optTheme}
                onChange={(val) => onChangeTheme(val as "dark" | "light" | "auto")}
                options={[
                  { value: "dark", label: t("settings_mode_dark") },
                  { value: "light", label: t("settings_mode_light") },
                  { value: "auto", label: t("settings_mode_auto") },
                ]}
              />
            }
          />

          <TransparencyControlSection
            optOpacity={optOpacity}
            onChangeOpacity={onChangeOpacity}
            optBlur={optBlur}
            onChangeBlur={onChangeBlur}
            isLightMode={isLightMode}
          />
        </div>
      </div>

      {/* 3. Sizing & Typography */}
      <div className="flex flex-col gap-2">
        <span className={sectionLabelClass}>
          {isId ? "Ukuran & Teks" : "Sizing & Typography"}
        </span>
        <div className={cardClass}>
          <SettingRow
            isLightMode={isLightMode}
            icon={<Scaling size={18} />}
            iconBgClass={isLightMode ? "bg-[#30d158]/12" : "bg-[#14261d]"}
            iconColorClass="text-[#30d158]"
            title={t("settings_idle_size")}
            control={
              <IosSegmentedControl
                value={optIdleSize}
                onChange={(val) => onChangeIdleSize(val as "compact" | "default" | "large")}
                options={[
                  { value: "compact", label: t("settings_idle_compact"), tooltip: t("settings_idle_tip_compact") },
                  { value: "default", label: t("settings_idle_default"), tooltip: t("settings_idle_tip_default") },
                  { value: "large", label: t("settings_idle_large"), tooltip: t("settings_idle_tip_large") },
                ]}
              />
            }
          />

          <SettingRow
            isLightMode={isLightMode}
            icon={<Layout size={18} />}
            iconBgClass={isLightMode ? "bg-[#64d2ff]/15" : "bg-[#13262d]"}
            iconColorClass={isLightMode ? "text-[#0284c7]" : "text-[#64d2ff]"}
            title={t("settings_tab_size")}
            control={
              <IosSegmentedControl
                value={optTabSize}
                onChange={(val) => onChangeTabSize(val as "compact" | "default" | "large")}
                options={[
                  { value: "compact", label: t("settings_tab_compact") },
                  { value: "default", label: t("settings_tab_default") },
                  { value: "large", label: t("settings_tab_large") },
                ]}
              />
            }
          />

          <SettingRow
            isLightMode={isLightMode}
            icon={<Type size={18} />}
            iconBgClass={isLightMode ? "bg-[#bf5af2]/12" : "bg-[#2c1626]"}
            iconColorClass="text-[#bf5af2]"
            title={t("settings_font_size")}
            control={
              <IosSegmentedControl
                value={optFontSize}
                onChange={(val) => onChangeFontSize(val as "small" | "default" | "large")}
                options={[
                  { value: "small", label: t("settings_font_small") },
                  { value: "default", label: t("settings_font_default") },
                  { value: "large", label: t("settings_font_large") },
                ]}
              />
            }
          />

          <SettingRow
            isLightMode={isLightMode}
            icon={<Scaling size={18} />}
            iconBgClass={isLightMode ? "bg-[#8b5cf6]/12" : "bg-[#241c30]"}
            iconColorClass={isLightMode ? "text-[#7c3aed]" : "text-[#d0bcff]"}
            title={t("settings_follow_text_scale")}
            subtitle={t("settings_follow_text_scale_desc")}
            control={
              <IosSwitch
                checked={followSystemTextScale}
                onChange={handleToggleFollowSystemTextScale}
              />
            }
          />
        </div>
      </div>

      {/* 4. Custom Idle Colors & Motion */}
      <div className="flex flex-col gap-2">
        <span className={sectionLabelClass}>
          {isId ? "Warna Kustom & Animasi" : "Custom Colors & Motion"}
        </span>
        <div className={cardClass}>
          <div className="flex flex-col gap-1 rounded-[12px] transition-colors">
            <SettingRow
              isLightMode={isLightMode}
              icon={<Palette size={18} />}
              iconBgClass={isLightMode ? "bg-[#c084fc]/15" : "bg-[#241538]"}
              iconColorClass={isLightMode ? "text-[#9333ea]" : "text-[#c084fc]"}
              title={t("settings_custom_idle_color")}
              subtitle={t("settings_custom_idle_color_desc")}
              control={
                <IosSwitch
                  checked={optIdleColorEnabled}
                  onChange={() => onChangeIdleColorEnabled?.(!optIdleColorEnabled)}
                  activeColor="blue"
                />
              }
            />
            {optIdleColorEnabled && onChangeIdleColor && (
              <div className="pt-1.5 pb-2 px-2">
                <CustomColorPicker
                  value={optIdleColor}
                  onChange={onChangeIdleColor}
                  isLightMode={isLightMode}
                  isId={optLanguage !== "en"}
                  mode="surface"
                  previewTextColor={optIdleTextColorEnabled ? optIdleTextColor : undefined}
                />
              </div>
            )}
          </div>

          <div className="flex flex-col gap-1 rounded-[12px] transition-colors">
            <SettingRow
              isLightMode={isLightMode}
              icon={<Type size={18} />}
              iconBgClass={isLightMode ? "bg-[#38bdf8]/15" : "bg-[#12283a]"}
              iconColorClass={isLightMode ? "text-[#0284c7]" : "text-[#38bdf8]"}
              title={t("settings_custom_idle_text_color")}
              subtitle={t("settings_custom_idle_text_color_desc")}
              control={
                <IosSwitch
                  checked={optIdleTextColorEnabled}
                  onChange={() => onChangeIdleTextColorEnabled?.(!optIdleTextColorEnabled)}
                  activeColor="blue"
                />
              }
            />
            {optIdleTextColorEnabled && onChangeIdleTextColor && (
              <div className="pt-1.5 pb-2 px-2">
                <CustomColorPicker
                  value={optIdleTextColor}
                  onChange={onChangeIdleTextColor}
                  isLightMode={isLightMode}
                  isId={optLanguage !== "en"}
                  mode="text"
                  previewBgColor={optIdleColorEnabled ? optIdleColor : "#0f172a"}
                />
              </div>
            )}
          </div>

          <SettingRow
            isLightMode={isLightMode}
            icon={<Activity size={18} />}
            iconBgClass={isLightMode ? "bg-[#ff9f0a]/15" : "bg-[#2c2010]"}
            iconColorClass="text-[#ff9f0a]"
            title={t("settings_animations")}
            control={
              <IosSegmentedControl
                value={optAnimSpeed}
                onChange={(val) => onChangeAnimSpeed(val as "snappy" | "smooth" | "bouncy")}
                options={[
                  { value: "snappy", label: t("settings_anim_snappy"), tooltip: t("settings_anim_snappy_tip") },
                  { value: "smooth", label: t("settings_anim_smooth"), tooltip: t("settings_anim_smooth_tip") },
                  { value: "bouncy", label: t("settings_anim_bouncy"), tooltip: t("settings_anim_bouncy_tip") },
                ]}
              />
            }
          />
        </div>
      </div>
    </div>
  );
};
