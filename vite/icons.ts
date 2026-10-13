/**
 * RETURN icon compiler (pure: no I/O, so the build script and the unit tests share it).
 *
 * Sources (docs/design/system.md §10):
 *  - `src/assets/icons/<name>.svg` and `<name>-fill.svg`: 24-unit line icons. Paint comes from the host <svg>
 *    (stroke = currentColor, width set per rendered size); elements with `fill="currentColor"` are solid parts
 *    (`stroke="none"` → fill only, otherwise fill + stroke with `fill-rule="evenodd"` so holes stay open).
 *  - `src/assets/empty/<name>.svg`: 64-unit empty-state line art, same rules (+ `fill-opacity` tonal fills).
 *  - `src/assets/item-art/<category>.svg`: dimensional item illustrations; free-form SVG (gradients, `<use>`)
 *    painted through CSS classes (`src/app/ui/item-art.css`), never `style=""`.
 * Outputs: compact path data for the panel (`src/app/ui/icons.generated.ts`, `item-art.generated.ts`) and one
 * `<symbol>` sprite for the server-rendered finder pages (`public/p/icons.svg`).
 */

export interface SvgNode {
  tag: string;
  attrs: Record<string, string>;
  children: SvgNode[];
}

/** Line icon: stroke-only, fill-only and fill+stroke (evenodd) path data. Empty string = none. */
export type IconPaths = readonly [stroke: string, fill?: string, fillStroke?: string];

/** Tonal (secondary) fill used by empty-state art: currentColor at this opacity. */
export const TONE_OPACITY = 0.14;

export interface ArtPaths {
  stroke: string;
  fill: string;
  tone: string;
}

/** [tag, React props, children] — the illustration tree rendered by `ItemArt`. */
export type ArtNode = [string, Record<string, string>, ArtNode[]];

// ------------------------------------------------------------------------------------------------ parsing
export function parseSvg(source: string): SvgNode {
  const src = source.replace(/<\?xml[\s\S]*?\?>/g, "").replace(/<!--[\s\S]*?-->/g, "");
  const tagRe = /<(\/?)([a-zA-Z][\w:-]*)((?:\s+[\w:-]+\s*=\s*"[^"]*")*)\s*(\/?)>/g;
  const attrRe = /([\w:-]+)\s*=\s*"([^"]*)"/g;
  const root: SvgNode = { tag: "#root", attrs: {}, children: [] };
  const stack: SvgNode[] = [root];
  let last = 0;
  for (let m = tagRe.exec(src); m; m = tagRe.exec(src)) {
    const between = src.slice(last, m.index).trim();
    if (between) throw new Error(`Unexpected text content "${between.slice(0, 40)}"`);
    last = tagRe.lastIndex;
    const [, closing, tag = "", rawAttrs = "", selfClosing] = m;
    const parent = stack[stack.length - 1];
    if (!parent) throw new Error("Unbalanced SVG");
    if (closing) {
      if (parent.tag !== tag) throw new Error(`Mismatched </${tag}>`);
      stack.pop();
      continue;
    }
    const attrs: Record<string, string> = {};
    for (let a = attrRe.exec(rawAttrs); a; a = attrRe.exec(rawAttrs)) attrs[a[1] ?? ""] = a[2] ?? "";
    const node: SvgNode = { tag, attrs, children: [] };
    parent.children.push(node);
    if (!selfClosing) stack.push(node);
  }
  if (src.slice(last).trim()) throw new Error("Trailing content after </svg>");
  if (stack.length !== 1) throw new Error("Unclosed SVG element");
  const svg = root.children[0];
  if (svg?.tag !== "svg" || root.children.length !== 1) throw new Error("Expected one <svg> root");
  return svg;
}

// ------------------------------------------------------------------------------------------------ geometry
const num = (v: string | undefined, name: string): number => {
  const x = Number(v ?? "0");
  if (!Number.isFinite(x)) throw new Error(`Bad number for ${name}: ${v}`);
  return x;
};

