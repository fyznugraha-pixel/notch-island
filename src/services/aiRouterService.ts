import type {
  AiModelConfig,
  AiProviderId,
  RouterTier,
  ResponseLengthMode,
  RouterConfig,
} from "../components/ui/aichat/AiChatTypes";
import { getLanguage } from "./i18n";

const ROUTER_CONFIG_KEY = "island_ai_router_config_v1";

export interface HeuristicResult {
  tier: RouterTier;
  confidence: number;
  lengthMode: ResponseLengthMode;
  cleanedPrompt: string;
  matchedSignals: string[];
  latencyMs: number;
  stage: 1 | 2;
}

export const DEFAULT_ROUTER_CONFIG: RouterConfig = {
  enabled: true,
  selectedMode: "auto",
  defaultLength: "auto",
  tierMapping: {
    T0: { provider: "deepseek", modelId: "deepseek-chat", modelName: "DeepSeek V3" },
    T1: { provider: "deepseek", modelId: "deepseek-chat", modelName: "DeepSeek V3" },
    T2: { provider: "claude", modelId: "claude-3-7-sonnet-20250219", modelName: "Claude Sonnet 3.7" },
  },
  enableStage2Classifier: true,
  confidenceThreshold: 0.75,
  historyWindowSize: 8,
  budget: {
    monthlyLimitIdr: 0,
    warnAtPercent: 80,
    actionOnLimit: "warn",
  },
};

export function loadRouterConfig(): RouterConfig {
  try {
    const raw = localStorage.getItem(ROUTER_CONFIG_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      return {
        ...DEFAULT_ROUTER_CONFIG,
        ...parsed,
        tierMapping: {
          ...DEFAULT_ROUTER_CONFIG.tierMapping,
          ...(parsed.tierMapping || {}),
        },
        budget: {
          ...DEFAULT_ROUTER_CONFIG.budget,
          ...(parsed.budget || {}),
        },
      };
    }
  } catch {}
  return DEFAULT_ROUTER_CONFIG;
}

export function saveRouterConfig(config: RouterConfig): void {
  try {
    localStorage.setItem(ROUTER_CONFIG_KEY, JSON.stringify(config));
  } catch {}
}

// Pre-compiled regex patterns for microsecond performance (< 5ms)
const RE_GREETINGS = /^(halo|hai|pagi|siang|malam|hey|hi|hello|tes|test|ping|assalamualaikum)([\s\.,!]+[a-zA-Z0-9\s]+)*[\?!.]*$/i;

const RE_HARD_SYSTEMS_CONCURRENCY =
  /mutex|deadlock|race condition|data race|multi-thread|goroutine|tokio|thread-safe|lock-free|channel consumer|crash|segfault|memory leak|use-after-free|memory corruption|address sanitizer|heap snapshot|native memory|metaspace|jvm|zgc|colored pointer|copy-on-write|fork\(\)|virtual memory|ast visitor|compiler|deoptimasi|jit|directcomposition|sta vs mta|win32/i;

const RE_HARD_DATABASE_INTERNALS =
  /explain analyze|execution plan|seq scan|nested loop|composite index|b-tree|lsm-tree|storage engine|sharding vs partitioning|optimalkan query sql|pgbouncer|row level security/i;

const RE_HARD_ALGORITHMS_THEORY =
  /raft consensus|consensus raft|split-vote|leader election|network partition|skip list|a\* pathfinding|n-queens|k-nn|hnsw|approximate search|zero-copy|flatbuffers|self-attention|transformer q, k, v|p\s*!=\s*np|halting problem|turing machine|mesin turing|teorema cap|consistent hashing|backpropagation/i;

const RE_HARD_MATH_CRYPTO =
  /\\int|\\sum|integral|kalkulus|separasi variabel|persamaan diferensial|gradient descent|lipschitz|gaussian|kurva eliptik|ecdsa|ed25519|side-channel|timing attack|hmac/i;

const RE_HARD_SECURITY_ARCHITECTURE =
  /toctou|aslr|rop gadget|buffer overflow|smart contract|reentrancy|flash loan|mitm|man-in-the-middle|ssl pinning|oauth 2\.0 pkce|code_verifier|query nesting attack|dos depth|multi-tenant|event sourcing|cqrs|distributed lock|redlock|rate limiting terdistribusi|active-active|failover multi-region|feature store|model serving|pipeline machine learning/i;

