/**
 * Subscribes to OpenTUI text selection updates and copies the final selection to the
 * system clipboard using OSC 52 when the terminal supports it.
 */
import { useEffect } from "react";
import { CliRenderEvents } from "@opentui/core";
import { useRenderer } from "@opentui/react";

/**
 * Registers a renderer listener so that when the user finishes selecting text in the TUI,
 * the selected string is sent to the clipboard (via OSC 52), then the selection is cleared.
 */
export function useAutoCopySelection(): void {
  const renderer = useRenderer();

  useEffect(() => {
    const onSelection = (): void => {
      if (!renderer.isOsc52Supported()) {
        return;
      }
      const sel = renderer.getSelection();
      if (!sel || sel.isDragging) {
        return;
      }
      const text = sel.getSelectedText();
      if (!text) {
        return;
      }
      renderer.copyToClipboardOSC52(text);
      renderer.clearSelection();
    };

    renderer.on(CliRenderEvents.SELECTION, onSelection);
    return () => {
      renderer.off(CliRenderEvents.SELECTION, onSelection);
    };
  }, [renderer]);
}
