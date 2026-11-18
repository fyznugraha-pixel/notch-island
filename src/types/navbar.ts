export type NavbarShape = "anchored" | "floating";
export type NavbarPosition = "bottom" | "top" | "left" | "right";
export type NavbarStyle = "solid" | "liquid" | "followNotch";
export type NavbarBackground = "followNotch" | "black" | "custom";
export type NavbarIconSpacing = "tight" | "normal" | "roomy";
export type NavbarIconTheme =
  | "fluent"
  | "windows"
  | "ios"
  | "glass"
  | "monochrome"
  | "tinted"
  | "circle"
  | "retro"
  | "neon"
  | "clay"
  | "outline"
  | "pastel"
  | "sticker"
  | "contrast";
export type NavbarAutoHideMode = "normal" | "maxsize";
export type NavbarWindowAnimation = "genie" | "normal";
export type NavbarModuleView = "compact" | "full";
export type NavbarPowerState = "ACTIVE" | "IDLE" | "SUSPENDED";

export interface NavbarModuleConfig {
  id: string;
  group: 1 | 2 | 3;
  enabled: boolean;
  view: NavbarModuleView;
}

export interface NavbarConfig {
  enabled: boolean;
  shape: NavbarShape;
  position: NavbarPosition;
  monitorId: string;
  cornerRadius: number;
  distanceFromEdge: number;
  taskbarHeight: number;
  iconSize: number;
  iconSpacing: NavbarIconSpacing;
  iconTheme: NavbarIconTheme;
  style: NavbarStyle;
  background: NavbarBackground;
  customColor: string | null;
  accent: string;
  opacity: number;
  blur: number;
  autoHide: boolean;
  autoHideMode: NavbarAutoHideMode;
  windowAnimation: NavbarWindowAnimation;
  windowPreviews: boolean;
  magnify: boolean;
  appLabels: boolean;
  clock24h: boolean;
  hideWindowsTaskbar: boolean;
  useGiliStart?: boolean;
  useGiliSearch?: boolean;
  useGiliQuickSettings?: boolean;
  useGiliVolumeOutput?: boolean;
  useGiliNotificationsCalendar?: boolean;
  useGiliTray?: boolean;
  modules: NavbarModuleConfig[];
}

export const BUILTIN_MODULE_IDS = [
  "startSearch",
  "pinnedApps",
  "runningApps",
  "hiddenTray",
  "systemIcons",
  "notifications",
  "clockDate",
] as const;

export type BuiltinModuleId = (typeof BUILTIN_MODULE_IDS)[number];

export const DEFAULT_NAVBAR_MODULES: NavbarModuleConfig[] = [
  { id: "startSearch", group: 1, enabled: true, view: "compact" },
  { id: "pinnedApps", group: 2, enabled: true, view: "compact" },
  { id: "runningApps", group: 2, enabled: true, view: "compact" },
  { id: "hiddenTray", group: 3, enabled: true, view: "compact" },
  { id: "systemIcons", group: 3, enabled: true, view: "compact" },
  { id: "notifications", group: 3, enabled: true, view: "compact" },
  { id: "clockDate", group: 3, enabled: true, view: "compact" },
];

export const DEFAULT_NAVBAR_CONFIG: NavbarConfig = {
  enabled: false,
  shape: "floating",
  position: "bottom",
  monitorId: "all",
  cornerRadius: 15,
  distanceFromEdge: 14,
  taskbarHeight: 48,
  iconSize: 40,
  iconSpacing: "tight",
  iconTheme: "fluent",
  style: "solid",
  background: "black",
  customColor: null,
  accent: "#3882F6",
  opacity: 100,
  blur: 68,
  autoHide: false,
  autoHideMode: "normal",
  windowAnimation: "genie",
  windowPreviews: true,
  magnify: true,
  appLabels: false,
  clock24h: true,
  hideWindowsTaskbar: false,
  useGiliStart: false,
  useGiliSearch: false,
  useGiliQuickSettings: false,
  useGiliVolumeOutput: false,
  useGiliNotificationsCalendar: false,
  useGiliTray: false,
  modules: DEFAULT_NAVBAR_MODULES,
};

export const NAVBAR_ACCENT_COLORS = [
  "#3882F6", // Blue
  "#14b8a6", // Teal
  "#a855f7", // Purple
  "#f43f5e", // Rose
  "#f59e0b", // Amber
  "#22c55e", // Emerald
] as const;

export const VALID_NAVBAR_ICON_THEMES: ReadonlySet<NavbarIconTheme> = new Set([
  "fluent",
  "windows",
  "ios",
  "glass",
  "monochrome",
  "tinted",
  "circle",
  "retro",
  "neon",
  "clay",
  "outline",
  "pastel",
  "sticker",
  "contrast",
]);

