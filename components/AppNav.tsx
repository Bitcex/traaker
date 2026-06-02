"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { WalletConnectButton } from "@/components/WalletConnectButton";

function navLinkClass(active: boolean) {
  return [
    "relative px-1 py-2 text-base font-semibold tracking-[-0.01em] transition duration-200",
    active ? "text-[var(--foreground)]" : "text-[var(--muted)] hover:text-[var(--foreground)]",
    "after:absolute after:inset-x-0 after:-bottom-[18px] after:h-0.5 after:rounded-full after:bg-cyan-300 after:shadow-[0_0_16px_rgba(34,211,238,0.9)] after:transition after:duration-200",
    active ? "after:opacity-100" : "after:opacity-0 hover:after:opacity-50",
  ].join(" ");
}

export function AppNav() {
  const pathname = usePathname();
  const portfolioActive = pathname.startsWith("/portfolio");
  const marketsActive = !portfolioActive;

  return (
    <header className="traak-shell-nav sticky top-0 z-40 border-b border-white/6 bg-[linear-gradient(180deg,rgba(5,10,20,0.96),rgba(5,10,20,0.88))] shadow-[0_18px_44px_rgba(0,0,0,0.34)] backdrop-blur-2xl">
      <div className="mx-auto flex w-full max-w-[118rem] items-center justify-between gap-4 px-5 py-4 sm:px-7 lg:px-10">
        <div className="flex min-w-0 items-center gap-8">
          <Link href="/" className="flex shrink-0 items-center gap-3 text-2xl font-bold tracking-tight text-[var(--foreground)]" aria-label="Traak home">
            <Image
              src="/traak-original-logo.jpg"
              alt=""
              width={40}
              height={40}
              priority
              className="h-11 w-11 rounded-full border border-white/10 bg-white object-contain shadow-[0_10px_26px_rgba(37,99,235,0.22)]"
            />
            <span>Traak</span>
          </Link>
          <nav className="hidden items-center gap-8 md:flex" aria-label="Primary navigation">
            <Link className={navLinkClass(marketsActive)} href="/">
              Markets
            </Link>
            <Link className={navLinkClass(portfolioActive)} href="/portfolio">
              Portfolio
            </Link>
          </nav>
        </div>
        <div className="flex items-center gap-2">
          <WalletConnectButton />
        </div>
      </div>
    </header>
  );
}
