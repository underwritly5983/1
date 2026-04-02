import { Button } from "@/components/ui/button"
import { ArrowRight } from "lucide-react"
import Link from "next/link"
import Image from "next/image"

export function Hero() {
  return (
    <section className="pt-28 pb-20 px-6 bg-gradient-to-b from-white to-background">
      <div className="max-w-4xl mx-auto text-center">
        <div className="flex justify-center mb-8">
          <Image 
            src="/images/logo-small.png" 
            alt="Underwritly Shield" 
            width={96} 
            height={96}
            className="h-24 w-24"
          />
        </div>

        <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-brand-yellow/20 border border-brand-yellow/50 mb-8">
          <span className="w-2 h-2 rounded-full bg-brand-yellow animate-pulse"></span>
          <span className="text-sm text-brand-navy font-medium">Now accepting early access requests</span>
        </div>

        <h1 className="text-4xl md:text-6xl font-semibold tracking-tight text-foreground leading-tight text-balance mb-6">
          Purpose-built for underwriting and risk identification
        </h1>

        <p className="text-lg md:text-xl text-muted-foreground max-w-2xl mx-auto mb-10 text-pretty leading-relaxed">
          Consolidate IFTA reporting, driver verification, fleet inventories, and regulatory filings into a single, review-ready workflow for your underwriting team.
        </p>

        <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
          <Button size="lg" asChild className="min-w-[180px] bg-primary hover:bg-accent text-primary-foreground shadow-lg">
            <Link href="#early-access">
              Request early access
              <ArrowRight className="ml-2 h-4 w-4" />
            </Link>
          </Button>
          <Button variant="outline" size="lg" asChild className="min-w-[180px] border-primary/30 text-foreground hover:bg-primary/5 hover:border-primary">
            <Link href="#features">View capabilities</Link>
          </Button>
        </div>
      </div>
    </section>
  )
}
