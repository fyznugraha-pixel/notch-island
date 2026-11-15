// Extracts a dominant tint color from an image, tuned to be a dark, 100% opaque background
const MAX_COLOR_CACHE_ENTRIES = 64;
const colorCache = new Map<string, string>();

function setCachedColor(imgSrc: string, hex: string): void {
  if (colorCache.has(imgSrc)) {
    colorCache.delete(imgSrc);
  } else if (colorCache.size >= MAX_COLOR_CACHE_ENTRIES) {
    const oldestKey = colorCache.keys().next().value;
    if (oldestKey !== undefined) {
      colorCache.delete(oldestKey);
    }
  }
  colorCache.set(imgSrc, hex);
}

export async function extractDominantColor(imgSrc?: string | null): Promise<string> {
  if (!imgSrc) return "#121216";
  if (colorCache.has(imgSrc)) {
    const cached = colorCache.get(imgSrc)!;
    colorCache.delete(imgSrc);
    colorCache.set(imgSrc, cached);
    return cached;
  }

  return new Promise<string>((resolve) => {
    const img = new Image();
    img.crossOrigin = "Anonymous";

    img.onload = () => {
      try {
        const canvas = document.createElement("canvas");
        const ctx = canvas.getContext("2d");
        if (!ctx) {
          resolve("#121216");
          return;
        }

        canvas.width = 16;
        canvas.height = 16;
        ctx.drawImage(img, 0, 0, 16, 16);

        const data = ctx.getImageData(0, 0, 16, 16).data;
        let r = 0;
        let g = 0;
        let b = 0;
        let count = 0;

        for (let i = 0; i < data.length; i += 4) {
          const pr = data[i];
          const pg = data[i + 1];
          const pb = data[i + 2];
          // Skip extreme dark/pure white to find actual color
          const max = Math.max(pr, pg, pb);
          const min = Math.min(pr, pg, pb);
          if (max > 25 && min < 240) {
            r += pr;
            g += pg;
            b += pb;
            count++;
          }
        }

        if (count === 0) {
          resolve("#121216");
          return;
        }

        let avgR = r / count;
        let avgG = g / count;
        let avgB = b / count;

        // Darken so it serves as a comfortable, high-contrast 100% opaque backdrop
        // Lightness target around 12% to 18%
        const maxVal = Math.max(avgR, avgG, avgB);
        const scale = maxVal > 0 ? Math.min(1.0, 48 / maxVal) : 1.0;

        const finalR = Math.max(14, Math.min(45, Math.round(avgR * scale)));
        const finalG = Math.max(14, Math.min(45, Math.round(avgG * scale)));
        const finalB = Math.max(18, Math.min(50, Math.round(avgB * scale)));

        const hex = `#${finalR.toString(16).padStart(2, "0")}${finalG.toString(16).padStart(2, "0")}${finalB.toString(16).padStart(2, "0")}`;
        setCachedColor(imgSrc, hex);
        resolve(hex);
      } catch {
        resolve("#121216");
      }
    };

    img.onerror = () => {
      resolve("#121216");
    };

    img.src = imgSrc;
  });
}

