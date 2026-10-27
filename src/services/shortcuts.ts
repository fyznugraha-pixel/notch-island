import { register, unregister, unregisterAll } from "@tauri-apps/plugin-global-shortcut";

export type ShortcutActionId =
  | "toggle_notch"
  | "quick_task"
  | "quick_note"
  | "open_media"
  | "toggle_media_playback"
  | "toggle_focus_mode"
  | "toggle_hide";

export type ShortcutStatus = "ok" | "conflict" | "invalid" | "inactive";

export interface ShortcutActionDefinition {
  id: ShortcutActionId;
  defaultShortcut: string | null;
  labelKey: string;
  descKey: string;
}

export const SHORTCUT_ACTIONS: ShortcutActionDefinition[] = [
  {
    id: "toggle_notch",
    defaultShortcut: "Control+Alt+G",
    labelKey: "shortcut_action_toggle_notch",
    descKey: "shortcut_action_toggle_notch_desc",
  },
  {
    id: "quick_task",
    defaultShortcut: "Control+Alt+T",
    labelKey: "shortcut_action_quick_task",
    descKey: "shortcut_action_quick_task_desc",
  },
  {
    id: "quick_note",
    defaultShortcut: "Control+Shift+N",
    labelKey: "shortcut_action_quick_note",
    descKey: "shortcut_action_quick_note_desc",
  },
  {
    id: "open_media",
    defaultShortcut: null,
    labelKey: "shortcut_action_open_media",
    descKey: "shortcut_action_open_media_desc",
  },
  {
    id: "toggle_media_playback",
    defaultShortcut: null,
    labelKey: "shortcut_action_toggle_media_playback",
    descKey: "shortcut_action_toggle_media_playback_desc",
  },
  {
    id: "toggle_focus_mode",
    defaultShortcut: null,
    labelKey: "shortcut_action_toggle_focus_mode",
    descKey: "shortcut_action_toggle_focus_mode_desc",
  },
  {
    id: "toggle_hide",
    defaultShortcut: "Control+Shift+D",
    labelKey: "shortcut_action_toggle_hide",
    descKey: "shortcut_action_toggle_hide_desc",
  },
];

export const DEFAULT_SHORTCUTS: Record<ShortcutActionId, string | null> = {
  toggle_notch: "Control+Alt+G",
  quick_task: "Control+Alt+T",
  quick_note: "Control+Shift+N",
  open_media: null,
  toggle_media_playback: null,
  toggle_focus_mode: null,
  toggle_hide: "Control+Shift+D",
};

const RESERVED_SYSTEM_COMBINATIONS = new Set([
  "Alt+Space",
  "Alt+F4",
  "Alt+Tab",
  "Control+Alt+Delete",
  "Control+Shift+Escape",
  "Control+Escape",
]);

/**
 * Normalizes a KeyboardEvent into a Tauri accelerator string using event.code
 */
export function parseKeyEventToAccelerator(event: KeyboardEvent): {
  isComplete: boolean;
  accelerator: string | null;
  displayChips: string[];
  error?: string;
} {
  const isModifierOnly = [
    "ControlLeft",
    "ControlRight",
    "AltLeft",
    "AltRight",
    "ShiftLeft",
    "ShiftRight",
    "MetaLeft",
    "MetaRight",
  ].includes(event.code);

  const modifiers: string[] = [];
  const displayMods: string[] = [];

  if (event.ctrlKey) {
    modifiers.push("Control");
    displayMods.push("Ctrl");
  }
  if (event.altKey) {
    modifiers.push("Alt");
    displayMods.push("Alt");
  }
  if (event.shiftKey) {
    modifiers.push("Shift");
    displayMods.push("Shift");
  }

  // Windows / Super key is strictly rejected
  if (event.metaKey || event.code === "MetaLeft" || event.code === "MetaRight") {
    return {
      isComplete: true,
      accelerator: null,
      displayChips: ["Win", ...displayMods],
      error: "shortcut_err_no_windows_key",
    };
  }

  if (isModifierOnly) {
    return {
      isComplete: false,
      accelerator: null,
      displayChips: displayMods,
    };
  }

  // Map physical event.code to Tauri accelerator key name
  const primaryKey = mapEventCodeToKey(event.code);
  if (!primaryKey) {
    return {
      isComplete: false,
      accelerator: null,
      displayChips: displayMods,
      error: "shortcut_err_invalid_key",
    };
  }

  // Check modifier requirement
  if (modifiers.length === 0) {
    return {
      isComplete: true,
      accelerator: null,
      displayChips: [primaryKey],
      error: "shortcut_err_need_modifier",
    };
  }

  const accelerator = [...modifiers, primaryKey].join("+");
  const displayChips = [...displayMods, formatKeyForDisplay(primaryKey)];

  if (RESERVED_SYSTEM_COMBINATIONS.has(accelerator)) {
    return {
      isComplete: true,
      accelerator: null,
      displayChips,
      error: "shortcut_err_reserved_system",
    };
  }

  return {
    isComplete: true,
    accelerator,
    displayChips,
  };
}

