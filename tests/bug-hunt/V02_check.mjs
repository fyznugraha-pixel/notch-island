import assert from "node:assert/strict";

console.log("=== VERIFY-02: Pengujian Mandiri Logika & Formula Rust/TS ===");

// 1. T03-02: Evaluasi state machine evaluate_hotkey_event (taskbar_hotkey.rs:147-314)
const BIT_LWIN = 1;
const BIT_RWIN = 2;
const WM_KEYDOWN = 0x0100;
const WM_KEYUP = 0x0101;
const VK_LWIN = 0x5B;
const VK_L_CODE = 0x4C;

function evaluateHotkeyEvent(state, vk, msg, mods, flags) {
  const isDown = msg === WM_KEYDOWN;
  const isUp = msg === WM_KEYUP;
  const isWinKey = vk === VK_LWIN;
  if (isWinKey) {
    const winBit = BIT_LWIN;
    if (isDown) {
      const wasDown = state.winKeyMask !== 0;
      state.winKeyMask |= winBit;
      if (!wasDown) {
        state.winKeyInterrupted = false;
        if (flags.useGiliStart) {
          return "WinKeyDownInjectNeutralDelayed";
        }
      }
    } else if (isUp) {
      const wasDown = state.winKeyMask !== 0;
      state.winKeyMask &= ~winBit;
      if (state.winKeyMask === 0) {
        const interrupted = state.winKeyInterrupted;
        state.winKeyInterrupted = false;
        if (wasDown && !interrupted && flags.useGiliStart) {
          return "WinSoloStart";
        }
      }
    }
  } else if (state.winKeyMask !== 0) {
    if (!mods.winPhysicallyDown) {
      state.winKeyMask = 0;
      state.winKeyInterrupted = false;
      return "PassThrough";
    }
    if (isDown) {
      state.winKeyInterrupted = true;
    }
  }
  return "PassThrough";
}

// Skenario T03-02(a): Win+L mengunci layar sebelum WM_KEYUP LWin diterima hook
{
  const state = { winKeyMask: 0, winKeyInterrupted: false };
  const flags = { useGiliStart: true };
  // 1. User tekan LWin
  assert.equal(evaluateHotkeyEvent(state, VK_LWIN, WM_KEYDOWN, {}, flags), "WinKeyDownInjectNeutralDelayed");
  // 2. User tekan L -> winKeyInterrupted = true, lalu OS kunci layar (WM_KEYUP LWin hilang di desktop Winlogon)
  assert.equal(evaluateHotkeyEvent(state, VK_L_CODE, WM_KEYDOWN, { winPhysicallyDown: true }, flags), "PassThrough");
  assert.equal(state.winKeyMask, BIT_LWIN);
  assert.equal(state.winKeyInterrupted, true);
  // 3. Kembali ke desktop, user tekan solo LWin (WM_KEYDOWN lalu WM_KEYUP):
  // Karena wasDown == true (winKeyMask sudah 1!), WM_KEYDOWN LWin TIDAK mereset winKeyInterrupted ke false!
  const actDown = evaluateHotkeyEvent(state, VK_LWIN, WM_KEYDOWN, {}, flags);
  const actUp = evaluateHotkeyEvent(state, VK_LWIN, WM_KEYUP, {}, flags);
  console.log(`[T03-02a] Setelah Win+L, tap LWin pertama menghasilkan: down=${actDown}, up=${actUp}`);
  assert.equal(actDown, "PassThrough", "Tap LWin pertama gagal injeksi neutral key");
  assert.equal(actUp, "PassThrough", "Tap LWin pertama gagal membuka WinSoloStart karena winKeyInterrupted basi");
}

// Skenario T03-02(b): Tahan Ctrl/Shift/Alt lalu tekan-lepas LWin
// Di taskbar_hotkey.rs:280-282, saat is_win_key == true, mods = ModifierState::default() (semua false)
{
  const state = { winKeyMask: 0, winKeyInterrupted: false };
  const flags = { useGiliStart: true };
  // Ctrl sedang ditahan secara fisik, tapi karena is_win_key == true, low_level_keyboard_proc mengirim ModifierState::default()
  const actDown = evaluateHotkeyEvent(state, VK_LWIN, WM_KEYDOWN, { ctrl: false, alt: false, shift: false }, flags);
  const actUp = evaluateHotkeyEvent(state, VK_LWIN, WM_KEYUP, { ctrl: false, alt: false, shift: false }, flags);
  console.log(`[T03-02b] Tahan Ctrl + tap LWin menghasilkan: down=${actDown}, up=${actUp}`);
  assert.equal(actUp, "WinSoloStart", "WinSoloStart tetap terpicu walau modifier ditahan");
}

