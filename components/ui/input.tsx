import * as React from "react";
import { cn } from "@/lib/utils";

export function Input({ className, ...props }: React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      className={cn(
        "h-11 w-full rounded-2xl border border-[var(--border)] bg-[linear-gradient(180deg,rgba(7,12,24,0.98),rgba(5,9,20,0.98))] px-4 py-2.5 text-sm text-[var(--foreground)] shadow-[inset_0_1px_0_rgba(255,255,255,0.03)] outline-none transition-[border-color,box-shadow,background] placeholder:text-[var(--muted)] focus:border-[var(--accent)] focus:ring-2 focus:ring-cyan-400/18",
        className,
      )}
      {...props}
    />
  );
}
