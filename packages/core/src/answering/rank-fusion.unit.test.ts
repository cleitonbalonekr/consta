import { describe, expect, it } from "vitest";
import { RankFusion } from "./rank-fusion";

describe("RankFusion", () => {
  it("puts an item that both rankings hold above items that only one holds", () => {
    expect(RankFusion.fuse([["a", "b", "c"], ["d", "c", "e"]])).toEqual(["c", "a", "d", "b", "e"]);
  });

  it("scores each place as 1 / (60 + rank)", () => {
    // b: 1/62 + 1/62 = 0.03226; a: 1/61 = 0.01639. Two second places beat one first place.
    expect(RankFusion.fuse([["a", "b"], ["c", "b"]])[0]).toBe("b");
    expect(RankFusion.K).toBe(60);
  });

  it("keeps the first ranking's order for a tie, and works with one ranking or none", () => {
    expect(RankFusion.fuse([["a", "b"], ["b", "a"]])).toEqual(["a", "b"]);
    expect(RankFusion.fuse([["x", "y", "z"]])).toEqual(["x", "y", "z"]);
    expect(RankFusion.fuse([[], []])).toEqual([]);
  });
});
