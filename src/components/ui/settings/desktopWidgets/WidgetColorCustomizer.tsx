import React, { useEffect, useState } from "react";
import { AlertTriangle, Sparkles, Save, Palette } from "lucide-react";
import {
  BackgroundMode,
  ColorPreset,
  ColorRoleSource,
  RgbaColor,
  WallpaperRegionAnalysis,
  WidgetStyleConfig,
  analyzeWidgetWallpaperContrast,
  hexToRgba,
  rgbaToHex,
} from "../../../../services/desktopWidgetsService";

interface WidgetColorCustomizerProps {
  style: WidgetStyleConfig;
  presets: ColorPreset[];
  recentColors: string[];
  isLightMode: boolean;
  title: string;
  onChange: (next: WidgetStyleConfig) => void;
  onSavePreset: (name: string, style: WidgetStyleConfig) => void;
  onRecordRecentColor: (hex: string) => void;
}

const FONT_OPTIONS = [
  "Segoe UI Variable",
  "Segoe UI",
  "Bahnschrift",
  "Cascadia Code",
  "Georgia",
  "Trebuchet MS",
];

const BG_MODES: { id: BackgroundMode; label: string; desc: string }[] = [
  { id: "none", label: "Tanpa Latar", desc: "Hanya isi (default)" },
  { id: "subtle_tint", label: "Tint Tipis", desc: "Kartu 10-25%" },
  { id: "glass", label: "Kaca", desc: "Blur sistem" },
  { id: "solid", label: "Solid", desc: "Kartu opak" },
];

type RoleKey = "text_primary" | "text_secondary" | "accent" | "card_color";

const ROLE_LABELS: { key: RoleKey; label: string }[] = [
  { key: "text_primary", label: "Teks Utama" },
  { key: "text_secondary", label: "Teks Sekunder" },
  { key: "accent", label: "Aksen & Grafik" },
  { key: "card_color", label: "Warna Kartu" },
];

