import React, { useState, useRef, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Trash2,
  Check,
  ExternalLink,
  Upload,
  Plus,
  X,
  FileText,
  Image as ImageIcon,
  Film,
  Music,
  Archive,
  Code2,
  File,
  ChevronLeft,
  ChevronRight,
  GripHorizontal,
} from "lucide-react";
import { invoke } from "@tauri-apps/api/core";
import { startDrag } from "@crabnebula/tauri-plugin-drag";
import { Tooltip } from "./Tooltip";
import { getWheelVerticalDirection, getNormalizedHorizontalDelta } from "../../utils/gesture";
import { t, getLanguage } from "../../services/i18n";
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
  if (
    [
      "png",
      "jpg",
      "jpeg",
      "webp",
      "gif",
      "svg",
      "bmp",
      "ico",
      "mp4",
      "mkv",
      "avi",
      "mov",
      "webm",
      "mp3",
      "wav",
      "flac",
      "m4a",
      "ogg",
    ].includes(e)
  ) {
    return {
      icon: ["mp4", "mkv", "avi", "mov", "webm"].includes(e)
        ? Film
        : ["mp3", "wav", "flac", "m4a", "ogg"].includes(e)
        ? Music
        : ImageIcon,
      color: "text-sky-300",
    };
  }
  if (
    [
      "pdf",
      "doc",
      "docx",
      "txt",
      "rtf",
      "xls",
      "xlsx",
      "ppt",
      "pptx",
      "ts",
      "tsx",
      "js",
      "jsx",
      "json",
      "rs",
      "py",
      "html",
      "css",
      "c",
      "cpp",
    ].includes(e)
  ) {
    return {
      icon: ["ts", "tsx", "js", "jsx", "json", "rs", "py", "html", "css", "c", "cpp"].includes(e)
        ? Code2
        : FileText,
      color: "text-white/90",
    };
  }
  if (["zip", "rar", "7z", "tar", "gz", "bz2"].includes(e)) {
    return { icon: Archive, color: "text-amber-300" };
  }
  return { icon: File, color: "text-white/60" };
}

