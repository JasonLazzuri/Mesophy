/**
 * Microsoft Graph API Client
 * Handles authentication and API calls to Microsoft Graph for calendar integration
 */

import { Client } from '@microsoft/microsoft-graph-client'

// Microsoft Graph API endpoints
const GRAPH_API_ENDPOINT = 'https://graph.microsoft.com/v1.0'
const OAUTH_AUTHORITY = 'https://login.microsoftonline.com/common'

export interface CalendarEvent {
  id: string
  subject: string
  start: {
    dateTime: string
    timeZone: string
  }
  end: {
    dateTime: string
    timeZone: string
  }
  organizer: {
    emailAddress: {
      name: string
      address: string
    }
  }
  attendees?: Array<{
    emailAddress: {
      name: string
      address: string
    }
    status: {
      response: string // 'accepted' | 'tentativelyAccepted' | 'declined' | 'notResponded'
    }
  }>
  location?: {
    displayName: string
  }
  isAllDay: boolean
  isCancelled: boolean
  bodyPreview?: string
  categories?: string[]
  sensitivity?: string // 'normal' | 'personal' | 'private' | 'confidential'
  showAs?: string // 'free' | 'tentative' | 'busy' | 'oof' | 'workingElsewhere' | 'unknown'
}

export interface CalendarInfo {
  id: string
  name: string
  owner: {
    name: string
    address: string
  }
}

export interface TokenResponse {
  access_token: string
  refresh_token?: string
  expires_in: number
  token_type: string
}

/**
 * Microsoft Graph Client for calendar operations
 */
export class MicrosoftGraphClient {
  private accessToken: string

  constructor(accessToken: string) {
    this.accessToken = accessToken
  }

  /**
   * Create an authenticated Microsoft Graph client
   */
  private getClient(): Client {
    return Client.init({
      authProvider: (done) => {
        done(null, this.accessToken)
      }
    })
  }

  /**
   * Get list of calendars for the authenticated user
   */
  async getCalendars(): Promise<CalendarInfo[]> {
    try {
      const client = this.getClient()
      const response = await client
        .api('/me/calendars')
        .select('id,name,owner')
        .get()

      return response.value || []
    } catch (error) {
      console.error('Error fetching calendars:', error)
      throw new Error('Failed to fetch calendars from Microsoft Graph')
    }
  }

  /**
   * Get calendar events for a specific date range
   * Uses calendarView to automatically expand recurring events
   */
  async getCalendarEvents(
    calendarId: string,
    startDateTime: string,
    endDateTime: string,
    timezone?: string
  ): Promise<CalendarEvent[]> {
    try {
      const client = this.getClient()

      // Use calendarView instead of events to expand recurring series
      let query = client
        .api(`/me/calendars/${calendarId}/calendarView`)
        .query({
          startDateTime: startDateTime,
          endDateTime: endDateTime
        })
        .select('id,subject,start,end,organizer,attendees,location,isAllDay,isCancelled,bodyPreview,categories,sensitivity,showAs')
        .orderby('start/dateTime')
        .top(100) // Limit to 100 events

      // If timezone is provided, request times in that timezone
      if (timezone) {
        query = query.header('Prefer', `outlook.timezone="${timezone}"`)
      }

      const response = await query.get()

      return response.value || []
    } catch (error) {
      console.error('Error fetching calendar events:', error)
      throw new Error('Failed to fetch calendar events from Microsoft Graph')
    }
  }

  /**
   * Get today's calendar events
   */
  async getTodaysEvents(calendarId: string, timezone: string = 'UTC'): Promise<CalendarEvent[]> {
    const now = new Date()
    const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate())
    const endOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59)

    // Convert to ISO string (Microsoft Graph expects ISO 8601 format)
    const startDateTime = startOfDay.toISOString()
    const endDateTime = endOfDay.toISOString()

    return this.getCalendarEvents(calendarId, startDateTime, endDateTime)
  }

  /**
   * Get current and next event for a calendar
   */
  async getCurrentAndNextEvent(calendarId: string): Promise<{
    currentEvent: CalendarEvent | null
    nextEvent: CalendarEvent | null
  }> {
    const now = new Date()
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate())
    const todayEnd = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59)

    const events = await this.getCalendarEvents(
      calendarId,
      todayStart.toISOString(),
      todayEnd.toISOString()
    )

    let currentEvent: CalendarEvent | null = null
    let nextEvent: CalendarEvent | null = null

    for (const event of events) {
      if (event.isCancelled) continue

      const eventStart = new Date(event.start.dateTime)
      const eventEnd = new Date(event.end.dateTime)

      // Check if event is currently happening
      if (eventStart <= now && eventEnd > now) {
        currentEvent = event
      }
      // Check if event is upcoming
      else if (eventStart > now && !nextEvent) {
        nextEvent = event
        break // We only need the very next event
      }
    }

    return { currentEvent, nextEvent }
  }
}

/**
 * OAuth Helper Functions
 */

/**
 * Generate Microsoft OAuth authorization URL
 *
 * Multi-tenant approach: Admin consent allows the first admin to approve
 * the app for the entire organization. After admin consent, all users in
 * that organization can connect without needing admin approval.
 */
export function getMicrosoftAuthUrl(
  clientId: string,
  redirectUri: string,
  state?: string
): string {
  const scopes = [
    'openid',
    'profile',
    'email',
    'offline_access',
    'User.Read',
    'Calendars.Read',
    'Calendars.Read.Shared'
  ]

  const params = new URLSearchParams({
    client_id: clientId,
    response_type: 'code',
    redirect_uri: redirectUri,
    scope: scopes.join(' '),
    response_mode: 'query',
    // Force consent screen to show every time, which allows admins to
    // see the "Consent on behalf of your organization" checkbox
    prompt: 'consent',
    ...(state && { state })
  })

  return `${OAUTH_AUTHORITY}/oauth2/v2.0/authorize?${params.toString()}`
}

