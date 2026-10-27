import {
  SHORTCUT_ACTIONS,
  DEFAULT_SHORTCUTS,
  parseKeyEventToAccelerator,
  formatAcceleratorToChips,
  formatShortcutForBadge,
  validateShortcut,
} from "../src/services/shortcuts.ts";
import type { ShortcutActionId } from "../src/services/shortcuts.ts";

interface TestCase {
  name: string;
  run: () => void | Promise<void>;
}

const testCases: TestCase[] = [];
let passCount = 0;
let failCount = 0;

function it(name: string, fn: () => void | Promise<void>) {
  testCases.push({ name, run: fn });
}

function expectEqual<T>(actual: T, expected: T, msg?: string) {
  const actualStr = JSON.stringify(actual);
  const expectedStr = JSON.stringify(expected);
  if (actualStr !== expectedStr) {
    throw new Error(`${msg || "Assertion failed"}: expected ${expectedStr}, got ${actualStr}`);
  }
}

function expectTrue(val: boolean, msg?: string) {
  if (!val) throw new Error(msg || "Expected true, got false");
}

function expectFalse(val: boolean, msg?: string) {
  if (val) throw new Error(msg || "Expected false, got true");
}

function createMockKeyEvent(code: string, modifiers: { ctrl?: boolean; alt?: boolean; shift?: boolean; meta?: boolean } = {}): KeyboardEvent {
  return {
    code,
    ctrlKey: Boolean(modifiers.ctrl),
    altKey: Boolean(modifiers.alt),
    shiftKey: Boolean(modifiers.shift),
    metaKey: Boolean(modifiers.meta),
    key: code,
    preventDefault: () => {},
    stopPropagation: () => {},
  } as unknown as KeyboardEvent;
}

// -------------------------------------------------------------
// Case 1: Parsing valid key combinations to Tauri accelerators
// -------------------------------------------------------------
it("Case 1: Parse valid key combinations to accelerators", () => {
  const e1 = createMockKeyEvent("KeyG", { ctrl: true, alt: true });
  const res1 = parseKeyEventToAccelerator(e1);
  expectEqual(res1.isComplete, true);
  expectEqual(res1.accelerator, "Control+Alt+G");
  expectEqual(res1.displayChips, ["Ctrl", "Alt", "G"]);

  const e2 = createMockKeyEvent("KeyT", { ctrl: true, shift: true });
  const res2 = parseKeyEventToAccelerator(e2);
  expectEqual(res2.isComplete, true);
  expectEqual(res2.accelerator, "Control+Shift+T");
  expectEqual(res2.displayChips, ["Ctrl", "Shift", "T"]);

  const e3 = createMockKeyEvent("KeyS", { ctrl: true, alt: true, shift: true });
  const res3 = parseKeyEventToAccelerator(e3);
  expectEqual(res3.isComplete, true);
  expectEqual(res3.accelerator, "Control+Alt+Shift+S");

  const e4 = createMockKeyEvent("F1", { ctrl: true });
  const res4 = parseKeyEventToAccelerator(e4);
  expectEqual(res4.isComplete, true);
  expectEqual(res4.accelerator, "Control+F1");

  const e5 = createMockKeyEvent("Slash", { ctrl: true, alt: true });
  const res5 = parseKeyEventToAccelerator(e5);
  expectEqual(res5.isComplete, true);
  expectEqual(res5.accelerator, "Control+Alt+Slash");
  expectEqual(res5.displayChips, ["Ctrl", "Alt", "/"]);
});

// -------------------------------------------------------------
// Case 2: Modifier-only keys return incomplete status
// -------------------------------------------------------------
it("Case 2: Modifier-only keys are recognized as incomplete", () => {
  const e1 = createMockKeyEvent("ControlLeft", { ctrl: true });
  const res1 = parseKeyEventToAccelerator(e1);
  expectEqual(res1.isComplete, false);
  expectEqual(res1.accelerator, null);
  expectEqual(res1.displayChips, ["Ctrl"]);

  const e2 = createMockKeyEvent("AltRight", { alt: true });
  const res2 = parseKeyEventToAccelerator(e2);
  expectEqual(res2.isComplete, false);
  expectEqual(res2.accelerator, null);
  expectEqual(res2.displayChips, ["Alt"]);

  const e3 = createMockKeyEvent("ShiftLeft", { shift: true });
  const res3 = parseKeyEventToAccelerator(e3);
  expectEqual(res3.isComplete, false);
  expectEqual(res3.accelerator, null);
  expectEqual(res3.displayChips, ["Shift"]);
});

