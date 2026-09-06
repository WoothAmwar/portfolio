/**
 * Every dimension, pose and timing constant for the desk reveal.
 * Units are metres; the desk is modelled at real-world scale.
 */

export const DESK = {
  /**
   * Measured off the reference photograph rather than guessed. The desk there
   * spans 713 x 361 px, an on-screen aspect of 1.98, and no camera angle can
   * make a 2.5m desk project that tall: even looking straight down at 45
   * degrees, height and depth together only reach 1.07 desk-widths. Solving for
   * the width that does project at 1.98 gives 1.74m, which is also simply a
   * more plausible desk — 2.5m is a conference table.
   *
   * Width and height are coupled through that aspect and must move together.
   * Lowering `height` alone shortens what the desk projects without narrowing
   * it, so the model comes out too wide for the photograph's desk and starts
   * covering the room behind it — at 0.75m tall the matching width was 1.74m,
   * and at 0.70m it is 1.645m.
   *
   * Every |x| constant below is scaled to match, along with `DRAWER.bigDepth`,
   * which keeps the welcome card's proportions where they were. The plan's lobe
   * parameters are in normalised -1..1 space, so the silhouette's shape is
   * unchanged; only its width is.
   */
  topWidth: 1.6807,
  topDepth: 0.76,
  topThickness: 0.06,
  /** y of the top surface */
  height: 0.70,
  /**
   * The moulded edge run around the desktop. Three bevel segments over the
   * quarter turn is 30 degrees a facet, which survives an edge pass at
   * `thresholdAngle` 22 and so reads as the parallel contour lines running
   * along the desktop's edge in the reference photograph.
   */
  edgeBevelThickness: 0.01,
  edgeBevelSize: 0.012,
  edgeBevelSegments: 3,
} as const;

/**
 * The desk's plan: the closed outline every part is cut from, seen from above.
 *
 * The reference desk has a serpentine front — it bows forward over each pedestal
 * and again, more gently, across the centre drawer — and bowed ends. The front
 * profile is authored as a sum of Gaussian lobes rather than as joined arcs
 * because a Gaussian is smooth everywhere: an arc-to-arc join is only tangent-
 * continuous by coincidence, and any kink in the tangent shows up as a lighting
 * crease down the drawer fronts.
 *
 *   frontZ(u) = frontBase
 *             + bowPedestal * exp(-((|u| - pedestalPeak) / pedestalWidth)^2)
 *             + bowCentre   * exp(-(|u| / centreWidth)^2)
 *
 * where u = x / (width / 2), so u is -1 at the left end and +1 at the right.
 * `bowCentre` is the one parameter with a sign choice in it: positive bows the
 * centre forward (a bow front), negative hollows it (a true kidney). Settle it
 * by eye in `?debug=plan`; a 1024px edge map cannot decide it.
 */
export const PLAN = {
  width: DESK.topWidth,
  depth: DESK.topDepth,
  /** z of the front edge before the lobes are added */
  frontBase: 0.335,
  /** z of the back edge before the hollow is added */
  backBase: -0.335,
  bowPedestal: 0.045,
  pedestalWidth: 0.3,
  bowCentre: 0.022,
  centreWidth: 0.42,
  /** the back edge bows forward slightly at the centre */
  backHollow: 0.012,
  /** how far in from each end the bowed cap starts */
  endRadius: 0.2009,
  /**
   * |x| of a pedestal's centre. The front lobe is peaked here, so the widest
   * part of the bow sits over the pedestal exactly the way it does on the real
   * piece. `PEDESTAL_CENTER_X` reads from this rather than the other way round,
   * so the bulge and the carcass under it cannot drift apart.
   */
  pedestalCenterX: 0.5777,
  /**
   * How finely the outline is sampled. Everything downstream reads the sampled
   * polyline, not the analytic profile above, so this is also the resolution at
   * which the curve is smooth. See `buildPlan` for why the polyline is the
   * single source of truth.
   */
  samples: 256,
} as const;

/** Where the front lobe peaks, in the profile's own -1..1 space. */
export const PEDESTAL_PEAK_U = PLAN.pedestalCenterX / (PLAN.width / 2);

