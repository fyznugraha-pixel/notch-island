export function matchesAppId(appId: string, processName: string, title?: string): boolean {
  const p = processName.toLowerCase();
  const t = (title || "").toLowerCase();
  switch (appId) {
    case "gili":
      return p === "gili.exe" || p === "gili";
    case "explorer":
      return p.includes("explorer");
    case "chrome":
      return p.includes("chrome");
    case "brave":
      return p.includes("brave");
    case "vscode":
      return p.includes("code");
    case "terminal":
      return (
        p.includes("windowsterminal") ||
        p.includes("cmd") ||
        p.includes("powershell")
      );
    case "settings":
      return (
        p.includes("systemsettings") ||
        (p.includes("applicationframehost") &&
          (t.includes("settings") || t.includes("pengaturan") || t.includes("setelan")))
      );
    case "spotify":
      return p.includes("spotify");
    case "discord":
      return p.includes("discord");
    case "whatsapp":
      return p.includes("whatsapp");
    default:
      return (
        p.includes(appId.toLowerCase()) ||
        appId.toLowerCase().includes(p.replace(/\.exe$/i, ""))
      );
  }
}

export function getRunningAppMeta(
  processName: string,
  title: string
): { id: string; name: string; iconType?: any } {
  const p = processName.toLowerCase();
  const t = title.toLowerCase();

  // 1. Well-known executable names take highest priority
  if (p.includes("discord")) return { id: "discord", name: "Discord", iconType: "discord" };
  if (p.includes("spotify")) return { id: "spotify", name: "Spotify", iconType: "spotify" };
  if (p.includes("whatsapp")) return { id: "whatsapp", name: "WhatsApp", iconType: "whatsapp" };
  if (p.includes("brave")) return { id: "brave", name: "Brave", iconType: "brave" };
  if (p.includes("chrome")) return { id: "chrome", name: "Google Chrome", iconType: "browser" };
  if (p.includes("code")) return { id: "vscode", name: "Visual Studio Code", iconType: "code" };
  if (p.includes("explorer")) return { id: "explorer", name: "File Explorer", iconType: "folder" };
  if (p.includes("terminal") || p.includes("cmd") || p.includes("powershell")) {
    return { id: "terminal", name: "Terminal", iconType: "terminal" };
  }
  if (
    p.includes("systemsettings") ||
    (p.includes("applicationframehost") &&
      (t.includes("settings") || t.includes("pengaturan") || t.includes("setelan")))
  ) {
    return { id: "settings", name: "Settings", iconType: "settings" };
  }
  if (p === "gili.exe" || p === "gili") {
    return { id: "gili", name: "Gili Settings", iconType: "gili" };
  }

  const cleanName = processName.replace(/\.exe$/i, "");
  const capitalized = cleanName.charAt(0).toUpperCase() + cleanName.slice(1);
  const friendlyTitle = title.split(" - ")[0] || capitalized;
  return { id: cleanName.toLowerCase(), name: friendlyTitle };
}

