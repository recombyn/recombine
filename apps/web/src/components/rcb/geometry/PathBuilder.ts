/**
 * Lightweight path builder.
 * Geometry truth is the path `d`; stroke/fill are paint along it.
 */

export type Pt = { x: number; y: number };

export class PathBuilder {
  private parts: string[] = [];

  moveTo(x: number, y: number): this {
    this.parts.push(`M ${x} ${y}`);
    return this;
  }

  lineTo(x: number, y: number): this {
    this.parts.push(`L ${x} ${y}`);
    return this;
  }

  curveTo(c1x: number, c1y: number, c2x: number, c2y: number, x: number, y: number): this {
    this.parts.push(`C ${c1x} ${c1y} ${c2x} ${c2y} ${x} ${y}`);
    return this;
  }

  close(): this {
    this.parts.push('Z');
    return this;
  }

  /** Start a new subpath without closing the previous one. */
  break(): this {
    return this;
  }

  toD(): string {
    return this.parts.join(' ');
  }

  static fromD(d: string): PathBuilder {
    const b = new PathBuilder();
    const raw = String(d || '').trim();
    if (raw) b.parts.push(raw);
    return b;
  }

  static polyline(points: Pt[], closed = false): PathBuilder {
    const b = new PathBuilder();
    if (points.length < 1) return b;
    b.moveTo(points[0].x, points[0].y);
    for (let i = 1; i < points.length; i += 1) {
      b.lineTo(points[i].x, points[i].y);
    }
    if (closed && points.length >= 3) b.close();
    return b;
  }

  /** Unit box [0,w]×[0,h] ellipse via 4 cubic Béziers. */
  static ellipse(w: number, h: number): PathBuilder {
    const rx = Math.max(0.5, w / 2);
    const ry = Math.max(0.5, h / 2);
    const cx = rx;
    const cy = ry;
    const kx = rx * 0.5522847498;
    const ky = ry * 0.5522847498;
    return new PathBuilder()
      .moveTo(cx, cy - ry)
      .curveTo(cx + kx, cy - ry, cx + rx, cy - ky, cx + rx, cy)
      .curveTo(cx + rx, cy + ky, cx + kx, cy + ry, cx, cy + ry)
      .curveTo(cx - kx, cy + ry, cx - rx, cy + ky, cx - rx, cy)
      .curveTo(cx - rx, cy - ky, cx - kx, cy - ry, cx, cy - ry)
      .close();
  }
}
