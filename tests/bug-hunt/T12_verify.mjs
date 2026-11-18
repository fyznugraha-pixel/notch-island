import assert from "node:assert/strict";

// ============================================================
// 1. Bukti shelf_server.rs:446-457 generate_token() lemah/prediktif
// ============================================================
function generateTokenRustExact(nowMillisBigInt) {
  const charset = "abcdefghjkmnpqrstuvwxyz23456789";
  // (now ^ (now >> 7)) as u32
  const xored = nowMillisBigInt ^ (nowMillisBigInt >> 7n);
  let randVal = Number(xored & 0xffffffffn) >>> 0;
  let token = "";
  for (let i = 0; i < 7; i++) {
    // wrapping_mul(1103515245).wrapping_add(12345) pada u32
    randVal = (Math.imul(randVal, 1103515245) + 12345) >>> 0;
    const idx = randVal % charset.length;
    token += charset[idx];
  }
  return token;
}

function testWeakTokenPrediction() {
  const realStartMs = 1763428032417n; // contoh waktu mulai sesi
  const realToken = generateTokenRustExact(realStartMs);

  // Penyerang memantau /d/x setiap ~1 detik; saat 404 berubah menjadi 403,
  // penyerang mengetahui waktu mulai dalam jendela 1000 ms.
  const windowStart = 1763428032000n;
  const candidates = new Set();
  for (let offset = 0n; offset < 1000n; offset++) {
    candidates.add(generateTokenRustExact(windowStart + offset));
  }

  assert.equal(candidates.has(realToken), true, "Token asli pasti ditemukan dalam <=1000 kandidat");
  assert.ok(candidates.size <= 1000, `Jumlah kandidat hanya ${candidates.size}`);
  return { realToken, candidateCount: candidates.size };
}

// ============================================================
// 2. Bukti shelfService.ts:290-305 kebangkitan item yang sudah dihapus
// ============================================================
function simulateLoadPersistedShelfFiles(storeData, localData) {
  if (localData !== null && localData.length === 0) {
    return [];
  }
  const newest = (arr) =>
    arr && arr.length > 0 ? Math.max(...arr.map((f) => f.addedAt || 0)) : -1;
  const storeNewest = newest(storeData);
  const localNewest = newest(localData);

  if (storeNewest >= 0 && storeNewest >= localNewest) {
    return storeData;
  } else if (localNewest >= 0) {
    return localData;
  }
  return [];
}

function testShelfResurrection() {
  const fileA = { id: "a", name: "a.txt", addedAt: 1000 };
  const fileB = { id: "b", name: "b.txt", addedAt: 2000 };
  const diskBeforeFlush = [fileA, fileB];

  // Kasus 1: Hapus item terbaru (fileB) sebelum debounce 300ms flush ke shelf.json
  const localAfterDeleteB = [fileA];
  const loadedCase1 = simulateLoadPersistedShelfFiles(diskBeforeFlush, localAfterDeleteB);
  assert.equal(loadedCase1.length, 2, "fileB bangkit kembali dari shelf.json");

  // Kasus 2: Hapus item lebih lama (fileA) sebelum debounce 300ms flush ke shelf.json
  const localAfterDeleteA = [fileB];
  const loadedCase2 = simulateLoadPersistedShelfFiles(diskBeforeFlush, localAfterDeleteA);
  assert.equal(loadedCase2.length, 2, "fileA bangkit kembali karena storeNewest === localNewest");
  return { case1Count: loadedCase1.length, case2Count: loadedCase2.length };
}

// ============================================================
// 3. Bukti shelf_server.rs:86-93 & 521-543 file:/// URI merusak tanda '+'
// ============================================================
function urlencodingDecodeRustExact(s) {
  const bytes = [];
  const encoder = new TextEncoder();
  const raw = encoder.encode(s);
  let i = 0;
  while (i < raw.length) {
    if (raw[i] === 0x25 && i + 2 < raw.length) {
      const hex = String.fromCharCode(raw[i + 1], raw[i + 2]);
      if (/^[0-9a-fA-F]{2}$/.test(hex)) {
        bytes.push(parseInt(hex, 16));
        i += 3;
        continue;
      }
    } else if (raw[i] === 0x2b) {
      bytes.push(0x20); // '+' diubah menjadi spasi!
      i += 1;
      continue;
    }
    bytes.push(raw[i]);
    i += 1;
  }
  return new TextDecoder().decode(new Uint8Array(bytes));
}

function resolveShelfFilePathRustExact(raw) {
  const trimmed = raw.trim().replace(/^"+|"+$/g, "");
  if (trimmed.startsWith("file:///")) {
    const rest = trimmed.slice("file:///".length);
    return urlencodingDecodeRustExact(rest).replaceAll("/", "\\");
  }
  return trimmed;
}

function testFileUriPlusCorruption() {
  const resolved = resolveShelfFilePathRustExact("file:///C:/Projects/C++/notes+1.txt");
  assert.equal(resolved, "C:\\Projects\\C  \\notes 1.txt");
  return resolved;
}

