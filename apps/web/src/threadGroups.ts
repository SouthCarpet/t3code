import { ProjectIconOverride } from "@t3tools/contracts";
import * as Schema from "effect/Schema";

/**
 * Manual thread groups. They are client-only UI state, kept per physical project
 * (`${environmentId}:${projectId}`): an ordered list of named groups and a map from
 * a scoped thread key to the id of its group.
 */
export interface ThreadGroupSettings {
  /** Same model as a project icon: lucide, emoji or monogram. */
  readonly icon?: ProjectIconOverride | null;
  /** Project-relative folder; threads that run inside it join the group. */
  readonly autoAddSubfolder?: string | null;
  /** Repository root path (absolute or project-relative) or remote slug `owner/repo`. */
  readonly autoAddRepo?: string | null;
  /** How two set rules combine; one set rule ignores it. */
  readonly autoAddMode?: ThreadGroupAutoAddMode;
}

export type ThreadGroupAutoAddMode = "any" | "all";

export interface ThreadGroup extends ThreadGroupSettings {
  readonly id: string;
  readonly name: string;
}

export interface ProjectThreadGroups {
  readonly groups: readonly ThreadGroup[];
  readonly membership: Readonly<Record<string, string>>;
  /** Threads removed by hand; auto-add rules skip them. */
  readonly excluded?: Readonly<Record<string, true>>;
}

export type ThreadGroupsByProjectKey = Readonly<Record<string, ProjectThreadGroups>>;

const EMPTY_PROJECT_GROUPS: ProjectThreadGroups = { groups: [], membership: {} };

function projectGroupsOf(state: ThreadGroupsByProjectKey, projectKey: string) {
  return state[projectKey] ?? EMPTY_PROJECT_GROUPS;
}

function withProjectGroups(
  state: ThreadGroupsByProjectKey,
  projectKey: string,
  next: ProjectThreadGroups,
): ThreadGroupsByProjectKey {
  return { ...state, [projectKey]: next };
}

export function createThreadGroup(
  state: ThreadGroupsByProjectKey,
  projectKey: string,
  group: ThreadGroup,
): ThreadGroupsByProjectKey {
  const current = projectGroupsOf(state, projectKey);
  if (group.name.trim().length === 0 || current.groups.some(({ id }) => id === group.id)) {
    return state;
  }
  return withProjectGroups(state, projectKey, {
    ...current,
    groups: [...current.groups, { id: group.id, name: group.name.trim() }],
  });
}

export function renameThreadGroup(
  state: ThreadGroupsByProjectKey,
  projectKey: string,
  groupId: string,
  name: string,
): ThreadGroupsByProjectKey {
  const current = projectGroupsOf(state, projectKey);
  const trimmed = name.trim();
  if (trimmed.length === 0 || !current.groups.some(({ id }) => id === groupId)) return state;
  return withProjectGroups(state, projectKey, {
    ...current,
    groups: current.groups.map((group) =>
      group.id === groupId ? { ...group, name: trimmed } : group,
    ),
  });
}

/** Removes the group; its threads become ungrouped. */
export function deleteThreadGroup(
  state: ThreadGroupsByProjectKey,
  projectKey: string,
  groupId: string,
): ThreadGroupsByProjectKey {
  const current = projectGroupsOf(state, projectKey);
  if (!current.groups.some(({ id }) => id === groupId)) return state;
  return withProjectGroups(state, projectKey, {
    ...current,
    groups: current.groups.filter(({ id }) => id !== groupId),
    membership: Object.fromEntries(
      Object.entries(current.membership).filter(([, memberOf]) => memberOf !== groupId),
    ),
  });
}

