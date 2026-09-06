import { createSeededRandom } from 'animejs';
import * as THREE from 'three';

import {
  CARCASS_BOTTOM,
  CARCASS_HEIGHT,
  CENTER_DRAWER,
  DESK,
  DRAWER,
  FOLDER,
  DRAWER_CENTER_X,
  DRAWER_FRONT_HALF,
  KNEEHOLE_HALF_WIDTH,
  PALETTE,
  OUTLINE,
  PANEL,
  PEDESTAL,
  PEDESTAL_CENTER_X,
  PLINTH,
  PULL,
  drawerLayout,
  type DrawerSlot,
} from './constants';
import type { OutlineUserData } from './outline';
import { deskPlan, type PlanSection } from './plan';

export interface DeskBuild {
  group: THREE.Group;
  /** the bottom-left drawer: the only one that moves */
  heroDrawer: THREE.Group;
  heroLight: THREE.PointLight;
  /** the hero drawer's world AABB while closed */
  heroDrawerBox: THREE.Box3;
  /** the same AABB once fully pulled out */
  heroDrawerOpenBox: THREE.Box3;
  heroRestZ: number;
  /** how far the hero drawer travels when fully open, solved from the cabinet */
  heroTravel: number;
  /** world AABB of the whole desk */
  deskBox: THREE.Box3;
  /**
   * Exterior materials, split by whether they hold still or travel with the
   * hero drawer. The projection is fixed in world space, so the two need
   * separate offsets — and interior surfaces are absent from both lists,
   * because the photograph has no data for them.
   */
  projectable: {
    fixed: THREE.MeshStandardMaterial[];
    hero: THREE.MeshStandardMaterial[];
  };
  dispose(): void;
}

/** Clearance between the hero drawer's box and the carcass walls either side. */
const CAVITY_CLEARANCE = 0.008;

/**
 * Builds the desk from the plan curve in `plan.ts`.
 *
 * Every part is cut from that one outline, so the serpentine front and the
 * bowed ends run continuously through the desktop, the plinth, the carcasses
 * and every drawer front. Nothing here is a scaled unit cube: geometry is built
 * at its true size and baked into place, because a non-uniform scale makes
 * `mat3(modelMatrix)` the wrong matrix for normals, and the projection bake
 * depends on world normals being right.
 *
 * The floral carving is deliberately not modelled. It arrives later as a baked
 * texture; carving it in polygons would cost thousands of triangles for detail
 * finer than the reference photograph actually resolves.
 */
