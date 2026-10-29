import {
  BookOpenIcon,
  BotIcon,
  BugIcon,
  ClockIcon,
  ShoppingBagIcon,
  FolderIcon,
  GitBranchIcon,
  RocketIcon,
} from "lucide-react";

import { cn } from "~/lib/utils";
import type { ThreadGroupColor, ThreadGroupIcon as ThreadGroupIconName } from "../../threadGroups";

const THREAD_GROUP_ICON_COMPONENTS = {
  folder: FolderIcon,
  "shopping-bag": ShoppingBagIcon,
  "git-branch": GitBranchIcon,
  clock: ClockIcon,
  bot: BotIcon,
  rocket: RocketIcon,
  bug: BugIcon,
  "book-open": BookOpenIcon,
} as const satisfies Record<ThreadGroupIconName, unknown>;

// Literal class names, so Tailwind emits them and the `--color-*` variables they read.
export const THREAD_GROUP_COLOR_STYLES = {
  slate: { text: "text-slate-400", fill: "bg-slate-500", css: "var(--color-slate-400)" },
  red: { text: "text-red-400", fill: "bg-red-500", css: "var(--color-red-400)" },
  amber: { text: "text-amber-400", fill: "bg-amber-500", css: "var(--color-amber-400)" },
  green: { text: "text-green-400", fill: "bg-green-500", css: "var(--color-green-400)" },
  teal: { text: "text-teal-400", fill: "bg-teal-500", css: "var(--color-teal-400)" },
  blue: { text: "text-blue-400", fill: "bg-blue-500", css: "var(--color-blue-400)" },
  violet: { text: "text-violet-400", fill: "bg-violet-500", css: "var(--color-violet-400)" },
  pink: { text: "text-pink-400", fill: "bg-pink-500", css: "var(--color-pink-400)" },
} as const satisfies Record<ThreadGroupColor, unknown>;

/**
 * The group's icon in its color. `badge` puts it on a filled square in place of a
 * project avatar. No icon falls back to a folder; no color to the muted tone.
 */
export function ThreadGroupIcon(props: {
  icon: ThreadGroupIconName | undefined;
  color: ThreadGroupColor | undefined;
  look: "inline" | "badge";
  className?: string;
}) {
  const Icon = THREAD_GROUP_ICON_COMPONENTS[props.icon ?? "folder"];
  const style = props.color ? THREAD_GROUP_COLOR_STYLES[props.color] : null;
  if (props.look === "inline") {
    return (
      <Icon
        aria-hidden
        className={cn("shrink-0", style?.text ?? "text-sidebar-muted-foreground", props.className)}
      />
    );
  }
  return (
    <span
      aria-hidden
      className={cn(
        "flex shrink-0 items-center justify-center rounded-sm text-white",
        style?.fill ?? "bg-muted-foreground/60",
        props.className,
      )}
    >
      <Icon className="size-[75%]" strokeWidth={2.5} />
    </span>
  );
}
