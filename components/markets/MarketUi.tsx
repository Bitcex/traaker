"use client";

import { useState, type ReactNode } from "react";
import Image from "next/image";
import { CheckCircle2 } from "lucide-react";

type TagPillTone = "cyan" | "emerald" | "slate";

export function TagPill({
  children,
  icon,
  tone = "slate",
}: {
  children: ReactNode;
  icon?: ReactNode;
  tone?: TagPillTone;
}) {
  const toneClass =
    tone === "cyan"
      ? "border-cyan-400/25 bg-cyan-400/12 text-cyan-100 shadow-[0_0_18px_rgba(34,211,238,0.08)]"
      : tone === "emerald"
        ? "border-emerald-400/25 bg-emerald-400/10 text-emerald-200 shadow-[0_0_18px_rgba(52,211,153,0.08)]"
        : "border-slate-700/70 bg-slate-900/60 text-slate-200";

  return (
    <span className={`inline-flex min-w-0 items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-bold ${toneClass}`}>
      {icon ? <span className="shrink-0 leading-none">{icon}</span> : null}
      <span className="truncate">{children}</span>
    </span>
  );
}

export function MarketPanelHeader({
  category,
  categoryIcon,
  status,
  timestamp,
  title,
  subtitle,
  actions,
}: {
  category?: string;
  categoryIcon?: ReactNode;
  status: string;
  timestamp: string;
  title: string;
  subtitle?: string;
  actions: ReactNode;
}) {
  return (
    <div className="sticky top-0 z-20 flex items-start justify-between gap-3 border-b border-slate-800/85 bg-[#070a12]/96 px-4 py-5 shadow-[0_10px_24px_rgba(0,0,0,0.16)] backdrop-blur-2xl sm:px-5">
      <div className="min-w-0 flex-1 overflow-hidden">
        <div className="flex min-w-0 flex-wrap items-center gap-2">
          {category ? (
            <TagPill tone="cyan" icon={categoryIcon}>
              {category}
            </TagPill>
          ) : null}
          <TagPill
            tone="emerald"
            icon={<span className="block h-1.5 w-1.5 rounded-full bg-emerald-300 shadow-[0_0_10px_rgba(52,211,153,0.95)]" />}
          >
            {status}
          </TagPill>
          <span className="min-w-0 truncate text-xs font-medium text-slate-500">{timestamp}</span>
        </div>
        <h2 className="mt-4 line-clamp-3 max-w-full overflow-hidden break-words text-[1.65rem] font-semibold leading-[1.08] text-slate-50 [overflow-wrap:anywhere] sm:line-clamp-2 sm:text-[1.9rem]">
          {title}
        </h2>
        {subtitle ? <p className="mt-2 truncate text-[0.95rem] font-medium text-slate-400">{subtitle}</p> : null}
      </div>
      <div className="flex shrink-0 items-center gap-1">{actions}</div>
    </div>
  );
}

export function OutcomeCard({
  name,
  price,
  logoUrl,
  teamDisplayName,
  fallbackIcon,
  fallbackIconSrc,
  selected,
  onClick,
}: {
  name: string;
  price: string;
  logoUrl?: string;
  teamDisplayName?: string;
  fallbackIcon?: string;
  fallbackIconSrc?: string;
  selected: boolean;
  onClick: () => void;
}) {
  const testId = `outcome-logo-${name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "option"}`;
  const [failedLogoUrls, setFailedLogoUrls] = useState<string[]>([]);
  const displayLogoUrl = logoUrl && !failedLogoUrls.includes(logoUrl) ? logoUrl : undefined;
  const logoIsExternal = displayLogoUrl ? /^https?:\/\//i.test(displayLogoUrl) : false;

  return (
    <button
      className={`grid min-h-[72px] w-full grid-cols-[2.75rem_minmax(0,1fr)_auto] items-center gap-3 rounded-xl border px-3.5 py-3.5 text-left transition duration-200 ${
        selected
          ? "border-cyan-300/75 bg-cyan-300/12 text-white shadow-[0_0_24px_rgba(34,211,238,0.12),inset_0_1px_0_rgba(255,255,255,0.06)]"
          : "border-slate-800/90 bg-slate-950/48 text-slate-200 hover:border-slate-700 hover:bg-slate-900/72"
      }`}
      onClick={onClick}
      type="button"
    >
      <span className="grid h-11 w-11 shrink-0 place-items-center overflow-hidden rounded-full border border-slate-700/70 bg-slate-950/80 shadow-inner shadow-black/30">
        {displayLogoUrl && logoIsExternal ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            data-testid={testId}
            data-logo-url={displayLogoUrl}
            src={displayLogoUrl}
            alt=""
            width={32}
            height={32}
            className="h-[34px] w-[34px] object-contain"
            loading="lazy"
            decoding="async"
            onError={() => setFailedLogoUrls((current) => (current.includes(displayLogoUrl) ? current : [...current, displayLogoUrl]))}
          />
        ) : displayLogoUrl ? (
          <Image
            data-testid={testId}
            data-logo-url={displayLogoUrl}
            src={displayLogoUrl}
            alt=""
            width={32}
            height={32}
            className="h-[34px] w-[34px] object-contain"
            onError={() => setFailedLogoUrls((current) => (current.includes(displayLogoUrl) ? current : [...current, displayLogoUrl]))}
          />
        ) : fallbackIconSrc ? (
          <Image data-testid={testId} data-logo-url={fallbackIconSrc} src={fallbackIconSrc} alt="" width={28} height={28} className="h-7 w-7 object-contain opacity-85" />
        ) : (
          <span data-testid={testId} className="text-base leading-none text-slate-300">
            {fallbackIcon || (teamDisplayName ?? name).slice(0, 1).toUpperCase()}
          </span>
        )}
      </span>
      <span className="min-w-0 overflow-hidden self-center">
        <span className="line-clamp-2 break-words text-[1rem] font-semibold leading-snug [overflow-wrap:anywhere]">{teamDisplayName || name}</span>
      </span>
      <span className="flex min-w-[4.5rem] shrink-0 flex-col items-end justify-center gap-0.5 pl-2 text-right tabular-nums">
        <span className="text-[0.68rem] font-semibold uppercase tracking-[0.16em] text-slate-500">{selected ? "Selected" : "Price"}</span>
        <span className={`flex items-center gap-1 text-lg font-black ${selected ? "text-cyan-100" : "text-slate-50"}`}>
          {price}
          {selected ? <CheckCircle2 className="h-4 w-4 text-cyan-300" /> : null}
        </span>
      </span>
    </button>
  );
}

export function EstimateRow({ label, value, accent = false }: { label: string; value: string; accent?: boolean }) {
  return (
    <div className="flex items-center justify-between gap-4 px-4 py-3.5">
      <span className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">{label}</span>
      <span className={`shrink-0 text-sm font-bold tabular-nums ${accent ? "text-emerald-300" : "text-slate-50"}`}>{value}</span>
    </div>
  );
}
