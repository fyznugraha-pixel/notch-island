import { Component, ErrorInfo, ReactNode, Suspense, lazy } from "react";
import ReactDOM from "react-dom/client";
import { getCurrentWindow } from "@tauri-apps/api/window";
import "@fontsource/inter/latin-400.css";
import "@fontsource/inter/latin-500.css";
import "@fontsource/inter/latin-600.css";
import "@fontsource/inter/latin-700.css";
import "./App.css";
import "./index.css";
import { getLanguage } from "./services/languageStore";

const App = lazy(() => import("./App"));
const SettingsWindowApp = lazy(() =>
  import("./components/settingsWindow/SettingsWindowApp").then((m) => ({
    default: m.SettingsWindowApp,
  }))
);
const NavbarApp = lazy(() =>
  import("./components/navbar/NavbarApp").then((m) => ({
    default: m.NavbarApp,
  }))
);
const TaskbarFlyoutApp = lazy(() =>
  import("./components/taskbarFlyout/TaskbarFlyoutApp").then((m) => ({
    default: m.TaskbarFlyoutApp,
  }))
);
const MiniPlayerApp = lazy(() =>
  import("./components/miniplayer/MiniPlayerApp").then((m) => ({
    default: m.MiniPlayerApp,
  }))
);

const isNavbarWindow = (() => {
  if (typeof window === "undefined") return false;
  let result = false;
  if ((window as any).__IS_NAVBAR_WINDOW__ === true) {
    result = true;
  } else if ((window as any).__TAURI_INTERNALS__?.metadata?.currentWindow?.label === "navbar") {
    result = true;
  } else {
    try {
      if (getCurrentWindow().label === "navbar") {
        result = true;
      }
    } catch {}
    if (!result) {
      result =
        new URLSearchParams(window.location.search).get("window") === "navbar" ||
        window.location.search.includes("window=navbar") ||
        window.location.href.includes("window=navbar");
    }
  }

  if (result) {
    document.documentElement.classList.add("navbar-window");
    if (document.body) {
      document.body.classList.add("navbar-window");
    } else {
      document.addEventListener("DOMContentLoaded", () => {
        document.body.classList.add("navbar-window");
      });
    }
  }
  return result;
})();

const isSettingsWindow = (() => {
  if (typeof window === "undefined") return false;
  let result = false;
  if ((window as any).__IS_SETTINGS_WINDOW__ === true) {
    result = true;
  } else if ((window as any).__TAURI_INTERNALS__?.metadata?.currentWindow?.label === "settings") {
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

const isTaskbarFlyoutWindow = (() => {
  if (typeof window === "undefined") return false;
  let result = false;
  if ((window as any).__IS_TASKBAR_FLYOUT_WINDOW__ === true) {
    result = true;
  } else if (
    (window as any).__TAURI_INTERNALS__?.metadata?.currentWindow?.label ===
    "taskbar_flyout"
  ) {
    result = true;
  } else {
    try {
      if (getCurrentWindow().label === "taskbar_flyout") {
        result = true;
      }
    } catch {}
    if (!result) {
      result =
        new URLSearchParams(window.location.search).get("window") === "flyout" ||
        window.location.search.includes("window=flyout") ||
        window.location.href.includes("window=flyout");
    }
  }

  if (result) {
    const flyoutWin = window as unknown as {
      __setTaskbarFlyoutState?: (target: string, theme?: "solid" | "liquid") => void;
      __resetTaskbarFlyoutState?: () => void;
      __PENDING_TASKBAR_FLYOUT__?: { target?: string; theme?: "solid" | "liquid" };
    };
    if (!flyoutWin.__setTaskbarFlyoutState) {
      flyoutWin.__setTaskbarFlyoutState = (target, theme) => {
        flyoutWin.__PENDING_TASKBAR_FLYOUT__ = { target, theme };
      };
    }
    if (!flyoutWin.__resetTaskbarFlyoutState) {
      flyoutWin.__resetTaskbarFlyoutState = () => {
        delete flyoutWin.__PENDING_TASKBAR_FLYOUT__;
      };
    }
    document.documentElement.classList.add("flyout-window");
    if (document.body) {
      document.body.classList.add("flyout-window");
    } else {
      document.addEventListener("DOMContentLoaded", () => {
        document.body.classList.add("flyout-window");
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
          title={getLanguage() === "id" ? "Klik untuk memulihkan" : "Click to recover"}
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
    <Suspense fallback={null}>
      {isNavbarWindow ? (
        <NavbarApp />
      ) : isSettingsWindow ? (
        <SettingsWindowApp />
      ) : isTaskbarFlyoutWindow ? (
        <TaskbarFlyoutApp />
      ) : isMiniPlayerWindow ? (
        <MiniPlayerApp />
      ) : (
        <App isSecondaryWindow={isSecondaryWindow} />
      )}
    </Suspense>
  </RootErrorBoundary>
);
