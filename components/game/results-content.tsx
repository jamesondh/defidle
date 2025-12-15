"use client"

import { Badge } from "@/components/ui/badge"
import { SegmentedProgress } from "@/components/ui/segmented-progress"
import { cn } from "@/lib/utils"
import type { PlayerAnswer } from "@/lib/client/game-state"
import type { DifficultyTarget, Question, Topic } from "@/lib/types/episode"
import { CheckCircle2, XCircle } from "lucide-react"

const difficultyStyles: Record<DifficultyTarget, string> = {
  easy: "bg-green-500/20 text-green-700 dark:text-green-400 border-green-500/30",
  medium: "bg-yellow-500/20 text-yellow-700 dark:text-yellow-400 border-yellow-500/30",
  hard: "bg-red-500/20 text-red-700 dark:text-red-400 border-red-500/30",
}

interface ResultsContentProps {
  correctCount: number
  totalQuestions: number
  topic: Topic
  answers: PlayerAnswer[]
  questions: Question[]
}

export function ResultsContent({
  correctCount,
  totalQuestions,
  topic,
  answers,
  questions,
}: ResultsContentProps) {
  const percentage = Math.round((correctCount / totalQuestions) * 100)

  const getMessage = () => {
    if (percentage === 100) return "True Degen!"
    if (percentage >= 80) return "Based"
    if (percentage >= 60) return "Mid-Curve"
    if (percentage >= 40) return "NGMI"
    return "1) What"
  }

  return (
    <div className="space-y-6">
      <div className="text-center">
        <h2 className="text-2xl font-semibold">{getMessage()}</h2>
        <p className="text-muted-foreground">
          Today&apos;s topic: <span className="font-medium text-foreground">{topic.name}</span>
        </p>
      </div>

      <div className="text-center">
        <div className="text-5xl font-bold">
          {correctCount}/{totalQuestions}
        </div>
        <p className="mt-1 text-sm text-muted-foreground">correct answers</p>
      </div>

      <SegmentedProgress total={totalQuestions} completed={correctCount} className="h-3" />

      <div className="space-y-2">
        {questions.map((question) => {
          const answer = answers.find(a => a.qid === question.qid)
          const isCorrect = answer?.isCorrect ?? false
          const correctAnswer = question.choices?.[question.answerIndex ?? 0] ?? ""

          return (
            <div
              key={question.qid}
              className="flex items-start gap-3 rounded-lg border p-3"
            >
              <div className="mt-0.5 shrink-0">
                {isCorrect ? (
                  <CheckCircle2 className="size-5 text-green-500" />
                ) : (
                  <XCircle className="size-5 text-red-500" />
                )}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm leading-relaxed break-words">
                  {question.prompt}{" "}
                  <span className="font-bold">{correctAnswer}</span>
                </p>
              </div>
              <Badge
                variant="outline"
                className={cn("capitalize shrink-0 ml-2", difficultyStyles[question.difficulty])}
              >
                {question.difficulty}
              </Badge>
            </div>
          )
        })}
      </div>
    </div>
  )
}
