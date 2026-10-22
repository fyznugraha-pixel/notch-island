import { motion } from "framer-motion";
import { Play } from "lucide-react";

export const AudioVisualizer = ({
  isPlaying,
  onToggle,
}: {
  isPlaying: boolean;
  onToggle: () => void;
  optAccent?: string;
}) => {
  if (!isPlaying) {
    return (
      <button 
        onClick={(e) => { e.stopPropagation(); onToggle(); }}
        className="w-6 h-6 flex items-center justify-center rounded-full audio-visualizer-play shrink-0 transition-colors"
      >
        <Play size={12} fill="currentColor" className="ml-0.5" />
      </button>
    );
  }

  return (
    <div className="flex items-center justify-center gap-[2.5px] h-4 w-6 shrink-0">
      {[0, 1, 2, 3].map((i) => (
        <motion.div
          key={i}
          className="audio-visualizer-bar w-[2.5px] rounded-full transition-colors"
          animate={{ height: ["4px", "14px", "4px"] }}
          transition={{
            duration: 0.8,
            repeat: Infinity,
            delay: i * 0.15,
            ease: "easeInOut",
          }}
        />
      ))}
    </div>
  );
};
