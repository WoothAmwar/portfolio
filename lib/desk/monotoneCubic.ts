/**
 * Monotone cubic interpolation, Fritsch-Carlson.
 *
 * A Catmull-Rom spline through the same points would be smooth but can
 * overshoot between them: feed it a sequence that only decreases and it can
 * still bulge upwards near an endpoint. This cannot. If the control values only
 * decrease, the curve only decreases, which is what guarantees the camera
 * travels in one direction for the whole animation while staying smooth (C1)
 * across every waypoint.
 */
export class MonotoneCubic {
  private readonly xs: number[];
  private readonly ys: number[];
  private readonly slopes: number[];

  constructor(xs: number[], ys: number[]) {
    if (xs.length !== ys.length || xs.length < 2) {
      throw new Error('monotoneCubic: need at least two matching knots');
    }
    this.xs = xs;
    this.ys = ys;

    const n = xs.length;
    const h: number[] = [];
    const delta: number[] = [];
    for (let i = 0; i < n - 1; i++) {
      h.push(xs[i + 1] - xs[i]);
      delta.push((ys[i + 1] - ys[i]) / (xs[i + 1] - xs[i]));
    }

    const m: number[] = new Array(n);
    m[0] = delta[0];
    m[n - 1] = delta[n - 2];
    for (let i = 1; i < n - 1; i++) m[i] = (delta[i - 1] + delta[i]) / 2;

    // Fritsch-Carlson limiter: clamp the slopes into the region that keeps each
    // segment monotone.
    for (let i = 0; i < n - 1; i++) {
      if (delta[i] === 0) {
        m[i] = 0;
        m[i + 1] = 0;
        continue;
      }
      const a = m[i] / delta[i];
      const b = m[i + 1] / delta[i];
      const s = a * a + b * b;
      if (s > 9) {
        const scale = 3 / Math.sqrt(s);
        m[i] = scale * a * delta[i];
        m[i + 1] = scale * b * delta[i];
      }
    }

    this.slopes = m;
  }

  at(x: number): number {
    const { xs, ys, slopes } = this;
    const n = xs.length;
    if (x <= xs[0]) return ys[0];
    if (x >= xs[n - 1]) return ys[n - 1];

    let i = n - 2;
    while (i > 0 && x < xs[i]) i--;

    const h = xs[i + 1] - xs[i];
    const t = (x - xs[i]) / h;
    const t2 = t * t;
    const t3 = t2 * t;

    // Hermite basis.
    return (
      (2 * t3 - 3 * t2 + 1) * ys[i] +
      (t3 - 2 * t2 + t) * h * slopes[i] +
      (-2 * t3 + 3 * t2) * ys[i + 1] +
      (t3 - t2) * h * slopes[i + 1]
    );
  }
}

