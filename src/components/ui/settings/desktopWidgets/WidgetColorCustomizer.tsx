import React, { useEffect, useState } from "react";
import {
  AlertTriangle,
  Sparkles,
  Save,
  Palette,
  Type,
  Layers,
  Eye,
  SunMedium,
} from "lucide-react";
import {
  BackgroundMode,
  ColorPreset,
  ColorRoleSource,
  RgbaColor,
  WallpaperRegionAnalysis,
  WidgetStyleConfig,
  analyzeWidgetWallpaperContrast,
  rgbaToHex,
} from "../../../../services/desktopWidgetsService";
import { SettingRow } from "../SettingRow";
import { IosSwitch } from "../../../ios/IosSwitch";
import { IosSelect } from "../../../ios/IosSelect";
import { IosSegmentedControl } from "../../../ios/IosSegmentedControl";
import { HsvColorWheel } from "./HsvColorWheel";

interface WidgetColorCustomizerProps {
  style: WidgetStyleConfig;
  presets: ColorPreset[];
  recentColors: string[];
  isLightMode: boolean;
  title: string;
  onChange: (next: WidgetStyleConfig, recordedHex?: string) => void;
  onSavePreset: (name: string, style: WidgetStyleConfig) => void;
  onRecordRecentColor?: (hex: string) => void;
}

const FONT_SELECT_OPTIONS = [
  { value: "Segoe UI Variable", label: "Segoe UI Variable", sublabel: "Default sistem" },
  { value: "Segoe UI", label: "Segoe UI" },
  { value: "Bahnschrift", label: "Bahnschrift", sublabel: "Geometris tegas" },
  { value: "Cascadia Code", label: "Cascadia Code", sublabel: "Monospace" },
  { value: "Georgia", label: "Georgia", sublabel: "Editorial serif" },
  { value: "Trebuchet MS", label: "Trebuchet MS" },
];

const WEIGHT_SELECT_OPTIONS = [
  { value: 300, label: "Tipis (300)" },
  { value: 400, label: "Reguler (400)" },
  { value: 600, label: "Semibold (600)" },
  { value: 700, label: "Tebal (700)" },
  { value: 800, label: "Ekstra Tebal (800)" },
];

type RoleKey = "text_primary" | "text_secondary" | "accent" | "card_color";

