import { WidgetStackSlot } from "../../../../services/desktopWidgetsService";
import { MonitorInfo } from "../MonitorSelector";
import { IosSelectOption } from "../../../ios/IosSelect";

export function normalizeMonitorToken(id: string): string {
  return id.trim().replace(/^\\\\\.\\/, "").toLowerCase();
}

export function canonicalMonitorIdFor(mon: MonitorInfo): string {
  return mon.is_primary ? "primary" : mon.id;
}

export function slotMatchesMonitor(slotMonitorId: string, mon: MonitorInfo): boolean {
  const trimmed = (slotMonitorId || "").trim();
  if (!trimmed || trimmed.toLowerCase() === "primary") {
    return mon.is_primary;
  }
  return normalizeMonitorToken(trimmed) === normalizeMonitorToken(mon.id);
}

export function canonicalizeMonitorId(monitorId: string, monitors: MonitorInfo[]): string {
  const trimmed = (monitorId || "").trim();
  if (!trimmed || trimmed.toLowerCase() === "primary") {
    return "primary";
  }
  const matched = monitors.find((m) => slotMatchesMonitor(trimmed, m));
  if (matched) {
    return canonicalMonitorIdFor(matched);
  }
  return trimmed;
}

export function formatWidgetMonitorLabel(mon: MonitorInfo, index: number, isId: boolean): string {
  const cleanDev = mon.id.replace(/^\\\\\.\\/, "");
  if (mon.is_primary) {
    return isId ? `Monitor ${index + 1} (Utama)` : `Monitor ${index + 1} (Primary)`;
  }
  return cleanDev ? `Monitor ${index + 1} (${cleanDev})` : `Monitor ${index + 1}`;
}

export function resolveSlotMonitorLabel(
  slotMonitorId: string,
  monitors: MonitorInfo[],
  isId: boolean
): string {
  const idx = monitors.findIndex((m) => slotMatchesMonitor(slotMonitorId, m));
  if (idx >= 0) {
    return formatWidgetMonitorLabel(monitors[idx], idx, isId);
  }
  const trimmed = (slotMonitorId || "").trim();
  if (!trimmed || trimmed.toLowerCase() === "primary") {
    return isId ? "Monitor 1 (Utama)" : "Monitor 1 (Primary)";
  }
  const clean = trimmed.replace(/^\\\\\.\\/, "");
  return isId ? `${clean} (Terputus)` : `${clean} (Disconnected)`;
}

export function buildMonitorSelectOptions(
  monitors: MonitorInfo[],
  isId: boolean,
  currentMonitorId?: string
): IosSelectOption<string>[] {
  const options: IosSelectOption<string>[] = monitors.map((m, idx) => ({
    value: canonicalMonitorIdFor(m),
    label: formatWidgetMonitorLabel(m, idx, isId),
    sublabel: `${m.width} × ${m.height}`,
  }));

  if (options.length === 0) {
    options.push({
      value: "primary",
      label: isId ? "Monitor 1 (Utama)" : "Monitor 1 (Primary)",
    });
  }

  if (currentMonitorId !== undefined) {
    const canonicalCur = canonicalizeMonitorId(currentMonitorId, monitors);
    if (!options.some((o) => o.value === canonicalCur)) {
      options.push({
        value: canonicalCur,
        label: resolveSlotMonitorLabel(canonicalCur, monitors, isId),
      });
    }
  }

  return options;
}

export function findFreeGridCell(
  slots: WidgetStackSlot[],
  targetMonitorId: string,
  monitors: MonitorInfo[],
  ignoreSlotId?: string
): { col: number; row: number } {
  const targetMon = monitors.find((m) => slotMatchesMonitor(targetMonitorId, m));
  const canonicalTarget = canonicalizeMonitorId(targetMonitorId, monitors);

  const usedCells = new Set(
    slots
      .filter((s) => {
        if (ignoreSlotId && s.slot_id === ignoreSlotId) return false;
        if (targetMon) return slotMatchesMonitor(s.monitor_id, targetMon);
        return normalizeMonitorToken(s.monitor_id || "primary") === normalizeMonitorToken(canonicalTarget);
      })
      .map((s) => `${s.grid_col},${s.grid_row}`)
  );

  for (let col = 0; col <= 8; col += 2) {
    for (let row = 0; row < 3; row++) {
      if (!usedCells.has(`${col},${row}`)) {
        return { col, row };
      }
    }
  }
  return { col: 0, row: 0 };
}