/** Any basic shape as path data. */
export function shapeToPath(node: SvgNode): string {
  const a = node.attrs;
  switch (node.tag) {
    case "path":
      if (!a.d) throw new Error("<path> without d");
      return a.d;
    case "circle":
    case "ellipse": {
      const cx = num(a.cx, "cx");
      const cy = num(a.cy, "cy");
      const rx = num(node.tag === "circle" ? a.r : a.rx, "rx");
      const ry = num(node.tag === "circle" ? a.r : a.ry, "ry");
      return `M${cx - rx} ${cy}A${rx} ${ry} 0 1 0 ${cx + rx} ${cy}A${rx} ${ry} 0 1 0 ${cx - rx} ${cy}Z`;
    }
    case "rect": {
      const x = num(a.x, "x");
      const y = num(a.y, "y");
      const w = num(a.width, "width");
      const h = num(a.height, "height");
      const r = Math.min(num(a.rx ?? a.ry, "rx"), w / 2, h / 2);
      if (!r) return `M${x} ${y}H${x + w}V${y + h}H${x}Z`;
      return (
        `M${x + r} ${y}H${x + w - r}A${r} ${r} 0 0 1 ${x + w} ${y + r}V${y + h - r}` +
        `A${r} ${r} 0 0 1 ${x + w - r} ${y + h}H${x + r}A${r} ${r} 0 0 1 ${x} ${y + h - r}V${y + r}` +
        `A${r} ${r} 0 0 1 ${x + r} ${y}Z`
      );
    }
    case "line":
      return `M${num(a.x1, "x1")} ${num(a.y1, "y1")}L${num(a.x2, "x2")} ${num(a.y2, "y2")}`;
    case "polyline":
    case "polygon": {
      const pts = (a.points ?? "").trim().split(/[\s,]+/);
      return `M${pts.join(" ")}${node.tag === "polygon" ? "Z" : ""}`;
    }
    default:
      throw new Error(`Unsupported element <${node.tag}>`);
  }
}

// ------------------------------------------------------------------------------------------------ path minifier
type Seg = { cmd: string; args: number[] };
const ARITY: Record<string, number> = { M: 2, L: 2, H: 1, V: 1, C: 6, S: 4, Q: 4, T: 2, A: 7, Z: 0 };

function parsePath(d: string): Seg[] {
  const tokens = d.match(/[a-zA-Z]|[-+]?(?:\d*\.\d+|\d+\.?)(?:[eE][-+]?\d+)?/g) ?? [];
  const out: Seg[] = [];
  let i = 0;
  let cmd = "";
  while (i < tokens.length) {
    const t = tokens[i] ?? "";
    if (/[a-zA-Z]/.test(t)) {
      cmd = t;
      i++;
      if (cmd === "z" || cmd === "Z") {
        out.push({ cmd: "Z", args: [] });
        continue;
      }
    } else if (!cmd) throw new Error(`Path data must start with a command: ${d.slice(0, 30)}`);
    const n = ARITY[cmd.toUpperCase()];
    if (n === undefined) throw new Error(`Unknown path command ${cmd}`);
    if (cmd === "z" || cmd === "Z") throw new Error("Numbers after Z");
    const args: number[] = [];
    for (let k = 0; k < n; k++) {
      let tok = tokens[i++];
      if (tok === undefined) throw new Error(`Truncated path data: ${d.slice(0, 30)}`);
      // Arc flags may be glued to what follows ("a2 2 0 011.5 2" from vector editors): split them off.
      if ((cmd === "a" || cmd === "A") && (k === 3 || k === 4) && tok.length > 1) {
        tokens.splice(i, 0, tok.slice(1));
        tok = tok.slice(0, 1);
      }
      args.push(Number(tok));
    }
    out.push({ cmd, args });
    if (cmd === "M") cmd = "L";
    else if (cmd === "m") cmd = "l";
  }
  return out;
}

