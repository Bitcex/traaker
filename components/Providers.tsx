"use client";

import "@rainbow-me/rainbowkit/styles.css";

import { darkTheme, getDefaultConfig, RainbowKitProvider } from "@rainbow-me/rainbowkit";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createContext, useContext, useEffect, useState } from "react";
import { createConfig, http, WagmiProvider } from "wagmi";
import { polygon } from "wagmi/chains";
import { injected } from "wagmi/connectors";

const walletConnectProjectId = process.env.NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID?.trim();

const config = walletConnectProjectId
  ? getDefaultConfig({
      appName: "Traak Sports Terminal",
      projectId: walletConnectProjectId,
      chains: [polygon],
      ssr: true,
    })
  : createConfig({
      chains: [polygon],
      connectors: [injected()],
      ssr: true,
      transports: {
        [polygon.id]: http(),
      },
  });

type TraakTheme = "dark" | "light";

type ThemeContextValue = {
  theme: TraakTheme;
  setTheme: (theme: TraakTheme) => void;
  toggleTheme: () => void;
};

const ThemeContext = createContext<ThemeContextValue | null>(null);
const DARK_THEME_CONTEXT: ThemeContextValue = {
  theme: "dark",
  setTheme: () => {},
  toggleTheme: () => {},
};

export function useTraakTheme() {
  const context = useContext(ThemeContext);
  return context ?? DARK_THEME_CONTEXT;
}

export function Providers({ children }: { children: React.ReactNode }) {
  const [queryClient] = useState(() => new QueryClient());

  useEffect(() => {
    if (typeof window === "undefined") return;
    document.documentElement.dataset.theme = "dark";
    window.localStorage.removeItem("traak-theme");
  }, []);

  return (
    <WagmiProvider config={config}>
      <QueryClientProvider client={queryClient}>
        <ThemeContext.Provider value={DARK_THEME_CONTEXT}>
          <RainbowKitProvider
            modalSize="compact"
            theme={darkTheme({
              accentColor: "#22d3ee",
              accentColorForeground: "#020617",
              borderRadius: "small",
              fontStack: "system",
            })}
          >
            {children}
          </RainbowKitProvider>
        </ThemeContext.Provider>
      </QueryClientProvider>
    </WagmiProvider>
  );
}
