/**
 * CONTRACT between the 3D models (src/models/**) and the app (everything else).
 * Owned by the lead. Do not change signatures without coordinating.
 *
 * Units: 1 three.js unit = 1 metre. Y is up. Models sit on y=0 and are centred on x/z origin.
 * Flow direction convention: inlet on -X side, outlet on +X side (pipes connect to `ports`).
 */
import type { ComponentType } from 'react';

/** Visual state the app hands to every model. Models must react to it visually. */
export type VisualState =
  | 'running'     // in service, duty — subtle motion (impeller spin, screen shake, water ripple)
  | 'standby'     // in service, idle — no motion
  | 'maintenance' // under maintenance — amber accents
  | 'fault'       // shut down / not available — red emissive pulse
  | 'stored'      // in storage — desaturated, no motion
  | 'ghost';      // placement preview in the plant builder — translucent

export interface AssetModelProps {
  state: VisualState;
  /** Accent colour for status indicators (status lamp / emissive band). App passes the status hex. */
  statusColor: string;
  selected?: boolean;
  hovered?: boolean;
  /** 0..1 liquid level for tanks/sumps; ignored by others. */
  level?: number;
  /** Generic user-configurable size multiplier for structures (tanks, basins). Default 1. */
  scale?: number;
}

export interface Port {
  id: string;            // 'in' | 'out' | 'in2' ...
  position: [number, number, number]; // local coords, metres
  direction: [number, number, number]; // unit vector pointing out of the asset
}

export type AssetCategory = 'rotating' | 'process' | 'structure' | 'utility' | 'custom';

export interface AssetKindDef {
  kind: string;               // stable key, e.g. 'pump_end_suction'
  label: string;              // 'End-suction pump'
  category: AssetCategory;
  footprint: [number, number]; // [x, z] metres, for builder grid snapping & selection box
  height: number;              // metres, for label placement
  ports: Port[];
  /** Equipment data asset_type values this kind is the default for (e.g. ['Pump']). */
  matchesAssetTypes?: string[];
  Component: ComponentType<AssetModelProps>;
}
