import type { ContextMenuItem, ProjectIconOverride } from "@t3tools/contracts";
import { FolderCodeIcon } from "lucide-react";
import { createElement, type ReactElement } from "react";
import { flushSync } from "react-dom";
import { createRoot } from "react-dom/client";

import { ProjectIconGlyph } from "./components/ProjectFavicon";
import { projectIconColorClassName } from "./projectIconColors";

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

// Native menus show 16 px icons; draw at 2x so they stay sharp on scaled displays.
const NATIVE_ICON_PIXELS = 32;
const nativeIconCache = new Map<string, Promise<string | null>>();

/** Fills `iconDataUrl` from `iconOverride` so the native desktop menu can show the glyph. */
export async function withNativeMenuIcons<T extends string>(
  items: readonly ContextMenuItem<T>[],
): Promise<ContextMenuItem<T>[]> {
  return Promise.all(
    items.map(async (item) => {
      const children = item.children ? await withNativeMenuIcons(item.children) : undefined;
      const iconDataUrl = item.iconOverride ? await nativeIconDataUrl(item.iconOverride) : null;
      return {
        ...item,
        ...(children ? { children } : {}),
        ...(iconDataUrl ? { iconDataUrl } : {}),
      };
    }),
  );
}

function nativeIconDataUrl(icon: ProjectIconOverride): Promise<string | null> {
  const key = JSON.stringify(icon);
  const cached = nativeIconCache.get(key);
  if (cached) return cached;
  const pending = drawNativeIcon(icon).catch(() => null);
  nativeIconCache.set(key, pending);
  return pending;
}

async function drawNativeIcon(icon: ProjectIconOverride): Promise<string | null> {
  const canvas = document.createElement("canvas");
  canvas.width = NATIVE_ICON_PIXELS;
  canvas.height = NATIVE_ICON_PIXELS;
  const context = canvas.getContext("2d");
  if (!context) return null;
  if (icon.kind === "emoji") {
    context.font = `${NATIVE_ICON_PIXELS * 0.8}px sans-serif`;
    context.textAlign = "center";
    context.textBaseline = "middle";
    context.fillText(icon.emoji, NATIVE_ICON_PIXELS / 2, NATIVE_ICON_PIXELS / 2 + 1);
    return canvas.toDataURL("image/png");
  }
  const glyph = renderGlyphSvg(await glyphElement(icon));
  if (!glyph) return null;
  if (glyph.background) {
    context.fillStyle = glyph.background;
    context.beginPath();
    context.roundRect(0, 0, NATIVE_ICON_PIXELS, NATIVE_ICON_PIXELS, NATIVE_ICON_PIXELS / 4);
    context.fill();
  }
  const image = new Image();
  image.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(glyph.markup)}`;
  await image.decode();
  context.drawImage(image, 0, 0, NATIVE_ICON_PIXELS, NATIVE_ICON_PIXELS);
  return canvas.toDataURL("image/png");
}

async function glyphElement(icon: ProjectIconOverride): Promise<ReactElement> {
  if (icon.kind !== "lucide") return <ProjectIconGlyph icon={icon} className="size-4" />;
  // The glyph component loads lucide lazily; render the resolved icon directly instead.
  const { lucideIconByName } = await import("./lib/lucideIconByName");
  return (
    <span className={projectIconColorClassName(icon.color)}>
      {createElement(lucideIconByName(icon.name) ?? FolderCodeIcon, { className: "size-4" })}
    </span>
  );
}

/** Renders the glyph off screen and returns standalone SVG markup with its colors resolved. */
function renderGlyphSvg(glyph: ReactElement): { markup: string; background: string } | null {
  const host = document.createElement("div");
  host.style.cssText = "position:fixed;left:-9999px;top:0;pointer-events:none";
  document.body.append(host);
  const root = createRoot(host);
  try {
    flushSync(() => root.render(glyph));
    const svg = host.querySelector("svg");
    if (!svg) return null;
    const style = getComputedStyle(svg);
    const background = svg.style.backgroundColor ? style.backgroundColor : "";
    const copy = svg.cloneNode(true) as SVGSVGElement;
    copy.setAttribute("width", String(NATIVE_ICON_PIXELS));
    copy.setAttribute("height", String(NATIVE_ICON_PIXELS));
    copy.style.color = style.color;
    copy.style.backgroundColor = "";
    for (const text of copy.querySelectorAll("text")) {
      text.setAttribute("font-family", style.fontFamily);
    }
    return { markup: new XMLSerializer().serializeToString(copy), background };
  } finally {
    root.unmount();
    host.remove();
  }
}
