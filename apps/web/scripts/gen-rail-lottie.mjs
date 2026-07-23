/**
 * Generates minimal outline-style rail icon Lotties (scale bounce on play).
 * Run: node scripts/gen-rail-lottie.mjs
 */
import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const outDir = join(__dirname, '../public/lottie/rail');
mkdirSync(outDir, { recursive: true });

/** RGB 0–1 stroke matching --muted / --ink on light rail */
const STROKE = [0.42, 0.44, 0.48, 1];
const STROKE_W = 2;
const W = 48;
const H = 48;
const CX = 24;
const CY = 24;
const FR = 30;
const OP = 30;

function strokeGroup(name, shapes) {
  return {
    ty: 'gr',
    nm: name,
    it: [
      ...shapes,
      {
        ty: 'tr',
        p: { a: 0, k: [0, 0] },
        a: { a: 0, k: [0, 0] },
        s: { a: 0, k: [100, 100] },
        r: { a: 0, k: 0 },
        o: { a: 0, k: 100 },
        sk: { a: 0, k: 0 },
        sa: { a: 0, k: 0 },
        nm: 'Transform',
      },
    ],
    np: shapes.length + 1,
    cix: 2,
    bm: 0,
  };
}

function pathShape(name, vertices, closed = false) {
  return {
    ty: 'sh',
    nm: name,
    ks: {
      a: 0,
      k: {
        i: vertices.map(() => [0, 0]),
        o: vertices.map(() => [0, 0]),
        v: vertices,
        c: closed,
      },
    },
  };
}

function strokeItem() {
  return {
    ty: 'st',
    c: { a: 0, k: STROKE },
    o: { a: 0, k: 100 },
    w: { a: 0, k: STROKE_W },
    lc: 2,
    lj: 2,
    nm: 'Stroke',
  };
}

function ellipseShape(name, size) {
  return {
    ty: 'el',
    nm: name,
    p: { a: 0, k: [0, 0] },
    s: { a: 0, k: size },
  };
}

function scaleBounceKs() {
  return {
    o: { a: 0, k: 100 },
    r: { a: 0, k: 0 },
    p: { a: 0, k: [CX, CY, 0] },
    a: { a: 0, k: [0, 0, 0] },
    s: {
      a: 1,
      k: [
        { t: 0, s: [100, 100, 100], h: 1 },
        { t: 4, s: [82, 82, 100] },
        { t: 10, s: [118, 118, 100] },
        { t: 18, s: [100, 100, 100], h: 1 },
      ],
    },
  };
}

function buildLottie(nm, shapeGroups) {
  return {
    v: '5.9.0',
    fr: FR,
    ip: 0,
    op: OP,
    w: W,
    h: H,
    nm,
    ddd: 0,
    assets: [],
    layers: [
      {
        ddd: 0,
        ind: 1,
        ty: 4,
        nm: 'icon',
        sr: 1,
        ks: scaleBounceKs(),
        ao: 0,
        shapes: shapeGroups,
        ip: 0,
        op: OP,
        st: 0,
        bm: 0,
      },
    ],
  };
}

const icons = {
  plus: buildLottie('plus', [
    /** ~26px ring so optical size matches home/folder/user (~24px tall). */
    strokeGroup('ring', [ellipseShape('circle', [26, 26]), strokeItem()]),
    strokeGroup('plus-v', [
      pathShape('v', [
        [0, -7],
        [0, 7],
      ]),
      strokeItem(),
    ]),
    strokeGroup('plus-h', [
      pathShape('h', [
        [-7, 0],
        [7, 0],
      ]),
      strokeItem(),
    ]),
  ]),
  home: buildLottie('home', [
    strokeGroup('roof', [
      pathShape('roof', [
        [-12, 2],
        [0, -10],
        [12, 2],
      ]),
      strokeItem(),
    ]),
    strokeGroup('body', [
      pathShape('body', [
        [-9, 2],
        [-9, 14],
        [9, 14],
        [9, 2],
      ], true),
      strokeItem(),
    ]),
  ]),
  folder: buildLottie('folder', [
    strokeGroup('folder', [
      pathShape('tab', [
        [-11, -2],
        [-4, -2],
        [-2, -6],
        [11, -6],
      ]),
      pathShape('base', [
        [-11, -2],
        [-11, 12],
        [11, 12],
        [11, -6],
      ], true),
      strokeItem(),
    ]),
  ]),
  user: buildLottie('user', [
    strokeGroup('head', [ellipseShape('head', [10, 10]), strokeItem()]),
    strokeGroup('body', [
      pathShape('shoulders', [
        [-11, 14],
        [0, 6],
        [11, 14],
      ]),
      strokeItem(),
    ]),
  ]),
};

for (const [name, data] of Object.entries(icons)) {
  const path = join(outDir, `${name}.json`);
  writeFileSync(path, JSON.stringify(data));
  console.log('wrote', path, JSON.stringify(data).length, 'bytes');
}
