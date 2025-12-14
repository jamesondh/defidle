"use client"

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { ChoiceButton, type ChoiceState } from "./choice-button"
import type { Question } from "@/lib/types/episode"

interface QuestionCardProps {
  question: Question
  questionNumber: number
  totalQuestions: number
  selectedIndex: number | null
  hasAnswered: boolean
  onSelectChoice: (index: number) => void
}

export function QuestionCard({
  question,
  questionNumber,
  totalQuestions,
  selectedIndex,
  hasAnswered,
  onSelectChoice,
}: QuestionCardProps) {
  const getChoiceState = (index: number): ChoiceState => {
    if (!hasAnswered) {
      return selectedIndex === index ? "selected" : "default"
    }
    
    // After answering
    if (index === question.answerIndex) {
      return "correct"
    }
    if (selectedIndex === index && index !== question.answerIndex) {
      return "incorrect"
    }
    return "default"
  }

  return (
    <Card>
      <CardHeader className="pb-4">
        <div className="flex items-center justify-between">
          <Badge variant="secondary">
            {questionNumber} / {totalQuestions}
          </Badge>
          <Badge variant="outline" className="capitalize">
            {question.difficulty}
          </Badge>
        </div>
        <CardTitle className="text-lg">{question.prompt}</CardTitle>
        {question.clues && question.clues.length > 0 && (
          <ul className="mt-2 space-y-1 text-sm text-muted-foreground">
            {question.clues.map((clue, i) => (
              <li key={i}>{clue}</li>
            ))}
          </ul>
        )}
      </CardHeader>
      <CardContent>
        <div className="space-y-2">
          {question.choices?.map((choice, index) => (
            <ChoiceButton
              key={index}
              choice={choice}
              index={index}
              state={getChoiceState(index)}
              disabled={hasAnswered}
              onClick={() => onSelectChoice(index)}
            />
          ))}
        </div>
      </CardContent>
    </Card>
  )
}
