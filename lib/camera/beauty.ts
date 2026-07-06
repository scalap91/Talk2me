/**
 * Beauté faciale (Pascal 2026-07-03, v2 « refais bien ») — module ISOLÉ, gratuit, offline.
 *
 * v1 = simple flou masqué → ça bavait (« vaseline »). v2 = vrai skin-smoothing :
 *  - suivi visage MediaPipe FaceLandmarker (contours),
 *  - lissage BILATÉRAL en WebGL (préserve les contours/détails, ne bave pas),
 *  - masque visage FONDU (bords adoucis) avec trous yeux/bouche/sourcils NETS.
 * Fallback flou doux si WebGL indispo. Assets 100% locaux (/public/mediapipe).
 */
import type { FaceLandmarker, FaceLandmarkerResult } from '@mediapipe/tasks-vision';

// Contours FaceMesh (indices officiels MediaPipe).
const FACE_OVAL = [10, 338, 297, 332, 284, 251, 389, 356, 454, 323, 361, 288, 397, 365, 379, 378, 400, 377, 152, 148, 176, 149, 150, 136, 172, 58, 132, 93, 234, 127, 162, 21, 54, 103, 67, 109];
const LEFT_EYE = [33, 7, 163, 144, 145, 153, 154, 155, 133, 173, 157, 158, 159, 160, 161, 246];
const RIGHT_EYE = [263, 249, 390, 373, 374, 380, 381, 382, 362, 398, 384, 385, 386, 387, 388, 466];
const LIPS = [61, 146, 91, 181, 84, 17, 314, 405, 321, 375, 291, 409, 270, 269, 267, 0, 37, 39, 40, 185];
const LEFT_BROW = [70, 63, 105, 66, 107, 55, 65, 52, 53, 46];
const RIGHT_BROW = [300, 293, 334, 296, 336, 285, 295, 282, 283, 276];

type Face = Array<{ x: number; y: number }>;

let landmarker: FaceLandmarker | null = null;
let loading: Promise<FaceLandmarker> | null = null;

/** Charge (une seule fois) le FaceLandmarker. Assets locaux, GPU puis fallback CPU. */
export function loadBeauty(): Promise<FaceLandmarker> {
  if (landmarker) return Promise.resolve(landmarker);
  if (!loading) {
    loading = (async () => {
      const { FaceLandmarker, FilesetResolver } = await import('@mediapipe/tasks-vision');
      const fileset = await FilesetResolver.forVisionTasks('/mediapipe/wasm');
      const make = (delegate: 'GPU' | 'CPU') =>
        FaceLandmarker.createFromOptions(fileset, {
          baseOptions: { modelAssetPath: '/mediapipe/face_landmarker.task', delegate },
          runningMode: 'VIDEO',
          numFaces: 1,
        });
      let lm: FaceLandmarker;
      try { lm = await make('GPU'); } catch { lm = await make('CPU'); }
      landmarker = lm;
      return lm;
    })().catch((e) => { loading = null; throw e; });
  }
  return loading;
}

export function isBeautyReady(): boolean {
  return !!landmarker;
}

/* ───────────────────────── Lissage bilatéral WebGL ───────────────────────── */

const SMOOTH_W = 480; // largeur de travail du lissage (upscalé ensuite) — perf mobile

const VERT = `attribute vec2 p; varying vec2 uv;
void main(){ uv = vec2(p.x*0.5+0.5, 0.5 - p.y*0.5); gl_Position = vec4(p,0.0,1.0); }`;

// Bilatéral 7×7 : moyenne pondérée par distance spatiale ET différence de couleur
// (les contours forts — yeux, narines, lèvres — pèsent peu → restent nets).
const FRAG = `precision mediump float;
varying vec2 uv;
uniform sampler2D tex;
uniform vec2 texel;
uniform float sigmaColor;
void main(){
  vec3 center = texture2D(tex, uv).rgb;
  vec3 sum = vec3(0.0); float wsum = 0.0;
  for(int x=-3;x<=3;x++){
    for(int y=-3;y<=3;y++){
      vec2 off = vec2(float(x), float(y)) * texel * 1.4;
      vec3 c = texture2D(tex, uv + off).rgb;
      float sw = exp(-float(x*x + y*y) / 8.0);
      vec3 d = c - center;
      float cw = exp(-dot(d,d) / (2.0*sigmaColor*sigmaColor));
      float w = sw * cw;
      sum += c * w; wsum += w;
    }
  }
  gl_FragColor = vec4(sum / wsum, 1.0);
}`;

