import type { ComponentType } from "react";
import { Search, Quote, UserCheck } from "lucide-react";
import { Pill } from "@/components/ui/pill";

// Above-the-fold value props (mid-task correction): the list page's single paragraph read
// as too vague — replaced with 3 scannable chip rows, bold label + one clause each, so it
// reads in ~5 seconds instead of requiring a paragraph read. Still the list page, not a
// separate marketing surface — sits directly under the title, above the trigger UI.
// 2026-08-29 pass: icon replaces the plain color dot (real user feedback re: icons + terse
// copy), clauses trimmed to the part not already implied by the label.

const ICON_PROPS = { size: 13, strokeWidth: 1.8 } as const;

const PROPS: { label: string; clause: string; icon: ComponentType<{ size?: number; strokeWidth?: number; className?: string }> }[] = [
  {
    label: "Investigates, not just alerts",
    clause: "real logs, deploys, and live vendor status — not a guess",
    icon: Search,
  },
  {
    label: "Evidence per claim",
    clause: "every claim shows the literal excerpt it came from",
    icon: Quote,
  },
  {
    label: "Human approves, always",
    clause: "nothing executes until a person signs off",
    icon: UserCheck,
  },
];

export function ValueProps() {
  return (
    <ul className="flex flex-col gap-3">
      {PROPS.map((p) => (
        <li key={p.label} className="flex flex-col gap-1 sm:flex-row sm:items-baseline sm:gap-2.5">
          <Pill icon={<p.icon {...ICON_PROPS} className="text-accent" />} className="w-fit shrink-0">
            <span className="font-semibold text-foreground">{p.label}</span>
          </Pill>
          <span className="text-sm text-muted">{p.clause}</span>
        </li>
      ))}
    </ul>
  );
}