/** Moves the thread into the group, or out of every group when `groupId` is null. */
export function setThreadGroupMembership(
  state: ThreadGroupsByProjectKey,
  projectKey: string,
  threadKey: string,
  groupId: string | null,
): ThreadGroupsByProjectKey {
  const current = projectGroupsOf(state, projectKey);
  const unchanged =
    (current.membership[threadKey] ?? null) === groupId &&
    (groupId !== null || current.excluded?.[threadKey] === true);
  if (unchanged) return state;
  if (groupId !== null && !current.groups.some(({ id }) => id === groupId)) return state;
  const { [threadKey]: _previous, ...rest } = current.membership;
  const { [threadKey]: _excluded, ...stillExcluded } = current.excluded ?? {};
  return withProjectGroups(state, projectKey, {
    ...current,
    membership: groupId === null ? rest : { ...rest, [threadKey]: groupId },
    excluded: groupId === null ? { ...stillExcluded, [threadKey]: true } : stillExcluded,
  });
}

function trimmedRule(value: string | null | undefined): string {
  return (value ?? "").trim().replaceAll("\\", "/").replace(/\/+$/, "");
}

/** A blank folder clears the rule; slashes are trimmed and unified. */
function normalizeSubfolder(value: string | null | undefined): string | null {
  const folder = trimmedRule(value).replace(/^\/+/, "");
  return folder.length > 0 ? folder : null;
}

/** A repository is a root path (absolute or project-relative) or a remote slug. */
function normalizeRepo(value: string | null | undefined): string | null {
  const repo = trimmedRule(value);
  return repo.length > 0 ? repo : null;
}

/** Short text for the group header: the sub-folder, the repository, or both. */
export function threadGroupAutoAddHint(group: ThreadGroupSettings): string | null {
  const { autoAddSubfolder: folder, autoAddRepo: repo } = group;
  if (folder && repo) return `${folder} + repo`;
  return folder || repo || null;
}

export function updateThreadGroupSettings(
  state: ThreadGroupsByProjectKey,
  projectKey: string,
  groupId: string,
  settings: ThreadGroupSettings & { readonly name: string },
): ThreadGroupsByProjectKey {
  const current = projectGroupsOf(state, projectKey);
  const name = settings.name.trim();
  if (name.length === 0 || !current.groups.some(({ id }) => id === groupId)) return state;
  const next: ThreadGroup = {
    id: groupId,
    name,
    ...(settings.icon ? { icon: settings.icon } : {}),
    autoAddSubfolder: normalizeSubfolder(settings.autoAddSubfolder),
    autoAddRepo: normalizeRepo(settings.autoAddRepo),
    autoAddMode: settings.autoAddMode === "all" ? "all" : "any",
  };
  return withProjectGroups(state, projectKey, {
    ...current,
    groups: current.groups.map((group) => (group.id === groupId ? next : group)),
  });
}

function unifiedPath(path: string): string {
  return path
    .trim()
    .replaceAll("\\", "/")
    .replace(/(?<!^)\/+/g, "/")
    .replace(/\/+$/, "");
}

function comparablePath(path: string): string {
  const unified = unifiedPath(path);
  // Drive-letter and UNC paths are Windows paths, which compare without case.
  return /^([a-z]:|\/\/)/i.test(unified) ? unified.toLowerCase() : unified;
}

function isAbsolutePath(path: string): boolean {
  return /^([a-z]:)?[\\/]/i.test(path);
}

/** True when `dir` is `folder` or a folder below it. */
function isInsideFolder(dir: string, folder: string): boolean {
  const base = comparablePath(folder);
  const candidate = comparablePath(dir);
  return candidate === base || candidate.startsWith(`${base}/`);
}

/**
 * A picked folder as a project-relative sub-folder, or null when it is the project
 * root itself or lies outside it.
 */
export function subfolderInsideProject(projectRoot: string, picked: string): string | null {
  const root = unifiedPath(projectRoot);
  const folder = unifiedPath(picked);
  const inside = comparablePath(folder).startsWith(`${comparablePath(root)}/`);
  return inside ? folder.slice(root.length + 1) : null;
}

/** The `owner/name` of every known repository, without duplicates, sorted. */
export function knownRepositorySlugs(
  projects: Iterable<{
    readonly repositoryIdentity?:
      | { readonly owner?: string; readonly name?: string }
      | null
      | undefined;
  }>,
): string[] {
  const slugs = new Set<string>();
  for (const { repositoryIdentity: identity } of projects) {
    if (identity?.owner && identity.name) slugs.add(`${identity.owner}/${identity.name}`);
  }
  return [...slugs].toSorted((a, b) => a.localeCompare(b));
}

