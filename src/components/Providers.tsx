'use client'

import { RainbowKitProvider, darkTheme } from '@rainbow-me/rainbowkit'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { useState, type ReactNode } from 'react'
import { WagmiProvider } from 'wagmi'
import { wagmiConfig } from '@/lib/wagmi'
import '@rainbow-me/rainbowkit/styles.css'

export function Providers({ children }: { children: ReactNode }) {
  // One client per mount, so a fast refresh does not discard the cache.
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            // Chain reads go stale quickly; a launch can graduate in seconds.
            staleTime: 5_000,
            retry: 2,
          },
        },
      }),
  )

  return (
    <WagmiProvider config={wagmiConfig}>
      <QueryClientProvider client={queryClient}>
        <RainbowKitProvider
          // The site is dark in every OS theme, so the wallet modal is too.
          theme={darkTheme({
            accentColor: '#19d98f',
            accentColorForeground: '#00150c',
            borderRadius: 'large',
            overlayBlur: 'small',
          })}
          appInfo={{ appName: 'Berrypad' }}
        >
          {children}
        </RainbowKitProvider>
      </QueryClientProvider>
    </WagmiProvider>
  )
}
