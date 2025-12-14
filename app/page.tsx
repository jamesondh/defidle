"use client"

import { useSyncExternalStore } from "react"
import { GamePage } from "@/components/game/game-page"
import { getTodayDateUtc } from "@/lib/client/episode"

// Use useSyncExternalStore to get today's date client-side only
// This avoids hydration mismatch since server returns null
function useClientDate(): string | null {
  return useSyncExternalStore(
    // Subscribe function (no-op since date doesn't change during session)
    () => () => {},
    // Client snapshot
    () => getTodayDateUtc(),
    // Server snapshot (null to avoid hydration mismatch)
    () => null
  )
}

export default function Home() {
  const date = useClientDate()

  // Show nothing until date is calculated client-side
  // GamePage will show its own loading state immediately after
  if (!date) {
    return null
  }

  return <GamePage date={date} />
}