// ============================================================
// 4. Bukti ClipboardPanel.tsx:82-93 filter pencarian gambar false positive/negative
// ============================================================
function matchesClipboardSearch(item, searchQuery) {
  const q = searchQuery.trim().toLowerCase();
  if (!q) return true;
  if (item.type === "image") {
    return "image screenshot gambar foto".includes(q) || item.text.toLowerCase().includes(q);
  }
  return item.text.toLowerCase().includes(q);
}

function testClipboardImageSearchFilter() {
  const imgItem = { id: "1", type: "image", text: "" };
  const falsePositives = ["bar", "age", "shot", "to", "a", "o"].filter((q) =>
    matchesClipboardSearch(imgItem, q)
  );
  const falseNegatives = ["photo", "png", "jpg"].filter(
    (q) => !matchesClipboardSearch(imgItem, q)
  );
  assert.deepEqual(falsePositives, ["bar", "age", "shot", "to", "a", "o"]);
  assert.deepEqual(falseNegatives, ["photo", "png", "jpg"]);
  return { falsePositives, falseNegatives };
}

// ============================================================
// 5. Bukti notificationHistoryService.ts & NotificationCenterPanel.tsx
// ============================================================
const TRANSIENT_NOTIF_ICONS = new Set([
  "sun", "moon", "clipboard", "capslock", "battery", "volume",
  "brightness", "wifi", "bluetooth", "usb", "headphones",
]);

function isTransientSystemHistoryItem(item) {
  const icon = (item.icon || "").toLowerCase();
  if (TRANSIENT_NOTIF_ICONS.has(icon)) return true;
  const title = (item.title || "").toLowerCase();
  return (
    title.startsWith("hi, ") ||
    title.includes("caps lock") ||
    title.includes("mengisi daya") ||
    title.includes("menggunakan baterai") ||
    title === "charging" ||
    title === "on battery" ||
    title === "baterai penuh" ||
    title === "battery full" ||
    title === "usb connected" ||
    title === "audio device connected" ||
    title.includes("hotspot")
  );
}

function categorizeNotification(notif) {
  const title = (notif.title || "").toLowerCase();
  const body = (notif.body || "").toLowerCase();
  const icon = (notif.icon || "").toLowerCase();
  const aumid = (notif.aumid || "").toLowerCase();
  const explicitApp = (notif.appName || "").trim();

  const isWhatsApp =
    explicitApp.toLowerCase().includes("whatsapp") ||
    aumid.includes("whatsapp") ||
    icon === "whatsapp" ||
    title.includes("whatsapp") ||
    body.includes("whatsapp") ||
    title.includes("web.whatsapp.com") ||
    body.includes("web.whatsapp.com");

  if (isWhatsApp) {
    const isWeb =
      explicitApp.toLowerCase().includes("chrome") ||
      explicitApp.toLowerCase().includes("edge") ||
      explicitApp.toLowerCase().includes("brave") ||
      explicitApp.toLowerCase().includes("firefox") ||
      title.includes("web.whatsapp.com") ||
      body.includes("web.whatsapp.com");
    return { category: "message", appName: isWeb ? "WhatsApp Web" : "WhatsApp" };
  }

  if (explicitApp) {
    const lowerApp = explicitApp.toLowerCase();
    if (
      lowerApp.includes("telegram") ||
      lowerApp.includes("discord") ||
      lowerApp.includes("slack") ||
      lowerApp.includes("mail") ||
      lowerApp.includes("outlook") ||
      icon === "message" ||
      notif.type === "message"
    ) {
      return { category: "message", appName: explicitApp };
    }
    if (
      icon === "bell" ||
      icon === "timer" ||
      title.includes("deadline") ||
      title.includes("ingat") ||
      title.includes("pomodoro") ||
      title.includes("todo") ||
      body.includes("deadline") ||
      body.includes("ingat")
    ) {
      return { category: "reminder", appName: explicitApp };
    }
    if (icon === "clipboard" || title.includes("clipboard") || title.includes("disalin")) {
      return { category: "clipboard", appName: explicitApp };
    }
    return { category: "system", appName: explicitApp };
  }
  return { category: "system", appName: "Sistem" };
}

function resolveFallbackClickAction(item) {
  const appLower = (item.appName || "").trim().toLowerCase();
  const titleLower = (item.title || "").toLowerCase();
  const bodyText = item.body || "";

  const urlMatch = (bodyText + " " + item.title).match(/https?:\/\/[^\s]+/i);
  const isBrowserApp =
    appLower.includes("chrome") ||
    appLower.includes("edge") ||
    appLower.includes("firefox") ||
    appLower.includes("brave") ||
    appLower.includes("opera") ||
    appLower.includes("browser");

  if (urlMatch && (isBrowserApp || urlMatch[0].length > 10)) {
    return { type: "url", target: urlMatch[0] };
  }

  const combined = `${appLower} ${titleLower}`;
  let protocolUrl = "";
  if (combined.includes("whatsapp")) protocolUrl = "whatsapp://";
  else if (combined.includes("telegram") || combined.includes("tg")) protocolUrl = "tg://";
  else if (combined.includes("discord")) protocolUrl = "discord://";
  else if (combined.includes("spotify")) protocolUrl = "spotify://";
  else if (combined.includes("slack")) protocolUrl = "slack://";
  else if (combined.includes("teams")) protocolUrl = "msteams://";
  else if (combined.includes("zoom")) protocolUrl = "zoommtg://";
  else if (combined.includes("line")) protocolUrl = "line://";
  else if (combined.includes("steam")) protocolUrl = "steam://";
  else if (combined.includes("vscode") || combined.includes("code")) protocolUrl = "vscode://";
  return { type: "protocol", target: protocolUrl };
}

