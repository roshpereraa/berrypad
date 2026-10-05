'use client'

import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { useWallet } from '@solana/wallet-adapter-react'
import { useWalletModal } from '@solana/wallet-adapter-react-ui'
import { explorerAccount } from '@/lib/sol/config'
import { shortAddress } from '@/lib/sol/format'

/** Connect button, then an account menu once a wallet is connected. */
export function ConnectWallet() {
  const { publicKey, wallet, disconnect, connecting } = useWallet()
  const { setVisible } = useWalletModal()
  const [open, setOpen] = useState(false)
  const [copied, setCopied] = useState(false)
  const menu = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const close = (e: MouseEvent) => {
      if (!menu.current?.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', close)
    return () => document.removeEventListener('mousedown', close)
  }, [open])

  if (!publicKey) {
    return (
      <button onClick={() => setVisible(true)} type="button" className="btn-primary h-9 whitespace-nowrap px-4 text-sm">
        {connecting ? 'Connecting…' : (
          <>
            Connect<span className="hidden sm:inline">&nbsp;wallet</span>
          </>
        )}
      </button>
    )
  }

  const address = publicKey.toBase58()
  return (
    <div className="relative" ref={menu}>
      <button
        onClick={() => setOpen((o) => !o)}
        type="button"
        className="btn-ghost flex h-9 items-center gap-2 px-3 text-sm"
        aria-expanded={open}
      >
        {wallet?.adapter.icon ? <img src={wallet.adapter.icon} alt="" className="h-4 w-4 rounded" /> : null}
        <span className="num">{shortAddress(address)}</span>
      </button>
      {open ? (
        <div className="menu absolute right-0 top-11 z-40 w-56 p-1.5">
          <button
            className="menu-item"
            onClick={async () => {
              try {
                await navigator.clipboard.writeText(address)
                setCopied(true)
                setTimeout(() => setCopied(false), 1200)
              } catch {
                /* still selectable below */
              }
            }}
          >
            {copied ? 'Copied' : 'Copy address'}
          </button>
          <a
            className="menu-item"
            href={explorerAccount(address)}
            target="_blank"
            rel="noopener noreferrer"
            onClick={() => setOpen(false)}
          >
            View on Solscan ↗
          </a>
          <Link className="menu-item" href="/fees" onClick={() => setOpen(false)}>
            Creator fees
          </Link>
          <button className="menu-item" onClick={() => { setOpen(false); setVisible(true) }}>
            Change wallet
          </button>
          <button className="menu-item text-[var(--down)]" onClick={() => { setOpen(false); void disconnect() }}>
            Disconnect
          </button>
        </div>
      ) : null}
    </div>
  )
}
