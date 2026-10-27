import { resolveAppLogo } from "../src/utils/appLogoResolver.ts";

interface TestCase {
  name: string;
  run: () => void;
}

const testCases: TestCase[] = [];

function it(name: string, fn: () => void) {
  testCases.push({ name, run: fn });
}

function expectEqual<T>(actual: T, expected: T, msg?: string) {
  const a = JSON.stringify(actual);
  const b = JSON.stringify(expected);
  if (a !== b) {
    throw new Error(`${msg || "Assertion failed"}: expected ${b}, got ${a}`);
  }
}

function expectTrue(val: boolean, msg?: string) {
  if (!val) throw new Error(msg || "Expected true, got false");
}

it("Case 1: Resolves WhatsApp and WhatsApp Web logo", () => {
  const r1 = resolveAppLogo("WhatsApp");
  expectEqual(r1.logoUrl, "/logo/whatsapp.svg");
  expectEqual(r1.color, "#25D366");

  const r2 = resolveAppLogo("WhatsApp Web");
  expectEqual(r2.logoUrl, "/logo/whatsapp.svg");
  expectEqual(r2.color, "#25D366");

  const r3 = resolveAppLogo(undefined, "whatsapp");
  expectEqual(r3.logoUrl, "/logo/whatsapp.svg");
});

it("Case 2: Resolves Telegram logo", () => {
  const r = resolveAppLogo("Telegram");
  expectEqual(r.logoUrl, "/logo/telegram.svg");
  expectEqual(r.color, "#229ED9");
});

it("Case 3: Resolves Web Browsers logos", () => {
  const chrome = resolveAppLogo("Google Chrome");
  expectEqual(chrome.logoUrl, "/logo/chrome.png");

  const edge = resolveAppLogo("Microsoft Edge");
  expectEqual(edge.logoUrl, "/logo/edge.png");

  const brave = resolveAppLogo("Brave");
  expectEqual(brave.logoUrl, "/logo/brave.png");

  const firefox = resolveAppLogo("Firefox");
  expectEqual(firefox.logoUrl, "/logo/firefox.png");
});

it("Case 4: Resolves Social & Entertainment logos", () => {
  const discord = resolveAppLogo("Discord");
  expectEqual(discord.logoUrl, "/logo/discord.webp");

  const ig = resolveAppLogo("Instagram");
  expectEqual(ig.logoUrl, "/logo/Instagram_icon.png");

  const yt = resolveAppLogo("YouTube");
  expectEqual(yt.logoUrl, "/logo/youtube.png");

  const ytm = resolveAppLogo("YouTube Music");
  expectEqual(ytm.logoUrl, "/logo/youtube-music.png");

  const spot = resolveAppLogo("Spotify");
  expectEqual(spot.logoUrl, "/logo/spotify.png");

  const netflix = resolveAppLogo("Netflix");
  expectEqual(netflix.logoUrl, "/logo/Netflix_icon.svg.webp");

  const reddit = resolveAppLogo("Reddit");
  expectEqual(reddit.logoUrl, "/logo/reddit.png");
});

it("Case 5: Resolves Gili Island logo", () => {
  const gili = resolveAppLogo("Gili Island");
  expectEqual(gili.logoUrl, "/gili-icons/app-icon/png/gili-app-icon-64.png");
  expectEqual(gili.color, "#3882F6");
});

it("Case 6: System fallback icons", () => {
  const clip = resolveAppLogo("Clipboard", "clipboard");
  expectEqual(clip.fallbackGlyph, "clipboard");

  const bat = resolveAppLogo("Battery", "battery");
  expectEqual(bat.fallbackGlyph, "battery");

  const pomo = resolveAppLogo("Pomodoro", "reminder");
  expectEqual(pomo.fallbackGlyph, "reminder");
});

// Run all tests
let passed = 0;
for (const tc of testCases) {
  try {
    tc.run();
    console.log(`  ✓ ${tc.name}`);
    passed++;
  } catch (err) {
    console.error(`  ✗ ${tc.name}:`, err);
    process.exit(1);
  }
}
console.log(`\nResult: ${passed}/${testCases.length} tests passed.`);