const RE_HARD_SHORT =
  /^(kenapa|mengapa)\s+(mutex|deadlock|memory leak)|buktikan\s+p\s*!=\s*np|^(rancang|desain)\s+skema\s+database|optimalkan query sql/i;

/**
 * Stage 1: Ultra-fast heuristic scoring (< 5ms, 0 network cost).
 * Implements strict "CONDONG NAIK" (Bias Upward) and context inheritance.
 */
export function evaluatePromptHeuristics(
  rawPrompt: string,
  contextPreviousTier?: RouterTier,
  isManualModel: boolean = false
): HeuristicResult {
  const startTime = performance.now();
  let prompt = rawPrompt.trim();
  const matchedSignals: string[] = [];

  // 1. Check user command shortcuts
  let forcedTier: RouterTier | null = null;
  let forcedLength: ResponseLengthMode | null = null;

  if (prompt.startsWith("/kuat")) {
    prompt = prompt.replace(/^\/kuat\s*/i, "").trim();
    if (!isManualModel) {
      forcedTier = "T2";
      matchedSignals.push("shortcut_kuat");
    }
  } else if (prompt.startsWith("/ringan")) {
    prompt = prompt.replace(/^\/ringan\s*/i, "").trim();
    if (!isManualModel) {
      forcedTier = "T0";
      matchedSignals.push("shortcut_ringan");
    }
  }

  if (prompt.startsWith("/ringkas")) {
    prompt = prompt.replace(/^\/ringkas\s*/i, "").trim();
    forcedLength = "compact";
    matchedSignals.push("shortcut_ringkas");
  } else if (prompt.startsWith("/lengkap")) {
    prompt = prompt.replace(/^\/lengkap\s*/i, "").trim();
    forcedLength = "detailed";
    matchedSignals.push("shortcut_lengkap");
  }

  const promptLower = prompt.toLowerCase();
  const charLength = prompt.length;

  // 2. Context Followup Inheritance (e.g. "lanjutkan", "next", "audit kode di atas")
  const isFollowup =
    /^(lanjutkan|next|teruskan|yang tadi|lanjut|bisa berikan contoh|contohnya|audit kode di atas)/i.test(
      promptLower
    ) && charLength < 60;

  if (isFollowup && contextPreviousTier) {
    matchedSignals.push(`inherited_context_${contextPreviousTier}`);
    const latencyMs = performance.now() - startTime;
    return {
      tier: forcedTier || contextPreviousTier,
      confidence: 0.95,
      lengthMode: forcedLength || (contextPreviousTier === "T2" ? "detailed" : "normal"),
      cleanedPrompt: prompt,
      matchedSignals,
      latencyMs,
      stage: 1,
    };
  }

  // 3. T2 (Hard / Deep Reasoning) Detection
  let t2Score = 0;

  if (
    prompt.includes("```") ||
    /traceback \(most recent call last\)/i.test(prompt) ||
    /error:|panic:|fatal runtime error|nullpointerexception|exception in thread/i.test(promptLower) ||
    /at [a-zA-Z0-9_\.]+\([a-zA-Z0-9_\.\:]+\)/.test(prompt)
  ) {
    t2Score += 70;
    matchedSignals.push("code_block_or_stack_trace");
  }

  if (RE_HARD_SYSTEMS_CONCURRENCY.test(promptLower)) {
    t2Score += 65;
    matchedSignals.push("systems_concurrency");
  }

  if (RE_HARD_DATABASE_INTERNALS.test(promptLower)) {
    t2Score += 65;
    matchedSignals.push("database_internals");
  }

  if (RE_HARD_ALGORITHMS_THEORY.test(promptLower)) {
    t2Score += 65;
    matchedSignals.push("algorithms_theory");
  }

  if (RE_HARD_MATH_CRYPTO.test(promptLower)) {
    t2Score += 65;
    matchedSignals.push("math_cryptography");
  }

  if (RE_HARD_SECURITY_ARCHITECTURE.test(promptLower)) {
    t2Score += 60;
    matchedSignals.push("security_architecture");
  }

  if (RE_HARD_SHORT.test(promptLower)) {
    t2Score += 55;
    matchedSignals.push("hard_short_pattern");
  }

  // 4. T0 (Simple / Light) Detection
  let t0Score = 0;

  // Greetings (< 45 chars)
  if (charLength < 45 && (RE_GREETINGS.test(prompt) || /^(kamu ai apa ya|siapa kamu)/i.test(promptLower))) {
    t0Score += 65;
    matchedSignals.push("greeting_signal");
  }

  // Single-line arithmetic / simple conversions
  const isArithmetic =
    /^[\d\.\s\+\-\*\/\%\^\(\)]+$/i.test(prompt.replace(/berapa|\?|hitung/gi, "").trim()) ||
    /^(hitung|berapa)\s+\d+\s*(persen|\%)\s+dari\s+[\d\.]+/i.test(promptLower) ||
    /^(konversi|berapa|\d+)\s*(jam|menit|detik|mil|km|meter|dolar)\s+(ke|dalam|kalau|dirupiahkan)\s*/i.test(
      promptLower
    ) ||
    /kurs\s+[\d\.]+/i.test(promptLower) ||
    /^akar kuadrat dari \d+/i.test(promptLower) ||
    /\d+\s*pangkat\s*\d+/i.test(promptLower);

  if (isArithmetic && t2Score === 0) {
    t0Score += 65;
    matchedSignals.push("simple_arithmetic");
  }

  // Short Factual / Geography / Capitals / Definitions (< 75 chars, no complex keywords)
  const isShortFactual =
    charLength < 75 &&
    t2Score === 0 &&
    /^(ibu kota|siapa penemu|kapan indonesia|unsur kimia|mata uang|what is the capital|siapa presiden|singkatan dari|hari ini hari|apakah tomat|warna primer|antonim|sinonim|bumi itu planet|berapa jumlah benua|berapa temperatur|1 mil itu|berapa keliling|apa fungsi tombol|sebutkan warna|sebutkan satu)/i.test(
      promptLower
    );

  if (isShortFactual) {
    t0Score += 60;
    matchedSignals.push("brief_factual");
  }

  // Short Translations (< 90 chars)
  const isShortTranslation =
    charLength < 90 &&
    t2Score === 0 &&
    /^(terjemahkan|translate|apa bahasa inggrisnya|bahasa jepangnya|bahasa jermannya|artinya perkataan|translate this word)/i.test(
      promptLower
    );

  if (isShortTranslation) {
    t0Score += 60;
    matchedSignals.push("short_translation");
  }

  // Quick formatting / string transforms
  if (
    t2Score === 0 &&
    /^(ubah teks ini|beri \d+ ide nama|rekomendasi 1 film|buat daftar belanja)/i.test(
      promptLower
    )
  ) {
    t0Score += 55;
    matchedSignals.push("quick_utility");
  }

  // Trivial Long Cases: Pasting long article but asking for 1 single number / word
  if (
    charLength > 100 &&
    t2Score === 0 &&
    /berapa persen proyeksi|apa kata pertama|siapa nama yang berawalan/i.test(promptLower)
  ) {
    t0Score += 65;
    matchedSignals.push("trivial_long_extraction");
  }

  // 5. Length Mode Heuristics (RINGKAS vs NORMAL vs LENGKAP)
  let resolvedLength: ResponseLengthMode = forcedLength || "normal";
  if (!forcedLength) {
    const isExplicitDetailed =
      /jelaskan|kenapa|mengapa|bagaimana cara|langkah demi langkah|detail|lengkap|uraikan|analisis|bandingkan|beri contoh|apa alasannya|explain|why|how to|step by step/i.test(
        promptLower
      );

    const isCodeOrImplementation =
      /buat fungsi|tulis skrip|tulis kode|komponen react|query sql|perintah bash|skrip python|regex|unit test|implementasikan|implementasi|tuliskan implementasi|algoritma|arsitektur|selesaikan masalah|rancang|desain|evaluasi/i.test(
        promptLower
      );

    if (t2Score >= 45 || isCodeOrImplementation || isExplicitDetailed) {
      resolvedLength = "detailed";
    } else if (t0Score >= 45 || (charLength < 50 && t2Score === 0)) {
      resolvedLength = "compact";
    } else {
      resolvedLength = "normal";
    }
  }

  // 6. Final Tier Resolution with CONDONG NAIK
  let finalTier: RouterTier = "T1";
  let confidence = 0.88;

  if (forcedTier) {
    finalTier = forcedTier;
    confidence = 1.0;
  } else if (t2Score >= 45) {
    finalTier = "T2";
    confidence = Math.min(1.0, 0.80 + t2Score / 180);
  } else if (t0Score >= 45 && t2Score === 0) {
    finalTier = "T0";
    confidence = Math.min(1.0, 0.80 + t0Score / 180);
  } else {
    // Intermediate check: Coding or Moderate Writing
    const hasCodingKeywords =
      /fungsi|skrip|script|query|sql|python|javascript|typescript|bash|powershell|regex|html|css|sqlite|mongodb|crontab/i.test(
        promptLower
      );
    const hasMediumComplexity =
      /buatkan draf|ringkas teks|perbedaan antara|kelebihan dan kekurangan|bagaimana cara|struktur folder|persingkat draf|contoh penggunaan|tata bahasa|wawancara/i.test(
        promptLower
      );

    if (hasCodingKeywords || hasMediumComplexity) {
      finalTier = "T1";
      confidence = 0.92;
    } else if (t0Score > 20 && t2Score === 0) {
      finalTier = "T0";
      confidence = 0.82;
    } else {
      // Ambiguous: Apply strict CONDONG NAIK (Bias Upward)
      if (t2Score > 0 || charLength > 200) {
        finalTier = "T2";
        confidence = 0.76;
        matchedSignals.push("bias_upward_to_t2");
      } else {
        finalTier = "T1";
        confidence = 0.78;
        matchedSignals.push("bias_upward_to_t1");
      }
    }
  }

  const latencyMs = Math.round((performance.now() - startTime) * 100) / 100;

  return {
    tier: finalTier,
    confidence,
    lengthMode: resolvedLength,
    cleanedPrompt: prompt,
    matchedSignals,
    latencyMs,
    stage: 1,
  };
}

