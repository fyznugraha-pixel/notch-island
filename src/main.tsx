import { Component, ErrorInfo, ReactNode } from "react";
import ReactDOM from "react-dom/client";
import { getCurrentWindow } from "@tauri-apps/api/window";
import "@fontsource/inter/400.css";
import "@fontsource/inter/500.css";
import "@fontsource/inter/600.css";
import "@fontsource/inter/700.css";
import "./App.css";
import "./index.css";
import App from "./App";
import { SettingsWindowApp } from "./components/settingsWindow/SettingsWindowApp";
import { MiniPlayerApp } from "./components/miniplayer/MiniPlayerApp";
import { getLanguage } from "./services/i18n";

const isSettingsWindow = (() => {
  if (typeof window === "undefined") return false;
  let result = false;
  if ((window as any).__IS_SETTINGS_WINDOW__ === true) {
    result = true;
  } else {
    try {
      if (getCurrentWindow().label === "settings") {
        result = true;
      }
    } catch {}
    if (!result) {
      result =
        new URLSearchParams(window.location.search).get("window") === "settings" ||
        window.location.search.includes("window=settings") ||
        window.location.href.includes("window=settings");
    }
  }

  if (result) {
    document.documentElement.classList.add("settings-window");
    if (document.body) {
      document.body.classList.add("settings-window");
    } else {
      document.addEventListener("DOMContentLoaded", () => {
        document.body.classList.add("settings-window");
      });
    }
  }
  return result;
})();

const isSecondaryWindow = (() => {
  if (typeof window === "undefined") return false;
  if ((window as any).__IS_SECONDARY_NOTCH_WINDOW__ === true) {
    return true;
  }
  try {
    if (getCurrentWindow().label.startsWith("notch_secondary_")) {
      return true;
    }
  } catch {}
  const params = new URLSearchParams(window.location.search);
  return (
    params.get("window") === "secondary" ||
    window.location.search.includes("window=secondary") ||
    window.location.href.includes("window=secondary")
  );
})();

const isMiniPlayerWindow = (() => {
  if (typeof window === "undefined") return false;
  if ((window as any).__IS_MINIPLAYER_WINDOW__ === true) {
    return true;
  }
  try {
    if (getCurrentWindow().label === "miniplayer") {
      return true;
    }
  } catch {}
  const params = new URLSearchParams(window.location.search);
  return (
    params.get("window") === "miniplayer" ||
    window.location.search.includes("window=miniplayer") ||
    window.location.href.includes("window=miniplayer")
  );
})();

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  error?: Error;
}

class RootErrorBoundary extends Component<Props, State> {
  public state: State = { hasError: false };

  public static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error("Uncaught error in Gili:", error, errorInfo);
  }

  public render() {
    if (this.state.hasError) {
      return (
        <div
          onClick={() => this.setState({ hasError: false })}
          className="fixed top-0 left-1/2 -translate-x-1/2 bg-black/90 text-white/80 text-[11px] px-3 py-1 rounded-b-lg border border-red-500/30 cursor-pointer shadow-lg select-none"
        >
          {getLanguage() === "id" ? "Notch Error (klik untuk memulihkan)" : "Notch Error (click to recover)"}
        </div>
      );
    }
    return this.props.children;
  }
}

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <RootErrorBoundary>
    {isSettingsWindow ? (
      <SettingsWindowApp />
    ) : isMiniPlayerWindow ? (
      <MiniPlayerApp />
    ) : (
      <App isSecondaryWindow={isSecondaryWindow} />
    )}
  </RootErrorBoundary>
);
