const MAX_VISION_DIMENSION = 1600;
const UNSUPPORTED_VISION_MIME = new Set([
  "image/svg+xml",
  "image/x-icon",
  "image/vnd.microsoft.icon",
]);

function readFileAsDataUrl(file: File): Promise<string | null> {
  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.onload = () => resolve(typeof reader.result === "string" ? reader.result : null);
    reader.onerror = () => resolve(null);
    reader.readAsDataURL(file);
  });
}

/**
 * Loads a dropped/pasted raster image file, rejects formats Vision APIs don't accept (SVG/ICO),
 * and downscales oversized screenshots above 1600px while preserving text legibility.
 */
export async function readRasterImageFileForVision(file: File): Promise<string | null> {
  const mime = (file.type || "").toLowerCase();
  const nameLower = (file.name || "").toLowerCase();
  if (
    !mime.startsWith("image/") ||
    UNSUPPORTED_VISION_MIME.has(mime) ||
    nameLower.endsWith(".svg") ||
    nameLower.endsWith(".ico")
  ) {
    return null;
  }

  const rawDataUrl = await readFileAsDataUrl(file);
  if (!rawDataUrl) return null;

  if (typeof Image === "undefined" || typeof document === "undefined") {
    return rawDataUrl;
  }

  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      const w = img.naturalWidth || img.width;
      const h = img.naturalHeight || img.height;
      const maxEdge = Math.max(w, h);

      if (maxEdge <= MAX_VISION_DIMENSION && file.size <= 1.5 * 1024 * 1024) {
        resolve(rawDataUrl);
        return;
      }

      const scale = Math.min(1, MAX_VISION_DIMENSION / Math.max(1, maxEdge));
      const targetW = Math.max(1, Math.round(w * scale));
      const targetH = Math.max(1, Math.round(h * scale));

      const canvas = document.createElement("canvas");
      canvas.width = targetW;
      canvas.height = targetH;
      const ctx = canvas.getContext("2d");
      if (!ctx) {
        resolve(rawDataUrl);
        return;
      }
      ctx.drawImage(img, 0, 0, targetW, targetH);
      resolve(canvas.toDataURL("image/jpeg", 0.88));
    };
    img.onerror = () => resolve(null);
    img.src = rawDataUrl;
  });
}
