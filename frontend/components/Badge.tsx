import { cn } from "@/lib/utils";
import type { LeadState } from "@/lib/types";

// Mirrors Alma's status pills: a soft peach "in progress" chip and a solid
// forest-green "done" chip.
const styles: Record<LeadState, { label: string; className: string; dot: string }> = {
  PENDING: {
    label: "Pending",
    className: "bg-pending text-pending-ink",
    dot: "bg-pending-ink",
  },
  REACHED_OUT: {
    label: "Reached out",
    className: "bg-forest text-white",
    dot: "bg-sage",
  },
};

export default function Badge({ state }: { state: LeadState }) {
  const s = styles[state];
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-semibold",
        s.className,
      )}
    >
      <span className={cn("h-1.5 w-1.5 rounded-full", s.dot)} aria-hidden />
      {s.label}
    </span>
  );
}
