import Link from 'next/link'
import {
  SignInButton,
  SignUpButton,
  SignedIn,
  SignedOut,
  UserButton,
} from '@clerk/nextjs'
import { Waves, Github } from 'lucide-react'

export default function Navbar() {
  return (
    <nav className="sticky top-0 z-50 w-full bg-black/85 backdrop-blur-md border-b border-gray-800">
      <div className="flex items-center justify-between px-6 sm:px-8 py-4">
        {/* Logo */}
        <Link href="/" className="flex items-center gap-2 hover:opacity-80 transition">
          <Waves className="text-cyan-400 w-6 h-6" />
          <span className="text-lg sm:text-xl font-semibold tracking-tight">HYDROSWARM</span>
        </Link>

        {/* Right Side - Navigation, GitHub, Pricing, Auth */}
        <div className="flex items-center gap-6">
          {/* GitHub Link */}
          <a 
            href="https://github.com/Pasta-coder/hydroswarm" 
            target="_blank"
            rel="noopener noreferrer"
            className="text-gray-300 hover:text-cyan-400 transition"
          >
            <Github className="w-5 h-5" />
          </a>

          {/* Pricing Link */}
          <Link href="/pricing" className="text-gray-300 hover:text-cyan-400 transition font-medium text-sm">
            Pricing
          </Link>

          {/* Auth Section */}
          <SignedOut>
            <div className="flex items-center gap-3">
              <SignInButton mode="modal">
                <button className="text-gray-300 hover:text-white transition font-medium text-sm">
                  Sign In
                </button>
              </SignInButton>
              <SignUpButton mode="modal">
                <button className="bg-cyan-600 hover:bg-cyan-500 text-white rounded-lg font-medium text-sm px-4 py-2 transition">
                  Get Started
                </button>
              </SignUpButton>
            </div>
          </SignedOut>
          <SignedIn>
            <UserButton />
          </SignedIn>
        </div>
      </div>
    </nav>
  )
}