let glCanvas: HTMLCanvasElement | null = null;
let gl: WebGLRenderingContext | null = null;
let glProg: WebGLProgram | null = null;
let glTex: WebGLTexture | null = null;
let uTexel: WebGLUniformLocation | null = null;
let uSigma: WebGLUniformLocation | null = null;
let glBroken = false;

function ensureGL(): boolean {
  if (gl) return true;
  if (glBroken) return false;
  try {
    glCanvas = document.createElement('canvas');
    const ctx = glCanvas.getContext('webgl', { premultipliedAlpha: false });
    if (!ctx) throw new Error('no webgl');
    gl = ctx;
    const sh = (type: number, src: string) => {
      const s = gl!.createShader(type)!;
      gl!.shaderSource(s, src); gl!.compileShader(s);
      if (!gl!.getShaderParameter(s, gl!.COMPILE_STATUS)) throw new Error(gl!.getShaderInfoLog(s) || 'shader');
      return s;
    };
    const prog = gl.createProgram()!;
    gl.attachShader(prog, sh(gl.VERTEX_SHADER, VERT));
    gl.attachShader(prog, sh(gl.FRAGMENT_SHADER, FRAG));
    gl.linkProgram(prog);
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) throw new Error('link');
    gl.useProgram(prog);
    glProg = prog;
    const buf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
    const loc = gl.getAttribLocation(prog, 'p');
    gl.enableVertexAttribArray(loc);
    gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
    glTex = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, glTex);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    uTexel = gl.getUniformLocation(prog, 'texel');
    uSigma = gl.getUniformLocation(prog, 'sigmaColor');
    gl.uniform1i(gl.getUniformLocation(prog, 'tex'), 0);
    return true;
  } catch {
    glBroken = true; gl = null; glCanvas = null;
    return false;
  }
}

/** Lisse la frame vidéo en bilatéral (WebGL). Retourne le canvas GL, ou null si indispo. */
function smoothGL(video: HTMLVideoElement, intensity: number): HTMLCanvasElement | null {
  if (!ensureGL() || !gl || !glCanvas) return null;
  const vw = video.videoWidth || 720, vh = video.videoHeight || 1280;
  const w = SMOOTH_W, h = Math.round((SMOOTH_W * vh) / vw);
  if (glCanvas.width !== w || glCanvas.height !== h) { glCanvas.width = w; glCanvas.height = h; }
  gl.viewport(0, 0, w, h);
  try {
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, video);
  } catch {
    return null;
  }
  gl.uniform2f(uTexel, 1 / w, 1 / h);
  gl.uniform1f(uSigma, 0.05 + 0.14 * intensity); // ↑ intensité = ↑ lissage des tons proches
  gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
  return glCanvas;
}

/* ───────────────────────── Composition (masque fondu) ───────────────────────── */

let maskCanvas: HTMLCanvasElement | null = null;
let workCanvas: HTMLCanvasElement | null = null;
function scratch(which: 'mask' | 'work', w: number, h: number): HTMLCanvasElement {
  let c = which === 'mask' ? maskCanvas : workCanvas;
  if (!c) { c = document.createElement('canvas'); which === 'mask' ? (maskCanvas = c) : (workCanvas = c); }
  if (c.width !== w || c.height !== h) { c.width = w; c.height = h; }
  return c;
}

function tracePath(path: Path2D, face: Face, idx: number[], w: number, h: number) {
  idx.forEach((i, k) => {
    const p = face[i]; if (!p) return;
    const x = p.x * w, y = p.y * h;
    k === 0 ? path.moveTo(x, y) : path.lineTo(x, y);
  });
  path.closePath();
}

/**
 * Rend une frame « beauté » de `video` dans `canvas`.
 * @param intensity 0..1 (0.4 doux → 0.9 fort). @returns false si moteur pas prêt.
 */
