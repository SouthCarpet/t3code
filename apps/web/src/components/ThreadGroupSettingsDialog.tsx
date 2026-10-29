import type { ProjectIconOverride } from "@t3tools/contracts";
import { FolderGit2Icon, FolderIcon } from "lucide-react";
import { lazy, type ReactNode, Suspense, useEffect, useId, useState } from "react";
import { create } from "zustand";

import { cn } from "~/lib/utils";
import { readLocalApi } from "../localApi";
import {
  subfolderInsideProject,
  type ThreadGroup,
  type ThreadGroupAutoAddMode,
  type ThreadGroupSettings,
} from "../threadGroups";
import { ThreadGroupIcon } from "./sidebar/ThreadGroupIcon";
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
import { Menu, MenuItem, MenuPopup, MenuTrigger } from "./ui/menu";
import { Switch } from "./ui/switch";
import { Toggle, ToggleGroup } from "./ui/toggle-group";
import { Tooltip, TooltipPopup, TooltipTrigger } from "./ui/tooltip";

const ProjectIconPickerDialog = lazy(() =>
  import("./settings/ProjectIconPickerDialog").then((module) => ({
    default: module.ProjectIconPickerDialog,
  })),
);

type GroupSettingsResult = ThreadGroupSettings & { readonly name: string };

/** What the dialog needs from the group's project. */
export interface ThreadGroupSettingsContext {
  readonly projectRoot: string | null;
  /** `owner/name` of the repositories this environment knows, sorted. */
  readonly knownRepositories: readonly string[];
}

interface SettingsRequest {
  readonly group: ThreadGroup;
  readonly context: ThreadGroupSettingsContext;
  readonly resolve: (result: GroupSettingsResult | null) => void;
}
const useRequest = create<{ request: SettingsRequest | null }>(() => ({ request: null }));

export function requestThreadGroupSettings(
  group: ThreadGroup,
  context: ThreadGroupSettingsContext,
): Promise<GroupSettingsResult | null> {
  useRequest.getState().request?.resolve(null);
  return new Promise((resolve) => useRequest.setState({ request: { group, context, resolve } }));
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
  return request ? (
    <ThreadGroupSettingsDialog group={request.group} context={request.context} />
  ) : null;
}

/** Same summary as the project icon row: `name · color`, `text · color` or the emoji. */
function iconSummary(icon: ProjectIconOverride | null | undefined): string {
  if (!icon) return "Folder (default)";
  if (icon.kind === "emoji") return icon.emoji;
  return `${icon.kind === "lucide" ? icon.name : icon.text} · ${icon.color}`;
}

function GroupIconRow(props: {
  groupName: string;
  icon: ProjectIconOverride | null;
  onChange: (icon: ProjectIconOverride) => void;
}) {
  const [pickerOpen, setPickerOpen] = useState(false);
  return (
    <div className="flex items-center justify-between gap-3">
      <div className="flex min-w-0 flex-col gap-0.5">
        <Label>Group icon</Label>
        <span className="truncate text-muted-foreground text-xs">{iconSummary(props.icon)}</span>
      </div>
      <div className="flex shrink-0 items-center gap-2">
        <ThreadGroupIcon icon={props.icon} className="size-6" />
        <Button
          size="sm"
          variant="outline"
          type="button"
          aria-label="Choose a group icon"
          onClick={() => setPickerOpen(true)}
        >
          Choose icon
        </Button>
      </div>
      {pickerOpen ? (
        <Suspense fallback={null}>
          <ProjectIconPickerDialog
            title="Choose group icon"
            current={props.icon}
            projectName={props.groupName}
            open
            onOpenChange={setPickerOpen}
            onSelect={props.onChange}
          />
        </Suspense>
      ) : null}
    </div>
  );
}

/** An icon button with a tooltip that also shows while the button is disabled. */
function ToolButton(props: {
  label: string;
  tooltip: string;
  disabled: boolean;
  onClick?: () => void;
  children: ReactNode;
}) {
  return (
    <Tooltip>
      <TooltipTrigger render={<span className="inline-flex shrink-0" />}>
        <Button
          size="icon-sm"
          variant="outline"
          type="button"
          aria-label={props.label}
          disabled={props.disabled}
          onClick={props.onClick}
        >
          {props.children}
        </Button>
      </TooltipTrigger>
      <TooltipPopup side="top">{props.tooltip}</TooltipPopup>
    </Tooltip>
  );
}

/** One opt-in auto-add rule: a switch, its value and a helper button. */
function RuleField(props: {
  id: string;
  label: string;
  placeholder: string;
  rule: RuleState;
  onChange: (rule: RuleState) => void;
  action: ReactNode;
  error?: string | null;
}) {
  const { rule } = props;
  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-center gap-2">
        <Switch
          size="sm"
          aria-label={`Use ${props.label.toLowerCase()}`}
          checked={rule.on}
          onCheckedChange={(on) => props.onChange({ ...rule, on })}
        />
        <span className={cn(!rule.on && "opacity-64")}>
          <Label htmlFor={props.id}>{props.label}</Label>
        </span>
      </div>
      <div className="flex items-center gap-2">
        <Input
          nativeInput
          id={props.id}
          placeholder={props.placeholder}
          disabled={!rule.on}
          value={rule.value}
          onChange={(event) => props.onChange({ ...rule, value: event.target.value })}
        />
        {props.action}
      </div>
      {props.error ? <span className="text-destructive text-xs">{props.error}</span> : null}
    </div>
  );
}

interface RuleState {
  readonly on: boolean;
  readonly value: string;
}

function ruleStateOf(value: string | null | undefined): RuleState {
  return { on: Boolean(value), value: value ?? "" };
}

function ruleReady(rule: RuleState): boolean {
  return rule.on && rule.value.trim().length > 0;
}

