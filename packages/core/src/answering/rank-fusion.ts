/**
 * Reciprocal Rank Fusion: an item's score is the sum of 1 / (K + rank) over the
 * rankings that hold it, with ranks from 1. Answering fuses the hybrid search's two
 * rankings with it, whichever repository adapter ranked them.
 */
export class RankFusion {
  /** The usual constant. It keeps one first place from outweighing several good places. */
  static readonly K = 60;

  /** The ids of every ranking, best fused score first. A tie keeps the order in which the ids came first. */
  static fuse<Id>(rankings: Id[][]): Id[] {
    const scores = new Map<Id, number>();
    for (const ranking of rankings) {
      ranking.forEach((id, index) => scores.set(id, (scores.get(id) ?? 0) + 1 / (RankFusion.K + index + 1)));
    }
    return [...scores.entries()].sort(([, a], [, b]) => b - a).map(([id]) => id);
  }
}