export function renderBeautyFrame(
  video: HTMLVideoElement,
  canvas: HTMLCanvasElement,
  intensity: number,
  tsMs: number
): boolean {
  const lm = landmarker;
  if (!lm) return false;
  const w = (canvas.width = video.videoWidth || 720);
  const h = (canvas.height = video.videoHeight || 1280);
  const ctx = canvas.getContext('2d');
  if (!ctx) return false;

  let res: FaceLandmarkerResult | undefined;
  try { res = lm.detectForVideo(video, tsMs); } catch { return false; }

  // 1) image nette de base
  ctx.filter = 'none'; ctx.globalAlpha = 1;
  ctx.drawImage(video, 0, 0, w, h);

  const face = res?.faceLandmarks?.[0] as Face | undefined;
  if (!face) return true; // pas de visage → flux net

  // 2) couche lissée (bilatéral GPU, sinon fallback flou doux)
  const smooth = smoothGL(video, intensity);
  const sc = scratch('work', w, h);
  const sctx = sc.getContext('2d')!;
  sctx.clearRect(0, 0, w, h);
  sctx.globalAlpha = 1; sctx.globalCompositeOperation = 'source-over';
  if (smooth) {
    sctx.filter = 'none';
    sctx.drawImage(smooth, 0, 0, w, h);
  } else {
    // Fallback sans WebGL : flou doux (moins bien mais jamais moche/cassé)
    sctx.filter = `blur(${Math.max(2, Math.round(w * 0.006 * (0.6 + intensity)))}px)`;
    sctx.drawImage(video, 0, 0, w, h);
    sctx.filter = 'none';
  }

  // 3) masque FONDU : ovale plein adouci, MOINS yeux/sourcils/bouche
  const mask = scratch('mask', w, h);
  const mctx = mask.getContext('2d')!;
  mctx.clearRect(0, 0, w, h);
  const feather = Math.max(4, Math.round(w * 0.025));
  mctx.filter = `blur(${feather}px)`;
  mctx.fillStyle = '#fff';
  const oval = new Path2D(); tracePath(oval, face, FACE_OVAL, w, h);
  mctx.fill(oval);
  mctx.globalCompositeOperation = 'destination-out';
  for (const part of [LEFT_EYE, RIGHT_EYE, LEFT_BROW, RIGHT_BROW, LIPS]) {
    const p = new Path2D(); tracePath(p, face, part, w, h);
    mctx.fill(p);
  }
  mctx.globalCompositeOperation = 'source-over';
  mctx.filter = 'none';

  // applique le masque (alpha) à la couche lissée
  sctx.globalCompositeOperation = 'destination-in';
  sctx.drawImage(mask, 0, 0);
  sctx.globalCompositeOperation = 'source-over';

  // 4) pose la peau lissée sur l'image nette (léger < 1 = garde du naturel)
  ctx.globalAlpha = 0.9;
  ctx.drawImage(sc, 0, 0);
  ctx.globalAlpha = 1;
  return true;
}

/* ───────────────────────── Masques AR (suivent le visage) ───────────────────────── */

export type MaskKind = 'dog' | 'crown' | 'glasses' | 'hearts';
export const MASKS: Array<{ key: MaskKind; label: string; emoji: string }> = [
  { key: 'dog', label: 'Chien', emoji: '🐶' },
  { key: 'crown', label: 'Couronne', emoji: '👑' },
  { key: 'glasses', label: 'Lunettes', emoji: '🕶️' },
  { key: 'hearts', label: 'Cœurs', emoji: '😍' },
];

function lp(face: Face, i: number, w: number, h: number) {
  const p = face[i];
  return { x: p.x * w, y: p.y * h };
}
function mid(a: { x: number; y: number }, b: { x: number; y: number }) {
  return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
}

