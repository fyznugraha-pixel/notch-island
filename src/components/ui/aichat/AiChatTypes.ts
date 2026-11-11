export type AiProviderId =
  | "claude"
  | "openai"
  | "gemini"
  | "openrouter"
  | "deepseek"
  | "grok"
  | "custom";

export type AutoCleanupDays = 0 | 3 | 7 | 30;

export interface AiModelConfig {
  id: string;
  name: string;
  provider: AiProviderId;
  description: string;
  tier: "Max" | "Medium" | "Fast";
  inputCostPer1M: number; // in USD
  outputCostPer1M: number; // in USD
}

export interface AiMessageContext {
  type: "clipboard" | "window" | "image";
  title?: string;
  characterCount?: number;
  previewText?: string;
  imageDataUrl?: string;
}

export type RouterTier = "T0" | "T1" | "T2";
export type ResponseLengthMode = "auto" | "compact" | "normal" | "detailed";

export interface ModelPricingConfig {
  modelId: string;
  provider: AiProviderId;
  inputCostPer1M: number;
  outputCostPer1M: number;
  isCustomPrice?: boolean;
}

export interface RouterTierTarget {
  provider: AiProviderId;
  modelId: string;
  modelName?: string;
}

export interface RouterConfig {
  enabled: boolean;
  selectedMode: "auto" | string; // "auto" or specific modelId
  defaultLength: ResponseLengthMode;
  tierMapping: Record<RouterTier, RouterTierTarget>;
  enableStage2Classifier: boolean;
  confidenceThreshold: number;
  historyWindowSize: number;
  budget: {
    monthlyLimitIdr: number;
    warnAtPercent: number;
    actionOnLimit: "warn" | "downgrade_to_t0" | "block";
  };
}

export interface AiChatMessage {
  id: string;
  role: "user" | "assistant" | "system";
  content: string;
  reasoning?: string;
  timestamp: number;
  tokens?: number;
  context?: AiMessageContext;
  error?: string;
  provider?: AiProviderId;
  modelId?: string;
  modelName?: string;
  tier?: RouterTier;
  lengthMode?: ResponseLengthMode;
  isAutoRouted?: boolean;
  estimatedCostIdr?: number;
  isTruncated?: boolean;
  notchActions?: Array<{
    type: string;
    success: boolean;
    message: string;
    tabTarget?: string;
  }>;
}

export interface AiConversation {
  id: string;
  title: string;
  modelId: string;
  providerId: AiProviderId;
  messages: AiChatMessage[];
  createdAt: number;
  updatedAt: number;
  totalTokens: number;
}

export interface AiTokenDailyUsage {
  date: string; // YYYY-MM-DD
  dayLabel: string; // Rab, Kam, etc.
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
}

export interface AiUsageStats {
  todayTokens: number;
  sevenDaysTokens: number;
  thirtyDaysTokens: number;
  totalInputTokens: number;
  totalOutputTokens: number;
  dailyHistory: AiTokenDailyUsage[];
  modelBreakdown: Record<string, number>;
  estimatedCostIdr: number;
  monthlyLimitIdr: number;
}

export interface ActiveWindowItem {
  id: string;
  appName: string;
  windowTitle: string;
  iconType: "vscode" | "chrome" | "word" | "terminal" | "discord" | "antigravity" | "default" | string;
  isActive?: boolean;
  isBlocked?: boolean;
  hwnd?: number;
  pid?: number;
  appIconUrl?: string;
  sampleContent?: string;
}

