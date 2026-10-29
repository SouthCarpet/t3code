import type { ProjectIconOverride } from "@t3tools/contracts";
import { FolderIcon } from "lucide-react";

import { cn } from "~/lib/utils";
import { ProjectIconGlyph } from "../ProjectFavicon";

/** The group's icon, drawn like a project icon; a group without one shows a muted folder. */
export function ThreadGroupIcon(props: {
  icon: ProjectIconOverride | null | undefined;
  className?: string;
}) {
  return props.icon ? (
    <ProjectIconGlyph icon={props.icon} className={props.className} />
  ) : (
    <FolderIcon
      aria-hidden
      className={cn("size-3.5 shrink-0 text-sidebar-muted-foreground", props.className)}
    />
  );
}
