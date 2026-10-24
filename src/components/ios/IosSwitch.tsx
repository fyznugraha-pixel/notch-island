import React from "react";
import { motion } from "framer-motion";
import { iosSpring } from "../../utils/iosMotion";

interface IosSwitchProps {
  checked: boolean;
  onChange: (checked: boolean) => void;
  disabled?: boolean;
  id?: string;
  activeColor?: "green" | "blue";
}

export const IosSwitch: React.FC<IosSwitchProps> = ({
  checked,
  onChange,
  disabled = false,
  id,
  activeColor = "green",
}) => {
  return (
    <motion.button
      id={id}
      type="button"
      role="switch"
      aria-checked={checked}
      disabled={disabled}
      whileTap={disabled ? undefined : { scale: 0.96 }}
      onClick={(e) => {
        e.stopPropagation();
        if (!disabled) {
          onChange(!checked);
        }
      }}
      className={`relative inline-flex h-[28px] w-[48px] shrink-0 cursor-pointer items-center rounded-full p-[2px] transition-colors duration-250 ease-out focus:outline-none ${
        checked
          ? activeColor === "blue"
            ? "bg-[#007aff]"
            : "bg-[#34c759]"
          : "bg-[#39393d]/80 hover:bg-[#48484a]"
      } ${disabled ? "opacity-40 cursor-not-allowed" : ""}`}
    >
      <motion.span
        layout
        transition={iosSpring.snappy}
        className={`pointer-events-none block h-[24px] w-[24px] rounded-full bg-white shadow-[0_2px_4px_rgba(0,0,0,0.35),0_1px_2px_rgba(0,0,0,0.2)] ${
          checked ? "ml-auto" : "mr-auto"
        }`}
      />
    </motion.button>
  );
};
