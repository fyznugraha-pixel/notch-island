import { NavbarModuleDefinition, NavbarModuleCategory } from "./types";
import rawCatalog from "./modules.catalog.json";
import { PomodoroNavbarModule } from "./components/PomodoroNavbarModule";
import { TodoNavbarModule } from "./components/TodoNavbarModule";
import { EventNavbarModule } from "./components/EventNavbarModule";
import { SystemNavbarModule } from "./components/SystemNavbarModule";
import { NetNavbarModule } from "./components/NetNavbarModule";
import { WeatherNavbarModule } from "./components/WeatherNavbarModule";
import { MODULE_ID_ALIASES } from "./components/NavbarModuleUnifiedPreview";

interface RawCatalogItem {
  index: number;
  id: string;
  name: string;
  description: string;
  category: "Produktif" | "Sistem" | "Media & estetika" | "Gaya hidup";
  categoryColor: string;
}

// Active dynamic components mapping
const COMPONENT_MAP: Record<string, any> = {
  acara_berikutnya: EventNavbarModule,
  event: EventNavbarModule,
  to_do_fokus: TodoNavbarModule,
  todo: TodoNavbarModule,
  pomodoro: PomodoroNavbarModule,
  pantau_sistem: SystemNavbarModule,
  system: SystemNavbarModule,
  jaringan: NetNavbarModule,
  net: NetNavbarModule,
  cuaca: WeatherNavbarModule,
  weather: WeatherNavbarModule,
};

export const NAVBAR_MODULE_CATALOG: NavbarModuleDefinition[] = (
  rawCatalog as RawCatalogItem[]
).map((item) => {
  let group: 1 | 2 | 3 = 2;
  if (item.category === "Sistem") {
    group = 3;
  }

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
    component: COMPONENT_MAP[item.id],
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