export function isVisionCapableModel(model: AiModelConfig): boolean {
  if (model.provider === "deepseek") return false;
  const lower = model.id.toLowerCase();
  if (lower.includes("deepseek") || lower.includes("o3-mini")) return false;
  return true;
}

/**
 * Resolves the actual model configuration for a given tier based on available models.
 */
export function resolveTierModel(
  tier: RouterTier,
  availableModels: AiModelConfig[],
  routerConfig: RouterConfig,
  requiresVision: boolean = false
): { targetModel: AiModelConfig; targetProvider: AiProviderId } | null {
  if (availableModels.length === 0) return null;

  const visionPool = requiresVision
    ? availableModels.filter(isVisionCapableModel)
    : availableModels;
  const effectiveModels = visionPool.length > 0 ? visionPool : availableModels;

  // 1. Check user configured tierMapping against effectiveModels
  const mapping = routerConfig.tierMapping[tier];
  if (mapping) {
    const exactMatch = effectiveModels.find(
      (m) => m.id === mapping.modelId && m.provider === mapping.provider
    );
    if (exactMatch) {
      return { targetModel: exactMatch, targetProvider: exactMatch.provider };
    }
    const idMatch = effectiveModels.find((m) => m.id === mapping.modelId);
    if (idMatch) {
      return { targetModel: idMatch, targetProvider: idMatch.provider };
    }
  }

  // 2. Smart fallback if mapping not in available models
  if (tier === "T0") {
    // Prefer Fast models (Mini, Flash, Haiku, V3)
    const fast =
      effectiveModels.find((m) => m.tier === "Fast") ||
      effectiveModels.find((m) => m.tier === "Medium") ||
      effectiveModels[0];
    return { targetModel: fast, targetProvider: fast.provider };
  } else if (tier === "T2") {
    // Prefer Max models (Sonnet 3.7, R1, o3-mini, Opus)
    const max =
      effectiveModels.find((m) => m.tier === "Max") ||
      effectiveModels.find((m) => m.tier === "Medium") ||
      effectiveModels[0];
    return { targetModel: max, targetProvider: max.provider };
  } else {
    // T1: Prefer Medium or balanced model
    const medium =
      effectiveModels.find((m) => m.tier === "Medium") ||
      effectiveModels.find((m) => m.tier === "Fast") ||
      effectiveModels[0];
    return { targetModel: medium, targetProvider: medium.provider };
  }
}

