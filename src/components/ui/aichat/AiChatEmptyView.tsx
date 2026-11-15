import React from "react";
import { MessageCircle, Clipboard, Languages, AlertCircle, Mail } from "lucide-react";
import { t } from "../../../services/i18n";

interface AiChatEmptyViewProps {
  onSelectPrompt: (promptText: string) => void;
  onSelectClipboardPrompt?: (promptText: string) => void;
  accentColor?: string;
  freeModeNotice?: string;
}

export const AiChatEmptyView: React.FC<AiChatEmptyViewProps> = ({
  onSelectPrompt,
  onSelectClipboardPrompt,
  accentColor = "#3882F6",
  freeModeNotice,
}) => {
  const chips = [
    {
      label: t("aichat_chip_summarize_clipboard"),
      prompt: t("aichat_chip_summarize_clipboard_prompt"),
      icon: <Clipboard size={13} className="text-[#8db8ff]" strokeWidth={2} />,
      isClipboard: true,
    },
    {
      label: t("aichat_chip_translate_en"),
      prompt: t("aichat_chip_translate_en_prompt"),
      icon: <Languages size={13} className="text-[#8db8ff]" strokeWidth={2} />,
    },
    {
      label: t("aichat_chip_explain_error"),
      prompt: t("aichat_chip_explain_error_prompt"),
      icon: <AlertCircle size={13} className="text-[#8db8ff]" strokeWidth={2} />,
    },
    {
      label: t("aichat_chip_draft_email"),
      prompt: t("aichat_chip_draft_email_prompt"),
      icon: <Mail size={13} className="text-[#8db8ff]" strokeWidth={2} />,
    },
  ];

  return (
    <div className="grow flex flex-col items-center justify-center min-h-0 select-none py-2">
      {/* Central Glowing Icon */}
      <div
        className="w-14 h-14 rounded-[20px] flex items-center justify-center shadow-lg"
        style={{
          background: accentColor,
          boxShadow: `0 0 36px rgba(56,130,246,0.35)`,
          color: "#04101f",
        }}
      >
        <MessageCircle size={26} strokeWidth={2.2} />
      </div>

      <div className="text-[22px] font-semibold tracking-[-0.03em] text-white mt-3.5">
        {t("aichat_empty_title")}
      </div>
      <div className="text-[12px] text-[#a1a1aa] mt-1">
        {freeModeNotice ?? t("aichat_empty_subtitle")}
      </div>

      {/* Suggested Quick Prompt Chips */}
      <div className="flex flex-wrap justify-center gap-2 mt-4 max-w-[500px]">
        {chips.map((chip) => (
          <button
            key={chip.label}
            type="button"
            onClick={() => {
              if (chip.isClipboard && onSelectClipboardPrompt) {
                onSelectClipboardPrompt(chip.prompt);
              } else {
                onSelectPrompt(chip.prompt);
              }
            }}
            className="h-[34px] px-3.5 rounded-[17px] border border-white/10 bg-white/[0.06] hover:bg-white/[0.12] active:scale-95 text-[#f4f4f5] text-[12.5px] font-medium flex items-center gap-1.5 cursor-pointer transition-all shadow-sm"
          >
            {chip.icon}
            <span>{chip.label}</span>
          </button>
        ))}
      </div>
    </div>
  );
};

