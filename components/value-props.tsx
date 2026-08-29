import { Pill } from "@/components/ui/pill";

// Above-the-fold value props (mid-task correction): the list page's single paragraph read
// as too vague — replaced with 3 scannable chip rows, bold label + one clause each, so it
// reads in ~5 seconds instead of requiring a paragraph read. Still the list page, not a
// separate marketing surface — sits directly under the title, above the trigger UI.

const PROPS: { label: string; clause: string; dot: "active" | "resolved" | "awaiting" }[] = [
  {
    label: "Investigates, not just alerts",
    clause: "pulls real logs, recent deploys, and live external signals (e.g. is a vendor down)",
    dot: "active",
  },
  {
    label: "Evidence per claim",
    clause: "every root-cause claim shows the literal excerpt it came from, not just a conclusion to trust",
    dot: "resolved",
  },
  {
    label: "Human approves, always",
    clause: "nothing executes (rollback, restart, flag toggle) until a person signs off",
    dot: "awaiting",
  },
];

export function ValueProps() {
  return (
    <ul className="flex flex-col gap-2.5">
      {PROPS.map((p) => (
        <li key={p.label} className="flex flex-col gap-1 sm:flex-row sm:items-baseline sm:gap-2.5">
          <Pill dot={p.dot} className="w-fit shrink-0">
            <span className="font-semibold text-foreground">{p.label}</span>
          </Pill>
          <span className="text-sm text-muted">{p.clause}</span>
        </li>
      ))}
    </ul>
  );
}
