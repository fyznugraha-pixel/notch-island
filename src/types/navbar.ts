export type NavbarShape = "anchored" | "floating";
export type NavbarPosition = "bottom" | "top" | "left" | "right";
export type NavbarStyle = "solid" | "liquid" | "followNotch";
export type NavbarBackground = "followNotch" | "black" | "custom";
export type NavbarIconSpacing = "tight" | "normal" | "roomy";
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
  iconSize: number;
  iconSpacing: NavbarIconSpacing;
  style: NavbarStyle;
  background: NavbarBackground;
  customColor: string | null;
  accent: string;
  opacity: number;
  autoHide: boolean;
  windowPreviews: boolean;
  magnify: boolean;
  appLabels: boolean;
  clock24h: boolean;
  hideWindowsTaskbar: boolean;
  modules: NavbarModuleConfig[];
}

export const BUILTIN_MODULE_IDS = [
  "startSearch",
  "pinnedApps",
  "runningApps",
  "systemIcons",
  "notifications",
  "clockDate",
] as const;

export type BuiltinModuleId = (typeof BUILTIN_MODULE_IDS)[number];

export const DEFAULT_NAVBAR_MODULES: NavbarModuleConfig[] = [
  { id: "startSearch", group: 1, enabled: true, view: "compact" },
  { id: "pinnedApps", group: 2, enabled: true, view: "compact" },
  { id: "runningApps", group: 2, enabled: true, view: "compact" },
  { id: "systemIcons", group: 3, enabled: true, view: "compact" },
  { id: "notifications", group: 3, enabled: true, view: "compact" },
  { id: "clockDate", group: 3, enabled: true, view: "compact" },
];

export const DEFAULT_NAVBAR_CONFIG: NavbarConfig = {
  enabled: false,
  shape: "floating",
  position: "bottom",
  monitorId: "primary",
  cornerRadius: 15,
  distanceFromEdge: 14,
  iconSize: 40,
  iconSpacing: "tight",
  style: "solid",
  background: "black",
  customColor: null,
  accent: "#3882F6",
  opacity: 100,
  autoHide: false,
  windowPreviews: true,
  magnify: true,
  appLabels: false,
  clock24h: true,
  hideWindowsTaskbar: false,
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

