"use client"

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { CheckCircle2, XCircle, ArrowRight } from "lucide-react"

interface ExplanationPanelProps {
  isCorrect: boolean
  explanation: string
  isLastQuestion: boolean
  onContinue: () => void
}

export function ExplanationPanel({
  isCorrect,
  explanation,
  isLastQuestion,
  onContinue,
}: ExplanationPanelProps) {
  return (
    <div className="space-y-4">
      <Alert variant={isCorrect ? "default" : "destructive"}>
        <AlertTitle>
          {isCorrect ? (
            <div className="flex items-center gap-2"><CheckCircle2 className="size-5 text-green-500" /> Correct!</div>
          ) : (
            <div className="flex items-center gap-2"><XCircle className="size-5" /> Incorrect!</div>
          )}
        </AlertTitle>
        <AlertDescription className="mt-2">
          {explanation}
        </AlertDescription>
      </Alert>
      <Button onClick={onContinue} className="w-full">
        {isLastQuestion ? "See Results" : "Next Question"}
        <ArrowRight className="ml-2 size-4" />
      </Button>
    </div>
  )
}
