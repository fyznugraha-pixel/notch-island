import React, { useCallback, useEffect, useId, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Check, ChevronDown } from "lucide-react";

export interface IosSelectOption<T extends string | number> {
  value: T;
  label: string;
  sublabel?: string;
}

interface IosSelectProps<T extends string | number> {
  options: IosSelectOption<T>[];
  value: T;
  onChange: (value: T) => void;
  isLightMode?: boolean;
  ariaLabel?: string;
  disabled?: boolean;
  className?: string;
  minWidthClass?: string;
}

interface MenuPosition {
  top: number;
  left: number;
  width: number;
  openUp: boolean;
}

export function IosSelect<T extends string | number>({
  options,
  value,
  onChange,
  isLightMode = false,
  ariaLabel,
  disabled = false,
  className = "",
  minWidthClass = "min-w-[148px]",
}: IosSelectProps<T>) {
  const [open, setOpen] = useState(false);
  const [focusedIndex, setFocusedIndex] = useState<number>(-1);
  const [menuPos, setMenuPos] = useState<MenuPosition | null>(null);
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const menuRef = useRef<HTMLDivElement | null>(null);
  const listboxId = useId();

  const selectedIndex = options.findIndex((o) => o.value === value);
  const selectedOption = selectedIndex >= 0 ? options[selectedIndex] : options[0];

  const updatePosition = useCallback(() => {
    const trigger = triggerRef.current;
    if (!trigger) return;
    const rect = trigger.getBoundingClientRect();
    const estimatedHeight = Math.min(248, options.length * 36 + 12);
    const spaceBelow = window.innerHeight - rect.bottom - 10;
    const openUp = spaceBelow < estimatedHeight && rect.top > estimatedHeight + 10;
    const width = Math.max(rect.width, 168);
    const maxLeft = Math.max(8, window.innerWidth - width - 8);
    const left = Math.min(Math.max(8, rect.right - width), maxLeft);
    setMenuPos({
      top: openUp ? rect.top - 6 : rect.bottom + 6,
      left,
      width,
      openUp,
    });
  }, [options.length]);

  useLayoutEffect(() => {
    if (!open) return;
    updatePosition();
  }, [open, updatePosition]);

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (e: MouseEvent) => {
      const target = e.target as Node;
      if (triggerRef.current?.contains(target) || menuRef.current?.contains(target)) return;
      setOpen(false);
    };
    const onScrollOrResize = (e: Event) => {
      if (menuRef.current && e.target instanceof Node && menuRef.current.contains(e.target)) {
        return;
      }
      setOpen(false);
    };
    document.addEventListener("mousedown", onPointerDown, true);
    window.addEventListener("resize", onScrollOrResize);
    window.addEventListener("scroll", onScrollOrResize, true);
    return () => {
      document.removeEventListener("mousedown", onPointerDown, true);
      window.removeEventListener("resize", onScrollOrResize);
      window.removeEventListener("scroll", onScrollOrResize, true);
    };
  }, [open]);

  const closeMenu = useCallback((returnFocus = false) => {
    setOpen(false);
    if (returnFocus) triggerRef.current?.focus();
  }, []);

  const commitOption = useCallback(
    (opt: IosSelectOption<T>) => {
      onChange(opt.value);
      closeMenu(true);
    },
    [onChange, closeMenu],
  );

  const toggleOpen = () => {
    if (disabled) return;
    setOpen((prev) => {
      const next = !prev;
      if (next) {
        setFocusedIndex(selectedIndex >= 0 ? selectedIndex : 0);
      }
      return next;
    });
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (disabled) return;
    if (!open) {
      if (e.key === "ArrowDown" || e.key === "ArrowUp" || e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        setFocusedIndex(selectedIndex >= 0 ? selectedIndex : 0);
        setOpen(true);
      }
      return;
    }

    if (e.key === "Escape") {
      e.preventDefault();
      e.stopPropagation();
      closeMenu(true);
    } else if (e.key === "ArrowDown") {
      e.preventDefault();
      setFocusedIndex((prev) => (prev + 1) % Math.max(1, options.length));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setFocusedIndex((prev) => (prev - 1 + options.length) % Math.max(1, options.length));
    } else if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      const target = options[focusedIndex >= 0 ? focusedIndex : selectedIndex];
      if (target) commitOption(target);
    } else if (e.key === "Tab") {
      closeMenu(false);
    }
  };

  return (
    <div className={`relative inline-flex ${className}`} onKeyDown={handleKeyDown}>
      <button
        ref={triggerRef}
        type="button"
        role="combobox"
        aria-label={ariaLabel}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={open ? listboxId : undefined}
        disabled={disabled}
        onClick={(e) => {
          e.stopPropagation();
          toggleOpen();
        }}
        className={`h-8 px-3 rounded-[10px] text-[12px] font-medium border flex items-center justify-between gap-2.5 transition-all select-none cursor-pointer focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#0a84ff] ${minWidthClass} max-w-[230px] ${
          disabled ? "opacity-45 cursor-not-allowed" : ""
        } ${
          isLightMode
            ? open
              ? "bg-white border-[#0a84ff] text-neutral-900 shadow-[0_0_0_3px_rgba(10,132,255,0.14)]"
              : "bg-black/[0.045] hover:bg-black/[0.075] border-black/[0.1] text-neutral-900"
            : open
            ? "bg-[#22242d] border-[#0a84ff] text-white shadow-[0_0_0_3px_rgba(10,132,255,0.18)]"
            : "bg-[#1a1b22] hover:bg-[#22242d] border-white/[0.11] text-zinc-100"
        }`}
      >
        <span className="truncate text-left">{selectedOption?.label ?? ""}</span>
        <ChevronDown
          size={14}
          strokeWidth={2.2}
          className={`shrink-0 transition-transform duration-150 ${
            open ? "rotate-180" : ""
          } ${isLightMode ? "text-neutral-500" : "text-zinc-400"}`}
        />
      </button>

      {open &&
        menuPos &&
        typeof document !== "undefined" &&
        createPortal(
          <div
            ref={menuRef}
            id={listboxId}
            role="listbox"
            aria-label={ariaLabel}
            onClick={(e) => e.stopPropagation()}
            style={{
              position: "fixed",
              top: menuPos.top,
              left: menuPos.left,
              width: menuPos.width,
              transform: menuPos.openUp ? "translateY(-100%)" : undefined,
              zIndex: 9999,
            }}
            className={`max-h-[248px] overflow-y-auto no-scrollbar rounded-[12px] p-1.5 border backdrop-blur-2xl flex flex-col gap-0.5 ${
              isLightMode
                ? "bg-white/95 border-black/[0.12] shadow-[0_14px_38px_rgba(0,0,0,0.14)]"
                : "bg-[#191a21]/95 border-white/[0.14] shadow-[0_18px_46px_rgba(0,0,0,0.62)]"
            }`}
          >
            {options.map((opt, idx) => {
              const isSelected = opt.value === value;
              const isFocused = idx === focusedIndex;
              return (
                <button
                  key={String(opt.value)}
                  type="button"
                  role="option"
                  aria-selected={isSelected}
                  onMouseEnter={() => setFocusedIndex(idx)}
                  onClick={() => commitOption(opt)}
                  className={`w-full px-2.5 py-1.5 rounded-[8px] text-left text-[12px] flex items-center justify-between gap-2 transition-colors cursor-pointer ${
                    isSelected
                      ? isLightMode
                        ? "bg-[#0a84ff]/12 text-[#0066cc] font-semibold"
                        : "bg-[#0a84ff]/20 text-white font-semibold"
                      : isFocused
                      ? isLightMode
                        ? "bg-black/[0.06] text-neutral-900 font-medium"
                        : "bg-white/[0.08] text-white font-medium"
                      : isLightMode
                      ? "text-neutral-800 hover:bg-black/[0.05] font-medium"
                      : "text-zinc-200 hover:bg-white/[0.07] font-medium"
                  }`}
                >
                  <div className="flex flex-col min-w-0">
                    <span className="truncate">{opt.label}</span>
                    {opt.sublabel && (
                      <span
                        className={`text-[10.5px] truncate ${
                          isLightMode ? "text-neutral-500" : "text-zinc-400"
                        }`}
                      >
                        {opt.sublabel}
                      </span>
                    )}
                  </div>
                  {isSelected && (
                    <Check
                      size={14}
                      strokeWidth={2.5}
                      className="shrink-0 text-[#0a84ff]"
                    />
                  )}
                </button>
              );
            })}
          </div>,
          document.body,
        )}
    </div>
  );
}
