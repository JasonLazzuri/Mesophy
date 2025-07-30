'use client'

import { Users, UserPlus, Shield } from 'lucide-react'

export default function UsersPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold text-gray-900 tracking-tight flex items-center">
          <Users className="h-8 w-8 mr-3 text-indigo-600" />
          User Management
        </h1>
        <p className="text-gray-600 mt-2">
          Manage user accounts, roles, and permissions across your organization
        </p>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-12 text-center">
        <Shield className="h-16 w-16 text-gray-400 mx-auto mb-4" />
        <h3 className="text-lg font-semibold text-gray-900 mb-2">User Management Coming Soon</h3>
        <p className="text-gray-600 max-w-md mx-auto">
          This section will allow you to manage user accounts, assign roles, and control 
          access permissions for your digital signage platform.
        </p>
        <div className="mt-6 grid grid-cols-1 md:grid-cols-3 gap-4 max-w-2xl mx-auto">
          <div className="p-4 bg-gray-50 rounded-lg">
            <UserPlus className="h-8 w-8 text-blue-600 mx-auto mb-2" />
            <h4 className="font-medium text-gray-900">Add Users</h4>
            <p className="text-sm text-gray-600 mt-1">Invite new team members</p>
          </div>
          <div className="p-4 bg-gray-50 rounded-lg">
            <Shield className="h-8 w-8 text-purple-600 mx-auto mb-2" />
            <h4 className="font-medium text-gray-900">Role Management</h4>
            <p className="text-sm text-gray-600 mt-1">Assign super admin, district, location roles</p>
          </div>
          <div className="p-4 bg-gray-50 rounded-lg">
            <Users className="h-8 w-8 text-green-600 mx-auto mb-2" />
            <h4 className="font-medium text-gray-900">Team Overview</h4>
            <p className="text-sm text-gray-600 mt-1">See all users and their permissions</p>
          </div>
        </div>
      </div>
    </div>
  )
}