import type { ComponentType } from "react";
import { Search, Quote, UserCheck, ChevronRight } from "lucide-react";
import { Pill } from "@/components/ui/pill";

// Item 21 rewrite (real user feedback): the previous 3 abstract chips ("Investigates, not
// just alerts" / "Evidence per claim" / "Human approves, always") didn't let a 10-second skim
// answer 4 concrete questions — what does this actually check, how does Bright Data specifically
// factor in, how is this different from a dashboard full of logs, and who is it for. Restructured
// as a "how it works" 3-step flow instead of flat/abstract value props: each step names the
// concrete mechanism (logs + diff + a live Bright Data check -> one checked fact instead of a
// guess -> one claim to approve, correlated for you instead of raw data you interpret yourself),
// so the sequence itself carries the differentiation, not just adjective-y labels. "Who it's
// for" moved to the eyebrow chip in app/page.tsx since it's an identity statement, not a step.

const ICON_PROPS = { size: 13, strokeWidth: 1.8 } as const;

const STEPS: {
  label: string;
  clause: string;
  icon: ComponentType<{ size?: number; strokeWidth?: number; className?: string }>;
  dot: "active" | "resolved" | "awaiting";
  iconColor: string;
}[] = [
  {
    label: "Checks 3 sources, every time",
    clause: "your logs, the code/deploy diff, and a live Bright Data check of the vendor",
    icon: Search,
    dot: "active",
    iconColor: "text-accent",
  },
  {
    label: `Turns "is it us or them" into a fact`,
    clause: "a real, live-scraped excerpt cited as evidence — not an assumption",
    icon: Quote,
    dot: "resolved",
    iconColor: "text-status-resolved",
  },
  {
    label: "One claim, yours to approve",
    clause: "correlated across all three for you — not a dashboard you interpret yourself",
    icon: UserCheck,
    dot: "awaiting",
    iconColor: "text-status-awaiting",
  },
];

export function ValueProps() {
  return (
    <ol className="flex flex-col gap-4 sm:flex-row sm:items-start sm:gap-3">
      {STEPS.map((s, i) => (
        <li key={s.label} className="flex flex-1 items-start gap-3">
          <div className="flex flex-1 flex-col gap-1.5">
            <Pill dot={s.dot} icon={<s.icon {...ICON_PROPS} className={s.iconColor} />} className="w-fit">
              <span className="font-semibold text-foreground">{s.label}</span>
            </Pill>
            <span className="text-sm text-muted">{s.clause}</span>
          </div>
          {i < STEPS.length - 1 && (
            <ChevronRight className="mt-1.5 hidden h-4 w-4 shrink-0 text-muted/40 sm:block" />
          )}
        </li>
      ))}
    </ol>
  );
}