// 2. T03-11: Pencocokan substring >= 3 huruf pada tray_apps.rs:444-453 & bypass can_close_tray_app
{
  const uiaTooltip = "Keamanan Windows - Tidak diperlukan tindakan";
  const unameLow = uiaTooltip.toLowerCase();
  const activeProcs = [
    [4120, "git.exe", "C:\\Program Files\\Git\\bin\\git.exe"],
    [5210, "man.exe", "C:\\usr\\bin\\man.exe"],
    [6100, "win.exe", "C:\\tools\\win.exe"],
  ];
  const matched = activeProcs.find(([, fname]) => {
    const stem = fname.replace(/\.exe$/i, "").toLowerCase();
    return stem.length >= 3 && unameLow.includes(stem);
  });
  console.log(`[T03-11a] Tooltip '${uiaTooltip}' salah mencocokkan proses:`, matched);
  assert.ok(matched, "Tooltip dengan kata 'tidak'/'windows' mencocokkan stem 3 huruf seperti man/win");
}

// 3. T03-13: Filter karakter activate_aumid pada windows_pinned_apps.rs:1429-1437
{
  function activateAumidAllowed(aumid) {
    const trimmed = aumid.trim();
    if (!trimmed) return false;
    return [...trimmed].every((c) => /[a-zA-Z0-9._\-! ]/.test(c));
  }
  const win32AppsFolderIds = [
    "{1AC14E77-02E7-4E5D-B744-2EB1AE5198B7}\\notepad.exe",
    "{6D809377-6AF0-444B-8957-A3773F02200E}\\VideoLAN\\VLC\\vlc.exe",
    "Microsoft.WindowsCalculator_8wekyb3d8bbwe!App",
  ];
  for (const id of win32AppsFolderIds) {
    console.log(`[T03-13] activate_aumid('${id}') -> ${activateAumidAllowed(id)}`);
  }
  assert.equal(activateAumidAllowed(win32AppsFolderIds[0]), false);
  assert.equal(activateAumidAllowed(win32AppsFolderIds[1]), false);
  assert.equal(activateAumidAllowed(win32AppsFolderIds[2]), true);
}

// 4. T04-01: Perhitungan posisi fisik window_preview.rs:1025-1028 saat hover di monitor sekunder
{
  // Navbar utama di Monitor 1 (0, 0) scale 1.0, Navbar sekunder di Monitor 2 (-1920, 0) scale 1.5
  const navPrimaryOrigin = { x: 0, y: 668 };
  const navPrimaryScale = 1.0;
  const navSecOrigin = { x: -1920, y: 384 };
  const navSecScale = 1.5;
  const slotInputFromMon2 = { x: 420, y: 210, width: 200, height: 132 };

  const actualBuggyPhys = {
    x: navPrimaryOrigin.x + Math.round(slotInputFromMon2.x * navPrimaryScale),
    y: navPrimaryOrigin.y + Math.round(slotInputFromMon2.y * navPrimaryScale),
    w: Math.round(slotInputFromMon2.width * navPrimaryScale),
    h: Math.round(slotInputFromMon2.height * navPrimaryScale),
  };
  const expectedMon2Phys = {
    x: navSecOrigin.x + Math.round(slotInputFromMon2.x * navSecScale),
    y: navSecOrigin.y + Math.round(slotInputFromMon2.y * navSecScale),
    w: Math.round(slotInputFromMon2.width * navSecScale),
    h: Math.round(slotInputFromMon2.height * navSecScale),
  };
  console.log(`[T04-01] Preview di Mon2: actual(buggy)=`, actualBuggyPhys, `expected=`, expectedMon2Phys);
  assert.notEqual(actualBuggyPhys.x, expectedMon2Phys.x);
  assert.notEqual(actualBuggyPhys.w, expectedMon2Phys.w);
}

console.log("=== SEMUA UJI VERIFY-02 LULUS ===");
