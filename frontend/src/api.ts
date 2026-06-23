export const API_URL = import.meta.env.VITE_API_URL ?? 'http://localhost:8000'

export function getToolsWsUrl(roomName: string): string {
  const wsBase = API_URL.replace(/^http/, 'ws')
  return `${wsBase}/ws/tools/${encodeURIComponent(roomName)}`
}

export async function apiFetch<T>(
  path: string,
  options?: RequestInit,
): Promise<T> {
  const res = await fetch(`${API_URL}${path}`, {
    headers: { 'Content-Type': 'application/json', ...options?.headers },
    ...options,
  })
  if (!res.ok) {
    const detail = await res.text()
    throw new Error(detail || `Request failed: ${res.status}`)
  }
  return res.json() as Promise<T>
}

export async function identifyUser(phone: string) {
  return apiFetch<{
    id: number
    phone_number: string
    name: string
    google_calendar_connected: boolean
  }>('/api/identify', {
    method: 'POST',
    body: JSON.stringify({ phone }),
  })
}

export async function getAuthStatus(phone: string) {
  return apiFetch<{
    phone_number: string
    google_calendar_connected: boolean
  }>(`/auth/status?phone=${encodeURIComponent(phone)}`)
}

export async function getLiveKitToken(roomName: string, participantName: string) {
  return apiFetch<{ token: string; url: string; room: string }>('/token', {
    method: 'POST',
    body: JSON.stringify({
      room_name: roomName,
      participant_name: participantName,
    }),
  })
}

export async function getAppointments(userId: number) {
  return apiFetch<{
    appointments: Array<{
      id: number
      title: string
      date: string
      time: string
    }>
  }>(`/api/appointments/${userId}`)
}

export async function endConversation(userId: number, summary: string) {
  return apiFetch<{
    summary: string
    appointments: Array<{
      id: number
      title: string
      date: string
      time: string
    }>
    timestamp: string
  }>('/api/conversation/end', {
    method: 'POST',
    body: JSON.stringify({ user_id: userId, summary }),
  })
}

export function connectGoogleCalendar(phone: string) {
  window.location.href = `${API_URL}/auth/login?phone=${encodeURIComponent(phone)}`
}
