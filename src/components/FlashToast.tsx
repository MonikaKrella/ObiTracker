import * as React from "react";
import { toast } from "sonner";

/**
 * Zero-UI island that reads a flash message from sessionStorage on mount,
 * fires the appropriate Sonner toast, then clears the entry.
 * Used on pages that receive a cross-page redirect (e.g. after dog deletion).
 */
export function FlashToast() {
  React.useEffect(() => {
    const raw = sessionStorage.getItem("flash");
    if (!raw) return;
    try {
      const { type, message } = JSON.parse(raw) as { type: string; message: string };
      if (type !== "success" && type !== "error") return;
      toast[type](message);
    } catch {
      // Malformed flash — silently ignore
    } finally {
      sessionStorage.removeItem("flash");
    }
  }, []);

  return null;
}
