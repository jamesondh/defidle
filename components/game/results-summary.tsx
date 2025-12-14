"use client"

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Progress } from "@/components/ui/progress"
import type { PlayerAnswer } from "@/lib/client/game-state"
import type { Question, Topic } from "@/lib/types/episode"
import { CheckCircle2, XCircle, RotateCcw } from "lucide-react"

interface ResultsSummaryProps {
  correctCount: number
  totalQuestions: number
  topic: Topic
  answers: PlayerAnswer[]
  questions: Question[]
  onPlayAgain?: () => void
}

export function ResultsSummary({
  correctCount,
  totalQuestions,
  topic,
  answers,
  questions,
  onPlayAgain,
}: ResultsSummaryProps) {
  const percentage = Math.round((correctCount / totalQuestions) * 100)

  const getMessage = () => {
    if (percentage === 100) return "True Degen!"
    if (percentage >= 80) return "Hell yeah!"
    if (percentage >= 60) return "Not terrible!"
    if (percentage >= 40) return "Womp womp!"
    return "Yikes!"
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader className="text-center">
          <CardTitle className="text-2xl">{getMessage()}</CardTitle>
          <p className="text-muted-foreground">
            Today&apos;s topic: <span className="font-medium text-foreground">{topic.name}</span>
          </p>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="text-center">
            <div className="text-5xl font-bold">
              {correctCount}/{totalQuestions}
            </div>
            <p className="mt-1 text-sm text-muted-foreground">correct answers</p>
          </div>

          <Progress value={percentage} className="h-3" />

          <div className="space-y-2">
            {questions.map((question, index) => {
              const answer = answers.find(a => a.qid === question.qid)
              const isCorrect = answer?.isCorrect ?? false

              return (
                <div
                  key={question.qid}
                  className="flex items-center justify-between rounded-lg border p-3"
                >
                  <div className="flex items-center gap-3">
                    {isCorrect ? (
                      <CheckCircle2 className="size-5 text-green-500" />
                    ) : (
                      <XCircle className="size-5 text-red-500" />
                    )}
                    <span className="text-sm">Question {index + 1}</span>
                  </div>
                  <Badge variant="outline" className="capitalize">
                    {question.difficulty}
                  </Badge>
                </div>
              )
            })}
          </div>
        </CardContent>
      </Card>

      {onPlayAgain && (
        <Button variant="outline" onClick={onPlayAgain} className="w-full">
          <RotateCcw className="mr-2 size-4" />
          Play Again
        </Button>
      )}
    </div>
  )
}
