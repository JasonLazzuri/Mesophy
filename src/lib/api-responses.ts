import { NextResponse } from 'next/server'

/**
 * Standardized API response formats for consistent error handling
 */

interface ApiError {
  error: string
  code?: string
  details?: string
  timestamp?: string
}

interface ApiSuccess<T = any> {
  data?: T
  message?: string
  timestamp?: string
}

/**
 * Standard error response builder
 */
export function createErrorResponse(
  error: string,
  status: number,
  code?: string,
  details?: string
): NextResponse {
  const errorResponse: ApiError = {
    error,
    timestamp: new Date().toISOString()
  }

  if (code) errorResponse.code = code
  if (details) errorResponse.details = details

  return NextResponse.json(errorResponse, { status })
}

/**
 * Standard success response builder
 */
export function createSuccessResponse<T>(
  data?: T,
  message?: string,
  status: number = 200
): NextResponse {
  const successResponse: ApiSuccess<T> = {
    timestamp: new Date().toISOString()
  }

  if (data !== undefined) successResponse.data = data
  if (message) successResponse.message = message

  return NextResponse.json(successResponse, { status })
}

/**
 * Pre-defined error responses for common scenarios
 */
export const API_ERRORS = {
  // Authentication & Authorization (4xx)
  UNAUTHORIZED: (details?: string) => createErrorResponse(
    'Unauthorized', 401, 'AUTH_REQUIRED', details
  ),
  FORBIDDEN: (details?: string) => createErrorResponse(
    'Forbidden', 403, 'INSUFFICIENT_PERMISSIONS', details
  ),
  NOT_FOUND: (resource?: string, details?: string) => createErrorResponse(
    resource ? `${resource} not found` : 'Resource not found', 
    404, 'RESOURCE_NOT_FOUND', details
  ),
  
  // Client Errors (4xx)
  BAD_REQUEST: (details?: string) => createErrorResponse(
    'Bad Request', 400, 'INVALID_REQUEST', details
  ),
  VALIDATION_ERROR: (details: string) => createErrorResponse(
    'Validation failed', 400, 'VALIDATION_ERROR', details
  ),
  CONFLICT: (details?: string) => createErrorResponse(
    'Resource conflict', 409, 'RESOURCE_CONFLICT', details
  ),
  UNPROCESSABLE_ENTITY: (details?: string) => createErrorResponse(
    'Unprocessable entity', 422, 'UNPROCESSABLE_ENTITY', details
  ),
  TOO_MANY_REQUESTS: (details?: string) => createErrorResponse(
    'Too many requests', 429, 'RATE_LIMIT_EXCEEDED', details
  ),

  // Server Errors (5xx)
  INTERNAL_SERVER_ERROR: (details?: string) => createErrorResponse(
    'Internal server error', 500, 'INTERNAL_ERROR', details
  ),
  SERVICE_UNAVAILABLE: (service?: string, details?: string) => createErrorResponse(
    service ? `${service} unavailable` : 'Service unavailable', 
    503, 'SERVICE_UNAVAILABLE', details
  ),
  DATABASE_ERROR: (details?: string) => createErrorResponse(
    'Database error', 500, 'DATABASE_ERROR', details
  ),
  EXTERNAL_SERVICE_ERROR: (service: string, details?: string) => createErrorResponse(
    `External service error: ${service}`, 502, 'EXTERNAL_SERVICE_ERROR', details
  ),

  // Business Logic Errors
  PROFILE_NOT_FOUND: () => API_ERRORS.NOT_FOUND('User profile'),
  ORGANIZATION_NOT_FOUND: () => API_ERRORS.NOT_FOUND('Organization'),
  DISTRICT_NOT_FOUND: () => API_ERRORS.NOT_FOUND('District'),
  LOCATION_NOT_FOUND: () => API_ERRORS.NOT_FOUND('Location'),
  SCREEN_NOT_FOUND: () => API_ERRORS.NOT_FOUND('Screen'),
  USER_INACTIVE: () => createErrorResponse(
    'User account is deactivated', 403, 'USER_INACTIVE'
  ),
  NO_ORGANIZATION: () => createErrorResponse(
    'User is not associated with an organization', 403, 'NO_ORGANIZATION'
  ),
  MISSING_REQUIRED_FIELDS: (fields: string[]) => API_ERRORS.VALIDATION_ERROR(
    `Missing required fields: ${fields.join(', ')}`
  ),
  INVALID_EMAIL: () => API_ERRORS.VALIDATION_ERROR('Invalid email format'),
  DUPLICATE_EMAIL: () => API_ERRORS.CONFLICT('User with this email already exists'),
  DUPLICATE_NAME: (resource: string) => API_ERRORS.CONFLICT(
    `${resource} with this name already exists`
  )
} as const

/**
 * Pre-defined success responses for common scenarios
 */
export const API_SUCCESS = {
  CREATED: <T>(data: T, message?: string) => createSuccessResponse(
    data, message || 'Resource created successfully', 201
  ),
  UPDATED: <T>(data: T, message?: string) => createSuccessResponse(
    data, message || 'Resource updated successfully', 200
  ),
  DELETED: (message?: string) => createSuccessResponse(
    undefined, message || 'Resource deleted successfully', 200
  ),
  RETRIEVED: <T>(data: T) => createSuccessResponse(data, undefined, 200),
  NO_CONTENT: () => new NextResponse(null, { status: 204 })
} as const

/**
 * Validation helper functions
 */
export const VALIDATORS = {
  email: (email: string): boolean => {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
    return emailRegex.test(email)
  },
  
  requiredFields: (body: Record<string, any>, fields: string[]): string[] => {
    return fields.filter(field => !body[field] || body[field].toString().trim() === '')
  },
  
  stringLength: (str: string, min: number, max: number): boolean => {
    const trimmed = str.trim()
    return trimmed.length >= min && trimmed.length <= max
  },
  
  isValidRole: (role: string): boolean => {
    const validRoles = ['super_admin', 'district_manager', 'location_manager']
    return validRoles.includes(role)
  }
} as const

/**
 * Helper function to handle async operations with standard error responses
 */
export async function handleApiOperation<T>(
  operation: () => Promise<T>,
  errorMessage: string = 'Operation failed'
): Promise<T | NextResponse> {
  try {
    return await operation()
  } catch (error) {
    console.error(`API Operation Error: ${errorMessage}`, error)
    
    if (error instanceof Error) {
      return API_ERRORS.INTERNAL_SERVER_ERROR(error.message)
    }
    
    return API_ERRORS.INTERNAL_SERVER_ERROR(errorMessage)
  }
}

/**
 * Middleware helper for standard error headers
 */
export function addStandardHeaders(response: NextResponse): NextResponse {
  response.headers.set('X-Content-Type-Options', 'nosniff')
  response.headers.set('X-Frame-Options', 'DENY')
  response.headers.set('X-XSS-Protection', '1; mode=block')
  response.headers.set('Referrer-Policy', 'strict-origin-when-cross-origin')
  response.headers.set('Cache-Control', 'no-cache, no-store, must-revalidate')
  
  return response
}