/**
 * Generates length instruction to inject into the system prompt.
 */
export function getLengthSystemInstruction(lengthMode: ResponseLengthMode): string {
  const isEn = getLanguage() === "en";

  if (isEn) {
    switch (lengthMode) {
      case "compact":
        return "Response Style: VERY COMPACT. Directly answer the core question in 1-3 sentences with no greetings, no pleasantries, and no sign-offs. Absolute exception: If the user asks for code or technical/security solutions, code blocks and critical warnings must still be written COMPLETELY and IN FULL without truncation; only the surrounding explanatory text is kept concise.";
      case "detailed":
        return "Response Style: COMPREHENSIVE & STRUCTURED. Provide detailed, step-by-step explanations, technical depth, and alternative solutions if relevant. All code must be written completely.";
      case "normal":
      default:
        return "Response Style: NORMAL & CONCISE. Answer clearly and structurally with balanced explanation (1-3 paragraphs). All code must be written completely.";
    }
  }

  switch (lengthMode) {
    case "compact":
      return "Gaya Jawaban: SANGAT RINGKAS. Langsung jawab inti pertanyaan dalam 1-3 kalimat tanpa salam pembuka, tanpa basa-basi, dan tanpa penutup. Pengecualian mutlak: Jika pengguna meminta kode program atau solusi teknis/keamanan, blok kode dan peringatan penting harus tetap ditulis LENGKAP dan UTUH tanpa dipotong, hanya teks penjelasan di sekitarnya yang dibuat ringkas.";
    case "detailed":
      return "Gaya Jawaban: LENGKAP & TERSTRUKTUR. Berikan penjelasan komprehensif, terstruktur langkah demi langkah, detail teknis, dan alternatif solusi jika relevan. Seluruh kode harus ditulis utuh.";
    case "normal":
    default:
      return "Gaya Jawaban: NORMAL & PADAT. Jawab secara jelas dan terstruktur dengan penjelasan wajar (1-3 paragraf). Seluruh kode harus ditulis utuh.";
  }
}

