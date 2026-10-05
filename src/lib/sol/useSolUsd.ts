'use client'

import { useEffect, useState } from 'react'
import { solUsd } from './price'

/** SOL in dollars for display, refreshed every minute. Null until known. */
export function useSolUsd(): number | null {
  const [price, setPrice] = useState<number | null>(null)
  useEffect(() => {
    let alive = true
    const load = () => void solUsd().then((p) => alive && p && setPrice(p))
    load()
    const t = setInterval(load, 60_000)
    return () => {
      alive = false
      clearInterval(t)
    }
  }, [])
  return price
}
