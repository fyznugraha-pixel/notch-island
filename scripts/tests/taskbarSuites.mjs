import assert from "node:assert/strict";
import { after, afterEach, before, beforeEach, describe, it } from "node:test";
import { pathToFileURL } from "node:url";
import { clearMocks, mockIPC } from "@tauri-apps/api/mocks";
import { createViteSsrLoader, installBrowserShim } from "./harness.mjs";

function clearTauriMocks() {
  clearMocks();
  delete globalThis.__TAURI_INTERNALS__;
  delete globalThis.__TAURI_EVENT_PLUGIN_INTERNALS__;
  delete globalThis.__TAURI__;
}

function makeKeyEvent(overrides = {}) {
  return {
    code: "KeyA",
    ctrlKey: false,
    altKey: false,
    shiftKey: false,
    metaKey: false,
    ...overrides,
  };
}

export function registerTaskbarSuites(getLoader) {
  describe("Taskbar, Pinned Apps, Icons, Search, Shortcuts, Theme & Config", () => {
    let pinnedAppsHelpers;
    let macosIconMap;
    let navbarConfigService;
    let taskbarLaunchService;
    let shortcutsService;
    let appSearchMatcher;
    let navbarThemeUtils;
    let navbarTypes;

    let OriginalBroadcastChannel;
    const trackedChannels = new Set();

    before(async () => {
      if (typeof globalThis.BroadcastChannel === "function") {
        OriginalBroadcastChannel = globalThis.BroadcastChannel;
        globalThis.BroadcastChannel = class TestBroadcastChannel extends OriginalBroadcastChannel {
          constructor(name) {
            super(name);
            this.unref?.();
            trackedChannels.add(this);
          }
          close() {
            trackedChannels.delete(this);
            super.close();
          }
        };
      }

      const { loadModule } = getLoader();
      [
        pinnedAppsHelpers,
        macosIconMap,
        navbarConfigService,
        taskbarLaunchService,
        shortcutsService,
        appSearchMatcher,
        navbarThemeUtils,
        navbarTypes,
      ] = await Promise.all([
        loadModule("/src/components/navbar/groups/pinnedAppsHelpers.ts"),
        loadModule("/src/components/navbar/groups/macosIconMap.ts"),
        loadModule("/src/services/navbarConfigService.ts"),
        loadModule("/src/services/taskbarLaunchService.ts"),
        loadModule("/src/services/shortcuts.ts"),
        loadModule("/src/utils/appSearchMatcher.ts"),
        loadModule("/src/components/navbar/navbarThemeUtils.ts"),
        loadModule("/src/types/navbar.ts"),
      ]);
    });

    after(() => {
      for (const ch of trackedChannels) {
        try {
          ch.close();
        } catch {}
      }
      trackedChannels.clear();
      if (OriginalBroadcastChannel) {
        globalThis.BroadcastChannel = OriginalBroadcastChannel;
      }
    });

    beforeEach(() => {
      localStorage.clear();
      sessionStorage.clear();
      clearTauriMocks();
    });

    afterEach(() => {
      clearTauriMocks();
    });

    describe("pinnedAppsHelpers", () => {
      it("extractExeBasename handles quoted paths, CLI arguments, spaces, and non-exe targets", () => {
        const { extractExeBasename } = pinnedAppsHelpers;

        assert.equal(
          extractExeBasename('"C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe"'),
          "chrome.exe"
        );
        assert.equal(
          extractExeBasename(
            '"C:\\Users\\demo\\AppData\\Local\\Discord\\Update.exe" --processStart Discord.exe'
          ),
          "update.exe"
        );
        assert.equal(
          extractExeBasename(
            '"C:\\Program Files\\Microsoft VS Code Insiders\\Code - Insiders.exe" --wait'
          ),
          "code - insiders.exe"
        );
        assert.equal(
          extractExeBasename("C:\\Tools\\My App\\Runner Tool.exe --wait"),
          "runner tool.exe"
        );
        assert.equal(
          extractExeBasename("C:\\Tools\\My App\\Runner Tool.exe --config=alt.exe"),
          "runner tool.exe"
        );
        assert.equal(extractExeBasename("C:\\Foo.exe\\Bar.exe"), "bar.exe");
        assert.equal(extractExeBasename("ms-settings:display"), "");
        assert.equal(extractExeBasename(""), "");
        assert.equal(extractExeBasename(undefined), "");
      });

      it("isBrowserPwaShortcut distinguishes PWAs and Store Netflix from standard browsers", () => {
        const { isBrowserPwaShortcut } = pinnedAppsHelpers;

        assert.equal(
          isBrowserPwaShortcut({
            id: "yt-chrome-pwa",
            name: "YouTube",
            targetPath: "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
            args: "--profile-directory=Default --app-id=agimnkijcaahngcdmfeangaknmldooml",
          }),
          true
        );
        assert.equal(
          isBrowserPwaShortcut({
            id: "docs-edge-pwa",
            name: "Docs",
            targetPath: "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe",
            arguments: "--app=https://docs.example.com",
          }),
          true
        );
        assert.equal(
          isBrowserPwaShortcut({
            id: "brave-pwa",
            name: "Music",
            targetPath: "C:\\Program Files\\BraveSoftware\\Brave-Browser\\Application\\brave.exe",
            arguments: "--app-id=abcdef",
          }),
          true
        );
        assert.equal(
          isBrowserPwaShortcut({
            id: "proxy-chrome",
            name: "Notion",
            targetPath: "C:\\Program Files\\Google\\Chrome\\Application\\chrome_proxy.exe",
          }),
          true
        );
        assert.equal(
          isBrowserPwaShortcut({
            id: "proxy-edge",
            name: "Outlook",
            targetPath: "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge_proxy.exe",
          }),
          true
        );
        assert.equal(
          isBrowserPwaShortcut({
            id: "proxy-brave",
            name: "Linear",
            targetPath: "C:\\Program Files\\BraveSoftware\\Brave-Browser\\Application\\brave_proxy.exe",
          }),
          true
        );
        assert.equal(
          isBrowserPwaShortcut({
            id: "4DF9E0F8.Netflix_mcm4njqhnhss8!Netflix.App",
            name: "Netflix",
            lnkPath: "shell:AppsFolder\\4DF9E0F8.Netflix_mcm4njqhnhss8!Netflix.App",
          }),
          true
        );
        assert.equal(
          isBrowserPwaShortcut({
            id: "pwa-hostid",
            name: "Web App",
            targetPath: "C:\\Windows\\System32\\cmd.exe",
            args: "hostId=pwa",
          }),
          true
        );

        assert.equal(
          isBrowserPwaShortcut({
            id: "chrome",
            name: "Google Chrome",
            targetPath: "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
          }),
          false
        );
        assert.equal(
          isBrowserPwaShortcut({
            id: "edge",
            name: "Microsoft Edge",
            targetPath: "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe",
          }),
          false
        );
        assert.equal(
          isBrowserPwaShortcut({
            id: "brave",
            name: "Brave",
            targetPath: "C:\\Program Files\\BraveSoftware\\Brave-Browser\\Application\\brave.exe",
          }),
          false
        );
      });

      it("matchesPinnedApp resolves Calculator, Spotify wrappers, Discord Squirrel, and WhatsApp Store", () => {
        const { matchesPinnedApp } = pinnedAppsHelpers;

        const calcUwp = { id: "calculator", name: "Calculator" };
        const calcLegacy = { id: "calculatorapp", name: "Calculator" };
        for (const exe of ["CalculatorApp.exe", "calc.exe", "win32calc.exe"]) {
          assert.equal(matchesPinnedApp(calcUwp, { process_name: exe, title: "Calculator" }), true);
          assert.equal(
            matchesPinnedApp(calcLegacy, { process_name: exe, title: "Calculator" }),
            true
          );
        }

        const spotifyMigrator = {
          id: "spotify",
          name: "Spotify",
          targetPath: "C:\\Users\\demo\\AppData\\Roaming\\Spotify\\SpotifyMigrator.exe",
        };
        const spotifyLauncherCustomId = {
          id: "custom_spotify_lnk",
          name: "Spotify",
          targetPath: "C:\\Users\\demo\\AppData\\Roaming\\Spotify\\SpotifyLauncher.exe",
        };
        assert.equal(
          matchesPinnedApp(spotifyMigrator, {
            process_name: "Spotify.exe",
            title: "Spotify Free",
          }),
          true
        );
        assert.equal(
          matchesPinnedApp(spotifyLauncherCustomId, {
            process_name: "Spotify.exe",
            title: "Spotify Premium",
          }),
          true
        );

        const discordSquirrel = {
          id: "discord",
          name: "Discord",
          targetPath: "C:\\Users\\demo\\AppData\\Local\\Discord\\Update.exe",
          args: '--processStart "Discord.exe"',
        };
        const discordViaArgumentsField = {
          id: "discord_alt",
          name: "Discord",
          targetPath: "C:\\Users\\demo\\AppData\\Local\\Discord\\Update.exe",
          arguments: "--processStart Discord.exe",
        };
        assert.equal(
          matchesPinnedApp(discordSquirrel, { process_name: "Discord.exe", title: "Discord" }),
          true
        );
        assert.equal(
          matchesPinnedApp(discordViaArgumentsField, {
            process_name: "Discord.exe",
            title: "Discord",
          }),
          true
        );
        assert.equal(
          matchesPinnedApp(discordViaArgumentsField, {
            process_name: "Update.exe",
            title: "Updating",
          }),
          false
        );

        const whatsapp = { id: "whatsapp", name: "WhatsApp" };
        assert.equal(
          matchesPinnedApp(whatsapp, { process_name: "WhatsApp.Root.exe", title: "WhatsApp" }),
          true
        );
        assert.equal(
          matchesPinnedApp(whatsapp, { process_name: "WhatsApp.exe", title: "WhatsApp" }),
          true
        );
      });

      it("matchesPinnedApp covers Windows inbox apps, VS Code, Terminal, and localized Settings", () => {
        const { matchesPinnedApp } = pinnedAppsHelpers;

        assert.equal(
          matchesPinnedApp(
            { id: "notepad", name: "Notepad" },
            { process_name: "Notepad.exe", title: "notes.txt - Notepad" }
          ),
          true
        );
        assert.equal(
          matchesPinnedApp(
            { id: "windowsnotepad", name: "Notepad" },
            { process_name: "Notepad.exe", title: "Untitled" }
          ),
          true
        );
        assert.equal(
          matchesPinnedApp(
            { id: "paint", name: "Paint" },
            { process_name: "mspaint.exe", title: "Untitled - Paint" }
          ),
          true
        );
        assert.equal(
          matchesPinnedApp(
            { id: "mspaint", name: "Paint" },
            { process_name: "paint.exe", title: "Paint" }
          ),
          true
        );
        assert.equal(
          matchesPinnedApp(
            { id: "photos", name: "Photos" },
            { process_name: "Microsoft.Photos.exe", title: "Photos" }
          ),
          true
        );
        assert.equal(
          matchesPinnedApp(
            { id: "windows.photos", name: "Photos" },
            { process_name: "Photos.exe", title: "Photos" }
          ),
          true
        );
        assert.equal(
          matchesPinnedApp(
            { id: "store", name: "Microsoft Store" },
            { process_name: "WinStore.App.exe", title: "Microsoft Store" }
          ),
          true
        );
        assert.equal(
          matchesPinnedApp(
            { id: "microsoft_store", name: "Microsoft Store" },
            { process_name: "WinStore.App.exe", title: "Microsoft Store" }
          ),
          true
        );
        assert.equal(
          matchesPinnedApp(
            { id: "snippingtool", name: "Snipping Tool" },
            { process_name: "ScreenSketch.exe", title: "Snipping Tool" }
          ),
          true
        );
        assert.equal(
          matchesPinnedApp(
            { id: "screensketch", name: "Snipping Tool" },
            { process_name: "SnippingTool.exe", title: "Snipping Tool" }
          ),
          true
        );
        assert.equal(
          matchesPinnedApp(
            { id: "mediaplayer", name: "Media Player" },
            { process_name: "Microsoft.Media.Player.exe", title: "Media Player" }
          ),
          true
        );
        assert.equal(
          matchesPinnedApp(
            { id: "zunemusic", name: "Media Player" },
            { process_name: "Video.UI.exe", title: "Media Player" }
          ),
          true
        );

        const vscode = { id: "vscode", name: "Visual Studio Code" };
        assert.equal(
          matchesPinnedApp(vscode, { process_name: "Code.exe", title: "index.ts - island" }),
          true
        );
        assert.equal(
          matchesPinnedApp(vscode, {
            process_name: "Code - Insiders.exe",
            title: "index.ts - island - Visual Studio Code - Insiders",
          }),
          true
        );

        const terminal = { id: "terminal", name: "Terminal" };
        for (const exe of ["WindowsTerminal.exe", "pwsh.exe", "powershell.exe", "cmd.exe"]) {
          assert.equal(matchesPinnedApp(terminal, { process_name: exe, title: "PowerShell" }), true);
        }
        // Wrapper cmd.exe scripts must not claim unrelated cmd.exe windows
        assert.equal(
          matchesPinnedApp(
            {
              id: "my-batch-tool",
              name: "Batch Tool",
              targetPath: "C:\\Windows\\System32\\cmd.exe",
              args: "/c run.bat",
            },
            { process_name: "cmd.exe", title: "Command Prompt" }
          ),
          false
        );

        const settings = { id: "settings", name: "Settings" };
        assert.equal(
          matchesPinnedApp(settings, { process_name: "SystemSettings.exe", title: "Settings" }),
          true
        );
        for (const localizedTitle of ["Settings", "Pengaturan", "Setelan"]) {
          assert.equal(
            matchesPinnedApp(settings, {
              process_name: "ApplicationFrameHost.exe",
              title: localizedTitle,
            }),
            true
          );
        }
        assert.equal(
          matchesPinnedApp(settings, { process_name: "ApplicationFrameHost.exe", title: "Xbox" }),
          false
        );
      });

      it("matchesPinnedApp isolates Browser PWAs from normal browser tabs", () => {
        const { matchesPinnedApp } = pinnedAppsHelpers;

        const ytChromePwa = {
          id: "yt-pwa",
          name: "YouTube",
          targetPath: "C:\\Program Files\\Google\\Chrome\\Application\\chrome_proxy.exe",
          args: "--app-id=agimnkijcaahngcdmfeangaknmldooml",
        };

        assert.equal(
          matchesPinnedApp(ytChromePwa, { process_name: "chrome.exe", title: "YouTube" }),
          true
        );
        assert.equal(
          matchesPinnedApp(ytChromePwa, { process_name: "chrome_proxy.exe", title: "YouTube" }),
          true
        );
        assert.equal(
          matchesPinnedApp(ytChromePwa, {
            process_name: "chrome.exe",
            title: "YouTube - Google Chrome",
          }),
          false
        );
        assert.equal(
          matchesPinnedApp(ytChromePwa, { process_name: "msedge.exe", title: "YouTube" }),
          false
        );

        const netflixStore = {
          id: "netflix-store",
          name: "Netflix",
          lnkPath: "shell:AppsFolder\\4DF9E0F8.Netflix_mcm4njqhnhss8!Netflix.App",
        };
        assert.equal(
          matchesPinnedApp(netflixStore, { process_name: "msedge.exe", title: "Netflix" }),
          true
        );
        assert.equal(
          matchesPinnedApp(netflixStore, {
            process_name: "msedge.exe",
            title: "Netflix - Microsoft Edge",
          }),
          false
        );
        assert.equal(
          matchesPinnedApp(netflixStore, { process_name: "chrome.exe", title: "Netflix" }),
          false
        );
        assert.equal(matchesPinnedApp(netflixStore, { process_name: "", title: "Netflix" }), false);
      });

      it("getRunningAppMeta returns canonical metadata and extracts trailing app titles", () => {
        const { getRunningAppMeta } = pinnedAppsHelpers;

        assert.deepEqual(getRunningAppMeta("SystemSettings.exe", "Settings"), {
          id: "settings",
          name: "Settings",
          iconType: "settings",
        });
        assert.deepEqual(getRunningAppMeta("ApplicationFrameHost.exe", "Pengaturan"), {
          id: "settings",
          name: "Settings",
          iconType: "settings",
        });
        assert.deepEqual(getRunningAppMeta("Code - Insiders.exe", "main.ts - Visual Studio Code"), {
          id: "vscode",
          name: "Visual Studio Code",
          iconType: "code",
        });
        assert.deepEqual(getRunningAppMeta("CalculatorApp.exe", "Calculator"), {
          id: "calculator",
          name: "Calculator",
          iconType: "calculator",
        });
        assert.deepEqual(getRunningAppMeta("WinStore.App.exe", "Microsoft Store"), {
          id: "store",
          name: "Microsoft Store",
          iconType: undefined,
        });

        assert.deepEqual(getRunningAppMeta("obsidian.exe", "Sprint Notes - Vault - Obsidian"), {
          id: "obsidian",
          name: "Obsidian",
        });
        assert.deepEqual(getRunningAppMeta("notepad++.exe", "SingleTitle"), {
          id: "notepad++",
          name: "SingleTitle",
        });
        assert.deepEqual(getRunningAppMeta("mytool.exe", ""), {
          id: "mytool",
          name: "Mytool",
        });
      });
    });

    describe("macosIconMap", () => {
      it("normalizeIconUrl handles data URLs, paths, http URLs, PNG base64, JPEG prefix quirk, and invalid inputs", () => {
        const { normalizeIconUrl } = macosIconMap;

        assert.equal(
          normalizeIconUrl("  data:image/png;base64,AAA  "),
          "data:image/png;base64,AAA"
        );
        assert.equal(normalizeIconUrl("/icons/macos/chrome.webp"), "/icons/macos/chrome.webp");
        assert.equal(
          normalizeIconUrl("https://example.com/icon.png"),
          "https://example.com/icon.png"
        );

        const rawPngB64 = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk";
        assert.equal(normalizeIconUrl(rawPngB64), `data:image/png;base64,${rawPngB64}`);

        const genericB64 = "QUJDREVGR0hJSktMTU5PUFFSU1RVVldYWVowMTIzNDU2Nzg5";
        assert.equal(normalizeIconUrl(genericB64), `data:image/png;base64,${genericB64}`);

        const rawJpegB64 = "/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkS";
        assert.equal(normalizeIconUrl(rawJpegB64), `data:image/jpeg;base64,${rawJpegB64}`);

        assert.equal(normalizeIconUrl(null), undefined);
        assert.equal(normalizeIconUrl(undefined), undefined);
        assert.equal(normalizeIconUrl("   "), undefined);
        assert.equal(normalizeIconUrl("iVBORshort"), undefined);
        assert.equal(
          normalizeIconUrl("plain-invalid-string-without-prefix-or-base64-chars!"),
          undefined
        );
      });

      it("resolveMacOSIconSlug resolves Calculator, PWAs vs proxy exes, Notepad, Paint, VSCode, and Finder", () => {
        const { resolveMacOSIconSlug, getMacOSIconSrc } = macosIconMap;

        assert.equal(getMacOSIconSrc("calculator"), "/icons/macos/calculator.webp");

        assert.equal(resolveMacOSIconSlug({ id: "calculator", name: "Calculator" }), "calculator");
        assert.equal(
          resolveMacOSIconSlug({
            id: "calculatorapp",
            name: "Calculator",
            targetPath: "C:\\Program Files\\WindowsApps\\CalculatorApp.exe",
          }),
          "calculator"
        );
        assert.equal(resolveMacOSIconSlug({ id: "kalkulator", name: "Kalkulator" }), "calculator");

        assert.equal(
          resolveMacOSIconSlug({
            id: "pwa_netflix",
            name: "Netflix",
            targetPath: "C:\\Program Files\\Google\\Chrome\\Application\\chrome_proxy.exe",
          }),
          "netflix"
        );
        assert.equal(
          resolveMacOSIconSlug({
            id: "pwa_ytm",
            name: "YouTube Music",
            targetPath: "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge_proxy.exe",
          }),
          "youtubemusic"
        );
        assert.equal(
          resolveMacOSIconSlug({
            id: "pwa_unknown",
            name: "Internal Portal",
            targetPath: "C:\\Program Files\\Google\\Chrome\\Application\\chrome_proxy.exe",
          }),
          null
        );

        assert.equal(
          resolveMacOSIconSlug({
            id: "custom_browser",
            name: "Work Browser",
            targetPath: "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
          }),
          "chrome"
        );
        assert.equal(resolveMacOSIconSlug({ id: "notepad", name: "Notepad" }), "notes");
        assert.equal(
          resolveMacOSIconSlug({
            id: "mspaint",
            name: "Paint",
            targetPath: "C:\\Windows\\System32\\mspaint.exe",
          }),
          null
        );
        assert.equal(
          resolveMacOSIconSlug({
            id: "vscode",
            name: "Visual Studio Code",
            targetPath: "C:\\Users\\demo\\AppData\\Local\\Programs\\Microsoft VS Code\\Code.exe",
          }),
          "vscode"
        );
        assert.equal(
          resolveMacOSIconSlug({
            id: "code_insiders",
            name: "Code - Insiders",
            targetPath:
              "C:\\Program Files\\Microsoft VS Code Insiders\\Code - Insiders.exe",
          }),
          "vscode"
        );
        assert.equal(
          resolveMacOSIconSlug({
            id: "explorer",
            name: "File Explorer",
            targetPath: "C:\\Windows\\explorer.exe",
          }),
          "finder"
        );
        assert.equal(
          resolveMacOSIconSlug({ id: "custom_files", name: "Workspace", iconType: "folder" }),
          "finder"
        );
        assert.equal(
          resolveMacOSIconSlug({
            id: "terminal",
            name: "Terminal",
            targetPath: "C:\\Program Files\\PowerShell\\7\\pwsh.exe",
          }),
          "terminal"
        );
        assert.equal(
          resolveMacOSIconSlug({ id: "win_settings", name: "Pengaturan" }),
          "settings"
        );
        assert.equal(resolveMacOSIconSlug({ id: "gpt", name: "ChatGPT" }), "openai");
        assert.equal(resolveMacOSIconSlug({ id: "claude_ai", name: "Claude" }), "claude");
      });
    });

    describe("navbarConfigService & navbar types", () => {
      it("normalizes defaults and clamps taskbarHeight, iconSize, cornerRadius, opacity, blur, and legacy dock height", () => {
        const { normalizeNavbarConfig } = navbarConfigService;
        const { DEFAULT_NAVBAR_CONFIG, DEFAULT_NAVBAR_MODULES } = navbarTypes;

        const fromNull = normalizeNavbarConfig(null);
        assert.deepEqual(fromNull, {
          ...DEFAULT_NAVBAR_CONFIG,
          modules: DEFAULT_NAVBAR_MODULES,
        });
        assert.notEqual(fromNull.modules, DEFAULT_NAVBAR_MODULES);

        const clampedLow = normalizeNavbarConfig({
          iconSize: 10,
          taskbarHeight: 12,
          cornerRadius: -5,
          distanceFromEdge: -3,
          opacity: 5,
          blur: -20,
          accent: "not-a-hex",
          iconTheme: "invalid-theme",
          position: "diagonal",
          style: "unknown",
          background: "gradient",
          iconSpacing: "huge",
        });
        assert.equal(clampedLow.iconSize, 24);
        assert.equal(clampedLow.taskbarHeight, 36);
        assert.equal(clampedLow.cornerRadius, 0);
        assert.equal(clampedLow.distanceFromEdge, 0);
        assert.equal(clampedLow.opacity, 20);
        assert.equal(clampedLow.blur, 0);
        assert.equal(clampedLow.accent, "#3882F6");
        assert.equal(clampedLow.iconTheme, "fluent");
        assert.equal(clampedLow.position, "bottom");
        assert.equal(clampedLow.style, "solid");
        assert.equal(clampedLow.background, "black");
        assert.equal(clampedLow.iconSpacing, "tight");

        const clampedHigh = normalizeNavbarConfig({
          iconSize: 99,
          taskbarHeight: 120,
          cornerRadius: 80,
          distanceFromEdge: 100,
          opacity: 150,
          blur: 200,
          accent: "#a855f7",
          iconTheme: "glass",
          shape: "anchored",
          position: "top",
          style: "liquid",
          background: "custom",
          customColor: "#112233",
          iconSpacing: "roomy",
        });
        assert.equal(clampedHigh.iconSize, 56);
        assert.equal(clampedHigh.taskbarHeight, 64);
        assert.equal(clampedHigh.cornerRadius, 30);
        assert.equal(clampedHigh.distanceFromEdge, 40);
        assert.equal(clampedHigh.opacity, 100);
        assert.equal(clampedHigh.blur, 100);
        assert.equal(clampedHigh.accent, "#a855f7");
        assert.equal(clampedHigh.iconTheme, "glass");
        assert.equal(clampedHigh.shape, "anchored");
        assert.equal(clampedHigh.position, "top");
        assert.equal(clampedHigh.style, "liquid");
        assert.equal(clampedHigh.background, "custom");
        assert.equal(clampedHigh.customColor, "#112233");
        assert.equal(clampedHigh.iconSpacing, "roomy");

        // Legacy configs without taskbarHeight derive it from iconSize + 8 clamped to [36, 64]
        const legacyHeight = normalizeNavbarConfig({ iconSize: 50 });
        assert.equal(legacyHeight.taskbarHeight, 58);

        const legacyMinHeight = normalizeNavbarConfig({ iconSize: 24 });
        assert.equal(legacyMinHeight.taskbarHeight, 36);
      });

      it("normalizes modules, inserts missing hiddenTray before group 3, and provides color helpers", () => {
        const { normalizeNavbarConfig, hexToRgba, darkenHex } = navbarConfigService;

        const normalized = normalizeNavbarConfig({
          modules: [
            { id: "startSearch", group: 1, enabled: true, view: "compact" },
            { id: "startSearch", group: 9, enabled: false, view: "full" },
            { id: "systemIcons", group: 3, enabled: false, view: "full" },
            { id: "  ", group: 2 },
          ],
        });

        const ids = normalized.modules.map((m) => m.id);
        assert.equal(ids.filter((id) => id === "startSearch").length, 1);
        const hiddenIdx = ids.indexOf("hiddenTray");
        const sysIdx = ids.indexOf("systemIcons");
        assert.ok(hiddenIdx >= 0 && hiddenIdx < sysIdx);

        assert.equal(hexToRgba("#3882F6", 0.5), "rgba(56, 130, 246, 0.5)");
        assert.equal(hexToRgba("#fff", 2), "rgba(255, 255, 255, 1)");
        assert.equal(hexToRgba("#000", -1), "rgba(0, 0, 0, 0)");
        assert.equal(darkenHex("#ffffff", 0.5), "#808080");
        assert.equal(darkenHex("#fff", 0), "#000000");
      });

      it("falls back to defaults on corrupt localStorage JSON and applies one-time migrations", async () => {
        const { getCachedNavbarConfigSync, loadNavbarConfig } = navbarConfigService;
        const { DEFAULT_NAVBAR_CONFIG } = navbarTypes;

        localStorage.setItem("island_navbar_config_v1", "{corrupt-json");
        const cachedCorrupt = getCachedNavbarConfigSync();
        assert.equal(cachedCorrupt.taskbarHeight, DEFAULT_NAVBAR_CONFIG.taskbarHeight);
        assert.equal(cachedCorrupt.enabled, false);

        const loadedCorrupt = await loadNavbarConfig();
        assert.equal(loadedCorrupt.iconSize, DEFAULT_NAVBAR_CONFIG.iconSize);
        assert.equal(loadedCorrupt.enabled, false);

        localStorage.clear();
        localStorage.setItem(
          "island_navbar_config_v1",
          JSON.stringify({
            enabled: true,
            hideWindowsTaskbar: true,
            monitorId: "primary",
            taskbarHeight: 54,
          })
        );
        const migrated = getCachedNavbarConfigSync();
        assert.equal(migrated.enabled, false);
        assert.equal(migrated.hideWindowsTaskbar, false);
        assert.equal(migrated.monitorId, "all");
        assert.equal(migrated.taskbarHeight, 54);
        assert.equal(localStorage.getItem("island_navbar_default_off_v5"), "true");
        assert.equal(localStorage.getItem("island_navbar_dual_monitor_all_v1"), "true");
      });

      it("saveNavbarConfig broadcasts updates and syncs useGili switch flags via Tauri IPC", async () => {
        const { saveNavbarConfig, subscribeToNavbarConfig } = navbarConfigService;
        const { DEFAULT_NAVBAR_CONFIG } = navbarTypes;

        const ipcCalls = [];
        const storeBacking = new Map();

        mockIPC((cmd, args) => {
          ipcCalls.push({ cmd, args });
          if (cmd === "plugin:store|load") return 1;
          if (cmd === "plugin:store|get") return [storeBacking.get(args.key), storeBacking.has(args.key)];
          if (cmd === "plugin:store|set") {
            storeBacking.set(args.key, args.value);
            return null;
          }
          if (cmd === "plugin:store|save") return null;
          return null;
        });

        const received = [];
        const unsubscribe = subscribeToNavbarConfig((cfg) => received.push(cfg));

        try {
          await saveNavbarConfig({
            ...DEFAULT_NAVBAR_CONFIG,
            enabled: false,
            useGiliStart: true,
            useGiliNotificationsCalendar: true,
            useGiliQuickSettings: true,
            windowAnimation: "normal",
          });

          const disabledSwitchCall = ipcCalls
            .filter((c) => c.cmd === "set_taskbar_window_switches")
            .at(-1);
          assert.ok(disabledSwitchCall);
          assert.deepEqual(disabledSwitchCall.args.switches, {
            use_gili_start: false,
            use_gili_search: false,
            use_gili_quick_settings: false,
            use_gili_volume_output: false,
            use_gili_notif_cal: false,
            use_gili_tray: false,
          });

          const normalAnimCall = ipcCalls
            .filter((c) => c.cmd === "set_window_dock_animation")
            .at(-1);
          assert.deepEqual(normalAnimCall.args, { enabled: false });

          await saveNavbarConfig({
            ...DEFAULT_NAVBAR_CONFIG,
            enabled: true,
            useGiliStart: true,
            useGiliNotificationsCalendar: true,
            useGiliQuickSettings: true,
            windowAnimation: "genie",
            taskbarHeight: 70,
          });

          const enabledSwitchCall = ipcCalls
            .filter((c) => c.cmd === "set_taskbar_window_switches")
            .at(-1);
          assert.ok(enabledSwitchCall);
          assert.deepEqual(enabledSwitchCall.args.switches, {
            use_gili_start: true,
            use_gili_search: false,
            use_gili_quick_settings: true,
            use_gili_volume_output: false,
            use_gili_notif_cal: true,
            use_gili_tray: false,
          });

          const genieAnimCall = ipcCalls
            .filter((c) => c.cmd === "set_window_dock_animation")
            .at(-1);
          assert.deepEqual(genieAnimCall.args, { enabled: true });

          assert.equal(received.length, 2);
          assert.equal(received[1].taskbarHeight, 64);
          assert.equal(received[1].useGiliStart, true);

          // Let the 250ms debounced store flush execute while the IPC mock is still active
          await new Promise((resolve) => setTimeout(resolve, 280));
          assert.ok(storeBacking.has("opt_navbar_config"));

          const loadedFromStore = await navbarConfigService.loadNavbarConfig();
          assert.equal(loadedFromStore.taskbarHeight, 64);
          assert.equal(loadedFromStore.useGiliStart, true);
        } finally {
          unsubscribe();
        }
      });
    });

    describe("appSearchMatcher", () => {
      it("getAppCacheKey prioritizes lnk_path, then target_path, then id:name", () => {
        const { getAppCacheKey } = appSearchMatcher;

        assert.equal(
          getAppCacheKey({
            id: "code",
            name: "VS Code",
            target_path: "C:\\Code.exe",
            arguments: "",
            lnk_path: "C:\\Links\\Code.lnk",
          }),
          "C:\\Links\\Code.lnk"
        );
        assert.equal(
          getAppCacheKey({
            id: "code",
            name: "VS Code",
            target_path: "C:\\Code.exe",
            arguments: "",
            lnk_path: "",
          }),
          "C:\\Code.exe"
        );
        assert.equal(
          getAppCacheKey({
            id: "code",
            name: "VS Code",
            target_path: "",
            arguments: "",
            lnk_path: "",
          }),
          "code:VS Code"
        );
      });

      it("scoreAppSearchMatch enforces scoring hierarchy, pinned boost, and non-match zero", () => {
        const { scoreAppSearchMatch } = appSearchMatcher;

        const baseApp = {
          id: "pkg_editor",
          name: "Alpha Beta Gamma",
          target_path: "C:\\Tools\\zlauncher.exe",
          arguments: "",
          lnk_path: "shell:AppsFolder\\{1AC14E77-02E7-4E5D-B744-2EB1AE5198B7}\\Vendor.Suite_8wekyb3d8bbwe!App",
        };

        assert.equal(scoreAppSearchMatch(baseApp, "", false), 1);
        assert.equal(scoreAppSearchMatch(baseApp, "", true), 21);

        const sExact = scoreAppSearchMatch(baseApp, "alpha beta gamma", false);
        const sStartsWith = scoreAppSearchMatch(baseApp, "alpha be", false);
        const sWordStarts = scoreAppSearchMatch(baseApp, "bet", false);
        const sSubstring = scoreAppSearchMatch(baseApp, "lpha", false);
        const sMultiToken = scoreAppSearchMatch(baseApp, "alpha zlauncher", false);
        const sExeStemPrefix = scoreAppSearchMatch(baseApp, "zlaunch", false);
        const sSecondaryIncl = scoreAppSearchMatch(baseApp, "suite", false);
        const sAcronymChain = scoreAppSearchMatch(baseApp, "abg", false);
        const sMiss = scoreAppSearchMatch(baseApp, "nonexistent", false);

        assert.equal(sExact, 1000);
        assert.equal(sStartsWith, 850);
        assert.equal(sWordStarts, 700);
        assert.equal(sSubstring, 560);
        assert.equal(sMultiToken, 460);
        assert.equal(sExeStemPrefix, 420);
        assert.equal(sSecondaryIncl, 330);
        assert.equal(sAcronymChain, 250);
        assert.equal(sMiss, 0);

        assert.ok(
          sExact > sStartsWith &&
            sStartsWith > sWordStarts &&
            sWordStarts > sSubstring &&
            sSubstring > sMultiToken &&
            sMultiToken > sExeStemPrefix &&
            sExeStemPrefix > sSecondaryIncl &&
            sSecondaryIncl > sAcronymChain &&
            sAcronymChain > sMiss
        );

        assert.equal(scoreAppSearchMatch(baseApp, "alpha beta gamma", true), 1020);
        assert.equal(scoreAppSearchMatch(baseApp, "abg", true), 270);
        assert.equal(scoreAppSearchMatch(baseApp, "nonexistent", true), 0);

        // Acronym chain also handles multi-character prefixes across words (e.g. Visual Studio Code -> vscod)
        const vscode = {
          id: "editor_main",
          name: "Visual Studio Code",
          target_path: "C:\\Code.exe",
          arguments: "",
          lnk_path: "",
        };
        assert.equal(scoreAppSearchMatch(vscode, "vsc", false), 250);
        assert.equal(scoreAppSearchMatch(vscode, "vscod", false), 250);
        assert.equal(scoreAppSearchMatch(vscode, "vc", false), 250);
      });
    });

    describe("shortcuts", () => {
      it("parseKeyEventToAccelerator maps keys and rejects Windows keys, modifiers-only, unmodifiered, and reserved combos", () => {
        const { parseKeyEventToAccelerator } = shortcutsService;

        assert.deepEqual(
          parseKeyEventToAccelerator(makeKeyEvent({ code: "KeyG", ctrlKey: true, altKey: true })),
          { isComplete: true, accelerator: "Control+Alt+G", displayChips: ["Ctrl", "Alt", "G"] }
        );
        assert.deepEqual(
          parseKeyEventToAccelerator(
            makeKeyEvent({ code: "Slash", ctrlKey: true, shiftKey: true })
          ),
          {
            isComplete: true,
            accelerator: "Control+Shift+Slash",
            displayChips: ["Ctrl", "Shift", "/"],
          }
        );
        assert.deepEqual(
          parseKeyEventToAccelerator(makeKeyEvent({ code: "ArrowUp", altKey: true })),
          { isComplete: true, accelerator: "Alt+ArrowUp", displayChips: ["Alt", "↑"] }
        );

        assert.deepEqual(
          parseKeyEventToAccelerator(makeKeyEvent({ code: "KeyG", ctrlKey: true, metaKey: true })),
          {
            isComplete: true,
            accelerator: null,
            displayChips: ["Win", "Ctrl"],
            error: "shortcut_err_no_windows_key",
          }
        );
        assert.deepEqual(
          parseKeyEventToAccelerator(makeKeyEvent({ code: "ControlLeft", ctrlKey: true })),
          { isComplete: false, accelerator: null, displayChips: ["Ctrl"] }
        );
        assert.deepEqual(
          parseKeyEventToAccelerator(makeKeyEvent({ code: "CapsLock", ctrlKey: true })),
          {
            isComplete: false,
            accelerator: null,
            displayChips: ["Ctrl"],
            error: "shortcut_err_invalid_key",
          }
        );
        assert.deepEqual(parseKeyEventToAccelerator(makeKeyEvent({ code: "KeyK" })), {
          isComplete: true,
          accelerator: null,
          displayChips: ["K"],
          error: "shortcut_err_need_modifier",
        });

        for (const reserved of [
          { code: "F4", altKey: true },
          { code: "Tab", altKey: true },
          { code: "Space", altKey: true },
          { code: "Delete", ctrlKey: true, altKey: true },
          { code: "Escape", ctrlKey: true, shiftKey: true },
          { code: "Escape", ctrlKey: true },
        ]) {
          const parsed = parseKeyEventToAccelerator(makeKeyEvent(reserved));
          assert.equal(parsed.isComplete, true);
          assert.equal(parsed.accelerator, null);
          assert.equal(parsed.error, "shortcut_err_reserved_system");
        }
      });

      it("formats chips/badges, validates conflicts/reserved keys, and checks shortcut map equality", () => {
        const {
          DEFAULT_SHORTCUTS,
          formatAcceleratorToChips,
          formatShortcutForBadge,
          validateShortcut,
          areShortcutMapsEqual,
        } = shortcutsService;

        assert.deepEqual(formatAcceleratorToChips(null), []);
        assert.deepEqual(formatAcceleratorToChips("CommandOrControl+Shift+Slash"), [
          "Ctrl",
          "Shift",
          "/",
        ]);
        assert.equal(formatShortcutForBadge(null), "");
        assert.equal(formatShortcutForBadge("Control+Alt+T"), "CTRL ALT T");
        assert.equal(formatShortcutForBadge("Control+Shift+N"), "CTRL ⇧ N");

        const labels = {
          toggle_notch: "Toggle Notch",
          quick_task: "Quick Task",
        };
        assert.deepEqual(validateShortcut("open_media", null, DEFAULT_SHORTCUTS, labels), {
          valid: true,
        });
        assert.deepEqual(validateShortcut("open_media", "KeyM", DEFAULT_SHORTCUTS, labels), {
          valid: false,
          error: "shortcut_err_need_modifier",
        });
        assert.deepEqual(
          validateShortcut("open_media", "Control+Super+M", DEFAULT_SHORTCUTS, labels),
          {
            valid: false,
            error: "shortcut_err_no_windows_key",
          }
        );
        assert.deepEqual(validateShortcut("open_media", "Super+M", DEFAULT_SHORTCUTS, labels), {
          valid: false,
          error: "shortcut_err_no_windows_key",
        });
        assert.deepEqual(validateShortcut("open_media", "Alt+F4", DEFAULT_SHORTCUTS, labels), {
          valid: false,
          error: "shortcut_err_reserved_system",
        });
        assert.deepEqual(validateShortcut("open_media", "alt+f4", DEFAULT_SHORTCUTS, labels), {
          valid: false,
          error: "shortcut_err_reserved_system",
        });
        assert.deepEqual(
          validateShortcut("open_media", "Control+Alt+T", DEFAULT_SHORTCUTS, labels),
          {
            valid: false,
            error: "shortcut_err_duplicate::Quick Task",
          }
        );
        assert.deepEqual(
          validateShortcut("open_media", "control+alt+t", DEFAULT_SHORTCUTS, labels),
          {
            valid: false,
            error: "shortcut_err_duplicate::Quick Task",
          }
        );
        assert.deepEqual(
          validateShortcut("quick_task", "Control+Alt+T", DEFAULT_SHORTCUTS, labels),
          { valid: true }
        );

        const copy = { ...DEFAULT_SHORTCUTS };
        assert.equal(areShortcutMapsEqual(DEFAULT_SHORTCUTS, copy), true);
        copy.open_media = "Control+Alt+P";
        assert.equal(areShortcutMapsEqual(DEFAULT_SHORTCUTS, copy), false);
      });

      it("shortcutManager registers, detects conflicts, suspends/resumes, and probes shortcuts via mocked IPC", async () => {
        const { DEFAULT_SHORTCUTS, shortcutManager } = shortcutsService;

        const registered = new Map();
        let triggered = 0;

        mockIPC((cmd, args) => {
          if (cmd === "plugin:global-shortcut|unregister_all") {
            registered.clear();
            return null;
          }
          if (cmd === "plugin:global-shortcut|unregister") {
            for (const s of args.shortcuts || []) registered.delete(s);
            return null;
          }
          if (cmd === "plugin:global-shortcut|register") {
            for (const s of args.shortcuts || []) {
              if (s === "Control+Shift+D") {
                throw new Error("Shortcut already registered conflict");
              }
              registered.set(s, args.handler);
            }
            return null;
          }
          return null;
        });

        const disabledMap = await shortcutManager.applyAll(DEFAULT_SHORTCUTS, false, {});
        assert.equal(disabledMap.toggle_notch, "inactive");
        assert.equal(registered.size, 0);

        const customMap = {
          ...DEFAULT_SHORTCUTS,
          open_media: "Control+Alt+P",
        };
        const enabledMap = await shortcutManager.applyAll(customMap, true, {
          toggle_notch: () => {
            triggered += 1;
          },
        });
        assert.equal(enabledMap.toggle_notch, "ok");
        assert.equal(enabledMap.toggle_hide, "conflict");
        assert.equal(enabledMap.toggle_focus_mode, "inactive");
        assert.equal(shortcutManager.getShortcut("open_media"), "Control+Alt+P");
        assert.equal(triggered, 0);

        const notchChannel = registered.get("Control+Alt+G");
        assert.ok(notchChannel);
        notchChannel.onmessage({ shortcut: "Control+Alt+G", state: "Released" });
        assert.equal(triggered, 0);
        notchChannel.onmessage({ shortcut: "Control+Alt+G", state: "Pressed" });
        assert.equal(triggered, 1);

        let updatedCalls = 0;
        shortcutManager.updateHandlers({
          toggle_notch: () => {
            updatedCalls += 1;
          },
        });
        notchChannel.onmessage({ shortcut: "Control+Alt+G", state: "Pressed" });
        assert.equal(updatedCalls, 1);
        assert.equal(triggered, 1);

        const dupProbe = await shortcutManager.testRegister("open_media", "Control+Alt+T");
        assert.equal(dupProbe, "conflict");

        const freeProbe = await shortcutManager.testRegister("open_media", "Control+Alt+K");
        assert.equal(freeProbe, "ok");
        assert.equal(registered.has("Control+Alt+K"), false);

        await shortcutManager.suspendAll();
        assert.equal(registered.size, 0);

        const resumed = await shortcutManager.resumeIfSuspended(true);
        assert.ok(resumed);
        assert.equal(resumed.toggle_notch, "ok");

        await shortcutManager.destroy();
        assert.equal(registered.size, 0);
      });
    });

    describe("taskbarLaunchService", () => {
      it("getLocalizedWindowsSettingsShortcuts provides English and Indonesian ms-settings entries", () => {
        const { getLocalizedWindowsSettingsShortcuts, WINDOWS_SETTINGS_SHORTCUTS } =
          taskbarLaunchService;

        const en = getLocalizedWindowsSettingsShortcuts("en");
        const id = getLocalizedWindowsSettingsShortcuts("id");

        assert.equal(en.length, 18);
        assert.equal(id.length, 18);
        assert.equal(WINDOWS_SETTINGS_SHORTCUTS.length, 18);
        assert.equal(en[0].name, "Wi-Fi Settings");
        assert.equal(id[0].name, "Pengaturan Wi-Fi");
        assert.equal(WINDOWS_SETTINGS_SHORTCUTS[0].name, "Pengaturan Wi-Fi");

        for (const item of en) {
          assert.ok(item.id && item.name && item.subtitle && item.keywords);
          assert.ok(item.uri.startsWith("ms-settings:"));
        }
      });

      it("formatRelativeTimestamp formats buckets in English, Indonesian, and default stored language", () => {
        const { formatRelativeTimestamp } = taskbarLaunchService;
        const nowSec = Math.floor(Date.now() / 1000);

        assert.equal(formatRelativeTimestamp(0, "en"), "Recently opened");
        assert.equal(formatRelativeTimestamp(0, "id"), "Baru dibuka");

        assert.equal(formatRelativeTimestamp(nowSec - 15, "en"), "Just now");
        assert.equal(formatRelativeTimestamp(nowSec + 60, "id"), "Baru saja");

        assert.equal(formatRelativeTimestamp(nowSec - 5 * 60, "en"), "5m ago");
        assert.equal(formatRelativeTimestamp(nowSec - 5 * 60, "id"), "5m lalu");

        assert.equal(formatRelativeTimestamp(nowSec - 3 * 3600, "en"), "3h ago");
        assert.equal(formatRelativeTimestamp(nowSec - 3 * 3600, "id"), "3j lalu");

        assert.equal(formatRelativeTimestamp(nowSec - 26 * 3600, "en"), "Yesterday");
        assert.equal(formatRelativeTimestamp(nowSec - 26 * 3600, "id"), "Kemarin");

        assert.equal(formatRelativeTimestamp(nowSec - 3 * 86400, "en"), "3d ago");
        assert.equal(formatRelativeTimestamp(nowSec - 3 * 86400, "id"), "3h lalu");

        const older = formatRelativeTimestamp(nowSec - 14 * 86400, "en");
        assert.ok(older.length > 0 && !older.includes("ago"));

        localStorage.setItem("island_language", "id");
        assert.equal(formatRelativeTimestamp(0), "Baru dibuka");
        localStorage.setItem("island_language", "en");
        assert.equal(formatRelativeTimestamp(0), "Recently opened");
      });

      it("invokes Tauri launch and flyout switch commands with expected payloads", async () => {
        const { launchWindowsApp, launchRecentFile, launchSystemTarget, switchFlyoutTarget } =
          taskbarLaunchService;

        const calls = [];
        mockIPC((cmd, args) => {
          calls.push({ cmd, args });
          return null;
        });

        await launchWindowsApp({
          lnk_path: "C:\\Links\\Code.lnk",
          target_path: "C:\\Code.exe",
          arguments: "--new-window",
        });
        await launchWindowsApp({});
        await launchRecentFile({
          id: "rec-1",
          name: "notes.md",
          path: "D:\\notes.md",
          lnk_path: "C:\\Recent\\notes.lnk",
          folder: "D:\\",
          modified_ts: 1700000000,
          kind: "markdown",
        });
        await launchSystemTarget("ms-settings:sound");
        await switchFlyoutTarget("quickSettings");

        assert.deepEqual(calls, [
          {
            cmd: "launch_pinned_app",
            args: {
              lnkPath: "C:\\Links\\Code.lnk",
              targetPath: "C:\\Code.exe",
              arguments: "--new-window",
            },
          },
          {
            cmd: "launch_pinned_app",
            args: { lnkPath: "", targetPath: "", arguments: "" },
          },
          {
            cmd: "launch_pinned_app",
            args: {
              lnkPath: "C:\\Recent\\notes.lnk",
              targetPath: "D:\\notes.md",
              arguments: "",
            },
          },
          {
            cmd: "launch_target",
            args: { target: "ms-settings:sound" },
          },
          {
            cmd: "switch_taskbar_flyout_target",
            args: { target: "quickSettings" },
          },
        ]);
      });
    });

    describe("navbarThemeUtils", () => {
      it("loads cleanly without DOM and computes flyout position classes and motion offsets", () => {
        const { getInlineFlyoutPositionClass, getInlineFlyoutMotionOffset } = navbarThemeUtils;

        assert.equal(getInlineFlyoutPositionClass(), "bottom-full mb-3.5 right-4");
        assert.equal(getInlineFlyoutPositionClass("bottom"), "bottom-full mb-3.5 right-4");
        assert.equal(getInlineFlyoutPositionClass("top"), "top-full mt-3.5 right-4");
        assert.equal(getInlineFlyoutPositionClass("left"), "left-full ml-3.5 bottom-4");
        assert.equal(getInlineFlyoutPositionClass("right"), "right-full mr-3.5 bottom-4");
        assert.equal(
          getInlineFlyoutPositionClass("top", "left-2", "top-2"),
          "top-full mt-3.5 left-2"
        );
        assert.equal(
          getInlineFlyoutPositionClass("left", "left-2", "top-2"),
          "left-full ml-3.5 top-2"
        );

        assert.deepEqual(getInlineFlyoutMotionOffset(), { opacity: 0, y: 12, scale: 0.96 });
        assert.deepEqual(getInlineFlyoutMotionOffset("bottom"), {
          opacity: 0,
          y: 12,
          scale: 0.96,
        });
        assert.deepEqual(getInlineFlyoutMotionOffset("top"), { opacity: 0, y: -12, scale: 0.96 });
        assert.deepEqual(getInlineFlyoutMotionOffset("left"), { opacity: 0, x: -12, scale: 0.96 });
        assert.deepEqual(getInlineFlyoutMotionOffset("right"), { opacity: 0, x: 12, scale: 0.96 });
      });
    });
  });
}

if (process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url) {
  let loader;
  before(async () => {
    installBrowserShim();
    loader = await createViteSsrLoader();
  });
  after(async () => {
    await loader?.close();
  });
  registerTaskbarSuites(() => loader);
}
