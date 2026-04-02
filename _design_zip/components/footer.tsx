import Link from "next/link"
import Image from "next/image"

export function Footer() {
  return (
    <footer className="py-16 px-6 bg-brand-navy">
      <div className="max-w-6xl mx-auto">
        <div className="grid md:grid-cols-4 gap-8 mb-12">
          <div className="md:col-span-2">
            <Link href="/" className="flex items-center gap-3 mb-4">
              <Image 
                src="/images/logo-small.png" 
                alt="Underwritly" 
                width={48} 
                height={48}
                className="h-12 w-12"
              />
              <span className="text-xl font-semibold tracking-tight text-white">Underwritly</span>
            </Link>
            <p className="text-white/70 max-w-sm leading-relaxed">
              Purpose-built insurance broker software for underwriting and risk identification.
            </p>
          </div>

          <div>
            <h4 className="font-semibold text-brand-teal mb-4">Product</h4>
            <ul className="space-y-3">
              <li>
                <Link href="#features" className="text-white/70 hover:text-brand-green transition-colors">
                  Features
                </Link>
              </li>
              <li>
                <Link href="#how-it-works" className="text-white/70 hover:text-brand-green transition-colors">
                  How It Works
                </Link>
              </li>
              <li>
                <Link href="#pricing" className="text-white/70 hover:text-brand-green transition-colors">
                  Pricing
                </Link>
              </li>
            </ul>
          </div>

          <div>
            <h4 className="font-semibold text-brand-teal mb-4">Company</h4>
            <ul className="space-y-3">
              <li>
                <Link href="/about" className="text-white/70 hover:text-brand-green transition-colors">
                  About
                </Link>
              </li>
              <li>
                <Link href="/contact" className="text-white/70 hover:text-brand-green transition-colors">
                  Contact
                </Link>
              </li>
              <li>
                <Link href="/privacy" className="text-white/70 hover:text-brand-green transition-colors">
                  Privacy Policy
                </Link>
              </li>
              <li>
                <Link href="/terms" className="text-white/70 hover:text-brand-green transition-colors">
                  Terms of Service
                </Link>
              </li>
            </ul>
          </div>
        </div>

        <div className="pt-8 border-t border-white/20 flex flex-col md:flex-row items-center justify-between gap-4">
          <p className="text-sm text-white/60">
            &copy; {new Date().getFullYear()} Underwritly. All rights reserved.
          </p>
          <div className="flex items-center gap-6">
            <Link href="#" className="text-sm text-white/60 hover:text-brand-green transition-colors">
              LinkedIn
            </Link>
            <Link href="#" className="text-sm text-white/60 hover:text-brand-green transition-colors">
              Twitter
            </Link>
          </div>
        </div>
      </div>
    </footer>
  )
}
