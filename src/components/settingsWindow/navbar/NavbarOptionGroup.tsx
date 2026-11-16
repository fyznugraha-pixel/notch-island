import { Check } from "lucide-react";

export interface NavbarOptionItem<T extends string> {
  value: T;
  title: string;
  desc: string;
}

interface NavbarOptionGroupProps<T extends string> {
  label: string;
  activeSummary: string;
  value: T;
  options: NavbarOptionItem<T>[];
  onChange: (nextValue: T) => void;
  isLightMode?: boolean;
}

export function NavbarOptionGroup<T extends string>({
  label,
  activeSummary,
  value,
  options,
  onChange,
  isLightMode = false,
}: NavbarOptionGroupProps<T>) {
  const textTitle = isLightMode ? "text-neutral-900" : "text-white";
  const textSub = isLightMode ? "text-neutral-600" : "text-zinc-400";

  return (
    <div
      className={`flex flex-col gap-2.5 my-1.5 p-3 rounded-[12px] border ${
        isLightMode
          ? "bg-black/[0.03] border-black/[0.07]"
          : "bg-white/[0.03] border-white/[0.06]"
      }`}
    >
      <div className="flex items-center justify-between gap-2">
        <span className={`text-[11.5px] font-medium ${textTitle}`}>{label}</span>
        <span className={`text-[10px] ${textSub}`}>{activeSummary}</span>
      </div>

      <div className="grid grid-cols-2 gap-2">
        {options.map((opt) => {
          const selected = value === opt.value;
          return (
            <button
              key={opt.value}
              type="button"
              aria-pressed={selected}
              onClick={() => onChange(opt.value)}
              className={`p-2.5 rounded-[10px] border text-left flex flex-col gap-1 transition-all cursor-pointer focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#60a5fa] ${
                selected
                  ? isLightMode
                    ? "bg-white border-black/20 ring-1 ring-black/10 shadow-sm"
                    : "bg-white/[0.08] border-white/30 ring-1 ring-white/20 shadow-sm"
                  : isLightMode
                  ? "bg-transparent border-black/[0.08] hover:bg-black/[0.04]"
                  : "bg-transparent border-white/[0.07] hover:bg-white/[0.04]"
              }`}
            >
              <div className="flex items-center justify-between">
                <span className={`text-[12px] font-semibold ${textTitle}`}>
                  {opt.title}
                </span>
                {selected && (
                  <Check
                    size={13}
                    aria-hidden="true"
                    className={isLightMode ? "text-emerald-600" : "text-emerald-400"}
                    strokeWidth={2.6}
                  />
                )}
              </div>
              <span className={`text-[10.5px] leading-relaxed ${textSub}`}>
                {opt.desc}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
