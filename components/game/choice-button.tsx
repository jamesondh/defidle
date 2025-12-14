"use client"

import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"

export type ChoiceState = "default" | "selected" | "correct" | "incorrect"

interface ChoiceButtonProps {
  choice: string
  index: number
  state: ChoiceState
  disabled?: boolean
  onClick: () => void
}

export function ChoiceButton({
  choice,
  index,
  state,
  disabled,
  onClick,
}: ChoiceButtonProps) {
  const labels = ["A", "B", "C", "D", "E", "F"]
  const label = labels[index] ?? String(index + 1)

  return (
    <Button
      variant="outline"
      className={cn(
        "h-auto w-full justify-start gap-3 px-4 py-3 text-left font-normal",
        state === "selected" && "border-primary bg-primary/5",
        state === "correct" &&
          "border-green-500 bg-green-500/10 text-green-700 dark:text-green-400",
        state === "incorrect" &&
          "border-red-500 bg-red-500/10 text-red-700 dark:text-red-400"
      )}
      disabled={disabled}
      onClick={onClick}
    >
      <span
        className={cn(
          "flex size-6 shrink-0 items-center justify-center rounded-full border text-xs font-medium",
          state === "default" && "border-muted-foreground/30 bg-muted",
          state === "selected" && "border-primary bg-primary text-primary-foreground",
          state === "correct" && "border-green-500 bg-green-500 text-white",
          state === "incorrect" && "border-red-500 bg-red-500 text-white"
        )}
      >
        {label}
      </span>
      <span className="flex-1">{choice}</span>
    </Button>
  )
}