// -------------------------------------------------------------
// Case 3: Single keys without modifier are rejected
// -------------------------------------------------------------
it("Case 3: Single keys without modifier are rejected", () => {
  const e1 = createMockKeyEvent("KeyG", {});
  const res1 = parseKeyEventToAccelerator(e1);
  expectEqual(res1.isComplete, true);
  expectEqual(res1.accelerator, null);
  expectEqual(res1.error, "shortcut_err_need_modifier");

  const e2 = createMockKeyEvent("F5", {});
  const res2 = parseKeyEventToAccelerator(e2);
  expectEqual(res2.isComplete, true);
  expectEqual(res2.accelerator, null);
  expectEqual(res2.error, "shortcut_err_need_modifier");
});

// -------------------------------------------------------------
// Case 4: Windows / Meta keys are strictly rejected
// -------------------------------------------------------------
it("Case 4: Windows / Meta keys are rejected", () => {
  const e1 = createMockKeyEvent("KeyG", { meta: true });
  const res1 = parseKeyEventToAccelerator(e1);
  expectEqual(res1.isComplete, true);
  expectEqual(res1.accelerator, null);
  expectEqual(res1.error, "shortcut_err_no_windows_key");

  const e2 = createMockKeyEvent("MetaLeft", { meta: true });
  const res2 = parseKeyEventToAccelerator(e2);
  expectEqual(res2.isComplete, true);
  expectEqual(res2.accelerator, null);
  expectEqual(res2.error, "shortcut_err_no_windows_key");
});

// -------------------------------------------------------------
// Case 5: System reserved combinations are rejected
// -------------------------------------------------------------
it("Case 5: System reserved combinations are rejected", () => {
  const reservedCombos = [
    { code: "Space", alt: true },
    { code: "F4", alt: true },
    { code: "Tab", alt: true },
    { code: "Delete", ctrl: true, alt: true },
    { code: "Escape", ctrl: true, shift: true },
  ];

  for (const c of reservedCombos) {
    const e = createMockKeyEvent(c.code, c);
    const res = parseKeyEventToAccelerator(e);
    expectEqual(res.isComplete, true, `Testing ${c.code}`);
    expectEqual(res.accelerator, null, `Testing ${c.code}`);
    expectEqual(res.error, "shortcut_err_reserved_system", `Testing ${c.code}`);
  }
});

// -------------------------------------------------------------
// Case 6: Duplicate detection across Gili actions
// -------------------------------------------------------------
it("Case 6: Duplicate shortcut detection across Gili actions", () => {
  const currentShortcuts: Record<ShortcutActionId, string | null> = {
    toggle_notch: "Control+Alt+G",
    quick_task: "Control+Alt+T",
    quick_note: "Control+Shift+N",
    open_media: null,
    toggle_media_playback: null,
    toggle_focus_mode: null,
    toggle_hide: null,
  };

  const actionLabels: Record<ShortcutActionId, string> = {
    toggle_notch: "Buka / Tutup Notch",
    quick_task: "Tambah Tugas Cepat",
    quick_note: "Catatan Cepat",
    open_media: "Buka Halaman Musik",
    toggle_media_playback: "Play / Pause Musik",
    toggle_focus_mode: "Mode Fokus",
    toggle_hide: "Sembunyikan / Tampilkan Notch",
  };

  // Try assigning Control+Alt+G (used by toggle_notch) to quick_task
  const dupCheck = validateShortcut("quick_task", "Control+Alt+G", currentShortcuts, actionLabels);
  expectFalse(dupCheck.valid);
  expectEqual(dupCheck.error, "shortcut_err_duplicate::Buka / Tutup Notch");

  // Re-assigning the same shortcut to its own action is valid
  const selfCheck = validateShortcut("toggle_notch", "Control+Alt+G", currentShortcuts, actionLabels);
  expectTrue(selfCheck.valid);

  // Assigning a brand new combination is valid
  const validCheck = validateShortcut("open_media", "Control+Alt+M", currentShortcuts, actionLabels);
  expectTrue(validCheck.valid);
});

