"use client"

import { ChoiceButton, type ChoiceState } from "./choice-button"
import type { Question } from "@/lib/types/episode"

interface QuestionContentProps {
  question: Question
  selectedIndex: number | null
  hasAnswered: boolean
  onSelectChoice: (index: number) => void
}

export function QuestionContent({
  question,
  selectedIndex,
  hasAnswered,
  onSelectChoice,
}: QuestionContentProps) {
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
    <div className="space-y-4">
      <div className="space-y-2">
        <h2 className="text-lg font-semibold">{question.prompt}</h2>
        {question.clues && question.clues.length > 0 && (
          <ul className="space-y-1 text-sm text-muted-foreground">
            {question.clues.map((clue, i) => (
              <li key={i}>{clue}</li>
            ))}
          </ul>
        )}
      </div>
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
    </div>
  )
}
