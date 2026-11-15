import React, { useRef, useState } from "react";
import { AlignLeft, Check, Copy, Plus, Trash2 } from "lucide-react";
import { NavbarModuleProps } from "../registry";
import { NavbarPopoverShell, useNavbarIsLightSurface } from "./NavbarPopoverShell";
import { Tooltip } from "../../components/ui/Tooltip";
import { copyTextToClipboard } from "../../utils/clipboard";
import { makeTriggerA11yProps, TRIGGER_FOCUS_RING } from "../../utils/triggerA11y";
import { getNavbarTooltipSide, tx, useTaskbarLang } from "../../services/taskbarI18n";
import type { Language } from "../../services/i18n";

interface TextSnippet {
  id: string;
  code: string;
  text: string;
}

const SNIPPET_KEY = "gili_text_snippets_v1";

function getDefaultSnippets(lang: Language): TextSnippet[] {
  return [
    {
      id: "snip-tq",
      code: ";tq",
      text: tx(
        lang,
        "Thank you very much for your help.",
        "Terima kasih banyak atas bantuannya."
      ),
    },
    {
      id: "snip-mtg",
      code: ";mtg",
      text: tx(
        lang,
        "I would like to schedule a brief discussion.",
        "Mohon izin menjadwalkan diskusi singkat."
      ),
    },
  ];
}

function loadSnippets(lang: Language): TextSnippet[] {
  try {
    const raw = localStorage.getItem(SNIPPET_KEY);
    if (raw === null) {
      const defaults = getDefaultSnippets(lang);
      localStorage.setItem(SNIPPET_KEY, JSON.stringify(defaults));
      return defaults;
    }
    const arr = JSON.parse(raw);
    if (Array.isArray(arr)) {
      return arr.filter(
        (x): x is TextSnippet =>
          typeof x?.id === "string" &&
          typeof x?.code === "string" &&
          typeof x?.text === "string"
      );
    }
  } catch {}
  return [];
}

