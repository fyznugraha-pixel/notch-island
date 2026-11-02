import React, { useState, useEffect, useRef } from "react";
import { Check, Plus, Trash2 } from "lucide-react";
import { NavbarModuleProps } from "../registry";
import { NavbarPopoverShell } from "./NavbarPopoverShell";

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
  const isCompact = view === "compact";
  const [isOpen, setIsOpen] = useState(false);
  const anchorRef = useRef<HTMLDivElement>(null);
  const [todos, setTodos] = useState<TodoItem[]>([]);
  const [newTask, setNewTask] = useState("");

  const loadTodos = () => {
    try {
      const raw = localStorage.getItem(TODOS_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) {
          setTodos(parsed);
          return;
        }
      }
      setTodos([
        { id: "td_1", text: "Tubes SIA BAB 1", completed: false },
        { id: "td_2", text: "Kirim laporan mingguan", completed: false },
      ]);
    } catch {}
  };

  useEffect(() => {
    loadTodos();
    const id = setInterval(loadTodos, 2500);
    return () => clearInterval(id);
  }, []);

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

  return (
    <>
      <div
        ref={anchorRef}
        onClick={() => setIsOpen((v) => !v)}
        className={`relative flex items-center cursor-pointer select-none transition-all ${
          isCompact
            ? "w-10 h-10 justify-center rounded-[12px] bg-white/[0.06] hover:bg-white/[0.11]"
            : "h-10 px-3 gap-2.5 rounded-[12px] bg-white/[0.06] hover:bg-white/[0.11] border border-white/[0.07]"
        }`}
        title={
          topTodo
            ? `Tugas fokus: ${topTodo.text} (${pendingTodos.length} belum selesai)`
            : "Semua tugas selesai — klik untuk kelola To-Do"
        }
      >
        {isCompact ? (
          <>
            <Check size={16} className="text-zinc-100" strokeWidth={2.2} />
            {pendingTodos.length > 0 && (
              <span className="absolute -top-1 -right-1 w-[16px] h-[16px] rounded-full bg-[#ef4444] text-[10px] font-bold text-white flex items-center justify-center shadow">
                {pendingTodos.length}
              </span>
            )}
          </>
        ) : (
          <>
            <button
              type="button"
              onClick={handleToggleTop}
              className={`w-[15px] h-[15px] rounded-full border-2 flex items-center justify-center transition-colors shrink-0 cursor-pointer ${
                topTodo
                  ? "border-zinc-400 hover:border-emerald-400 hover:bg-emerald-500/20"
                  : "border-emerald-400 bg-emerald-500/20 text-emerald-300"
              }`}
              title={topTodo ? "Centang selesai langsung dari bar" : "Selesai"}
            >
              {!topTodo && <Check size={9} strokeWidth={3} />}
            </button>
            <div className="flex flex-col leading-[1.15] min-w-0">
              <span className="text-[11.5px] font-semibold text-white truncate max-w-[125px]">
                {topTodo ? topTodo.text : "Semua tugas beres!"}
              </span>
              <span className="text-[10px] text-[#f87171]">
                {pendingTodos.length > 0
                  ? `${pendingTodos.length} tugas tersisa`
                  : "Klik untuk tambah"}
              </span>
            </div>
          </>
        )}
      </div>

      <NavbarPopoverShell
        isOpen={isOpen}
        onClose={() => setIsOpen(false)}
        anchorRef={anchorRef}
        title="To-Do Fokus"
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
              placeholder="Tulis tugas baru..."
              className="flex-1 min-w-0 h-7 px-2.5 rounded-[8px] bg-white/[0.06] border border-white/[0.1] text-[11.5px] text-white placeholder-zinc-500 outline-none focus:border-[#3882F6]"
            />
            <button
              type="submit"
              className="w-7 h-7 rounded-[8px] bg-[#3882F6] hover:bg-[#2563eb] text-white flex items-center justify-center transition-colors cursor-pointer shrink-0"
              title="Tambah tugas"
            >
              <Plus size={14} />
            </button>
          </form>

          <div className="flex flex-col gap-1 max-h-[170px] overflow-y-auto pr-0.5">
            {todos.length === 0 ? (
              <div className="text-[11px] text-zinc-500 py-3 text-center">
                Belum ada daftar tugas.
              </div>
            ) : (
              todos.map((item) => (
                <div
                  key={item.id}
                  className="flex items-center justify-between gap-2 px-2 py-1.5 rounded-[8px] bg-white/[0.04] hover:bg-white/[0.07] transition-colors"
                >
                  <button
                    type="button"
                    onClick={() => handleToggleItem(item.id)}
                    className="flex items-center gap-2 flex-1 min-w-0 text-left cursor-pointer"
                  >
                    <span
                      className={`w-4 h-4 rounded-full border flex items-center justify-center shrink-0 transition-colors ${
                        item.completed
                          ? "bg-emerald-500 border-emerald-500 text-white"
                          : "border-zinc-500 hover:border-emerald-400"
                      }`}
                    >
                      {item.completed && <Check size={10} strokeWidth={3} />}
                    </span>
                    <span
                      className={`text-[11.5px] truncate ${
                        item.completed
                          ? "line-through text-zinc-500"
                          : "text-zinc-100"
                      }`}
                    >
                      {item.text}
                    </span>
                  </button>
                  <button
                    type="button"
                    onClick={() => handleDeleteTodo(item.id)}
                    className="text-zinc-500 hover:text-rose-400 transition-colors cursor-pointer shrink-0"
                    title="Hapus"
                  >
                    <Trash2 size={12} />
                  </button>
                </div>
              ))
            )}
          </div>
        </div>
      </NavbarPopoverShell>
    </>
  );
};
