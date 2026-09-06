import * as THREE from 'three';

import { DESK, PLAN } from './constants';
import type { DeskPlan } from './plan';

/** The inset ladder every part of the desk is cut at, drawn so it can be seen. */
const INSETS: Array<{ inset: number; colour: number; label: string }> = [
  { inset: 0, colour: 0x8ce8ff, label: 'desktop' },
  { inset: 0.035, colour: 0xffd08a, label: 'carcass / faces' },
  { inset: 0.055, colour: 0xff8ab0, label: 'plinth top' },
];

function loop(points: THREE.Vector2[], colour: number, y: number): THREE.LineLoop {
  const geometry = new THREE.BufferGeometry().setFromPoints(
    points.map((point) => new THREE.Vector3(point.x, y, point.y)),
  );
  return new THREE.LineLoop(geometry, new THREE.LineBasicMaterial({ color: colour }));
}

export interface PlanDebug {
  group: THREE.Group;
  summary(): string[];
  dispose(): void;
}

/**
 * `?debug=plan`: draws the plan outline and its inset ladder flat on the floor,
 * with tick marks up the front edge at each pedestal centre.
 *
 * This exists so the curve can be settled before any geometry depends on it.
 * The one parameter that needs an eye rather than an argument is
 * `PLAN.bowCentre`: positive bows the centre of the front forward, negative
 * hollows it into a true kidney. A 1024px edge map will not decide it.
 */
export function createPlanDebug(plan: DeskPlan): PlanDebug {
  const group = new THREE.Group();
  group.name = 'plan-debug';

  const drawn: Array<{ inset: number; colour: number; label: string; ok: boolean }> = [];

  for (const { inset, colour, label } of INSETS) {
    try {
      group.add(loop(inset === 0 ? plan.outline : plan.offset(inset), colour, 0.001 + inset));
      drawn.push({ inset, colour, label, ok: true });
    } catch {
      drawn.push({ inset, colour, label, ok: false });
    }
  }

  // Verticals at each pedestal centre, so the front lobe can be checked against
  // the carcass it is supposed to be peaked over.
  for (const sign of [-1, 1] as const) {
    const x = sign * PLAN.pedestalCenterX;
    const z = plan.frontZAt(x);
    const geometry = new THREE.BufferGeometry().setFromPoints([
      new THREE.Vector3(x, 0, z),
      new THREE.Vector3(x, DESK.height, z),
    ]);
    group.add(new THREE.Line(geometry, new THREE.LineBasicMaterial({ color: 0x7dff9b })));
  }

  // Where the front edge actually peaks, which should land on those verticals.
  let peak = { x: 0, z: -Infinity };
  for (let x = 0; x <= plan.halfWidth; x += 0.005) {
    const z = plan.frontZAt(x);
    if (z > peak.z) peak = { x, z };
  }

  return {
    group,
    summary() {
      return [
        `plan       ${DESK.topWidth} x ${DESK.topDepth} m, ${plan.outline.length} samples`,
        `bowCentre  ${PLAN.bowCentre >= 0 ? '+' : ''}${PLAN.bowCentre} ` +
          `(${PLAN.bowCentre >= 0 ? 'bow front' : 'kidney'})`,
        `front z    centre ${plan.frontZAt(0).toFixed(3)}  ` +
          `pedestal ${plan.frontZAt(PLAN.pedestalCenterX).toFixed(3)}`,
        `front peak x=${peak.x.toFixed(3)} (pedestal ${PLAN.pedestalCenterX})`,
        `depth      centre ${plan.depthAt(0).toFixed(3)}  ` +
          `pedestal ${plan.depthAt(PLAN.pedestalCenterX).toFixed(3)}`,
        ...drawn.map(
          ({ inset, label, ok }) =>
            `inset ${inset.toFixed(3)} ${ok ? 'ok  ' : 'FAIL'} ${label}`,
        ),
      ];
    },
    dispose() {
      group.traverse((object) => {
        if (object instanceof THREE.Line) {
          object.geometry.dispose();
          (object.material as THREE.Material).dispose();
        }
      });
    },
  };
}