export const TextSnippetNavbarModule: React.FC<NavbarModuleProps> = ({
  view = "compact",
  config,
}) => {
  const lang = useTaskbarLang();
  const isLight = useNavbarIsLightSurface(config);
  const tooltipSide = getNavbarTooltipSide(config?.position);
  const isVertical = config?.position === "left" || config?.position === "right";
  const isCompact = view === "compact" || isVertical;
  const [isOpen, setIsOpen] = useState(false);
  const [snippets, setSnippets] = useState<TextSnippet[]>(() => loadSnippets(lang));
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [code, setCode] = useState("");
  const [text, setText] = useState("");
  const anchorRef = useRef<HTMLDivElement>(null);

  const persist = (next: TextSnippet[]) => {
    setSnippets(next);
    try {
      localStorage.setItem(SNIPPET_KEY, JSON.stringify(next));
    } catch {}
  };

  const handleCopy = async (item: TextSnippet, e?: React.MouseEvent) => {
    e?.stopPropagation();
    const ok = await copyTextToClipboard(item.text);
    if (ok) {
      setCopiedId(item.id);
      window.setTimeout(() => setCopiedId((cur) => (cur === item.id ? null : cur)), 1300);
    }
  };

  const handleAdd = (e: React.FormEvent) => {
    e.preventDefault();
    const cleanCode = code.trim();
    const cleanText = text.trim();
    if (!cleanCode || !cleanText) return;
    persist([
      ...snippets,
      {
        id: `${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        code: cleanCode.startsWith(";") ? cleanCode : `;${cleanCode}`,
        text: cleanText,
      },
    ]);
    setCode("");
    setText("");
  };

  const handleDelete = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    persist(snippets.filter((s) => s.id !== id));
  };

  const first = snippets[0];
  const handleToggle = () => setIsOpen((v) => !v);

  return (
    <>
      <Tooltip
        content={first ? `${first.code}: ${first.text}` : tx(lang, "Text snippet", "Text snippet")}
        side={tooltipSide}
        disabled={isOpen}
        isLightMode={isLight}
        wrapperClassName={isVertical ? "w-full" : undefined}
      >
        <div
          ref={anchorRef}
          onClick={handleToggle}
          {...makeTriggerA11yProps(handleToggle, "Text snippet", isOpen)}
          className={`flex items-center cursor-pointer select-none transition-all ${TRIGGER_FOCUS_RING} ${
            isCompact
              ? `${
                  isVertical ? "w-full max-w-full" : "w-10"
                } h-10 justify-center rounded-[12px] bg-white/[0.06] hover:bg-white/[0.11]`
              : "h-10 px-3 gap-2 rounded-[12px] bg-white/[0.06] hover:bg-white/[0.11] border border-white/[0.07]"
          }`}
        >
          <AlignLeft size={16} className="text-zinc-200 shrink-0" />
          {!isCompact && (
            first ? (
              <div className="flex items-center gap-1.5 min-w-0 max-w-[145px]">
                <span
                  className={`px-1.5 py-0.5 rounded-[5px] font-mono text-[10px] shrink-0 ${
                    isLight
                      ? "bg-black/[0.08] text-blue-700"
                      : "bg-white/[0.12] text-blue-300"
                  }`}
                >
                  {first.code}
                </span>
                <span className="text-[11px] text-zinc-200 truncate">{first.text}</span>
              </div>
            ) : (
              <span className="text-[11.5px] text-zinc-300 truncate max-w-[120px]">
                {tx(lang, "Empty snippets", "Snippet kosong")}
              </span>
            )
          )}
        </div>
      </Tooltip>

      <NavbarPopoverShell
        isOpen={isOpen}
        onClose={() => setIsOpen(false)}
        anchorRef={anchorRef}
        title="Text Snippet"
        moduleId="text_snippet"
        currentView={view}
        config={config}
        needsKeyboardFocus
        width={278}
      >
        <div className="flex flex-col gap-1.5 max-h-[175px] overflow-y-auto pr-0.5">
          {snippets.length === 0 ? (
            <div className="text-[11px] text-zinc-400 py-3 text-center">
              {tx(lang, "No saved snippets yet.", "Belum ada snippet tersimpan.")}
            </div>
          ) : (
            snippets.map((item) => {
              const isCopied = copiedId === item.id;
              return (
                <div
                  key={item.id}
                  className="w-full min-w-0 overflow-hidden flex items-center justify-between gap-2 px-2.5 py-2 rounded-[9px] bg-white/[0.04] border border-white/[0.08]"
                >
                  <div className="min-w-0 flex-1">
                    <div
                      className={`text-[10.5px] font-mono font-semibold truncate ${
                        isLight ? "text-blue-700" : "text-blue-300"
                      }`}
                    >
                      {item.code}
                    </div>
                    <div className="text-[11px] text-zinc-200 truncate">{item.text}</div>
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    <Tooltip
                      content={tx(lang, "Copy to clipboard", "Salin ke clipboard")}
                      side="top"
                      isLightMode={isLight}
                    >
                      <button
                        type="button"
                        onClick={(e) => handleCopy(item, e)}
                        aria-label={tx(lang, `Copy ${item.code}`, `Salin ${item.code}`)}
                        className={`w-6 h-6 rounded-[6px] bg-white/[0.08] hover:bg-white/[0.18] flex items-center justify-center text-zinc-200 cursor-pointer ${TRIGGER_FOCUS_RING}`}
                      >
                        {isCopied ? (
                          <Check size={12} className="text-emerald-400" />
                        ) : (
                          <Copy size={12} />
                        )}
                      </button>
                    </Tooltip>
                    <Tooltip
                      content={tx(lang, "Delete snippet", "Hapus snippet")}
                      side="top"
                      isLightMode={isLight}
                    >
                      <button
                        type="button"
                        onClick={(e) => handleDelete(item.id, e)}
                        aria-label={tx(lang, `Delete ${item.code}`, `Hapus ${item.code}`)}
                        className={`w-6 h-6 rounded-[6px] hover:bg-red-500/20 text-zinc-400 hover:text-rose-400 flex items-center justify-center cursor-pointer ${TRIGGER_FOCUS_RING}`}
                      >
                        <Trash2 size={12} />
                      </button>
                    </Tooltip>
                  </div>
                </div>
              );
            })
          )}
        </div>

        <form onSubmit={handleAdd} className="flex flex-col gap-1.5 pt-2 border-t border-white/[0.08]">
          <div className="flex items-center gap-1.5">
            <input
              type="text"
              value={code}
              onChange={(e) => setCode(e.target.value)}
              onKeyDown={(e) => {
                if (e.key !== "Escape") e.stopPropagation();
              }}
              placeholder={tx(lang, ";code", ";kode")}
              className={`w-[72px] shrink-0 h-7 px-2 rounded-[7px] border text-[11px] font-mono outline-none ${TRIGGER_FOCUS_RING} ${
                isLight
                  ? "bg-black/[0.06] border-black/15 text-zinc-900 placeholder:text-zinc-500 focus:border-blue-600"
                  : "bg-black/50 border-white/15 text-white focus:border-blue-400"
              }`}
            />
            <input
              type="text"
              value={text}
              onChange={(e) => setText(e.target.value)}
              onKeyDown={(e) => {
                if (e.key !== "Escape") e.stopPropagation();
              }}
              placeholder={tx(lang, "Template phrase...", "Kalimat template...")}
              className={`flex-1 min-w-0 h-7 px-2 rounded-[7px] border text-[11px] outline-none ${TRIGGER_FOCUS_RING} ${
                isLight
                  ? "bg-black/[0.06] border-black/15 text-zinc-900 placeholder:text-zinc-500 focus:border-blue-600"
                  : "bg-black/50 border-white/15 text-white focus:border-blue-400"
              }`}
            />
            <Tooltip
              content={tx(lang, "Add snippet", "Tambah snippet")}
              side="top"
              isLightMode={isLight}
            >
              <button
                type="submit"
                aria-label={tx(lang, "Add snippet", "Tambah snippet")}
                className={`w-7 h-7 rounded-[7px] bg-[#3882F6] hover:bg-blue-500 text-[#ffffff] flex items-center justify-center shrink-0 cursor-pointer ${TRIGGER_FOCUS_RING}`}
              >
                <Plus size={13} />
              </button>
            </Tooltip>
          </div>
        </form>
      </NavbarPopoverShell>
    </>
  );
};