export const PEDESTAL = {
  /**
   * Wide enough to carry a real drawer with real stiles either side of it, and
   * to leave the kneehole at the ~36% of the desk's width it occupies in the
   * reference. The bowed outer cap comes from the plan curve, not from here.
   */
  width: 0.5235,
  /**
   * Must exceed `DRAWER.bigDepth`, or the drawer hangs out of the back of the
   * carcass it lives in. It used to be 0.5 against a 0.66 drawer, which went
   * unnoticed only because nothing ever looked at the desk from behind; the
   * orbit now swings to the drawer's side, where a protruding tail would show.
   * `plan.depthAt(pedestalCenterX)` is 0.759, so this fits inside the footprint.
   */
  depth: 0.7,
  /** thickness of the carcass shell panels */
  panel: 0.018,
} as const;

/** The base moulding, running round the whole plan at the floor. */
export const PLINTH = {
  height: 0.085,
  /** the plinth top is set back from the desktop's overhang */
  topInset: 0.055,
} as const;

/** The raised, carved panel field inside each drawer front. */
export const PANEL = {
  /** border of drawer front left around the field */
  margin: 0.026,
  /** how far the field stands proud of the front */
  proud: 0.006,
} as const;

/** Drop-bail pulls. They matter as outline far more than as form. */
export const PULL = {
  bailRadius: 0.022,
  bailTube: 0.003,
  rosetteRadius: 0.008,
  rosetteDepth: 0.004,
  /** |x| of each pull from the drawer front's centre */
  spread: 0.0772,
} as const;

export const DRAWER = {
  /** gap between adjacent drawer fronts */
  seam: 0.012,
  /**
   * How far the fronts sit behind the desktop's front edge. It has to exceed
   * `PANEL.proud`, so that the raised field in the middle of each front is
   * still a positive inset on the plan and never has to be offset outward.
   *
   * It also has to leave room for the pulls, which stand proud of the field:
   * at too small an inset the bails protrude past the desktop's own edge, where
   * a real desktop overhangs its drawer fronts and shelters them.
   */
  faceInset: 0.02,
  wall: 0.014,
  frontThickness: 0.018,
  /**
   * The closing shot looks straight down at the drawer, so these two numbers
   * alone set the welcome card's aspect: the card is pinned to the box's top
   * face, and the drawer's height does not enter into it.
   *
   * They are furniture dimensions first. A 0.58 box sits inside the 0.78
   * pedestal with honest 0.10 stiles either side; the card's 54% x 85% is the
   * consequence, not the target. `CAMERA.endFrame` is set so height binds and
   * the width falls out, rather than bending the drawer to hit a chosen aspect.
   */
  boxWidth: 0.3689,
  /**
   * Set together with `boxWidth` to hold the welcome card's portrait shape: the
   * closing shot looks straight down, so the card's aspect is exactly
   * depth : width. Narrowing the desk narrowed the drawer, so the depth comes
   * down with it rather than letting the card turn landscape.
   */
  bigDepth: 0.4057,
  smallDepth: 0.3767,
  /**
   * |x| of a drawer front's outer and inner edges.
   *
   * These are given as absolute positions rather than as a half-width about the
   * pedestal centre, because the front curve is not symmetric about that centre:
   * it is nearly flat running in toward the kneehole but plunges away into the
   * bowed end cap. Carrying a drawer front out into that plunge is what the
   * reference desk does not do either — the rounded outer corner is a fixed
   * column, and the drawers stop short of it.
   */
  frontOuterX: 0.738,
  frontInnerX: 0.3352,
  /** flat back left on the shaped front, at its thinnest point */
  frontBackThickness: 0.014,
  /** sides and back sit this much lower than the front panel */
  sideDrop: 0.06,
  /**
   * How much of the drawer stays inside the cabinet when it is fully open, as a
   * fraction of its own depth.
   *
   * The travel itself is NOT a constant. It is solved in `buildDesk` from where
   * the cabinet mouth actually is, because the two are only related through the
   * plan curve — and an absolute travel is exactly what broke here before: the
   * desk was rescaled, `bigDepth` came down with it, the travel did not, and the
   * drawer ended up hanging 0.2m clear of the desk with nothing behind it.
   *
   * Small, because the closing shot looks straight down the drawer's open top
   * and every percent left inside is a percent of that opening the carcass above
   * covers. Enough to keep the drawer visibly part of the desk, and no more.
   */
  openEngagement: 0.1,
} as const;