export const WidgetColorCustomizer: React.FC<WidgetColorCustomizerProps> = ({
  style,
  presets,
  recentColors,
  isLightMode,
  title,
  onChange,
  onSavePreset,
}) => {
  const [activeRole, setActiveRole] = useState<RoleKey>("text_primary");
  const [analysis, setAnalysis] = useState<WallpaperRegionAnalysis | null>(null);
  const [presetName, setPresetName] = useState("");
  const [previewLightBg, setPreviewLightBg] = useState(false);

  const currentRoleSource = style[activeRole];

  useEffect(() => {
    let alive = true;
    analyzeWidgetWallpaperContrast(style)
      .then((res) => {
        if (alive) setAnalysis(res);
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [style]);

  const setRole = (role: RoleKey, src: ColorRoleSource) => {
    onChange({ ...style, [role]: src });
  };

  const activeRgba: RgbaColor =
    currentRoleSource.mode === "custom"
      ? currentRoleSource.color
      : currentRoleSource.mode === "wallpaper_dominant" && analysis?.dominant_accent
      ? analysis.dominant_accent
      : { r: 245, g: 245, b: 247, a: 1 };

  const handleWheelChange = (nextColor: RgbaColor) => {
    onChange({ ...style, [activeRole]: { mode: "custom", color: nextColor } }, rgbaToHex(nextColor));
  };

  const applyMonochromeToAllRoles = (baseColor: RgbaColor) => {
    onChange(
      {
        ...style,
        text_primary: { mode: "custom", color: { ...baseColor, a: 1 } },
        text_secondary: {
          mode: "custom",
          color: { ...baseColor, a: Number((baseColor.a * 0.8).toFixed(2)) || 0.8 },
        },
        accent: { mode: "custom", color: { ...baseColor, a: 1 } },
      },
      rgbaToHex(baseColor)
    );
  };

  const resolvedPreviewColor = (src: ColorRoleSource, fallback: string): string => {
    if (src.mode === "custom") {
      const c = src.color;
      return `rgba(${c.r}, ${c.g}, ${c.b}, ${c.a})`;
    }
    if (src.mode === "wallpaper_dominant" && analysis?.dominant_accent) {
      const c = analysis.dominant_accent;
      return `rgba(${c.r}, ${c.g}, ${c.b}, 1)`;
    }
    if (fallback === "accent") {
      return resolvedPreviewColor(style.text_primary, "primary");
    }
    if (fallback === "secondary" && style.text_primary.mode === "custom") {
      const c = style.text_primary.color;
      return `rgba(${c.r}, ${c.g}, ${c.b}, 0.78)`;
    }
    if (previewLightBg) return fallback === "primary" ? "#111216" : "rgba(17,18,22,0.70)";
    return fallback === "primary" ? "#FFFFFF" : "rgba(255,255,255,0.78)";
  };

  const previewCardStyle = (): React.CSSProperties => {
    const baseCard: RgbaColor =
      style.card_color.mode === "custom"
        ? style.card_color.color
        : { r: 20, g: 21, b: 26, a: 0.88 };
    if (style.background_mode === "none") return {};
    if (style.background_mode === "subtle_tint") {
      return {
        backgroundColor: `rgba(${baseCard.r}, ${baseCard.g}, ${baseCard.b}, ${style.tint_opacity})`,
        border: "1px solid rgba(255,255,255,0.10)",
      };
    }
    if (style.background_mode === "glass") {
      return {
        backgroundColor: `rgba(${baseCard.r}, ${baseCard.g}, ${baseCard.b}, 0.30)`,
        backdropFilter: "blur(20px)",
        border: "1px solid rgba(255,255,255,0.14)",
        boxShadow: "inset 0 1px 0 rgba(255,255,255,0.16)",
      };
    }
    return {
      backgroundColor: `rgba(${baseCard.r}, ${baseCard.g}, ${baseCard.b}, 0.96)`,
      border: "1px solid rgba(255,255,255,0.08)",
    };
  };

  const cardClass = `w-full rounded-[18px] p-4 flex flex-col gap-4 transition-colors ${
    isLightMode
      ? "bg-white border border-black/[0.08] shadow-[0_2px_10px_rgba(0,0,0,0.03)]"
      : "bg-[#121318] border border-white/[0.07] shadow-[0_4px_20px_rgba(0,0,0,0.28)]"
  }`;
  const mutedText = isLightMode ? "text-neutral-500" : "text-zinc-400";

  return (
    <div className={cardClass}>
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-[9px] bg-[#5e5ce6]/20 text-[#5e5ce6] flex items-center justify-center">
            <Palette size={15} />
          </div>
          <div>
            <div className="text-[13.5px] font-semibold">{title}</div>
            <div className={`text-[11px] ${mutedText}`}>
              Pratinjau langsung dengan auto-kontras wallpaper
            </div>
          </div>
        </div>
        <IosSegmentedControl
          value={previewLightBg ? "light" : "dark"}
          onChange={(v) => setPreviewLightBg(v === "light")}
          options={[
            { value: "dark", label: "Gelap" },
            { value: "light", label: "Terang" },
          ]}
        />
      </div>

      {/* Live preview stage */}
      <div
        className="rounded-[18px] p-5 flex items-center justify-center transition-all"
        style={{
          background: previewLightBg
            ? "linear-gradient(135deg, #dbeafe 0%, #e2e8f0 50%, #f8fafc 100%)"
            : "linear-gradient(135deg, #0b1120 0%, #1e1b4b 55%, #09090b 100%)",
        }}
      >
        <div
          className="w-[276px] rounded-[24px] p-4 transition-all"
          style={{
            ...previewCardStyle(),
            fontFamily: style.font_family,
          }}
        >
          <div
            className="text-[10.5px] font-bold tracking-wider uppercase"
            style={{ color: resolvedPreviewColor(style.text_secondary, "secondary") }}
          >
            Jumat, 20 November
          </div>
          <div
            className="mt-1 tabular-nums leading-none tracking-tight"
            style={{
              fontSize: `${Math.round(38 * style.text_scale)}px`,
              fontWeight: style.font_weight,
              color: resolvedPreviewColor(style.text_primary, "primary"),
              textShadow: style.shadow_enabled
                ? `0 2px 8px rgba(${style.shadow_color.r},${style.shadow_color.g},${style.shadow_color.b},${style.shadow_color.a})`
                : undefined,
            }}
          >
            22:15
          </div>
          <div
            className="mt-1.5 text-[12px]"
            style={{ color: resolvedPreviewColor(style.text_secondary, "secondary") }}
          >
            29° Cerah Berawan . Jakarta
          </div>
          <div className="mt-2.5 h-1 w-full rounded-full bg-white/15 overflow-hidden">
            <div
              className="h-full w-2/3 rounded-full"
              style={{ backgroundColor: resolvedPreviewColor(style.accent, "accent") }}
            />
          </div>
        </div>
      </div>

      {/* Low contrast warning */}
      {analysis?.low_contrast_warning && (
        <div className="flex items-start gap-2.5 rounded-[14px] border border-amber-500/40 bg-amber-500/10 px-3.5 py-2.5 text-[12px] text-amber-300">
          <AlertTriangle size={15} className="shrink-0 mt-0.5" />
          <div>
            <div className="font-semibold">
              Kontras rendah terdeteksi ({analysis.measured_contrast_ratio}:1)
            </div>
            <div className="opacity-85 text-[11px]">
              Warna teks pilihan sulit dibaca di atas area wallpaper tersebut. Pilih warna Otomatis,
              aktifkan bayangan/halo, atau gunakan latar Tint Tipis.
            </div>
          </div>
        </div>
      )}

      {/* Background mode selector */}
      <SettingRow
        icon={<Layers size={15} />}
        iconBgClass="bg-[#0a84ff]/15"
        iconColorClass="text-[#0a84ff]"
        title="Mode Latar Widget"
        subtitle="Tanpa latar adalah default agar widget menyatu dengan wallpaper"
        isLightMode={isLightMode}
        control={
          <IosSegmentedControl<BackgroundMode>
            value={style.background_mode}
            onChange={(m) => onChange({ ...style, background_mode: m })}
            options={[
              { value: "none", label: "Bening" },
              { value: "subtle_tint", label: "Tint" },
              { value: "glass", label: "Kaca" },
              { value: "solid", label: "Solid" },
            ]}
          />
        }
      />

      {style.background_mode === "subtle_tint" && (
        <div className="px-3.5 flex items-center justify-between gap-4 text-[12px]">
          <span className={mutedText}>
            Opasitas Tint Tipis ({Math.round(style.tint_opacity * 100)}%)
          </span>
          <input
            type="range"
            min={10}
            max={25}
            value={Math.round(style.tint_opacity * 100)}
            onChange={(e) =>
              onChange({ ...style, tint_opacity: Number(e.target.value) / 100 })
            }
            className="w-44 accent-[#0a84ff] cursor-pointer"
          />
        </div>
      )}

      {/* Role picker + HSV Color Wheel */}
      <div className="flex flex-col gap-3 pt-2 border-t border-white/[0.06]">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <span className={`text-[11px] font-semibold uppercase tracking-[0.06em] ${mutedText}`}>
            Peran Warna
          </span>
          <IosSegmentedControl<RoleKey>
            value={activeRole}
            onChange={setActiveRole}
            options={[
              { value: "text_primary", label: "Utama" },
              { value: "text_secondary", label: "Sekunder" },
              { value: "accent", label: "Aksen" },
              { value: "card_color", label: "Kartu" },
            ]}
          />
        </div>

        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => setRole(activeRole, { mode: "auto_contrast" })}
            className={`px-3 py-1.5 rounded-[10px] text-[11.5px] font-medium border cursor-pointer transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0a84ff] ${
              currentRoleSource.mode === "auto_contrast"
                ? "border-[#16a34a] bg-[#34c759]/15 text-[#16a34a] dark:text-[#34c759]"
                : isLightMode
                ? "border-black/15 text-neutral-800 hover:bg-black/[0.05]"
                : "border-white/10 text-zinc-200 hover:bg-white/[0.06]"
            }`}
          >
            Otomatis (Kontras Wallpaper)
          </button>
          <button
            type="button"
            onClick={() => setRole(activeRole, { mode: "wallpaper_dominant" })}
            className={`px-3 py-1.5 rounded-[10px] text-[11.5px] font-medium border cursor-pointer flex items-center gap-1.5 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0a84ff] ${
              currentRoleSource.mode === "wallpaper_dominant"
                ? "border-[#9333ea] bg-[#af52de]/15 text-[#7e22ce] dark:text-[#c084fc]"
                : isLightMode
                ? "border-black/15 text-neutral-800 hover:bg-black/[0.05]"
                : "border-white/10 text-zinc-200 hover:bg-white/[0.06]"
            }`}
          >
            <Sparkles size={12} aria-hidden="true" /> Ambil dari Wallpaper
          </button>
          <button
            type="button"
            onClick={() => applyMonochromeToAllRoles(activeRgba)}
            className={`px-3 py-1.5 rounded-[10px] text-[11.5px] font-medium border cursor-pointer transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0a84ff] ${
              isLightMode
                ? "border-black/15 bg-black/[0.04] text-neutral-900 hover:bg-black/[0.08]"
                : "border-white/15 bg-white/[0.06] text-white hover:bg-white/[0.12]"
            }`}
            title="Menyamakan warna Utama, Sekunder, dan Aksen agar tidak ada warna biru/aksen terpisah"
          >
            Terapkan ke Semua (Seragam)
          </button>
          <button
            type="button"
            onClick={() => applyMonochromeToAllRoles({ r: 255, g: 255, b: 255, a: 1 })}
            className={`px-3 py-1.5 rounded-[10px] text-[11.5px] font-semibold border cursor-pointer transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0a84ff] ${
              isLightMode
                ? "border-black/15 bg-neutral-900 text-white hover:bg-neutral-800"
                : "border-white/25 bg-white/15 hover:bg-white/25 text-white"
            }`}
          >
            Putih Semua
          </button>
        </div>

        <HsvColorWheel
          color={activeRgba}
          isLightMode={isLightMode}
          onChange={handleWheelChange}
        />

        {/* Swatches: recent + wallpaper dominant palette */}
        <div className="flex flex-wrap items-center gap-2">
          {recentColors.slice(0, 10).map((hex) => (
            <button
              key={hex}
              type="button"
              title={hex}
              onClick={() => {
                const r = parseInt(hex.slice(1, 3), 16);
                const g = parseInt(hex.slice(3, 5), 16);
                const b = parseInt(hex.slice(5, 7), 16);
                if (!Number.isNaN(r)) handleWheelChange({ r, g, b, a: activeRgba.a });
              }}
              className="w-6 h-6 rounded-full border border-white/25 cursor-pointer hover:scale-110 transition-transform"
              style={{ backgroundColor: hex }}
            />
          ))}
          {analysis?.palette?.map((hex) => (
            <button
              key={`wp_${hex}`}
              type="button"
              title={`Palet wallpaper ${hex}`}
              onClick={() => {
                const r = parseInt(hex.slice(1, 3), 16);
                const g = parseInt(hex.slice(3, 5), 16);
                const b = parseInt(hex.slice(5, 7), 16);
                if (!Number.isNaN(r)) handleWheelChange({ r, g, b, a: activeRgba.a });
              }}
              className="w-6 h-6 rounded-[7px] border border-[#0a84ff]/70 cursor-pointer hover:scale-110 transition-transform"
              style={{ backgroundColor: hex }}
            />
          ))}
        </div>
      </div>

      {/* Typography & Legibility */}
      <div className="flex flex-col gap-0.5 pt-2 border-t border-white/[0.06]">
        <SettingRow
          icon={<Type size={15} />}
          iconBgClass="bg-[#ff9f0a]/15"
          iconColorClass="text-[#ff9f0a]"
          title="Font Sistem"
          subtitle="Font terpasang yang dipakai oleh renderer DirectWrite"
          isLightMode={isLightMode}
          control={
            <IosSelect
              value={style.font_family}
              options={FONT_SELECT_OPTIONS}
              onChange={(font_family) => onChange({ ...style, font_family })}
              isLightMode={isLightMode}
              ariaLabel="Font sistem widget"
            />
          }
        />
        <SettingRow
          icon={<Type size={15} />}
          iconBgClass="bg-[#636366]/20"
          iconColorClass="text-zinc-300"
          title="Ketebalan Font"
          subtitle={`Skala teks saat ini ${Math.round(style.text_scale * 100)}%`}
          isLightMode={isLightMode}
          control={
            <IosSelect
              value={style.font_weight}
              options={WEIGHT_SELECT_OPTIONS}
              onChange={(font_weight) => onChange({ ...style, font_weight })}
              isLightMode={isLightMode}
              ariaLabel="Ketebalan font widget"
              minWidthClass="min-w-[136px]"
            />
          }
        />
        <div className="px-3.5 py-1.5 flex items-center justify-between gap-4 text-[12px]">
          <span className={mutedText}>Skala Ukuran Teks (85% - 140%)</span>
          <input
            type="range"
            min={85}
            max={140}
            value={Math.round(style.text_scale * 100)}
            onChange={(e) =>
              onChange({ ...style, text_scale: Number(e.target.value) / 100 })
            }
            className="w-44 accent-[#0a84ff] cursor-pointer"
          />
        </div>
        <SettingRow
          icon={<Eye size={15} />}
          iconBgClass="bg-[#30d158]/15"
          iconColorClass="text-[#30d158]"
          title="Bayangan Teks Lembut"
          subtitle="Di-cache ke bitmap offscreen agar hemat GPU"
          isLightMode={isLightMode}
          control={
            <IosSwitch
              checked={style.shadow_enabled}
              onChange={(shadow_enabled) => onChange({ ...style, shadow_enabled })}
            />
          }
        />
        <SettingRow
          icon={<SunMedium size={15} />}
          iconBgClass="bg-[#64d2ff]/15"
          iconColorClass="text-[#64d2ff]"
          title="Halo Tipis di Sekitar Teks"
          subtitle="Membantu keterbacaan di wallpaper terang atau ramai"
          isLightMode={isLightMode}
          control={
            <IosSwitch
              checked={style.halo_enabled}
              onChange={(halo_enabled) => onChange({ ...style, halo_enabled })}
            />
          }
        />
      </div>

      {/* Presets */}
      <div className="flex flex-col gap-2.5 pt-2 border-t border-white/[0.06]">
        <span className={`text-[11px] font-semibold uppercase tracking-[0.06em] ${mutedText}`}>
          Preset Warna Tersimpan
        </span>
        <div className="flex flex-wrap gap-1.5">
          {presets.map((p) => (
            <button
              key={p.id}
              type="button"
              onClick={() => onChange(p.style)}
              className={`px-3 py-1.5 rounded-[10px] border text-[11.5px] font-medium cursor-pointer transition-colors ${
                isLightMode
                  ? "border-black/10 hover:border-[#0a84ff] bg-black/[0.03]"
                  : "border-white/10 hover:border-[#0a84ff] bg-white/[0.04]"
              }`}
            >
              {p.name}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-2">
          <input
            type="text"
            value={presetName}
            onChange={(e) => setPresetName(e.target.value)}
            placeholder="Simpan gaya ini sebagai preset..."
            className={`flex-1 h-9 px-3 rounded-[10px] border text-[12px] outline-none focus:border-[#0a84ff] ${
              isLightMode
                ? "bg-black/[0.03] border-black/10 text-neutral-900"
                : "bg-[#1a1b22] border-white/10 text-white"
            }`}
          />
          <button
            type="button"
            onClick={() => {
              if (!presetName.trim()) return;
              onSavePreset(presetName.trim(), style);
              setPresetName("");
            }}
            className="h-9 px-3.5 rounded-[10px] bg-[#0a84ff] hover:bg-[#0071e3] text-white text-[12px] font-semibold flex items-center gap-1.5 cursor-pointer"
          >
            <Save size={13} /> Simpan
          </button>
        </div>
      </div>
    </div>
  );
};
