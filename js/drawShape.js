// The NF-ModRack's Draw module: its shape, as nodes (breakpoints) joined by lines that can bend.
// Shared by the editor (nodeEditor.js) and the patch; the sound engine (modrack-processor.js) has
// the same sums.
//
// A shape is a list of nodes { x, y, c }: x (time, 0 = start .. 1 = end) never goes backwards, y is
// the level (0..1), and c bends the line to the next node (0: straight; above 0: starts slowly and
// speeds up; below 0: starts fast and slows down, like an envelope's curves). The first node is
// always at x 0 and the last at x 1. One node can be the sustain node: in Once mode the shape holds
// there while the Gate is high.
//
// In the patch it is a string: the sustain node's index (-1: none), then each node as x,y,c:
//   "2;0,0,0;0.1,1,-0.5;0.35,0.6,0;1,0,-0.5"

export const MAX_NODES = 64;
const round = (v) => Math.round(v * 1000) / 1000;
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);

// the curve of one line: 0..1 -> 0..1, bent by c (-1..1)
export function bend(t, c) {
  if (Math.abs(c) < 0.001) return t;
  const k = c * 6;
  return (Math.exp(k * t) - 1) / (Math.exp(k) - 1);
}

export function serialize({ nodes, sus }) {
  return `${sus};` + nodes.map((n) => `${round(n.x)},${round(n.y)},${round(n.c)}`).join(';');
}

// Read a shape string, tidied: x in order from 0 to 1, values in range. null if it isn't one.
export function parse(str) {
  if (typeof str !== 'string') return null;
  const parts = str.split(';');
  const sus = parseInt(parts.shift(), 10);
  const nodes = [];
  for (const p of parts) {
    const [x, y, c] = p.split(',').map(Number);
    if (![x, y, c].every(Number.isFinite)) return null;
    nodes.push({ x: clamp(x, 0, 1), y: clamp(y, 0, 1), c: clamp(c, -1, 1) });
  }
  if (nodes.length < 2 || nodes.length > MAX_NODES) return null;
  for (let i = 1; i < nodes.length; i++) if (nodes[i].x < nodes[i - 1].x) nodes[i].x = nodes[i - 1].x;
  nodes[0].x = 0;
  nodes[nodes.length - 1].x = 1;
  return { nodes, sus: Number.isInteger(sus) && sus > 0 && sus < nodes.length - 1 ? sus : -1 };
}
export const valid = (str) => parse(str) !== null;

// the level at time x
export function valueAt(nodes, x) {
  let j = 0;
  while (j < nodes.length - 2 && x >= nodes[j + 1].x) j++;
  const a = nodes[j], b = nodes[j + 1];
  const w = b.x - a.x;
  if (w <= 0) return b.y;
  return a.y + (b.y - a.y) * bend(clamp((x - a.x) / w, 0, 1), a.c);
}

// A freehand line (points in order of x) made into a few nodes that follow it closely
// (the Ramer-Douglas-Peucker method: keep the point furthest from the straight line, and repeat).
export function simplify(points, tolerance = 0.02) {
  if (points.length <= 2) return points.slice();
  const keep = new Array(points.length).fill(false);
  keep[0] = keep[points.length - 1] = true;
  const stack = [[0, points.length - 1]];
  while (stack.length) {
    const [a, b] = stack.pop();
    let worst = -1, far = 0;
    const [x1, y1] = [points[a].x, points[a].y], [x2, y2] = [points[b].x, points[b].y];
    const len = Math.hypot(x2 - x1, y2 - y1) || 1e-9;
    for (let i = a + 1; i < b; i++) {
      const d = Math.abs((y2 - y1) * points[i].x - (x2 - x1) * points[i].y + x2 * y1 - y2 * x1) / len;
      if (d > far) { far = d; worst = i; }
    }
    if (far > tolerance) { keep[worst] = true; stack.push([a, worst], [worst, b]); }
  }
  return points.filter((_, i) => keep[i]);
}

// the shape a new Draw module starts with: an envelope (rise, fall to a held level, release)
export const DEFAULT_SHAPE = '2;0,0,0;0.12,1,-0.5;0.4,0.55,-0.4;1,0,-0.5';
