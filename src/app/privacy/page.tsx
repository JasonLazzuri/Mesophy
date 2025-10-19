export default function PrivacyPolicyPage() {
  return (
    <div className="min-h-screen bg-gray-50 py-12 px-4 sm:px-6 lg:px-8">
      <div className="max-w-4xl mx-auto bg-white shadow-sm rounded-lg p-8">
        <h1 className="text-3xl font-bold text-gray-900 mb-8">Privacy Policy</h1>

        <div className="prose prose-gray max-w-none">
          <p className="text-sm text-gray-600 mb-6">
            <strong>Last Updated:</strong> {new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}
          </p>

          <section className="mb-8">
            <h2 className="text-2xl font-semibold text-gray-900 mb-4">1. Introduction</h2>
            <p className="text-gray-700 mb-4">
              Mesophy (&quot;we,&quot; &quot;our,&quot; or &quot;us&quot;) operates a digital signage platform that enables businesses
              to manage and display content on digital screens. This Privacy Policy explains how we collect, use,
              and protect your information when you use our web application and Android TV application.
            </p>
          </section>

          <section className="mb-8">
            <h2 className="text-2xl font-semibold text-gray-900 mb-4">2. Information We Collect</h2>

            <h3 className="text-xl font-semibold text-gray-800 mb-3">2.1 Information You Provide</h3>
            <ul className="list-disc pl-6 mb-4 text-gray-700 space-y-2">
              <li><strong>Account Information:</strong> Name, email address, and organization details when you create an account</li>
              <li><strong>Content:</strong> Media files (images, videos) and playlists you upload to display on your screens</li>
              <li><strong>Configuration Data:</strong> Screen settings, schedules, and display preferences</li>
            </ul>

            <h3 className="text-xl font-semibold text-gray-800 mb-3">2.2 Automatically Collected Information</h3>
            <ul className="list-disc pl-6 mb-4 text-gray-700 space-y-2">
              <li><strong>Device Information:</strong> Device type, operating system version, and unique device identifiers for paired screens</li>
              <li><strong>Usage Data:</strong> Screen activity, content playback logs, and sync timestamps</li>
              <li><strong>Network Information:</strong> IP address and connection status for device communication</li>
            </ul>
          </section>

          <section className="mb-8">
            <h2 className="text-2xl font-semibold text-gray-900 mb-4">3. How We Use Your Information</h2>
            <p className="text-gray-700 mb-4">We use the collected information to:</p>
            <ul className="list-disc pl-6 mb-4 text-gray-700 space-y-2">
              <li>Provide and maintain our digital signage service</li>
              <li>Deliver content to your registered display devices</li>
              <li>Synchronize schedules and media between the web platform and display devices</li>
              <li>Monitor device health and connectivity status</li>
              <li>Improve our service and develop new features</li>
              <li>Provide customer support and respond to inquiries</li>
              <li>Ensure security and prevent unauthorized access</li>
            </ul>
          </section>

          <section className="mb-8">
            <h2 className="text-2xl font-semibold text-gray-900 mb-4">4. Data Storage and Security</h2>
            <p className="text-gray-700 mb-4">
              We use Supabase (a secure cloud database platform) to store your data. Your information is:
            </p>
            <ul className="list-disc pl-6 mb-4 text-gray-700 space-y-2">
              <li>Encrypted in transit using industry-standard SSL/TLS protocols</li>
              <li>Stored in secure, SOC 2 Type II compliant data centers</li>
              <li>Protected by multi-tenant access controls and row-level security</li>
              <li>Backed up regularly to prevent data loss</li>
            </ul>
          </section>

          <section className="mb-8">
            <h2 className="text-2xl font-semibold text-gray-900 mb-4">5. Data Sharing and Disclosure</h2>
            <p className="text-gray-700 mb-4">
              We do not sell, rent, or share your personal information with third parties except:
            </p>
            <ul className="list-disc pl-6 mb-4 text-gray-700 space-y-2">
              <li><strong>Service Providers:</strong> Trusted third-party services (Supabase for database, Vercel for hosting) that help us operate our platform</li>
              <li><strong>Legal Requirements:</strong> When required by law, court order, or government regulation</li>
              <li><strong>Business Transfers:</strong> In connection with a merger, acquisition, or sale of assets (with notice to users)</li>
            </ul>
          </section>

          <section className="mb-8">
            <h2 className="text-2xl font-semibold text-gray-900 mb-4">6. Your Rights and Choices</h2>
            <p className="text-gray-700 mb-4">You have the right to:</p>
            <ul className="list-disc pl-6 mb-4 text-gray-700 space-y-2">
              <li><strong>Access:</strong> Request a copy of your personal data</li>
              <li><strong>Correction:</strong> Update or correct inaccurate information</li>
              <li><strong>Deletion:</strong> Request deletion of your account and associated data</li>
              <li><strong>Data Portability:</strong> Receive your data in a structured, machine-readable format</li>
              <li><strong>Opt-Out:</strong> Unsubscribe from promotional communications (service-related messages may still be sent)</li>
            </ul>
            <p className="text-gray-700 mb-4">
              To exercise these rights, please contact us at the email address provided below.
            </p>
          </section>

          <section className="mb-8">
            <h2 className="text-2xl font-semibold text-gray-900 mb-4">7. Data Retention</h2>
            <p className="text-gray-700 mb-4">
              We retain your information for as long as your account is active or as needed to provide services.
              When you delete your account, we will delete or anonymize your personal information within 30 days,
              except where we are required to retain it for legal or regulatory purposes.
            </p>
          </section>

          <section className="mb-8">
            <h2 className="text-2xl font-semibold text-gray-900 mb-4">8. Children&apos;s Privacy</h2>
            <p className="text-gray-700 mb-4">
              Our service is not directed to children under 13 years of age. We do not knowingly collect
              personal information from children under 13. If you believe we have collected information from
              a child under 13, please contact us immediately.
            </p>
          </section>

          <section className="mb-8">
            <h2 className="text-2xl font-semibold text-gray-900 mb-4">9. International Data Transfers</h2>
            <p className="text-gray-700 mb-4">
              Your information may be transferred to and processed in countries other than your country of residence.
              These countries may have different data protection laws. We ensure appropriate safeguards are in place
              to protect your information in accordance with this Privacy Policy.
            </p>
          </section>

          <section className="mb-8">
            <h2 className="text-2xl font-semibold text-gray-900 mb-4">10. Cookies and Tracking</h2>
            <p className="text-gray-700 mb-4">
              We use essential cookies and similar technologies to:
            </p>
            <ul className="list-disc pl-6 mb-4 text-gray-700 space-y-2">
              <li>Maintain your login session</li>
              <li>Remember your preferences</li>
              <li>Ensure security and prevent fraud</li>
            </ul>
            <p className="text-gray-700 mb-4">
              You can control cookies through your browser settings, but disabling cookies may affect
              the functionality of our service.
            </p>
          </section>

          <section className="mb-8">
            <h2 className="text-2xl font-semibold text-gray-900 mb-4">11. Changes to This Privacy Policy</h2>
            <p className="text-gray-700 mb-4">
              We may update this Privacy Policy from time to time. We will notify you of any material changes
              by posting the new Privacy Policy on this page and updating the &quot;Last Updated&quot; date.
              We encourage you to review this Privacy Policy periodically.
            </p>
          </section>

          <section className="mb-8">
            <h2 className="text-2xl font-semibold text-gray-900 mb-4">12. Contact Us</h2>
            <p className="text-gray-700 mb-4">
              If you have any questions about this Privacy Policy or our privacy practices, please contact us at:
            </p>
            <div className="bg-gray-50 p-4 rounded-md">
              <p className="text-gray-700">
                <strong>Email:</strong> privacy@mesophy.com
              </p>
              <p className="text-gray-700 mt-2">
                <strong>Mesophy</strong><br />
                Digital Signage Platform
              </p>
            </div>
          </section>

          <section className="mb-8">
            <h2 className="text-2xl font-semibold text-gray-900 mb-4">13. Specific Platform Information</h2>

            <h3 className="text-xl font-semibold text-gray-800 mb-3">Android TV Application</h3>
            <p className="text-gray-700 mb-4">
              Our Android TV application:
            </p>
            <ul className="list-disc pl-6 mb-4 text-gray-700 space-y-2">
              <li>Requires internet connection to sync content from your account</li>
              <li>Stores downloaded media files locally on the device for playback</li>
              <li>Sends device status and playback logs to our servers for monitoring</li>
              <li>Does not access personal files, contacts, or other apps on the device</li>
              <li>Does not use the camera, microphone, or location services</li>
              <li>Can be uninstalled at any time through standard Android settings</li>
            </ul>

            <h3 className="text-xl font-semibold text-gray-800 mb-3">Required Permissions</h3>
            <p className="text-gray-700 mb-4">The Android TV app requests the following permissions:</p>
            <ul className="list-disc pl-6 mb-4 text-gray-700 space-y-2">
              <li><strong>Internet Access:</strong> To download content and sync with your account</li>
              <li><strong>Network State:</strong> To detect connectivity and manage downloads</li>
              <li><strong>Boot Completed:</strong> To automatically start the app on device power-on (optional, for kiosk mode)</li>
              <li><strong>Wake Lock:</strong> To keep the screen on during content playback</li>
            </ul>
          </section>

          <div className="border-t border-gray-200 pt-6 mt-8">
            <p className="text-sm text-gray-600">
              By using our service, you acknowledge that you have read and understood this Privacy Policy
              and agree to the collection, use, and disclosure of your information as described herein.
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}
