/**
 * The Suit Up mark and wordmark.
 *
 * The logo clip is on black, and browsers do not agree on a transparent video
 * format, so each frame is cut out here: the metal emblem (logo-core.png marks
 * where it is) stays opaque, and everything else becomes light whose opacity is
 * its brightness. The black disappears and the glow lies over whatever is behind.
 */
import { useEffect, useRef } from 'react';

const SIZE = 288;
const reduceMotion = typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;

let corePromise: Promise<Uint8ClampedArray> | null = null;
function loadCore(): Promise<Uint8ClampedArray> {
  corePromise ??= new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const c = document.createElement('canvas');
      c.width = c.height = SIZE;
      const g = c.getContext('2d', { willReadFrequently: true })!;
      g.drawImage(img, 0, 0, SIZE, SIZE);
      const d = g.getImageData(0, 0, SIZE, SIZE).data;
      const alpha = new Uint8ClampedArray(SIZE * SIZE);
      for (let i = 0; i < alpha.length; i++) alpha[i] = d[i * 4];
      resolve(alpha);
    };
    img.onerror = reject;
    img.src = './brand/logo-core.png';
  });
  return corePromise;
}

function cutOut(frame: ImageData, core: Uint8ClampedArray): void {
  const d = frame.data;
  for (let i = 0, p = 0; p < core.length; i += 4, p++) {
    const r = d[i], g = d[i + 1], b = d[i + 2];
    const light = Math.max(r, g, b) / 255;
    // Faint glow fades faster than bright glow, so its outer edge dissolves instead of drawing a rim.
    const a = Math.max(core[p], Math.round(255 * light * Math.sqrt(light)));
    if (a === 0) {
      d[i + 3] = 0;
      continue;
    }
    if (a > core[p]) {
      // Un-premultiply so the glow keeps its colour once it is see-through.
      const k = 255 / a;
      d[i] = Math.min(255, r * k);
      d[i + 1] = Math.min(255, g * k);
      d[i + 2] = Math.min(255, b * k);
    }
    d[i + 3] = a;
  }
}

export function Logo({ size }: { size: number }) {
  const canvas = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const out = canvas.current!.getContext('2d', { willReadFrequently: true })!;
    const work = document.createElement('canvas');
    work.width = work.height = SIZE;
    const g = work.getContext('2d', { willReadFrequently: true })!;
    let stopped = false;
    let visible = true;
    let core: Uint8ClampedArray | null = null;

    const paint = (source: CanvasImageSource) => {
      if (!core) return;
      g.clearRect(0, 0, SIZE, SIZE);
      g.drawImage(source, 0, 0, SIZE, SIZE);
      const frame = g.getImageData(0, 0, SIZE, SIZE);
      cutOut(frame, core);
      out.putImageData(frame, 0, 0);
    };

    if (reduceMotion) {
      const still = new Image();
      still.onload = () => loadCore().then((c) => ((core = c), paint(still)));
      still.src = './brand/logo-poster.png';
      return () => void (stopped = true);
    }

    const video = document.createElement('video');
    video.muted = true;
    video.loop = true;
    video.playsInline = true;
    video.preload = 'auto';
    video.src = video.canPlayType('video/webm; codecs="vp9"') ? './brand/logo.webm' : './brand/logo.mp4';
    const observer = new IntersectionObserver(([e]) => {
      visible = e.isIntersecting;
      if (visible) video.play().catch(() => undefined);
      else video.pause();
    });
    observer.observe(canvas.current!);

    const tick = () => {
      if (stopped) return;
      if (visible && video.readyState >= 2) paint(video);
      if ('requestVideoFrameCallback' in video) video.requestVideoFrameCallback(tick);
      else requestAnimationFrame(tick);
    };
    loadCore().then((c) => {
      core = c;
      video.play().catch(() => undefined);
      tick();
    });
    return () => {
      stopped = true;
      observer.disconnect();
      video.pause();
      video.removeAttribute('src');
      video.load();
    };
  }, []);

  return <canvas ref={canvas} className="logo" width={SIZE} height={SIZE} style={{ width: size, height: size }} aria-hidden="true" />;
}

export function Wordmark() {
  return <span className="wordmark">Suit Up</span>;
}
