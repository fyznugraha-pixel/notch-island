import React from "react";
import { WidgetCatalogEntry, WidgetSize } from "../../../../services/desktopWidgetsService";

export interface WidgetPreviewBodyContext {
  entry: WidgetCatalogEntry;
  size: WidgetSize;
  lightWallpaper: boolean;
  isId: boolean;
  fg: string;
  sub: string;
  chip: string;
  accentBar: string;
  accentLabel: string;
}

export function renderExtraWidgetPreviewBody(ctx: WidgetPreviewBodyContext): React.ReactNode | null {
  const { entry, size, lightWallpaper, isId, sub, chip, accentLabel } = ctx;
  const tr = (idText: string, enText: string) => (isId ? idText : enText);
  const trackBg = lightWallpaper ? "bg-slate-900/12" : "bg-white/15";

  switch (entry.widget_type) {
    case "class_schedule": {
      const rows = (
        isId
          ? [
              ["08:00", "Algoritma", "R.301"],
              ["10:30", "Sistem Operasi", "Lab B"],
              ["13:00", "Basis Data", "R.204"],
              ["15:30", "Jaringan", "Lab A"],
            ]
          : [
              ["08:00", "Algorithms", "Rm 301"],
              ["10:30", "Operating Systems", "Lab B"],
              ["13:00", "Databases", "Rm 204"],
              ["15:30", "Networking", "Lab A"],
            ]
      ).slice(0, size === "large" ? 4 : 2);
      return (
        <div className="h-full flex flex-col justify-between">
          <div className="flex items-center justify-between gap-2">
            <span className="text-[12.5px] font-semibold">
              {tr("Jadwal Kuliah", "Class Schedule")}
            </span>
            <span className="text-[10.5px] font-semibold text-blue-400">
              {tr("Sabtu", "Saturday")}
            </span>
          </div>
          <div className="flex flex-col gap-1.5">
            {rows.map(([time, subj, room]) => (
              <div key={time} className="flex items-center gap-2">
                <span className={`px-2 py-0.5 rounded-md text-[10px] font-bold tabular-nums text-blue-400 ${chip}`}>
                  {time}
                </span>
                <div className="min-w-0 flex-1">
                  <div className="text-[11px] font-semibold truncate">{subj}</div>
                  <div className={`text-[9.5px] truncate ${sub}`}>{room}</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      );
    }

    case "todo_groups": {
      const items = (
        isId
          ? [
              { ok: true, txt: "[Kerja] Finalisasi desain" },
              { ok: true, txt: "[Tim] Sinkron API" },
              { ok: false, txt: "[Rilis] Uji komponen UI" },
              { ok: false, txt: "Rapikan catatan rilis" },
            ]
          : [
              { ok: true, txt: "[Work] Finalize layout" },
              { ok: true, txt: "[Team] Sync backend API" },
              { ok: false, txt: "[Release] Verify UI states" },
              { ok: false, txt: "Update release notes" },
            ]
      ).slice(0, size === "small" ? 2 : size === "medium" ? 3 : 4);
      return (
        <div className="h-full flex flex-col justify-between">
          <div className="flex items-center justify-between border-b border-current/10 pb-1">
            <span className="text-[12.5px] font-bold">{tr("Tugas", "Tasks")}</span>
            <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold text-blue-400 tabular-nums ${chip}`}>
              2/4
            </span>
          </div>
          <div className="flex flex-col gap-1">
            {items.map((it) => (
              <div
                key={it.txt}
                className={`text-[10.5px] truncate ${it.ok ? sub : "font-medium"}`}
              >
                {it.ok ? "✓" : "○"} {it.txt}
              </div>
            ))}
          </div>
        </div>
      );
    }

    case "drop_zone": {
      const files = [
        ["Proposal_v2.pdf", "420 KB"],
        ["Assets.zip", "14.2 MB"],
        ["Notes.txt", "12 KB"],
      ].slice(0, size === "small" ? 2 : 3);
      return (
        <div className="h-full flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <span className="text-[12.5px] font-semibold">Drop Zone</span>
            <span className={`text-[10px] ${sub}`}>{tr("3 berkas", "3 files")}</span>
          </div>
          <div className="flex flex-col gap-1">
            {files.map(([name, sz]) => (
              <div
                key={name}
                className={`flex items-center justify-between gap-2 px-2 py-1 rounded-[7px] ${chip}`}
              >
                <span className="text-[10.5px] font-medium truncate">{name}</span>
                <span className={`text-[9.5px] shrink-0 tabular-nums ${sub}`}>{sz}</span>
              </div>
            ))}
          </div>
        </div>
      );
    }

    case "sticky_notes":
      return (
        <div className="h-full flex flex-col justify-between">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-1.5 min-w-0">
              <span className="w-[3px] h-3.5 rounded-full bg-amber-400 shrink-0" />
              <span className="text-[12.5px] font-semibold truncate">
                {tr("Catatan Kerja", "Work Notes")}
              </span>
            </div>
            <span className={`text-[10px] shrink-0 ${sub}`}>{tr("2 catatan", "2 notes")}</span>
          </div>
          <div className="text-[11px] leading-snug space-y-0.5">
            <div className="truncate">☑ {tr("Kirim revisi aset", "Send revised assets")}</div>
            <div className="truncate">☐ {tr("Siapkan demo sore", "Prepare demo deck")}</div>
          </div>
          <div>
            <span className={`inline-block px-2.5 py-0.5 rounded-full text-[10px] font-semibold ${chip}`}>
              {tr("+ Tambah", "+ Add")}
            </span>
          </div>
        </div>
      );

    case "mini_kanban": {
      const cols = isId
        ? [
            { title: "Akan (2)", cls: sub, cards: ["Audit kontras", "Uji drag"] },
            { title: "Proses (2)", cls: "text-blue-400", cards: ["Galeri visual", "I18n card"] },
            { title: "Selesai (2)", cls: "text-emerald-400", cards: ["FFT Audio", "Cuaca SVG"] },
          ]
        : [
            { title: "To Do (2)", cls: sub, cards: ["Contrast audit", "Drag test"] },
            { title: "Doing (2)", cls: "text-blue-400", cards: ["Visual gallery", "I18n cards"] },
            { title: "Done (2)", cls: "text-emerald-400", cards: ["Audio FFT", "Weather SVG"] },
          ];
      return (
        <div className="h-full flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <span className="text-[12.5px] font-semibold">
              {tr("Kanban Mini", "Mini Kanban")}
            </span>
            <span className={`px-2 py-0.5 rounded-full text-[10px] font-semibold ${chip}`}>
              {tr("+ Kartu", "+ Card")}
            </span>
          </div>
          <div className="grid grid-cols-3 gap-1.5 flex-1 mt-2">
            {cols.map((col) => (
              <div key={col.title} className="flex flex-col gap-1">
                <div className={`text-[9.5px] font-bold truncate ${col.cls}`}>{col.title}</div>
                {col.cards.map((card) => (
                  <div
                    key={card}
                    className={`rounded-[7px] p-1.5 text-[9.5px] font-medium leading-tight border border-current/10 ${chip}`}
                  >
                    {card}
                  </div>
                ))}
              </div>
            ))}
          </div>
        </div>
      );
    }

    case "time_tracker": {
      const projects = [
        [tr("Desain Gili", "Gili Design"), "01:42:18", true],
        [tr("Dokumentasi", "Documentation"), "00:25:10", false],
      ].slice(0, size === "small" ? 2 : 2);
      return (
        <div className="h-full flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <span className="text-[12px] font-semibold">
              {tr("Pelacak Waktu", "Time Tracker")}
            </span>
            {size !== "small" && (
              <span className={`px-2 py-0.5 rounded-full text-[9.5px] font-semibold ${chip}`}>
                {tr("Ekspor CSV", "Export CSV")}
              </span>
            )}
          </div>
          <div className="flex flex-col gap-1.5">
            {projects.map(([name, hms, active]) => (
              <div key={String(name)} className="flex items-center justify-between gap-2">
                <div className="min-w-0">
                  <div className="text-[11px] font-semibold truncate">{name}</div>
                  <div
                    className={`text-[10px] tabular-nums font-semibold ${
                      active ? "text-emerald-400" : sub
                    }`}
                  >
                    {hms}
                  </div>
                </div>
                <span
                  className={`px-2 py-0.5 rounded-full text-[9.5px] font-semibold shrink-0 ${
                    active ? "bg-red-500/25" : "bg-blue-500/25"
                  }`}
                >
                  {active ? tr("Henti", "Stop") : tr("Mulai", "Start")}
                </span>
              </div>
            ))}
          </div>
        </div>
      );
    }

    case "site_status":
      return (
        <div className="h-full flex flex-col justify-between">
          <span className="text-[12.5px] font-semibold">
            {tr("Status Situs", "Site Status")}
          </span>
          <div className="flex flex-col gap-1.5">
            {[
              ["API Prod", "200 . 42 ms"],
              ["Web App", "200 . 64 ms"],
              ["Docs Portal", "200 . 38 ms"],
            ].map(([name, stat]) => (
              <div key={name} className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-1.5 min-w-0">
                  <span className="w-2 h-2 rounded-full bg-emerald-400 shrink-0" />
                  <span className="text-[11px] font-semibold truncate">{name}</span>
                </div>
                <span className={`text-[10px] font-medium tabular-nums shrink-0 ${sub}`}>
                  {stat}
                </span>
              </div>
            ))}
          </div>
        </div>
      );

    case "github_status":
      return (
        <div className="h-full flex flex-col justify-between">
          <div>
            <div className={`text-[9.5px] font-bold tracking-wider ${sub}`}>GITHUB</div>
            <div className="text-[12.5px] font-semibold truncate">faiz/gili</div>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <div className="text-[24px] font-bold leading-none text-blue-400 tabular-nums">3</div>
              <div className={`text-[10px] mt-0.5 ${sub}`}>{tr("PR Terbuka", "Open PRs")}</div>
            </div>
            <div>
              <div className="text-[24px] font-bold leading-none tabular-nums">7</div>
              <div className={`text-[10px] mt-0.5 ${sub}`}>
                {tr("Issue Terbuka", "Open Issues")}
              </div>
            </div>
          </div>
          <div className="text-[10px] font-semibold text-emerald-400 truncate">
            Actions: ci-build (success)
          </div>
        </div>
      );

    case "shortcuts_grid": {
      const items = [
        ["Terminal", "wt.exe"],
        ["VS Code", "Code.exe"],
        [tr("Kerja", "Work"), "D:\\Kerja"],
        ["Docs", "https://..."],
      ];
      return (
        <div className="h-full flex flex-col justify-between">
          <span className="text-[12px] font-semibold">{tr("Pintasan", "Shortcuts")}</span>
          <div className={`grid gap-1.5 ${size === "small" ? "grid-cols-2" : "grid-cols-4"}`}>
            {items.map(([lbl, path]) => (
              <div key={lbl} className={`rounded-[10px] p-1.5 ${chip}`}>
                <div className="text-[10px] font-semibold truncate">{lbl}</div>
                <div className={`text-[8.5px] truncate ${sub}`}>{path}</div>
              </div>
            ))}
          </div>
        </div>
      );
    }

    case "recent_files":
      return (
        <div className="h-full flex flex-col justify-between">
          <span className="text-[12.5px] font-semibold">
            {tr("Berkas Terbaru", "Recent Files")}
          </span>
          <div className="flex flex-col gap-1.5">
            {[
              [tr("Catatan_Rilis.md", "Release_Notes.md"), "18 KB"],
              [tr("Laporan_Q4.pdf", "Q4_Report.pdf"), "1.4 MB"],
              ["schema.sql", "42 KB"],
            ].map(([name, sz]) => (
              <div key={name} className="flex items-center justify-between gap-2 text-[11px]">
                <span className="font-medium truncate">{name}</span>
                <span className={`text-[10px] shrink-0 tabular-nums ${sub}`}>{sz}</span>
              </div>
            ))}
          </div>
        </div>
      );

    case "top_processes":
      return (
        <div className="h-full flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <span className="text-[12.5px] font-semibold">
              {tr("Proses Teratas", "Top Processes")}
            </span>
            <span className={`text-[10px] ${sub}`}>{tr("Hanya-baca", "Read-only")}</span>
          </div>
          <div className="flex flex-col gap-1.5">
            {[
              ["gili.exe", "4.2%", "210 MB"],
              ["chrome.exe", "3.8%", "640 MB"],
              ["rust-analyzer", "2.1%", "480 MB"],
            ].map(([name, cpu, ram]) => (
              <div key={name} className="flex items-center justify-between gap-2 text-[11px]">
                <span className="font-semibold truncate flex-1">{name}</span>
                <span className="font-semibold tabular-nums">{cpu}</span>
                <span className={`text-[10px] tabular-nums w-12 text-right ${sub}`}>{ram}</span>
              </div>
            ))}
          </div>
        </div>
      );

    case "storage_treemap":
      return (
        <div className="h-full flex flex-col justify-between gap-1.5">
          <div className="flex items-center justify-between">
            <span className="text-[11.5px] font-semibold truncate">
              {tr("Peta Penyimpanan (48.2 GB)", "Storage Map (48.2 GB)")}
            </span>
            <span className={`px-2 py-0.5 rounded-full text-[9.5px] font-semibold ${chip}`}>
              {tr("Pindai", "Scan")}
            </span>
          </div>
          <div className="grid grid-cols-12 grid-rows-2 gap-1 flex-1 min-h-0">
            <div className="col-span-7 row-span-2 rounded-[8px] bg-blue-500/75 p-2 flex flex-col justify-end text-white">
              <div className="text-[10.5px] font-semibold truncate">Projects</div>
              <div className="text-[9.5px] opacity-85 tabular-nums">22.4 GB</div>
            </div>
            <div className="col-span-5 rounded-[8px] bg-emerald-500/75 p-1.5 flex flex-col justify-end text-white">
              <div className="text-[10px] font-semibold truncate">Media</div>
              <div className="text-[9px] opacity-85 tabular-nums">14.8 GB</div>
            </div>
            <div className="col-span-3 rounded-[8px] bg-amber-500/75 p-1 flex flex-col justify-end text-white">
              <div className="text-[9px] font-semibold truncate">Docs</div>
              <div className="text-[8.5px] opacity-85 tabular-nums">6.2 GB</div>
            </div>
            <div className="col-span-2 rounded-[8px] bg-violet-500/75 p-1 flex flex-col justify-end text-white">
              <div className="text-[9px] font-semibold truncate">4.8G</div>
            </div>
          </div>
        </div>
      );

    case "live_mascot":
      return (
        <div className="h-full flex flex-col items-center justify-between text-center">
          {size === "medium" && (
            <div className={`w-full text-left text-[9.5px] font-bold tracking-wider ${sub}`}>
              {tr("MASKOT GILI", "GILI MASCOT")}
            </div>
          )}
          <div className="my-auto w-14 h-11 rounded-[20px] bg-blue-500/85 border border-white/25 flex items-center justify-center gap-2.5">
            <span className="w-2 h-2.5 rounded-full bg-white" />
            <span className="w-2 h-2.5 rounded-full bg-white" />
          </div>
          <div className="text-[10.5px] font-medium truncate max-w-full">
            {tr("Tetap fokus, jangan lupa minum.", "Stay focused, remember to hydrate.")}
          </div>
        </div>
      );

    case "quote_poster":
      return (
        <div className="h-full flex flex-col justify-between">
          <div className="text-[12.5px] font-semibold leading-snug line-clamp-3">
            &ldquo;
            {tr(
              "Langkah kecil yang konsisten mengalahkan rencana besar yang ditunda.",
              "Small consistent steps beat big plans left waiting."
            )}
            &rdquo;
          </div>
          <div className={`text-[10.5px] font-medium ${sub}`}>
            {tr("Kutipan Harian Gili", "Gili Daily Quote")}
          </div>
        </div>
      );

    case "currency_gold":
      return (
        <div className="h-full flex flex-col justify-between">
          <span className={`text-[9.5px] font-bold uppercase tracking-wider ${accentLabel}`}>
            {tr("KURS USD / IDR", "USD / IDR RATE")}
          </span>
          <div>
            <div className="text-[26px] font-bold leading-none tabular-nums">Rp16.250</div>
            {size === "medium" && (
              <div className={`text-[10px] mt-1 tabular-nums ${sub}`}>
                EUR Rp17.640  SGD Rp12.110
              </div>
            )}
          </div>
          <div className="text-[10px] font-semibold text-amber-400 truncate">
            {tr("Emas/gr: Rp1.540.000", "Gold/gr: Rp1.540.000")}
          </div>
        </div>
      );

    case "hijri_holidays":
      return (
        <div className="h-full flex flex-col justify-between">
          <span className="text-[9.5px] font-bold uppercase tracking-wider text-emerald-400">
            {tr("KALENDER HIJRIYAH", "HIJRI CALENDAR")}
          </span>
          <div className="text-[16px] font-bold leading-tight">
            {tr("11 Jumadil Akhir 1448", "11 Jumada al-Akhirah 1448")}
          </div>
          <div className={`text-[10.5px] truncate ${sub}`}>
            {tr("25 Des . Hari Natal", "25 Dec . Public Holiday")}
          </div>
        </div>
      );

    case "quick_expense":
      return (
        <div className="h-full flex flex-col justify-between">
          <span className={`text-[9.5px] font-bold uppercase tracking-wider ${accentLabel}`}>
            {tr("PENGELUARAN", "EXPENSES")}
          </span>
          <div>
            <div className="text-[22px] font-bold leading-none tabular-nums">Rp1.250.000</div>
            <div className={`h-1.5 w-full rounded-full mt-2 overflow-hidden ${trackBg}`}>
              <div className="h-full w-[42%] rounded-full bg-blue-400" />
            </div>
          </div>
          <div className={`text-[10px] tabular-nums truncate ${sub}`}>
            {tr("Anggaran Rp3.000.000 (42%)", "Budget Rp3.000.000 (42%)")}
          </div>
        </div>
      );

    case "football_scores":
      return (
        <div className="h-full flex flex-col justify-between">
          <span className="text-[12.5px] font-semibold">
            {tr("Skor Pertandingan", "Match Scores")}
          </span>
          <div className="flex flex-col gap-1.5">
            {[
              ["Garuda FC vs Timur Utd", "2 - 1"],
              ["Nusantara vs Barat FC", "1 - 1"],
              ["Bandung vs Surabaya", "3 - 0"],
            ].map(([teams, score]) => (
              <div key={teams} className="flex items-center justify-between gap-2 text-[11px]">
                <span className="font-semibold truncate">{teams}</span>
                <span className="font-bold text-blue-400 tabular-nums shrink-0">{score}</span>
              </div>
            ))}
          </div>
        </div>
      );

    case "ai_quick_ask":
      return (
        <div className="h-full flex flex-col justify-between">
          <div className="flex items-center justify-between gap-2">
            <span className="text-[12px] font-semibold">
              {tr("Tanya Cepat AI", "Quick AI Ask")}
            </span>
            <span className="text-[9.5px] font-semibold text-blue-400">Gemini Flash</span>
          </div>
          <p className={`text-[10.5px] leading-snug line-clamp-2 ${sub}`}>
            {tr(
              "Ketuk tombol di bawah untuk mengetik pertanyaan singkat langsung dari desktop.",
              "Tap below to ask a quick question right from your desktop."
            )}
          </p>
          <div>
            <span className="inline-block px-2.5 py-0.5 rounded-full text-[10px] font-medium bg-blue-500/25">
              {tr("Tanya sesuatu...", "Ask something...")}
            </span>
          </div>
        </div>
      );

    default:
      return null;
  }
}