/** Absolute coordinates for every segment (H/V kept as such). */
function toAbsolute(segs: Seg[]): Seg[] {
  let x = 0;
  let y = 0;
  let sx = 0;
  let sy = 0;
  const out: Seg[] = [];
  for (const { cmd, args } of segs) {
    const rel = cmd !== cmd.toUpperCase();
    const C = cmd.toUpperCase();
    const a = [...args];
    if (rel) {
      if (C === "H") a[0] = (a[0] ?? 0) + x;
      else if (C === "V") a[0] = (a[0] ?? 0) + y;
      else if (C === "A") {
        a[5] = (a[5] ?? 0) + x;
        a[6] = (a[6] ?? 0) + y;
      } else
        for (let k = 0; k < a.length; k += 2) {
          a[k] = (a[k] ?? 0) + x;
          a[k + 1] = (a[k + 1] ?? 0) + y;
        }
    }
    out.push({ cmd: C, args: a });
    if (C === "Z") {
      x = sx;
      y = sy;
    } else if (C === "H") x = a[0] ?? x;
    else if (C === "V") y = a[0] ?? y;
    else {
      x = a[a.length - 2] ?? x;
      y = a[a.length - 1] ?? y;
    }
    if (C === "M") {
      sx = x;
      sy = y;
    }
  }
  return out;
}

const fmtWith =
  (decimals: number) =>
  (v: number): string => {
    const k = 10 ** decimals;
    const r = Math.round(v * k) / k;
    const s = (Object.is(r, -0) ? 0 : r).toString();
    return s.replace(/^(-?)0\./, "$1.");
  };

/** Joins numbers with the fewest separators ("-" and a leading "." after a decimal need none). */
function joinNums(nums: string[]): string {
  let out = "";
  let prev = "";
  for (const s of nums) {
    if (!out) out = s;
    else if (s.startsWith("-") || (s.startsWith(".") && prev.includes("."))) out += s;
    else out += ` ${s}`;
    prev = s;
  }
  return out;
}

/**
 * Shortest equivalent path data: absolute or relative per segment, rounded, no redundant separators.
 * One decimal is 0.1 unit: below a device pixel at every rendered size (24 grid ≤ 64 px, 96 grid ≤ 240 px).
 */
export function minifyPath(d: string, decimals = 1): string {
  const fmt = fmtWith(decimals);
  const segs = toAbsolute(parsePath(d));
  let x = 0;
  let y = 0;
  let sx = 0;
  let sy = 0;
  let out = "";
  let lastCmd = "";
  for (const { cmd, args } of segs) {
    if (cmd === "Z") {
      out += "z";
      lastCmd = "z";
      x = sx;
      y = sy;
      continue;
    }
    const absNums = args.map(fmt);
    const relArgs = [...args];
    if (cmd === "H") relArgs[0] = (args[0] ?? 0) - x;
    else if (cmd === "V") relArgs[0] = (args[0] ?? 0) - y;
    else if (cmd === "A") {
      relArgs[5] = (args[5] ?? 0) - x;
      relArgs[6] = (args[6] ?? 0) - y;
    } else
      for (let k = 0; k < relArgs.length; k += 2) {
        relArgs[k] = (args[k] ?? 0) - x;
        relArgs[k + 1] = (args[k + 1] ?? 0) - y;
      }
    const relNums = relArgs.map(fmt);
    const absS = joinNums(absNums);
    const relS = joinNums(relNums);
    const useRel = cmd !== "M" || out !== "" ? relS.length < absS.length : false;
    let letter = useRel ? cmd.toLowerCase() : cmd;
    const body = useRel ? relS : absS;
    // Implicit repetition: same command (M repeats as L).
    const implicit =
      letter === lastCmd || (lastCmd === "M" && letter === "L") || (lastCmd === "m" && letter === "l");
    if (implicit && letter !== "M" && letter !== "m") {
      out += body.startsWith("-") ? body : ` ${body}`;
    } else out += letter + body;
    if (letter === "M") letter = "L";
    if (letter === "m") letter = "l";
    lastCmd = letter;
    // Track the position from the rounded output so relative chains never drift.
    const r = useRel ? relArgs : args;
    if (cmd === "H") x = useRel ? x + Number(fmt(r[0] ?? 0)) : Number(fmt(r[0] ?? 0));
    else if (cmd === "V") y = useRel ? y + Number(fmt(r[0] ?? 0)) : Number(fmt(r[0] ?? 0));
    else {
      const ex = Number(fmt(r[r.length - 2] ?? 0));
      const ey = Number(fmt(r[r.length - 1] ?? 0));
      x = useRel ? x + ex : ex;
      y = useRel ? y + ey : ey;
    }
    if (cmd === "M") {
      sx = x;
      sy = y;
    }
  }
  return out;
}

