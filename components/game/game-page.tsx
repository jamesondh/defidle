"use client"

import { useEffect, useState, useCallback } from "react"
import { useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"
import { GameCard } from "@/components/game/game-card"
import { QuestionContent } from "@/components/game/question-content"
import { ExplanationPanel } from "@/components/game/explanation-panel"
import { ResultsContent } from "@/components/game/results-content"
import { LoadingContent } from "@/components/game/loading-content"
import { ErrorContent } from "@/components/game/error-content"
import { ArrowRight, RefreshCw, RotateCcw, CalendarDays } from "lucide-react"
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

function getYesterdayDate(currentDate: string): string {
  const date = new Date(currentDate)
  date.setDate(date.getDate() - 1)
  return date.toISOString().split("T")[0]
}

export function GamePage({ date }: GamePageProps) {
  const router = useRouter()
  const [appState, setAppState] = useState<AppState>({ status: "loading" })
  const [selectedIndex, setSelectedIndex] = useState<number | null>(null)

  const yesterdayDate = getYesterdayDate(date)

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

  // Loading state
  if (appState.status === "loading") {
    return (
      <div className="min-h-screen">
        <main className="mx-auto max-w-xl px-4 py-8">
          <GameCard date={date}>
            <LoadingContent />
          </GameCard>
        </main>
      </div>
    )
  }

  // Error state
  if (appState.status === "error") {
    return (
      <div className="min-h-screen">
        <main className="mx-auto max-w-xl px-4 py-8">
          <GameCard
            date={date}
            footer={
              <Button variant="outline" onClick={loadEpisode} className="w-full">
                <RefreshCw className="mr-2 size-4" />
                Try Again
              </Button>
            }
          >
            <ErrorContent error={appState.error} />
          </GameCard>
        </main>
      </div>
    )
  }

  const { episode, gameState } = appState
  const currentQuestion = getCurrentQuestion(gameState)
  const hasAnswered = hasAnsweredCurrent(gameState)
  const progress = getProgress(gameState)
  const results = getResults(gameState)

  // Results state
  if (isGameComplete(gameState)) {
    return (
      <div className="min-h-screen">
        <main className="mx-auto max-w-xl px-4 py-8">
          <GameCard
            date={date}
            footer={
              <div className="flex gap-2 w-full">
                <Button
                  variant="outline"
                  onClick={() => router.push(`/${yesterdayDate}`)}
                  className="flex-1"
                >
                  <CalendarDays className="mr-2 size-4" />
                  Play Yesterday&apos;s Quiz
                </Button>
                <Button variant="outline" onClick={handlePlayAgain} className="flex-1">
                  <RotateCcw className="mr-2 size-4" />
                  Play Again
                </Button>
              </div>
            }
          >
            <ResultsContent
              correctCount={results.correctCount}
              totalQuestions={results.totalQuestions}
              topic={episode.topic}
              answers={gameState.answers}
              questions={episode.questions}
            />
          </GameCard>
        </main>
      </div>
    )
  }

  // No question found error
  if (!currentQuestion) {
    return (
      <div className="min-h-screen">
        <main className="mx-auto max-w-xl px-4 py-8">
          <GameCard
            date={date}
            footer={
              <Button variant="outline" onClick={loadEpisode} className="w-full">
                <RefreshCw className="mr-2 size-4" />
                Try Again
              </Button>
            }
          >
            <ErrorContent
              error={{ code: "PARSE_ERROR", message: "No question found" }}
            />
          </GameCard>
        </main>
      </div>
    )
  }

  const currentAnswer = getAnswer(gameState, currentQuestion.qid)
  const isCorrect = currentAnswer?.isCorrect ?? false
  const isLastQuestion = gameState.currentQuestionIndex === episode.questions.length - 1

  // Question state
  return (
    <div className="min-h-screen">
      <main className="mx-auto max-w-xl px-4 py-8">
        <GameCard
          date={date}
          currentQuestion={progress.current}
          totalQuestions={progress.total}
          difficulty={currentQuestion.difficulty}
          footer={
            hasAnswered && (
              <Button onClick={handleContinue} className="w-full">
                {isLastQuestion ? "See Results" : "Next Question"}
                <ArrowRight className="ml-2 size-4" />
              </Button>
            )
          }
        >
          <div className="space-y-4">
            <QuestionContent
              question={currentQuestion}
              selectedIndex={selectedIndex}
              hasAnswered={hasAnswered}
              onSelectChoice={handleSelectChoice}
            />

            {hasAnswered && (
              <ExplanationPanel
                isCorrect={isCorrect}
                explanation={currentQuestion.explanation}
              />
            )}
          </div>
        </GameCard>
      </main>
    </div>
  )
}