/** Floor to the underside of the desktop. */
export const CARCASS_HEIGHT = DESK.height - DESK.topThickness;
/**
 * |x| of a pedestal's centre. Read from the plan, where it is also where the
 * front lobe peaks, so the widest part of the bow always sits over the carcass.
 */
export const PEDESTAL_CENTER_X = PLAN.pedestalCenterX;
/** |x| of a pedestal's inner face: where the kneehole begins. */
export const KNEEHOLE_HALF_WIDTH = PEDESTAL_CENTER_X - PEDESTAL.width / 2;

/**
 * |x| of a drawer's centre. Offset inward from the pedestal's centre, because
 * the drawer fronts are placed against the flat run of the bow rather than
 * centred on its peak. The hero drawer's box, its cavity and its pulls are all
 * centred here.
 */
export const DRAWER_CENTER_X = (DRAWER.frontOuterX + DRAWER.frontInnerX) / 2;
/** Half-width of a drawer front. */
export const DRAWER_FRONT_HALF = (DRAWER.frontOuterX - DRAWER.frontInnerX) / 2;

/** Floor-to-underside-of-desktop, less the plinth the carcass stands on. */
export const CARCASS_BOTTOM = PLINTH.height;

/** The wide, shallow drawer over the kneehole. It never opens. */
export const CENTER_DRAWER = {
  halfWidth: KNEEHOLE_HALF_WIDTH - 0.03,
  height: 0.085,
  depth: 0.42,
} as const;

export type DrawerKind = 'big' | 'small';

export interface DrawerSlot {
  kind: DrawerKind;
  height: number;
  depth: number;
  /** world y of the drawer's vertical centre */
  centerY: number;
  /** world y of the drawer front's top edge */
  topY: number;
  /** world z of the drawer box's centre at rest */
  restZ: number;
}

/**
 * Lays four drawers out inside the pedestal carcass, bottom-up. They are
 * graduated the way the reference desk's are — deepest at the bottom, shallowest
 * under the desktop — and sized to fill the interior exactly, which
 * `assertFillsInterior` checks rather than trusting.
 *
 * `faceZ` is the z of the drawer front at the pedestal's centre. It is passed in
 * rather than derived here because the front is a curve now, and the curve lives
 * in `plan.ts`, which reads this module.
 */
const DRAWER_HEIGHTS: Array<{ kind: DrawerKind; height: number; depth: number }> = [
  { kind: 'big', height: 0.186, depth: DRAWER.bigDepth },
  { kind: 'small', height: 0.128, depth: DRAWER.smallDepth },
  { kind: 'small', height: 0.10, depth: DRAWER.smallDepth },
  { kind: 'small', height: 0.069, depth: DRAWER.smallDepth },
];

/** Interior the drawer stack has to fill: plinth top to underside of desktop. */
export const CARCASS_INTERIOR = {
  bottom: CARCASS_BOTTOM + PEDESTAL.panel,
  top: CARCASS_HEIGHT - PEDESTAL.panel,
} as const;

function assertFillsInterior(): void {
  const interior = CARCASS_INTERIOR.top - CARCASS_INTERIOR.bottom;
  const seams = DRAWER.seam * (DRAWER_HEIGHTS.length - 1);
  const used = DRAWER_HEIGHTS.reduce((total, drawer) => total + drawer.height, 0) + seams;
  if (Math.abs(used - interior) > 1e-9) {
    throw new Error(
      `desk: drawer stack is ${used.toFixed(4)}m but the carcass interior is ` +
        `${interior.toFixed(4)}m. Adjust DRAWER_HEIGHTS so they agree exactly.`,
    );
  }
}

