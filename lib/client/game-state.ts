/**
 * Client-side Game State Management
 *
 * Manages session-only state for the quiz game.
 * No persistence - state is lost on page refresh.
 */

import type { Episode, Question } from "@/lib/types/episode"

// =============================================================================
// Answer Types
// =============================================================================

/**
 * Player's answer for a single question
 */
export interface PlayerAnswer {
  /** Question ID */
  qid: string
  /** Index of selected choice (for MC and AB formats) */
  selectedIndex?: number
  /** True/false answer (for TF format) */
  selectedValue?: boolean
  /** Order selected (for rank format) */
  selectedOrder?: string[]
  /** Whether the answer was correct */
  isCorrect: boolean
  /** Time taken to answer in milliseconds */
  timeMs: number
}

/**
 * Game status
 */
export type GameStatus = "not_started" | "in_progress" | "completed"

// =============================================================================
// Game State
// =============================================================================

/**
 * Complete game state for a session
 */
export interface GameState {
  /** The episode being played */
  episode: Episode
  /** Current question index (0-based) */
  currentQuestionIndex: number
  /** Player's answers */
  answers: PlayerAnswer[]
  /** Game status */
  status: GameStatus
  /** When the game started */
  startedAt: number | null
  /** When the game ended */
  completedAt: number | null
  /** When the current question was shown */
  questionStartedAt: number | null
}

// =============================================================================
// State Initialization
// =============================================================================

/**
 * Create initial game state for an episode
 */
export function createGameState(episode: Episode): GameState {
  return {
    episode,
    currentQuestionIndex: 0,
    answers: [],
    status: "not_started",
    startedAt: null,
    completedAt: null,
    questionStartedAt: null,
  }
}

/**
 * Start the game
 */
export function startGame(state: GameState): GameState {
  if (state.status !== "not_started") {
    return state
  }

  const now = Date.now()
  return {
    ...state,
    status: "in_progress",
    startedAt: now,
    questionStartedAt: now,
  }
}

// =============================================================================
// Answer Evaluation
// =============================================================================

/**
 * Check if an answer is correct for a given question
 * 
 * All choice-based formats (tf, ab, mc4, mc6) use answerIndex for evaluation.
 * This ensures consistent behavior across all formats since the frontend
 * always submits selectedIndex when a choice button is clicked.
 */
export function isAnswerCorrect(
  question: Question,
  answer: {
    selectedIndex?: number
    selectedValue?: boolean
    selectedOrder?: string[]
  }
): boolean {
  const format = question.format

  switch (format) {
    case "tf":
    case "ab":
    case "mc4":
    case "mc6":
      // All choice-based formats use answerIndex
      return question.answerIndex === answer.selectedIndex

    case "rank4":
      if (!question.answerOrder || !answer.selectedOrder) return false
      if (question.answerOrder.length !== answer.selectedOrder.length)
        return false
      return question.answerOrder.every(
        (item, i) => item === answer.selectedOrder![i]
      )

    default:
      return false
  }
}

// =============================================================================
// State Updates
// =============================================================================

/**
 * Submit an answer for the current question
 */
export function submitAnswer(
  state: GameState,
  answer: {
    selectedIndex?: number
    selectedValue?: boolean
    selectedOrder?: string[]
  }
): GameState {
  if (state.status !== "in_progress") {
    return state
  }

  const currentQuestion = state.episode.questions[state.currentQuestionIndex]
  if (!currentQuestion) {
    return state
  }

  // Calculate time taken
  const now = Date.now()
  const timeMs = state.questionStartedAt ? now - state.questionStartedAt : 0

  // Evaluate answer
  const isCorrect = isAnswerCorrect(currentQuestion, answer)

  // Create player answer record
  const playerAnswer: PlayerAnswer = {
    qid: currentQuestion.qid,
    selectedIndex: answer.selectedIndex,
    selectedValue: answer.selectedValue,
    selectedOrder: answer.selectedOrder,
    isCorrect,
    timeMs,
  }

  // Add answer to list
  const newAnswers = [...state.answers, playerAnswer]

  return {
    ...state,
    answers: newAnswers,
  }
}

/**
 * Move to the next question
 */
export function nextQuestion(state: GameState): GameState {
  if (state.status !== "in_progress") {
    return state
  }

  const nextIndex = state.currentQuestionIndex + 1
  const totalQuestions = state.episode.questions.length

  // Check if game is complete
  if (nextIndex >= totalQuestions) {
    return {
      ...state,
      status: "completed",
      completedAt: Date.now(),
    }
  }

  return {
    ...state,
    currentQuestionIndex: nextIndex,
    questionStartedAt: Date.now(),
  }
}

/**
 * Combined: submit answer and optionally advance to next question
 */
export function submitAndAdvance(
  state: GameState,
  answer: {
    selectedIndex?: number
    selectedValue?: boolean
    selectedOrder?: string[]
  },
  autoAdvance: boolean = false
): GameState {
  let newState = submitAnswer(state, answer)

  if (autoAdvance) {
    newState = nextQuestion(newState)
  }

  return newState
}

// =============================================================================
// State Queries
// =============================================================================

/**
 * Get the current question
 */
export function getCurrentQuestion(state: GameState): Question | null {
  if (state.status === "not_started" || state.status === "completed") {
    return null
  }
  return state.episode.questions[state.currentQuestionIndex] ?? null
}

/**
 * Check if there's an answer for the current question
 */