/**
 * Exchange authorization code for access token
 */
export async function exchangeCodeForToken(
  code: string,
  clientId: string,
  clientSecret: string,
  redirectUri: string
): Promise<TokenResponse> {
  console.log('🔵 [TOKEN_EXCHANGE] Starting token exchange...')
  console.log('🔵 [TOKEN_EXCHANGE] Parameters:', {
    hasCode: !!code,
    codeLength: code?.length,
    codePrefix: code?.substring(0, 10) + '...',
    clientId,
    hasClientSecret: !!clientSecret,
    clientSecretLength: clientSecret?.length,
    redirectUri
  })

  const params = new URLSearchParams({
    client_id: clientId,
    client_secret: clientSecret,
    code: code,
    redirect_uri: redirectUri,
    grant_type: 'authorization_code'
  })

  const tokenUrl = `${OAUTH_AUTHORITY}/oauth2/v2.0/token`
  console.log('🔵 [TOKEN_EXCHANGE] Token URL:', tokenUrl)

  const response = await fetch(tokenUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded'
    },
    body: params.toString()
  })

  console.log('🔵 [TOKEN_EXCHANGE] Response status:', response.status, response.statusText)

  if (!response.ok) {
    const errorText = await response.text()
    console.error('❌ [TOKEN_EXCHANGE] Failed with status:', response.status)
    console.error('❌ [TOKEN_EXCHANGE] Error response:', errorText)

    // Try to parse error as JSON for better logging
    try {
      const errorJson = JSON.parse(errorText)
      console.error('❌ [TOKEN_EXCHANGE] Parsed error:', JSON.stringify(errorJson, null, 2))
    } catch {
      // Not JSON, already logged as text
    }

    throw new Error(`Failed to exchange code for access token: ${errorText}`)
  }

  const tokenData = await response.json()
  console.log('✅ [TOKEN_EXCHANGE] Token exchange successful')
  return tokenData
}

/**
 * Refresh an expired access token using refresh token
 */
export async function refreshAccessToken(
  refreshToken: string,
  clientId: string,
  clientSecret: string
): Promise<TokenResponse> {
  const params = new URLSearchParams({
    client_id: clientId,
    client_secret: clientSecret,
    refresh_token: refreshToken,
    grant_type: 'refresh_token'
  })

  const response = await fetch(`${OAUTH_AUTHORITY}/oauth2/v2.0/token`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded'
    },
    body: params.toString()
  })

  if (!response.ok) {
    const error = await response.text()
    console.error('Token refresh failed:', error)
    throw new Error('Failed to refresh access token')
  }

  return response.json()
}

/**
 * Get user profile information from Microsoft Graph
 */
export async function getMicrosoftUserProfile(accessToken: string): Promise<{
  id: string
  displayName: string
  mail: string
  userPrincipalName: string
}> {
  console.log('🔵 [USER_PROFILE] Fetching user profile from Microsoft Graph...')
  console.log('🔵 [USER_PROFILE] Access token length:', accessToken?.length)
  console.log('🔵 [USER_PROFILE] Token prefix:', accessToken?.substring(0, 20) + '...')

  const url = `${GRAPH_API_ENDPOINT}/me`
  console.log('🔵 [USER_PROFILE] Request URL:', url)

  const response = await fetch(url, {
    headers: {
      Authorization: `Bearer ${accessToken}`
    }
  })

  console.log('🔵 [USER_PROFILE] Response status:', response.status, response.statusText)

  if (!response.ok) {
    const errorText = await response.text()
    console.error('❌ [USER_PROFILE] Failed with status:', response.status)
    console.error('❌ [USER_PROFILE] Error response:', errorText)

    // Try to parse error as JSON for better logging
    try {
      const errorJson = JSON.parse(errorText)
      console.error('❌ [USER_PROFILE] Parsed error:', JSON.stringify(errorJson, null, 2))
    } catch {
      // Not JSON, already logged as text
    }

    throw new Error(`Failed to fetch user profile: ${errorText}`)
  }

  const profile = await response.json()
  console.log('✅ [USER_PROFILE] Profile fetched successfully:', {
    id: profile.id,
    displayName: profile.displayName,
    mail: profile.mail,
    userPrincipalName: profile.userPrincipalName
  })

  return profile
}

/**
 * Refresh Microsoft access token using refresh token
 */
export async function refreshMicrosoftToken(refreshToken: string): Promise<{
  accessToken: string
  refreshToken?: string
  expiresIn: number
}> {
  const clientId = process.env.MICROSOFT_CLIENT_ID
  const clientSecret = process.env.MICROSOFT_CLIENT_SECRET

  if (!clientId || !clientSecret) {
    throw new Error('Microsoft client credentials not configured')
  }

  const tokenData = await refreshAccessToken(refreshToken, clientId, clientSecret)

  return {
    accessToken: tokenData.access_token,
    refreshToken: tokenData.refresh_token,
    expiresIn: tokenData.expires_in
  }
}

/**
 * Get list of calendars from Microsoft Graph
 */
export async function getMicrosoftCalendars(accessToken: string): Promise<CalendarInfo[]> {
  const client = new MicrosoftGraphClient(accessToken)
  return client.getCalendars()
}

/**
 * Get calendar events from Microsoft Graph
 */
export async function getMicrosoftCalendarEvents(
  accessToken: string,
  calendarId: string,
  startDate: Date,
  endDate: Date
): Promise<CalendarEvent[]> {
  const client = new MicrosoftGraphClient(accessToken)
  return client.getCalendarEvents(
    calendarId,
    startDate.toISOString(),
    endDate.toISOString()
  )
}