export function drawerLayout(faceZ: number): DrawerSlot[] {
  assertFillsInterior();

  let y = CARCASS_INTERIOR.bottom;
  return DRAWER_HEIGHTS.map(({ kind, height, depth }) => {
    const slot: DrawerSlot = {
      kind,
      height,
      depth,
      centerY: y + height / 2,
      topY: y + height,
      restZ: faceZ - depth / 2,
    };
    y += height + DRAWER.seam;
    return slot;
  });
}

/**
 * Manila folders standing in the hero drawer. Without them the drawer reads as
 * an empty box in the frames between it opening and the card landing.
 *
 * They are loaded the way a file drawer actually is: each folder spans the
 * drawer's width and they stack front to back, so the closing overhead shot
 * reads their top edges as a row of parallel lines. All measurements are in the
 * drawer's own space, where the origin is the centre of its box.
 */
export const FOLDER = {
  /** across the drawer, a little narrower than the interior */
  width: DRAWER.boxWidth - DRAWER.wall * 2 - 0.03,
  /**
   * Folders in a drawer are packed, near enough touching. Thin slabs with
   * generous gaps read as loose sheets of paper standing on edge rather than as
   * folders, so the card is thicker than the gap between cards.
   */
  thickness: 0.015,
  /**
   * As a fraction of the drawer's usable height rather than an absolute, so
   * that regrading the drawers cannot silently stand the folders proud of the
   * drawer rim and poke them through the drawer above.
   */
  heightFrac: 0.8,
  /** index dividers stand proud of the folders around them */
  dividerFrac: 0.88,
  dividerEvery: 5,
  gapMin: 0.004,
  gapMax: 0.01,
  /** per-folder height wobble, so the top edges are not a perfect comb */
  heightJitter: 0.022,
  /** clearance behind the drawer's front panel */
  frontInset: 0.024,
  /** how far back the folders reach, leaving the drawer part empty */
  backLimit: -0.30,
  /** the tops rest back into the empty space behind them */
  leanDeg: 2.5,
  seed: 7,
} as const;

export const PALETTE = {
  page: '#141210',
  /**
   * Deliberately dark. The outline pass carries the desk's form now, so the
   * fills only have to separate one surface from another and sit in the same
   * tonal register as the near-black photograph behind them. Lit at the
   * brightness these started out at, the desk read as a lit object standing in
   * front of the picture rather than as part of it.
   */
  woodTop: '#4c2f19',
  woodCarcass: '#3b2513',
  woodFace: '#553318',
  woodInterior: '#2c1b0f',
  /**
   * Manila, allowing for the warm light inside the drawer: a literal manila
   * swatch blows out to cream under it, so these sit a couple of steps darker
   * and less saturated than the paper actually is.
   */
  folder: '#bb9764',
  folderDivider: '#a17c4b',
  glow: '#ffd9a8',
  /** the carved field inside each drawer front, a shade deeper than the frame */
  woodPanel: '#472b14',
  /** aged brass, for the bail pulls */
  hardware: '#8a6a3c',
  /**
   * The pale contour drawn along every edge of the desk. It is the single most
   * visible colour on the page: the fills are nearly black, so this is what
   * actually describes the desk's shape, and it is picked to sit with the
   * near-white the reference photograph's own edge-detected lines are drawn in
   * rather than being a pure white that would read as brighter than the picture.
   */
  edge: '#f2e6d6',
} as const;

/**
 * The pale contour drawn on every silhouette and crease, which is what makes
 * the desk look like it was drawn by the same filter as the background photo.
 * See `outline.ts` for why `thresholdAngle` is 22 and not a matter of taste.
 */
export const OUTLINE = {
  colour: PALETTE.edge,
  thresholdAngle: 22,
  /** the narrow, opaque line */
  coreWidth: 1.4,
  coreOpacity: 1,
  /** a wide, dim, additive pass under it, standing in for a bloom */
  haloWidth: 4,
  haloOpacity: 0.22,
  /** drawer fronts have nothing but hard corners, so they can afford more */
  frontThreshold: 40,
  /** the pulls only want their silhouette, not their tessellation */
  hardwareThreshold: 60,
} as const;

