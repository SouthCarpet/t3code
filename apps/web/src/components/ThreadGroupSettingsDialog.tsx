import { useEffect, useId, useState } from "react";
import { create } from "zustand";

import { cn } from "~/lib/utils";
import {
  THREAD_GROUP_COLORS,
  THREAD_GROUP_ICONS,
  type ThreadGroup,
  type ThreadGroupAutoAddMode,
  type ThreadGroupSettings,
} from "../threadGroups";
import { THREAD_GROUP_COLOR_STYLES, ThreadGroupIcon } from "./sidebar/ThreadGroupIcon";
import { Button } from "./ui/button";
import {
  Dialog,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogPanel,
  DialogPopup,
  DialogTitle,
} from "./ui/dialog";
import { Input } from "./ui/input";
import { Label } from "./ui/label";
import { Toggle, ToggleGroup } from "./ui/toggle-group";

type GroupSettingsResult = ThreadGroupSettings & { readonly name: string };

interface SettingsRequest {
  readonly group: ThreadGroup;
  readonly resolve: (result: GroupSettingsResult | null) => void;
}
const useRequest = create<{ request: SettingsRequest | null }>(() => ({ request: null }));

export function requestThreadGroupSettings(
  group: ThreadGroup,
): Promise<GroupSettingsResult | null> {
  useRequest.getState().request?.resolve(null);
  return new Promise((resolve) => useRequest.setState({ request: { group, resolve } }));
}

function finish(result: GroupSettingsResult | null) {
  const request = useRequest.getState().request;
  useRequest.setState({ request: null });
  request?.resolve(result);
}

export function ThreadGroupSettingsDialogHost() {
  const request = useRequest((state) => state.request);
  // oxlint-disable-next-line t3code/no-unreasoned-state-sync -- resolves a pending settings request with null when the host unmounts
  useEffect(() => () => finish(null), []);
  return request ? <ThreadGroupSettingsDialog group={request.group} /> : null;
}

function IconPicker(props: {
  value: ThreadGroupSettings["icon"];
  color: ThreadGroupSettings["color"];
  onChange: (icon: ThreadGroupSettings["icon"]) => void;
}) {
  return (
    <ToggleGroup
      aria-label="Group icon"
      variant="outline"
      size="sm"
      className="flex-wrap"
      value={props.value ? [props.value] : []}
      onValueChange={(next) => props.onChange(THREAD_GROUP_ICONS.find((icon) => icon === next[0]))}
    >
      {THREAD_GROUP_ICONS.map((icon) => (
        <Toggle key={icon} value={icon} aria-label={icon}>
          <ThreadGroupIcon icon={icon} color={props.color} look="inline" className="size-4" />
        </Toggle>
      ))}
    </ToggleGroup>
  );
}

function ColorPicker(props: {
  value: ThreadGroupSettings["color"];
  onChange: (color: ThreadGroupSettings["color"]) => void;
}) {
  return (
    <div role="radiogroup" aria-label="Group color" className="flex flex-wrap gap-2">
      {THREAD_GROUP_COLORS.map((color) => (
        <button
          key={color}
          type="button"
          role="radio"
          aria-checked={props.value === color}
          aria-label={color}
          onClick={() => props.onChange(props.value === color ? undefined : color)}
          className={cn(
            "size-6 cursor-pointer rounded-full outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring",
            THREAD_GROUP_COLOR_STYLES[color].fill,
            props.value === color && "ring-2 ring-inset ring-foreground",
          )}
        />
      ))}
    </div>
  );
}

function ThreadGroupSettingsDialog({ group }: { group: ThreadGroup }) {
  const id = useId();
  const [name, setName] = useState(group.name);
  const [icon, setIcon] = useState(group.icon);
  const [color, setColor] = useState(group.color);
  const [subfolder, setSubfolder] = useState(group.autoAddSubfolder ?? "");
  const [repo, setRepo] = useState(group.autoAddRepo ?? "");
  const [mode, setMode] = useState<ThreadGroupAutoAddMode>(group.autoAddMode ?? "any");
  const bothRules = subfolder.trim().length > 0 && repo.trim().length > 0;
  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) finish(null);
      }}
    >
      <DialogPopup className="sm:max-w-md">
        <form
          className="flex min-h-0 flex-col"
          onSubmit={(event) => {
            event.preventDefault();
            if (name.trim().length === 0) return;
            finish({
              name,
              icon,
              color,
              autoAddSubfolder: subfolder,
              autoAddRepo: repo,
              autoAddMode: mode,
            });
          }}
        >
          <DialogHeader>
            <DialogTitle>Group settings</DialogTitle>
          </DialogHeader>
          <DialogPanel>
            <div className="flex flex-col gap-4">
              <div className="flex flex-col gap-1.5">
                <Label htmlFor={`${id}-name`}>Name</Label>
                <Input
                  nativeInput
                  id={`${id}-name`}
                  autoFocus
                  value={name}
                  onChange={(event) => setName(event.target.value)}
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label>Icon</Label>
                <IconPicker value={icon} color={color} onChange={setIcon} />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label>Color</Label>
                <ColorPicker value={color} onChange={setColor} />
              </div>
              <div className="flex flex-col gap-3">
                <div className="flex flex-col gap-1">
                  <Label>Auto-add threads</Label>
                  <DialogDescription>
                    Threads that run in this folder or repository of the project join the group
                    automatically.
                  </DialogDescription>
                </div>
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor={`${id}-subfolder`}>From sub-folder</Label>
                  <Input
                    nativeInput
                    id={`${id}-subfolder`}
                    placeholder="apps/my-app"
                    value={subfolder}
                    onChange={(event) => setSubfolder(event.target.value)}
                  />
                </div>
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor={`${id}-repo`}>From git repository</Label>
                  <Input
                    nativeInput
                    id={`${id}-repo`}
                    placeholder="apps/my-app or owner/repo"
                    value={repo}
                    onChange={(event) => setRepo(event.target.value)}
                  />
                </div>
                <div className="flex items-center gap-3">
                  <span className={cn("text-sm font-medium", !bothRules && "opacity-64")}>
                    Match
                  </span>
                  <ToggleGroup
                    aria-label="Match rules"
                    disabled={!bothRules}
                    value={[mode]}
                    onValueChange={(next) => {
                      if (next[0] === "any" || next[0] === "all") setMode(next[0]);
                    }}
                  >
                    <Toggle value="any">any</Toggle>
                    <Toggle value="all">all</Toggle>
                  </ToggleGroup>
                </div>
              </div>
            </div>
          </DialogPanel>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => finish(null)}>
              Cancel
            </Button>
            <Button type="submit" disabled={name.trim().length === 0}>
              Save
            </Button>
          </DialogFooter>
        </form>
      </DialogPopup>
    </Dialog>
  );
}
