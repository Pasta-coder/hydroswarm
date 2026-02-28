'use client'

import { PricingTable } from '@clerk/nextjs'
import Navbar from '../components/navbar'

export default function PricingPage() {
  return (
    <div className="min-h-screen bg-black text-white font-mono">
      <Navbar />

      {/* Hero Section */}
      <section className="relative py-16 sm:py-20 px-6">
        <div className="max-w-4xl mx-auto text-center">
          <h1 className="text-4xl sm:text-5xl font-bold tracking-tight mb-6">
            Simple, Transparent Pricing
          </h1>
          <p className="text-lg text-gray-400 mb-8 max-w-2xl mx-auto">
            Choose the perfect plan for your water management and flood monitoring needs. All plans include
            our cutting-edge AI-powered multi-agent system.
          </p>
        </div>
      </section>

      {/* Clerk Pricing Table */}
      <section className="py-12 px-6 pb-24">
        <div className="max-w-4xl mx-auto">
          <PricingTable />
        </div>
      </section>

      {/* FAQ Section */}
      <section className="py-16 px-6 border-t border-gray-800">
        <div className="max-w-3xl mx-auto">
          <h2 className="text-3xl font-bold text-center mb-12">Frequently Asked Questions</h2>
          <div className="space-y-6">
            {[
              {
                q: 'Can I change my plan anytime?',
                a: 'Yes! You can upgrade or downgrade your plan at any time. Changes take effect immediately.',
              },
              {
                q: 'Do you offer a free trial?',
                a: 'Absolutely! All plans come with a 14-day free trial with full access to all features.',
              },
              {
                q: 'What payment methods do you accept?',
                a: 'We accept all major credit cards, bank transfers, and wire transfers for Enterprise plans.',
              },
              {
                q: 'Is there a long-term contract?',
                a: 'No contracts required! You can cancel anytime, but we\'re confident you\'ll love our service.',
              },
            ].map((faq, idx) => (
              <div key={idx} className="border-l-2 border-cyan-500 pl-6 py-4">
                <h3 className="font-semibold text-lg mb-2">{faq.q}</h3>
                <p className="text-gray-400">{faq.a}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="py-16 px-6 bg-gradient-to-r from-cyan-900/20 to-transparent">
        <div className="max-w-3xl mx-auto text-center">
          <h2 className="text-3xl font-bold mb-6">Ready to protect your community?</h2>
          <p className="text-gray-400 mb-8 text-lg">
            Start your free plan today. Upgrade anytime.
          </p>
          <button className="bg-cyan-600 hover:bg-cyan-500 text-white px-8 py-3 rounded-lg font-semibold transition transform hover:scale-105 shadow-lg shadow-cyan-500/20">
            Get Started Free
          </button>
        </div>
      </section>
    </div>
  )
}