/**
 * Moves the desk, and with it the background photograph, down the frame.
 *
 * Measured in fractions of the viewport's height: 0.05 drops everything by five
 * percent of the screen. Negative lifts it. Zero is the framing the solver picks
 * on its own.
 *
 * 0.06 is the tuned value. `DESK.topWidth` and `REGISTRATION.coverMargin` are
 * both solved against it — the aim's lift raises the camera, which changes both
 * the aspect the desk projects at and how far its silhouette drifts from the
 * photograph's. Changing this number without re-solving those two will leave the
 * model either the wrong shape for the picture behind it or too small to cover
 * the desk inside it.
 *
 * One value moves both because the two are not placed independently. The
 * photograph is fitted to wherever the desk's silhouette lands on screen (see
 * `registration.ts`), so moving the desk carries the picture with it and the
 * model goes on covering the desk inside it exactly as before.
 *
 * It is applied to the opening aim rather than to the render as a whole, which
 * means it costs nothing anywhere else: the camera's aim travels from here onto
 * the drawer as the reveal plays, so the offset unwinds on its own and the
 * closing overhead shot — and the card pinned to it — is framed exactly as it
 * would have been at zero.
 */
// Typed as `number` rather than left to infer the literal, so the zero check in
// `computePoses` stays a real branch instead of one the compiler folds away.
export const OPENING_Y_PADDING: number = 0.06;

export const CAMERA = {
  fov: 32,
  near: 0.05,
  far: 100,
  /** what the camera looks at while approaching: the desk's own centre */
  startTarget: [0, 0.42, 0] as const,
  /** direction from that target towards the camera, ~13 degrees of elevation */
  startDir: [0, 0.228, 1] as const,
  /**
   * Camera waypoints, given as an orbit around the open drawer: `azimuthDeg`
   * around it (0 is straight in front, 90 is directly to its right),
   * `elevationDeg` above it, and `y` as a blend from the opening height to the
   * closing height. The distance follows from the height and the elevation.
   *
   * Authoring the angles rather than positions is what keeps the picture from
   * lurching: evenly spaced angles turn the view at a steady rate, whereas
   * evenly spaced positions swing it through most of its rotation in the last
   * moments. The knots are then converted to positions and clamped monotone,
   * and interpolated with a monotone cubic, so the camera provably only ever
   * travels left, forward and down, with nothing to double back on.
   *
   * The azimuth reaches 90 before the end, so the last stretch is a straight
   * descent down the drawer's right-hand side. Arriving from there puts the
   * drawer's front on the left of screen with no roll to correct: it is the
   * roll-free limit of this approach, not a correction applied on top of it.
   */
  path: [
    // azimuth null: derived so the approach holds its lane exactly. The
    // approach ends steep enough that the azimuth it arrives at is already half
    // way round, which keeps the swing that follows at a similar rate instead
    // of having to make up the difference.
    { at: 450, azimuthDeg: null as number | null, elevationDeg: 45, y: 0 },
    // The azimuth is front-loaded within the swing. Turning the same amount
    // later, when the camera is nearly overhead, spends it almost entirely on
    // roll, which is what makes a move feel like it accelerates into the end.
    // The descent is slightly back-loaded and the middle elevations kept a
    // little shallow. Both hold the camera further out through the middle of
    // the swing, where the drawer is turned diagonally across the frame and so
    // covers more of it than it does head-on at the end.
    { at: 600, azimuthDeg: 64 as number | null, elevationDeg: 54, y: 0.18 },
    { at: 750, azimuthDeg: 79, elevationDeg: 65, y: 0.44 },
    { at: 900, azimuthDeg: 90, elevationDeg: 80, y: 0.78 },
    { at: 1000, azimuthDeg: 90, elevationDeg: 90, y: 1 },
  ],
  /**
   * Times at which the aim's travel from the desk's centre to the drawer is
   * solved. The values themselves are not authored: holding the aim on the desk
   * while dollying in pushes the off-centre drawer further towards the edge of
   * frame, and hauling it back afterwards is exactly the sideways lurch to be
   * avoided, so instead the aim is solved at each of these times to walk the
   * drawer steadily to the middle of the frame. See `solveAimFractions`.
   */
  aimTimes: [0, 150, 300, 450, 540, 600, 1000],
  /** the aim is on the drawer from here on, so the drawer is dead centre */
  aimLocked: 600,
  /**
   * How much height the camera must have to give up between the opening and
   * closing shots. The whole move is a descent, so the opening pose is pushed
   * back until it clears the closing one by at least this much.
   */
  minimumDescent: 0.25,
  /**
   * Framing budgets: the desk must fit inside `startFrame` at t=0 and the open
   * drawer inside `endFrame` at t=1. The landscape figures are the ones the
   * design calls for and are hit almost exactly on a 16:9 viewport. A portrait
   * viewport cannot satisfy both numbers for shapes this wide, so it gets a
   * roomier width budget; otherwise the desk shrinks to a sliver.
   */
  startFrame: {
    landscape: { w: 0.5, h: 0.3 },
    portrait: { w: 0.88, h: 0.3 },
  },
  /** the open drawer must fill this fraction of the viewport at t=1 */
  endFrame: {
    // Width is deliberately slack so height is what binds. The drawer is real
    // furniture now, so the card's aspect is a consequence of its proportions
    // rather than a target the drawer would have to be distorted to hit.
    landscape: { w: 0.95, h: 0.85 },
    // A portrait viewport is width-bound here, and filling it leaves no room
    // for the middle of the swing, where the drawer lies diagonally across the
    // frame and covers more of it than it does square-on at the end.
    portrait: { w: 0.86, h: 0.85 },
  },
} as const;

