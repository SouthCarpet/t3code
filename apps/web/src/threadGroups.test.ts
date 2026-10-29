import { describe, expect, it } from "vite-plus/test";
import {
  createThreadGroup,
  deleteThreadGroup,
  renameThreadGroup,
  resolveThreadGroup,
  sanitizeThreadGroups,
  setThreadGroupMembership,
  splitThreadsByGroup,
  type ThreadGroupsByProjectKey,
} from "./threadGroups";

const P = "env:p1";
const Q = "env:p2";

function withGroups(): ThreadGroupsByProjectKey {
  let state = createThreadGroup({}, P, { id: "a", name: "Alpha" });
  state = createThreadGroup(state, P, { id: "b", name: "Beta" });
  state = createThreadGroup(state, Q, { id: "c", name: "Gamma" });
  state = setThreadGroupMembership(state, P, "t1", "a");
  state = setThreadGroupMembership(state, P, "t2", "b");
  return setThreadGroupMembership(state, Q, "t4", "c");
}

describe("thread group updates", () => {
  it("creates groups in order and ignores blank names and duplicate ids", () => {
    let state = createThreadGroup({}, P, { id: "a", name: " Alpha " });
    expect(createThreadGroup(state, P, { id: "a", name: "Again" })).toBe(state);
    expect(createThreadGroup(state, P, { id: "x", name: "  " })).toBe(state);
    state = createThreadGroup(state, P, { id: "b", name: "Beta" });
    expect(state[P]!.groups).toEqual([
      { id: "a", name: "Alpha" },
      { id: "b", name: "Beta" },
    ]);
  });

  it("moves a thread between groups, out of them, and refuses unknown groups", () => {
    let state = withGroups();
    state = setThreadGroupMembership(state, P, "t1", "b");
    expect(resolveThreadGroup(state, P, "t1")?.name).toBe("Beta");
    expect(setThreadGroupMembership(state, P, "t1", "missing")).toBe(state);
    state = setThreadGroupMembership(state, P, "t1", null);
    expect(resolveThreadGroup(state, P, "t1")).toBeNull();
    expect(state[P]!.membership).toEqual({ t2: "b" });
  });

  it("renames a group and deletes it, ungrouping only its threads", () => {
    let state = renameThreadGroup(withGroups(), P, "a", "Renamed");
    expect(state[P]!.groups[0]).toEqual({ id: "a", name: "Renamed" });
    state = deleteThreadGroup(state, P, "a");
    expect(state[P]!.groups.map(({ id }) => id)).toEqual(["b"]);
    expect(state[P]!.membership).toEqual({ t2: "b" });
    expect(state[Q]!.membership).toEqual({ t4: "c" });
  });
});

describe("splitThreadsByGroup", () => {
  const threads = [
    { key: "t3", project: P },
    { key: "t2", project: P },
    { key: "t4", project: Q },
    { key: "t1", project: P },
  ];
  const split = (projectKeys: string[], keepEmpty: boolean, state = withGroups()) =>
    splitThreadsByGroup({
      threads,
      projectKeys,
      state,
      projectKeyOf: (thread) => thread.project,
      threadKeyOf: (thread) => thread.key,
      keepEmpty,
    });

  it("orders sections by project then group and keeps the ungrouped order", () => {
    const result = split([P, Q], false);
    expect(
      result.sections.map((section) => [section.group.id, section.threads.map((t) => t.key)]),
    ).toEqual([
      ["a", ["t1"]],
      ["b", ["t2"]],
      ["c", ["t4"]],
    ]);
    expect(result.ungrouped.map((t) => t.key)).toEqual(["t3"]);
  });

  it("leaves threads of unlisted projects ungrouped and drops or keeps empty groups", () => {
    const state = deleteThreadGroup(withGroups(), P, "b");
    const result = split([P], false, createThreadGroup(state, P, { id: "e", name: "Empty" }));
    expect(result.sections.map((section) => section.group.id)).toEqual(["a"]);
    expect(result.ungrouped.map((t) => t.key)).toEqual(["t3", "t2", "t4"]);
    const kept = split([P], true, createThreadGroup(state, P, { id: "e", name: "Empty" }));
    expect(kept.sections.map((section) => section.group.id)).toEqual(["a", "e"]);
  });
});

it("sanitizeThreadGroups drops malformed groups and memberships of missing groups", () => {
  expect(
    sanitizeThreadGroups({
      [P]: {
        groups: [{ id: "a", name: "Alpha" }, { id: "" }, null],
        membership: { t1: "a", t2: "gone", t3: 4 },
      },
      [Q]: { groups: [] },
      "": { groups: [{ id: "z", name: "Z" }] },
    }),
  ).toEqual({ [P]: { groups: [{ id: "a", name: "Alpha" }], membership: { t1: "a" } } });
});
