"use client"

import * as React from "react"
import { ReactNode } from "react"
import { useRouter } from "next/navigation"
import { CalendarIcon } from "lucide-react"
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from "@/components/ui/card"
import { QuestionProgressIndicator } from "@/components/game/question-progress-indicator"
import { Button } from "@/components/ui/button"
import type { DifficultyTarget } from "@/lib/types/episode"
import { Calendar } from "@/components/ui/calendar"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { getTodayDateUtc } from "@/lib/client/episode"
import Image from "next/image"

interface GameCardProps {
  /** Current question number (1-based), hidden if undefined */
  currentQuestion?: number
  /** Total number of questions */
  totalQuestions?: number
  /** Difficulty of current question (label hidden if undefined) */
  difficulty?: DifficultyTarget
  /** Main content area */
  children: ReactNode
  /** Footer content (buttons) */
  footer?: ReactNode
  /** Current date in YYYY-MM-DD format */
  date?: string
}

/** Format Date object to YYYY-MM-DD string using local time (for Calendar component dates) */
function formatLocalDateToString(date: Date): string {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, "0")
  const day = String(date.getDate()).padStart(2, "0")
  return `${year}-${month}-${day}`
}

/** Parse YYYY-MM-DD string to local Date object (for Calendar component) */
function parseDateString(dateStr: string): Date | undefined {
  const match = dateStr.match(/^(\d{4})-(\d{2})-(\d{2})$/)
  if (!match) return undefined
  // Create a local date so the Calendar highlights the correct day
  return new Date(parseInt(match[1]), parseInt(match[2]) - 1, parseInt(match[3]))
}

/** Format date for display (e.g., "Dec 15") */
function formatDateForDisplay(date: Date): string {
  return date.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
  })
}

function DatePicker({ date }: { date?: string }) {
  const router = useRouter()
  const [open, setOpen] = React.useState(false)

  const today = getTodayDateUtc()
  const currentDate = date || today
  const selectedDate = parseDateString(currentDate)

  const handleDateSelect = (newDate: Date | undefined) => {
    if (!newDate) return

    // Calendar gives us local dates, so use local formatter
    const dateString = formatLocalDateToString(newDate)
    setOpen(false)

    // Navigate to home if today, otherwise to specific date
    if (dateString === today) {
      router.push("/")
    } else {
      router.push(`/${dateString}`)
    }
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          size="sm"
          className="justify-between gap-2 font-normal"
        >
          <CalendarIcon className="size-4 text-muted-foreground" />
          {selectedDate ? formatDateForDisplay(selectedDate) : "Select date"}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-auto overflow-hidden p-0" align="end">
        <Calendar
          mode="single"
          selected={selectedDate}
          defaultMonth={selectedDate}
          onSelect={handleDateSelect}
          disabled={(date) => {
            // Disable future dates - compare as YYYY-MM-DD strings to avoid timezone issues
            // Calendar passes local dates, so we format using local methods
            const dateString = formatLocalDateToString(date)
            return dateString > today
          }}
          captionLayout="dropdown"
        />
      </PopoverContent>
    </Popover>
  )
}

export function GameCard({ currentQuestion, totalQuestions, difficulty, children, footer, date }: GameCardProps) {
  return (
    <Card>
      <CardHeader className="text-center">
        <div className="flex items-center justify-between">
          <div className="text-left">
            <div className="flex items-center gap-2">
              <Image src="/logo/logo-2.png" alt="DeFidle" width={32} height={32} />
              <CardTitle className="text-2xl font-bold tracking-tight">DeFidle</CardTitle>
            </div>
            <p className="mt-1 text-sm text-muted-foreground">Daily DeFi Quiz</p>
          </div>
          <DatePicker date={date} />
        </div>
      </CardHeader>

      {currentQuestion !== undefined && totalQuestions !== undefined && (
        <div className="px-6">
          <QuestionProgressIndicator
            total={totalQuestions}
            current={currentQuestion}
            difficulty={difficulty}
          />
        </div>
      )}

      <CardContent className="pt-0">
        {children}
      </CardContent>

      {footer && (
        <CardFooter className="flex-col gap-2">
          {footer}
        </CardFooter>
      )}
    </Card>
  )
}
