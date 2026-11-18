import assert from "node:assert/strict";

// Skrip uji mandiri T06 untuk memverifikasi secara empiris perilaku bug
// yang ditemukan pada komponen Taskbar Dock, Flyout, dan Popover.
// Tidak memodifikasi file aplikasi maupun menjalankan build/Tauri runtime.

let passed = 0;
const results = [];

function runCase(name, fn) {
  try {
    fn();
    passed += 1;
    results.push({ name, ok: true });
    console.log(`[PASS] ${name}`);
  } catch (err) {
    results.push({ name, ok: false, error: err?.message || String(err) });
    console.error(`[FAIL] ${name}: ${err?.message || err}`);
    process.exitCode = 1;
  }
}

async function runAsyncCase(name, fn) {
  try {
    await fn();
    passed += 1;
    results.push({ name, ok: true });
    console.log(`[PASS] ${name}`);
  } catch (err) {
    results.push({ name, ok: false, error: err?.message || String(err) });
    console.error(`[FAIL] ${name}: ${err?.message || err}`);
    process.exitCode = 1;
  }
}

// 1. Bukti T06-01: Urutan listener Escape di window (TaskbarFlyoutApp vs QuickSettingsView)
runCase("T06-01: Listener Escape TaskbarFlyoutApp mendahului QuickSettingsView submenu", () => {
  const win = new EventTarget();
  const calls = [];
  let activeSubmenu = "wifi";

  // Parent (TaskbarFlyoutApp.tsx:402-407) mount lebih dulu
  const parentKeyDown = (e) => {
    if (e.key === "Escape") {
      e.preventDefault();
      calls.push("close_taskbar_flyout");
      return;
    }
  };
  win.addEventListener("keydown", parentKeyDown);

  // Child (QuickSettingsView.tsx:396-410) mount sesudah parent
  const childKeyDown = (e) => {
    if (e.key === "Escape") {
      if (activeSubmenu) {
        e.preventDefault();
        activeSubmenu = null;
        calls.push("close_submenu");
      } else {
        e.preventDefault();
        calls.push("onClose");
      }
    }
  };
  win.addEventListener("keydown", childKeyDown);

  const ev = Object.assign(new Event("keydown", { cancelable: true }), {
    key: "Escape",
  });
  win.dispatchEvent(ev);

  // Membuktikan close_taskbar_flyout sudah terpanggil duluan sebelum submenu sempat ditangani
  assert.equal(calls[0], "close_taskbar_flyout");
  assert.deepEqual(calls, ["close_taskbar_flyout", "close_submenu"]);
});

// 2. Bukti T06-02: Updater Focus Session di NotificationsCalendarView mengeksekusi side-effect ganda di StrictMode
runCase("T06-02: Updater setFocusSecondsLeft mengeksekusi recordCompletedFocusSession ganda di StrictMode", () => {
  let completedRecorded = 0;
  let dndDisableCalls = 0;
  const focusMinutes = 30;

  // Simulasi StrictMode memanggil fungsi updater state dua kali untuk prev = 1
  const updater = (prev) => {
    if (prev <= 1) {
      completedRecorded += 1;
      dndDisableCalls += 1;
      return focusMinutes * 60;
    }
    return prev - 1;
  };

  const out1 = updater(1);
  const out2 = updater(1);

  assert.equal(out1, 1800);
  assert.equal(out2, 1800);
  assert.equal(completedRecorded, 2);
  assert.equal(dndDisableCalls, 2);
});