/** Dessine `video` + un masque AN­CRÉ sur les points du visage (chien/couronne/…). */
export function renderMaskFrame(
  video: HTMLVideoElement,
  canvas: HTMLCanvasElement,
  mask: MaskKind,
  tsMs: number
): boolean {
  const lm = landmarker;
  if (!lm) return false;
  const w = (canvas.width = video.videoWidth || 720);
  const h = (canvas.height = video.videoHeight || 1280);
  const ctx = canvas.getContext('2d');
  if (!ctx) return false;

  let res: FaceLandmarkerResult | undefined;
  try { res = lm.detectForVideo(video, tsMs); } catch { return false; }

  ctx.filter = 'none'; ctx.globalAlpha = 1;
  ctx.drawImage(video, 0, 0, w, h);
  const face = res?.faceLandmarks?.[0] as Face | undefined;
  if (!face) return true;

  const ls = lp(face, 234, w, h), rs = lp(face, 454, w, h);      // côtés du visage
  const top = lp(face, 10, w, h), chin = lp(face, 152, w, h);     // haut front / menton
  const nose = lp(face, 1, w, h);
  const eyeR = mid(lp(face, 33, w, h), lp(face, 133, w, h));      // œil (droite image)
  const eyeL = mid(lp(face, 362, w, h), lp(face, 263, w, h));     // œil (gauche image)
  const faceW = Math.hypot(rs.x - ls.x, rs.y - ls.y);
  const faceH = Math.hypot(chin.x - top.x, chin.y - top.y);
  const ang = Math.atan2(rs.y - ls.y, rs.x - ls.x);              // inclinaison tête
  const center = mid(ls, rs);
  const emoji = (px: number, cx: number, cy: number, ch: string) => {
    ctx.save(); ctx.translate(cx, cy); ctx.rotate(ang);
    ctx.font = `${Math.round(px)}px serif`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(ch, 0, 0); ctx.restore();
  };

  if (mask === 'dog') {
    // oreilles tombantes ancrées au sommet de la tête
    ctx.save(); ctx.translate(center.x, top.y); ctx.rotate(ang);
    for (const side of [-1, 1]) {
      ctx.save();
      ctx.translate(side * faceW * 0.44, -faceH * 0.02);
      ctx.rotate(side * 0.28);
      ctx.fillStyle = '#6b4a2b';
      ctx.beginPath(); ctx.ellipse(0, 0, faceW * 0.17, faceH * 0.32, 0, 0, 7); ctx.fill();
      ctx.fillStyle = '#c99b74';
      ctx.beginPath(); ctx.ellipse(0, faceH * 0.04, faceW * 0.09, faceH * 0.19, 0, 0, 7); ctx.fill();
      ctx.restore();
    }
    ctx.restore();
    // truffe sur le nez
    ctx.save(); ctx.translate(nose.x, nose.y); ctx.rotate(ang);
    ctx.fillStyle = '#1a1a1a';
    ctx.beginPath(); ctx.ellipse(0, 0, faceW * 0.11, faceW * 0.085, 0, 0, 7); ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,0.4)';
    ctx.beginPath(); ctx.ellipse(-faceW * 0.035, -faceW * 0.03, faceW * 0.03, faceW * 0.022, 0, 0, 7); ctx.fill();
    ctx.restore();
  } else if (mask === 'crown') {
    emoji(faceW * 1.0, center.x, top.y - faceH * 0.34, '👑');
  } else if (mask === 'glasses') {
    const r = Math.hypot(eyeL.x - eyeR.x, eyeL.y - eyeR.y) * 0.42;
    ctx.save();
    ctx.strokeStyle = 'rgba(15,15,20,0.95)'; ctx.lineWidth = faceW * 0.03;
    ctx.fillStyle = 'rgba(15,15,25,0.55)';
    for (const e of [eyeR, eyeL]) {
      ctx.beginPath(); ctx.ellipse(e.x, e.y, r, r * 0.82, ang, 0, 7); ctx.fill(); ctx.stroke();
    }
    ctx.beginPath(); ctx.moveTo(eyeR.x, eyeR.y); ctx.lineTo(eyeL.x, eyeL.y); ctx.stroke();
    ctx.restore();
  } else if (mask === 'hearts') {
    emoji(faceW * 0.4, eyeR.x, eyeR.y, '❤️');
    emoji(faceW * 0.4, eyeL.x, eyeL.y, '❤️');
  }
  return true;
}
