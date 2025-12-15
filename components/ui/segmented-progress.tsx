"use client"

import * as React from "react"
import { cn } from "@/lib/utils"

interface SegmentedProgressProps extends React.HTMLAttributes<HTMLDivElement> {
  /** Total number of segments */
  total: number
  /** Number of segments to mark as completed (from the start) */
  completed: number
}

function SegmentedProgress({
  total,
  completed,
  className,
  ...props
}: SegmentedProgressProps) {
  // Ensure completed doesn't exceed total
  const filledCount = Math.min(Math.max(0, completed), total)

  return (
    <div
      data-slot="segmented-progress"
      className={cn("flex w-full gap-1", className)}
      {...props}
    >
      {Array.from({ length: total }, (_, i) => (
        <div
          key={i}
          data-slot="segment"
          data-filled={i < filledCount}
          className={cn(
            "h-2 flex-1 rounded transition-colors",
            i < filledCount ? "bg-primary" : "bg-primary/20"
          )}
        />
      ))}
    </div>
  )
}

export { SegmentedProgress }
