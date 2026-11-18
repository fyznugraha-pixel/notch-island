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
  Smartphone,
  Settings,
} from "lucide-react";
import { invoke, convertFileSrc } from "@tauri-apps/api/core";
import { startDrag } from "@crabnebula/tauri-plugin-drag";
import { Tooltip } from "./Tooltip";
import { getWheelVerticalDirection, getNormalizedHorizontalDelta } from "../../utils/gesture";
import { t, getLanguage } from "../../services/i18n";
import {
  FilePreview,
  queueFilePreviews,
  getCachedPreview,
  invalidateShelfVerification,
  loadShelfSettings,
} from "../../services/shelfService";
import { DropShelfSettingsView } from "./shelf/DropShelfSettingsView";
import { DropShelfTransferModal } from "./shelf/DropShelfTransferModal";
import { DropShelfReceivedBanner } from "./shelf/DropShelfReceivedBanner";
import {
  startShelfSend,
  startShelfReceive,
  stopShelfTransfer,
  getShelfTransferStatus,
  getMinimizedShelfSessionToken,
  setMinimizedShelfSessionToken,
  onShelfTransferProgress,
  onShelfTransferCompleted,
} from "../../services/shelfTransferService";
import {
  ShelfSessionInfo,
  ShelfTransferMode,
  ShelfTransferProgressPayload,
} from "../../types/shelfTransfer";


export interface StashedFile {
  id: string;
  name: string;
  path: string;
  ext: string;
  addedAt: number;
  sizeFormatted?: string;
  thumbnail?: string;
  source?: "local" | "phone";
  deviceName?: string;
  isNew?: boolean;
}

