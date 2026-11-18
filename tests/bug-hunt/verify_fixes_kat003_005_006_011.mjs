import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { createViteSsrLoader, installBrowserShim } from "../../scripts/tests/harness.mjs";

const ROOT = "d:/kerjaan/projek-ndiri/island";

async function runTests() {
  installBrowserShim();
  const loader = await createViteSsrLoader();

  try {
    const [todoUtils, waterService, noteUtils, prayerService] = await Promise.all([
      loader.loadModule("/src/services/todoUtils.ts"),
      loader.loadModule("/src/services/waterService.ts"),
      loader.loadModule("/src/services/noteUtils.ts"),
      loader.loadModule("/src/services/prayerService.ts"),
    ]);

    // 1. To-Do canonical migration & sync (KAT-006)
    localStorage.clear();
    localStorage.setItem(
      "gili_todos",
      JSON.stringify([
        { id: "td_1", text: "Tubes SIA BAB 1", completed: false },
        { id: "td_2", text: "Kirim laporan mingguan", completed: false },
        { id: "td_user_1", text: "Selesaikan audit bug", completed: true },
      ])
    );
    let todoEvents = 0;
    const onTodoEvt = () => todoEvents++;
    window.addEventListener("gili_todos_updated", onTodoEvt);
    try {
      const migratedTodos = todoUtils.loadCanonicalTodos();
      assert.equal(localStorage.getItem("gili_todos"), null, "legacy gili_todos removed");
      assert.equal(migratedTodos.length, 1, "dummy todos stripped, user todo migrated");
      assert.equal(migratedTodos[0].text, "Selesaikan audit bug");
      assert.equal(migratedTodos[0].completed, true);

      const added = todoUtils.addCanonicalTodo("Tes sinkron");
      assert.equal(added.length, 2);
      assert.equal(JSON.parse(localStorage.getItem(todoUtils.TODO_STORAGE_KEY)).length, 2);

      const toggled = todoUtils.toggleCanonicalTodo(added[0].id);
      assert.equal(toggled[0].completed, true);

      const deleted = todoUtils.deleteCanonicalTodo(added[0].id);
      assert.equal(deleted.length, 1);
      assert.equal(todoEvents, 3, "gili_todos_updated emitted on add/toggle/delete");
    } finally {
      window.removeEventListener("gili_todos_updated", onTodoEvt);
    }

    // 2. Water canonical migration, target & resetTodayWaterIntake (KAT-006)
    localStorage.clear();
    const todayKey = prayerService.getTodayDateKey();
    const yesterdayMs = Date.now() - 2 * 86400_000;
    localStorage.setItem(
      "gili_water_log_v2",
      JSON.stringify({ date: todayKey, amount: 750 })
    );
    const loadedWater = waterService.loadWaterData();
    assert.equal(localStorage.getItem("gili_water_log_v2"), null, "legacy water key removed");
    assert.equal(waterService.getDailyIntake(new Date(), loadedWater).totalMl, 750);
    assert.equal(loadedWater.settings.dailyTargetMl, 3000, "uses canonical 3000ml default target");

    // Add a historical drink record 2 days ago and another drink today
    waterService.logDrink(500, true, yesterdayMs);
    waterService.logDrink(250, true);
    assert.equal(waterService.getDailyIntake().totalMl, 1000);

    // Reset today only; yesterday's record must stay intact
    const afterReset = waterService.resetTodayWaterIntake();
    assert.equal(waterService.getDailyIntake(new Date(), afterReset).totalMl, 0);
    assert.equal(afterReset.records.length, 1, "historical day record preserved");

    // 3. Quick Note canonical migration & helper (KAT-006)
    localStorage.clear();
    localStorage.setItem(
      "gili_quick_notes",
      JSON.stringify([
        { id: "qn_1", title: "Ide Baru", content: "Isi catatan cepat", updatedAt: 1700000000000 },
      ])
    );
    let noteEvents = 0;
    const onNoteEvt = () => noteEvents++;
    window.addEventListener("gili_notes_updated", onNoteEvt);
    try {
      const migratedNotes = noteUtils.loadMiniNotes();
      assert.equal(localStorage.getItem("gili_quick_notes"), null, "legacy quick notes removed");
      assert.equal(migratedNotes.length, 1);
      assert.equal(migratedNotes[0].id, "qn_1");
      assert.equal(noteUtils.getMiniNoteDisplayText(migratedNotes[0]), "Isi catatan cepat");

      const created = noteUtils.createQuickNoteItem("Catatan Taskbar", "blue", false);
      assert.equal(noteUtils.loadMiniNotes().length, 2);
      noteUtils.deleteQuickNoteItem(created.id);
      assert.equal(noteUtils.loadMiniNotes().length, 1);
      assert.equal(noteEvents, 2);
    } finally {
      window.removeEventListener("gili_notes_updated", onNoteEvt);
    }

    // 4. Prayer service emits gili_prayer_updated & Navbar modules share canonical services
    localStorage.clear();
    let prayerEvents = 0;
    const onPrayerEvt = () => prayerEvents++;
    window.addEventListener("gili_prayer_updated", onPrayerEvt);
    try {
      prayerService.savePrayerSettings(prayerService.DEFAULT_PRAYER_SETTINGS);
      prayerService.togglePrayerCompleted("Fajr");
      assert.equal(prayerEvents, 2);
    } finally {
      window.removeEventListener("gili_prayer_updated", onPrayerEvt);
    }

    // 5. Verify Navbar module files no longer use isolated v2 write/state paths
    const modChecks = [
      ["src/modules/components/PomodoroNavbarModule.tsx", "usePomodoro", "gili_pomodoro_live_state_v2"],
      ["src/modules/components/WaterNavbarModule.tsx", "resetTodayWaterIntake", "gili_water_log_v2"],
      ["src/modules/components/PrayerNavbarModule.tsx", "getImmediatePrayerSchedule", "ambientEnvironmentService"],
      ["src/modules/components/TodoNavbarModule.tsx", "loadCanonicalTodos", "Tubes SIA BAB 1"],
      ["src/modules/components/QuickNoteNavbarModule.tsx", "createQuickNoteItem", "gili_quick_notes"],
    ];
    for (const [rel, requiredSym, forbiddenSym] of modChecks) {
      const txt = fs.readFileSync(path.join(ROOT, rel), "utf8");
      assert.ok(txt.includes(requiredSym), `${rel} must use ${requiredSym}`);
      assert.ok(!txt.includes(forbiddenSym), `${rel} must not contain ${forbiddenSym}`);
    }

    // 6. Verify Rust fixes for KAT-003, KAT-005, KAT-011
    const tm = fs.readFileSync(path.join(ROOT, "src-tauri/src/taskbar_manager.rs"), "utf8");
    assert.ok(tm.includes("AtomicU32::new(u32::MAX)"), "ORIGINAL_TASKBAR_STATE uses u32::MAX sentinel");
    assert.ok(tm.includes("HWND_TOPMOST"), "uncloak_and_show_tray_hwnd restores HWND_TOPMOST");
    assert.ok(tm.includes("restore_taskbars_from_watchdog"), "watchdog restore helper present");

    const ts = fs.readFileSync(path.join(ROOT, "src-tauri/src/taskbar_safety.rs"), "utf8");
    assert.ok(ts.includes("CREATE_BREAKAWAY_FROM_JOB"), "watchdog spawns with breakaway flag fallback");
    assert.ok(ts.includes("restore_windows_dnd_on_exit"), "watchdog restores DND on termination");
    assert.ok(ts.includes("restore_banners_on_exit"), "watchdog restores toast banners on termination");
    assert.ok(ts.includes("is_navbar_window_ready"), "hiding taskbar gated on navbar readiness");

    const nw = fs.readFileSync(path.join(ROOT, "src-tauri/src/navbar_window.rs"), "utf8");
    assert.ok(nw.includes("NAVBAR_WINDOW_READY"), "navbar tracks window readiness");
    assert.ok(nw.includes("crate::taskbar_manager::set_taskbar_visible(true)"), "navbar failure rolls back taskbar visibility");

    const dnd = fs.readFileSync(path.join(ROOT, "src-tauri/src/windows_dnd.rs"), "utf8");
    assert.ok(dnd.includes("DndBackup"), "windows_dnd stores backup before modifying state");
    assert.ok(dnd.includes("restore_windows_dnd_from_backup"), "windows_dnd restores original values");

    const banners = fs.readFileSync(path.join(ROOT, "src-tauri/src/toast_banners.rs"), "utf8");
    assert.ok(banners.includes("if has_backup"), "toast_banners verifies backup before overwriting ShowBanner");
    assert.ok(banners.includes("if all_restored"), "toast_banners preserves backup if any app key fails restore");

    const lib = fs.readFileSync(path.join(ROOT, "src-tauri/src/lib.rs"), "utf8");
    assert.ok(lib.includes("windows_dnd::check_and_recover_dnd_on_startup"), "startup DND recovery wired");
    assert.ok(lib.includes("toast_banners::check_and_recover_banners_on_startup"), "startup banner recovery wired");

    console.log("ALL_VERIFICATION_CHECKS_PASSED");
  } finally {
    await loader.close();
  }
}

runTests().catch((err) => {
  console.error(err);
  process.exit(1);
});