/** True when `threadDir` is `<projectRoot>/<subfolder>` or a folder below it. */
export function isInsideSubfolder(
  threadDir: string,
  projectRoot: string,
  subfolder: string,
): boolean {
  return isInsideFolder(threadDir, `${projectRoot}/${subfolder}`);
}

/**
 * Where a thread runs: its worktree, or the project root when it has none, plus the
 * repository keys of its project (canonical keys such as `github.com/owner/repo`).
 */
export interface ThreadGroupLocation {
  readonly projectRoot: string | null;
  readonly threadDir: string | null;
  readonly repoKeys?: readonly string[];
}

function matchesSubfolderRule(subfolder: string, location: ThreadGroupLocation): boolean {
  const { projectRoot, threadDir } = location;
  return projectRoot !== null && threadDir !== null
    ? isInsideSubfolder(threadDir, projectRoot, subfolder)
    : false;
}

function matchesRepoSlug(repo: string, repoKeys: readonly string[]): boolean {
  const slug = repo.toLowerCase();
  return repoKeys.some((key) => {
    const candidate = key.toLowerCase();
    return candidate === slug || candidate.endsWith(`/${slug}`);
  });
}

/** A path rule matches by folder; any value also matches as a remote slug. */
function matchesRepoRule(repo: string, location: ThreadGroupLocation): boolean {
  const { projectRoot, threadDir } = location;
  const root = isAbsolutePath(repo) ? repo : projectRoot === null ? null : `${projectRoot}/${repo}`;
  const insideRoot = root !== null && threadDir !== null && isInsideFolder(threadDir, root);
  return insideRoot || matchesRepoSlug(repo, location.repoKeys ?? []);
}

function ruleResults(group: ThreadGroupSettings, location: ThreadGroupLocation): boolean[] {
  const results: boolean[] = [];
  if (group.autoAddSubfolder) results.push(matchesSubfolderRule(group.autoAddSubfolder, location));
  if (group.autoAddRepo) results.push(matchesRepoRule(group.autoAddRepo, location));
  return results;
}

/** `any` needs one set rule to match, `all` needs every set rule; no rule never matches. */
export function matchesAutoAddRules(
  group: ThreadGroupSettings,
  location: ThreadGroupLocation,
): boolean {
  const results = ruleResults(group, location);
  if (results.length === 0) return false;
  return group.autoAddMode === "all" ? results.every(Boolean) : results.some(Boolean);
}

function autoAddGroupOf(
  groups: readonly ThreadGroup[],
  location: ThreadGroupLocation | undefined,
): ThreadGroup | null {
  if (location === undefined) return null;
  return groups.find((group) => matchesAutoAddRules(group, location)) ?? null;
}

/**
 * The thread's group: its manual membership first, else the first group whose
 * auto-add rule matches, unless the thread was removed by hand.
 */
export function resolveThreadGroup(
  state: ThreadGroupsByProjectKey,
  projectKey: string,
  threadKey: string,
  location?: ThreadGroupLocation,
): ThreadGroup | null {
  const current = projectGroupsOf(state, projectKey);
  const groupId = current.membership[threadKey];
  if (groupId !== undefined) return current.groups.find(({ id }) => id === groupId) ?? null;
  if (current.excluded?.[threadKey]) return null;
  return autoAddGroupOf(current.groups, location);
}

export interface ThreadGroupSection<TThread> {
  readonly projectKey: string;
  readonly group: ThreadGroup;
  readonly threads: TThread[];
}

/**
 * Splits threads into the groups of the given projects, in project then group order,
 * and the ungrouped rest in their incoming order. With `keepEmpty` false, groups
 * without a thread are left out.
 */
