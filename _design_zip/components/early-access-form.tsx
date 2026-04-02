"use client"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { CheckCircle2, Sparkles } from "lucide-react"

export function EarlyAccessForm() {
  const [submitted, setSubmitted] = useState(false)
  const [isSubmitting, setIsSubmitting] = useState(false)

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    setIsSubmitting(true)
    // Simulate form submission
    await new Promise((resolve) => setTimeout(resolve, 1000))
    setIsSubmitting(false)
    setSubmitted(true)
  }

  if (submitted) {
    return (
      <section id="early-access" className="py-24 px-6">
        <div className="max-w-xl mx-auto text-center">
          <div className="w-20 h-20 rounded-full bg-gradient-to-br from-brand-green to-brand-teal flex items-center justify-center mx-auto mb-6 shadow-lg shadow-brand-green/25">
            <CheckCircle2 className="h-10 w-10 text-white" />
          </div>
          <h2 className="text-2xl font-semibold text-brand-navy mb-4">
            You are on the list
          </h2>
          <p className="text-muted-foreground leading-relaxed">
            Thank you for raising your hand for Underwritly. We have received your early access request and sent a confirmation to your work email. Our team will be in touch when onboarding opens for your organization.
          </p>
        </div>
      </section>
    )
  }

  return (
    <section id="early-access" className="py-24 px-6">
      <div className="max-w-xl mx-auto">
        <div className="text-center mb-12">
          <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-brand-yellow/10 border border-brand-yellow/30 mb-6">
            <Sparkles className="h-4 w-4 text-brand-yellow" />
            <span className="text-sm text-brand-yellow font-medium">Limited spots available</span>
          </div>
          <h2 className="text-3xl md:text-4xl font-semibold tracking-tight text-brand-navy mb-4">
            Request early access
          </h2>
          <p className="text-lg text-muted-foreground">
            Join the waitlist and be among the first to streamline your underwriting workflow.
          </p>
        </div>

        <form onSubmit={handleSubmit} className="bg-card p-8 rounded-2xl border-2 border-brand-teal/20 shadow-xl shadow-brand-teal/5">
          <div className="space-y-5">
            <div className="space-y-2">
              <Label htmlFor="name" className="text-brand-navy font-medium">Full name</Label>
              <Input 
                id="name" 
                name="name" 
                placeholder="Jane Smith" 
                required 
                className="border-border focus:border-brand-teal focus:ring-brand-teal/20"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="email" className="text-brand-navy font-medium">Work email</Label>
              <Input 
                id="email" 
                name="email" 
                type="email" 
                placeholder="jane@company.com" 
                required 
                className="border-border focus:border-brand-teal focus:ring-brand-teal/20"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="phone" className="text-brand-navy font-medium">Phone</Label>
              <Input 
                id="phone" 
                name="phone" 
                type="tel" 
                placeholder="(555) 123-4567" 
                className="border-border focus:border-brand-teal focus:ring-brand-teal/20"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="referral" className="text-brand-navy font-medium">Referral source</Label>
              <Select name="referral">
                <SelectTrigger className="border-border focus:border-brand-teal focus:ring-brand-teal/20">
                  <SelectValue placeholder="Select one" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="search">Search engine</SelectItem>
                  <SelectItem value="social">Social media</SelectItem>
                  <SelectItem value="colleague">Colleague or referral</SelectItem>
                  <SelectItem value="conference">Conference or industry event</SelectItem>
                  <SelectItem value="other">Other</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="usage" className="text-brand-navy font-medium">Estimated uses per month</Label>
              <Select name="usage">
                <SelectTrigger className="border-border focus:border-brand-teal focus:ring-brand-teal/20">
                  <SelectValue placeholder="Select a range" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="1-5">1-5</SelectItem>
                  <SelectItem value="5-10">5-10</SelectItem>
                  <SelectItem value="10-25">10-25</SelectItem>
                  <SelectItem value="25+">25+</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <Button 
              type="submit" 
              className="w-full bg-gradient-to-r from-brand-blue to-brand-teal hover:from-brand-teal hover:to-brand-green text-white shadow-lg shadow-brand-teal/25" 
              size="lg" 
              disabled={isSubmitting}
            >
              {isSubmitting ? "Submitting..." : "Submit request"}
            </Button>
          </div>
        </form>
      </div>
    </section>
  )
}
