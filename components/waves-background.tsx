"use client";

// The one signature brand moment (2026-08-29 corrections: "no visual brand" -> "less
// gradient" -> this) — an animated WebGL1 "Waves" shader (21st.dev Shader Builder),
// mounted fixed behind all page content. Plain WebGL1, no libraries, single fullscreen
// triangle. Uniform names/packing and the fragment shader body below are copied
// verbatim from the exact source the user supplied — do not rewrite/"improve" it.
//
// Deliberately layered BEHIND everything (`-z-10`, `pointer-events-none`) and at low
// canvas opacity so it never competes with foreground text/contrast — per the explicit
// "make sure it doesn't compete with the text and foreground" constraint. Replaces
// components/grain-background.tsx: this shader's own grain param (u_finish.w) already
// covers that texture, so keeping both mounted would double up the grain effect.

import { useEffect, useRef } from "react";

const VERTEX_SHADER_SOURCE = `
attribute vec2 a_position;
void main() {
  gl_Position = vec4(a_position, 0.0, 1.0);
}
`;

// Verbatim "Waves" fragment shader — do not edit the body, only the JS uniform values
// below (which are themselves copied verbatim from the shader's own header comment).
const FRAGMENT_SHADER_SOURCE = `
// "Waves" — made with the 21st.dev Shader Builder
// Packed WebGL1 uniforms (the shader exposes readable u_* aliases as macros):
//   u_colors[8] (first 4 used)
//   vec3(0.102, 0.078, 0.137)
//   vec3(0.718, 0.365, 0.412)
//   vec3(0.918, 0.804, 0.761)
//   vec3(1.000, 0.961, 0.922)
//   u_scene = vec4(canvas width, canvas height, seconds * -0.67, 4.0)
//   u_shape = vec4(1.32, 0.49, 0.84, 0.01)
//   u_surface = vec4(1.73, 1.08, 0.07, 2.00)
//   u_finish = vec4(2.27, 0.00, 0.040, 0.35)
//   u_transform = vec4(4984.0, 3.37, 0.40, 1.0)
//   u_space = vec4(-0.13, 0.05, pointer x, pointer y)
//   u_cursor = vec4(presence, 3.0, 0.54, 0.56)

#ifdef GL_FRAGMENT_PRECISION_HIGH
precision highp float;
#else
precision mediump float;
#endif

uniform vec3 u_colors[8];
uniform vec4 u_scene;      // resolution.xy, time, colour count
uniform vec4 u_shape;      // scale, intensity, paramA, warp
uniform vec4 u_surface;    // detail, contrast, brightness, saturation
uniform vec4 u_finish;     // hue, vignette, blur, grain
uniform vec4 u_transform;  // seed, rotation, drift, OKLab toggle
uniform vec4 u_space;      // offset.xy, pointer.xy
uniform vec4 u_cursor;

#define u_resolution u_scene.xy
#define u_time u_scene.z
#define u_colorCount u_scene.w
#define u_scale u_shape.x
#define u_intensity u_shape.y
#define u_paramA u_shape.z
#define u_warp u_shape.w
#define u_detail u_surface.x
#define u_contrast u_surface.y
#define u_brightness u_surface.z
#define u_saturation u_surface.w
#define u_hue u_finish.x
#define u_vignette u_finish.y
#define u_blur u_finish.z
#define u_grain u_finish.w
#ifdef GL_FRAGMENT_PRECISION_HIGH
#define u_seed u_transform.x
#else
#define u_seed mod(u_transform.x, 31.0)
#endif
#define u_rotate u_transform.y
#define u_drift u_transform.z
#define u_oklab u_transform.w
#define u_offset u_space.xy
#define u_mouse u_space.zw
#define u_cursorPresence u_cursor.x
#define u_cursorEffect u_cursor.y
#define u_cursorStrength u_cursor.z
#define u_cursorRadius u_cursor.w

float hash21(vec2 p) {
#ifndef GL_FRAGMENT_PRECISION_HIGH
  p = mod(p, 31.0);
#endif
  p = fract(p * vec2(234.34, 435.345));
  p += dot(p, p + 34.23);
  return fract(p.x * p.y);
}

float grainHash(vec2 p) {
  vec3 p3 = fract(vec3(p.xyx) * 0.1031);
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.x + p3.y) * p3.z);
}

vec2 hash22(vec2 p) {
#ifndef GL_FRAGMENT_PRECISION_HIGH
  p = mod(p, 31.0);
#endif
  float n = sin(dot(p, vec2(41.0, 289.0)));
  return fract(vec2(15731.743, 7892.321) * n);
}

float noise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(
    mix(hash21(i), hash21(i + vec2(1.0, 0.0)), u.x),
    mix(hash21(i + vec2(0.0, 1.0)), hash21(i + vec2(1.0, 1.0)), u.x),
    u.y);
}

float fbm(vec2 p) {
  float v = 0.0;
  float a = 0.5;
  for (int i = 0; i < 5; i++) {
    v += a * noise(p);
    p = p * 2.03 + vec2(17.0, 9.2);
    a *= 0.5;
  }
  return v;
}

vec3 srgbToLinear(vec3 c) {
  return mix(c / 12.92, pow((c + 0.055) / 1.055, vec3(2.4)),
    step(0.04045, c));
}
vec3 linearToSrgb(vec3 c) {
  return mix(c * 12.92, 1.055 * pow(max(c, vec3(0.0)), vec3(1.0 / 2.4)) - 0.055,
    step(0.0031308, c));
}
vec3 linToOklab(vec3 c) {
  float l = 0.4122214708 * c.r + 0.5363325363 * c.g + 0.0514459929 * c.b;
  float m = 0.2119034982 * c.r + 0.6806995451 * c.g + 0.1073969566 * c.b;
  float s = 0.0883024619 * c.r + 0.2817188376 * c.g + 0.6299787005 * c.b;
  l = pow(max(l, 0.0), 1.0 / 3.0);
  m = pow(max(m, 0.0), 1.0 / 3.0);
  s = pow(max(s, 0.0), 1.0 / 3.0);
  return vec3(
    0.2104542553 * l + 0.7936177850 * m - 0.0040720468 * s,
    1.9779984951 * l - 2.4285922050 * m + 0.4505937099 * s,
    0.0259040371 * l + 0.7827717662 * m - 0.8086757660 * s);
}
vec3 oklabToLin(vec3 c) {
  float l = c.x + 0.3963377774 * c.y + 0.2158037573 * c.z;
  float m = c.x - 0.1055613458 * c.y - 0.0638541728 * c.z;
  float s = c.x - 0.0894841775 * c.y - 1.2914855480 * c.z;
  l = l * l * l; m = m * m * m; s = s * s * s;
  return vec3(
    4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
    -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
    -0.0041960863 * l - 0.7034186147 * m + 1.7076147010 * s);
}
vec3 mixColour(vec3 a, vec3 b, float t) {
  if (u_oklab > 0.5) {
    vec3 la = linToOklab(srgbToLinear(a));
    vec3 lb = linToOklab(srgbToLinear(b));
    return clamp(linearToSrgb(oklabToLin(mix(la, lb, t))), 0.0, 1.0);
  }
  return mix(a, b, t);
}

vec3 palette(float x) {
  float n = max(u_colorCount - 1.0, 1.0);
  float f = clamp(x, 0.0, 1.0) * n;
  vec3 col = u_colors[0];
  for (int i = 0; i < 7; i++) {
    if (float(i) < n)
      col = mixColour(col, u_colors[i + 1],
        smoothstep(0.0, 1.0, clamp(f - float(i), 0.0, 1.0)));
  }
  return col;
}

vec3 hueRotate(vec3 col, float a) {
  const mat3 toYIQ = mat3(0.299, 0.596, 0.211,
                          0.587, -0.274, -0.523,
                          0.114, -0.322, 0.312);
  const mat3 toRGB = mat3(1.0, 1.0, 1.0,
                          0.956, -0.272, -1.106,
                          0.621, -0.647, 1.703);
  vec3 yiq = toYIQ * col;
  float ca = cos(a), sa = sin(a);
  yiq = vec3(yiq.x, yiq.y * ca - yiq.z * sa, yiq.y * sa + yiq.z * ca);
  return toRGB * yiq;
}

vec3 shade(vec2 uv, vec2 p, float t) {
  float y = uv.y
    + sin(uv.x * (3.0 + u_intensity * 9.0) + t * 0.8) * 0.08
    + (fbm(p * 2.0 + t * 0.1) - 0.5) * u_intensity * 0.6;
  return palette(y);
}

void main() {
  vec2 uv = gl_FragCoord.xy / u_resolution.xy;
  vec2 screenUv = uv;
  vec2 p = (gl_FragCoord.xy - 0.5 * u_resolution.xy)
    / min(u_resolution.x, u_resolution.y);
  float cursorMask = 0.0;

  if (u_cursorPresence > 0.001) {
    vec2 cursor = (0.5 * u_mouse * u_resolution.xy)
      / min(u_resolution.x, u_resolution.y);
    vec2 cursorDelta = p - cursor;
    if (u_cursorEffect < 0.5) {
      p += cursor * u_cursorPresence * u_cursorStrength * 0.55;
    } else {
      float cursorDistance = length(cursorDelta);
      vec2 cursorDirection = cursorDelta / max(cursorDistance, 0.0001);
      cursorMask = u_cursorPresence
        * (1.0 - smoothstep(0.0, u_cursorRadius, cursorDistance));
      if (u_cursorEffect < 1.5) {
        p -= cursorDirection * cursorMask * u_cursorStrength * 0.24;
      } else if (u_cursorEffect < 2.5) {
        float cursorAngle = cursorMask * u_cursorStrength * 2.2;
        float cc = cos(cursorAngle), cs = sin(cursorAngle);
        p = cursor + mat2(cc, -cs, cs, cc) * cursorDelta;
      } else if (u_cursorEffect < 3.5) {
        float ripple = sin(
          cursorDistance / max(u_cursorRadius, 0.001) * 18.0 - u_time * 5.0);
        p -= cursorDirection * ripple * cursorMask * u_cursorStrength * 0.07;
      }
    }
  }

  uv = p * min(u_resolution.x, u_resolution.y) / u_resolution.xy + 0.5;
  p *= u_scale;
  if (abs(u_rotate) > 0.0001) {
    float cr = cos(u_rotate), sr = sin(u_rotate);
    p = mat2(cr, -sr, sr, cr) * p;
  }
  p += u_offset;
  if (u_drift > 0.0001)
    p += u_drift * vec2(sin(u_time * 0.31), cos(u_time * 0.23));
  if (u_warp > 0.0) {
    p += u_warp * (vec2(
      fbm(p * u_detail + u_seed),
      fbm(p * u_detail + vec2(5.2, 1.3))) - 0.5);
  }
  vec3 col;
  if (u_blur > 0.0) {
    float e = u_blur;
    float pe = e * u_scale;
    vec2 uvE = vec2(e) * min(u_resolution.x, u_resolution.y) / u_resolution.xy;
    col  = shade(uv, p, u_time) * 0.36;
    col += shade(uv + vec2(uvE.x, 0.0), p + vec2(pe, 0.0), u_time) * 0.16;
    col += shade(uv - vec2(uvE.x, 0.0), p - vec2(pe, 0.0), u_time) * 0.16;
    col += shade(uv + vec2(0.0, uvE.y), p + vec2(0.0, pe), u_time) * 0.16;
    col += shade(uv - vec2(0.0, uvE.y), p - vec2(0.0, pe), u_time) * 0.16;
  } else {
    col = shade(uv, p, u_time);
  }
  if (abs(u_contrast - 1.0) > 0.0001)
    col = (col - 0.5) * u_contrast + 0.5;
  if (abs(u_saturation - 1.0) > 0.0001) {
    float luma = dot(col, vec3(0.299, 0.587, 0.114));
    col = mix(vec3(luma), col, u_saturation);
  }
  if (abs(u_hue) > 0.0001)
    col = hueRotate(col, u_hue);
  if (abs(u_brightness) > 0.0001)
    col += u_brightness;
  if (u_vignette > 0.0001) {
    float vd = length(screenUv - 0.5) * 1.41421356;
    col *= 1.0 - u_vignette * smoothstep(0.35, 1.0, vd);
  }
  if (u_cursorPresence > 0.001 && u_cursorEffect > 3.5)
    col += (vec3(0.18) + col * 0.12) * cursorMask * u_cursorStrength;
  if (u_grain > 0.0001)
    col += (grainHash(
      gl_FragCoord.xy + vec2(u_seed * 17.0, u_seed * 31.0)) - 0.5) * u_grain;
  gl_FragColor = vec4(clamp(col, 0.0, 1.0), 1.0);
}
`;

