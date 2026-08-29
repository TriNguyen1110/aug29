"use client";

// Item 15 (BOARD.tsv) — fills the previously-dead empty side margins on the list page at
// wide viewports with the user-supplied "Mesh drift" shader (components/mesh-drift-background.tsx),
// without adding a third full-bleed background competing with the existing WavesBackground
// (app/layout.tsx, opacity 0.06) + header grid backdrop (item 14).
//
// Design choices, documented per the dispatch note's "your call, document the reasoning":
//  - ONE canvas, not two. A single fixed full-viewport canvas is masked transparent under the
//    centered max-w-3xl content column and opaque only in the gutters, instead of mounting two
//    separate <MeshDriftBackground> instances (one per side) — that would mean a 3rd WebGL
//    context alongside Waves' 2nd, real GPU cost for no visual benefit over one shared canvas.
//  - The mask uses fixed percentage stops (not a dynamic calc() tied to the exact px content
//    width) — approximate alignment with the content column is enough for a decorative fill
//    that only needs to fade out before it reaches text, and avoids calc() edge cases at
//    viewport widths near/below the content's own max-width.
//  - Only mounted at >=1280px (checked via matchMedia, not CSS display:none) so the component
//    never even creates the second WebGL context on narrower viewports, where the "dead
//    gutter" problem this fixes doesn't exist in the first place — real GPU/battery cost
//    avoided outright rather than just hidden.
//  - Respects prefers-reduced-motion the same way WavesBackground does: skip mounting.
//  - Very low opacity (0.05, extra-faint vs. Waves' own 0.06 since it's a secondary/gutter-only
//    accent, not the primary background) so it never competes with foreground text, per the
//    same bar every visual addition in this build has been held to.
//  - Item 17 (BOARD.tsv): the center used to mask to fully `transparent` (0 opacity) under the
//    content column. Changed to a low-but-nonzero alpha so a faint hint of the animation bleeds
//    through the middle too, instead of a hard opaque cutout — still well below the gutter's own
//    already-faint 0.05 canvas opacity, so text contrast is unaffected.
//  - Left unmounted entirely on the incident detail page (item 13, concurrent frontend work) —
//    this item's note scopes the fix to "the list page."

import { useEffect, useState } from "react";
import { MeshDriftBackground } from "@/components/mesh-drift-background";

const WIDE_QUERY = "(min-width: 1280px)";
const REDUCED_MOTION_QUERY = "(prefers-reduced-motion: reduce)";

export function SideGutters() {
  const [enabled, setEnabled] = useState(false);

  useEffect(() => {
    const wideMq = window.matchMedia(WIDE_QUERY);
    const motionMq = window.matchMedia(REDUCED_MOTION_QUERY);
    const update = () => setEnabled(wideMq.matches && !motionMq.matches);
    update();
    wideMq.addEventListener("change", update);
    motionMq.addEventListener("change", update);
    return () => {
      wideMq.removeEventListener("change", update);
      motionMq.removeEventListener("change", update);
    };
  }, []);

  if (!enabled) return null;

  return (
    <div
      aria-hidden="true"
      className="pointer-events-none fixed inset-0 -z-10 opacity-[0.09]"
      style={{
        maskImage:
          "linear-gradient(to right, black 0%, black 15%, rgba(0,0,0,0.35) 32%, rgba(0,0,0,0.35) 68%, black 85%, black 100%)",
        WebkitMaskImage:
          "linear-gradient(to right, black 0%, black 15%, rgba(0,0,0,0.35) 32%, rgba(0,0,0,0.35) 68%, black 85%, black 100%)",
      }}
    >
      <MeshDriftBackground className="h-full w-full" />
    </div>
  );
}
