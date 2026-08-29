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

// 2026-08-29 legibility pass (BOARD.tsv item 10): the 3 rows previously shared one
// uniform indigo icon color on the same dark shell, which is exactly the "monotone"
// complaint. Each row now gets its own semantic `dot` tone (indigo/green/amber) so the
// pill's own background wash + icon color differ per row, not just the label text.
const PROPS: {
  label: string;
  clause: string;
  icon: ComponentType<{ size?: number; strokeWidth?: number; className?: string }>;
  dot: "active" | "resolved" | "awaiting";
  iconColor: string;
}[] = [
  {
    label: "Investigates, not just alerts",
    clause: "real logs, deploys, and live vendor status — not a guess",
    icon: Search,
    dot: "active",
    iconColor: "text-accent",
  },
  {
    label: "Evidence per claim",
    clause: "every claim shows the literal excerpt it came from",
    icon: Quote,
    dot: "resolved",
    iconColor: "text-status-resolved",
  },
  {
    label: "Human approves, always",
    clause: "nothing executes until a person signs off",
    icon: UserCheck,
    dot: "awaiting",
    iconColor: "text-status-awaiting",
  },
];

export function ValueProps() {
  return (
    <ul className="flex flex-col gap-3">
      {PROPS.map((p) => (
        <li key={p.label} className="flex flex-col gap-1 sm:flex-row sm:items-baseline sm:gap-2.5">
          <Pill dot={p.dot} icon={<p.icon {...ICON_PROPS} className={p.iconColor} />} className="w-fit shrink-0">
            <span className="font-semibold text-foreground">{p.label}</span>
          </Pill>
          <span className="text-sm text-muted">{p.clause}</span>
        </li>
      ))}
    </ul>
  );
}
