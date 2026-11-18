import { invoke } from "@tauri-apps/api/core";
import {
  DEFAULT_NAVBAR_CONFIG,
  NAVBAR_ACCENT_COLORS,
  NavbarBackground,
  NavbarConfig,
  NavbarIconSpacing,
  NavbarIconTheme,
  NavbarShape,
  NavbarStyle,
  VALID_NAVBAR_ICON_THEMES,
} from "../types/navbar";
import { isValidHex, normalizeHex } from "../utils/colorUtils";

export const NAVBAR_STYLE_SHARE_PREFIX = "GILI-STYLE1:";
export const NAVBAR_STYLE_FILE_FORMAT = "gili-taskbar-style";
export const NAVBAR_STYLE_MAX_BYTES = 64 * 1024;

export const NAVBAR_STYLE_KEYS = [
  "shape",
  "cornerRadius",
  "distanceFromEdge",
  "taskbarHeight",
  "iconSize",
  "iconSpacing",
  "style",
  "background",
  "customColor",
  "accent",
  "opacity",
  "blur",
  "iconTheme",
  "magnify",
  "appLabels",
] as const;

export type NavbarStyleKey = (typeof NAVBAR_STYLE_KEYS)[number];
export type NavbarStylePatch = Pick<NavbarConfig, NavbarStyleKey>;

export interface ParsedNavbarStyleShare {
  name?: string;
  style: NavbarStylePatch;
  recognizedFields: number;
}

export type NavbarStyleShareErrorCode =
  | "EMPTY"
  | "TOO_LARGE"
  | "INVALID_FORMAT"
  | "UNSUPPORTED_VERSION"
  | "NO_STYLE_FIELDS";

export class NavbarStyleShareError extends Error {
  readonly code: NavbarStyleShareErrorCode;

  constructor(code: NavbarStyleShareErrorCode, message: string) {
    super(message);
    this.code = code;
  }
}

interface EncodedStyleEnvelope {
  v: 1;
  n?: string;
  s: Partial<NavbarStylePatch>;
}

function clampInt(raw: unknown, min: number, max: number, fallback: number): number {
  if (typeof raw !== "number" || !Number.isFinite(raw)) return fallback;
  return Math.round(Math.min(Math.max(raw, min), max));
}

function sanitizeStyleName(raw: unknown): string | undefined {
  if (typeof raw !== "string") return undefined;
  const cleaned = raw.replace(/[\u0000-\u001f\u007f]/g, "").trim().slice(0, 48);
  return cleaned || undefined;
}

function sanitizeHexOption(raw: unknown, fallback: string): string | null {
  if (typeof raw !== "string" || !isValidHex(raw)) return null;
  return normalizeHex(raw) || fallback;
}