export interface DropShelfPanelProps {
  files: StashedFile[];
  onRemoveFile: (id: string) => void;
  onRemoveFiles?: (ids: string[]) => void;
  onClearAll: () => void;
  onFileTransferred?: (id: string) => void;
  onFilesTransferred?: (ids: string[]) => void;
  onAddFiles?: (
    paths: string[],
    meta?: {
      source?: "local" | "phone";
      deviceName?: string;
      isNew?: boolean;
      thumbnail?: string;
      sizeFormatted?: string;
    }
  ) => void;
  onDragStateChange?: (active: boolean, paths?: string[]) => void;
  isDragOver?: boolean;
  isLightMode?: boolean;
  showSettings?: boolean;
  onToggleSettings?: () => void;
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
    isDragOver = false,
    isLightMode = false,
    showSettings,
    onToggleSettings,
  }) => {
    const [internalShowSettings, setInternalShowSettings] = useState(false);
    const isShowingSettings = showSettings !== undefined ? showSettings : internalShowSettings;
    const isEn = getLanguage() === "en";
    const [copiedId, setCopiedId] = useState<string | null>(null);
    const [previews, setPreviews] = useState<Record<string, FilePreview>>(() => {
      const initial: Record<string, FilePreview> = {};
      for (const f of files) {
        const cached = getCachedPreview(f.id) || getCachedPreview(f.path);
        if (cached) {
          initial[f.id] = cached;
        } else if (f.thumbnail || f.sizeFormatted) {
          initial[f.id] = {
            thumbnail: f.thumbnail,
            sizeFormatted: f.sizeFormatted || "--",
          };
        }
      }
      return initial;
    });
    const [failedThumbIds, setFailedThumbIds] = useState<Set<string>>(new Set());
    const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
    const isDraggingRef = useRef(false);
    const isMountedRef = useRef(true);
    const [transferMode, setTransferMode] = useState<ShelfTransferMode>("idle");
    const [sessionInfo, setSessionInfo] = useState<ShelfSessionInfo | null>(null);
    const [incomingProgress, setIncomingProgress] = useState<Record<string, ShelfTransferProgressPayload>>({});
    const [activeDeviceName, setActiveDeviceName] = useState<string>("");
    const [receivedBanner, setReceivedBanner] = useState<{ count: number; deviceName: string } | null>(null);
    const [shareError, setShareError] = useState<string | null>(null);

    useEffect(() => {
      let isCancelled = false;
      let unlistenProgress: (() => void) | undefined;
      let unlistenComplete: (() => void) | undefined;

      getShelfTransferStatus()
        .then((status) => {
          if (isCancelled || !status || status.expires_in_sec <= 0) return;
          setSessionInfo(status);
          if (getMinimizedShelfSessionToken() !== status.token) {
            setTransferMode(status.mode);
          }
        })
        .catch(() => {});

      const initListeners = async () => {
        const uProgress = await onShelfTransferProgress((payload) => {
          setShareError(null);
          setMinimizedShelfSessionToken(null);
          setTransferMode("receiving");
          setActiveDeviceName(payload.device_name);
          setIncomingProgress((prev) => ({
            ...prev,
            [payload.id]: payload,
          }));
        });
        if (isCancelled) {
          uProgress();
          return;
        }
        unlistenProgress = uProgress;

        const uComplete = await onShelfTransferCompleted((payload) => {
          if (payload.total_files > 0) {
            setReceivedBanner({
              count: payload.total_files,
              deviceName: payload.device_name,
            });
            setShareError(null);
          } else {
            setReceivedBanner(null);
            setShareError(t("shelf_receive_failed"));
          }
          setIncomingProgress({});
          setTransferMode("idle");
          getShelfTransferStatus()
            .then((status) => {
              if (!isCancelled) {
                setSessionInfo(status && status.expires_in_sec > 0 ? status : null);
              }
            })
            .catch(() => {});
        });
        if (isCancelled) {
          uComplete();
          return;
        }
        unlistenComplete = uComplete;
      };

      initListeners();

      return () => {
        isCancelled = true;
        unlistenProgress?.();
        unlistenComplete?.();
      };
    }, []);

    const isFileMissing = (file: StashedFile) =>
      Boolean((previews[file.id] || getCachedPreview(file.id) || getCachedPreview(file.path))?.isMissing);

    const missingFiles = files.filter(isFileMissing);

    const handleCleanMissingFiles = () => {
      if (missingFiles.length === 0) return;
      const missingIds = missingFiles.map((f) => f.id);
      if (onRemoveFiles) {
        onRemoveFiles(missingIds);
      } else {
        missingIds.forEach((id) => onRemoveFile(id));
      }
      setShareError(null);
    };

    const handleSendSingleFile = async (targetFile: StashedFile) => {
      if (isFileMissing(targetFile)) {
        setShareError(t("shelf_cannot_share_missing", { names: targetFile.name }));
        return;
      }
      setShareError(null);
      try {
        const session = await startShelfSend([targetFile.path]);
        setSessionInfo(session);
        setTransferMode("send");
      } catch (err) {
        console.error("Failed to start shelf send for file:", err);
        setShareError(String(err));
        invalidateShelfVerification([targetFile.id]);
        queueFilePreviews([targetFile]);
      }
    };

    const handleStartSend = async () => {
      const candidateFiles = selectedIds.size > 0
        ? files.filter((f) => selectedIds.has(f.id))
        : files;
      if (candidateFiles.length === 0) return;
      const targetFiles = candidateFiles.filter((f) => !isFileMissing(f));
      if (targetFiles.length === 0) {
        const names = candidateFiles.map((f) => f.name).slice(0, 3).join(", ");
        setShareError(t("shelf_cannot_share_missing", { names }));
        return;
      }
      setShareError(null);
      try {
        const session = await startShelfSend(targetFiles.map((f) => f.path));
        setSessionInfo(session);
        setTransferMode("send");
      } catch (err) {
        console.error("Failed to start shelf send:", err);
        setShareError(String(err));
        invalidateShelfVerification(targetFiles.map((f) => f.id));
        queueFilePreviews(targetFiles);
      }
    };

    const handleStartReceive = async () => {
      setShareError(null);
      try {
        const session = await startShelfReceive();
        setSessionInfo(session);
        setTransferMode("receive");
      } catch (err) {
        console.error("Failed to start shelf receive:", err);
        setShareError(String(err));
      }
    };

    const handleHideTransferModal = () => {
      if (sessionInfo?.token) {
        setMinimizedShelfSessionToken(sessionInfo.token);
      }
      setTransferMode("idle");
    };

    const handleResumeTransferModal = async () => {
      setMinimizedShelfSessionToken(null);
      try {
        const latest = await getShelfTransferStatus();
        if (latest && latest.expires_in_sec > 0) {
          setSessionInfo(latest);
          setTransferMode(latest.mode);
          return;
        }
      } catch {}
      setSessionInfo(null);
      setTransferMode("idle");
    };

    const handleCancelTransfer = async () => {
      try {
        await stopShelfTransfer();
      } catch (err) {
        console.error("Error stopping transfer:", err);
      }
      setMinimizedShelfSessionToken(null);
      setTransferMode("idle");
      setSessionInfo(null);
      setIncomingProgress({});
    };


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
              const currentSettings = loadShelfSettings();
              if (currentSettings.autoRemoveOnDrop) {
                if (onFilesTransferred) {
                  onFilesTransferred(targetFiles.map((f) => f.id));
                } else if (onFileTransferred) {
                  targetFiles.forEach((f) => onFileTransferred(f.id));
                }
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

    const isDropActive = isDragOver;

    if (isShowingSettings) {
      return (
        <DropShelfSettingsView
          isLightMode={isLightMode}
          onBack={() => {
            if (onToggleSettings) onToggleSettings();
            else setInternalShowSettings(false);
          }}
        />
      );
    }

    const alertBanner = (shareError || missingFiles.length > 0) ? (
      <div
        className={`mb-1 px-2.5 py-1 rounded-lg border text-[10.5px] flex items-center justify-between gap-2 shrink-0 ${
          shareError
            ? isLightMode
              ? "bg-rose-500/10 border-rose-600/30 text-rose-700"
              : "bg-rose-500/12 border-rose-500/35 text-rose-300"
            : isLightMode
            ? "bg-amber-500/10 border-amber-600/30 text-amber-800"
            : "bg-amber-500/12 border-amber-500/35 text-amber-300"
        }`}
      >
        <span className="truncate">
          {shareError || t("shelf_missing_banner", { count: missingFiles.length })}
        </span>
        <div className="flex items-center gap-1.5 shrink-0">
          {missingFiles.length > 0 && (
            <button
              type="button"
              onClick={handleCleanMissingFiles}
              className={`px-2 py-0.5 rounded font-semibold cursor-pointer transition-colors ${
                isLightMode
                  ? "bg-amber-500/20 hover:bg-amber-500/30 text-amber-900"
                  : "bg-amber-500/20 hover:bg-amber-500/35 text-amber-200"
              }`}
            >
              {t("shelf_clean_missing")}
            </button>
          )}
          {shareError && (
            <button
              type="button"
              onClick={() => setShareError(null)}
              aria-label="Close"
              className={
                isLightMode
                  ? "text-rose-700 hover:text-rose-900 cursor-pointer"
                  : "text-rose-200 hover:text-white cursor-pointer"
              }
            >
              <X size={11} />
            </button>
          )}
        </div>
      </div>
    ) : null;

    const activeSessionPill =
      transferMode === "idle" && sessionInfo && sessionInfo.expires_in_sec > 0 ? (
        <div
          className={`mb-1 px-2.5 py-1 rounded-lg border text-[10.5px] flex items-center justify-between gap-2 shrink-0 ${
            isLightMode
              ? "bg-blue-500/10 border-blue-600/25 text-blue-800"
              : "bg-blue-500/12 border-blue-500/30 text-blue-200"
          }`}
        >
          <span className="flex items-center gap-1.5 truncate">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse shrink-0" />
            <span className="truncate">
              {sessionInfo.mode === "send"
                ? isEn
                  ? "LAN send session active"
                  : "Sesi kirim LAN masih aktif"
                : isEn
                ? "LAN receive session active"
                : "Sesi terima LAN masih aktif"}
            </span>
          </span>
          <div className="flex items-center gap-1.5 shrink-0">
            <button
              type="button"
              onClick={handleResumeTransferModal}
              className="px-2 py-0.5 rounded bg-[#3882F6] hover:bg-[#2563eb] text-white font-semibold cursor-pointer transition-colors"
            >
              {isEn ? "Open QR" : "Buka QR"}
            </button>
            <button
              type="button"
              onClick={handleCancelTransfer}
              className={`px-2 py-0.5 rounded font-medium cursor-pointer transition-colors ${
                isLightMode
                  ? "bg-black/10 hover:bg-black/15 text-neutral-800"
                  : "bg-white/10 hover:bg-white/15 text-zinc-200"
              }`}
            >
              {t("shelf_cancel")}
            </button>
          </div>
        </div>
      ) : null;

    return (
      <div
        data-scrollable="true"
        data-no-swipe="true"
        className="relative flex flex-col w-full h-full min-h-0 select-none overflow-hidden px-6 pb-1"
      >
        {files.length === 0 ? (
          <>
            {activeSessionPill}
            {shareError && alertBanner}
            {/* Empty / Active Drop Zone */}
            <div
            className={`flex-1 my-1.5 rounded-[20px] flex flex-col items-center justify-center gap-1.5 px-6 text-center transition-all ${
              isDropActive
                ? "border-2 border-[#3882F6] bg-[rgba(56,130,246,0.08)] shadow-[0_0_24px_rgba(56,130,246,0.2)]"
                : "border-[1.5px] border-dashed border-white/10 hover:border-white/20 bg-[#0d0d12]"
            }`}
          >
            <div
              className={`w-10 h-10 rounded-xl flex items-center justify-center transition-all ${
                isDropActive
                  ? "bg-[#3882F6] text-white scale-110 shadow-lg shadow-[#3882F6]/30"
                  : "bg-white/[0.06] border border-white/8 text-zinc-300"
              }`}
            >
              <Upload size={19} strokeWidth={2} />
            </div>
            <div className="text-[14px] font-semibold text-white tracking-tight">
              {isDropActive ? t("drag_drop_title") : t("shelf_drop_here")}
            </div>
            <div className="text-[11px] leading-relaxed text-zinc-400 max-w-[340px]">
              {t("shelf_drop_desc")}
            </div>
            {!isDropActive && (
              <div className="flex items-center gap-2 mt-1">
                <button
                  type="button"
                  onClick={handleChooseFiles}
                  className="h-7 px-3.5 rounded-full border border-white/12 hover:border-white/25 bg-white/[0.04] hover:bg-white/[0.08] text-zinc-200 text-[11px] font-medium transition-colors cursor-pointer"
                >
                  {t("shelf_choose_files")}
                </button>
                <button
                  type="button"
                  onClick={handleStartReceive}
                  className="h-7 px-3 rounded-full border border-[#3882F6]/30 hover:border-[#3882F6]/60 bg-[#3882F6]/10 hover:bg-[#3882F6]/20 text-[#8db8ff] hover:text-white text-[11px] font-medium transition-colors flex items-center gap-1.5 cursor-pointer"
                >
                  <Smartphone size={12} />
                  <span>{t("shelf_receive_from_phone")}</span>
                </button>
                <Tooltip content={t("shelf_settings_title")} side="top">
                  <button
                    type="button"
                    onClick={() => {
                      if (onToggleSettings) onToggleSettings();
                      else setInternalShowSettings(true);
                    }}
                    className="h-7 w-7 rounded-full border border-white/12 hover:border-white/25 bg-white/[0.04] hover:bg-white/[0.08] text-zinc-300 hover:text-white flex items-center justify-center transition-colors cursor-pointer"
                    aria-label={t("shelf_settings_title")}
                  >
                    <Settings size={12.5} />
                  </button>
                </Tooltip>
              </div>
            )}
            </div>
          </>
        ) : (
          /* Filled State */
          <>
            {activeSessionPill}
            {receivedBanner && (
              <DropShelfReceivedBanner
                count={receivedBanner.count}
                deviceName={receivedBanner.deviceName}
                isLightMode={isLightMode}
                onReceiveAgain={handleStartReceive}
                onDismiss={() => setReceivedBanner(null)}
              />
            )}
            {alertBanner}
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
                onClick={handleStartSend}
                className="h-[26px] px-2.5 rounded-lg bg-[#3882F6] hover:bg-[#2563eb] text-white text-[11px] font-semibold transition-colors flex items-center gap-1.5 cursor-pointer shadow-sm shadow-[#3882F6]/30"
              >
                <Smartphone size={12.5} strokeWidth={2.2} />
                <span>
                  {selectedIds.size > 0
                    ? `${t("shelf_send_to_phone")} (${selectedIds.size})`
                    : t("shelf_send_to_phone")}
                </span>
              </button>

              <button
                type="button"
                onClick={handleStartReceive}
                className="h-[26px] px-2.5 rounded-lg bg-white/[0.05] hover:bg-white/[0.09] border border-white/8 text-zinc-200 hover:text-white text-[11px] font-medium transition-colors flex items-center gap-1.5 cursor-pointer"
              >
                <Smartphone size={12.5} strokeWidth={2} />
                <span>{t("shelf_receive_from_phone")}</span>
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

              <Tooltip content={t("shelf_settings_title")} side="top">
                <button
                  type="button"
                  onClick={() => {
                    if (onToggleSettings) onToggleSettings();
                    else setInternalShowSettings(true);
                  }}
                  className="h-[26px] w-[26px] rounded-lg bg-white/[0.04] hover:bg-white/[0.08] text-zinc-300 hover:text-white flex items-center justify-center transition-colors cursor-pointer shrink-0"
                  aria-label={t("shelf_settings_title")}
                >
                  <Settings size={12.5} />
                </button>
              </Tooltip>
            </div>

            {/* File Row */}
            <div className="relative flex-1 flex items-center min-h-0 overflow-hidden">
              {canScrollLeft && (
                <button
                  onClick={() => handleScrollStep("left")}
                  className={`absolute left-0 top-[34px] z-20 w-7 h-7 rounded-full flex items-center justify-center shadow-lg transition-transform hover:scale-105 active:scale-95 cursor-pointer backdrop-blur-md ${
                    isLightMode
                      ? "bg-white/95 hover:bg-white text-[#1d1d1f] border border-black/15"
                      : "bg-black/85 hover:bg-black text-white/90 hover:text-white border border-white/15"
                  }`}
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
                    const cleanExt = (file.ext || "").toLowerCase().replace(/^\./, "").trim();
                    const isImg = [
                      "png", "jpg", "jpeg", "webp", "gif", "svg", "bmp", "ico", "heic", "heif", "avif", "jfif"
                    ].includes(cleanExt);
                    const isVid = [
                      "mp4", "mov", "webm", "mkv", "avi", "m4v"
                    ].includes(cleanExt);

                    const preview = previews[file.id] || getCachedPreview(file.id) || getCachedPreview(file.path);
                    const isMissing = Boolean(preview?.isMissing);
                    const candidateThumb =
                      file.thumbnail ||
                      preview?.thumbnail ||
                      (isImg && file.path && !isMissing ? convertFileSrc(file.path) : undefined);
                    const thumb = failedThumbIds.has(file.id) || isMissing ? undefined : candidateThumb;

                    const sizeText =
                      file.sizeFormatted ||
                      preview?.sizeFormatted ||
                      (cleanExt ? cleanExt.toUpperCase() : "FILE");
                    const isCopied = copiedId === file.id;
                    const isSelected = selectedIds.has(file.id);
                    const { icon: IconComponent, color } = getFileIcon(file.ext);
                    const extBadge = cleanExt ? cleanExt.toUpperCase() : "FILE";

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
                              : isMissing
                              ? "border border-amber-500/45 bg-amber-500/[0.04]"
                              : "border border-white/10 group-hover:border-white/20 group-hover:bg-[#16161d]"
                          }`}
                        >
                          {thumb ? (
                            <img
                              src={thumb}
                              alt={file.name}
                              loading="lazy"
                              onError={() => {
                                setFailedThumbIds((prev) => new Set(prev).add(file.id));
                              }}
                              className="w-full h-full object-contain p-1.5 select-none pointer-events-none"
                            />
                          ) : isVid && !isMissing ? (
                            <div className="relative w-full h-full overflow-hidden rounded-[10px] flex items-center justify-center bg-black/40">
                              <video
                                key={file.id}
                                src={convertFileSrc(file.path)}
                                muted
                                playsInline
                                preload="metadata"
                                className="w-full h-full object-cover select-none pointer-events-none"
                              />
                              <div className="absolute inset-0 flex items-center justify-center bg-black/30 pointer-events-none">
                                <div className="w-6 h-6 rounded-full bg-black/60 border border-white/20 flex items-center justify-center text-white shadow-sm">
                                  <Film size={12} />
                                </div>
                              </div>
                            </div>
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
                            <Tooltip content={t("shelf_send_to_phone")} side="top">
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleSendSingleFile(file);
                                }}
                                className={`w-4.5 h-4.5 rounded-full flex items-center justify-center transition-colors cursor-pointer ${
                                  isLightMode
                                    ? "bg-white/95 hover:bg-[#3882F6]/15 text-[#1d1d1f] hover:text-[#1d4ed8] border border-black/15 shadow-sm"
                                    : "bg-black/70 hover:bg-[#3882F6] text-white border border-white/10"
                                }`}
                              >
                                <Smartphone size={9.5} />
                              </button>
                            </Tooltip>
                            <Tooltip content={t("shelf_explorer")} side="top">
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleShowInFolder(file.path);
                                }}
                                className={`w-4.5 h-4.5 rounded-full flex items-center justify-center transition-colors cursor-pointer ${
                                  isLightMode
                                    ? "bg-white/95 hover:bg-black/[0.08] text-[#1d1d1f] border border-black/15 shadow-sm"
                                    : "bg-black/70 hover:bg-white/20 text-white border border-white/10"
                                }`}
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
                              className={`w-4.5 h-4.5 rounded-full flex items-center justify-center transition-colors cursor-pointer ${
                                isLightMode
                                  ? "bg-white/95 hover:bg-rose-500/15 text-[#1d1d1f] hover:text-rose-600 border border-black/15 shadow-sm"
                                  : "bg-black/70 hover:bg-rose-500/80 text-white border border-white/10"
                              }`}
                            >
                              <X size={9.5} strokeWidth={2.4} />
                            </button>
                          </div>

                          {/* Copied Overlay */}
                          {isCopied && (
                            <div
                              className={`absolute inset-0 flex flex-col items-center justify-center gap-1 z-30 ${
                                isLightMode ? "bg-white/90 text-[#1d1d1f]" : "bg-black/85 text-white"
                              }`}
                            >
                              <Check
                                size={15}
                                className={isLightMode ? "text-emerald-600" : "text-[#13FF00]"}
                                strokeWidth={2.8}
                              />
                              <span className="text-[10px] font-semibold">{t("shelf_copied")}</span>
                            </div>
                          )}
                        </div>

                        <div className="px-0.5 min-w-0">
                          <Tooltip content={file.name} side="bottom" delay={400} wrapperClassName="w-full max-w-full block">
                            <div className="text-[11.5px] font-medium text-white/90 group-hover:text-white truncate transition-colors leading-tight">
                              {file.name}
                            </div>
                          </Tooltip>
                          <div className="text-[10px] text-zinc-400 mt-0.5 truncate flex items-center gap-1.5">
                            <span className="font-semibold text-zinc-300 uppercase tracking-wider text-[8.5px] bg-white/[0.08] px-1 py-0.5 rounded leading-none">
                              {extBadge}
                            </span>
                            <span className="truncate">{sizeText}</span>
                            {isMissing && (
                              <span
                                className={`px-1 py-0.2 rounded text-[8.5px] font-semibold ${
                                  isLightMode
                                    ? "bg-amber-500/20 text-amber-800"
                                    : "bg-amber-500/20 text-amber-300"
                                }`}
                              >
                                {t("shelf_file_missing")}
                              </span>
                            )}
                            {file.source === "phone" && (
                              <span className="text-[9.5px] text-zinc-400 flex items-center gap-0.5">
                                · {t("shelf_from_phone")}
                              </span>
                            )}
                            {file.isNew && (
                              <span className="px-1 py-0.2 rounded bg-emerald-500/20 text-emerald-400 text-[8.5px] font-semibold">
                                {t("shelf_new_badge")}
                              </span>
                            )}
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
                  className={`absolute right-0 top-[34px] z-20 w-7 h-7 rounded-full flex items-center justify-center shadow-lg transition-transform hover:scale-105 active:scale-95 cursor-pointer backdrop-blur-md ${
                    isLightMode
                      ? "bg-white/95 hover:bg-white text-[#1d1d1f] border border-black/15"
                      : "bg-black/85 hover:bg-black text-white/90 hover:text-white border border-white/15"
                  }`}
                  aria-label={isEn ? "Scroll right" : "Gulir ke kanan"}
                >
                  <ChevronRight size={15} />
                </button>
              )}
            </div>
          </>
        )}
        {transferMode !== "idle" && (
          <DropShelfTransferModal
            mode={transferMode}
            session={sessionInfo}
            incomingProgress={incomingProgress}
            activeDeviceName={activeDeviceName}
            isLightMode={isLightMode}
            onClose={handleHideTransferModal}
            onCancel={handleCancelTransfer}
          />
        )}
      </div>
    );
  }
);
