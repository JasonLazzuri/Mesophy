import Link from 'next/link'

export default function HeroNavigation() {
  return (
    <nav className="bg-white shadow-sm border-b">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex justify-between items-center py-6">
          <div className="flex items-center">
            <h1 className="text-2xl font-bold text-indigo-600">MESOPHY</h1>
            <span className="ml-2 text-sm text-gray-600">Digital Signage Platform</span>
          </div>
          
          <div className="flex items-center space-x-4">
            <Link 
              href="/login"
              className="text-gray-600 hover:text-gray-900 font-medium"
            >
              Sign In
            </Link>
            <Link
              href="/login"
              className="bg-indigo-600 text-white px-4 py-2 rounded-md hover:bg-indigo-700 font-medium"
            >
              Get Started
            </Link>
          </div>
        </div>
      </div>
    </nav>
  )
}