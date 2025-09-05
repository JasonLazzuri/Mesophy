export default function FeatureShowcase() {
  const features = [
    {
      icon: "🏢",
      title: "Multi-Location Management",
      description: "Hierarchical structure: Organizations → Districts → Locations → Screens. Perfect for restaurant chains and retail networks with centralized control."
    },
    {
      icon: "📺",
      title: "Simple Device Pairing", 
      description: "Android TV and Raspberry Pi devices connect with generated pairing codes. No complex setup - devices show codes, you enter them in the dashboard."
    },
    {
      icon: "🎵",
      title: "Easy Playlist Management",
      description: "Intuitive content organization and scheduling. Create playlists, set display times, and manage media across all your locations effortlessly."
    },
    {
      icon: "⚡",
      title: "Real-Time Updates",
      description: "99%+ reliable HTTP polling notification system ensures your content updates reach devices instantly. No missed updates or connectivity issues."
    },
    {
      icon: "🔒",
      title: "Enterprise Security",
      description: "Multi-tenant architecture with role-based access control. Super admins, district managers, and location managers each get appropriate permissions."
    },
    {
      icon: "☁️",
      title: "Cloud-First Architecture",
      description: "Built on Next.js 15, TypeScript, and Supabase. Deployed on Vercel for maximum reliability and scalability with zero infrastructure management."
    }
  ]

  const useCases = [
    {
      title: "Restaurant Chains",
      description: "Menu boards, daily specials, promotions across multiple locations",
      icon: "🍽️"
    },
    {
      title: "Retail Networks", 
      description: "Product displays, seasonal campaigns, store-specific messaging",
      icon: "🏪"
    },
    {
      title: "Corporate Communications",
      description: "Office displays, lobby screens, campus-wide announcements",
      icon: "🏢"
    }
  ]

  return (
    <div className="py-16 bg-white">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* Features Section */}
        <div className="text-center mb-16">
          <h2 className="text-3xl font-extrabold text-gray-900 sm:text-4xl">
            Everything you need to manage digital signage at scale
          </h2>
          <p className="mt-4 text-xl text-gray-600">
            Built for enterprise requirements with the simplicity your team needs
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8 mb-20">
          {features.map((feature, index) => (
            <div key={index} className="p-6 bg-gray-50 rounded-lg hover:shadow-md transition-shadow">
              <div className="text-3xl mb-4">{feature.icon}</div>
              <h3 className="text-lg font-semibold text-gray-900 mb-2">{feature.title}</h3>
              <p className="text-gray-600">{feature.description}</p>
            </div>
          ))}
        </div>

        {/* Use Cases Section */}
        <div className="text-center mb-16">
          <h2 className="text-3xl font-extrabold text-gray-900 sm:text-4xl">
            Perfect for any industry
          </h2>
          <p className="mt-4 text-xl text-gray-600">
            Trusted by organizations that need reliable, scalable digital signage
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-8 mb-16">
          {useCases.map((useCase, index) => (
            <div key={index} className="text-center p-8 border border-gray-200 rounded-lg hover:border-indigo-300 transition-colors">
              <div className="text-4xl mb-4">{useCase.icon}</div>
              <h3 className="text-xl font-semibold text-gray-900 mb-4">{useCase.title}</h3>
              <p className="text-gray-600">{useCase.description}</p>
            </div>
          ))}
        </div>

        {/* Technology Section */}
        <div className="bg-indigo-50 rounded-2xl p-8 text-center">
          <h2 className="text-2xl font-bold text-gray-900 mb-4">Modern Technology Stack</h2>
          <p className="text-gray-600 mb-6 max-w-3xl mx-auto">
            Built with cutting-edge technologies for maximum performance, reliability, and scalability. 
            Our HTTP polling system delivers industry-leading 99%+ notification delivery rates.
          </p>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
            <div className="bg-white p-3 rounded-lg">
              <div className="font-semibold text-gray-900">Next.js 15</div>
              <div className="text-gray-600">React Framework</div>
            </div>
            <div className="bg-white p-3 rounded-lg">
              <div className="font-semibold text-gray-900">TypeScript</div>
              <div className="text-gray-600">Type Safety</div>
            </div>
            <div className="bg-white p-3 rounded-lg">
              <div className="font-semibold text-gray-900">Supabase</div>
              <div className="text-gray-600">Database & Auth</div>
            </div>
            <div className="bg-white p-3 rounded-lg">
              <div className="font-semibold text-gray-900">Vercel</div>
              <div className="text-gray-600">Cloud Deployment</div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}