export function splitThreadsByGroup<TThread>(input: {
  readonly threads: readonly TThread[];
  readonly projectKeys: readonly string[];
  readonly state: ThreadGroupsByProjectKey;
  readonly projectKeyOf: (thread: TThread) => string;
  readonly threadKeyOf: (thread: TThread) => string;
  readonly locationOf?: (thread: TThread) => ThreadGroupLocation;
  readonly keepEmpty: boolean;
}): { sections: ThreadGroupSection<TThread>[]; ungrouped: TThread[] } {
  const sections: ThreadGroupSection<TThread>[] = [];
  const sectionByGroup = new Map<string, ThreadGroupSection<TThread>>();
  for (const projectKey of input.projectKeys) {
    for (const group of projectGroupsOf(input.state, projectKey).groups) {
      const section = { projectKey, group, threads: [] as TThread[] };
      sections.push(section);
      sectionByGroup.set(`${projectKey}\0${group.id}`, section);
    }
  }
  const ungrouped: TThread[] = [];
  for (const thread of input.threads) {
    const projectKey = input.projectKeyOf(thread);
    const group = resolveThreadGroup(
      input.state,
      projectKey,
      input.threadKeyOf(thread),
      input.locationOf?.(thread),
    );
    const section = group === null ? undefined : sectionByGroup.get(`${projectKey}\0${group.id}`);
    if (section === undefined) ungrouped.push(thread);
    else section.threads.push(thread);
  }
  return {
    sections: input.keepEmpty ? sections : sections.filter(({ threads }) => threads.length > 0),
    ungrouped,
  };
}

function stringOrNull(value: unknown): string | null {
  return typeof value === "string" ? value : null;
}

const isProjectIcon = Schema.is(ProjectIconOverride);

/** Unknown or missing settings fall back to the defaults (no icon, no rule). */
function sanitizeGroupSettings(raw: Record<string, unknown>): ThreadGroupSettings {
  const icon = isProjectIcon(raw.icon) ? raw.icon : null;
  const autoAddSubfolder = normalizeSubfolder(stringOrNull(raw.autoAddSubfolder));
  const autoAddRepo = normalizeRepo(stringOrNull(raw.autoAddRepo));
  return {
    ...(icon ? { icon } : {}),
    ...(autoAddSubfolder ? { autoAddSubfolder } : {}),
    ...(autoAddRepo ? { autoAddRepo } : {}),
    ...(raw.autoAddMode === "all" ? { autoAddMode: "all" as const } : {}),
  };
}

function sanitizeGroup(value: unknown): ThreadGroup | null {
  if (!value || typeof value !== "object") return null;
  const raw = value as Record<string, unknown>;
  const { id, name } = raw;
  return typeof id === "string" && id.length > 0 && typeof name === "string" && name.length > 0
    ? { id, name, ...sanitizeGroupSettings(raw) }
    : null;
}

function sanitizeExcluded(value: unknown): Record<string, true> {
  if (!value || typeof value !== "object") return {};
  return Object.fromEntries(
    Object.entries(value)
      .filter(([, flag]) => flag === true)
      .map(([threadKey]) => [threadKey, true as const]),
  );
}

function sanitizeProjectGroups(value: unknown): ProjectThreadGroups | null {
  if (!value || typeof value !== "object") return null;
  const raw = value as Record<string, unknown>;
  const groups = Array.isArray(raw.groups)
    ? raw.groups.map(sanitizeGroup).filter((group): group is ThreadGroup => group !== null)
    : [];
  const groupIds = new Set(groups.map(({ id }) => id));
  const membership =
    raw.membership && typeof raw.membership === "object"
      ? Object.fromEntries(
          Object.entries(raw.membership).filter(
            (entry): entry is [string, string] =>
              typeof entry[1] === "string" && groupIds.has(entry[1]),
          ),
        )
      : {};
  const excluded = sanitizeExcluded(raw.excluded);
  if (groups.length === 0) return null;
  return Object.keys(excluded).length > 0
    ? { groups, membership, excluded }
    : { groups, membership };
}

export function sanitizeThreadGroups(value: unknown): ThreadGroupsByProjectKey {
  if (!value || typeof value !== "object") return {};
  const result: Record<string, ProjectThreadGroups> = {};
  for (const [projectKey, entry] of Object.entries(value)) {
    const groups = sanitizeProjectGroups(entry);
    if (projectKey.length > 0 && groups !== null) result[projectKey] = groups;
  }
  return result;
}
