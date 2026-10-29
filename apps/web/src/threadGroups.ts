/**
 * Manual thread groups. They are client-only UI state, kept per physical project
 * (`${environmentId}:${projectId}`): an ordered list of named groups and a map from
 * a scoped thread key to the id of its group.
 */
export interface ThreadGroup {
  readonly id: string;
  readonly name: string;
}

export interface ProjectThreadGroups {
  readonly groups: readonly ThreadGroup[];
  readonly membership: Readonly<Record<string, string>>;
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
  if ((current.membership[threadKey] ?? null) === groupId) return state;
  if (groupId !== null && !current.groups.some(({ id }) => id === groupId)) return state;
  const { [threadKey]: _previous, ...rest } = current.membership;
  return withProjectGroups(state, projectKey, {
    ...current,
    membership: groupId === null ? rest : { ...rest, [threadKey]: groupId },
  });
}

/** The group that holds the thread, if the group still exists. */
export function resolveThreadGroup(
  state: ThreadGroupsByProjectKey,
  projectKey: string,
  threadKey: string,
): ThreadGroup | null {
  const current = projectGroupsOf(state, projectKey);
  const groupId = current.membership[threadKey];
  return groupId === undefined ? null : (current.groups.find(({ id }) => id === groupId) ?? null);
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
    const groupId = projectGroupsOf(input.state, projectKey).membership[input.threadKeyOf(thread)];
    const section =
      groupId === undefined ? undefined : sectionByGroup.get(`${projectKey}\0${groupId}`);
    if (section === undefined) ungrouped.push(thread);
    else section.threads.push(thread);
  }
  return {
    sections: input.keepEmpty ? sections : sections.filter(({ threads }) => threads.length > 0),
    ungrouped,
  };
}

function sanitizeGroup(value: unknown): ThreadGroup | null {
  if (!value || typeof value !== "object") return null;
  const { id, name } = value as Record<string, unknown>;
  return typeof id === "string" && id.length > 0 && typeof name === "string" && name.length > 0
    ? { id, name }
    : null;
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
  return groups.length > 0 ? { groups, membership } : null;
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
