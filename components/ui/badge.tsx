import * as React from "react";
import { cn } from "@/lib/utils";

type BadgeTone = "default" | "cyan" | "green" | "amber" | "rose" | "slate";

const tones: Record<BadgeTone, string> = {
  default: "border-slate-700/70 bg-slate-900/80 text-slate-200",
  cyan: "border-cyan-400/25 bg-cyan-400/10 text-cyan-100",
  green: "border-emerald-400/25 bg-emerald-400/10 text-emerald-100",
  amber: "border-amber-400/25 bg-amber-400/10 text-amber-100",
  rose: "border-rose-400/25 bg-rose-400/10 text-rose-100",
  slate: "border-slate-700/70 bg-slate-900/70 text-slate-300",
};

export function Badge({
  className,
  tone = "default",
  ...props
}: React.HTMLAttributes<HTMLSpanElement> & { tone?: BadgeTone }) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-xl border px-2.5 py-1 text-xs font-semibold shadow-[inset_0_1px_0_rgba(255,255,255,0.03)]",
        tones[tone],
        className,
      )}
      {...props}
    />
  );
}