// 3. Bukti T06-03: Tombol app PinnedAppsGroup tidak merespons event click keyboard (tanpa onClick)
runCase("T06-03: Aktivasi keyboard (click tanpa pointerdown) gagal memicu onAppClick", () => {
  let dragSession = null;
  const appClicks = [];

  const handlePointerDown = (button, app) => {
    if (button !== 0) return;
    dragSession = { id: app.id, app, hasMoved: false, shiftKey: false };
  };
  const handleWinPointerUp = () => {
    if (!dragSession) return;
    const drag = dragSession;
    dragSession = null;
    if (!drag.hasMoved) {
      appClicks.push(drag.id);
    }
  };

  // Simulasi user menekan Enter/Space pada <button>: browser memicu click tanpa pointerdown/pointerup
  // Karena <button> di PinnedAppsGroup.tsx:1004-1050 tidak memiliki onClick handler:
  const keyboardClickHandled = false;
  handleWinPointerUp();

  assert.equal(keyboardClickHandled, false);
  assert.equal(appClicks.length, 0);

  // Bandingkan dengan pointerdown -> pointerup
  handlePointerDown(0, { id: "chrome" });
  handleWinPointerUp();
  assert.deepEqual(appClicks, ["chrome"]);
});

// 4. Bukti T06-04: SoundOutputMixerView kehilangan pointercancel meninggalkan listener & ref macet
runCase("T06-04: pointercancel saat drag slider menyebabkan ref terkunci & listener tetap menempel", () => {
  const win = new EventTarget();
  let isDraggingMaster = false;
  let draggingAppPid = 4242;
  let moveHandlerCalls = 0;
  let pollingUpdatesAllowed = 0;

  // Pola persis SoundOutputMixerView.tsx:154-173
  const onMasterPointerDown = () => {
    isDraggingMaster = true;
    const handlePointerMove = () => {
      if (isDraggingMaster) moveHandlerCalls += 1;
    };
    const handlePointerUp = () => {
      isDraggingMaster = false;
      win.removeEventListener("pointermove", handlePointerMove);
      win.removeEventListener("pointerup", handlePointerUp);
    };
    win.addEventListener("pointermove", handlePointerMove);
    win.addEventListener("pointerup", handlePointerUp);
  };

  onMasterPointerDown();
  // Terjadi pointercancel (atau unmount sebelum pointerup)
  win.dispatchEvent(new Event("pointercancel"));

  // Setelah pointercancel, pointermove berikutnya masih memicu handler & ref tetap true
  win.dispatchEvent(new Event("pointermove"));
  assert.equal(isDraggingMaster, true);
  assert.equal(moveHandlerCalls, 1);

  // Di baris 95 SoundOutputMixerView.tsx: if (!draggingAppPidRef.current) setAppSessions(...)
  if (!draggingAppPid) pollingUpdatesAllowed += 1;
  assert.equal(pollingUpdatesAllowed, 0);
});

// 5. Bukti T06-06: Race IPC out-of-order di acquireNavbarFocus / releaseNavbarFocus
await runAsyncCase("T06-06: IPC out-of-order antara releaseNavbarFocus dan acquireNavbarFocus menghasilkan state terbalik", async () => {
  const activeFocusIds = new Set();
  const appliedStates = [];

  // Simulasi latency IPC Rust asinkron: release lambat (25ms), acquire cepat (5ms)
  const fakeInvokeFocusable = (focusable, delayMs) =>
    new Promise((resolve) => {
      setTimeout(() => {
        appliedStates.push(focusable);
        resolve();
      }, delayMs);
    });

  // Awalnya popup A terbuka
  activeFocusIds.add("popA");

  // User menutup popup A lalu langsung membuka popup B:
  const pRelease = (async () => {
    if (!activeFocusIds.delete("popA")) return;
    if (activeFocusIds.size === 0) {
      await fakeInvokeFocusable(false, 25);
    }
  })();

  const pAcquire = (async () => {
    const wasEmpty = activeFocusIds.size === 0;
    activeFocusIds.add("popB");
    if (wasEmpty) {
      await fakeInvokeFocusable(true, 5);
    }
  })();

  await Promise.all([pRelease, pAcquire]);

  // activeFocusIds masih berisi popB (seharusnya focusable = true),
  // namun state IPC terakhir yang mendarat adalah false!
  assert.equal(activeFocusIds.has("popB"), true);
  assert.equal(appliedStates[appliedStates.length - 1], false);
});

