import type { EnvironmentThreadShell } from "@t3tools/client-runtime/state/models";
import { useDroppable } from "@dnd-kit/core";
import { ChevronDownIcon } from "lucide-react";
import { memo } from "react";

import { cn } from "~/lib/utils";
import type { ThreadGroup } from "../../threadGroups";
import { CollapsibleSectionHeader } from "../ui/collapsible-section-header";
import { SidebarFolderDot, useSidebarFolderDot } from "./SidebarProjectFolderHeader";

export interface SidebarThreadGroupView {
  readonly projectKey: string;
  readonly group: ThreadGroup;
  readonly collapsed: boolean;
  readonly threads: readonly EnvironmentThreadShell[];
  readonly hiddenThreads: readonly EnvironmentThreadShell[];
}

const DROP_ID_PREFIX = "thread-group:";

/** The group's sidebar tree row; its thread rows name it as their parent. */
export function sidebarThreadGroupRowId(
  view: Pick<SidebarThreadGroupView, "projectKey" | "group">,
) {
  return `group:${view.projectKey}:${view.group.id}`;
}

function sidebarThreadGroupDropId(projectKey: string, groupId: string) {
  return `${DROP_ID_PREFIX}${JSON.stringify([projectKey, groupId])}`;
}

export function parseSidebarThreadGroupDropId(
  id: string,
): { projectKey: string; groupId: string } | null {
  if (!id.startsWith(DROP_ID_PREFIX)) return null;
  const [projectKey, groupId] = JSON.parse(id.slice(DROP_ID_PREFIX.length)) as [string, string];
  return { projectKey, groupId };
}

/**
 * A manual thread group. Inside a boring-sidebar folder it reads like a nested folder;
 * in the default Active list it reads like a shelf header. Either way it is a drop target.
 */
export const SidebarThreadGroupHeader = memo(function SidebarThreadGroupHeader(props: {
  view: SidebarThreadGroupView;
  variant: "folder" | "section";
  onToggle: (groupId: string) => void;
  onContextMenu: (view: SidebarThreadGroupView, position: { x: number; y: number }) => void;
}) {
  const { view } = props;
  const rowId = sidebarThreadGroupRowId(view);
  const dot = useSidebarFolderDot(view.collapsed, view.hiddenThreads);
  const { setNodeRef, isOver, active } = useDroppable({
    id: sidebarThreadGroupDropId(view.projectKey, view.group.id),
  });
  const isDropTarget = isOver && active !== null;
  const count = view.collapsed && view.hiddenThreads.length > 0 ? view.hiddenThreads.length : null;
  const shared = {
    role: "treeitem",
    tabIndex: -1,
    "data-sidebar-row": rowId,
    "data-testid": "sidebar-thread-group-toggle",
    onClick: () => props.onToggle(view.group.id),
    onContextMenu: (event: React.MouseEvent) => {
      event.preventDefault();
      props.onContextMenu(view, { x: event.clientX, y: event.clientY });
    },
  } as const;
  return (
    <li
      ref={setNodeRef}
      data-testid="sidebar-thread-group"
      data-drop-target={isDropTarget || undefined}
      className={cn(
        "relative list-none rounded-(--control-radius)",
        props.variant === "section" && "mx-0.5",
        isDropTarget && "bg-primary/10 ring-1 ring-inset ring-primary/50",
      )}
    >
      {props.variant === "section" ? (
        <CollapsibleSectionHeader
          {...shared}
          expanded={!view.collapsed}
          tone={isDropTarget ? "accent" : "muted"}
          accessory={
            <span className="flex items-center gap-1.5 font-normal tabular-nums">
              <SidebarFolderDot dot={dot} />
              {count}
            </span>
          }
        >
          {view.group.name}
        </CollapsibleSectionHeader>
      ) : (
        <button
          {...shared}
          type="button"
          aria-expanded={!view.collapsed}
          className="flex h-7 w-full cursor-pointer items-center gap-2 rounded-(--control-radius) ps-9 pe-(--sidebar-row-content-inset) text-left outline-none hover:bg-sidebar-row-hover focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
        >
          <span
            className={cn(
              "min-w-0 flex-1 truncate text-xs font-medium text-sidebar-foreground/80",
              isDropTarget && "text-primary",
            )}
          >
            {view.group.name}
          </span>
          <SidebarFolderDot dot={dot} />
          {count === null ? null : (
            <span className="shrink-0 text-xs tabular-nums text-sidebar-muted-foreground">
              {count}
            </span>
          )}
          <ChevronDownIcon
            aria-hidden
            className={cn(
              "size-3 shrink-0 text-sidebar-muted-foreground transition-transform",
              view.collapsed && "-rotate-90",
            )}
          />
        </button>
      )}
    </li>
  );
});