/**
 * Returns the safety max_tokens limit according to length mode.
 */
export function getSafetyMaxTokens(lengthMode: ResponseLengthMode): number {
  switch (lengthMode) {
    case "compact":
      return 350;
    case "detailed":
      return 2500;
    case "normal":
    default:
      return 1000;
  }
}

export interface BudgetEvaluation {
  hasLimit: boolean;
  limitIdr: number;
  spentIdr: number;
  percentUsed: number;
  isWarning: boolean;
  isExceeded: boolean;
  action: "warn" | "downgrade_to_t0" | "block";
}

export function evaluateBudgetPolicy(
  config: RouterConfig,
  stats: { estimatedCostIdr?: number; monthlyLimitIdr?: number }
): BudgetEvaluation {
  const statsLimit = Number(stats.monthlyLimitIdr) || 0;
  const cfgLimit = Number(config.budget?.monthlyLimitIdr) || 0;
  const limitIdr = statsLimit > 0 ? statsLimit : cfgLimit;
  const spentIdr = Math.max(0, Number(stats.estimatedCostIdr) || 0);
  const warnAtPercent = Math.max(1, Math.min(100, Number(config.budget?.warnAtPercent) || 80));
  const action = config.budget?.actionOnLimit || "warn";

  if (limitIdr <= 0) {
    return {
      hasLimit: false,
      limitIdr: 0,
      spentIdr,
      percentUsed: 0,
      isWarning: false,
      isExceeded: false,
      action,
    };
  }

  const percentUsed = (spentIdr / limitIdr) * 100;
  return {
    hasLimit: true,
    limitIdr,
    spentIdr,
    percentUsed,
    isWarning: percentUsed >= warnAtPercent,
    isExceeded: spentIdr >= limitIdr,
    action,
  };
}

/**
 * Calculates estimated cost in IDR (USD/IDR ~ 16,000) for UI display and usage accumulation.
 */
export function calculateEstimatedCostIdr(
  model: AiModelConfig,
  inputTokens: number,
  outputTokens: number
): number {
  const inRate = model.inputCostPer1M || 0;
  const outRate = model.outputCostPer1M || 0;
  if (inRate <= 0 && outRate <= 0) return 0;

  const costUsd =
    (Math.max(0, inputTokens) / 1_000_000) * inRate +
    (Math.max(0, outputTokens) / 1_000_000) * outRate;
  return Math.round(costUsd * 16000 * 10000) / 10000;
}
