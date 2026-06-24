import { cn } from "@/lib/utils";
import type { ReactNode } from "react";

type Tone = "error" | "success" | "info";

const tones: Record<Tone, string> = {
  error: "bg-red-50 text-red-800 ring-red-200",
  success: "bg-sage-soft text-forest ring-sage",
  info: "bg-sage-soft text-forest ring-sage",
};

export default function Alert({
  tone = "info",
  children,
  className,
}: {
  tone?: Tone;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      role={tone === "error" ? "alert" : "status"}
      className={cn(
        "rounded-xl px-4 py-3 text-sm ring-1 ring-inset",
        tones[tone],
        className,
      )}
    >
      {children}
    </div>
  );
}