function mapEventCodeToKey(code: string): string | null {
  if (code.startsWith("Key")) {
    return code.slice(3).toUpperCase();
  }
  if (code.startsWith("Digit")) {
    return code.slice(5);
  }
  if (code.startsWith("F") && !isNaN(Number(code.slice(1)))) {
    return code;
  }
  if (code.startsWith("Numpad") && !isNaN(Number(code.slice(6)))) {
    return code;
  }

  const specialMap: Record<string, string> = {
    Space: "Space",
    Tab: "Tab",
    Enter: "Enter",
    Minus: "Minus",
    Equal: "Equal",
    BracketLeft: "BracketLeft",
    BracketRight: "BracketRight",
    Backslash: "Backslash",
    Semicolon: "Semicolon",
    Quote: "Quote",
    Comma: "Comma",
    Period: "Period",
    Slash: "Slash",
    Backquote: "Backquote",
    ArrowUp: "ArrowUp",
    ArrowDown: "ArrowDown",
    ArrowLeft: "ArrowLeft",
    ArrowRight: "ArrowRight",
    Home: "Home",
    End: "End",
    PageUp: "PageUp",
    PageDown: "PageDown",
    Insert: "Insert",
    Delete: "Delete",
    Escape: "Escape",
  };

  return specialMap[code] || null;
}

function formatKeyForDisplay(key: string): string {
  const displayMap: Record<string, string> = {
    Slash: "/",
    Backslash: "\\",
    Comma: ",",
    Period: ".",
    Semicolon: ";",
    Quote: "'",
    Minus: "-",
    Equal: "=",
    BracketLeft: "[",
    BracketRight: "]",
    Backquote: "`",
    ArrowUp: "↑",
    ArrowDown: "↓",
    ArrowLeft: "←",
    ArrowRight: "→",
  };
  return displayMap[key] || key;
}

export function formatAcceleratorToChips(shortcut: string | null): string[] {
  if (!shortcut) return [];
  return shortcut.split("+").map((part) => {
    if (part === "Control" || part === "Ctrl" || part === "CommandOrControl") return "Ctrl";
    if (part === "Alt") return "Alt";
    if (part === "Shift") return "Shift";
    return formatKeyForDisplay(part);
  });
}

/**
 * Formats accelerator string to a clean uppercase badge label (e.g. "CTRL ALT T", "CTRL ⇧ N")
 */
export function formatShortcutForBadge(shortcut: string | null): string {
  if (!shortcut) return "";
  const chips = formatAcceleratorToChips(shortcut);
  return chips
    .map((c) => {
      if (c === "Ctrl") return "CTRL";
      if (c === "Alt") return "ALT";
      if (c === "Shift") return "⇧";
      return c.toUpperCase();
    })
    .join(" ");
}

/**
 * Validates if an accelerator is valid and doesn't duplicate another action
 */
export function validateShortcut(
  actionId: ShortcutActionId,
  accelerator: string | null,
  currentShortcuts: Record<ShortcutActionId, string | null>,
  actionLabels: Record<ShortcutActionId, string>
): { valid: boolean; error?: string } {
  if (!accelerator) return { valid: true };

  const parts = accelerator.split("+");
  const hasModifier = parts.some((p) => ["Control", "Ctrl", "Alt", "Shift", "CommandOrControl"].includes(p));
  if (!hasModifier) {
    return { valid: false, error: "shortcut_err_need_modifier" };
  }

  if (parts.some((p) => p === "Super" || p === "Meta")) {
    return { valid: false, error: "shortcut_err_no_windows_key" };
  }

  if (RESERVED_SYSTEM_COMBINATIONS.has(accelerator)) {
    return { valid: false, error: "shortcut_err_reserved_system" };
  }

  // Check duplicate
  for (const [id, assigned] of Object.entries(currentShortcuts)) {
    if (id !== actionId && assigned && assigned.toLowerCase() === accelerator.toLowerCase()) {
      const otherLabel = actionLabels[id as ShortcutActionId] || id;
      return {
        valid: false,
        error: `shortcut_err_duplicate::${otherLabel}`,
      };
    }
  }

  return { valid: true };
}

