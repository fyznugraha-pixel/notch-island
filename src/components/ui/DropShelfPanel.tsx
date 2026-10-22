import React, { useState, useRef, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { 
  Trash2, 
  Check, 
  ExternalLink, 
  UploadCloud, 
  FileText, 
  Image as ImageIcon, 
  Film, 
  Music, 
  Archive, 
  Code2, 
  File, 
  ChevronLeft,
  ChevronRight,
  CheckSquare,
  GripHorizontal
} from "lucide-react";
import { invoke } from "@tauri-apps/api/core";
import { startDrag } from "@crabnebula/tauri-plugin-drag";
import { Tooltip } from "./Tooltip";
import { t } from "../../services/i18n";
import { FilePreview, queueFilePreviews, getCachedPreview } from "../../services/shelfService";

export interface StashedFile {
  id: string;
  name: string;
  path: string;
  ext: string;
  addedAt: number;
  sizeFormatted?: string;
  thumbnail?: string;
}

export interface DropShelfPanelProps {
  files: StashedFile[];
  onRemoveFile: (id: string) => void;
  onRemoveFiles?: (ids: string[]) => void;
  onClearAll: () => void;
  onFileTransferred?: (id: string) => void;
  onFilesTransferred?: (ids: string[]) => void;
  onAddFiles?: (paths: string[]) => void;
  onDragStateChange?: (active: boolean, paths?: string[]) => void;
}

function getFileIcon(ext: string) {
  const e = ext.toLowerCase().replace(/^\./, "");
  if (["png", "jpg", "jpeg", "webp", "gif", "svg", "bmp", "ico", "mp4", "mkv", "avi", "mov", "webm", "mp3", "wav", "flac", "m4a", "ogg"].includes(e)) {
    return { 
      icon: ["mp4", "mkv", "avi", "mov", "webm"].includes(e) ? Film : ["mp3", "wav", "flac", "m4a", "ogg"].includes(e) ? Music : ImageIcon, 
      color: "text-sky-300", 
      bg: "bg-sky-500/15 border-sky-500/25" 
    };
  }
  if (["pdf", "doc", "docx", "txt", "rtf", "xls", "xlsx", "ppt", "pptx", "ts", "tsx", "js", "jsx", "json", "rs", "py", "html", "css", "c", "cpp"].includes(e)) {
    return { 
      icon: ["ts", "tsx", "js", "jsx", "json", "rs", "py", "html", "css", "c", "cpp"].includes(e) ? Code2 : FileText, 
      color: "text-white/90", 
      bg: "bg-white/10 border-white/20" 
    };
  }
  if (["zip", "rar", "7z", "tar", "gz", "bz2"].includes(e)) {
    return { icon: Archive, color: "text-amber-300", bg: "bg-amber-500/15 border-amber-500/25" };
  }
  return { icon: File, color: "text-white/60", bg: "bg-white/5 border-white/10" };
}

export const DropShelfPanel = React.memo<DropShelfPanelProps>(({
  files,
  onRemoveFile,
  onRemoveFiles,
  onClearAll,
  onFileTransferred,
  onFilesTransferred,
  onAddFiles,
  onDragStateChange,
}) => {
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [previews, setPreviews] = useState<Record<string, FilePreview>>({});
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const isDraggingRef = useRef(false);
  const isMountedRef = useRef(true);
  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
    };
  }, []);
  const scrollRef = useRef<HTMLDivElement>(null);
  const [canScrollLeft, setCanScrollLeft] = useState(false);
  const [canScrollRight, setCanScrollRight] = useState(false);

  // Smooth background resolution using concurrency limiter and memory cache
  useEffect(() => {
    const unsubscribe = queueFilePreviews(files, (batch) => {
      setPreviews((prev) => ({ ...prev, ...batch }));
    });
    return unsubscribe;
  }, [files]);

  // Keep selection synchronized with available files
  useEffect(() => {
    setSelectedIds((prev) => {
      if (prev.size === 0) return prev;
      const currentIds = new Set(files.map((f) => f.id));
      const next = new Set([...prev].filter((id) => currentIds.has(id)));
      return next.size === prev.size ? prev : next;
    });
  }, [files]);

  const isAllSelected = files.length > 0 && selectedIds.size === files.length;

  const toggleSelectAll = () => {
    if (isAllSelected) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(files.map((f) => f.id)));
    }
  };

  const toggleSelectFile = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  const handleDelete = () => {
    if (selectedIds.size > 0 && selectedIds.size < files.length) {
      const ids = Array.from(selectedIds);
      if (onRemoveFiles) {
        onRemoveFiles(ids);
      } else {
        ids.forEach((id) => onRemoveFile(id));
      }
      setSelectedIds(new Set());
    } else {
      onClearAll();
      setSelectedIds(new Set());
    }
  };

  const checkScroll = () => {
    if (scrollRef.current) {
      const { scrollLeft, scrollWidth, clientWidth } = scrollRef.current;
      setCanScrollLeft(scrollLeft > 6);
      setCanScrollRight(scrollLeft + clientWidth < scrollWidth - 6);
    }
  };

  useEffect(() => {
    checkScroll();
  }, [files]);

  const handleScrollStep = (direction: "left" | "right") => {
    if (scrollRef.current) {
      const offset = direction === "left" ? -180 : 180;
      scrollRef.current.scrollBy({ left: offset, behavior: "smooth" });
    }
  };

  const handleCopyFile = (file: StashedFile) => {
    invoke("copy_file_to_clipboard", { path: file.path }).catch(console.error);
    setCopiedId(file.id);
    setTimeout(() => {
      setCopiedId((prev) => (prev === file.id ? null : prev));
    }, 1500);
  };

  const handleShowInFolder = (path: string) => {
    invoke("show_in_folder", { path }).catch(console.error);
  };

  // Native drag-out handler using tauri-plugin-drag
  const executeNativeDrag = async (targetFiles: StashedFile[]) => {
    if (targetFiles.length === 0) return;
    const paths = targetFiles.map((f) => f.path);
    isDraggingRef.current = true;
    onDragStateChange?.(true, paths);

    try {
      await invoke("set_shelf_drag", { active: true });
      const thumb = targetFiles[0].thumbnail;
      const icon = (thumb && thumb.startsWith("data:image/png;base64,")) ? thumb : targetFiles[0].path;
      await startDrag(
        {
          item: paths,
          icon,
          mode: "copy",
        },
        (payload) => {
          if (payload.result === "Dropped") {
            if (onFilesTransferred) {
              onFilesTransferred(targetFiles.map((f) => f.id));
            } else if (onFileTransferred) {
              targetFiles.forEach((f) => onFileTransferred(f.id));
            }
            if (isMountedRef.current) {
              setSelectedIds(new Set());
            }
          }
        }
      );
    } catch (err) {
      console.error("Native drag error:", err);
    } finally {
      try {
        await invoke("set_shelf_drag", { active: false });
      } catch (err) {
        console.error("Reset shelf drag error:", err);
      }
      onDragStateChange?.(false, []);
      setTimeout(() => {
        isDraggingRef.current = false;
      }, 200);
    }
  };

  // Drag selected files from header pill
  const handleDragSelected = (e: React.DragEvent) => {
    e.preventDefault();
    const targetFiles = files.filter((f) => selectedIds.has(f.id));
    executeNativeDrag(targetFiles);
  };

  // Drag from individual card: if item is selected in multi-select, drag all selected; else drag only this
  const handleDragStart = (e: React.DragEvent, file: StashedFile) => {
    e.preventDefault();
    const isMulti = selectedIds.has(file.id) && selectedIds.size > 1;
    const targetFiles = isMulti ? files.filter((f) => selectedIds.has(f.id)) : [file];
    executeNativeDrag(targetFiles);
  };

  return (
    <div 
      className="flex flex-col w-full h-full min-h-0 select-none overflow-hidden overflow-y-hidden px-3"
      onDragOver={(e) => {
        e.preventDefault();
        e.stopPropagation();
      }}
      onDrop={(e) => {
        e.preventDefault();
        e.stopPropagation();
        if (isDraggingRef.current) return;
        if (e.dataTransfer.files && e.dataTransfer.files.length > 0 && onAddFiles) {
          const paths: string[] = [];
          for (let i = 0; i < e.dataTransfer.files.length; i++) {
            const file = e.dataTransfer.files[i];
            const p = (file as any).path;
            if (typeof p === "string" && (p.includes("\\") || p.includes("/"))) {
              paths.push(p);
            }
          }
          if (paths.length > 0) {
            onAddFiles(paths);
          }
        }
      }}
    >
      {/* Subheader Row */}
      <div className="flex items-center justify-between pb-1 shrink-0 px-0.5">
        <div className="flex items-center gap-1.5 text-[10px]">
          <span className="font-semibold text-white/90">
            {files.length === 0 ? t("shelf_empty_badge") : t("shelf_files_count", { count: files.length })}
          </span>
          {files.length > 0 && (
            <span className="text-[9px] text-white/40 font-medium">
              {selectedIds.size > 0 
                ? t("shelf_selected_count", { count: selectedIds.size })
                : t("shelf_swipe_tip")}
            </span>
          )}
        </div>

        {files.length > 0 && (
          <div className="flex items-center gap-1.5">
            {/* Draggable Multi-File Pill */}
            {selectedIds.size > 0 && (
              <div
                draggable
                onDragStart={(e) => handleDragSelected(e as any)}
                className="py-0.5 px-2 bg-[#0a84ff] hover:bg-[#0071e3] active:scale-95 text-white rounded-lg text-[9.5px] font-semibold transition-all flex items-center gap-1 cursor-grab active:cursor-grabbing shadow-sm"
                title={t("shelf_drag_all", { count: selectedIds.size })}
              >
                <GripHorizontal size={10} />
                <span>{t("shelf_drag_all", { count: selectedIds.size })}</span>
              </div>
            )}

            {/* Select All / Deselect Button */}
            <button
              type="button"
              onClick={toggleSelectAll}
              className={`py-0.5 px-2 rounded-lg text-[9.5px] font-medium transition-all flex items-center gap-1 cursor-pointer active:scale-95 ${
                isAllSelected
                  ? "bg-[#0a84ff]/25 text-[#0a84ff] border border-[#0a84ff]/40 shadow-sm"
                  : selectedIds.size > 0
                  ? "bg-white/15 text-white border border-white/20"
                  : "bg-white/10 hover:bg-white/15 text-white/80 border border-white/10"
              }`}
            >
              <CheckSquare size={10} />
              <span>
                {isAllSelected
                  ? t("shelf_deselect_all")
                  : selectedIds.size > 0
                  ? `${t("shelf_select_all")} (${selectedIds.size})`
                  : t("shelf_select_all")}
              </span>
            </button>

            {/* Delete / Clear button */}
            <Tooltip
              content={
                selectedIds.size > 0 && selectedIds.size < files.length
                  ? t("shelf_delete_selected", { count: selectedIds.size })
                  : t("shelf_clear_all")
              }
              side="left"
            >
              <button
                type="button"
                onClick={handleDelete}
                className="py-0.5 px-2 bg-red-500/10 hover:bg-red-500/20 active:scale-95 text-red-400 hover:text-red-300 border border-red-500/20 rounded-lg text-[9.5px] font-medium transition-colors flex items-center gap-1 cursor-pointer"
              >
                <Trash2 size={10} />
                <span>
                  {selectedIds.size > 0 && selectedIds.size < files.length
                    ? t("shelf_delete_selected", { count: selectedIds.size })
                    : t("shelf_clear_btn")}
                </span>
              </button>
            </Tooltip>
          </div>
        )}
      </div>

      {/* Main Track: Strictly locked against vertical scroll */}
      <div className="relative w-full flex-1 flex items-center min-h-0 overflow-y-hidden overflow-x-hidden">
        {files.length === 0 ? (
          <div className="w-full h-[96px] border border-dashed border-white/15 bg-white/[0.03] rounded-2xl flex items-center justify-center gap-3 px-4 shadow-sm">
            <div className="w-9 h-9 rounded-xl bg-white/10 border border-white/10 flex items-center justify-center text-white/70 shrink-0">
              <UploadCloud size={18} />
            </div>
            <div className="flex flex-col min-w-0">
              <span className="text-[12px] font-semibold text-white/90 leading-tight">
                {t("shelf_drop_here")}
              </span>
              <span className="text-[10px] text-white/40 leading-tight mt-0.5">
                {t("shelf_drop_desc")}
              </span>
            </div>
          </div>
        ) : (
          <>
            {/* Scroll Left Button */}
            {canScrollLeft && (
              <button
                onClick={() => handleScrollStep("left")}
                className="absolute left-0 z-20 w-6 h-6 rounded-full bg-black/85 hover:bg-black text-white/80 hover:text-white border border-white/15 flex items-center justify-center shadow-lg transition-transform hover:scale-105 active:scale-95 cursor-pointer -translate-x-1"
                aria-label="Scroll left"
              >
                <ChevronLeft size={14} />
              </button>
            )}

            {/* Auto-layout Ribbon */}
            <div
              ref={scrollRef}
              onScroll={checkScroll}
              onWheel={(e) => {
                if (scrollRef.current) {
                  e.preventDefault();
                  e.stopPropagation();
                  scrollRef.current.scrollLeft += e.deltaY;
                }
              }}
              className="flex items-center gap-3.5 overflow-x-auto overflow-y-hidden no-scrollbar scroll-smooth w-full h-[142px] py-1 px-1 select-none"
            >
              <AnimatePresence initial={false}>
                {files.map((file) => {
                  const preview = previews[file.id] || getCachedPreview(file.id);
                  const thumb = file.thumbnail || preview?.thumbnail;
                  const sizeText = file.sizeFormatted || preview?.sizeFormatted || (file.ext ? file.ext.toUpperCase().replace(/^\./, "") : "FILE");
                  const isCopied = copiedId === file.id;
                  const isSelected = selectedIds.has(file.id);
                  const { icon: IconComponent, color, bg } = getFileIcon(file.ext);

                  return (
                    <motion.div
                      key={file.id}
                      layout
                      initial={{ opacity: 0, scale: 0.9 }}
                      animate={{ opacity: 1, scale: 1 }}
                      exit={{ opacity: 0, scale: 0.9, transition: { duration: 0.15 } }}
                      draggable
                      onDragStart={(e) => handleDragStart(e as any, file)}
                      onClick={() => {
                        if (isDraggingRef.current) return;
                        if (selectedIds.size > 0) {
                          toggleSelectFile(file.id);
                        } else {
                          handleCopyFile(file);
                        }
                      }}
                      className="group flex flex-col items-center justify-center shrink-0 cursor-grab active:cursor-grabbing select-none relative"
                    >
                      {/* Direct File/Thumbnail: Natural Aspect Ratio with iOS selection outline */}
                      <div className={`relative flex items-center justify-center shrink-0 rounded-xl overflow-hidden shadow-md group/thumb transition-all hover:scale-[1.03] active:scale-95 ${
                        isSelected ? "ring-2 ring-[#0a84ff] ring-offset-1 ring-offset-black/70" : ""
                      }`}>
                        {thumb ? (
                          <img
                            src={thumb}
                            alt={file.name}
                            className={`h-[88px] w-auto max-w-[130px] object-contain rounded-xl select-none pointer-events-none border transition-all shadow-sm ${
                              isSelected ? "border-[#0a84ff]/60" : "border-white/10 hover:border-white/25"
                            }`}
                          />
                        ) : (
                          <div className={`w-[74px] h-[88px] ${bg} rounded-xl border flex flex-col items-center justify-center gap-1.5 shadow-sm ${
                            isSelected ? "border-[#0a84ff]/60" : ""
                          }`}>
                            <IconComponent size={24} className={color} />
                            <span className="text-[8px] font-bold font-mono uppercase px-1.5 py-0.5 rounded bg-black/40 text-white/80 leading-none">
                              {file.ext.replace(/^\./, "") || "FILE"}
                            </span>
                          </div>
                        )}

                        {/* Top-Left Selection Checkbox */}
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            toggleSelectFile(file.id);
                          }}
                          className={`absolute top-1.5 left-1.5 z-20 w-4 h-4 rounded-full flex items-center justify-center transition-all ${
                            isSelected
                              ? "bg-[#0a84ff] text-white shadow-sm ring-1 ring-white/60 scale-100"
                              : "bg-black/60 border border-white/40 text-transparent opacity-0 group-hover/thumb:opacity-100 hover:border-white hover:scale-110"
                          }`}
                          title={isSelected ? t("shelf_deselect_all") : t("shelf_select_all")}
                        >
                          <Check size={9} strokeWidth={3} className={isSelected ? "opacity-100" : "opacity-0"} />
                        </button>

                        {/* Copied Overlay Badge */}
                        {isCopied && (
                          <div className="absolute inset-0 bg-black/90 flex flex-col items-center justify-center gap-0.5 text-white z-20 rounded-xl">
                            <Check size={16} className="text-[#34c759]" strokeWidth={2.5} />
                            <span className="text-[8.5px] font-semibold text-white/90">{t("shelf_copied")}</span>
                          </div>
                        )}

                        {/* Floating Quick Actions Overlay on Hover */}
                        <div className="absolute inset-0 bg-black/60 opacity-0 group-hover/thumb:opacity-100 transition-opacity flex items-center justify-center gap-1.5 z-10 rounded-xl">
                          <Tooltip content={t("shelf_explorer")} side="top">
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                handleShowInFolder(file.path);
                              }}
                              className="w-6 h-6 rounded-lg bg-white/25 hover:bg-white/40 active:scale-90 text-white flex items-center justify-center transition-all cursor-pointer shadow-sm"
                            >
                              <ExternalLink size={11} />
                            </button>
                          </Tooltip>

                          <Tooltip content={t("shelf_delete")} side="top">
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                onRemoveFile(file.id);
                              }}
                              className="w-6 h-6 rounded-lg bg-red-500/40 hover:bg-red-500/60 active:scale-90 text-red-200 flex items-center justify-center transition-all cursor-pointer shadow-sm"
                            >
                              <Trash2 size={11} />
                            </button>
                          </Tooltip>
                        </div>
                      </div>

                      {/* Info Directly Below File: File Name + File Size */}
                      <div className="w-full flex flex-col items-center min-w-0 mt-1.5 text-center px-0.5 max-w-[120px]">
                        <span
                          className={`w-full text-[10px] font-semibold truncate leading-tight tracking-tight ${
                            isSelected ? "text-[#0a84ff]" : "text-white/90"
                          }`}
                          title={file.name}
                        >
                          {file.name}
                        </span>
                        <span className="text-[8.5px] font-mono text-white/40 truncate leading-none mt-0.5">
                          {sizeText}
                        </span>
                      </div>
                    </motion.div>
                  );
                })}
              </AnimatePresence>
            </div>

            {/* Scroll Right Button */}
            {canScrollRight && (
              <button
                onClick={() => handleScrollStep("right")}
                className="absolute right-0 z-20 w-6 h-6 rounded-full bg-black/85 hover:bg-black text-white/80 hover:text-white border border-white/15 flex items-center justify-center shadow-lg transition-transform hover:scale-105 active:scale-95 cursor-pointer translate-x-1"
                aria-label="Scroll right"
              >
                <ChevronRight size={14} />
              </button>
            )}
          </>
        )}
      </div>
    </div>
  );
});
