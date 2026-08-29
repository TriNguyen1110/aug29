"use client";

// Film-grain background — a live, animated WebGL1 canvas, not a static tiled
// image. This is the grain half of the "Waves" shader spec (the exact
// grainHash function below is copied verbatim from it) with every bit of the
// wave/color/OKLab logic stripped out — we only want the grain, not the
// shader. A fresh random seed every frame makes it flicker like real film
// grain instead of a fixed print pattern, and one canvas spanning the full
// viewport is inherently seamless (there's no tile to seam at).
//
// Mounted once, fixed, full-viewport, in the root layout — every page
// (marketing + product) gets it. Positioning/opacity/blend-mode live in the
// .grain-overlay CSS class (app/globals.css); this component only owns pixels.

import { useEffect, useRef } from "react";

const VERTEX_SHADER_SOURCE = `
attribute vec2 a_position;
void main() {
  gl_Position = vec4(a_position, 0.0, 1.0);
}
`;

// grainHash copied verbatim from the "Waves" shader spec (Dave Hoskins hash12
// — even, unstructured white noise; the cheaper multiply-hash it replaced
// showed a faint axis-aligned mesh on flat areas).
const FRAGMENT_SHADER_SOURCE = `
precision mediump float;
uniform vec2 u_resolution;
uniform float u_seed;

float grainHash(vec2 p) {
  vec3 p3 = fract(vec3(p.xyx) * 0.1031);
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.x + p3.y) * p3.z);
}

void main() {
  float g = grainHash(gl_FragCoord.xy + vec2(u_seed * 17.0, u_seed * 31.0));
  gl_FragColor = vec4(vec3(g), 1.0);
}
`;

const MAX_DPR = 2;
const RESIZE_DEBOUNCE_MS = 120;
// Frame rate the grain re-randomizes at — full 60fps flicker reads as TV
// static, not film grain. ~12/sec lands in the "old film" range.
const REGEN_INTERVAL_MS = 1000 / 12;

function compileShader(
  gl: WebGLRenderingContext,
  type: number,
  source: string,
): WebGLShader | null {
  const shader = gl.createShader(type);
  if (!shader) return null;
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    // Purely decorative overlay — some headless/software-GL environments (CI,
    // screenshot tooling) fail to compile here; degrade silently rather than
    // spamming console.error for a cosmetic effect (deviates from willder's
    // original, which logs loudly since it's core to willder's brand there).
    gl.deleteShader(shader);
    return null;
  }
  return shader;
}

function createProgram(
  gl: WebGLRenderingContext,
  vertexSource: string,
  fragmentSource: string,
): WebGLProgram | null {
  const vertexShader = compileShader(gl, gl.VERTEX_SHADER, vertexSource);
  const fragmentShader = compileShader(gl, gl.FRAGMENT_SHADER, fragmentSource);
  if (!vertexShader || !fragmentShader) return null;

  const program = gl.createProgram();
  if (!program) return null;
  gl.attachShader(program, vertexShader);
  gl.attachShader(program, fragmentShader);
  gl.linkProgram(program);
  gl.deleteShader(vertexShader);
  gl.deleteShader(fragmentShader);

  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    gl.deleteProgram(program);
    return null;
  }
  return program;
}

/**
 * Fullscreen animated film-grain canvas rendered with plain WebGL1 (no
 * libraries — a single shader program on a fullscreen triangle). Purely
 * decorative: `aria-hidden` + `pointer-events-none`, styled via the
 * `.grain-overlay` class (fixed, full-viewport, mix-blend-mode: overlay).
 */
export function GrainBackground() {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const gl = canvas.getContext("webgl", {
      alpha: false,
      antialias: false,
      depth: false,
      stencil: false,
      preserveDrawingBuffer: false,
    });
    if (!gl) {
      // No WebGL in this environment — skip the effect silently, it's cosmetic.
      return;
    }

    const program = createProgram(gl, VERTEX_SHADER_SOURCE, FRAGMENT_SHADER_SOURCE);
    if (!program) return;

    const positionBuffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, positionBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);

    const positionLocation = gl.getAttribLocation(program, "a_position");
    gl.enableVertexAttribArray(positionLocation);
    gl.vertexAttribPointer(positionLocation, 2, gl.FLOAT, false, 0, 0);

    const uniforms = {
      resolution: gl.getUniformLocation(program, "u_resolution"),
      seed: gl.getUniformLocation(program, "u_seed"),
    };

    gl.useProgram(program);

    let width = 0;
    let height = 0;

    function resize() {
      if (!canvas) return;
      const dpr = Math.min(window.devicePixelRatio || 1, MAX_DPR);
      const displayWidth = Math.max(1, Math.round(canvas.clientWidth * dpr));
      const displayHeight = Math.max(1, Math.round(canvas.clientHeight * dpr));
      if (displayWidth === width && displayHeight === height) return;
      width = displayWidth;
      height = displayHeight;
      canvas.width = width;
      canvas.height = height;
      gl!.viewport(0, 0, width, height);
      gl!.uniform2f(uniforms.resolution, width, height);
    }
    resize();

    let resizeTimer: ReturnType<typeof setTimeout> | null = null;
    function onWindowResize() {
      if (resizeTimer) clearTimeout(resizeTimer);
      resizeTimer = setTimeout(resize, RESIZE_DEBOUNCE_MS);
    }
    window.addEventListener("resize", onWindowResize);

    let rafId = 0;
    let lastRegen = 0;
    const reducedMotion = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

    function frame(now: number) {
      if (now - lastRegen >= REGEN_INTERVAL_MS) {
        lastRegen = now;
        gl!.uniform1f(uniforms.seed, Math.random() * 1000.0);
        gl!.drawArrays(gl!.TRIANGLES, 0, 3);
      }
      if (!reducedMotion) rafId = requestAnimationFrame(frame);
    }

    function start() {
      if (rafId) return;
      if (reducedMotion) {
        frame(performance.now()); // draw one static frame, no loop
        return;
      }
      rafId = requestAnimationFrame(frame);
    }
    function stop() {
      if (!rafId) return;
      cancelAnimationFrame(rafId);
      rafId = 0;
    }

    function onVisibilityChange() {
      if (document.hidden) stop();
      else start();
    }
    document.addEventListener("visibilitychange", onVisibilityChange);

    start();

    return () => {
      stop();
      window.removeEventListener("resize", onWindowResize);
      document.removeEventListener("visibilitychange", onVisibilityChange);
      if (resizeTimer) clearTimeout(resizeTimer);
      gl.deleteBuffer(positionBuffer);
      gl.deleteProgram(program);
      const loseContext = gl.getExtension("WEBGL_lose_context");
      loseContext?.loseContext();
    };
  }, []);

  return <canvas ref={canvasRef} aria-hidden="true" className="grain-overlay h-full w-full" />;
}
