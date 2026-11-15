export type Language = "en" | "id";

export function getLanguage(): Language {
  try {
    const saved = localStorage.getItem("island_language");
    if (saved === "en" || saved === "id") return saved;
  } catch {}

  if (typeof navigator !== "undefined" && navigator.language?.toLowerCase().startsWith("id")) {
    return "id";
  }
  return "en";
}

export function setLanguage(lang: Language, autoReload = false) {
  try {
    localStorage.setItem("island_language", lang);
    if (typeof window !== "undefined") {
      window.dispatchEvent(new CustomEvent("island_language_changed", { detail: lang }));
    }
  } catch {}

  if (autoReload && typeof window !== "undefined") {
    setTimeout(() => {
      window.location.reload();
    }, 150);
  }
}
