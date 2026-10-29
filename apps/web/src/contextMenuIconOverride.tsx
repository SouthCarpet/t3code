import type { ProjectIconOverride } from "@t3tools/contracts";
import { createRoot } from "react-dom/client";

import { ProjectIconGlyph } from "./components/ProjectFavicon";

/**
 * Draws a project-style icon inside the DOM-built fallback menu with the same
 * component as the sidebar. Call `unmount` when the menu closes.
 */
export function mountIconOverride(icon: ProjectIconOverride): {
  readonly element: HTMLElement;
  readonly unmount: () => void;
} {
  const element = document.createElement("span");
  element.className = "inline-flex size-4 shrink-0 items-center justify-center";
  element.setAttribute("aria-hidden", "true");
  const root = createRoot(element);
  root.render(<ProjectIconGlyph icon={icon} className="size-4" />);
  return { element, unmount: () => root.unmount() };
}