// ------------------------------------------------------------------------------------------------ line icons
const SHAPES = new Set(["path", "circle", "ellipse", "rect", "line", "polyline", "polygon"]);
const ROOT_PAINT: Record<string, string> = {
  fill: "none",
  stroke: "currentColor",
  "stroke-linecap": "round",
  "stroke-linejoin": "round",
};

/** Validates a line-icon source (grammar rules that a machine can check) and splits it into paint groups. */
export function compileLineIcon(source: string, grid: 24 | 64): { paths: IconPaths; tone: string } {
  const svg = parseSvg(source);
  if (svg.attrs.viewBox !== `0 0 ${grid} ${grid}`) throw new Error(`viewBox must be "0 0 ${grid} ${grid}"`);
  for (const [k, v] of Object.entries(ROOT_PAINT)) {
    if (svg.attrs[k] !== v) throw new Error(`Root <svg> must set ${k}="${v}"`);
  }
  const groups = { s: [] as string[], f: [] as string[], fs: [] as string[], t: [] as string[] };
  const walk = (node: SvgNode, inherited: Record<string, string>) => {
    if ("style" in node.attrs || "class" in node.attrs)
      throw new Error("No style/class attributes in line icons");
    for (const [k, v] of Object.entries(node.attrs)) {
      if (/^(fill|stroke)$/.test(k) && !["none", "currentColor"].includes(v)) {
        throw new Error(`Only currentColor paint is allowed (${k}="${v}")`);
      }
      if (k === "stroke-width" && node !== svg)
        throw new Error("Stroke width is set by the host, not per element");
    }
    const paint = { ...inherited, ...node.attrs };
    if (node.tag === "g" || node === svg) {
      for (const child of node.children) walk(child, node === svg ? {} : paint);
      return;
    }
    if (node.tag === "title" || node.tag === "desc") return;
    if (!SHAPES.has(node.tag)) throw new Error(`Unsupported element <${node.tag}> in a line icon`);
    const d = shapeToPath(node);
    if (paint.fill === "currentColor") {
      if (paint["fill-opacity"]) {
        if (grid !== 64) throw new Error("Tonal fills (fill-opacity) are only for empty-state art");
        groups.t.push(d);
      } else if (paint.stroke === "none") groups.f.push(d);
      else groups.fs.push(d);
    } else groups.s.push(d);
  };
  walk(svg, {});
  const join = (list: string[]) => (list.length ? minifyPath(list.join("")) : "");
  const s = join(groups.s);
  const f = join(groups.f);
  const fs = join(groups.fs);
  const paths: IconPaths = fs ? [s, f, fs] : f ? [s, f] : [s];
  return { paths, tone: join(groups.t) };
}

// ------------------------------------------------------------------------------------------------ item art
const ART_TAGS = new Set([
  "g",
  "defs",
  "path",
  "circle",
  "ellipse",
  "rect",
  "use",
  "linearGradient",
  "radialGradient",
  "stop",
]);
const camel = (k: string) =>
  k === "class" ? "className" : k.replace(/-([a-z])/g, (_, c: string) => c.toUpperCase());