/**
 * Where the desk sits inside `outlined-image-2.png`, as fractions of the image.
 *
 * Measured, not estimated: the desk is the only large warm-brown mass in an
 * otherwise near-greyscale frame, so segmenting on saturation and hue, closing
 * the dark seams between the drawer bands, and taking the largest connected
 * component isolates it exactly. That gives x 172..884 and y 307..667 of a
 * 1024 x 684 image — 69.6% x 52.8%, an on-screen aspect of 1.975, which is
 * where `DESK.topWidth` comes from.
 */
/**
 * How strongly the reference photograph is painted onto the desk. Short of 1,
 * so the model's own shading and its pale contour lines still read through the
 * projection rather than being replaced wholesale by the picture's.
 */
export const PROJECTION = { strength: 0.82 } as const;

export const PHOTO_URL = '/outlined-image-2.png';

export const REGISTRATION = {
  photoAspect: 1024 / 684,
  deskLeft: 172 / 1024,
  deskRight: 884 / 1024,
  deskTop: 307 / 684,
  deskBottom: 667 / 684,
  /**
   * How much smaller than an exact fit the photograph is drawn, so the model
   * over-covers rather than lining up edge to edge.
   *
   * As close to 1 as coverage allows, because every percent below it is room
   * behind the desk that the model hides for no reason. Swept against the
   * photograph's own per-column silhouette at the production `OPENING_Y_PADDING`
   * of 0.06: 0.975 is the last value that covers everywhere and 0.98 leaks, so
   * this sits a step back from that edge. Sub-pixel margins are not worth
   * holding — the sweep measures a projection, and the browser rasterises it.
   *
   * It has to be re-swept if `OPENING_Y_PADDING` changes. Raising the aim lifts
   * the camera, and the higher viewpoint makes the model's silhouette diverge a
   * little more from the photograph's, which eats margin: the same 0.98 that
   * left 8.5px of slack at padding 0 leaves none at 0.06.
   */
  coverMargin: 0.97,
  /**
   * The laptop standing on the photograph's desk, in image fractions.
   *
   * Its base rests right on the desk's top edge, and the model's desktop rides
   * about twenty pixels above that edge, so the model cuts the laptop off at the
   * keyboard. Rather than notch the desk, the photograph is drawn a second time
   * over the model inside this box — see `backdrop.ts` — which reads as the
   * laptop sitting on the desk instead of a hole cut in it.
   *
   * Measured by scanning rows and columns across the frame: the laptop's bright
   * grey body runs x 490..625 and y 235..338 of 1024 x 684. The box is a little
   * generous, which is safe because the same warm-brown test that found the desk
   * is used to keep the desk out of it.
   */
  /**
   * The window the laptop occupies, in image fractions, with the softness of
   * each edge.
   *
   * The laptop's base rests on the desk's top edge and the model's desktop rides
   * about twenty pixels above that edge, so the model cuts the laptop off at the
   * keyboard. This window is what gets drawn back.
   *
   * `bottom` is not optional tidiness. The mask draws whatever is not desk, and
   * below the desktop that includes the kneehole and the floor beneath the desk
   * — the kneehole is not an enclosed hole that filling can catch, because it
   * opens downward onto the floor. Without a floor to this window the pass
   * reaches all the way down the picture and paints the room's darkness over the
   * model's own centre drawer and plinth. It sits just under the laptop's base,
   * so everything below belongs to the model.
   */
  laptopWindow: {
    left: 0.448,
    right: 0.618,
    bottom: 0.497,
    sideFeather: 0.022,
    bottomFeather: 0.008,
  },
} as const;

