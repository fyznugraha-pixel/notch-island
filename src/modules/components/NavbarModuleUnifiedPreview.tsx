import React from "react";
import rawCatalog from "../modules.catalog.json";

export interface CatalogModuleItem {
  index: number;
  id: string;
  name: string;
  description: string;
  category: "Produktif" | "Sistem" | "Media & estetika" | "Gaya hidup";
  categoryColor: string;
  previewHtml: string;
  tileHtml: string;
  pillHtml: string;
}

export const MODULE_CATALOG: CatalogModuleItem[] = rawCatalog as CatalogModuleItem[];

// Alias map for legacy IDs to match canonical catalog IDs
export const MODULE_ID_ALIASES: Record<string, string> = {
  event: "acara_berikutnya",
  todo: "to_do_fokus",
  pomodoro: "pomodoro",
  quicknote: "catat_cepat",
  system: "pantau_sistem",
  net: "jaringan",
  weather: "cuaca",
  clock: "jam_dunia",
  battery: "baterai_daya",
  startSearch: "start_search",
  pinnedApps: "pinned_apps",
  runningApps: "running_apps",
  systemIcons: "output_audio",
  notifications: "notifications",
  clockDate: "jam_dunia",
};

export function getCatalogModule(id: string): CatalogModuleItem | undefined {
  const canonical = MODULE_ID_ALIASES[id] || id;
  return MODULE_CATALOG.find((m) => m.id === canonical || m.id === id);
}

export type ModulePreviewVariant = "full" | "compact" | "pill";

interface NavbarModuleUnifiedPreviewProps {
  moduleId: string;
  variant?: ModulePreviewVariant;
  className?: string;
  style?: React.CSSProperties;
  onClick?: () => void;
}

export const NavbarModuleUnifiedPreview: React.FC<NavbarModuleUnifiedPreviewProps> = ({
  moduleId,
  variant = "full",
  className = "",
  style,
  onClick,
}) => {
  const item = getCatalogModule(moduleId);

  if (!item) {
    // Fallback if not found in catalog
    return (
      <div
        className={`w-10 h-10 rounded-[12px] bg-white/10 flex items-center justify-center text-zinc-400 text-xs ${className}`}
        style={style}
        onClick={onClick}
      >
        {moduleId.slice(0, 2).toUpperCase()}
      </div>
    );
  }

  let htmlSnippet = item.previewHtml;
  if (variant === "compact") {
    htmlSnippet = item.tileHtml;
  } else if (variant === "pill") {
    htmlSnippet = item.pillHtml;
  }

  return (
    <div
      className={`inline-flex shrink-0 select-none ${className}`}
      style={style}
      onClick={onClick}
      dangerouslySetInnerHTML={{ __html: htmlSnippet }}
    />
  );
};