class ShortcutManagerService {
  private activeShortcuts: Record<ShortcutActionId, string | null> = { ...DEFAULT_SHORTCUTS };
  private activeHandlers: Partial<Record<ShortcutActionId, () => void>> = {};
  private isSuspended = false;
  private queue: Promise<any> = Promise.resolve();

  private queueOperation<T>(operation: () => Promise<T>): Promise<T> {
    const next = this.queue.then(operation, operation);
    this.queue = next.catch(() => {});
    return next;
  }

  public async applyAll(
    map: Record<ShortcutActionId, string | null>,
    enabled: boolean,
    handlers: Partial<Record<ShortcutActionId, () => void>>
  ): Promise<Record<ShortcutActionId, ShortcutStatus>> {
    return this.queueOperation(async () => {
      this.isSuspended = false;
      this.activeShortcuts = { ...map };
      this.activeHandlers = { ...handlers };

      const statusMap: Record<ShortcutActionId, ShortcutStatus> = {
        toggle_notch: "inactive",
        quick_task: "inactive",
        quick_note: "inactive",
        open_media: "inactive",
        toggle_media_playback: "inactive",
        toggle_focus_mode: "inactive",
        toggle_hide: "inactive",
      };

      try {
        await unregisterAll();
      } catch (e) {
        console.warn("[ShortcutManager] unregisterAll failed:", e);
      }

      if (!enabled) {
        return statusMap;
      }

      for (const action of SHORTCUT_ACTIONS) {
        const shortcut = map[action.id];
        if (!shortcut) {
          statusMap[action.id] = "inactive";
          continue;
        }

        try {
          // Always clean up any existing registration in Windows OS first to avoid self-collision
          try {
            await unregister(shortcut);
          } catch {}

          await register(shortcut, (event) => {
            if (event.state === "Pressed") {
              const handler = this.activeHandlers[action.id];
              if (handler) {
                handler();
              }
            }
          });
          statusMap[action.id] = "ok";
        } catch (err: any) {
          console.warn(`[ShortcutManager] Failed to register ${shortcut} for ${action.id}:`, err);
          statusMap[action.id] = "conflict";
        }
      }

      return statusMap;
    });
  }

  public updateHandlers(handlers: Partial<Record<ShortcutActionId, () => void>>): void {
    this.activeHandlers = { ...handlers };
  }

  public async suspendAll(): Promise<void> {
    return this.queueOperation(async () => {
      if (this.isSuspended) return;
      this.isSuspended = true;
      try {
        await unregisterAll();
      } catch (e) {
        console.warn("[ShortcutManager] suspendAll failed:", e);
      }
    });
  }

  public async destroy(): Promise<void> {
    return this.queueOperation(async () => {
      this.isSuspended = false;
      try {
        await unregisterAll();
      } catch (e) {
        console.warn("[ShortcutManager] destroy unregisterAll failed:", e);
      }
    });
  }

  public async resumeAll(enabled: boolean): Promise<Record<ShortcutActionId, ShortcutStatus>> {
    this.isSuspended = false;
    return this.applyAll(this.activeShortcuts, enabled, this.activeHandlers);
  }

  public async testRegister(
    _actionId: ShortcutActionId,
    newShortcut: string | null,
    handler?: () => void
  ): Promise<ShortcutStatus> {
    if (!newShortcut) return "inactive";

    return this.queueOperation(async () => {
      try {
        // Clean up any stale OS registration first
        try {
          await unregister(newShortcut);
        } catch {}

        await register(newShortcut, (event) => {
          if (event.state === "Pressed" && handler) {
            handler();
          }
        });

        // Always unregister test registration so applyAll can register it cleanly
        try {
          await unregister(newShortcut);
        } catch {}

        return "ok";
      } catch (err: any) {
        const errStr = String(err || "");
        if (errStr.toLowerCase().includes("conflict") || errStr.toLowerCase().includes("already")) {
          return "conflict";
        }
        return "invalid";
      }
    });
  }

  public async unregisterShortcut(shortcut: string): Promise<void> {
    return this.queueOperation(async () => {
      try {
        await unregister(shortcut);
      } catch (e) {
        console.warn(`[ShortcutManager] unregister failed for ${shortcut}:`, e);
      }
    });
  }

  public getShortcut(action: ShortcutActionId): string | null {
    return this.activeShortcuts[action] ?? null;
  }
}

export const shortcutManager = new ShortcutManagerService();