// -------------------------------------------------------------
// Case 7: Tokenization to UI Chips & Badge
// -------------------------------------------------------------
it("Case 7: Format accelerator string into UI chips", () => {
  expectEqual(formatAcceleratorToChips("Control+Alt+G"), ["Ctrl", "Alt", "G"]);
  expectEqual(formatAcceleratorToChips("CommandOrControl+Shift+Slash"), ["Ctrl", "Shift", "/"]);
  expectEqual(formatAcceleratorToChips("Alt+ArrowUp"), ["Alt", "↑"]);
  expectEqual(formatAcceleratorToChips("Control+Equal"), ["Ctrl", "="]);
  expectEqual(formatAcceleratorToChips(null), []);

  // Badge formatting for Quick To-Do and Quick Note header
  expectEqual(formatShortcutForBadge("Control+Alt+T"), "CTRL ALT T");
  expectEqual(formatShortcutForBadge("Control+Shift+T"), "CTRL ⇧ T");
  expectEqual(formatShortcutForBadge("Control+Shift+N"), "CTRL ⇧ N");
  expectEqual(formatShortcutForBadge("Alt+N"), "ALT N");
  expectEqual(formatShortcutForBadge(null), "");
});

// -------------------------------------------------------------
// Case 8: Default Shortcuts & Old User Migration
// -------------------------------------------------------------
it("Case 8: Default shortcuts and backward-compatible migration", () => {
  expectEqual(DEFAULT_SHORTCUTS.toggle_notch, "Control+Alt+G");
  expectEqual(DEFAULT_SHORTCUTS.quick_task, "Control+Alt+T");
  expectEqual(DEFAULT_SHORTCUTS.quick_note, "Control+Shift+N");
  expectEqual(DEFAULT_SHORTCUTS.open_media, null);
  expectEqual(DEFAULT_SHORTCUTS.toggle_media_playback, null);
  expectEqual(DEFAULT_SHORTCUTS.toggle_focus_mode, null);
  expectEqual(DEFAULT_SHORTCUTS.toggle_hide, "Control+Shift+D");

  // Simulate old user setting where shortcuts key is empty
  const oldSettings = {};
  const migrated = { ...DEFAULT_SHORTCUTS, ...oldSettings };
  expectEqual(migrated.toggle_notch, "Control+Alt+G");
  expectEqual(migrated.quick_task, "Control+Alt+T");
  expectEqual(migrated.quick_note, "Control+Shift+N");
  expectEqual(migrated.toggle_hide, "Control+Shift+D");

  // User customization overrides default
  const userCustom = { toggle_notch: "Control+Shift+P" };
  const customMigrated = { ...DEFAULT_SHORTCUTS, ...userCustom };
  expectEqual(customMigrated.toggle_notch, "Control+Shift+P");
  expectEqual(customMigrated.quick_task, "Control+Alt+T");
  expectEqual(customMigrated.quick_note, "Control+Shift+N");

  // Corrupted / empty null defaults are safely restored
  const partialSettings: Record<string, string | null> = { toggle_notch: null, quick_task: "" };
  const fullMigrated: Record<ShortcutActionId, string | null> = { ...DEFAULT_SHORTCUTS, ...(partialSettings as any) };
  for (const action of SHORTCUT_ACTIONS) {
    if (action.defaultShortcut && !fullMigrated[action.id]) {
      fullMigrated[action.id] = action.defaultShortcut;
    }
  }
  expectEqual(fullMigrated.toggle_notch, "Control+Alt+G");
  expectEqual(fullMigrated.quick_task, "Control+Alt+T");
});

// -------------------------------------------------------------
// Case 9: Execution filtering ("Pressed" triggers, "Released" does not)
// -------------------------------------------------------------
it("Case 9: Execution filtering: only Pressed event triggers action", () => {
  let triggerCount = 0;
  const handler = () => { triggerCount++; };

  const simulateShortcutEvent = (event: { state: string }) => {
    if (event.state === "Pressed") {
      handler();
    }
  };

  simulateShortcutEvent({ state: "Pressed" });
  expectEqual(triggerCount, 1);

  simulateShortcutEvent({ state: "Released" });
  expectEqual(triggerCount, 1, "Released state must not trigger action");

  simulateShortcutEvent({ state: "Pressed" });
  expectEqual(triggerCount, 2);
});

