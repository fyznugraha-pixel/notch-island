import { Component, ErrorInfo, ReactNode } from "react";
import ReactDOM from "react-dom/client";
import "@fontsource/inter/400.css";
import "@fontsource/inter/500.css";
import "@fontsource/inter/600.css";
import "@fontsource/inter/700.css";
import "./App.css";
import "./index.css";
import App from "./App";

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
    console.error("Uncaught error in Notch Island:", error, errorInfo);
  }

  public render() {
    if (this.state.hasError) {
      return (
        <div 
          onClick={() => this.setState({ hasError: false })}
          className="fixed top-0 left-1/2 -translate-x-1/2 bg-black/90 text-white/80 text-[11px] px-3 py-1 rounded-b-lg border border-red-500/30 cursor-pointer shadow-lg select-none"
          title="Click to recover"
        >
          Notch Error (click to recover)
        </div>
      );
    }
    return this.props.children;
  }
}

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <RootErrorBoundary>
    <App />
  </RootErrorBoundary>
);