function testNotificationLogic() {
  // False transient drops
  assert.equal(isTransientSystemHistoryItem({ title: "Hi, Rudi", icon: "message" }), true);
  assert.equal(isTransientSystemHistoryItem({ title: "Berita Hotspot Wisata", icon: "bell" }), true);

  // Miscategorization
  const securityWarning = categorizeNotification({
    appName: "Windows Security",
    title: "Peringatan keamanan",
    body: "Periksa pemindaian perangkat",
  });
  assert.equal(securityWarning.category, "reminder");

  const slackMsg = categorizeNotification({
    appName: "Slack",
    title: "Tim Backend",
    body: "Tolong cek grup WhatsApp ya",
  });
  assert.equal(slackMsg.appName, "WhatsApp");

  // Protocol & URL hijacking
  const otpAction = resolveFallbackClickAction({
    appName: "Authenticator",
    title: "Your verification code",
    body: "Use 000000 to verify",
  });
  assert.equal(otpAction.target, "vscode://");

  const deadlineAction = resolveFallbackClickAction({
    appName: "Calendar",
    title: "Meeting deadline",
    body: "Starts in 10m",
  });
  assert.equal(deadlineAction.target, "line://");

  const settingsAction = resolveFallbackClickAction({
    appName: "System",
    title: "PostgreSQL backup completed",
    body: "Database synced",
  });
  assert.equal(settingsAction.target, "tg://");

  const trailingPunctUrl = resolveFallbackClickAction({
    appName: "App",
    title: "Info",
    body: "Lihat https://example.com/test.",
  });
  assert.equal(trailingPunctUrl.target, "https://example.com/test.");

  return {
    securityWarning,
    slackMsg,
    otpAction,
    deadlineAction,
    settingsAction,
    trailingPunctUrl,
  };
}

// ============================================================
// 6. Bukti shelfService.ts:17-68 & 123-173 kapasitas efektif cache hanya 20 file
// ============================================================
function testPreviewCacheThrashing() {
  const MAX_PREVIEW_CACHE_ENTRIES = 60;
  const previewCache = new Map();
  const completedFetches = new Set();

  function touch(key, val) {
    if (previewCache.has(key)) previewCache.delete(key);
    previewCache.set(key, val);
    while (previewCache.size > MAX_PREVIEW_CACHE_ENTRIES) {
      const oldest = previewCache.keys().next().value;
      if (oldest === undefined) break;
      previewCache.delete(oldest);
    }
  }

  function setCachedPreview(id, path, preview) {
    if (id) touch(id, preview);
    if (path) {
      touch(path, preview);
      const lower = path.toLowerCase();
      if (lower !== path) touch(lower, preview);
    }
  }

  for (let i = 1; i <= 25; i++) {
    const id = `id-${i}`;
    const path = `C:\\Users\\Demo\\File_${i}.png`;
    setCachedPreview(id, path, { sizeFormatted: "1 MB" });
    completedFetches.add(id);
  }

  const file1InCache = previewCache.has("id-1") || previewCache.has("C:\\Users\\Demo\\File_1.png");
  assert.equal(file1InCache, false, "File #1 sudah terdepak dari previewCache");
  assert.equal(completedFetches.has("id-1"), true, "completedFetches masih menandai file #1");
  return {
    cacheSize: previewCache.size,
    completedSize: completedFetches.size,
    file1EvictedWhileMarkedCompleted: !file1InCache && completedFetches.has("id-1"),
  };
}

// ============================================================
// 7. Bukti shelf_server.rs:1796 badge file tanpa ekstensi
// ============================================================
function testExtensionlessDownloadBadge() {
  const name = "README_PROJECT_SPEC";
  const ext = name.split(".").pop()?.toLowerCase() ?? "file";
  assert.equal(ext.toUpperCase(), "README_PROJECT_SPEC");
  return ext.toUpperCase();
}

const results = {
  weakToken: testWeakTokenPrediction(),
  shelfResurrection: testShelfResurrection(),
  fileUriPlus: testFileUriPlusCorruption(),
  clipboardSearch: testClipboardImageSearchFilter(),
  notifications: testNotificationLogic(),
  previewCacheThrashing: testPreviewCacheThrashing(),
  extensionlessBadge: testExtensionlessDownloadBadge(),
};

console.log("ALL T12 VERIFICATION CHECKS PASSED:");
console.log(JSON.stringify(results, null, 2));
