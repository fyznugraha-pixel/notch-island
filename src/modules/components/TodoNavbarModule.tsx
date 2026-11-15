import React, { useState, useEffect, useRef, useCallback } from "react";
import { Check, Plus, Trash2 } from "lucide-react";
import { NavbarModuleProps } from "../registry";
import { NavbarPopoverShell, useNavbarIsLightSurface } from "./NavbarPopoverShell";
import { Tooltip } from "../../components/ui/Tooltip";
import { makeTriggerA11yProps, TRIGGER_FOCUS_RING } from "../../utils/triggerA11y";
import { getNavbarTooltipSide, tx, useTaskbarLang } from "../../services/taskbarI18n";

interface TodoItem {
  id: string;
  text: string;
  completed: boolean;
}

const TODOS_KEY = "gili_todos";

export const TodoNavbarModule: React.FC<NavbarModuleProps> = ({
  view = "compact",
  config,
}) => {
  const lang = useTaskbarLang();
  const isLight = useNavbarIsLightSurface(config);
  const tooltipSide = getNavbarTooltipSide(config?.position);
  const isVertical = config?.position === "left" || config?.position === "right";
  const isCompact = view === "compact" || isVertical;
  const [isOpen, setIsOpen] = useState(false);
  const [suppressOuterTip, setSuppressOuterTip] = useState(false);
  const anchorRef = useRef<HTMLDivElement>(null);
  const [todos, setTodos] = useState<TodoItem[]>([]);
  const [newTask, setNewTask] = useState("");

  const loadTodos = useCallback(() => {
    try {
      const raw = localStorage.getItem(TODOS_KEY);
      if (raw !== null) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) {
          setTodos(parsed);
          return;
        }
      }
      setTodos([
        {
          id: "td_1",
          text: tx(lang, "Review project milestones", "Tubes SIA BAB 1"),
          completed: false,
        },
        {
          id: "td_2",
          text: tx(lang, "Send weekly report", "Kirim laporan mingguan"),
          completed: false,
        },
      ]);
    } catch {}
  }, [lang]);

  useEffect(() => {
    loadTodos();
    const id = setInterval(loadTodos, 3000);
    const onStorage = (e: StorageEvent) => {
      if (e.key === TODOS_KEY) loadTodos();
    };
    window.addEventListener("storage", onStorage);
    return () => {
      clearInterval(id);
      window.removeEventListener("storage", onStorage);
    };
  }, [loadTodos]);

  const saveTodos = (next: TodoItem[]) => {
    setTodos(next);
    try {
      localStorage.setItem(TODOS_KEY, JSON.stringify(next));
    } catch {}
  };

  const pendingTodos = todos.filter((t) => !t.completed);
  const topTodo = pendingTodos[0];

  const handleToggleTop = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!topTodo) {
      setIsOpen((v) => !v);
      return;
    }
    const updated = todos.map((t) =>
      t.id === topTodo.id ? { ...t, completed: true } : t
    );
    saveTodos(updated);
  };

  const handleToggleItem = (id: string) => {
    saveTodos(
      todos.map((t) => (t.id === id ? { ...t, completed: !t.completed } : t))
    );
  };

  const handleAddTodo = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = newTask.trim();
    if (!trimmed) return;
    saveTodos([
      { id: `td_${Date.now()}`, text: trimmed, completed: false },
      ...todos,
    ]);
    setNewTask("");
  };

  const handleDeleteTodo = (id: string) => {
    saveTodos(todos.filter((t) => t.id !== id));
  };

  const handleTogglePopover = () => {
    if (!isOpen) loadTodos();
    setIsOpen((v) => !v);
  };

  const triggerTooltip = topTodo
    ? tx(
        lang,
        `Focus task: ${topTodo.text} (${pendingTodos.length} remaining)`,
        `Tugas fokus: ${topTodo.text} (${pendingTodos.length} belum selesai)`
      )
    : tx(
        lang,
        "All tasks completed · click to manage To-Do",
        "Semua tugas selesai · klik untuk kelola To-Do"
      );

  return (
    <>
      <Tooltip
        content={triggerTooltip}
        side={tooltipSide}
        disabled={isOpen || suppressOuterTip}
        isLightMode={isLight}
        wrapperClassName={isVertical ? "w-full" : undefined}
      >
        <div
          ref={anchorRef}
          onClick={handleTogglePopover}
          {...makeTriggerA11yProps(
            handleTogglePopover,
            topTodo
              ? tx(
                  lang,
                  `Focus To-Do: ${topTodo.text}, ${pendingTodos.length} left`,
                  `To-Do Fokus: ${topTodo.text}, ${pendingTodos.length} tersisa`
                )
              : tx(
                  lang,
                  "Focus To-Do: All done",
                  "To-Do Fokus: Semua selesai"
                ),
            isOpen
          )}
          className={`relative flex items-center cursor-pointer select-none transition-all ${TRIGGER_FOCUS_RING} ${
            isCompact
              ? `${
                  isVertical ? "w-full max-w-full" : "w-10"
                } h-10 justify-center rounded-[12px] bg-white/[0.06] hover:bg-white/[0.11]`
              : "h-10 px-3 gap-2.5 rounded-[12px] bg-white/[0.06] hover:bg-white/[0.11] border border-white/[0.07]"
          }`}
        >
          {isCompact ? (
            <>
              <Check size={16} className="text-zinc-100" strokeWidth={2.2} />
              {pendingTodos.length > 0 && (
                <span className="absolute -top-1 -right-1 w-[16px] h-[16px] rounded-full bg-[#ef4444] text-[10px] font-bold text-[#ffffff] flex items-center justify-center shadow tabular-nums">
                  {pendingTodos.length}
                </span>
              )}
            </>
          ) : (
            <>
              <div
                className="shrink-0 flex items-center"
                onMouseEnter={() => setSuppressOuterTip(true)}
                onMouseLeave={() => setSuppressOuterTip(false)}
              >
                <Tooltip
                  content={
                    topTodo
                      ? tx(
                          lang,
                          "Complete directly from bar",
                          "Centang selesai langsung dari bar"
                        )
                      : tx(lang, "Done", "Selesai")
                  }
                  side={tooltipSide}
                  isLightMode={isLight}
                >
                  <button
                    type="button"
                    onClick={handleToggleTop}
                    className={`w-[15px] h-[15px] rounded-full border-2 flex items-center justify-center transition-colors shrink-0 cursor-pointer ${TRIGGER_FOCUS_RING} ${
                      topTodo
                        ? "border-zinc-300 hover:border-emerald-400 hover:bg-emerald-500/20"
                        : "border-emerald-400 bg-emerald-500/20 text-emerald-300"
                    }`}
                  >
                    {!topTodo && <Check size={9} strokeWidth={3} />}
                  </button>
                </Tooltip>
              </div>
              <div className="flex flex-col leading-[1.15] min-w-0 max-w-[125px]">
                <span className="text-[11.5px] font-semibold text-white truncate">
                  {topTodo ? topTodo.text : tx(lang, "All tasks done!", "Semua tugas beres!")}
                </span>
                <span
                  className={`text-[10px] truncate ${
                    isLight ? "text-rose-600" : "text-[#f87171]"
                  }`}
                >
                  {pendingTodos.length > 0
                    ? lang === "en"
                      ? `${pendingTodos.length} ${
                          pendingTodos.length === 1 ? "task" : "tasks"
                        } left`
                      : `${pendingTodos.length} tugas tersisa`
                    : tx(lang, "Click to add", "Klik untuk tambah")}
                </span>
              </div>
            </>
          )}
        </div>
      </Tooltip>

      <NavbarPopoverShell
        isOpen={isOpen}
        onClose={() => setIsOpen(false)}
        anchorRef={anchorRef}
        title={tx(lang, "Focus To-Do", "To-Do Fokus")}
        moduleId="to_do_fokus"
        currentView={view}
        config={config}
        width={280}
        needsKeyboardFocus={true}
      >
        <div className="flex flex-col gap-2.5">
          <form onSubmit={handleAddTodo} className="flex items-center gap-1.5">
            <input
              type="text"
              value={newTask}
              onChange={(e) => setNewTask(e.target.value)}
              placeholder={tx(lang, "Write a new task...", "Tulis tugas baru...")}
              className={`flex-1 min-w-0 h-7 px-2.5 rounded-[8px] bg-white/[0.06] border border-white/[0.12] text-[11.5px] text-white placeholder-zinc-400 ${TRIGGER_FOCUS_RING}`}
            />
            <Tooltip
              content={tx(lang, "Add task", "Tambah tugas")}
              side="top"
              isLightMode={isLight}
            >
              <button
                type="submit"
                className={`w-7 h-7 rounded-[8px] bg-[#3882F6] hover:bg-[#2563eb] text-[#ffffff] flex items-center justify-center transition-colors cursor-pointer shrink-0 ${TRIGGER_FOCUS_RING}`}
              >
                <Plus size={14} />
              </button>
            </Tooltip>
          </form>

          <div className="flex flex-col gap-1 max-h-[170px] overflow-y-auto pr-0.5">
            {todos.length === 0 ? (
              <div className="text-[11px] text-zinc-400 py-3 text-center">
                {tx(lang, "No tasks yet.", "Belum ada daftar tugas.")}
              </div>
            ) : (
              todos.map((item) => (
                <div
                  key={item.id}
                  className="w-full min-w-0 overflow-hidden flex items-center justify-between gap-2 px-2 py-1.5 rounded-[8px] bg-white/[0.04] hover:bg-white/[0.07] transition-colors"
                >
                  <button
                    type="button"
                    onClick={() => handleToggleItem(item.id)}
                    className={`flex items-center gap-2 flex-1 min-w-0 text-left cursor-pointer rounded ${TRIGGER_FOCUS_RING}`}
                  >
                    <span
                      className={`w-4 h-4 rounded-full border flex items-center justify-center shrink-0 transition-colors ${
                        item.completed
                          ? "bg-emerald-500 border-emerald-500 text-[#ffffff]"
                          : "border-zinc-400 hover:border-emerald-400"
                      }`}
                    >
                      {item.completed && <Check size={10} strokeWidth={3} />}
                    </span>
                    <span
                      className={`text-[11.5px] truncate min-w-0 ${
                        item.completed
                          ? "line-through text-zinc-400"
                          : "text-zinc-100"
                      }`}
                    >
                      {item.text}
                    </span>
                  </button>
                  <Tooltip
                    content={tx(lang, "Delete", "Hapus")}
                    side="top"
                    isLightMode={isLight}
                  >
                    <button
                      type="button"
                      onClick={() => handleDeleteTodo(item.id)}
                      className={`text-zinc-400 hover:text-rose-400 transition-colors cursor-pointer shrink-0 p-1 rounded ${TRIGGER_FOCUS_RING}`}
                    >
                      <Trash2 size={12} />
                    </button>
                  </Tooltip>
                </div>
              ))
            )}
          </div>
        </div>
      </NavbarPopoverShell>
    </>
  );
};