function canPickFolder(): boolean {
  return typeof window !== "undefined" && Boolean(window.desktopBridge);
}

function BrowseFolderButton(props: {
  projectRoot: string | null;
  disabled: boolean;
  onPicked: (subfolder: string) => void;
  onError: (message: string | null) => void;
}) {
  const available = canPickFolder() && props.projectRoot !== null;
  const browse = async () => {
    const root = props.projectRoot;
    const picked = root ? await readLocalApi()?.dialogs.pickFolder({ initialPath: root }) : null;
    if (!root || !picked) return;
    const subfolder = subfolderInsideProject(root, picked);
    props.onError(subfolder === null ? "Choose a folder inside the project" : null);
    if (subfolder !== null) props.onPicked(subfolder);
  };
  return (
    <ToolButton
      label="Browse for a sub-folder"
      tooltip={available ? "Browse…" : "Available in the desktop app"}
      disabled={props.disabled || !available}
      onClick={() => void browse()}
    >
      <FolderIcon />
    </ToolButton>
  );
}

function KnownRepositoriesButton(props: {
  repositories: readonly string[];
  disabled: boolean;
  onSelect: (repository: string) => void;
}) {
  const empty = props.repositories.length === 0;
  if (empty || props.disabled) {
    return (
      <ToolButton
        label="Known repositories"
        tooltip={empty ? "No repositories known yet" : "Known repositories"}
        disabled
      >
        <FolderGit2Icon />
      </ToolButton>
    );
  }
  return (
    <Menu>
      <MenuTrigger
        render={
          <Button size="icon-sm" variant="outline" type="button" title="Known repositories" />
        }
        aria-label="Known repositories"
      >
        <FolderGit2Icon />
      </MenuTrigger>
      <MenuPopup align="end">
        {props.repositories.map((repository) => (
          <MenuItem key={repository} onClick={() => props.onSelect(repository)}>
            {repository}
          </MenuItem>
        ))}
      </MenuPopup>
    </Menu>
  );
}

function AutoAddRules(props: {
  id: string;
  context: ThreadGroupSettingsContext;
  subfolder: RuleState;
  repo: RuleState;
  mode: ThreadGroupAutoAddMode;
  onSubfolder: (rule: RuleState) => void;
  onRepo: (rule: RuleState) => void;
  onMode: (mode: ThreadGroupAutoAddMode) => void;
}) {
  const [folderError, setFolderError] = useState<string | null>(null);
  const { subfolder, repo } = props;
  const bothRules = ruleReady(subfolder) && ruleReady(repo);
  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-col gap-1">
        <Label>Auto-add threads</Label>
        <DialogDescription>
          Threads that run in this folder or repository of the project join the group automatically.
        </DialogDescription>
      </div>
      <RuleField
        id={`${props.id}-subfolder`}
        label="From sub-folder"
        placeholder="apps/my-app"
        rule={subfolder}
        onChange={props.onSubfolder}
        error={folderError}
        action={
          <BrowseFolderButton
            projectRoot={props.context.projectRoot}
            disabled={!subfolder.on}
            onPicked={(value) => props.onSubfolder({ on: true, value })}
            onError={setFolderError}
          />
        }
      />
      <RuleField
        id={`${props.id}-repo`}
        label="From git repository"
        placeholder="apps/my-app or owner/repo"
        rule={repo}
        onChange={props.onRepo}
        action={
          <KnownRepositoriesButton
            repositories={props.context.knownRepositories}
            disabled={!repo.on}
            onSelect={(value) => props.onRepo({ on: true, value })}
          />
        }
      />
      <div className="flex items-center gap-3">
        <span className={cn("text-sm font-medium", !bothRules && "opacity-64")}>Match</span>
        <ToggleGroup
          aria-label="Match rules"
          disabled={!bothRules}
          value={[props.mode]}
          onValueChange={(next) => {
            if (next[0] === "any" || next[0] === "all") props.onMode(next[0]);
          }}
        >
          <Toggle value="any">any</Toggle>
          <Toggle value="all">all</Toggle>
        </ToggleGroup>
      </div>
    </div>
  );
}

function ruleValue(rule: RuleState): string | null {
  return rule.on ? rule.value : null;
}

function ThreadGroupSettingsDialog(props: {
  group: ThreadGroup;
  context: ThreadGroupSettingsContext;
}) {
  const { group } = props;
  const id = useId();
  const [name, setName] = useState(group.name);
  const [icon, setIcon] = useState(group.icon ?? null);
  const [subfolder, setSubfolder] = useState(() => ruleStateOf(group.autoAddSubfolder));
  const [repo, setRepo] = useState(() => ruleStateOf(group.autoAddRepo));
  const [mode, setMode] = useState<ThreadGroupAutoAddMode>(group.autoAddMode ?? "any");
  // A switched-on rule needs a value; a switched-off rule saves as null.
  const canSave =
    name.trim().length > 0 && [subfolder, repo].every((rule) => !rule.on || ruleReady(rule));
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
            if (!canSave) return;
            finish({
              name,
              icon,
              autoAddSubfolder: ruleValue(subfolder),
              autoAddRepo: ruleValue(repo),
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
              <GroupIconRow groupName={name.trim() || group.name} icon={icon} onChange={setIcon} />
              <AutoAddRules
                id={id}
                context={props.context}
                subfolder={subfolder}
                repo={repo}
                mode={mode}
                onSubfolder={setSubfolder}
                onRepo={setRepo}
                onMode={setMode}
              />
            </div>
          </DialogPanel>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => finish(null)}>
              Cancel
            </Button>
            <Button type="submit" disabled={!canSave}>
              Save
            </Button>
          </DialogFooter>
        </form>
      </DialogPopup>
    </Dialog>
  );
}