export function buildDesk(): DeskBuild {
  const plan = deskPlan();
  const top = plan.at(0);
  const carcass = plan.at(0.035);
  const plinthBase = plan.at(0.018);
  const plinthTop = plan.at(PLINTH.topInset);
  const face = plan.at(DRAWER.faceInset);
  const field = plan.at(DRAWER.faceInset - PANEL.proud);

  const geometries: THREE.BufferGeometry[] = [];

  const materials = {
    top: new THREE.MeshStandardMaterial({
      color: PALETTE.woodTop,
      roughness: 0.62,
      metalness: 0.05,
    }),
    carcass: new THREE.MeshStandardMaterial({
      color: PALETTE.woodCarcass,
      roughness: 0.68,
      metalness: 0.04,
    }),
    face: new THREE.MeshStandardMaterial({
      color: PALETTE.woodFace,
      roughness: 0.6,
      metalness: 0.05,
    }),
    panel: new THREE.MeshStandardMaterial({
      color: PALETTE.woodPanel,
      roughness: 0.66,
      metalness: 0.05,
    }),
    interior: new THREE.MeshStandardMaterial({
      color: PALETTE.woodInterior,
      roughness: 0.85,
      metalness: 0.02,
    }),
    folder: new THREE.MeshStandardMaterial({
      color: PALETTE.folder,
      roughness: 0.92,
      metalness: 0,
    }),
    folderDivider: new THREE.MeshStandardMaterial({
      color: PALETTE.folderDivider,
      roughness: 0.92,
      metalness: 0,
    }),
    hardware: new THREE.MeshStandardMaterial({
      color: PALETTE.hardware,
      roughness: 0.42,
      metalness: 0.72,
    }),
  };

  /**
   * The hero drawer's faces need their own material instances: they carry the
   * same colours as the fixed ones, but the projection has to follow them as
   * the drawer opens, and that offset lives in the material's uniforms.
   */
  const heroMaterials = {
    face: materials.face.clone(),
    panel: materials.panel.clone(),
    hardware: materials.hardware.clone(),
  };

  type FaceSet = {
    face: THREE.MeshStandardMaterial;
    panel: THREE.MeshStandardMaterial;
    hardware: THREE.MeshStandardMaterial;
  };
  const fixedSet: FaceSet = {
    face: materials.face,
    panel: materials.panel,
    hardware: materials.hardware,
  };

  const track = <T extends THREE.BufferGeometry>(geometry: T): T => {
    geometries.push(geometry);
    return geometry;
  };

  /**
   * A shape extruded upward into a solid slab.
   *
   * `rotateX(-PI/2)` maps `(sx, sy, sz) -> (sx, sz, -sy)`, so the shape's own Y
   * becomes world -Z and the extrusion runs up world +Y. See `plan.ts` for why
   * every shape is authored with `shapeY = -worldZ`.
   *
   * With a bevel, the extrusion also runs `bevelThickness` beyond each end, so
   * callers pass the body height and the caller's `yBottom` is the top of that
   * lower bevel.
   */
  const extrude = (
    shape: THREE.Shape,
    height: number,
    yBottom: number,
    material: THREE.Material,
    bevel?: { thickness: number; size: number; segments: number },
  ): THREE.Mesh => {
    const geometry = new THREE.ExtrudeGeometry(shape, {
      depth: height,
      steps: 1,
      // The shapes are already sampled polylines; re-subdividing their segments
      // would only multiply vertices without adding any shape.
      curveSegments: 1,
      bevelEnabled: Boolean(bevel),
      bevelThickness: bevel?.thickness ?? 0,
      bevelSize: bevel?.size ?? 0,
      bevelSegments: bevel?.segments ?? 0,
      // The bevel is offset back by its own size so the widest point of the
      // moulding is the plan outline itself, and the profile tucks under it.
      // At the default offset of 0 the body is pushed *outward* by bevelSize,
      // which would quietly make the desk 2 x bevelSize wider than DESK.topWidth.
      bevelOffset: bevel ? -bevel.size : 0,
    });
    geometry.rotateX(-Math.PI / 2);
    geometry.translate(0, yBottom, 0);
    return new THREE.Mesh(track(geometry), material);
  };

  /**
   * A true-size box. The offset goes on the mesh, not into the geometry, so the
   * mesh's origin stays at its own centre and a rotation turns it about itself.
   * A translation is harmless to normals; only a non-uniform scale is not, and
   * nothing here is ever scaled.
   */
  const block = (
    material: THREE.Material,
    w: number,
    h: number,
    d: number,
    x: number,
    y: number,
    z: number,
  ): THREE.Mesh => {
    const mesh = new THREE.Mesh(track(new THREE.BoxGeometry(w, h, d)), material);
    mesh.position.set(x, y, z);
    return mesh;
  };

  /** The x span of a drawer front on the pedestal at `sign`. */
  const frontSpan = (sign: -1 | 1): [number, number] => {
    const a = sign * DRAWER.frontOuterX;
    const b = sign * DRAWER.frontInnerX;
    return a < b ? [a, b] : [b, a];
  };

  const group = new THREE.Group();
  group.name = 'desk';

  // --- Desktop -------------------------------------------------------------
  // The moulded edge is the extrude bevel. It is the one place a bevel is safe:
  // the bevel size is a twentieth of the plan's tightest radius, so the offset
  // contour it generates cannot double back on itself.
  group.add(
    extrude(
      top.shape(),
      DESK.topThickness - DESK.edgeBevelThickness * 2,
      DESK.height - DESK.topThickness + DESK.edgeBevelThickness,
      materials.top,
      {
        thickness: DESK.edgeBevelThickness,
        size: DESK.edgeBevelSize,
        segments: DESK.edgeBevelSegments,
      },
    ),
  );

  // --- Plinth --------------------------------------------------------------
  // Two stacked solids rather than one flared block: it reads as a stepped base
  // moulding, and the step gives the edge pass a line to draw along the floor.
  // Solid across the whole plan, so it also forms the kneehole's stepped return.
  const plinthStep = PLINTH.height * 0.65;
  group.add(extrude(plinthBase.shape(), plinthStep, 0, materials.carcass));
  group.add(
    extrude(plinthTop.shape(), PLINTH.height - plinthStep, plinthStep, materials.carcass),
  );

  // --- Kneehole back -------------------------------------------------------
  const kneeBackZ = carcass.backZAt(0);
  group.add(
    block(
      materials.carcass,
      KNEEHOLE_HALF_WIDTH * 2,
      CARCASS_HEIGHT - CARCASS_BOTTOM,
      0.02,
      0,
      (CARCASS_BOTTOM + CARCASS_HEIGHT) / 2,
      kneeBackZ + 0.01,
    ),
  );

  // The drawer box stops at the shaped front's flat back, not at the bow's
  // peak: measuring from the peak would leave the box protruding through the
  // face wherever the curve falls away from it.
  const [heroX0, heroX1] = frontSpan(-1);
  const heroBoxFrontZ = face.frontBlock(heroX0, heroX1, DRAWER.frontBackThickness).backZ;

  const slots = drawerLayout(heroBoxFrontZ);
  const heroSlot = slots[0];
  const heroX = -DRAWER_CENTER_X;

  /**
   * How far the drawer can come out before it stops being part of the desk.
   *
   * Solved rather than authored: the distance from the closed drawer's back to
   * the mouth it slides through is a fact about the plan curve, not a number
   * anyone can keep up to date by hand. `openEngagement` then holds a little of
   * the box inside, so the drawer reads as pulled open on its runners instead of
   * floating in front of the desk.
   */
  const mouthZ = carcass.frontZAt(heroX);
  const heroBoxBack = heroSlot.restZ - heroSlot.depth / 2;
  const heroTravel = mouthZ - heroBoxBack - DRAWER.openEngagement * heroSlot.depth;

  if (heroTravel < heroSlot.depth * 0.5) {
    throw new Error(
      `desk: the hero drawer would only open ${heroTravel.toFixed(3)}m of its ` +
        `${heroSlot.depth.toFixed(3)}m depth. The cabinet mouth at ` +
        `${mouthZ.toFixed(3)} is too close to the closed drawer's back at ` +
        `${heroBoxBack.toFixed(3)} to give it room to open.`,
    );
  }

  // --- Pedestal carcasses --------------------------------------------------
  /**
   * A pedestal is one solid slice of the plan. The hero drawer needs somewhere
   * to slide out of, so its pedestal is split into a full solid above the hero
   * band and, within that band, only the two side walls and a back panel. Every
   * piece stays a closed solid, which matters because the edge pass draws
   * boundary edges unconditionally and an open shell would light up along every
   * internal seam.
   */
  const buildPedestal = (sign: -1 | 1) => {
    const inner = sign * KNEEHOLE_HALF_WIDTH;
    const outer = sign * plan.halfWidth;

    if (sign !== -1) {
      group.add(
        extrude(
          carcass.slab(inner, outer),
          CARCASS_HEIGHT - CARCASS_BOTTOM,
          CARCASS_BOTTOM,
          materials.carcass,
        ),
      );
      return;
    }

    // The cavity spans exactly the drawer front's own height. Any taller and the
    // front no longer covers its own opening while closed, and the drawer
    // interior shows as a bright slit above or below the front.
    const bandBottom = heroSlot.centerY - heroSlot.height / 2;
    const bandTop = heroSlot.topY;
    const bandHeight = bandTop - bandBottom;
    const cavityHalf = DRAWER.boxWidth / 2 + CAVITY_CLEARANCE;
    if (cavityHalf > DRAWER_FRONT_HALF) {
      throw new Error(
        'desk: the hero drawer front is narrower than the cavity it has to cover',
      );
    }

    group.add(
      extrude(
        carcass.slab(inner, outer),
        bandBottom - CARCASS_BOTTOM,
        CARCASS_BOTTOM,
        materials.carcass,
      ),
    );
    group.add(
      extrude(
        carcass.slab(inner, outer),
        CARCASS_HEIGHT - bandTop,
        bandTop,
        materials.carcass,
      ),
    );

    group.add(
      extrude(
        carcass.slab(inner, heroX + cavityHalf),
        bandHeight,
        bandBottom,
        materials.carcass,
      ),
    );
    group.add(
      extrude(
        carcass.slab(heroX - cavityHalf, outer),
        bandHeight,
        bandBottom,
        materials.carcass,
      ),
    );

    // Closes the back of the cavity, so the opened drawer is not a tunnel
    // straight through the desk.
    const backZ = carcass.backZAt(heroX);
    group.add(
      block(
        materials.interior,
        cavityHalf * 2,
        bandHeight,
        PEDESTAL.panel,
        heroX,
        bandBottom + bandHeight / 2,
        backZ + PEDESTAL.panel / 2,
      ),
    );
  };

  // --- Drawer fronts -------------------------------------------------------
  /**
   * A front is two curved slabs: the frame, and the carved field standing proud
   * of it. Two solids rather than one shape-with-a-hole, because bevelling an
   * offset contour on a curve this tight is exactly the case that triangulates
   * into silent garbage.
   */
  const buildFront = (
    x0: number,
    x1: number,
    height: number,
    yBottom: number,
    parent: THREE.Object3D,
    set: FaceSet = fixedSet,
  ): number => {
    const block_ = face.frontBlock(x0, x1, DRAWER.frontBackThickness);
    const slab = extrude(block_.shape, height, yBottom, set.face);
    const panelField = extrude(
      field.ribbon(x0 + PANEL.margin, x1 - PANEL.margin, DRAWER.frontThickness),
      height - PANEL.margin * 2,
      yBottom + PANEL.margin,
      set.panel,
    );
    for (const mesh of [slab, panelField]) {
      (mesh.userData as OutlineUserData).outlineThreshold = OUTLINE.frontThreshold;
    }
    parent.add(slab, panelField);
    return block_.backZ;
  };


  /** A drop-bail pull: a half ring hanging from two rosettes. */
  const buildPull = (x: number, y: number, parent: THREE.Object3D, set: FaceSet) => {
    const z = field.frontZAt(x);
    const normal = field.frontNormalAt(x);

    const bail = new THREE.Mesh(
      track(
        new THREE.TorusGeometry(PULL.bailRadius, PULL.bailTube, 8, 20, Math.PI),
      ),
      set.hardware,
    );
    // The half torus is the upper half by default; turn it over so it hangs.
    bail.rotation.z = Math.PI;
    bail.position.set(x + normal.x * 0.006, y, z + normal.y * 0.006);
    (bail.userData as OutlineUserData).outlineThreshold = OUTLINE.hardwareThreshold;
    parent.add(bail);

    for (const side of [-1, 1] as const) {
      const rosette = new THREE.Mesh(
        track(
          new THREE.CylinderGeometry(
            PULL.rosetteRadius,
            PULL.rosetteRadius,
            PULL.rosetteDepth,
            10,
          ),
        ),
        set.hardware,
      );
      rosette.rotation.x = Math.PI / 2;
      rosette.position.set(
        x + side * PULL.bailRadius + normal.x * 0.004,
        y,
        z + normal.y * 0.004,
      );
      (rosette.userData as OutlineUserData).outlineThreshold = OUTLINE.hardwareThreshold;
      parent.add(rosette);
    }
  };

  const buildPulls = (
    centerX: number,
    y: number,
    parent: THREE.Object3D,
    set: FaceSet = fixedSet,
  ) => {
    for (const side of [-1, 1] as const) {
      buildPull(centerX + side * PULL.spread, y, parent, set);
    }
  };

  // --- The hero drawer -----------------------------------------------------
  /**
   * The only drawer with a box behind its front. The other eight are sealed
   * behind their own faces and can never be seen, so they are fronts only —
   * building boxes for them would be forty meshes rendering nothing.
   *
   * The group is positioned at the drawer's rest pose and its children are
   * re-based into that frame, so animating the group's z slides the whole
   * drawer without any geometry needing to be rebuilt.
   */
  const buildHeroDrawer = (slot: DrawerSlot): THREE.Group => {
    const drawer = new THREE.Group();
    drawer.name = 'hero-drawer';

    const world = new THREE.Group();
    buildFront(heroX0, heroX1, slot.height, slot.centerY - slot.height / 2, world, heroMaterials);
    buildPulls(heroX, slot.centerY, world, heroMaterials);

    const { boxWidth: w, wall, sideDrop } = DRAWER;
    const h = slot.height;
    const d = slot.depth;
    // The shaped front already occupies everything ahead of `restZ + d/2`, so
    // the box itself is interior for its whole depth.
    const faceZ = slot.restZ + d / 2;
    const innerDepth = d;
    const innerZ = slot.restZ;
    const wallHeight = h - sideDrop;
    const floorY = slot.centerY - h / 2;
    const wallY = floorY + wallHeight / 2;

    world.add(
      block(materials.interior, w - wall * 2, wall, innerDepth, heroX, floorY + wall / 2, innerZ),
    );
    world.add(
      block(
        materials.interior,
        w - wall * 2,
        wallHeight,
        wall,
        heroX,
        wallY,
        slot.restZ - d / 2 + wall / 2,
      ),
    );
    for (const side of [-1, 1] as const) {
      world.add(
        block(
          materials.interior,
          wall,
          wallHeight,
          innerDepth,
          heroX + side * (w / 2 - wall / 2),
          wallY,
          innerZ,
        ),
      );
    }

    world.add(buildFolders(slot, faceZ));

    // Re-base every child into the drawer's own frame, then put the group back
    // where the children were built, so the net world pose is unchanged and
    // animating the group's z is all it takes to slide the drawer.
    const origin = new THREE.Vector3(heroX, slot.centerY, slot.restZ);
    for (const child of [...world.children]) {
      child.position.sub(origin);
      drawer.add(child);
    }
    drawer.position.copy(origin);
    return drawer;
  };

  /**
   * Manila folders standing in the hero drawer. Without them the drawer reads as
   * an empty box in the frames between it opening and the card landing.
   *
   * They are loaded the way a file drawer actually is: each folder spans the
   * drawer's width and they stack front to back, so the closing overhead shot
   * reads their top edges as a row of parallel lines. Heights are a fraction of
   * the drawer rather than absolutes, so regrading the stack can never stand
   * them proud of the rim and poke them through the drawer above.
   */
  function buildFolders(slot: DrawerSlot, frontZ: number): THREE.Group {
    const folders = new THREE.Group();
    folders.name = 'folders';
    const random = createSeededRandom(FOLDER.seed);
    const floorY = slot.centerY - slot.height / 2 + DRAWER.wall;
    const lean = THREE.MathUtils.degToRad(FOLDER.leanDeg);
    const usable = slot.height - DRAWER.wall;

    let z = frontZ - FOLDER.frontInset;
    let index = 0;
    const backLimit = slot.restZ + FOLDER.backLimit;

    while (z > backLimit) {
      const isDivider = index % FOLDER.dividerEvery === FOLDER.dividerEvery - 1;
      const base = usable * (isDivider ? FOLDER.dividerFrac : FOLDER.heightFrac);
      const height = base * (1 + (random(0, 1, 3) - 0.5) * FOLDER.heightJitter);

      const folder = block(
        isDivider ? materials.folderDivider : materials.folder,
        FOLDER.width,
        height,
        FOLDER.thickness,
        heroX,
        floorY + height / 2,
        z,
      );
      // Negative: the tops lean back, into the space behind them.
      folder.rotation.x = -lean;
      (folder.userData as OutlineUserData).outline = false;
      folders.add(folder);

      z -= FOLDER.thickness + THREE.MathUtils.lerp(FOLDER.gapMin, FOLDER.gapMax, random(0, 1, 3));
      index += 1;
    }

    return folders;
  }

  buildPedestal(-1);
  buildPedestal(1);

  // Fronts for every drawer but the hero, which carries its own.
  for (const sign of [-1, 1] as const) {
    const [x0, x1] = frontSpan(sign);
    slots.forEach((slot, index) => {
      if (sign === -1 && index === 0) return;
      buildFront(x0, x1, slot.height, slot.centerY - slot.height / 2, group);
      buildPulls(sign * DRAWER_CENTER_X, slot.centerY, group);
    });
  }

  // The wide drawer over the kneehole, tucked under the desktop. It never opens,
  // so it is a front and nothing else.
  const centerBottom = CARCASS_HEIGHT - CENTER_DRAWER.height;
  buildFront(
    -CENTER_DRAWER.halfWidth,
    CENTER_DRAWER.halfWidth,
    CENTER_DRAWER.height,
    centerBottom,
    group,
  );
  buildPulls(0, centerBottom + CENTER_DRAWER.height / 2, group);

  const heroDrawer = buildHeroDrawer(heroSlot);
  group.add(heroDrawer);

  // Warm light living inside the hero drawer, so it travels with it. It sits at
  // the rim rather than down in the box, which spreads the pool instead of
  // burning a hotspot into the drawer floor.
  const heroLight = new THREE.PointLight(PALETTE.glow, 0, 1.6, 1.5);
  heroLight.position.set(0, heroSlot.height / 2 - DRAWER.sideDrop, 0);
  heroDrawer.add(heroLight);

  const heroDrawerBox = new THREE.Box3(
    new THREE.Vector3(
      heroX - DRAWER.boxWidth / 2,
      heroSlot.centerY - heroSlot.height / 2,
      heroSlot.restZ - heroSlot.depth / 2,
    ),
    new THREE.Vector3(
      heroX + DRAWER.boxWidth / 2,
      heroSlot.topY,
      heroSlot.restZ + heroSlot.depth / 2,
    ),
  );
  const heroDrawerOpenBox = heroDrawerBox
    .clone()
    .translate(new THREE.Vector3(0, 0, heroTravel));

  group.updateMatrixWorld(true);
  const deskBox = new THREE.Box3().setFromObject(group);

  return {
    group,
    heroDrawer,
    heroLight,
    heroDrawerBox,
    heroDrawerOpenBox,
    heroRestZ: heroSlot.restZ,
    heroTravel,
    deskBox,
    projectable: {
      fixed: [materials.top, materials.carcass, materials.face, materials.panel, materials.hardware],
      hero: [heroMaterials.face, heroMaterials.panel, heroMaterials.hardware],
    },
    dispose() {
      for (const geometry of geometries) geometry.dispose();
      for (const material of Object.values(materials)) material.dispose();
      for (const material of Object.values(heroMaterials)) material.dispose();
    },
  };
}