export function hasAnsweredCurrent(state: GameState): boolean {
  const currentQuestion = getCurrentQuestion(state)
  if (!currentQuestion) return false
  return state.answers.some((a) => a.qid === currentQuestion.qid)
}

/**
 * Get the answer for a specific question
 */
export function getAnswer(
  state: GameState,
  qid: string
): PlayerAnswer | undefined {
  return state.answers.find((a) => a.qid === qid)
}

/**
 * Get game results
 */
export function getResults(state: GameState): {
  totalQuestions: number
  correctCount: number
  incorrectCount: number
  unansweredCount: number
  totalTimeMs: number
  averageTimeMs: number
} {
  const totalQuestions = state.episode.questions.length
  const correctCount = state.answers.filter((a) => a.isCorrect).length
  const answeredCount = state.answers.length
  const incorrectCount = answeredCount - correctCount
  const unansweredCount = totalQuestions - answeredCount
  const totalTimeMs = state.answers.reduce((sum, a) => sum + a.timeMs, 0)
  const averageTimeMs =
    answeredCount > 0 ? Math.round(totalTimeMs / answeredCount) : 0

  return {
    totalQuestions,
    correctCount,
    incorrectCount,
    unansweredCount,
    totalTimeMs,
    averageTimeMs,
  }
}

/**
 * Get game duration in milliseconds
 */
export function getGameDuration(state: GameState): number {
  if (!state.startedAt) return 0
  const endTime = state.completedAt ?? Date.now()
  return endTime - state.startedAt
}

/**
 * Format duration as human-readable string (e.g., "2:45")
 */
export function formatDuration(ms: number): string {
  const totalSeconds = Math.floor(ms / 1000)
  const minutes = Math.floor(totalSeconds / 60)
  const seconds = totalSeconds % 60
  return `${minutes}:${seconds.toString().padStart(2, "0")}`
}

// =============================================================================
// Progress
// =============================================================================

/**
 * Get completion progress
 */
export function getProgress(state: GameState): {
  current: number
  total: number
  percentage: number
} {
  const total = state.episode.questions.length
  const current = state.answers.length

  return {
    current,
    total,
    percentage: total > 0 ? Math.round((current / total) * 100) : 0,
  }
}

/**
 * Check if the game is complete
 */
export function isGameComplete(state: GameState): boolean {
  return state.status === "completed"
}

/**
 * Check if the game has started
 *
 * @param date - Date in YYYY-MM-DD format
 */
export function isGameStarted(state: GameState): boolean {
  return state.status !== "not_started"
}

// =============================================================================
// localStorage Persistence
// =============================================================================

/**
 * Saved quiz result structure for localStorage
 */
export interface SavedQuizResult {
  /** Episode ID for validation */
  episodeId: string
  /** When the quiz was completed */
  completedAt: number
  /** Player's answers */
  answers: PlayerAnswer[]
  /** Number of correct answers */
  correctCount: number
  /** Total number of questions */
  totalQuestions: number
}

/**
 * Get the localStorage key for a given date
 */
function getStorageKey(date: string): string {
  return `defidle:results:${date}`
}

/**
 * Save completed quiz result to localStorage
 */
export function saveQuizResult(date: string, state: GameState): void {
  if (state.status !== "completed") {
    return
  }

  const results = getResults(state)
  const savedResult: SavedQuizResult = {
    episodeId: state.episode.episodeId,
    completedAt: state.completedAt ?? Date.now(),
    answers: state.answers,
    correctCount: results.correctCount,
    totalQuestions: results.totalQuestions,
  }

  try {
    localStorage.setItem(getStorageKey(date), JSON.stringify(savedResult))
  } catch {
    // localStorage unavailable or quota exceeded - fail silently
  }
}

/**
 * Load saved quiz result from localStorage
 * Returns null if not found or invalid
 */
export function loadQuizResult(date: string): SavedQuizResult | null {
  try {
    const stored = localStorage.getItem(getStorageKey(date))
    if (!stored) return null

    const parsed = JSON.parse(stored) as SavedQuizResult

    // Basic validation
    if (
      !parsed.episodeId ||
      !Array.isArray(parsed.answers) ||
      typeof parsed.correctCount !== "number" ||
      typeof parsed.totalQuestions !== "number"
    ) {
      return null
    }

    return parsed
  } catch {
    // localStorage unavailable or parse error
    return null
  }
}

/**
 * Clear saved quiz result from localStorage (for "Play Again")
 */
export function clearQuizResult(date: string): void {
  try {
    localStorage.removeItem(getStorageKey(date))
  } catch {
    // localStorage unavailable - fail silently
  }
}

/**
 * Check if a quiz has been completed for a given date
 */
export function hasCompletedQuiz(date: string): boolean {
  return loadQuizResult(date) !== null
}

/**
 * Restore a completed game state from saved result
 * Returns null if the episodeId doesn't match (stale data)
 */
export function restoreCompletedState(
  episode: Episode,
  savedResult: SavedQuizResult
): GameState | null {
  // Validate that the saved result matches this episode
  if (savedResult.episodeId !== episode.episodeId) {
    return null
  }

  return {
    episode,
    currentQuestionIndex: episode.questions.length - 1,
    answers: savedResult.answers,
    status: "completed",
    startedAt: savedResult.completedAt, // approximate
    completedAt: savedResult.completedAt,
    questionStartedAt: null,
  }
}
