'use client'

import { useState, useEffect } from 'react'
import { CheckCircle, AlertCircle, Info, X } from 'lucide-react'

interface ToastProps {
  type: 'success' | 'error' | 'info'
  title: string
  message?: string
  duration?: number
  onClose?: () => void
}

export default function Toast({ type, title, message, duration = 5000, onClose }: ToastProps) {
  const [isVisible, setIsVisible] = useState(true)
  const [isLeaving, setIsLeaving] = useState(false)

  useEffect(() => {
    if (duration > 0) {
      const timer = setTimeout(() => {
        handleClose()
      }, duration)
      return () => clearTimeout(timer)
    }
  }, [duration])

  const handleClose = () => {
    setIsLeaving(true)
    setTimeout(() => {
      setIsVisible(false)
      onClose?.()
    }, 300) // Animation duration
  }

  const getIcon = () => {
    switch (type) {
      case 'success':
        return <CheckCircle className="h-5 w-5 text-green-600" />
      case 'error':
        return <AlertCircle className="h-5 w-5 text-red-600" />
      case 'info':
        return <Info className="h-5 w-5 text-blue-600" />
    }
  }

  const getStyles = () => {
    switch (type) {
      case 'success':
        return 'bg-green-50 border-green-200'
      case 'error':
        return 'bg-red-50 border-red-200'
      case 'info':
        return 'bg-blue-50 border-blue-200'
    }
  }

  if (!isVisible) return null

  return (
    <div
      className={`
        fixed top-4 right-4 z-50 max-w-sm w-full sm:w-auto min-w-80
        transform transition-all duration-300 ease-in-out
        ${isLeaving ? 'translate-x-full opacity-0' : 'translate-x-0 opacity-100'}
      `}
    >
      <div className={`border rounded-lg shadow-lg ${getStyles()}`}>
        <div className="p-4">
          <div className="flex items-start">
            <div className="flex-shrink-0">
              {getIcon()}
            </div>
            <div className="ml-3 flex-1">
              <h3 className="text-sm font-medium text-gray-900">
                {title}
              </h3>
              {message && (
                <p className="mt-1 text-sm text-gray-600">
                  {message}
                </p>
              )}
            </div>
            <div className="ml-4 flex-shrink-0">
              <button
                className="inline-flex text-gray-400 hover:text-gray-600 focus:outline-none focus:text-gray-600"
                onClick={handleClose}
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}