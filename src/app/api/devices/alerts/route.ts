import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'

interface AlertRequest {
  device_id: string
  alert_type: 'device_offline' | 'performance_warning' | 'command_failure'
  severity: 'low' | 'medium' | 'high' | 'critical'
  message: string
  details?: any
  metric_value?: number
  threshold?: number
}

interface EmailAlert {
  recipient_email: string
  subject: string
  body: string
  alert_type: string
  device_name: string
  location_name: string
}

// POST: Send device alert and trigger email notifications
export async function POST(request: NextRequest) {
  try {
    const supabase = createAdminClient()
    if (!supabase) {
      return NextResponse.json({ 
        error: 'Service unavailable' 
      }, { status: 503 })
    }

    const body: AlertRequest = await request.json()
    const {
      device_id,
      alert_type,
      severity,
      message,
      details = {},
      metric_value,
      threshold
    } = body

    if (!device_id || !alert_type || !severity || !message) {
      return NextResponse.json({ 
        error: 'device_id, alert_type, severity, and message are required' 
      }, { status: 400 })
    }

    // Validate alert types and severity
    const validAlertTypes = ['device_offline', 'performance_warning', 'command_failure']
    const validSeverities = ['low', 'medium', 'high', 'critical']

    if (!validAlertTypes.includes(alert_type)) {
      return NextResponse.json({ 
        error: `Invalid alert_type. Must be one of: ${validAlertTypes.join(', ')}` 
      }, { status: 400 })
    }

    if (!validSeverities.includes(severity)) {
      return NextResponse.json({ 
        error: `Invalid severity. Must be one of: ${validSeverities.join(', ')}` 
      }, { status: 400 })
    }

    // Get device and location information for context
    const { data: deviceInfo, error: deviceError } = await supabase
      .from('screens')
      .select(`
        id,
        name,
        device_id,
        location_id,
        locations!inner (
          name,
          district_id,
          districts!inner (
            name,
            organization_id
          )
        )
      `)
      .eq('device_id', device_id)
      .single()

    if (deviceError || !deviceInfo) {
      return NextResponse.json({ 
        error: 'Device not found' 
      }, { status: 404 })
    }

    // Record the alert in device_alerts table
    const { data: alert, error: alertError } = await supabase
      .from('device_alerts')
      .insert({
        device_id,
        screen_id: deviceInfo.id,
        alert_type,
        severity,
        message,
        details,
        metric_value,
        threshold,
        created_at: new Date().toISOString()
      })
      .select()
      .single()

    if (alertError) {
      console.error('Error creating alert:', alertError)
      return NextResponse.json({ 
        error: 'Failed to create alert',
        details: alertError.message 
      }, { status: 500 })
    }

    // Send all alerts to super admins only (simplified for this use case)
    let recipientEmails: string[] = []

    // Get all super admin users regardless of severity
    const { data: users } = await supabase
      .from('user_profiles')
      .select('id, email, role')
      .eq('role', 'super_admin')

    recipientEmails = users?.map(u => u.email).filter(email => email) || []

    // Send email notifications if there are recipients
    const emailsSent: string[] = []
    if (recipientEmails.length > 0) {
      const emailPromises = recipientEmails.map(async (email) => {
        try {
          const emailAlert: EmailAlert = {
            recipient_email: email,
            subject: `${severity.toUpperCase()}: ${alert_type.replace('_', ' ')} - ${deviceInfo.name}`,
            body: generateEmailBody(alert_type, severity, message, deviceInfo, details, metric_value, threshold),
            alert_type,
            device_name: deviceInfo.name,
            location_name: deviceInfo.locations?.name || 'Unknown'
          }

          // Queue email for sending (you'll implement email service separately)
          const { error: emailError } = await supabase
            .from('email_queue')
            .insert(emailAlert)

          if (!emailError) {
            emailsSent.push(email)
          }

          return !emailError
        } catch (e) {
          console.error(`Failed to queue email for ${email}:`, e)
          return false
        }
      })

      await Promise.all(emailPromises)
    }

    console.log(`Alert created: ${alert_type} for device ${device_id}, ${emailsSent.length} emails queued`)

    return NextResponse.json({
      success: true,
      message: 'Alert created and notifications sent',
      alert: {
        id: alert.id,
        alert_type: alert.alert_type,
        severity: alert.severity,
        message: alert.message,
        created_at: alert.created_at
      },
      notifications: {
        emails_queued: emailsSent.length,
        recipients: emailsSent
      }
    })

  } catch (error) {
    console.error('Alert creation error:', error)
    return NextResponse.json({ 
      error: 'Internal server error' 
    }, { status: 500 })
  }
}

// GET: Retrieve recent alerts for a device or all devices
export async function GET(request: NextRequest) {
  try {
    const supabase = createAdminClient()
    if (!supabase) {
      return NextResponse.json({ 
        error: 'Service unavailable' 
      }, { status: 503 })
    }

    const { searchParams } = new URL(request.url)
    const deviceId = searchParams.get('device_id')
    const limit = parseInt(searchParams.get('limit') || '50')
    const severity = searchParams.get('severity')
    const alertType = searchParams.get('alert_type')

    let query = supabase
      .from('device_alerts')
      .select(`
        *,
        screens!inner (
          name,
          device_id,
          locations!inner (
            name
          )
        )
      `)
      .order('created_at', { ascending: false })
      .limit(limit)

    if (deviceId) {
      query = query.eq('device_id', deviceId)
    }

    if (severity) {
      query = query.eq('severity', severity)
    }

    if (alertType) {
      query = query.eq('alert_type', alertType)
    }

    const { data: alerts, error } = await query

    if (error) {
      console.error('Error fetching alerts:', error)
      return NextResponse.json({ 
        error: 'Failed to fetch alerts' 
      }, { status: 500 })
    }

    return NextResponse.json({
      success: true,
      alerts: alerts || [],
      count: alerts?.length || 0
    })

  } catch (error) {
    console.error('Alert fetch error:', error)
    return NextResponse.json({ 
      error: 'Internal server error' 
    }, { status: 500 })
  }
}

function generateEmailBody(
  alertType: string, 
  severity: string, 
  message: string, 
  deviceInfo: any,
  details: any,
  metricValue?: number,
  threshold?: number
): string {
  const deviceName = deviceInfo.name
  const locationName = deviceInfo.locations?.name || 'Unknown Location'
  const districtName = deviceInfo.locations?.districts?.name || 'Unknown District'
  
  let body = `Dear Team,\n\n`
  body += `A ${severity.toUpperCase()} alert has been triggered for device "${deviceName}" at ${locationName}.\n\n`
  body += `Alert Type: ${alertType.replace('_', ' ').toUpperCase()}\n`
  body += `Message: ${message}\n`
  body += `Device: ${deviceName}\n`
  body += `Location: ${locationName}\n`
  body += `District: ${districtName}\n`
  body += `Time: ${new Date().toLocaleString()}\n`

  if (metricValue !== undefined && threshold !== undefined) {
    body += `Metric Value: ${metricValue}\n`
    body += `Threshold: ${threshold}\n`
  }

  if (details && Object.keys(details).length > 0) {
    body += `\nAdditional Details:\n`
    Object.entries(details).forEach(([key, value]) => {
      body += `- ${key}: ${value}\n`
    })
  }

  body += `\nPlease investigate and take appropriate action.\n\n`
  body += `Best regards,\n`
  body += `Mesophy Digital Signage System`

  return body
}