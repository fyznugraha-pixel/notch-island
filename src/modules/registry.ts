import {
  NavbarModuleDefinition,
  NavbarModuleCategory,
  NavbarModuleContext,
} from "./types";

export type NavbarModuleProps = NavbarModuleContext;
import rawCatalog from "./modules.catalog.json";
import { COMPONENT_MAP, MODULE_ID_ALIASES } from "./moduleComponents";
import { getLocalizedCategoryLabel, getLocalizedModuleMeta } from "./moduleI18n";
import type { Language } from "../services/languageStore";

interface RawCatalogItem {
  index: number;
  id: string;
  name: string;
  description: string;
  category: "Produktif" | "Sistem" | "Media & estetika" | "Gaya hidup";
  categoryColor: string;
}

export const NAVBAR_MODULE_CATALOG: NavbarModuleDefinition[] = (
  rawCatalog as RawCatalogItem[]
).map((item) => {
  let group: 1 | 2 | 3 = 2;
  if (item.category === "Sistem") {
    group = 3;
  }

  const comp =
    COMPONENT_MAP[item.id] || COMPONENT_MAP[MODULE_ID_ALIASES[item.id]];

  return {
    id: item.id,
    name: item.name,
    category: item.category as NavbarModuleCategory,
    desc: item.description,
    group,
    defaultView: "compact",
    chipLabel: item.name,
    chipSub: item.category,
    accentColor: item.categoryColor,
    component: comp,
  };
});

export const getNavbarModuleById = (
  id: string
): NavbarModuleDefinition | undefined => {
  const canonicalId = MODULE_ID_ALIASES[id] || id;
  return (
    NAVBAR_MODULE_CATALOG.find((m) => m.id === canonicalId || m.id === id) ||
    NAVBAR_MODULE_CATALOG.find((m) => m.id.toLowerCase() === id.toLowerCase())
  );
};

export const localizeNavbarModuleDefinition = (
  mod: NavbarModuleDefinition,
  lang: Language
): NavbarModuleDefinition => {
  const meta = getLocalizedModuleMeta(mod.id, lang, mod.name, mod.desc);
  const localizedCategory = getLocalizedCategoryLabel(mod.category, lang);
  return {
    ...mod,
    name: meta.name,
    desc: meta.description,
    chipLabel: meta.name,
    chipSub: localizedCategory,
  };
};

export const getLocalizedNavbarCatalog = (
  lang: Language
): NavbarModuleDefinition[] =>
  NAVBAR_MODULE_CATALOG.map((mod) => localizeNavbarModuleDefinition(mod, lang));

export const getLocalizedNavbarModuleById = (
  id: string,
  lang: Language
): NavbarModuleDefinition | undefined => {
  const found = getNavbarModuleById(id);
  return found ? localizeNavbarModuleDefinition(found, lang) : undefined;
};
