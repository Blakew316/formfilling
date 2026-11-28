/**
 * The Suit Up mark and wordmark.
 *
 * The logo clip is on black, and browsers do not agree on a transparent video
 * format, so each frame is cut out on the GPU: the metal emblem (logo-core.png
 * marks where it is) stays opaque, and everything else becomes light whose
 * opacity follows its brightness. The black disappears and the glow lies over
 * the page. Without WebGL the same rule runs on a 2D canvas.
 */
import { useEffect, useRef } from 'react';

const SOURCE = 720;
const reduceMotion = typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;

const VERT = `attribute vec2 p; varying vec2 uv;
void main() { uv = vec2((p.x + 1.0) * 0.5, (1.0 - p.y) * 0.5); gl_Position = vec4(p, 0.0, 1.0); }`;
const FRAG = `precision mediump float; varying vec2 uv; uniform sampler2D frame; uniform sampler2D core;
void main() {
  vec3 c = texture2D(frame, uv).rgb;
  float solid = texture2D(core, uv).r;
  float light = max(c.r, max(c.g, c.b));
  float a = max(solid, light * sqrt(light));
  vec3 rgb = a > 0.0 ? mix(c / max(a, 0.001), c, solid) : c;
  gl_FragColor = vec4(min(rgb, 1.0) * a, a);
}`;

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = src;
  });
}

interface Painter {
  paint: (source: TexImageSource) => void;
  dispose: () => void;
}

function glPainter(canvas: HTMLCanvasElement, core: HTMLImageElement): Painter | null {
  const gl = canvas.getContext('webgl', { premultipliedAlpha: true, alpha: true, antialias: false });
  if (!gl) return null;
  const shader = (type: number, src: string) => {
    const s = gl.createShader(type)!;
    gl.shaderSource(s, src);
    gl.compileShader(s);
    return s;
  };
  const prog = gl.createProgram()!;
  gl.attachShader(prog, shader(gl.VERTEX_SHADER, VERT));
  gl.attachShader(prog, shader(gl.FRAGMENT_SHADER, FRAG));
  gl.linkProgram(prog);
  if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) return null;
  gl.useProgram(prog);
  const buf = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, buf);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
  const loc = gl.getAttribLocation(prog, 'p');
  gl.enableVertexAttribArray(loc);
  gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
  const texture = (unit: number, name: string) => {
    const t = gl.createTexture()!;
    gl.activeTexture(gl.TEXTURE0 + unit);
    gl.bindTexture(gl.TEXTURE_2D, t);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.uniform1i(gl.getUniformLocation(prog, name), unit);
    return t;
  };
  const frameTex = texture(0, 'frame');
  texture(1, 'core');
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGB, gl.RGB, gl.UNSIGNED_BYTE, core);
  return {
    paint(source) {
      gl.viewport(0, 0, canvas.width, canvas.height);
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, frameTex);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGB, gl.RGB, gl.UNSIGNED_BYTE, source);
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    },
    dispose() {
      gl.getExtension('WEBGL_lose_context')?.loseContext();
    },
  };
}

function canvasPainter(canvas: HTMLCanvasElement, core: HTMLImageElement): Painter {
  const out = canvas.getContext('2d')!;
  const work = document.createElement('canvas');
  work.width = work.height = canvas.width;
  const g = work.getContext('2d', { willReadFrequently: true })!;
  g.drawImage(core, 0, 0, work.width, work.height);
  const coreData = g.getImageData(0, 0, work.width, work.height).data;
  return {
    paint(source) {
      g.drawImage(source as CanvasImageSource, 0, 0, work.width, work.height);
      const frame = g.getImageData(0, 0, work.width, work.height);
      const d = frame.data;
      for (let i = 0; i < d.length; i += 4) {
        const solid = coreData[i] / 255;
        const light = Math.max(d[i], d[i + 1], d[i + 2]) / 255;
        const a = Math.max(solid, light * Math.sqrt(light));
        if (a > 0 && solid < 1) {
          const k = (1 - solid) / a + solid;
          d[i] = Math.min(255, d[i] * k);
          d[i + 1] = Math.min(255, d[i + 1] * k);
          d[i + 2] = Math.min(255, d[i + 2] * k);
        }
        d[i + 3] = Math.round(a * 255);
      }
      out.putImageData(frame, 0, 0);
    },
    dispose() {},
  };
}

export function Logo({ size }: { size: number }) {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = ref.current!;
    const px = Math.min(SOURCE, Math.round(size * Math.min(window.devicePixelRatio || 1, 3)));
    canvas.width = canvas.height = px;
    let stopped = false;
    let painter: Painter | null = null;
    let video: HTMLVideoElement | null = null;
    let observer: IntersectionObserver | null = null;

    loadImage('./brand/logo-core.png').then(async (core) => {
      if (stopped) return;
      painter = glPainter(canvas, core) ?? canvasPainter(canvas, core);
      if (reduceMotion) {
        painter.paint(await loadImage('./brand/logo-poster.jpg'));
        return;
      }
      const v = (video = document.createElement('video'));
      v.muted = true;
      v.loop = true;
      v.playsInline = true;
      v.preload = 'auto';
      v.src = v.canPlayType('video/webm; codecs="vp9"') ? './brand/logo.webm' : './brand/logo.mp4';
      let visible = true;
      observer = new IntersectionObserver(([e]) => {
        visible = e.isIntersecting;
        if (visible) v.play().catch(() => undefined);
        else v.pause();
      });
      observer.observe(canvas);
      const tick = () => {
        if (stopped) return;
        if (visible && v.readyState >= 2) painter!.paint(v);
        if ('requestVideoFrameCallback' in v) v.requestVideoFrameCallback(tick);
        else requestAnimationFrame(tick);
      };
      // Show the still frame immediately so nothing pops in while the clip loads.
      loadImage('./brand/logo-poster.jpg').then((p) => !stopped && v.readyState < 2 && painter!.paint(p));
      v.play().catch(() => undefined);
      tick();
    });

    return () => {
      stopped = true;
      observer?.disconnect();
      if (video) {
        video.pause();
        video.removeAttribute('src');
        video.load();
      }
      painter?.dispose();
    };
  }, [size]);

  return <canvas ref={ref} className="logo" style={{ width: size, height: size }} aria-hidden="true" />;
}

export function Wordmark() {
  return <span className="wordmark">Suit Up</span>;
}
