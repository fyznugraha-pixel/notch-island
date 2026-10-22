import React, { useState, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Plus, Trash2, Check, Pencil } from "lucide-react";
import { t } from "../../services/i18n";

export interface TodoItem {
  id: string;
  text: string;
  completed: boolean;
  createdAt: number;
}

export interface TodoListPanelProps {
  items: TodoItem[];
  onAddItem: (text: string) => void;
  onToggleItem: (id: string) => void;
  onDeleteItem: (id: string) => void;
  onUpdateItem?: (id: string, text: string) => void;
  onClearCompleted?: () => void;
  onClearAll?: () => void;
}

const formatTaskTime = (timestamp?: number) => {
  if (!timestamp) return "";
  const date = new Date(timestamp);
  const hours = date.getHours().toString().padStart(2, "0");
  const minutes = date.getMinutes().toString().padStart(2, "0");
  return `${hours}:${minutes}`;
};

export const TodoListPanel = React.memo<TodoListPanelProps>(({
  items,
  onAddItem,
  onToggleItem,
  onDeleteItem,
  onUpdateItem,
}) => {
  const [inputText, setInputText] = useState("");
  const [isAdding, setIsAdding] = useState(false);
  const [isEditMode, setIsEditMode] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingText, setEditingText] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  const completedCount = items.filter((item) => item.completed).length;

  const handleStartAdding = () => {
    setIsEditMode(false);
    setEditingId(null);
    setIsAdding(true);
    setTimeout(() => inputRef.current?.focus(), 60);
  };

  const handleFinishAdding = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    const trimmed = inputText.trim();
    if (trimmed) {
      onAddItem(trimmed);
    }
    setInputText("");
    setIsAdding(false);
  };

  const handleSaveEdit = (id: string) => {
    const trimmed = editingText.trim();
    if (trimmed && onUpdateItem) {
      onUpdateItem(id, trimmed);
    }
    setEditingId(null);
    setEditingText("");
  };

  return (
    <div className="grid grid-cols-[125px_1fr] gap-3 w-full h-full min-h-0 select-none overflow-hidden px-3 pb-1">
      {/* Left Column: Stats & Frameless Action Links */}
      <div className="flex flex-col justify-between h-full py-1 border-r border-white/5 pr-2.5">
        <div>
          <div className="flex items-baseline gap-1 select-none">
            <span className="text-[28px] font-black text-white tracking-tight leading-none font-sans">
              {completedCount}
            </span>
            <span className="text-[15px] font-bold text-white/30 leading-none font-sans">
              /{items.length}
            </span>
          </div>

          <p className="text-[10px] font-medium text-white/50 tracking-tight leading-tight mt-1">
            {t("todo_done_today")}
          </p>
        </div>

        {/* Frameless Action Area: Add Task, Edit, Selesai (1 line, no box frame) */}
        <div className="flex items-center gap-2.5 mt-auto">
          {isAdding ? (
            <button
              type="button"
              onClick={handleFinishAdding}
              className="flex items-center gap-1 text-[#0a84ff] hover:text-[#0071e3] text-[11px] font-semibold transition-colors cursor-pointer whitespace-nowrap"
            >
              <Check size={13} strokeWidth={2.5} />
              <span>{t("todo_done")}</span>
            </button>
          ) : isEditMode ? (
            <button
              type="button"
              onClick={() => {
                setIsEditMode(false);
                setEditingId(null);
              }}
              className="flex items-center gap-1 text-[#0a84ff] hover:text-[#0071e3] text-[11px] font-semibold transition-colors cursor-pointer whitespace-nowrap"
            >
              <Check size={13} strokeWidth={2.5} />
              <span>{t("todo_done")}</span>
            </button>
          ) : (
            <div className="flex items-center gap-3 whitespace-nowrap">
              <button
                type="button"
                onClick={handleStartAdding}
                className="flex items-center gap-1 text-[#0a84ff] hover:text-[#0071e3] active:scale-95 text-[11px] font-semibold transition-colors cursor-pointer whitespace-nowrap"
              >
                <Plus size={13} strokeWidth={2.5} />
                <span>{t("todo_add_task")}</span>
              </button>

              {items.length > 0 && (
                <button
                  type="button"
                  onClick={() => setIsEditMode(true)}
                  className="flex items-center gap-1 text-white/50 hover:text-white text-[11px] font-medium transition-colors cursor-pointer whitespace-nowrap"
                >
                  <Pencil size={11} />
                  <span>{t("todo_edit")}</span>
                </button>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Right Column: Exactly 3 Tasks Visible + Vertical Scroll */}
      <div className="h-[99px] max-h-[99px] overflow-y-auto todo-scroll flex flex-col gap-1.5 pr-1 py-0.5">
        <AnimatePresence initial={false}>
          {/* Input field ONLY visible when Add Task is clicked, disappears on submit or Esc */}
          {isAdding && (
            <motion.form
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 29 }}
              exit={{ opacity: 0, height: 0 }}
              transition={{ duration: 0.15 }}
              onSubmit={handleFinishAdding}
              className="h-[29px] min-h-[29px] px-2.5 bg-white/10 rounded-xl flex items-center gap-2 shrink-0 shadow-sm"
            >
              <Plus size={12} className="text-[#0a84ff] shrink-0" strokeWidth={2.5} />
              <input
                ref={inputRef}
                type="text"
                value={inputText}
                onChange={(e) => setInputText(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Escape") {
                    setIsAdding(false);
                    setInputText("");
                  }
                }}
                placeholder={t("todo_placeholder")}
                className="flex-1 bg-transparent text-[11.5px] text-white placeholder-white/40 outline-none leading-none min-w-0 font-sans"
                autoFocus
              />
              <button
                type="submit"
                className="text-[#0a84ff] hover:text-[#0071e3] text-[10.5px] font-semibold transition-colors cursor-pointer whitespace-nowrap"
              >
                {t("todo_done")}
              </button>
            </motion.form>
          )}

          {items.length === 0 && !isAdding ? (
            <div
              onClick={handleStartAdding}
              className="h-full flex flex-col items-center justify-center text-center gap-1 rounded-xl bg-white/[0.02] hover:bg-white/[0.05] transition-colors cursor-pointer py-3"
            >
              <div className="flex items-center gap-1.5 text-white/50 text-[11px] font-medium">
                <Plus size={12} className="text-[#0a84ff]" />
                <span>{t("todo_empty")}</span>
              </div>
              <span className="text-[9.5px] text-white/30">{t("todo_empty_sub")}</span>
            </div>
          ) : (
            items.map((task) => (
              <motion.div
                key={task.id}
                layout
                initial={{ opacity: 0, y: 3 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.95 }}
                transition={{ duration: 0.14 }}
                className={`group h-[29px] min-h-[29px] px-2.5 rounded-xl flex items-center gap-2 transition-all shrink-0 select-none ${
                  task.completed
                    ? "bg-[#1c1c1e]/40 text-white/35"
                    : "bg-[#1c1c1e]/80 hover:bg-[#252528] text-white"
                }`}
              >
                {/* Checkbox (toggle completion) */}
                <button
                  type="button"
                  onClick={() => onToggleItem(task.id)}
                  className={`w-[15px] h-[15px] rounded-full flex items-center justify-center shrink-0 transition-all cursor-pointer ${
                    task.completed
                      ? "bg-[#0a84ff] text-white shadow-sm"
                      : "border-[1.5px] border-white/40 hover:border-[#0a84ff] active:scale-90 bg-transparent"
                  }`}
                >
                  {task.completed && <Check size={10} strokeWidth={3} className="text-white" />}
                </button>

                {/* Task Title or Inline Edit Input */}
                {editingId === task.id ? (
                  <form
                    onSubmit={(e) => {
                      e.preventDefault();
                      handleSaveEdit(task.id);
                    }}
                    className="flex-1 flex items-center gap-1.5 min-w-0"
                  >
                    <input
                      type="text"
                      value={editingText}
                      onChange={(e) => setEditingText(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Escape") {
                          setEditingId(null);
                        }
                      }}
                      onBlur={() => handleSaveEdit(task.id)}
                      autoFocus
                      className="flex-1 bg-transparent text-[11.5px] text-white outline-none border-b border-[#0a84ff] leading-none py-0.5"
                    />
                    <button
                      type="submit"
                      className="text-[#0a84ff] hover:text-[#0071e3] text-[10px] font-semibold cursor-pointer whitespace-nowrap"
                    >
                      {t("todo_done")}
                    </button>
                  </form>
                ) : (
                  <div
                    className="flex-1 min-w-0 flex items-center justify-between gap-1.5 overflow-hidden cursor-pointer"
                    onClick={() => {
                      if (isEditMode) {
                        setEditingId(task.id);
                        setEditingText(task.text);
                      } else {
                        onToggleItem(task.id);
                      }
                    }}
                    onDoubleClick={() => {
                      setEditingId(task.id);
                      setEditingText(task.text);
                    }}
                  >
                    <span
                      className={`text-[11.5px] leading-tight truncate ${
                        task.completed
                          ? "line-through text-white/35 font-normal"
                          : "text-white/90 font-medium"
                      }`}
                      title={task.text}
                    >
                      {task.text}
                    </span>

                    {task.createdAt && !isEditMode && (
                      <span className="text-[9px] font-sans text-white/30 shrink-0 tabular-nums">
                        {formatTaskTime(task.createdAt)}
                      </span>
                    )}
                  </div>
                )}

                {/* Edit Mode Buttons: Edit Title & Delete */}
                {isEditMode && (
                  <div className="flex items-center gap-1 shrink-0">
                    <button
                      type="button"
                      onClick={() => {
                        setEditingId(task.id);
                        setEditingText(task.text);
                      }}
                      className="w-5 h-5 rounded-md flex items-center justify-center text-white/50 hover:text-white transition-colors cursor-pointer"
                      title={t("todo_edit_tip")}
                    >
                      <Pencil size={11} />
                    </button>
                    <button
                      type="button"
                      onClick={() => onDeleteItem(task.id)}
                      className="w-5 h-5 rounded-md flex items-center justify-center text-white/40 hover:text-[#ff453a] hover:bg-red-500/15 transition-colors cursor-pointer"
                      title={t("todo_delete_tip")}
                    >
                      <Trash2 size={11} />
                    </button>
                  </div>
                )}
              </motion.div>
            ))
          )}
        </AnimatePresence>
      </div>
    </div>
  );
});