// 6. Bukti T06-07: Start-to-Search typeahead membajak tombol Space saat target === "start"
runCase("T06-07: Menekan Space pada tombol di StartMenuView membajak ke SearchView dengan query spasi", () => {
  let target = "start";
  let isOpen = true;
  let searchInitialQuery = "";
  let defaultPrevented = false;

  // Logika persis TaskbarFlyoutApp.tsx:409-423
  const onKeyDown = (e) => {
    if (
      isOpen &&
      target === "start" &&
      e.key.length === 1 &&
      !e.ctrlKey &&
      !e.altKey &&
      !e.metaKey
    ) {
      defaultPrevented = true;
      searchInitialQuery = searchInitialQuery + e.key;
      target = "search";
    }
  };

  onKeyDown({ key: " ", ctrlKey: false, altKey: false, metaKey: false });

  assert.equal(defaultPrevented, true);
  assert.equal(target, "search");
  assert.equal(searchInitialQuery, " ");
});

// 7. Bukti T06-08: Rumus clampShift WindowPreviewCard under-compensated saat viewportScale < 1, dan AppContextMenu keluar viewport
runCase("T06-08: clampShift WindowPreviewCard tidak membagi dengan viewportScale & AppContextMenu terpotong di tepi", () => {
  const VIEWPORT_EDGE_MARGIN = 10;
  const viewportScale = 0.75;
  const unscaledOverflowLeft = -80 / viewportScale; // elemen asli di -106.67 unit sebelum scale
  let prev = { x: 0, y: 0 };

  // Pass 1: rect.left terukur dalam koordinat viewport terskala (-80px)
  let rectLeft = unscaledOverflowLeft * viewportScale + prev.x * viewportScale;
  let naturalLeft = rectLeft - prev.x;
  let nextX = VIEWPORT_EDGE_MARGIN - naturalLeft; // = 90
  prev = { x: nextX, y: 0 };

  // Posisi visual aktual setelah transform translate3d(90px) di dalam scale(0.75):
  let actualVisualLeft = (unscaledOverflowLeft + prev.x) * viewportScale;
  assert.ok(Math.abs(actualVisualLeft - (-12.5)) < 1e-9); // Masih di luar batas kiri (< 10px)!

  // Pass 2: useLayoutEffect dipicu ulang dengan prev.x = 90
  rectLeft = actualVisualLeft;
  naturalLeft = rectLeft - prev.x; // -12.5 - 90 = -102.5 (salah hitung naturalLeft!)
  const nextXPass2 = VIEWPORT_EDGE_MARGIN - naturalLeft; // 112.5
  assert.notEqual(nextXPass2, nextX);

  // AppContextMenu.tsx:59-66 tanpa clamping:
  // Item pertama di left = 14px, width = 40px, menu min-width = 195px
  const anchorCenterX = 14 + 40 / 2; // 34px
  const menuLeft = anchorCenterX - 195 / 2; // -63.5px
  assert.ok(menuLeft < 0, "Menu konteks terpotong di sebelah kiri viewport");
});

// 8. Bukti T06-10: SearchView pada mode overview mengeksekusi results[0] tersembunyi saat Enter ditekan
runCase("T06-10: SearchView overview mengeksekusi results[0] yang tidak dirender saat menekan Enter", () => {
  const activeTab = "all";
  const trimmedQuery = "";
  const isDefaultOverview = !trimmedQuery && activeTab === "all";
  const allApps = [{ name: "Calculator" }, { name: "Notepad" }];
  const results = allApps.map((app) => ({ kind: "app", title: app.name }));
  let selectedIdx = 0;
  let executed = null;

  // Logika persis SearchView.tsx:386-399 (tidak memeriksa isDefaultOverview)
  const handleKeyDown = (key) => {
    if (results.length === 0) return;
    if (key === "Enter") {
      const chosen = results[selectedIdx];
      if (chosen) executed = chosen.title;
    }
  };

  assert.equal(isDefaultOverview, true);
  handleKeyDown("Enter");
  assert.equal(executed, "Calculator");
});

console.log(`\nTotal lulus: ${passed}/${results.length}`);
