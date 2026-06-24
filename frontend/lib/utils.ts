/** Tiny classnames joiner. */
export function cn(...parts: Array<string | false | null | undefined>): string {
  return parts.filter(Boolean).join(" ");
}

/** Format an ISO date string as e.g. "Jun 24, 2026, 2:13 PM". */
export function formatDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

export function fullName(lead: { first_name: string; last_name: string }): string {
  return `${lead.first_name} ${lead.last_name}`.trim();
}