/** Timeline positions, in the timeline's own 0-1000 time base. */
export const TIMING = {
  duration: 1000,
  /** step 1 ends: the camera has closed in but stayed at its starting height */
  approachEnd: 450,
  /**
   * Step 2: the drawer starts being pulled while the camera is still closing,
   * and is fully out by the time the card begins to land. This is the longest
   * beat on the timeline, because it is the one the whole page is about.
   */
  drawerStart: 380,
  drawerEnd: 860,
  /**
   * The light inside the drawer. It starts early and eases in, because against
   * a near-black page an unlit drawer interior reads as a hole rather than as
   * the thing the whole page is about.
   */
  glowStart: 560,
  /** step 5 */
  cardStart: 860,
  textStart: 880,
  /**
   * The photograph is only there to be departed from. It holds just long enough
   * to read as the opening image, then hands over to the model before the
   * camera has moved far enough for a fixed 2D plate to disagree with it.
   */
  backdropFadeEnd: 20,
  /**
   * The model is not drawn at all before this, so the reveal opens on the
   * untouched photograph — its own desk included — and the model takes over a
   * moment into the scroll.
   *
   * The swap is invisible in position because the two are registered: the model
   * lands exactly where the photograph's desk already was, so what reads is the
   * desk sharpening from picture to object rather than anything moving.
   */
  deskAppears: 2,
  /**
   * The laptop cut-out closes on the same beat the photograph goes. By the time
   * the camera has moved enough for a fixed plate to disagree with it, the desk
   * is whole again.
   */
  laptopFadeEnd: 20,
} as const;


/**
 * Peak intensity of the drawer light. Kept low: by the end the card covers the
 * drawer completely, so this only has to carry the frames where the open drawer
 * is the subject, and a hotter light just blows out the interior.
 */
export const DRAWER_GLOW_INTENSITY = 0.62;

/**
 * The transition out of the reveal: the card growing to fill the screen when
 * the visitor presses Enter.
 */
export const ENTER = {
  /**
   * How far down the scroll track the visitor must be for the button to wake
   * up. Measured against the scroll itself rather than the timeline's playhead:
   * `sync` damping means the playhead approaches its target asymptotically and
   * may never quite reach 1, so a threshold on it can go untriggered forever.
   */
  readyProgress: 0.98,
  /** the button has done its job, so it goes before the card starts growing */
  buttonFade: 200,
  expandDuration: 700,
  expandEase: 'inOutQuart',
} as const;

/** The drawer's ease, shared by the timeline and the framing solver. */
export function easeInOutCubic(t: number): number {
  return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
}

/**
 * How far the hero drawer is out at a given point on the timeline.
 *
 * `travel` is the drawer's fully-open distance, which `buildDesk` solves from
 * the geometry and publishes as `DeskBuild.heroTravel`.
 */
export function drawerTravelAt(time: number, travel: number): number {
  const span = TIMING.drawerEnd - TIMING.drawerStart;
  const progress = Math.min(Math.max((time - TIMING.drawerStart) / span, 0), 1);
  return travel * easeInOutCubic(progress);
}

/** Height of the scroll track, as a multiple of the viewport height. */
export const SCROLL_TRACK_VH = 600;
