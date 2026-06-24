import { cn } from "@/lib/utils";
import type { LeadState } from "@/lib/types";

const styles: Record<LeadState, { label: string; className: string }> = {
  PENDING: {
    label: "Pending",
    className: "bg-amber-50 text-amber-700 ring-amber-200",
  },
  REACHED_OUT: {
    label: "Reached out",
    className: "bg-emerald-50 text-emerald-700 ring-emerald-200",
  },
};

export default function Badge({ state }: { state: LeadState }) {
  const s = styles[state];
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium ring-1 ring-inset",
        s.className,
      )}
    >
      <span className="h-1.5 w-1.5 rounded-full bg-current" aria-hidden />
      {s.label}
    </span>
  );
}
