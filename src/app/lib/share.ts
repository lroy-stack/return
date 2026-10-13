/** True when the browser can hand a file to the system share sheet (AirDrop, Messages, print...). */
export function canShareFiles(sample?: File): boolean {
  try {
    return (
      typeof navigator.share === "function" &&
      typeof navigator.canShare === "function" &&
      navigator.canShare({ files: [sample ?? new File([""], "card.png", { type: "image/png" })] })
    );
  } catch {
    return false;
  }
}

export type ShareResult = "shared" | "cancelled" | "failed";

/**
 * Opens the share sheet for a file. Call it straight from the click handler with a file that is already built:
 * `navigator.share` needs transient user activation, which iOS Safari drops after an `await` of any real work.
 */
export async function shareFile(file: File, title: string): Promise<ShareResult> {
  try {
    await navigator.share({ files: [file], title });
    return "shared";
  } catch (e) {
    return e instanceof DOMException && e.name === "AbortError" ? "cancelled" : "failed";
  }
}
