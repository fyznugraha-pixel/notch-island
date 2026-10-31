import React from "react";
import { Moon, Type, Layout, Smile, Scaling, Activity, Sliders, MoveVertical } from "lucide-react";
import { SettingRow } from "./SettingRow";
import { NotchPositionPreviewSelector } from "./NotchPositionPreviewSelector";
import { TransparencyControlSection } from "./TransparencyControlSection";
import { IosSwitch } from "../../ios/IosSwitch";
import { IosSegmentedControl } from "../../ios/IosSegmentedControl";
import { t } from "../../../services/i18n";
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
  showPositionSetting?: boolean;
  isLightMode?: boolean;
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
  showPositionSetting = false,
  isLightMode = false,
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
  optAnimSpeed,
  onChangeAnimSpeed,
}) => {
  return (
    <div className="w-full rounded-[22px] bg-[#111114] border border-white/[0.06] p-2 flex flex-col gap-1 shadow-[0_8px_30px_rgba(0,0,0,0.5)]">
      {/* 1. Bentuk (Shape: Notch vs Island) */}
      <div className="flex flex-col gap-2 px-3 pt-2 pb-2 rounded-[12px] hover:bg-white/[0.02] transition-colors">
        <div className="flex items-center justify-between">
          <div className="flex flex-col">
            <span className="text-[13px] font-semibold text-white leading-tight">
              {t("settings_shape")}
            </span>
            <span className="text-[10.5px] text-[#71717a] leading-tight mt-0.5">
              {t("settings_shape_desc")}
            </span>
          </div>
        </div>

        <div
          role="radiogroup"
          aria-label={t("settings_shape")}
          className="grid grid-cols-2 gap-2.5 mt-1"
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
                ? "border border-black/[0.08] bg-black/[0.03] hover:bg-black/[0.06]"
                : "border border-[#1e1e25] bg-[#101015] hover:border-white/10 hover:bg-white/[0.02]"
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
              {/* Screen top edge */}
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
              {/* Anchored Notch with ears */}
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
                ? "border border-black/[0.08] bg-black/[0.03] hover:bg-black/[0.06]"
                : "border border-[#1e1e25] bg-[#101015] hover:border-white/10 hover:bg-white/[0.02]"
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
              {/* Screen top edge */}
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
              {/* Floating Island Pill */}
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

      {/* 2. Jarak dari atas (Island Top Offset) - hanya muncul saat Island */}
      {notchShape === "island" && (
        <SettingRow
          icon={<Sliders size={18} />}
          iconBgClass="bg-[#142333]"
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
                  isLightMode ? "bg-black/10" : "bg-[#1e1e25]"
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

      {/* 3. Posisi (8 Titik Layar + Preview Penempatan - Hanya di Settings Window) */}
      {showPositionSetting && (
        <div className="flex flex-col gap-2.5 px-3 py-2.5 rounded-[12px] hover:bg-white/[0.02] transition-colors">
          <div className="flex items-center gap-3">
            <div className="w-[30px] h-[30px] rounded-[8px] flex items-center justify-center shrink-0 bg-[#142333] text-[#32ade6]">
              <MoveVertical size={18} />
            </div>
            <div className="flex flex-col">
              <span className="text-[13px] font-semibold text-white leading-tight">
                {t("settings_position")}
              </span>
              <span className="text-[10.5px] text-[#71717a] leading-tight mt-0.5">
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

      {/* 4. Tema */}
      <SettingRow
        icon={<Moon size={18} />}
        iconBgClass="bg-[#161c33]"
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

      {/* 4. Ukuran fon */}
      <SettingRow
        icon={<Type size={18} />}
        iconBgClass="bg-[#2c1626]"
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

      {/* 5. Ukuran Idle */}
      <SettingRow
        icon={<Scaling size={18} />}
        iconBgClass="bg-[#14261d]"
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

      {/* 6. Ukuran panel tab */}
      <SettingRow
        icon={<Layout size={18} />}
        iconBgClass="bg-[#13262d]"
        iconColorClass="text-[#64d2ff]"
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

      {/* 7. Telinga Gili (Disabled in Island mode) */}
      <div
        className={notchShape === "island" ? "opacity-40 pointer-events-none select-none transition-opacity" : "transition-opacity"}
        aria-disabled={notchShape === "island"}
      >
        <SettingRow
          icon={<Smile size={18} />}
          iconBgClass="bg-[#26182e]"
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

      {/* 8. Transparansi + Custom Tingkat Transparansi & Keburaman */}
      <TransparencyControlSection
        optOpacity={optOpacity}
        onChangeOpacity={onChangeOpacity}
        optBlur={optBlur}
        onChangeBlur={onChangeBlur}
        isLightMode={isLightMode}
      />

      {/* 9. Animasi */}
      <SettingRow
        icon={<Activity size={18} />}
        iconBgClass="bg-[#2c2010]"
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
  );
};
