import { Upload, Cpu, FileCheck } from "lucide-react"

const steps = [
  {
    number: "01",
    icon: Upload,
    title: "Upload your documents",
    description:
      "Drop in IFTA returns, driver abstracts, vehicle schedules, and compliance reports. Our system accepts all standard formats.",
    color: "text-brand-blue",
    bgColor: "bg-brand-blue",
  },
  {
    number: "02",
    icon: Cpu,
    title: "Automated analysis",
    description:
      "Underwritly processes, validates, and cross-references your data against policy requirements and industry standards.",
    color: "text-brand-teal",
    bgColor: "bg-brand-teal",
  },
  {
    number: "03",
    icon: FileCheck,
    title: "Review-ready output",
    description:
      "Receive structured summaries, flagged exceptions, and formatted workbooks ready for underwriting decisions.",
    color: "text-brand-green",
    bgColor: "bg-brand-green",
  },
]

export function HowItWorks() {
  return (
    <section id="how-it-works" className="py-24 px-6 bg-gradient-to-br from-brand-navy via-brand-navy to-brand-blue/90">
      <div className="max-w-6xl mx-auto">
        <div className="text-center mb-16">
          <p className="text-sm font-semibold text-brand-teal uppercase tracking-wider mb-3">Process</p>
          <h2 className="text-3xl md:text-4xl font-semibold tracking-tight text-white mb-4">
            How it works
          </h2>
          <p className="text-lg text-white/70 max-w-2xl mx-auto">
            From document upload to underwriting decision in three simple steps.
          </p>
        </div>

        <div className="grid md:grid-cols-3 gap-8">
          {steps.map((step, index) => (
            <div key={step.number} className="relative">
              {index < steps.length - 1 && (
                <div className="hidden md:block absolute top-10 left-full w-full h-0.5 bg-gradient-to-r from-white/20 to-transparent -translate-x-1/2" />
              )}
              <div className={`w-20 h-20 rounded-2xl ${step.bgColor} flex items-center justify-center mb-6 shadow-lg`}>
                <step.icon className="h-10 w-10 text-white" />
              </div>
              <div className="text-sm font-semibold text-brand-yellow mb-2">Step {step.number}</div>
              <h3 className="text-xl font-semibold text-white mb-3">{step.title}</h3>
              <p className="text-white/70 leading-relaxed">{step.description}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}
