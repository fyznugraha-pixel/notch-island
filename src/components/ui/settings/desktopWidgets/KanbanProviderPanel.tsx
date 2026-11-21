import React, { useEffect, useState } from "react";
import { ArrowLeft, ArrowRight, Plus, Trash2 } from "lucide-react";
import {
  addWidgetKanbanCard,
  deleteWidgetKanbanCard,
  getWidgetKanbanBoard,
  KanbanBoard,
  KanbanColumn,
  moveWidgetKanbanCard,
} from "../../../../services/desktopWidgetsService";

interface KanbanProviderPanelProps {
  isLightMode: boolean;
  isId: boolean;
  inputCls: string;
  labelCls: string;
  primaryBtn: string;
  hintCls: string;
  refreshNonce?: number;
  onFlash: (msg: string) => void;
}

const EMPTY_BOARD: KanbanBoard = { todo: [], doing: [], done: [] };

export const KanbanProviderPanel: React.FC<KanbanProviderPanelProps> = ({
  isLightMode,
  isId,
  inputCls,
  labelCls,
  primaryBtn,
  hintCls,
  refreshNonce = 0,
  onFlash,
}) => {
  const [board, setBoard] = useState<KanbanBoard>(EMPTY_BOARD);
  const [title, setTitle] = useState("");
  const [column, setColumn] = useState<KanbanColumn>("todo");
  const [busy, setBusy] = useState(false);

  const loadBoard = () => {
    getWidgetKanbanBoard()
      .then(setBoard)
      .catch(() => {});
  };

  useEffect(() => {
    loadBoard();
  }, [refreshNonce]);

  const handleAdd = async () => {
    const clean = title.trim();
    if (!clean || busy) return;
    setBusy(true);
    try {
      const next = await addWidgetKanbanCard(clean, column);
      setBoard(next);
      setTitle("");
      onFlash(isId ? "Kartu Kanban ditambahkan." : "Kanban card added.");
    } catch (e) {
      onFlash(String(e));
    } finally {
      setBusy(false);
    }
  };

  const handleMove = async (cardId: string, toCol: KanbanColumn) => {
    try {
      const next = await moveWidgetKanbanCard(cardId, toCol);
      setBoard(next);
    } catch (e) {
      onFlash(String(e));
    }
  };

  const handleDelete = async (cardId: string) => {
    try {
      const next = await deleteWidgetKanbanCard(cardId);
      setBoard(next);
    } catch (e) {
      onFlash(String(e));
    }
  };

  const columns: {
    key: KanbanColumn;
    label: string;
    prev?: KanbanColumn;
    next?: KanbanColumn;
    dotCls: string;
  }[] = [
    { key: "todo", label: isId ? "Akan" : "To Do", next: "doing", dotCls: "bg-zinc-400" },
    { key: "doing", label: isId ? "Proses" : "Doing", prev: "todo", next: "done", dotCls: "bg-[#0a84ff]" },
    { key: "done", label: isId ? "Selesai" : "Done", prev: "doing", dotCls: "bg-[#34c759]" },
  ];

  const colBoxCls = isLightMode
    ? "rounded-[12px] border border-black/[0.08] bg-black/[0.02] p-2.5 flex flex-col gap-2"
    : "rounded-[12px] border border-white/[0.07] bg-white/[0.025] p-2.5 flex flex-col gap-2";

  const cardItemCls = isLightMode
    ? "rounded-[9px] border border-black/[0.08] bg-white px-2.5 py-2 flex flex-col gap-1.5"
    : "rounded-[9px] border border-white/[0.08] bg-[#1a1b22] px-2.5 py-2 flex flex-col gap-1.5";

  const iconBtnCls = isLightMode
    ? "w-6 h-6 rounded-[6px] flex items-center justify-center text-neutral-600 hover:bg-black/[0.06] cursor-pointer"
    : "w-6 h-6 rounded-[6px] flex items-center justify-center text-zinc-300 hover:bg-white/[0.08] cursor-pointer";

  return (
    <div className="flex flex-col gap-3">
      <div className="grid grid-cols-1 sm:grid-cols-[1fr_132px_auto] gap-2 items-end">
        <label className="flex flex-col gap-1">
          <span className={labelCls}>{isId ? "Judul Kartu Tugas" : "Task Card Title"}</span>
          <input
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                void handleAdd();
              }
            }}
            placeholder={isId ? "Contoh: Rapikan desain dashboard" : "Example: Polish dashboard layout"}
            className={inputCls}
          />
        </label>
        <label className="flex flex-col gap-1">
          <span className={labelCls}>{isId ? "Kolom Awal" : "Column"}</span>
          <select
            value={column}
            onChange={(e) => setColumn(e.target.value as KanbanColumn)}
            className={inputCls}
          >
            <option value="todo">{isId ? "Akan" : "To Do"}</option>
            <option value="doing">{isId ? "Proses" : "Doing"}</option>
            <option value="done">{isId ? "Selesai" : "Done"}</option>
          </select>
        </label>
        <button
          type="button"
          disabled={busy || !title.trim()}
          onClick={() => void handleAdd()}
          className={`${primaryBtn} flex items-center justify-center gap-1.5 disabled:opacity-50`}
        >
          <Plus size={14} /> {isId ? "Tambah" : "Add"}
        </button>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
        {columns.map((col) => {
          const cards = board[col.key] ?? [];
          return (
            <div key={col.key} className={colBoxCls}>
              <div className="flex items-center justify-between gap-1.5">
                <div className="flex items-center gap-1.5">
                  <span className={`w-2 h-2 rounded-full ${col.dotCls}`} />
                  <span className="text-[11.5px] font-semibold">{col.label}</span>
                </div>
                <span className={`text-[10.5px] tabular-nums ${isLightMode ? "text-neutral-500" : "text-zinc-400"}`}>
                  {cards.length}
                </span>
              </div>
              {cards.length === 0 ? (
                <div className={`text-[11px] py-2 text-center ${isLightMode ? "text-neutral-400" : "text-zinc-500"}`}>
                  {isId ? "Kosong" : "Empty"}
                </div>
              ) : (
                <div className="flex flex-col gap-1.5">
                  {cards.map((card) => (
                    <div key={card.id} className={cardItemCls}>
                      <div className="text-[11.5px] font-medium leading-snug break-words">
                        {card.title}
                      </div>
                      <div className="flex items-center justify-between gap-1 pt-0.5">
                        <div className="flex items-center gap-0.5">
                          {col.prev && (
                            <button
                              type="button"
                              onClick={() => void handleMove(card.id, col.prev!)}
                              title={isId ? "Pindah ke kolom sebelumnya" : "Move to previous column"}
                              className={iconBtnCls}
                            >
                              <ArrowLeft size={12} />
                            </button>
                          )}
                          {col.next && (
                            <button
                              type="button"
                              onClick={() => void handleMove(card.id, col.next!)}
                              title={isId ? "Pindah ke kolom berikutnya" : "Move to next column"}
                              className={iconBtnCls}
                            >
                              <ArrowRight size={12} />
                            </button>
                          )}
                        </div>
                        <button
                          type="button"
                          onClick={() => void handleDelete(card.id)}
                          title={isId ? "Hapus kartu" : "Delete card"}
                          className="w-6 h-6 rounded-[6px] flex items-center justify-center text-red-400 hover:bg-red-500/15 cursor-pointer"
                        >
                          <Trash2 size={12} />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>

      <span className={hintCls}>
        {isId
          ? "Di widget desktop: klik kartu untuk memindahkannya ke kolom berikutnya, klik x untuk hapus, atau klik + Kartu untuk membuka panel ini."
          : "On the desktop widget: click a card to advance it to the next column, click x to delete, or click + Card to open this panel."}
      </span>
    </div>
  );
};
