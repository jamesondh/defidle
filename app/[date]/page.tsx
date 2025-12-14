import { notFound } from "next/navigation"
import type { Metadata } from "next"
import { GamePage } from "@/components/game/game-page"

/**
 * Validate date format: YYYY-MM-DD
 * Returns true if the format is valid (doesn't check if date is real)
 */
function isValidDateFormat(date: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(date)
}

interface PageProps {
  params: Promise<{ date: string }>
}

export default async function HistoricalEpisodePage({ params }: PageProps) {
  const { date } = await params

  // Validate date format
  if (!isValidDateFormat(date)) {
    notFound()
  }

  return <GamePage date={date} />
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { date } = await params
  
  return {
    title: `DeFidle - ${date}`,
    description: `DeFi quiz for ${date}`,
  }
}
