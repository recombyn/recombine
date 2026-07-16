import { writeFileSync, mkdirSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const outDir = join(__dirname, '../public/cases');
mkdirSync(outDir, { recursive: true });

function buildTextAttrs(text, { fontSize = 14, fill = '#333333', fontWeight = 'normal' } = {}) {
  const chars = String(text).split('').map((char) => ({
    char,
    config: { SIZE: fontSize, COLOR: fill, WEIGHT: fontWeight },
  }));
  return {
    DATA: JSON.stringify([{ chars, config: {} }]),
    ORIGIN_DATA: JSON.stringify([
      {
        children: [
          {
            text,
            bold: fontWeight === 'bold',
            'font-base': { fontSize, color: fill },
          },
        ],
      },
    ]),
  };
}

function text(id, x, y, width, height, content, style = {}) {
  return {
    id,
    key: 'text',
    x,
    y,
    z: 0,
    width,
    height,
    attrs: buildTextAttrs(content, style),
    children: [],
  };
}

function shape(id, x, y, width, height, fill = '#CCC', stroke = '#333', shapeType = 'rect') {
  return {
    id,
    key: 'shape',
    x,
    y,
    z: 0,
    width,
    height,
    attrs: {
      shapeType,
      'fill-color': fill,
      'border-color': stroke,
      'border-width': stroke === 'transparent' ? 0 : 1,
      L: 'true',
      R: 'true',
      T: 'true',
      B: 'true',
      opacity: 1,
      angle: 0,
      radiusTL: 0,
      radiusTR: 0,
      radiusBR: 0,
      radiusBL: 0,
    },
    children: [],
  };
}

function line(id, x, y, width, color = '#C4A574') {
  return {
    id,
    key: 'shape',
    x,
    y,
    z: 0,
    width,
    height: 2,
    attrs: {
      shapeType: 'line',
      'border-color': color,
      'border-width': 2,
      'fill-color': 'transparent',
      opacity: 1,
      angle: 0,
    },
    children: [],
  };
}

function doc(width, height, nodes, backgroundColor = '#ffffff') {
  const ids = nodes.map((n) => n.id);
  const deltaSetLike = {
    ROOT: {
      id: 'ROOT',
      key: 'entry',
      x: 0,
      y: 0,
      width: 0,
      height: 0,
      attrs: {},
      children: [...ids],
    },
  };
  for (const n of nodes) deltaSetLike[n.id] = n;
  return {
    x: 0,
    y: 0,
    width,
    height,
    backgroundColor,
    pages: [{ id: 'page1', children: [...ids] }],
    activePageId: 'page1',
    deltaSetLike,
  };
}

const files = {
  'resume-fresh.json': doc(794, 1123, [
    text('t1', 56, 56, 420, 44, '前端开发工程师', { fontSize: 28, fontWeight: 'bold' }),
    text('t2', 56, 108, 480, 24, 'hello@example.com  ·  江苏徐州', { fontSize: 13, fill: '#666666' }),
    line('l1', 56, 148, 682),
    text('t3', 56, 176, 160, 28, '工作经历', { fontSize: 16, fontWeight: 'bold' }),
    text('t4', 56, 216, 680, 80, '2021.09 – 2025.09  负责 React / TypeScript 业务开发，组件库与性能优化。', {
      fontSize: 13,
    }),
  ]),
  'resume-classic.json': doc(794, 1123, [
    shape('bg', 0, 0, 220, 1123, '#2C3E50', 'transparent'),
    text('n1', 36, 64, 160, 36, '李明', { fontSize: 26, fill: '#FFFFFF', fontWeight: 'bold' }),
    text('n2', 36, 108, 160, 24, '产品设计师', { fontSize: 13, fill: '#BDC3C7' }),
    text('n5', 260, 64, 480, 32, '关于我', { fontSize: 18, fontWeight: 'bold' }),
    text('n6', 260, 108, 480, 90, '关注体验与信息架构，擅长落地设计系统与高保真原型。', { fontSize: 13 }),
  ]),
  'poster-event.json': doc(
    1080,
    1440,
    [
      shape('p1', 0, 0, 1080, 1440, '#0F172A', 'transparent'),
      text('p3', 80, 180, 900, 80, 'Design Meetup', { fontSize: 56, fill: '#F8FAFC', fontWeight: 'bold' }),
      text('p4', 80, 280, 900, 48, '创意分享 · 作品交流 · 现场连麦', { fontSize: 22, fill: '#94A3B8' }),
      shape('p5', 80, 1100, 320, 64, '#38BDF8', 'transparent'),
      text('p6', 110, 1116, 260, 36, '免费报名', { fontSize: 22, fill: '#0F172A', fontWeight: 'bold' }),
    ],
    '#0F172A'
  ),
  'poster-promo.json': doc(
    1242,
    1660,
    [
      shape('a1', 0, 0, 1242, 1660, '#FFF7ED', 'transparent'),
      shape('a2', 0, 0, 1242, 420, '#EA580C', 'transparent'),
      text('a3', 80, 140, 1000, 90, '暑期特惠', { fontSize: 64, fill: '#FFFFFF', fontWeight: 'bold' }),
      text('a4', 80, 250, 800, 40, '全场简历模板 5 折起', { fontSize: 28, fill: '#FFEDD5' }),
      text('a5', 80, 520, 1000, 120, '一键套用官方案例，快速输出作品集封面与活动海报。', {
        fontSize: 24,
        fill: '#9A3412',
      }),
    ],
    '#FFF7ED'
  ),
  'ui-dashboard.json': doc(
    1440,
    900,
    [
      shape('u1', 0, 0, 240, 900, '#111827', 'transparent'),
      text('u2', 32, 40, 180, 28, 'Console', { fontSize: 18, fill: '#F9FAFB', fontWeight: 'bold' }),
      shape('u5', 272, 32, 1120, 72, '#FFFFFF', '#E5E7EB'),
      text('u6', 296, 54, 400, 28, 'Dashboard', { fontSize: 20, fontWeight: 'bold' }),
      shape('u7', 272, 140, 340, 160, '#FFFFFF', '#E5E7EB'),
      text('u9', 296, 210, 200, 40, '12,480', { fontSize: 32, fontWeight: 'bold' }),
    ],
    '#F3F4F6'
  ),
  'ui-mobile.json': doc(390, 844, [
    shape('m1', 0, 0, 390, 844, '#FFFFFF', 'transparent'),
    shape('m2', 0, 0, 390, 88, '#111827', 'transparent'),
    text('m3', 24, 36, 200, 28, '今日任务', { fontSize: 18, fill: '#F9FAFB', fontWeight: 'bold' }),
    shape('m4', 20, 120, 350, 96, '#F9FAFB', '#E5E7EB'),
    text('m5', 40, 144, 280, 24, '完成简历初稿', { fontSize: 15, fontWeight: 'bold' }),
    shape('m10', 120, 740, 150, 44, '#111827', 'transparent'),
    text('m11', 152, 752, 90, 24, '新建', { fontSize: 15, fill: '#FFFFFF', fontWeight: 'bold' }),
  ]),
};

for (const [name, document] of Object.entries(files)) {
  writeFileSync(join(outDir, name), JSON.stringify(document, null, 2), 'utf8');
  console.log('wrote', name);
}
