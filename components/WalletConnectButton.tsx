"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { ConnectButton } from "@rainbow-me/rainbowkit";
import { ChevronDown } from "lucide-react";
import { useDisconnect } from "wagmi";

function formatWalletAddress(address: string) {
  if (address.length <= 10) return address;
  return `${address.slice(0, 6)}...${address.slice(-4)}`;
}

export function WalletConnectButton() {
  const { disconnect } = useDisconnect();
  const [menuOpen, setMenuOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!menuOpen) return undefined;

    const handlePointerDown = (event: MouseEvent | TouchEvent) => {
      const target = event.target;
      if (!(target instanceof Node)) return;
      if (!containerRef.current?.contains(target)) {
        setMenuOpen(false);
      }
    };

    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setMenuOpen(false);
      }
    };

    window.addEventListener("mousedown", handlePointerDown);
    window.addEventListener("touchstart", handlePointerDown);
    window.addEventListener("keydown", handleEscape);
    return () => {
      window.removeEventListener("mousedown", handlePointerDown);
      window.removeEventListener("touchstart", handlePointerDown);
      window.removeEventListener("keydown", handleEscape);
    };
  }, [menuOpen]);

  return (
    <ConnectButton.Custom>
      {({ account, chain, openAccountModal, openChainModal, openConnectModal, mounted }) => {
        const ready = mounted;
        const connected = ready && account && chain;

        if (!connected) {
          return (
            <button
              className="traak-wallet-button inline-flex h-11 items-center gap-2 rounded-lg border border-cyan-300/35 bg-cyan-300/10 px-4 text-sm font-bold text-cyan-100 shadow-[0_0_22px_rgba(34,211,238,0.1)] transition hover:border-cyan-200/70 hover:bg-cyan-300/15"
              onClick={openConnectModal}
              type="button"
            >
              Connect
            </button>
          );
        }

        if (chain.unsupported) {
          return (
            <button
              className="traak-wallet-button inline-flex h-11 items-center gap-2 rounded-lg border border-amber-300/45 bg-amber-300/12 px-4 text-sm font-bold text-amber-100 transition hover:bg-amber-300/18"
              onClick={openChainModal}
              type="button"
            >
              Switch to Polygon
            </button>
          );
        }

        const walletAddress = typeof account.address === "string" ? account.address : account.displayName;

        return (
          <div className="relative" ref={containerRef}>
            <button
              className="traak-wallet-button inline-flex h-11 items-center gap-2 rounded-lg border border-[var(--border)] bg-[var(--surface)] px-4 text-sm font-bold text-[var(--foreground)] shadow-lg shadow-black/20 transition hover:border-cyan-300/40 hover:bg-[var(--surface-2)]"
              onClick={() => {
                if (typeof window !== "undefined" && window.innerWidth < 768) {
                  setMenuOpen((current) => !current);
                  return;
                }
                openAccountModal();
              }}
              type="button"
            >
              <span className="hidden h-1.5 w-1.5 rounded-full bg-emerald-300 shadow-[0_0_10px_rgba(52,211,153,0.95)] sm:block" />
              <span className="max-w-32 truncate">{account.displayName}</span>
              <ChevronDown className={`h-4 w-4 text-slate-400 transition md:rotate-0 ${menuOpen ? "rotate-180" : ""}`} />
            </button>

            {menuOpen ? (
              <div className="absolute right-0 top-[calc(100%+0.5rem)] z-50 w-[min(86vw,18rem)] overflow-hidden rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-2 shadow-[0_20px_70px_rgba(0,0,0,0.45)] md:hidden">
                <div className="rounded-xl border border-[var(--border)] bg-[var(--surface-2)] px-3 py-2.5">
                  <p className="text-[10px] uppercase tracking-[0.18em] text-[var(--muted)]">Wallet</p>
                  <p className="mt-1 truncate text-sm font-semibold text-[var(--foreground)]" title={walletAddress}>
                    {formatWalletAddress(walletAddress)}
                  </p>
                </div>
                <div className="mt-2 flex flex-col gap-1">
                  <Link
                    className="rounded-xl px-3 py-3 text-sm font-medium text-[var(--foreground)] transition hover:bg-[var(--surface-2)]"
                    href="/portfolio"
                    onClick={() => setMenuOpen(false)}
                  >
                    Portfolio
                  </Link>
                  <button
                    className="rounded-xl px-3 py-3 text-left text-sm font-medium text-[var(--foreground)] transition hover:bg-[var(--surface-2)]"
                    onClick={() => {
                      setMenuOpen(false);
                      openAccountModal();
                    }}
                    type="button"
                  >
                    Wallet address
                  </button>
                  <button
                    className="rounded-xl px-3 py-3 text-left text-sm font-medium text-rose-300 transition hover:bg-rose-500/10"
                    onClick={() => {
                      setMenuOpen(false);
                      disconnect();
                    }}
                    type="button"
                  >
                    Disconnect
                  </button>
                </div>
              </div>
            ) : null}
          </div>
        );
      }}
    </ConnectButton.Custom>
  );
}
