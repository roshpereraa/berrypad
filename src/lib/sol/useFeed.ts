'use client'

import { useSyncExternalStore } from 'react'
import { feedVersion, getFeed, subscribeFeed, type FeedState } from './feed'

/** The live pump.fun feed as React state, repainting at most a few times a second. */
export function useFeed(): FeedState {
  useSyncExternalStore(subscribeFeed, feedVersion, () => 0)
  return getFeed()
}