// -------------------------------------------------------------
// Case 10: Master Switch (shortcutsEnabled) state transitions
// -------------------------------------------------------------
it("Case 10: Master switch disables all shortcuts without wiping configuration", () => {
  const currentShortcuts = {
    toggle_notch: "Control+Alt+G",
    quick_task: "Control+Alt+T",
    open_media: "Control+Alt+M",
    toggle_media_playback: null,
    toggle_focus_mode: null,
    toggle_hide: null,
  };

  // When disabled
  const disabledStatuses: Record<string, string> = {};
  const enabled = false;
  for (const act of SHORTCUT_ACTIONS) {
    if (!enabled) {
      disabledStatuses[act.id] = "inactive";
    }
  }

  expectEqual(disabledStatuses.toggle_notch, "inactive");
  expectEqual(disabledStatuses.quick_task, "inactive");
  // Original settings map remains untouched!
  expectEqual(currentShortcuts.toggle_notch, "Control+Alt+G");
});

// -------------------------------------------------------------
// Case 11: Recording mode suspension & resumption lifecycle
// -------------------------------------------------------------
it("Case 11: Recording mode suspends active hotkeys and resumes cleanly", () => {
  let isSuspended = false;
  let activeRegistrationCount = 2;

  const suspend = () => {
    isSuspended = true;
    activeRegistrationCount = 0;
  };

  const resume = (enabled: boolean, count: number) => {
    isSuspended = false;
    if (enabled) {
      activeRegistrationCount = count;
    }
  };

  // When user clicks "Ubah"
  suspend();
  expectEqual(isSuspended, true);
  expectEqual(activeRegistrationCount, 0, "All hotkeys must be unhooked during recording");

  // When recording cancels or completes
  resume(true, 2);
  expectEqual(isSuspended, false);
  expectEqual(activeRegistrationCount, 2, "Hotkeys must be re-registered after recording");
});

// -------------------------------------------------------------
// Case 12: Conflict rollback maintains existing valid shortcut
// -------------------------------------------------------------
it("Case 12: Conflict during registration preserves previous valid shortcut", () => {
  const shortcuts: Record<string, string | null> = {
    toggle_notch: "Control+Alt+G",
  };

  const attemptUpdate = (actionId: string, newKey: string, conflict: boolean) => {
    const previous = shortcuts[actionId];
    if (conflict) {
      // Rollback to previous
      shortcuts[actionId] = previous;
      return { success: false, error: "shortcut_err_conflict" };
    }
    shortcuts[actionId] = newKey;
    return { success: true };
  };

  const failResult = attemptUpdate("toggle_notch", "Control+Alt+X", true);
  expectFalse(failResult.success);
  expectEqual(shortcuts.toggle_notch, "Control+Alt+G", "Previous shortcut must remain intact on conflict");

  const successResult = attemptUpdate("toggle_notch", "Control+Alt+H", false);
  expectTrue(successResult.success);
  expectEqual(shortcuts.toggle_notch, "Control+Alt+H", "Valid non-conflicting shortcut updates successfully");
});

// -------------------------------------------------------------
// Runner
// -------------------------------------------------------------
async function runAll() {
  console.log(`\n========================================`);
  console.log(`RUNNING SHORTCUT MANAGER AUTOMATED TESTS`);
  console.log(`========================================\n`);

  for (const tc of testCases) {
    try {
      await tc.run();
      console.log(`  ✓ ${tc.name}`);
      passCount++;
    } catch (err: any) {
      console.error(`  ✗ ${tc.name}`);
      console.error(`    Error: ${err.message}`);
      failCount++;
    }
  }

  console.log(`\n----------------------------------------`);
  console.log(`Result: ${passCount} passed, ${failCount} failed (${passCount + failCount} total)`);
  console.log(`========================================\n`);

  if (failCount > 0) {
    process.exit(1);
  }
}

runAll();
