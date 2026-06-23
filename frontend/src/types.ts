export type Appointment = {
  id: number
  title: string
  date: string
  time: string
}

export type CallSummaryData = {
  summary: string
  appointments: Appointment[]
  user_name: string
  timestamp: string
}

export type AppScreen = 'connect' | 'call' | 'summary'

export type ToolFeedItem = {
  id: string
  tool: string
  status: 'running' | 'done' | 'error'
  message: string
  timestamp: Date
}

export type ToolWsMessage = {
  tool: string
  status: 'running' | 'done' | 'error'
  message: string
  summary?: string
  appointments?: Appointment[]
  user_name?: string
  timestamp?: string
}