/** Dimensional illustration → React-ready tree. Ids stay local; `ItemArt` prefixes them per instance. */
export function compileArt(source: string): { viewBox: string; nodes: ArtNode[] } {
  const svg = parseSvg(source);
  if (svg.attrs.viewBox !== "0 0 96 96") throw new Error('Item art viewBox must be "0 0 96 96"');
  const convert = (node: SvgNode): ArtNode => {
    if (!ART_TAGS.has(node.tag)) throw new Error(`Unsupported element <${node.tag}> in item art`);
    const props: Record<string, string> = {};
    for (const [k, v] of Object.entries(node.attrs)) {
      if (k === "style") throw new Error("No style attributes (finder CSP); paint with classes");
      if (k === "xlink:href") throw new Error("Use href, not xlink:href");
      if (
        /^(fill|stroke|stop-color)$/.test(k) &&
        /^#|^rgb|^hsl|^oklch/.test(v) &&
        !/^#(fff|ffffff|000|000000)$/i.test(v)
      ) {
        throw new Error(
          `Colours come from classes (item-art.css); only white/black light overlays are literal (${k}="${v}")`,
        );
      }
      props[camel(k)] = k === "d" ? minifyPath(v) : v;
    }
    return [node.tag, props, node.children.map(convert)];
  };
  return { viewBox: svg.attrs.viewBox, nodes: svg.children.map(convert) };
}

// ------------------------------------------------------------------------------------------------ sprite
const PAINT = 'fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round"';

/**
 * One external sprite for pages that cannot run the React component. Paint lives on the referencing
 * <svg> (attributes, CSP-safe) and is inherited through <use>; solid parts carry their own fill.
 */
export function buildSprite(
  icons: Record<string, IconPaths>,
  empty: Record<string, { paths: IconPaths; tone: string }>,
): string {
  const sym = (id: string, grid: number, [s, f, fs]: IconPaths, tone = "") =>
    `<symbol id="${id}" viewBox="0 0 ${grid} ${grid}">` +
    (tone ? `<path d="${tone}" fill="currentColor" fill-opacity="${TONE_OPACITY}" stroke="none"/>` : "") +
    (s ? `<path d="${s}"/>` : "") +
    (f ? `<path d="${f}" fill="currentColor" stroke="none"/>` : "") +
    (fs ? `<path d="${fs}" fill="currentColor" fill-rule="evenodd"/>` : "") +
    "</symbol>";
  const body = [
    ...Object.entries(icons).map(([id, p]) => sym(id, 24, p)),
    ...Object.entries(empty).map(([id, e]) => sym(`empty-${id}`, 64, e.paths, e.tone)),
  ].join("\n");
  return (
    "<!-- RETURN icons. Generated by `pnpm icons:build` from src/assets; do not edit. Usage:\n" +
    `  <svg viewBox="0 0 24 24" width="20" height="20" ${PAINT} stroke-width="1.85" aria-hidden="true"><use href="/p/icons.svg#pin"/></svg>\n` +
    "  Stroke width by rendered size: 16 px 2 · 20 px 1.85 · 24 px 1.75 · 32 px 1.6 (docs/design/system.md §10). -->\n" +
    `<svg xmlns="http://www.w3.org/2000/svg">\n${body}\n</svg>\n`
  );
}

/** Absolute end points of every segment (arc bulges excluded): enough to check the live area and minification. */
export function pathPoints(d: string): Array<[number, number]> {
  const pts: Array<[number, number]> = [];
  let x = 0;
  let y = 0;
  for (const { cmd, args } of toAbsolute(parsePath(d))) {
    if (cmd === "Z") continue;
    if (cmd === "H") x = args[0] ?? x;
    else if (cmd === "V") y = args[0] ?? y;
    else {
      x = args[args.length - 2] ?? x;
      y = args[args.length - 1] ?? y;
    }
    pts.push([x, y]);
  }
  return pts;
}
