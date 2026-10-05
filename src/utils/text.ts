// Cache the canvas instance outside the function so we don't create it on every render
let cachedCanvas: HTMLCanvasElement | null = null;

export const getTextWidth = (text: string, font: string = "14px 'SF Pro Display', sans-serif") => {
  if (typeof document === 'undefined') return text.length * 8; // SSR fallback
  
  if (!cachedCanvas) {
    cachedCanvas = document.createElement("canvas");
  }
  
  const context = cachedCanvas.getContext("2d");
  if (context) {
    context.font = font;
    return context.measureText(text).width;
  }
  
  return text.length * 8; // Fallback
};
