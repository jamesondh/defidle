"use client"

import { useEffect, useState, useCallback } from "react"
import { Progress } from "@/components/ui/progress"
import { QuestionCard } from "@/components/game/question-card"
import { ExplanationPanel } from "@/components/game/explanation-panel"
import { ResultsSummary } from "@/components/game/results-summary"
import { LoadingState } from "@/components/game/loading-state"
import { ErrorState } from "@/components/game/error-state"
import {
  fetchEpisode,
  type EpisodeError,
} from "@/lib/client/episode"
import {
  createGameState,
  startGame,
  submitAnswer,
  nextQuestion,
  getCurrentQuestion,
  hasAnsweredCurrent,
  getResults,
  getProgress,
  isGameComplete,
  getAnswer,
  type GameState,
} from "@/lib/client/game-state"
import type { Episode } from "@/lib/types/episode"

type AppState =
  | { status: "loading" }
  | { status: "error"; error: EpisodeError }
  | { status: "ready"; episode: Episode; gameState: GameState }

interface GamePageProps {
  /** Date in YYYY-MM-DD format */
  date: string
}

export function GamePage({ date }: GamePageProps) {
  const [appState, setAppState] = useState<AppState>({ status: "loading" })
  const [selectedIndex, setSelectedIndex] = useState<number | null>(null)

  const loadEpisode = useCallback(async () => {
    setAppState({ status: "loading" })
    const result = await fetchEpisode(date)
    
    if (result.success) {
      const initialState = createGameState(result.episode)
      const startedState = startGame(initialState)
      setAppState({
        status: "ready",
        episode: result.episode,
        gameState: startedState,
      })
    } else {
      setAppState({ status: "error", error: result.error })
    }
  }, [date])

  useEffect(() => {
    loadEpisode()
  }, [loadEpisode])

  const handleSelectChoice = (index: number) => {
    if (appState.status !== "ready") return
    if (hasAnsweredCurrent(appState.gameState)) return
    setSelectedIndex(index)
  }

  const handleSubmitAnswer = () => {
    if (appState.status !== "ready" || selectedIndex === null) return
    
    const newState = submitAnswer(appState.gameState, {
      selectedIndex,
    })
    
    setAppState({
      ...appState,
      gameState: newState,
    })
  }

  const handleContinue = () => {
    if (appState.status !== "ready") return
    
    const newState = nextQuestion(appState.gameState)
    setSelectedIndex(null)
    setAppState({
      ...appState,
      gameState: newState,
    })
  }

  const handlePlayAgain = () => {
    if (appState.status !== "ready") return
    
    const initialState = createGameState(appState.episode)
    const startedState = startGame(initialState)
    setSelectedIndex(null)
    setAppState({
      ...appState,
      gameState: startedState,
    })
  }

  // Auto-submit when a choice is selected (after a short delay for visual feedback)
  useEffect(() => {
    if (
      appState.status === "ready" &&
      selectedIndex !== null &&
      !hasAnsweredCurrent(appState.gameState)
    ) {
      const timer = setTimeout(() => {
        handleSubmitAnswer()
      }, 150)
      return () => clearTimeout(timer)
    }
  }, [selectedIndex, appState])

  if (appState.status === "loading") {
    return (
      <div className="min-h-screen bg-background">
        <main className="mx-auto max-w-lg px-4 py-8">
          <Header />
          <LoadingState />
        </main>
      </div>
    )
  }

  if (appState.status === "error") {
    return (
      <div className="min-h-screen bg-background">
        <main className="mx-auto max-w-lg px-4 py-8">
          <Header />
          <ErrorState error={appState.error} onRetry={loadEpisode} />
        </main>
      </div>
    )
  }

  const { episode, gameState } = appState
  const currentQuestion = getCurrentQuestion(gameState)
  const hasAnswered = hasAnsweredCurrent(gameState)
  const progress = getProgress(gameState)
  const results = getResults(gameState)

  // Show results if game is complete
  if (isGameComplete(gameState)) {
    return (
      <div className="min-h-screen bg-background">
        <main className="mx-auto max-w-lg px-4 py-8">
          <Header />
          <ResultsSummary
            correctCount={results.correctCount}
            totalQuestions={results.totalQuestions}
            topic={episode.topic}
            answers={gameState.answers}
            questions={episode.questions}
            onPlayAgain={handlePlayAgain}
          />
        </main>
      </div>
    )
  }

  // Show current question
  if (!currentQuestion) {
    return (
      <div className="min-h-screen bg-background">
        <main className="mx-auto max-w-lg px-4 py-8">
          <Header />
          <ErrorState
            error={{ code: "PARSE_ERROR", message: "No question found" }}
            onRetry={loadEpisode}
          />
        </main>
      </div>
    )
  }

  const currentAnswer = getAnswer(gameState, currentQuestion.qid)
  const isCorrect = currentAnswer?.isCorrect ?? false

  return (
    <div className="min-h-screen bg-background">
      <main className="mx-auto max-w-lg px-4 py-8">
        <Header />
        
        <div className="mb-6">
          <Progress value={progress.percentage} className="h-2" />
        </div>

        <div className="space-y-4">
          <QuestionCard
            question={currentQuestion}
            questionNumber={gameState.currentQuestionIndex + 1}
            totalQuestions={episode.questions.length}
            selectedIndex={selectedIndex}
            hasAnswered={hasAnswered}
            onSelectChoice={handleSelectChoice}
          />

          {hasAnswered && (
            <ExplanationPanel
              isCorrect={isCorrect}
              explanation={currentQuestion.explanation}
              isLastQuestion={
                gameState.currentQuestionIndex === episode.questions.length - 1
              }
              onContinue={handleContinue}
            />
          )}
        </div>
      </main>
    </div>
  )
}

function Header() {
  return (
    <header className="mb-8 text-center">
      <h1 className="text-3xl font-bold tracking-tight">DeFidle</h1>
      <p className="mt-1 text-sm text-muted-foreground">Daily DeFi Quiz</p>
    </header>
  )
}
