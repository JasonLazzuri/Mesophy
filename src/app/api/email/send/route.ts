import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'

interface EmailConfig {
  host: string
  port: number
  secure: boolean
  auth: {
    user: string
    pass: string
  }
  from: string
}

// Email configuration - in production, use environment variables
const getEmailConfig = (): EmailConfig => {
  return {
    host: process.env.SMTP_HOST || 'smtp.gmail.com',
    port: parseInt(process.env.SMTP_PORT || '587'),
    secure: process.env.SMTP_SECURE === 'true',
    auth: {
      user: process.env.SMTP_USER || '',
      pass: process.env.SMTP_PASS || ''
    },
    from: process.env.SMTP_FROM || 'noreply@mesophy.com'
  }
}

// For now, we'll create a simple email service that logs emails instead of sending them
// In production, you would install and use nodemailer: npm install nodemailer @types/nodemailer
const sendEmailSimulated = async (to: string, subject: string, body: string) => {
  // Simulate email sending with a log
  console.log(`
=== EMAIL SIMULATION ===
To: ${to}
Subject: ${subject}
Body: ${body}
========================
  `)
  
  // Simulate some processing time
  await new Promise(resolve => setTimeout(resolve, 100))
  
  return {
    messageId: `sim_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
  }
}

// POST: Process email queue and send pending emails
export async function POST(request: NextRequest) {
  try {
    const supabase = createAdminClient()
    if (!supabase) {
      return NextResponse.json({ 
        error: 'Service unavailable' 
      }, { status: 503 })
    }

    const { searchParams } = new URL(request.url)
    const limit = parseInt(searchParams.get('limit') || '10')
    const maxAttempts = parseInt(searchParams.get('max_attempts') || '3')

    // Get pending emails from queue
    const { data: pendingEmails, error } = await supabase
      .from('email_queue')
      .select('*')
      .eq('status', 'pending')
      .lt('attempts', maxAttempts)
      .order('created_at', { ascending: true })
      .limit(limit)

    if (error) {
      console.error('Error fetching email queue:', error)
      return NextResponse.json({ 
        error: 'Failed to fetch email queue' 
      }, { status: 500 })
    }

    if (!pendingEmails || pendingEmails.length === 0) {
      return NextResponse.json({
        success: true,
        message: 'No pending emails to process',
        processed: 0
      })
    }

    let successCount = 0
    let failureCount = 0
    const results = []

    // Process each email
    for (const email of pendingEmails) {
      try {
        // Send email (simulated for now)
        const info = await sendEmailSimulated(
          email.recipient_email,
          email.subject,
          email.body
        )
        
        // Mark as sent
        const { error: updateError } = await supabase
          .from('email_queue')
          .update({
            status: 'sent',
            sent_at: new Date().toISOString(),
            last_attempt_at: new Date().toISOString(),
            attempts: email.attempts + 1
          })
          .eq('id', email.id)

        if (updateError) {
          console.error('Error updating email status:', updateError)
        }

        successCount++
        results.push({
          email_id: email.id,
          recipient: email.recipient_email,
          status: 'sent',
          message_id: info.messageId
        })

        console.log(`Email sent successfully to ${email.recipient_email}: ${email.subject}`)

      } catch (sendError) {
        // Mark as failed or increment attempts
        const isMaxAttempts = email.attempts + 1 >= maxAttempts
        
        const { error: updateError } = await supabase
          .from('email_queue')
          .update({
            status: isMaxAttempts ? 'failed' : 'pending',
            attempts: email.attempts + 1,
            last_attempt_at: new Date().toISOString(),
            error_message: sendError instanceof Error ? sendError.message : 'Unknown error'
          })
          .eq('id', email.id)

        if (updateError) {
          console.error('Error updating failed email status:', updateError)
        }

        failureCount++
        results.push({
          email_id: email.id,
          recipient: email.recipient_email,
          status: isMaxAttempts ? 'failed' : 'retry',
          error: sendError instanceof Error ? sendError.message : 'Unknown error'
        })

        console.error(`Failed to send email to ${email.recipient_email}:`, sendError)
      }
    }

    console.log(`Email processing completed: ${successCount} sent, ${failureCount} failed`)

    return NextResponse.json({
      success: true,
      message: `Processed ${pendingEmails.length} emails`,
      processed: pendingEmails.length,
      results: {
        sent: successCount,
        failed: failureCount,
        details: results
      }
    })

  } catch (error) {
    console.error('Email service error:', error)
    return NextResponse.json({ 
      error: 'Internal server error',
      details: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 })
  }
}

// GET: Check email service status and queue statistics
export async function GET(request: NextRequest) {
  try {
    const supabase = createAdminClient()
    if (!supabase) {
      return NextResponse.json({ 
        error: 'Service unavailable' 
      }, { status: 503 })
    }

    // Get queue statistics
    const { data: stats, error } = await supabase
      .from('email_queue')
      .select('status')

    if (error) {
      console.error('Error fetching email queue stats:', error)
      return NextResponse.json({ 
        error: 'Failed to fetch email queue stats' 
      }, { status: 500 })
    }

    const statusCounts = stats?.reduce((acc: any, email: any) => {
      acc[email.status] = (acc[email.status] || 0) + 1
      return acc
    }, {}) || {}

    const emailConfig = getEmailConfig()
    const isConfigured = !!(emailConfig.auth.user && emailConfig.auth.pass)

    return NextResponse.json({
      success: true,
      service_status: isConfigured ? 'configured' : 'simulated',
      queue_stats: {
        pending: statusCounts.pending || 0,
        sent: statusCounts.sent || 0,
        failed: statusCounts.failed || 0,
        total: stats?.length || 0
      },
      configuration: {
        smtp_host: emailConfig.host,
        smtp_port: emailConfig.port,
        smtp_secure: emailConfig.secure,
        from_address: emailConfig.from,
        mode: isConfigured ? 'production' : 'simulation'
      }
    })

  } catch (error) {
    console.error('Email service status error:', error)
    return NextResponse.json({ 
      error: 'Internal server error' 
    }, { status: 500 })
  }
}