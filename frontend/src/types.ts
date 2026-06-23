export type Appointment = {
  id: number
  title: string
  date: string
  time: string
}

export type CallSummaryData = {
  summary: string
  appointments: Appointment[]
  timestamp: string
}

export type AppScreen = 'connect' | 'call' | 'summary'

export type ToolFeedItem = {
  id: string
  message: string
  timestamp: Date
}
