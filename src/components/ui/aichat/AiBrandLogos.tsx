import React from "react";
import { Server } from "lucide-react";
import type { AiProviderId } from "./AiChatTypes";

export interface AiBrandLogoProps {
  provider: AiProviderId | string;
  size?: number;
  className?: string;
  withContainer?: boolean;
}

export const LOGO_PATHS: Record<string, string> = {
  claude: "/assets/ai/claude.png",
  openai: "/assets/ai/openai.png",
  gemini: "/assets/ai/gemini.png",
  gemma: "/assets/ai/gemma.png",
  openrouter: "/assets/ai/openrouter.png",
  deepseek: "/assets/ai/deepseek.png",
  grok: "/assets/ai/grok.png",
  glm: "/assets/ai/glm.png",
  qwen: "/assets/ai/qwen.png",
  gwen: "/assets/ai/qwen.png",
  kimi: "/assets/ai/kimi.png",
  nemotron: "/assets/ai/nemotron.png",
  nvidia: "/assets/ai/nemotron.png",
  mistral: "/assets/ai/mistral.png",
  ministral: "/assets/ai/mistral.png",
  minstral: "/assets/ai/mistral.png",
  devstral: "/assets/ai/mistral.png",
  moonshot: "/assets/ai/moonshot.png",
  palmyra: "/assets/ai/palmyra.png",
  writer: "/assets/ai/palmyra.png",
  vscode: "/assets/ai/vscode.png",
  antigravity: "/assets/ai/antigravity.png",
};

/**
 * Detects the brand logo key from model ID, name, or provider.
 */
export function detectAiBrand(
  idOrName?: string,
  explicitProvider?: string
): string {
  const combined = (idOrName || "").toLowerCase();

  // 1. Direct model ID / name checks
  if (combined.includes("deepseek")) return "deepseek";
  if (combined.includes("claude") || combined.includes("anthropic")) return "claude";
  if (
    combined.includes("gpt") ||
    combined.includes("openai") ||
    combined.includes("o1") ||
    combined.includes("o3") ||
    combined.includes("o4") ||
    combined.includes("chatgpt")
  ) {
    return "openai";
  }
  if (combined.includes("gemma")) return "gemma";
  if (combined.includes("gemini")) return "gemini";
  if (combined.includes("grok") || combined.includes("xai")) return "grok";
  if (combined.includes("glm") || combined.includes("zhipu")) return "glm";
  if (combined.includes("qwen") || combined.includes("gwen") || combined.includes("tongyi")) return "qwen";
  if (combined.includes("kimi")) return "kimi";
  if (combined.includes("moonshot")) return "moonshot";
  if (combined.includes("palmyra") || combined.includes("writer")) return "palmyra";
  if (combined.includes("nemotron") || combined.includes("nvidia")) return "nemotron";
  if (
    combined.includes("mistral") ||
    combined.includes("ministral") ||
    combined.includes("minstral") ||
    combined.includes("devstral") ||
    combined.includes("magistral") ||
    combined.includes("mixtral") ||
    combined.includes("codestral")
  ) {
    return "mistral";
  }

  // 2. Explicit provider fallback
  if (explicitProvider && explicitProvider !== "custom" && explicitProvider !== "openrouter") {
    return explicitProvider;
  }

  return explicitProvider || "custom";
}

export const AiBrandLogo: React.FC<AiBrandLogoProps> = ({
  provider,
  size = 24,
  className = "",
  withContainer = false,
}) => {
  const norm = (provider || "").toLowerCase();

  if (norm === "custom") {
    const iconSize = Math.max(12, Math.round(size * 0.55));
    return (
      <span
        style={{ width: size, height: size }}
        className={`rounded-[9px] bg-gradient-to-tr from-blue-600 to-indigo-600 text-white flex items-center justify-center shrink-0 shadow-sm select-none ${className}`}
      >
        <Server size={iconSize} strokeWidth={2.2} />
      </span>
    );
  }

  const src = LOGO_PATHS[norm] || LOGO_PATHS.claude;

  // Solid/filled dark or colored logos that already have a built-in background
  const isSelfContained =
    norm === "claude" ||
    norm === "glm" ||
    norm === "kimi" ||
    norm === "palmyra" ||
    norm === "writer" ||
    norm === "nemotron" ||
    norm === "nvidia";

  if (withContainer && !isSelfContained) {
    const innerSize = Math.round(size * 0.68);
    return (
      <span
        style={{ width: size, height: size }}
        className={`rounded-[9px] bg-[#f4f4f5] flex items-center justify-center shrink-0 shadow-sm overflow-hidden ${className}`}
      >
        <img
          src={src}
          alt={norm}
          style={{ width: innerSize, height: innerSize }}
          className="object-contain block select-none pointer-events-none"
        />
      </span>
    );
  }

  return (
    <img
      src={src}
      alt={norm}
      style={{ width: size, height: size }}
      className={`object-cover block shrink-0 select-none pointer-events-none rounded-[9px] shadow-sm ${className}`}
    />
  );
};
