"use client"

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { CheckCircle2, XCircle } from "lucide-react"

interface ExplanationPanelProps {
  isCorrect: boolean
  explanation: string
}

export function ExplanationPanel({
  isCorrect,
  explanation,
}: ExplanationPanelProps) {
  return (
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
  )
}
