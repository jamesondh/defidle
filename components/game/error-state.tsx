"use client"

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { AlertCircle, RefreshCw } from "lucide-react"
import type { EpisodeError } from "@/lib/client/episode"

interface ErrorStateProps {
  error: EpisodeError
  onRetry?: () => void
}

export function ErrorState({ error, onRetry }: ErrorStateProps) {
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
    <Card>
      <CardHeader className="text-center">
        <div className="mx-auto mb-4 flex size-12 items-center justify-center rounded-full bg-muted">
          <AlertCircle className="size-6 text-muted-foreground" />
        </div>
        <CardTitle>{getTitle()}</CardTitle>
      </CardHeader>
      <CardContent className="text-center">
        <p className="text-muted-foreground">{getDescription()}</p>
        {onRetry && (
          <Button onClick={onRetry} variant="outline" className="mt-4">
            <RefreshCw className="mr-2 size-4" />
            Try Again
          </Button>
        )}
      </CardContent>
    </Card>
  )
}
