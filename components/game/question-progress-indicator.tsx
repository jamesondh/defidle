"use client"

import { SegmentedProgress } from "@/components/ui/segmented-progress"
import { Badge } from "@/components/ui/badge"
import { cn } from "@/lib/utils"
import type { DifficultyTarget } from "@/lib/types/episode"

const difficultyStyles: Record<DifficultyTarget, string> = {
  easy: "bg-green-500/20 text-green-700 dark:text-green-400 border-green-500/30",
  medium: "bg-yellow-500/20 text-yellow-700 dark:text-yellow-400 border-yellow-500/30",
  hard: "bg-red-500/20 text-red-700 dark:text-red-400 border-red-500/30",
}

interface QuestionProgressIndicatorProps {
  /** Total number of questions */
  total: number
  /** Current question number (1-based for display, but internally 0-based for progress) */
  current: number
  /** Difficulty of the current question (optional - label row hidden if not provided) */
  difficulty?: DifficultyTarget
  /** Additional className for the container */
  className?: string
}

export function QuestionProgressIndicator({
  total,
  current,
  difficulty,
  className,
}: QuestionProgressIndicatorProps) {
  return (
    <div className={cn("space-y-2", className)}>
      <SegmentedProgress total={total} completed={current} className="h-2" />
      {difficulty && (
        <div className="flex items-center justify-center gap-1.5 text-sm text-muted-foreground">
          <span>Question {current} of {total}</span>
          <span>&middot;</span>
          <Badge
            variant="outline"
            className={cn("capitalize", difficultyStyles[difficulty])}
          >
            {difficulty}
          </Badge>
        </div>
      )}
    </div>
  )
}
