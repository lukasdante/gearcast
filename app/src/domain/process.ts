/**
 * Process impact ("it turns red where the process stops"):
 * a process node is DOWN when every unit of one of its duty/standby pairs is unavailable;
 * every node downstream along wastewater links is AFFECTED (no flow);
 * the node immediately upstream of a DOWN node sees its level rising.
 */
import { PLANT } from '../data';
import { getRotationRole, getStatus, isDown, type StatusContext } from './status';

export type NodeState = 'ok' | 'down' | 'affected' | 'changeover';
export interface ProcessImpact {
  nodeState: Record<string, NodeState>;
  levelRising: Set<string>;
  downNodes: string[];
  affectedNodes: string[];
}

const flowLinks = PLANT.links.filter(l => l.flow_type === 'Wastewater');

/** Units that carry the flow at each node, grouped by pair (motors / vibrator motors are covered via getStatus). */
const pairsByNode = (() => {
  const m = new Map<string, Map<string, string[]>>();
  for (const a of PLANT.equipment) {
    if (!a.pair_id || !a.location_node || a.parent_asset || /^M-/.test(a.asset_id)) continue;
    const byPair = m.get(a.location_node) ?? new Map<string, string[]>();
    byPair.set(a.pair_id, [...(byPair.get(a.pair_id) ?? []), a.asset_id]);
    m.set(a.location_node, byPair);
  }
  return m;
})();

export function computeImpact(ctx: StatusContext): ProcessImpact {
  const nodeState: Record<string, NodeState> = {};
  const down: string[] = [];
  for (const [node, pairs] of pairsByNode) {
    for (const ids of pairs.values()) {
      if (ids.every(id => isDown(getStatus(ctx, id)))) { nodeState[node] = 'down'; down.push(node); break; }
      const duty = ids.find(id => getRotationRole(ctx, id) === 'DUTY');
      if (duty && isDown(getStatus(ctx, duty))) nodeState[node] = 'changeover';
    }
  }
  const affected: string[] = [];
  const queue = [...down];
  while (queue.length) {
    const n = queue.shift()!;
    for (const l of flowLinks) {
      if (l.from_node !== n || nodeState[l.to_node] === 'down' || affected.includes(l.to_node)) continue;
      affected.push(l.to_node);
      nodeState[l.to_node] = 'affected';
      queue.push(l.to_node);
    }
  }
  const levelRising = new Set<string>();
  for (const n of down) for (const l of flowLinks) if (l.to_node === n && !nodeState[l.from_node]?.match(/down|affected/)) levelRising.add(l.from_node);
  return { nodeState, levelRising, downNodes: down, affectedNodes: affected };
}