export const WidgetColorCustomizer: React.FC<WidgetColorCustomizerProps> = ({
  style,
  presets,
  recentColors,
  isLightMode,
  title,
  onChange,
  onSavePreset,
  onRecordRecentColor,
}) => {
  const [activeRole, setActiveRole] = useState<RoleKey>("text_primary");
  const [analysis, setAnalysis] = useState<WallpaperRegionAnalysis | null>(null);
  const [hexDraft, setHexDraft] = useState("#F5F5F7");
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

  useEffect(() => {
    if (currentRoleSource.mode === "custom") {
      setHexDraft(rgbaToHex(currentRoleSource.color));
    }
  }, [activeRole, currentRoleSource]);

  const setRole = (role: RoleKey, src: ColorRoleSource) => {
    onChange({ ...style, [role]: src });
  };

  const applyCustomHex = (hex: string, alpha?: number) => {
    const baseAlpha =
      currentRoleSource.mode === "custom" ? currentRoleSource.color.a : 1;
    const parsed = hexToRgba(hex, alpha ?? baseAlpha);
    if (!parsed) return;
    setRole(activeRole, { mode: "custom", color: parsed });
    onRecordRecentColor(rgbaToHex(parsed));
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
    if (previewLightBg) return fallback === "primary" ? "#111216" : "rgba(17,18,22,0.65)";
    return fallback === "primary" ? "#F5F5F7" : "rgba(245,245,247,0.68)";
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
        backdropFilter: "blur(18px)",
        border: "1px solid rgba(255,255,255,0.12)",
      };
    }
    return {
      backgroundColor: `rgba(${baseCard.r}, ${baseCard.g}, ${baseCard.b}, 0.96)`,
      border: "1px solid rgba(255,255,255,0.08)",
    };
  };

  const borderCls = isLightMode ? "border-black/10 bg-black/[0.03]" : "border-white/10 bg-white/[0.03]";
  const mutedText = isLightMode ? "text-neutral-500" : "text-zinc-400";

  return (
    <div className={`rounded-2xl border p-4 flex flex-col gap-4 ${borderCls}`}>
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Palette size={15} className="text-blue-400" />
          <span className="text-[13px] font-semibold">{title}</span>
        </div>
        <button
          type="button"
          onClick={() => setPreviewLightBg((v) => !v)}
          className={`px-2.5 py-1 rounded-lg text-[11px] font-medium border cursor-pointer ${borderCls}`}
        >
          Pratinjau: {previewLightBg ? "Wallpaper Terang" : "Wallpaper Gelap"}
        </button>
      </div>

      {/* Live preview over wallpaper sample */}
      <div
        className="rounded-2xl p-4 flex items-center justify-center transition-colors"
        style={{
          background: previewLightBg
            ? "linear-gradient(135deg, #e2e8f0 0%, #cbd5e1 55%, #f8fafc 100%)"
            : "linear-gradient(135deg, #0f172a 0%, #1e1b4b 55%, #09090b 100%)",
        }}
      >
        <div
          className="w-[260px] rounded-[24px] p-4 transition-all"
          style={{
            ...previewCardStyle(),
            fontFamily: style.font_family,
          }}
        >
          <div
            className="text-[11px] font-semibold tracking-wide uppercase"
            style={{ color: resolvedPreviewColor(style.accent, "accent") }}
          >
            Pratinjau Langsung
          </div>
          <div
            className="mt-1 tabular-nums leading-none"
            style={{
              fontSize: `${Math.round(34 * style.text_scale)}px`,
              fontWeight: style.font_weight,
              color: resolvedPreviewColor(style.text_primary, "primary"),
              textShadow: style.shadow_enabled
                ? `0 2px 6px rgba(${style.shadow_color.r},${style.shadow_color.g},${style.shadow_color.b},${style.shadow_color.a})`
                : undefined,
            }}
          >
            21:45
          </div>
          <div
            className="mt-1.5 text-[12px]"
            style={{ color: resolvedPreviewColor(style.text_secondary, "secondary") }}
          >
            Jumat, 20 November
          </div>
        </div>
      </div>

      {/* Low contrast warning banner */}
      {analysis?.low_contrast_warning && (
        <div className="flex items-start gap-2.5 rounded-xl border border-amber-500/40 bg-amber-500/10 px-3 py-2.5 text-[12px] text-amber-300">
          <AlertTriangle size={15} className="shrink-0 mt-0.5" />
          <div>
            <div className="font-semibold">
              Kontras rendah terdeteksi ({analysis.measured_contrast_ratio}:1)
            </div>
            <div className="opacity-85 text-[11px]">
              Warna teks pilihan mungkin sulit dibaca di atas area wallpaper saat ini. Gunakan warna
              Otomatis, aktifkan bayangan/halo, atau pilih latar Tint Tipis.
            </div>
          </div>
        </div>
      )}

      {/* Background mode (1-4) */}
      <div className="flex flex-col gap-1.5">
        <span className={`text-[11px] font-semibold uppercase tracking-wide ${mutedText}`}>
          Mode Latar Widget
        </span>
        <div className="grid grid-cols-4 gap-2">
          {BG_MODES.map((m) => {
            const active = style.background_mode === m.id;
            return (
              <button
                key={m.id}
                type="button"
                onClick={() => onChange({ ...style, background_mode: m.id })}
                className={`p-2 rounded-xl border text-left cursor-pointer transition-all ${
                  active
                    ? "border-blue-500 bg-blue-500/15"
                    : `${borderCls} hover:border-white/20`
                }`}
              >
                <div className="text-[12px] font-semibold">{m.label}</div>
                <div className={`text-[10px] ${mutedText}`}>{m.desc}</div>
              </button>
            );
          })}
        </div>
        {style.background_mode === "subtle_tint" && (
          <label className="flex items-center justify-between gap-3 mt-1 text-[12px]">
            <span className={mutedText}>
              Opasitas Tint ({Math.round(style.tint_opacity * 100)}%)
            </span>
            <input
              type="range"
              min={10}
              max={25}
              value={Math.round(style.tint_opacity * 100)}
              onChange={(e) =>
                onChange({ ...style, tint_opacity: Number(e.target.value) / 100 })
              }
              className="w-40 accent-blue-500"
            />
          </label>
        )}
      </div>

      {/* Role tabs + color source picker */}
      <div className="flex flex-col gap-2">
        <span className={`text-[11px] font-semibold uppercase tracking-wide ${mutedText}`}>
          Peran Warna
        </span>
        <div className="flex flex-wrap gap-1.5">
          {ROLE_LABELS.map((r) => (
            <button
              key={r.key}
              type="button"
              onClick={() => setActiveRole(r.key)}
              className={`px-2.5 py-1.5 rounded-lg text-[11.5px] font-medium border cursor-pointer ${
                activeRole === r.key
                  ? "border-blue-500 bg-blue-500/20 text-blue-300"
                  : borderCls
              }`}
            >
              {r.label}
            </button>
          ))}
        </div>

        <div className="flex flex-wrap items-center gap-2 mt-1">
          <button
            type="button"
            onClick={() => setRole(activeRole, { mode: "auto_contrast" })}
            className={`px-2.5 py-1.5 rounded-lg text-[11.5px] font-medium border cursor-pointer ${
              currentRoleSource.mode === "auto_contrast"
                ? "border-emerald-500 bg-emerald-500/20 text-emerald-300"
                : borderCls
            }`}
          >
            Otomatis (Kontras Wallpaper)
          </button>
          <button
            type="button"
            onClick={() => setRole(activeRole, { mode: "wallpaper_dominant" })}
            className={`px-2.5 py-1.5 rounded-lg text-[11.5px] font-medium border cursor-pointer flex items-center gap-1 ${
              currentRoleSource.mode === "wallpaper_dominant"
                ? "border-purple-500 bg-purple-500/20 text-purple-300"
                : borderCls
            }`}
          >
            <Sparkles size={12} /> Ambil dari Wallpaper
          </button>
        </div>

        <div className="flex flex-wrap items-center gap-2.5 mt-1">
          <input
            type="color"
            value={hexDraft}
            onChange={(e) => {
              setHexDraft(e.target.value.toUpperCase());
              applyCustomHex(e.target.value);
            }}
            className="w-9 h-8 rounded-lg cursor-pointer bg-transparent border-0"
          />
          <input
            type="text"
            value={hexDraft}
            onChange={(e) => {
              setHexDraft(e.target.value);
              if (/^#[0-9a-fA-F]{6}$/.test(e.target.value)) {
                applyCustomHex(e.target.value);
              }
            }}
            placeholder="#3882F6"
            className={`w-24 px-2.5 py-1.5 rounded-lg border text-[12px] font-mono ${borderCls}`}
          />
          <label className="flex items-center gap-2 text-[11.5px]">
            <span className={mutedText}>Opasitas</span>
            <input
              type="range"
              min={15}
              max={100}
              value={Math.round(
                (currentRoleSource.mode === "custom" ? currentRoleSource.color.a : 1) * 100
              )}
              onChange={(e) => applyCustomHex(hexDraft, Number(e.target.value) / 100)}
              className="w-24 accent-blue-500"
            />
          </label>
        </div>

        {/* Recent & wallpaper palette swatches */}
        <div className="flex flex-wrap items-center gap-1.5 mt-1">
          {recentColors.slice(0, 10).map((hex) => (
            <button
              key={hex}
              type="button"
              title={hex}
              onClick={() => {
                setHexDraft(hex);
                applyCustomHex(hex);
              }}
              className="w-5 h-5 rounded-full border border-white/25 cursor-pointer"
              style={{ backgroundColor: hex }}
            />
          ))}
          {analysis?.palette?.map((hex) => (
            <button
              key={`wp_${hex}`}
              type="button"
              title={`Palet wallpaper ${hex}`}
              onClick={() => {
                setHexDraft(hex);
                applyCustomHex(hex);
              }}
              className="w-5 h-5 rounded-md border border-blue-400/50 cursor-pointer"
              style={{ backgroundColor: hex }}
            />
          ))}
        </div>
      </div>

      {/* Legibility & Typography */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2 border-t border-white/10">
        <label className="flex flex-col gap-1 text-[12px]">
          <span className={mutedText}>Font Sistem</span>
          <select
            value={style.font_family}
            onChange={(e) => onChange({ ...style, font_family: e.target.value })}
            className={`px-2.5 py-1.5 rounded-lg border text-[12px] ${borderCls}`}
          >
            {FONT_OPTIONS.map((f) => (
              <option key={f} value={f} className="bg-zinc-900 text-white">
                {f}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1 text-[12px]">
          <span className={mutedText}>
            Skala Teks ({Math.round(style.text_scale * 100)}%)
          </span>
          <input
            type="range"
            min={85}
            max={140}
            value={Math.round(style.text_scale * 100)}
            onChange={(e) =>
              onChange({ ...style, text_scale: Number(e.target.value) / 100 })
            }
            className="accent-blue-500 mt-1.5"
          />
        </label>
        <label className="flex items-center gap-2 text-[12px] cursor-pointer">
          <input
            type="checkbox"
            checked={style.shadow_enabled}
            onChange={(e) => onChange({ ...style, shadow_enabled: e.target.checked })}
          />
          <span>Bayangan teks lembut (cache)</span>
        </label>
        <label className="flex items-center gap-2 text-[12px] cursor-pointer">
          <input
            type="checkbox"
            checked={style.halo_enabled}
            onChange={(e) => onChange({ ...style, halo_enabled: e.target.checked })}
          />
          <span>Halo tipis di sekitar teks</span>
        </label>
      </div>

      {/* Presets */}
      <div className="flex flex-col gap-2 pt-2 border-t border-white/10">
        <span className={`text-[11px] font-semibold uppercase tracking-wide ${mutedText}`}>
          Preset Warna Tersimpan
        </span>
        <div className="flex flex-wrap gap-1.5">
          {presets.map((p) => (
            <button
              key={p.id}
              type="button"
              onClick={() => onChange(p.style)}
              className={`px-2.5 py-1 rounded-lg border text-[11.5px] font-medium cursor-pointer hover:border-blue-400 ${borderCls}`}
            >
              {p.name}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-2 mt-1">
          <input
            type="text"
            value={presetName}
            onChange={(e) => setPresetName(e.target.value)}
            placeholder="Nama preset baru..."
            className={`flex-1 px-2.5 py-1.5 rounded-lg border text-[12px] ${borderCls}`}
          />
          <button
            type="button"
            onClick={() => {
              if (!presetName.trim()) return;
              onSavePreset(presetName.trim(), style);
              setPresetName("");
            }}
            className="px-3 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-500 text-white text-[12px] font-medium flex items-center gap-1.5 cursor-pointer"
          >
            <Save size={13} /> Simpan Preset
          </button>
        </div>
      </div>
    </div>
  );
};