const MAX_DPR = 2;

// Exact packed uniform values, copied verbatim from the shader's own header comment.
const COLORS = new Float32Array([
  0.102, 0.078, 0.137,
  0.718, 0.365, 0.412,
  0.918, 0.804, 0.761,
  1.0, 0.961, 0.922,
  0, 0, 0,
  0, 0, 0,
  0, 0, 0,
  0, 0, 0,
]);
const SHAPE = [1.32, 0.49, 0.84, 0.01] as const; // scale, intensity, paramA, warp
const SURFACE = [1.73, 1.08, 0.07, 2.0] as const; // detail, contrast, brightness, saturation
const FINISH = [2.27, 0.0, 0.04, 0.35] as const; // hue, vignette, blur, grain
const TRANSFORM = [4984.0, 3.37, 0.4, 1.0] as const; // seed, rotate, drift, oklab
const OFFSET = [-0.13, 0.05] as const; // u_space.xy
const CURSOR = [0.0, 3.0, 0.54, 0.56] as const; // presence off, effect, strength, radius

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
    gl.deleteShader(shader);
    return null;
  }
  return shader;
}

export function WavesBackground() {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const gl = canvas.getContext("webgl", {
      alpha: true,
      antialias: false,
      depth: false,
      stencil: false,
      preserveDrawingBuffer: false,
    });
    if (!gl) return; // no WebGL — background just doesn't render, nothing else depends on it

    const vertexShader = compileShader(gl, gl.VERTEX_SHADER, VERTEX_SHADER_SOURCE);
    const fragmentShader = compileShader(gl, gl.FRAGMENT_SHADER, FRAGMENT_SHADER_SOURCE);
    if (!vertexShader || !fragmentShader) return;

    const program = gl.createProgram();
    if (!program) return;
    gl.attachShader(program, vertexShader);
    gl.attachShader(program, fragmentShader);
    gl.linkProgram(program);
    gl.deleteShader(vertexShader);
    gl.deleteShader(fragmentShader);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
      gl.deleteProgram(program);
      return;
    }
    gl.useProgram(program);

    const positionBuffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, positionBuffer);
    // Single fullscreen triangle (overshoots the viewport), not two triangles.
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
    const positionLocation = gl.getAttribLocation(program, "a_position");
    gl.enableVertexAttribArray(positionLocation);
    gl.vertexAttribPointer(positionLocation, 2, gl.FLOAT, false, 0, 0);

    const u_colors = gl.getUniformLocation(program, "u_colors");
    const u_scene = gl.getUniformLocation(program, "u_scene");
    const u_shape = gl.getUniformLocation(program, "u_shape");
    const u_surface = gl.getUniformLocation(program, "u_surface");
    const u_finish = gl.getUniformLocation(program, "u_finish");
    const u_transform = gl.getUniformLocation(program, "u_transform");
    const u_space = gl.getUniformLocation(program, "u_space");
    const u_cursor = gl.getUniformLocation(program, "u_cursor");

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
    }
    resize();

    let resizeTimer: ReturnType<typeof setTimeout> | null = null;
    function onWindowResize() {
      if (resizeTimer) clearTimeout(resizeTimer);
      resizeTimer = setTimeout(resize, 120);
    }
    window.addEventListener("resize", onWindowResize);

    const start = performance.now();
    let rafId = 0;
    const reducedMotion = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

    function draw() {
      const t = (performance.now() - start) / 1000;
      gl!.uniform3fv(u_colors, COLORS);
      gl!.uniform4f(u_scene, width, height, t * -0.67, 4.0);
      gl!.uniform4f(u_shape, SHAPE[0], SHAPE[1], SHAPE[2], SHAPE[3]);
      gl!.uniform4f(u_surface, SURFACE[0], SURFACE[1], SURFACE[2], SURFACE[3]);
      gl!.uniform4f(u_finish, FINISH[0], FINISH[1], FINISH[2], FINISH[3]);
      gl!.uniform4f(u_transform, TRANSFORM[0], TRANSFORM[1], TRANSFORM[2], TRANSFORM[3]);
      gl!.uniform4f(u_space, OFFSET[0], OFFSET[1], 0.0, 0.0);
      gl!.uniform4f(u_cursor, CURSOR[0], CURSOR[1], CURSOR[2], CURSOR[3]);
      gl!.drawArrays(gl!.TRIANGLES, 0, 3);
    }

    function frame() {
      draw();
      if (!reducedMotion) rafId = requestAnimationFrame(frame);
    }

    function onVisibilityChange() {
      if (document.hidden) {
        if (rafId) cancelAnimationFrame(rafId);
        rafId = 0;
      } else if (!rafId && !reducedMotion) {
        rafId = requestAnimationFrame(frame);
      }
    }
    document.addEventListener("visibilitychange", onVisibilityChange);

    if (reducedMotion) {
      draw(); // one static frame, no loop
    } else if (!document.hidden) {
      rafId = requestAnimationFrame(frame);
    }

    return () => {
      if (rafId) cancelAnimationFrame(rafId);
      window.removeEventListener("resize", onWindowResize);
      document.removeEventListener("visibilitychange", onVisibilityChange);
      if (resizeTimer) clearTimeout(resizeTimer);
      gl.deleteBuffer(positionBuffer);
      gl.deleteProgram(program);
      const loseContext = gl.getExtension("WEBGL_lose_context");
      loseContext?.loseContext();
    };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      aria-hidden="true"
      className="pointer-events-none fixed inset-0 -z-10 h-full w-full opacity-[0.035]"
    />
  );
}
