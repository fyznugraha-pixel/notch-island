import { parseDateNlp } from "../src/utils/dateNlpParser.ts";

function runTests() {
  const ref = new Date("2026-10-26T10:00:00"); // Monday, Oct 26, 2026
  
  const testCases = [
    {
      input: "Kumpul proposal TA jumat jam 4 sore",
      expectedClean: "Kumpul proposal TA",
      checkBadge: (b: string) => b.includes("Jum") && b.includes("16:00"),
      expectedHasTime: true,
      checkHour: 16,
    },
    {
      input: "Tubes SIA BAB 1 besok",
      expectedClean: "Tubes SIA BAB 1",
      checkBadge: (b: string) => b === "Besok", // Must NOT default to 09:00
      expectedHasTime: false,
    },
    {
      input: "Jurnal 2 hari ini 18:00",
      expectedClean: "Jurnal 2",
      checkBadge: (b: string) => b.includes("Hari ini") && b.includes("18:00"),
      expectedHasTime: true,
      checkHour: 18,
    },
    {
      input: "Meeting client besok jam 9",
      expectedClean: "Meeting client",
      checkBadge: (b: string) => b === "Besok · 09:00",
      expectedHasTime: true,
      checkHour: 9,
    },
    {
      input: "Olahraga jam 6 pagi",
      expectedClean: "Olahraga",
      expectedHasTime: true,
      checkHour: 6,
    },
    {
      input: "Kopi santai akhir pekan",
      expectedClean: "Kopi santai",
      checkBadge: (b: string) => b.includes("Sab") && !b.includes(":"),
      expectedHasTime: false,
    },
    {
      input: "Beli susu tanpa tanggal",
      expectedClean: "Beli susu tanpa tanggal",
      hasDate: false,
    },
    {
      input: "Submit report tomorrow",
      lang: "en" as const,
      expectedClean: "Submit report",
      checkBadge: (b: string) => b === "Tomorrow", // Must NOT default to 09:00
      expectedHasTime: false,
    },
    {
      input: "Submit report tomorrow 4pm",
      lang: "en" as const,
      expectedClean: "Submit report",
      checkBadge: (b: string) => b === "Tomorrow · 16:00",
      expectedHasTime: true,
      checkHour: 16,
    },
    {
      input: "Team sync friday 10am",
      lang: "en" as const,
      expectedClean: "Team sync",
      checkBadge: (b: string) => b.includes("Fri") && b.includes("10:00"),
      expectedHasTime: true,
      checkHour: 10,
    },
    {
      input: "Lari pagi besok pagi",
      expectedClean: "Lari pagi",
      checkBadge: (b: string) => b === "Besok · 09:00",
      expectedHasTime: true,
      checkHour: 9,
    }
  ];

  let passed = 0;
  for (const tc of testCases) {
    const res = parseDateNlp(tc.input, ref, (tc as any).lang || "id");
    if (tc.hasDate === false) {
      if (!res.hasDate) {
        console.log(`✅ [PASS] No date: "${tc.input}"`);
        passed++;
      } else {
        console.error(`❌ [FAIL] Expected no date for "${tc.input}", got:`, res);
      }
      continue;
    }

    const dt = res.dueAt ? new Date(res.dueAt) : null;
    const okClean = res.cleanText === tc.expectedClean;
    const okBadge = !tc.checkBadge || tc.checkBadge(res.chipLabel);
    const okHour = !tc.checkHour || (dt && dt.getHours() === tc.checkHour);
    const okHasTime = tc.expectedHasTime === undefined || res.hasTime === tc.expectedHasTime;

    if (res.hasDate && okClean && okBadge && okHour && okHasTime) {
      console.log(`✅ [PASS] "${tc.input}" -> Clean: "${res.cleanText}", Chip: "${res.chipLabel}", hasTime: ${res.hasTime}`);
      passed++;
    } else {
      console.error(`❌ [FAIL] "${tc.input}": clean=${okClean} ("${res.cleanText}"), badge=${okBadge} ("${res.chipLabel}"), hour=${okHour} (${dt?.getHours()}), hasTime=${okHasTime} (${res.hasTime})`);
    }
  }

  console.log(`\nTests completed: ${passed}/${testCases.length} passed.`);
  if (passed !== testCases.length) {
    process.exit(1);
  }
}

runTests();
