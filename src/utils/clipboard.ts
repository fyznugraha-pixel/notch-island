import { readText, writeText } from "@tauri-apps/plugin-clipboard-manager";

export async function copyTextToClipboard(text: string): Promise<boolean> {
  if (!text) return false;
  try {
    await writeText(text);
    return true;
  } catch {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch {
      return false;
    }
  }
}

export async function readTextFromClipboard(): Promise<string | null> {
  try {
    const tauriText = await readText();
    if (typeof tauriText === "string") return tauriText;
  } catch {}
  try {
    if (typeof navigator !== "undefined" && navigator.clipboard?.readText) {
      return await navigator.clipboard.readText();
    }
  } catch {}
  return null;
}
