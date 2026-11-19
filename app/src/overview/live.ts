/** Live (simulated) status projected onto a layout document. */
import { useMemo } from 'react';
import { PLANT } from '../data';
import { STATUS_COLORS, summarize, viewAsset, type AssetView } from '../domain/status';
import { computeImpact, type ProcessImpact } from '../domain/process';
import { itemNode, type LayoutItem, type LayoutPipe } from '../domain/layout';
import { useStatusCtx } from '../store/statusStore';
import type { VisualState } from '../models/types';

export interface Live {
  views: Map<string, AssetView>;
  impact: ProcessImpact;
  summary: ReturnType<typeof summarize>;
}

export function useLive(): Live {
  const ctx = useStatusCtx();
  return useMemo(() => ({
    views: new Map(PLANT.equipment.map(a => [a.asset_id, viewAsset(ctx, a.asset_id)])),
    impact: computeImpact(ctx),
    summary: summarize(ctx),
  }), [ctx]);
}

export interface ItemVisual { state: VisualState; color: string; level: number; view?: AssetView }

export function itemVisual(item: LayoutItem, live: Live): ItemVisual {
  const node = itemNode(item);
  const ns = node ? live.impact.nodeState[node] : undefined;
  const level = node && live.impact.levelRising.has(node) ? 0.93 : ns === 'affected' ? 0.18 : 0.55;
  const view = item.assetId ? live.views.get(item.assetId) : undefined;
  if (view) return { state: view.visual, color: view.color, level, view };
  if (ns === 'down') return { state: 'fault', color: STATUS_COLORS.fault, level };
  if (ns === 'affected') return { state: 'standby', color: STATUS_COLORS.maintenance, level };
  if (item.kind === 'spare_rack') return { state: 'stored', color: STATUS_COLORS.stored, level };
  return { state: 'running', color: STATUS_COLORS.running, level };
}

export type PipeFlow = 'flow' | 'idle' | 'noflow' | 'down';

/** A pipe animates when its source is flowing; out of a failed / no-flow source it stops. */
export function pipeFlow(pipe: LayoutPipe, items: Map<string, LayoutItem>, live: Live): PipeFlow {
  const src = items.get(pipe.from.itemId);
  if (!src) return 'idle';
  const node = itemNode(src);
  const ns = node ? live.impact.nodeState[node] : undefined;
  const view = src.assetId ? live.views.get(src.assetId) : undefined;
  if (ns === 'down') return 'down';
  if (view) {
    if (view.visual === 'fault') return 'down';
    if (view.visual !== 'running') return 'idle';
  }
  if (ns === 'affected') return 'noflow';
  return 'flow';
}
