'use client'

import { useState, useEffect } from 'react'
import { MapPin, Building2, Check, ChevronDown, ChevronRight } from 'lucide-react'

interface Location {
  id: string
  name: string
}

interface District {
  id: string
  name: string
}

interface LocationsByDistrict {
  [districtId: string]: {
    district: District
    locations: Location[]
  }
}

interface LocationPickerProps {
  selectedLocationIds: string[]
  onLocationChange: (locationIds: string[]) => void
  className?: string
  label?: string
  required?: boolean
  placeholder?: string
}

export default function LocationPicker({
  selectedLocationIds,
  onLocationChange,
  className = '',
  label = 'Target Locations',
  required = false,
  placeholder = 'Select locations...'
}: LocationPickerProps) {
  const [locationsByDistrict, setLocationsByDistrict] = useState<LocationsByDistrict>({})
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [isOpen, setIsOpen] = useState(false)
  const [expandedDistricts, setExpandedDistricts] = useState<Set<string>>(new Set())

  useEffect(() => {
    fetchAccessibleLocations()
  }, [])

  const fetchAccessibleLocations = async () => {
    try {
      setLoading(true)
      const response = await fetch('/api/locations/accessible')
      if (!response.ok) {
        throw new Error('Failed to fetch locations')
      }
      const data = await response.json()
      setLocationsByDistrict(data.locationsByDistrict || {})
    } catch (err) {
      console.error('Error fetching locations:', err)
      setError(err instanceof Error ? err.message : 'Failed to load locations')
    } finally {
      setLoading(false)
    }
  }

  const toggleLocation = (locationId: string) => {
    const newSelection = selectedLocationIds.includes(locationId)
      ? selectedLocationIds.filter(id => id !== locationId)
      : [...selectedLocationIds, locationId]
    onLocationChange(newSelection)
  }

  const toggleDistrict = (districtId: string) => {
    const district = locationsByDistrict[districtId]
    if (!district) return

    const districtLocationIds = district.locations.map(loc => loc.id)
    const allSelected = districtLocationIds.every(id => selectedLocationIds.includes(id))
    
    if (allSelected) {
      // Deselect all locations in this district
      const newSelection = selectedLocationIds.filter(id => !districtLocationIds.includes(id))
      onLocationChange(newSelection)
    } else {
      // Select all locations in this district
      const newSelection = [...new Set([...selectedLocationIds, ...districtLocationIds])]
      onLocationChange(newSelection)
    }
  }

  const toggleDistrictExpansion = (districtId: string) => {
    const newExpanded = new Set(expandedDistricts)
    if (newExpanded.has(districtId)) {
      newExpanded.delete(districtId)
    } else {
      newExpanded.add(districtId)
    }
    setExpandedDistricts(newExpanded)
  }

  const getSelectedLocationNames = () => {
    const names: string[] = []
    Object.values(locationsByDistrict).forEach(district => {
      district.locations.forEach(location => {
        if (selectedLocationIds.includes(location.id)) {
          names.push(location.name)
        }
      })
    })
    return names
  }

  const selectedNames = getSelectedLocationNames()
  const displayText = selectedNames.length === 0 
    ? placeholder 
    : selectedNames.length <= 3 
      ? selectedNames.join(', ')
      : `${selectedNames.slice(0, 2).join(', ')} +${selectedNames.length - 2} more`

  if (loading) {
    return (
      <div className={`space-y-2 ${className}`}>
        <label className="block text-sm font-medium text-gray-700">
          {label} {required && <span className="text-red-500">*</span>}
        </label>
        <div className="w-full px-3 py-2 border border-gray-300 rounded-md bg-gray-50">
          <div className="animate-pulse flex items-center">
            <div className="h-4 bg-gray-300 rounded w-32"></div>
          </div>
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className={`space-y-2 ${className}`}>
        <label className="block text-sm font-medium text-gray-700">
          {label} {required && <span className="text-red-500">*</span>}
        </label>
        <div className="w-full px-3 py-2 border border-red-300 rounded-md bg-red-50 text-red-700 text-sm">
          {error}
        </div>
      </div>
    )
  }

  return (
    <div className={`space-y-2 relative ${className}`}>
      <label className="block text-sm font-medium text-gray-700">
        {label} {required && <span className="text-red-500">*</span>}
      </label>
      
      {/* Dropdown trigger */}
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className="w-full px-3 py-2 text-left border border-gray-300 rounded-md focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 bg-white flex items-center justify-between"
      >
        <span className={selectedNames.length === 0 ? 'text-gray-500' : 'text-gray-900'}>
          {displayText}
        </span>
        <ChevronDown className={`h-4 w-4 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
      </button>

      {/* Dropdown menu */}
      {isOpen && (
        <div className="absolute z-50 w-full mt-1 bg-white border border-gray-300 rounded-md shadow-lg max-h-64 overflow-y-auto">
          <div className="p-2">
            {Object.keys(locationsByDistrict).length === 0 ? (
              <div className="text-sm text-gray-500 text-center py-4">
                No locations available
              </div>
            ) : (
              Object.entries(locationsByDistrict).map(([districtId, district]) => {
                const districtLocationIds = district.locations.map(loc => loc.id)
                const allSelected = districtLocationIds.every(id => selectedLocationIds.includes(id))
                const someSelected = districtLocationIds.some(id => selectedLocationIds.includes(id))
                const isExpanded = expandedDistricts.has(districtId)

                return (
                  <div key={districtId} className="mb-2">
                    {/* District header */}
                    <div className="flex items-center space-x-2 p-2 hover:bg-gray-50 rounded">
                      <button
                        type="button"
                        onClick={() => toggleDistrictExpansion(districtId)}
                        className="flex items-center space-x-1 flex-1 text-left"
                      >
                        {isExpanded ? (
                          <ChevronDown className="h-4 w-4 text-gray-400" />
                        ) : (
                          <ChevronRight className="h-4 w-4 text-gray-400" />
                        )}
                        <Building2 className="h-4 w-4 text-gray-600" />
                        <span className="text-sm font-medium text-gray-900">
                          {district.district.name}
                        </span>
                        <span className="text-xs text-gray-500">
                          ({district.locations.length} locations)
                        </span>
                      </button>
                      
                      <button
                        type="button"
                        onClick={() => toggleDistrict(districtId)}
                        className={`p-1 rounded border-2 ${
                          allSelected
                            ? 'bg-indigo-600 border-indigo-600'
                            : someSelected
                            ? 'bg-indigo-200 border-indigo-400'
                            : 'border-gray-300 hover:border-gray-400'
                        }`}
                      >
                        <Check className={`h-3 w-3 ${allSelected ? 'text-white' : someSelected ? 'text-indigo-600' : 'text-transparent'}`} />
                      </button>
                    </div>

                    {/* Locations list */}
                    {isExpanded && (
                      <div className="ml-6 space-y-1">
                        {district.locations.map((location) => (
                          <label
                            key={location.id}
                            className="flex items-center space-x-2 p-2 hover:bg-gray-50 rounded cursor-pointer"
                          >
                            <input
                              type="checkbox"
                              checked={selectedLocationIds.includes(location.id)}
                              onChange={() => toggleLocation(location.id)}
                              className="rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
                            />
                            <MapPin className="h-4 w-4 text-gray-400" />
                            <span className="text-sm text-gray-700">{location.name}</span>
                          </label>
                        ))}
                      </div>
                    )}
                  </div>
                )
              })
            )}
          </div>
        </div>
      )}

      {selectedNames.length > 0 && (
        <p className="text-xs text-gray-500 mt-1">
          {selectedNames.length} location{selectedNames.length !== 1 ? 's' : ''} selected
        </p>
      )}
    </div>
  )
}