function encodeUtf8Base64Url(text: string): string {
  const bytes = new TextEncoder().encode(text);
  let binary = "";
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function decodeUtf8Base64Url(token: string): string {
  const padded = token
    .replace(/-/g, "+")
    .replace(/_/g, "/")
    .padEnd(token.length + ((4 - (token.length % 4)) % 4), "=");
  const binary = atob(padded);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
}

// Strict allowlist ensures imported presets only alter visual dock appearance & effects
export function sanitizeNavbarStylePatch(
  raw: Record<string, unknown>,
  fallbackConfig: Partial<NavbarConfig> = DEFAULT_NAVBAR_CONFIG
): { style: NavbarStylePatch; recognizedFields: number } {
  let recognizedFields = 0;
  for (const key of NAVBAR_STYLE_KEYS) {
    if (Object.prototype.hasOwnProperty.call(raw, key) && raw[key] !== undefined) {
      recognizedFields++;
    }
  }

  const fbShape: NavbarShape = fallbackConfig.shape === "anchored" ? "anchored" : "floating";
  const shape: NavbarShape =
    raw.shape === "anchored" || raw.shape === "floating" ? raw.shape : fbShape;

  const fbStyle: NavbarStyle =
    fallbackConfig.style === "liquid" || fallbackConfig.style === "followNotch"
      ? fallbackConfig.style
      : "solid";
  let style: NavbarStyle =
    raw.style === "solid" || raw.style === "liquid" || raw.style === "followNotch"
      ? raw.style
      : fbStyle;

  const fbBg: NavbarBackground =
    fallbackConfig.background === "followNotch" || fallbackConfig.background === "custom"
      ? fallbackConfig.background
      : "black";
  let background: NavbarBackground =
    raw.background === "black" || raw.background === "followNotch" || raw.background === "custom"
      ? raw.background
      : fbBg;

  if (style === "followNotch" || background === "followNotch") {
    style = "followNotch";
    background = "followNotch";
  }

  const fbSpacing: NavbarIconSpacing =
    fallbackConfig.iconSpacing === "normal" || fallbackConfig.iconSpacing === "roomy"
      ? fallbackConfig.iconSpacing
      : "tight";
  const iconSpacing: NavbarIconSpacing =
    raw.iconSpacing === "tight" || raw.iconSpacing === "normal" || raw.iconSpacing === "roomy"
      ? raw.iconSpacing
      : fbSpacing;

  const fbIconTheme: NavbarIconTheme =
    typeof fallbackConfig.iconTheme === "string" &&
    VALID_NAVBAR_ICON_THEMES.has(fallbackConfig.iconTheme as NavbarIconTheme)
      ? (fallbackConfig.iconTheme as NavbarIconTheme)
      : DEFAULT_NAVBAR_CONFIG.iconTheme;
  const iconTheme: NavbarIconTheme =
    typeof raw.iconTheme === "string" &&
    VALID_NAVBAR_ICON_THEMES.has(raw.iconTheme as NavbarIconTheme)
      ? (raw.iconTheme as NavbarIconTheme)
      : fbIconTheme;

  const fbAccent =
    sanitizeHexOption(fallbackConfig.accent, NAVBAR_ACCENT_COLORS[0]) ?? NAVBAR_ACCENT_COLORS[0];
  const accent = sanitizeHexOption(raw.accent, fbAccent) ?? fbAccent;

  const fbCustomColor =
    typeof fallbackConfig.customColor === "string"
      ? sanitizeHexOption(fallbackConfig.customColor, "#0f172a")
      : null;
  let customColor =
    raw.customColor === null
      ? null
      : typeof raw.customColor === "string"
      ? sanitizeHexOption(raw.customColor, "#0f172a") ?? fbCustomColor
      : fbCustomColor;
  if (background === "custom" && !customColor) {
    customColor = "#0f172a";
  }

  return {
    recognizedFields,
    style: {
      shape,
      cornerRadius: clampInt(
        raw.cornerRadius,
        0,
        30,
        clampInt(fallbackConfig.cornerRadius, 0, 30, DEFAULT_NAVBAR_CONFIG.cornerRadius)
      ),
      distanceFromEdge: clampInt(
        raw.distanceFromEdge,
        0,
        40,
        clampInt(fallbackConfig.distanceFromEdge, 0, 40, DEFAULT_NAVBAR_CONFIG.distanceFromEdge)
      ),
      taskbarHeight: clampInt(
        raw.taskbarHeight,
        36,
        64,
        clampInt(fallbackConfig.taskbarHeight, 36, 64, DEFAULT_NAVBAR_CONFIG.taskbarHeight)
      ),
      iconSize: clampInt(
        raw.iconSize,
        24,
        56,
        clampInt(fallbackConfig.iconSize, 24, 56, DEFAULT_NAVBAR_CONFIG.iconSize)
      ),
      iconSpacing,
      style,
      background,
      customColor,
      accent,
      opacity: clampInt(
        raw.opacity,
        20,
        100,
        clampInt(fallbackConfig.opacity, 20, 100, DEFAULT_NAVBAR_CONFIG.opacity)
      ),
      blur: clampInt(
        raw.blur,
        0,
        100,
        clampInt(fallbackConfig.blur, 0, 100, DEFAULT_NAVBAR_CONFIG.blur)
      ),
      iconTheme,
      magnify:
        typeof raw.magnify === "boolean"
          ? raw.magnify
          : typeof fallbackConfig.magnify === "boolean"
          ? fallbackConfig.magnify
          : DEFAULT_NAVBAR_CONFIG.magnify,
      appLabels:
        typeof raw.appLabels === "boolean"
          ? raw.appLabels
          : typeof fallbackConfig.appLabels === "boolean"
          ? fallbackConfig.appLabels
          : DEFAULT_NAVBAR_CONFIG.appLabels,
    },
  };
}

export function extractNavbarStyle(config: Partial<NavbarConfig>): NavbarStylePatch {
  return sanitizeNavbarStylePatch(config as Record<string, unknown>, config).style;
}

export function encodeNavbarStyleCode(config: Partial<NavbarConfig>, name?: string): string {
  const cleanName = sanitizeStyleName(name);
  const payload: EncodedStyleEnvelope = {
    v: 1,
    ...(cleanName ? { n: cleanName } : {}),
    s: extractNavbarStyle(config),
  };
  return `${NAVBAR_STYLE_SHARE_PREFIX}${encodeUtf8Base64Url(JSON.stringify(payload))}`;
}

export function serializeNavbarStyleFile(config: Partial<NavbarConfig>, name?: string): string {
  const cleanName = sanitizeStyleName(name) || "Gili Taskbar Style";
  return JSON.stringify(
    {
      format: NAVBAR_STYLE_FILE_FORMAT,
      version: 1,
      name: cleanName,
      exportedAt: new Date().toISOString(),
      style: extractNavbarStyle(config),
    },
    null,
    2
  );
}

function stripOuterWrapper(raw: string): string {
  let text = raw.trim();
  if (
    (text.startsWith("`") && text.endsWith("`")) ||
    (text.startsWith('"') && text.endsWith('"')) ||
    (text.startsWith("'") && text.endsWith("'"))
  ) {
    text = text.slice(1, -1).trim();
  }
  return text;
}

export function parseNavbarStyleShareInput(
  rawInput: string,
  fallbackConfig: Partial<NavbarConfig> = DEFAULT_NAVBAR_CONFIG
): ParsedNavbarStyleShare {
  if (!rawInput || !rawInput.trim()) {
    throw new NavbarStyleShareError("EMPTY", "Style input is empty.");
  }
  if (rawInput.length > NAVBAR_STYLE_MAX_BYTES) {
    throw new NavbarStyleShareError("TOO_LARGE", "Style input exceeds 64 KB limit.");
  }

  const trimmed = stripOuterWrapper(rawInput);
  if (trimmed.startsWith(NAVBAR_STYLE_SHARE_PREFIX)) {
    const token = trimmed.slice(NAVBAR_STYLE_SHARE_PREFIX.length).replace(/\s+/g, "");
    if (!token) {
      throw new NavbarStyleShareError("INVALID_FORMAT", "Missing share payload.");
    }
    let decoded: unknown;
    try {
      decoded = JSON.parse(decodeUtf8Base64Url(token));
    } catch {
      throw new NavbarStyleShareError("INVALID_FORMAT", "Corrupt or invalid Gili style code.");
    }
    if (!decoded || typeof decoded !== "object" || Array.isArray(decoded)) {
      throw new NavbarStyleShareError("INVALID_FORMAT", "Invalid encoded style object.");
    }
    const env = decoded as Record<string, unknown>;
    if (env.v !== 1) {
      throw new NavbarStyleShareError("UNSUPPORTED_VERSION", "Unsupported Gili style version.");
    }
    if (!env.s || typeof env.s !== "object" || Array.isArray(env.s)) {
      throw new NavbarStyleShareError("INVALID_FORMAT", "Missing style data in code.");
    }
    const { style, recognizedFields } = sanitizeNavbarStylePatch(
      env.s as Record<string, unknown>,
      fallbackConfig
    );
    if (recognizedFields < 2) {
      throw new NavbarStyleShareError("NO_STYLE_FIELDS", "No valid taskbar style fields found.");
    }
    return {
      name: sanitizeStyleName(env.n),
      style,
      recognizedFields,
    };
  }

  let jsonObj: unknown;
  try {
    jsonObj = JSON.parse(trimmed);
  } catch {
    throw new NavbarStyleShareError("INVALID_FORMAT", "Unrecognized Gili style code or JSON.");
  }
  if (!jsonObj || typeof jsonObj !== "object" || Array.isArray(jsonObj)) {
    throw new NavbarStyleShareError("INVALID_FORMAT", "Style JSON must be an object.");
  }

  const doc = jsonObj as Record<string, unknown>;
  let rawStyleObj: Record<string, unknown> | null = null;
  let styleName = sanitizeStyleName(doc.name) ?? sanitizeStyleName(doc.title);

  if (doc.format === NAVBAR_STYLE_FILE_FORMAT) {
    if (typeof doc.version === "number" && doc.version !== 1) {
      throw new NavbarStyleShareError("UNSUPPORTED_VERSION", "Unsupported style file version.");
    }
    if (doc.style && typeof doc.style === "object" && !Array.isArray(doc.style)) {
      rawStyleObj = doc.style as Record<string, unknown>;
    }
  } else if (doc.style && typeof doc.style === "object" && !Array.isArray(doc.style)) {
    rawStyleObj = doc.style as Record<string, unknown>;
  } else if (doc.config && typeof doc.config === "object" && !Array.isArray(doc.config)) {
    rawStyleObj = doc.config as Record<string, unknown>;
  } else {
    rawStyleObj = doc;
  }

  if (!rawStyleObj) {
    throw new NavbarStyleShareError("INVALID_FORMAT", "Missing style properties.");
  }

  const { style, recognizedFields } = sanitizeNavbarStylePatch(rawStyleObj, fallbackConfig);
  if (recognizedFields < 2) {
    throw new NavbarStyleShareError("NO_STYLE_FIELDS", "No valid taskbar style fields found.");
  }
  return {
    name: styleName,
    style,
    recognizedFields,
  };
}

export async function exportNavbarStyleToFile(
  config: Partial<NavbarConfig>,
  name?: string
): Promise<"saved" | "cancelled"> {
  const cleanName = sanitizeStyleName(name) || "gili-taskbar-style";
  const content = serializeNavbarStyleFile(config, cleanName);

  try {
    const saved = await invoke<boolean>("save_navbar_style_file", {
      defaultName: cleanName,
      content,
    });
    return saved ? "saved" : "cancelled";
  } catch (err) {
    // Fallback to browser Blob download when running outside Tauri runtime
    if (typeof window !== "undefined" && !(window as any).__TAURI_INTERNALS__) {
      const slug = cleanName.toLowerCase().replace(/[^a-z0-9-_]+/g, "-") || "gili-taskbar-style";
      const blob = new Blob([content], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${slug}.gilistyle`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      window.setTimeout(() => URL.revokeObjectURL(url), 1000);
      return "saved";
    }
    throw err;
  }
}