export const DropShelfPanel = React.memo<DropShelfPanelProps>(
  ({
    files,
    onRemoveFile,
    onRemoveFiles,
    onClearAll,
    onFileTransferred,
    onFilesTransferred,
    onAddFiles,
    onDragStateChange,
  }) => {
    const isEn = getLanguage() === "en";
    const [copiedId, setCopiedId] = useState<string | null>(null);
    const [previews, setPreviews] = useState<Record<string, FilePreview>>({});
    const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
    const [isHoveringDrop, setIsHoveringDrop] = useState(false);
    const isDraggingRef = useRef(false);
    const isMountedRef = useRef(true);

    const handleChooseFiles = async () => {
      if (!onAddFiles) return;
      try {
        const selected = await invoke<string[]>("pick_files_dialog");
        if (selected && Array.isArray(selected) && selected.length > 0) {
          onAddFiles(selected);
        }
      } catch (err) {
        console.error("Failed to pick files:", err);
      }
    };

    useEffect(() => {
      isMountedRef.current = true;
      return () => {
        isMountedRef.current = false;
      };
    }, []);

    const scrollRef = useRef<HTMLDivElement>(null);
    const [canScrollLeft, setCanScrollLeft] = useState(false);
    const [canScrollRight, setCanScrollRight] = useState(false);

    useEffect(() => {
      const unsubscribe = queueFilePreviews(files, (batch) => {
        setPreviews((prev) => ({ ...prev, ...batch }));
      });
      return unsubscribe;
    }, [files]);

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
        const offset = direction === "left" ? -190 : 190;
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

    const executeNativeDrag = async (targetFiles: StashedFile[]) => {
      if (targetFiles.length === 0) return;
      const paths = targetFiles.map((f) => f.path);
      isDraggingRef.current = true;
      onDragStateChange?.(true, paths);

      try {
        await invoke("set_shelf_drag", { active: true });
        const thumb = targetFiles[0].thumbnail;
        const icon =
          thumb && thumb.startsWith("data:image/png;base64,") ? thumb : targetFiles[0].path;
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

    const handleDragSelected = (e: React.DragEvent) => {
      e.preventDefault();
      const targetFiles = files.filter((f) => selectedIds.has(f.id));
      executeNativeDrag(targetFiles);
    };

    const handleDragStart = (e: React.DragEvent, file: StashedFile) => {
      e.preventDefault();
      const isMulti = selectedIds.has(file.id) && selectedIds.size > 1;
      const targetFiles = isMulti ? files.filter((f) => selectedIds.has(f.id)) : [file];
      executeNativeDrag(targetFiles);
    };

    return (
      <div
        data-scrollable="true"
        data-no-swipe="true"
        className="flex flex-col w-full h-full min-h-0 select-none overflow-hidden px-6 pb-1"
        onDragOver={(e) => {
          e.preventDefault();
          e.stopPropagation();
          if (!isDraggingRef.current) {
            setIsHoveringDrop(true);
          }
        }}
        onDragLeave={() => setIsHoveringDrop(false)}
        onDrop={(e) => {
          e.preventDefault();
          e.stopPropagation();
          setIsHoveringDrop(false);
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
        {files.length === 0 ? (
          /* Empty / Active Drop Zone */
          <div
            className={`flex-1 my-1.5 rounded-[20px] flex flex-col items-center justify-center gap-1.5 px-6 text-center transition-all ${
              isHoveringDrop
                ? "border-2 border-[#3882F6] bg-[rgba(56,130,246,0.08)] shadow-[0_0_24px_rgba(56,130,246,0.2)]"
                : "border-[1.5px] border-dashed border-white/10 hover:border-white/20 bg-[#0d0d12]"
            }`}
          >
            <div
              className={`w-10 h-10 rounded-xl flex items-center justify-center transition-all ${
                isHoveringDrop
                  ? "bg-[#3882F6] text-white scale-110 shadow-lg shadow-[#3882F6]/30"
                  : "bg-white/[0.06] border border-white/8 text-zinc-300"
              }`}
            >
              <Upload size={19} strokeWidth={2} />
            </div>
            <div className="text-[14px] font-semibold text-white tracking-tight">
              {isHoveringDrop ? t("drag_drop_title") : t("shelf_drop_here")}
            </div>
            <div className="text-[11px] leading-relaxed text-zinc-400 max-w-[340px]">
              {t("shelf_drop_desc")}
            </div>
            {!isHoveringDrop && (
              <button
                type="button"
                onClick={handleChooseFiles}
                className="mt-1 h-7 px-3.5 rounded-full border border-white/12 hover:border-white/25 bg-white/[0.04] hover:bg-white/[0.08] text-zinc-200 text-[11px] font-medium transition-colors cursor-pointer"
              >
                {t("shelf_choose_files")}
              </button>
            )}
          </div>
        ) : (
          /* Filled State */
          <>
            {/* Toolbar: summary left, clean actions right */}
            <div className="flex items-center gap-2 mt-0.5 mb-1.5 h-[28px] shrink-0">
              <div className="flex items-center gap-2">
                <span className="px-2.5 py-0.5 rounded-full bg-white/[0.07] border border-white/8 text-[11px] font-medium text-zinc-200 tabular-nums">
                  {files.length} {files.length === 1 ? "file" : "files"}
                </span>
                {selectedIds.size > 0 && (
                  <span className="text-[10.5px] font-medium text-[#3882F6] tabular-nums">
                    · {t("shelf_selected_count", { count: selectedIds.size })}
                  </span>
                )}
              </div>

              <div className="flex-1" />

              {selectedIds.size > 0 && (
                <div
                  draggable
                  onDragStart={(e) => handleDragSelected(e as any)}
                  className="h-[26px] px-2.5 bg-[#3882F6] hover:bg-[#2563eb] text-white rounded-lg text-[11px] font-medium transition-colors flex items-center gap-1.5 cursor-grab active:cursor-grabbing shadow-sm shadow-[#3882F6]/30"
                >
                  <GripHorizontal size={12.5} />
                  <span>{t("shelf_drag_all", { count: selectedIds.size })}</span>
                </div>
              )}

              <button
                type="button"
                onClick={handleChooseFiles}
                className="h-[26px] px-2.5 rounded-lg bg-white/[0.05] hover:bg-white/[0.09] border border-white/8 text-zinc-200 hover:text-white text-[11px] font-medium transition-colors flex items-center gap-1.5 cursor-pointer"
                title={t("shelf_choose_files")}
              >
                <Plus size={12.5} strokeWidth={2.2} />
                <span>{t("shelf_choose_files")?.replace(/\.\.\.$/, "") || t("shelf_add")}</span>
              </button>

              <button
                type="button"
                onClick={toggleSelectAll}
                className="h-[26px] px-2.5 rounded-lg bg-white/[0.04] hover:bg-white/[0.08] text-zinc-300 hover:text-white text-[11px] font-medium transition-colors cursor-pointer"
              >
                {isAllSelected ? t("shelf_deselect_all") : t("shelf_select_all")}
              </button>

              <button
                type="button"
                onClick={handleDelete}
                className="h-[26px] px-2.5 rounded-lg bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 hover:text-rose-300 text-[11px] font-medium flex items-center gap-1.5 transition-colors cursor-pointer"
              >
                <Trash2 size={11.5} />
                <span>
                  {selectedIds.size > 0 && selectedIds.size < files.length
                    ? t("shelf_delete_selected", { count: selectedIds.size })
                    : t("shelf_clear_btn")}
                </span>
              </button>
            </div>

            {/* File Row */}
            <div className="relative flex-1 flex items-center min-h-0 overflow-hidden">
              {canScrollLeft && (
                <button
                  onClick={() => handleScrollStep("left")}
                  className="absolute left-0 top-[34px] z-20 w-7 h-7 rounded-full bg-black/85 hover:bg-black text-white/90 hover:text-white border border-white/15 flex items-center justify-center shadow-lg transition-transform hover:scale-105 active:scale-95 cursor-pointer backdrop-blur-md"
                  aria-label={isEn ? "Scroll left" : "Gulir ke kiri"}
                >
                  <ChevronLeft size={15} />
                </button>
              )}

              <div
                ref={scrollRef}
                data-scrollable="true"
                data-no-swipe="true"
                onScroll={checkScroll}
                onWheel={(e) => {
                  if (scrollRef.current) {
                    e.stopPropagation();
                    const isHoriz = Math.abs(e.deltaX) > Math.abs(e.deltaY);
                    const delta = isHoriz
                      ? getNormalizedHorizontalDelta(e)
                      : (getWheelVerticalDirection(e) > 0 ? -Math.abs(e.deltaY) : Math.abs(e.deltaY));
                    const { scrollLeft, scrollWidth, clientWidth } = scrollRef.current;
                    const maxScroll = Math.max(0, scrollWidth - clientWidth);
                    scrollRef.current.scrollLeft = Math.max(0, Math.min(maxScroll, scrollLeft + delta));
                  }
                }}
                className="notes-horizontal-scroll flex items-start gap-2.5 overflow-x-auto overflow-y-hidden no-scrollbar w-full py-0.5 select-none"
              >
                <AnimatePresence initial={false}>
                  {files.map((file) => {
                    const preview = previews[file.id] || getCachedPreview(file.id);
                    const thumb = file.thumbnail || preview?.thumbnail;
                    const sizeText =
                      file.sizeFormatted ||
                      preview?.sizeFormatted ||
                      (file.ext ? file.ext.toUpperCase().replace(/^\./, "") : "FILE");
                    const isCopied = copiedId === file.id;
                    const isSelected = selectedIds.has(file.id);
                    const { icon: IconComponent, color } = getFileIcon(file.ext);
                    const extBadge = (file.ext || "").replace(/^\./, "").toUpperCase() || "FILE";

                    return (
                      <motion.div
                        key={file.id}
                        layout
                        initial={{ opacity: 0, scale: 0.94 }}
                        animate={{ opacity: 1, scale: 1 }}
                        exit={{ opacity: 0, scale: 0.94, transition: { duration: 0.15 } }}
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
                        className="group w-[138px] shrink-0 flex flex-col gap-1 cursor-grab active:cursor-grabbing select-none"
                      >
                        <div
                          className={`relative w-[138px] h-[94px] rounded-[14px] bg-[#121217] flex items-center justify-center overflow-hidden transition-all ${
                            isSelected
                              ? "border-2 border-[#3882F6] shadow-[0_0_12px_rgba(56,130,246,0.3)] bg-[#3882F6]/5"
                              : "border border-white/10 group-hover:border-white/20 group-hover:bg-[#16161d]"
                          }`}
                        >
                          {thumb ? (
                            <img
                              src={thumb}
                              alt={file.name}
                              className="w-full h-full object-contain p-1.5 select-none pointer-events-none"
                            />
                          ) : (
                            <div className="flex flex-col items-center justify-center gap-1">
                              <IconComponent size={28} className={color} strokeWidth={1.8} />
                            </div>
                          )}

                          {/* Top-Left Selection Circle */}
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              toggleSelectFile(file.id);
                            }}
                            className={`absolute left-1.5 top-1.5 z-20 w-4.5 h-4.5 rounded-full flex items-center justify-center transition-all cursor-pointer ${
                              isSelected
                                ? "bg-[#3882F6] text-white opacity-100 shadow-sm"
                                : "border border-white/40 bg-black/50 text-transparent opacity-0 group-hover:opacity-100 hover:border-white"
                            }`}
                          >
                            <Check size={10} strokeWidth={3} />
                          </button>

                          {/* Top-Right Remove Button + Folder Button */}
                          <div className="absolute right-1.5 top-1.5 z-20 flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                            <Tooltip content={t("shelf_explorer")} side="top">
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleShowInFolder(file.path);
                                }}
                                className="w-4.5 h-4.5 rounded-full bg-black/70 hover:bg-white/20 text-white flex items-center justify-center transition-colors cursor-pointer border border-white/10"
                              >
                                <ExternalLink size={9.5} />
                              </button>
                            </Tooltip>
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                onRemoveFile(file.id);
                              }}
                              aria-label={isEn ? "Remove file" : "Hapus file"}
                              className="w-4.5 h-4.5 rounded-full bg-black/70 hover:bg-rose-500/80 text-white flex items-center justify-center transition-colors cursor-pointer border border-white/10"
                            >
                              <X size={9.5} strokeWidth={2.4} />
                            </button>
                          </div>

                          {/* Copied Overlay */}
                          {isCopied && (
                            <div className="absolute inset-0 bg-black/85 flex flex-col items-center justify-center gap-1 text-white z-30">
                              <Check size={15} className="text-[#13FF00]" strokeWidth={2.8} />
                              <span className="text-[10px] font-semibold">{t("shelf_copied")}</span>
                            </div>
                          )}
                        </div>

                        <div className="px-0.5 min-w-0">
                          <div
                            className="text-[11.5px] font-medium text-white/90 group-hover:text-white truncate transition-colors leading-tight"
                            title={file.name}
                          >
                            {file.name}
                          </div>
                          <div className="text-[10px] text-zinc-400 mt-0.5 truncate flex items-center gap-1.5">
                            <span className="font-semibold text-zinc-300 uppercase tracking-wider text-[8.5px] bg-white/[0.08] px-1 py-0.5 rounded leading-none">
                              {extBadge}
                            </span>
                            <span className="truncate">{sizeText}</span>
                          </div>
                        </div>
                      </motion.div>
                    );
                  })}
                </AnimatePresence>

                {/* Add Tile at the end of the row */}
                <button
                  type="button"
                  onClick={handleChooseFiles}
                  className="w-[138px] h-[94px] shrink-0 rounded-[14px] border border-dashed border-white/15 hover:border-white/30 hover:bg-white/[0.03] flex flex-col items-center justify-center gap-1 text-zinc-400 hover:text-white transition-colors cursor-pointer"
                >
                  <div className="w-7 h-7 rounded-full bg-white/[0.05] flex items-center justify-center">
                    <Plus size={14} strokeWidth={2.2} />
                  </div>
                  <span className="text-[10.5px] font-medium px-2 text-center text-zinc-400">
                    {t("shelf_drag_to_add")}
                  </span>
                </button>
              </div>

              {canScrollRight && (
                <button
                  onClick={() => handleScrollStep("right")}
                  className="absolute right-0 top-[34px] z-20 w-7 h-7 rounded-full bg-black/85 hover:bg-black text-white/90 hover:text-white border border-white/15 flex items-center justify-center shadow-lg transition-transform hover:scale-105 active:scale-95 cursor-pointer backdrop-blur-md"
                  aria-label={isEn ? "Scroll right" : "Gulir ke kanan"}
                >
                  <ChevronRight size={15} />
                </button>
              )}
            </div>
          </>
        )}
      </div>
    );
  }
);
