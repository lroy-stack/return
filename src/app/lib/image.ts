const MAX_SIDE = 1600;
const QUALITY = 0.85;

async function decode(
  file: File,
): Promise<{ source: CanvasImageSource; width: number; height: number; close: () => void }> {
  try {
    // Applies the EXIF orientation while decoding, so the re-encoded pixels are upright.
    const bmp = await createImageBitmap(file, { imageOrientation: "from-image" });
    return { source: bmp, width: bmp.width, height: bmp.height, close: () => bmp.close() };
  } catch {
    const url = URL.createObjectURL(file);
    try {
      const img = new Image();
      img.src = url;
      await img.decode();
      return { source: img, width: img.naturalWidth, height: img.naturalHeight, close: () => undefined };
    } finally {
      URL.revokeObjectURL(url);
    }
  }
}

/**
 * Downscale to at most 1600 px and re-encode as JPEG 0.85. Drawing to a canvas drops all
 * EXIF/GPS metadata, so uploaded photos never carry where they were taken.
 */
export async function resizePhoto(file: File): Promise<File> {
  const img = await decode(file);
  try {
    const scale = Math.min(1, MAX_SIDE / Math.max(img.width, img.height));
    const w = Math.max(1, Math.round(img.width * scale));
    const h = Math.max(1, Math.round(img.height * scale));
    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Canvas is not available");
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, w, h);
    ctx.drawImage(img.source, 0, 0, w, h);
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", QUALITY));
    if (!blob) throw new Error("Could not encode the image");
    const base = file.name.replace(/\.[^.]+$/, "") || "photo";
    return new File([blob], `${base}.jpg`, { type: "image/jpeg" });
  } finally {
    img.close();
  }
}
