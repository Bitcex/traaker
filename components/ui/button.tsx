import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 rounded-xl text-sm font-medium transition-[background,border-color,color,box-shadow,transform] duration-200 disabled:pointer-events-none disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400/70 active:translate-y-px",
  {
    variants: {
      variant: {
        default: "border border-cyan-300/30 bg-[linear-gradient(180deg,rgba(22,163,184,0.88),rgba(8,145,178,0.92))] text-[var(--accent-foreground)] shadow-[0_16px_36px_rgba(8,145,178,0.24)] hover:border-cyan-200/45 hover:brightness-105",
        secondary: "border border-white/6 bg-[linear-gradient(180deg,rgba(19,29,48,0.96),rgba(10,16,30,0.96))] text-[var(--foreground)] shadow-[0_12px_28px_rgba(2,6,23,0.24)] hover:border-white/10 hover:bg-[linear-gradient(180deg,rgba(23,34,54,0.98),rgba(12,18,34,0.98))]",
        outline: "border border-[var(--border)] bg-white/[0.02] text-[var(--foreground)] shadow-[inset_0_1px_0_rgba(255,255,255,0.03)] hover:border-cyan-300/28 hover:bg-white/[0.045]",
        ghost: "text-[var(--muted)] hover:bg-[var(--surface-3)] hover:text-[var(--foreground)]",
        danger: "border border-rose-400/30 bg-[linear-gradient(180deg,rgba(244,63,94,0.92),rgba(225,29,72,0.9))] text-white shadow-[0_16px_36px_rgba(225,29,72,0.22)] hover:border-rose-300/45 hover:brightness-105",
      },
      size: {
        default: "h-11 px-4 py-2.5",
        sm: "h-9 px-3.5 text-xs",
        icon: "h-10 w-10",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  },
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {}

export function Button({ className, variant, size, ...props }: ButtonProps) {
  return <button className={cn(buttonVariants({ variant, size, className }))} {...props} />;
}

export { buttonVariants };
