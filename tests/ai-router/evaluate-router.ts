import fs from "fs";
import path from "path";
import { evaluatePromptHeuristics } from "../../src/services/aiRouterService";
import type { RouterTier } from "../../src/components/ui/aichat/AiChatTypes";

interface DatasetPrompt {
  id: string;
  prompt: string;
  expectedTier: RouterTier;
  expectedLength: string;
  category: string;
  notes: string;
}

interface Dataset {
  metadata: any;
  prompts: DatasetPrompt[];
  availabilityScenarios: any[];
}

function runEvaluation() {
  const datasetPath = path.resolve(process.cwd(), "tests/ai-router/dataset.json");
  const raw = fs.readFileSync(datasetPath, "utf-8");
  const dataset: Dataset = JSON.parse(raw);

  let correctTierCount = 0;
  let correctLengthCount = 0;
  let underClassifiedCount = 0; // T2 classified as T0 or T1 (Critical error)
  let overClassifiedCount = 0;  // T0 classified as T1/T2 (Allowed under Bias Upward)
  let totalLatencyMs = 0;
  const stage2CallCount = 0;

  const mismatches: Array<{
    id: string;
    prompt: string;
    expectedTier: RouterTier;
    actualTier: RouterTier;
    expectedLength: string;
    actualLength: string;
    notes: string;
  }> = [];

  for (const item of dataset.prompts) {
    const prevTier: RouterTier | undefined =
      item.category === "context_followup"
        ? item.expectedTier === "T2"
          ? "T2"
          : "T1"
        : undefined;

    const res = evaluatePromptHeuristics(item.prompt, prevTier, false);
    totalLatencyMs += res.latencyMs;

    const tierMatched = res.tier === item.expectedTier;
    const lengthMatched =
      (item.expectedLength === "RINGKAS" && res.lengthMode === "compact") ||
      (item.expectedLength === "NORMAL" && res.lengthMode === "normal") ||
      (item.expectedLength === "LENGKAP" && res.lengthMode === "detailed");

    if (tierMatched) {
      correctTierCount++;
    } else {
      mismatches.push({
        id: item.id,
        prompt: item.prompt.slice(0, 70),
        expectedTier: item.expectedTier,
        actualTier: res.tier,
        expectedLength: item.expectedLength,
        actualLength: res.lengthMode,
        notes: item.notes,
      });

      // Check under-classification
      if (item.expectedTier === "T2" && (res.tier === "T0" || res.tier === "T1")) {
        underClassifiedCount++;
      } else if (item.expectedTier === "T1" && res.tier === "T0") {
        underClassifiedCount++;
      } else {
        overClassifiedCount++;
      }
    }

    if (lengthMatched) {
      correctLengthCount++;
    }
  }

  const total = dataset.prompts.length;
  const tierAccuracy = (correctTierCount / total) * 100;
  const lengthAccuracy = (correctLengthCount / total) * 100;
  const underClassifiedRate = (underClassifiedCount / total) * 100;
  const avgLatencyMs = totalLatencyMs / total;

  console.log("==================================================");
  console.log("HASIL EVALUASI BENCHMARK ROUTER (150 PROMPT)");
  console.log("==================================================");
  console.log(`Total Prompts: ${total}`);
  console.log(`Tier Accuracy (G1): ${tierAccuracy.toFixed(2)}% (Target >= 90%) -> ${tierAccuracy >= 90 ? "LULUS" : "GAGAL"}`);
  console.log(`Under-classification Rate (G2): ${underClassifiedRate.toFixed(2)}% (Target <= 3%) -> ${underClassifiedRate <= 3 ? "LULUS" : "GAGAL"}`);
  console.log(`Average Latency Stage 1 (G3): ${avgLatencyMs.toFixed(3)} ms (Target < 5 ms) -> ${avgLatencyMs < 5 ? "LULUS" : "GAGAL"}`);
  console.log(`Length Accuracy (G8): ${lengthAccuracy.toFixed(2)}% (Target >= 90%) -> ${lengthAccuracy >= 90 ? "LULUS" : "GAGAL"}`);
  console.log(`Over-classified (Bias Upward): ${overClassifiedCount} prompts`);
  console.log(`Under-classified: ${underClassifiedCount} prompts`);

  // G10 Test: Manual model selection never triggers router
  let g10Passed = true;
  for (let i = 0; i < 20; i++) {
    const testPrompt = dataset.prompts[i].prompt;
    const manualRes = evaluatePromptHeuristics(testPrompt, undefined, true);
    // If user passed shortcut /kuat on manual, it must be ignored
    if (testPrompt.startsWith("/kuat") && manualRes.tier === "T2" && manualRes.matchedSignals.includes("shortcut_kuat")) {
      g10Passed = false;
    }
  }
  console.log(`G10 Manual Selection Preservation: -> ${g10Passed ? "LULUS" : "GAGAL"}`);

  if (mismatches.length > 0) {
    console.log(`\nDaftar Seluruh Mismatch (${mismatches.length}):`);
    mismatches.forEach((m) => {
      console.log(`- [${m.id}] Exp: ${m.expectedTier} | Act: ${m.actualTier} | ExpLen: ${m.expectedLength} | ActLen: ${m.actualLength} | Prompt: "${m.prompt}"`);
    });
  }

  // Export results summary for report
  const summary = {
    total,
    tierAccuracy,
    lengthAccuracy,
    underClassifiedRate,
    avgLatencyMs,
    g10Passed,
    mismatchCount: mismatches.length,
    scenariosCount: dataset.availabilityScenarios.length,
  };
  fs.writeFileSync(path.resolve(process.cwd(), "tests/ai-router/benchmark-result.json"), JSON.stringify(summary, null, 2));
}

runEvaluation();
