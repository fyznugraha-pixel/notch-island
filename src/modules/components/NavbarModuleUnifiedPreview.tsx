import React from "react";
import rawCatalog from "../modules.catalog.json";
import { useTaskbarLang } from "../../services/taskbarI18n";
import { localizePreviewHtml } from "../moduleI18n";

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

import { MODULE_ID_ALIASES } from "../moduleAliases";
export { MODULE_ID_ALIASES };

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

export const NavbarModuleUnifiedPreview: React.FC<NavbarModuleUnifiedPreviewProps> =
  React.memo(
    ({
      moduleId,
      variant = "full",
      className = "",
      style,
      onClick,
    }) => {
      const lang = useTaskbarLang();
      const item = getCatalogModule(moduleId);

      if (!item) {
        return (
          <div
            className={`gili-mod-compact rounded-[12px] bg-white/10 flex items-center justify-center text-zinc-400 text-xs ${className}`}
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
      } else {
        htmlSnippet = item.previewHtml.replace(
          "height:60px;border-radius:10px;",
          "width:100%;height:60px;border-radius:10px;padding:0 6px;box-sizing:border-box;"
        );
      }
      htmlSnippet = localizePreviewHtml(htmlSnippet, lang);

      return (
        <div
          className={`gili-mod-unified inline-flex shrink-0 select-none ${
            variant === "full" ? "w-full" : ""
          } ${className}`}
          style={style}
          onClick={onClick}
          dangerouslySetInnerHTML={{ __html: htmlSnippet }}
        />
      );
    }
  );
