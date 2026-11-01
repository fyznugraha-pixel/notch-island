import React from "react";
import { NavbarConfig, NavbarModuleView } from "../types/navbar";

export type NavbarModuleCategory =
  | "produktif"
  | "sistem"
  | "media"
  | "gayahidup";

export interface NavbarModuleContext {
  view: NavbarModuleView;
  config: NavbarConfig;
  onOpenPanel?: (tabId: string) => void;
}

export interface NavbarModuleDefinition {
  id: string;
  name: string;
  category: NavbarModuleCategory;
  desc: string;
  group: 1 | 2 | 3;
  defaultView: NavbarModuleView;
  chipLabel: string;
  chipSub: string;
  accentColor: string;
  component?: React.ComponentType<NavbarModuleContext>;
}
