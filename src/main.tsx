import { Component, ErrorInfo, lazy, ReactNode, Suspense } from "react";
import ReactDOM from "react-dom/client";
import { getCurrentWindow } from "@tauri-apps/api/window";
import "@fontsource/inter/400.css";
import "@fontsource/inter/500.css";
import "@fontsource/inter/600.css";
import "@fontsource/inter/700.css";
import "./App.css";
import "./index.css";
import { getLanguage } from "./services/i18n";

const App = lazy(() => import("./App"));
const SettingsWindowApp = lazy(() =>
  import("./components/settingsWindow/SettingsWindowApp").then((m) => ({
    default: m.SettingsWindowApp,
  }))
);

const isSettingsWindow = (() => {
  if (typeof window === "undefined") return false;
  const searchParams = new URLSearchParams(window.location.search);
  const fromUrl =
    searchParams.get("window") === "settings" ||
    window.location.search.includes("window=settings") ||
    window.location.href.includes("window=settings");
  if (fromUrl) {
    document.documentElement.classList.add("settings-window");
    return true;
  }
  try {
    if (getCurrentWindow().label === "settings") {
      document.documentElement.classList.add("settings-window");
      return true;
    }
  } catch {}
  return false;
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
      {isSettingsWindow ? <SettingsWindowApp /> : <App />}
    </Suspense>
  </RootErrorBoundary>
);
