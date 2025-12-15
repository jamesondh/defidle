"use client"

import { AlertCircle } from "lucide-react"
import type { EpisodeError } from "@/lib/client/episode"

interface ErrorContentProps {
  error: EpisodeError
}

export function ErrorContent({ error }: ErrorContentProps) {
  const getTitle = () => {
    switch (error.code) {
      case "NOT_FOUND":
        return "No Episode Today"
      case "NETWORK_ERROR":
        return "Connection Error"
      case "PARSE_ERROR":
        return "Data Error"
      default:
        return "Something went wrong"
    }
  }

  const getDescription = () => {
    switch (error.code) {
      case "NOT_FOUND":
        return "Today's episode hasn't been generated yet. Check back later!"
      case "NETWORK_ERROR":
        return "Couldn't connect to the server. Please check your connection and try again."
      case "PARSE_ERROR":
        return "There was a problem loading the episode data."
    }
  }

  return (
    <div className="text-center space-y-4">
      <div className="mx-auto flex size-12 items-center justify-center rounded-full bg-muted">
        <AlertCircle className="size-6 text-muted-foreground" />
      </div>
      <div>
        <h2 className="text-lg font-semibold">{getTitle()}</h2>
        <p className="mt-2 text-muted-foreground">{getDescription()}</p>
      </div>
    </div>
  )
}
