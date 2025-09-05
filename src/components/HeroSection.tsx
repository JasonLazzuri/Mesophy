import Link from 'next/link'

export default function HeroSection() {
  return (
    <div className="bg-gradient-to-br from-indigo-50 to-white py-20">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="text-center">
          <h1 className="text-4xl tracking-tight font-extrabold text-gray-900 sm:text-5xl lg:text-6xl">
            <span className="block">Enterprise Digital Signage</span>
            <span className="block text-indigo-600">Management Made Simple</span>
          </h1>
          
          <p className="mt-5 max-w-md mx-auto text-base text-gray-500 sm:text-lg sm:max-w-3xl">
            Manage restaurant and retail displays across multiple locations with cloud-first reliability. 
            Built for enterprise scale with simple device pairing and intuitive content management.
          </p>
          
          <div className="mt-8 max-w-md mx-auto sm:flex sm:justify-center md:mt-12">
            <div className="rounded-md shadow">
              <Link
                href="/login"
                className="w-full flex items-center justify-center px-8 py-3 border border-transparent text-base font-medium rounded-md text-white bg-indigo-600 hover:bg-indigo-700 md:py-4 md:text-lg md:px-10"
              >
                Get Started
              </Link>
            </div>
            <div className="mt-3 sm:mt-0 sm:ml-3">
              <Link
                href="/login"
                className="w-full flex items-center justify-center px-8 py-3 border border-gray-300 text-base font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50 md:py-4 md:text-lg md:px-10"
              >
                Sign In
              </Link>
            </div>
          </div>
          
          <div className="mt-16">
            <p className="text-sm text-gray-600 mb-4">Trusted by restaurants and retail chains</p>
            <div className="bg-white p-8 rounded-xl shadow-lg max-w-4xl mx-auto">
              <div className="text-left">
                <h3 className="text-lg font-semibold text-gray-900 mb-4">Platform Highlights:</h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm text-gray-700">
                  <div className="flex items-center">
                    <div className="w-2 h-2 bg-green-500 rounded-full mr-3"></div>
                    Multi-tenant architecture: Organizations → Districts → Locations → Screens
                  </div>
                  <div className="flex items-center">
                    <div className="w-2 h-2 bg-green-500 rounded-full mr-3"></div>
                    Android TV & Raspberry Pi support with simple pairing codes
                  </div>
                  <div className="flex items-center">
                    <div className="w-2 h-2 bg-green-500 rounded-full mr-3"></div>
                    99%+ reliable HTTP polling notification system
                  </div>
                  <div className="flex items-center">
                    <div className="w-2 h-2 bg-green-500 rounded-full mr-3"></div>
                    Cloud-first deployment on modern infrastructure
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}