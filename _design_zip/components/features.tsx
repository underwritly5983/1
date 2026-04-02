import { FileText, Users, Truck, ShieldCheck } from "lucide-react"

const features = [
  {
    icon: FileText,
    title: "IFTA Summarize",
    description:
      "Aggregates four quarters of IFTA returns into a concise workbook with charts, metrics, and narrative-ready summaries formatted for underwriting review.",
    color: "bg-brand-blue",
    lightBg: "bg-brand-blue/10",
    borderColor: "border-brand-blue/20",
  },
  {
    icon: Users,
    title: "Driver Confirm",
    description:
      "Reconciles driver rosters and abstracts to confirm completeness, validates dates against defined policy windows, and reviews metadata for authenticity.",
    color: "bg-brand-teal",
    lightBg: "bg-brand-teal/10",
    borderColor: "border-brand-teal/20",
  },
  {
    icon: Truck,
    title: "Vehicle List",
    description:
      "Ingests and normalizes client vehicle inventories, reduces extraneous fields, and standardizes records so underwriting captures only pertinent data.",
    color: "bg-brand-green",
    lightBg: "bg-brand-green/10",
    borderColor: "border-brand-green/20",
  },
  {
    icon: ShieldCheck,
    title: "Compliance",
    description:
      "Collects and analyzes CVOR II and SMS reports, highlights trends, repeat violators, and score movements, and surfaces summaries to support ongoing portfolio monitoring.",
    color: "bg-brand-yellow",
    lightBg: "bg-brand-yellow/10",
    borderColor: "border-brand-yellow/30",
  },
]

export function Features() {
  return (
    <section id="features" className="py-24 px-6">
      <div className="max-w-6xl mx-auto">
        <div className="text-center mb-16">
          <p className="text-sm font-semibold text-brand-teal uppercase tracking-wider mb-3">Core Modules</p>
          <h2 className="text-3xl md:text-4xl font-semibold tracking-tight text-brand-navy mb-4">
            Everything you need for underwriting
          </h2>
          <p className="text-lg text-muted-foreground max-w-2xl mx-auto">
            Four integrated modules designed to streamline your commercial auto underwriting workflow.
          </p>
        </div>

        <div className="grid md:grid-cols-2 gap-6">
          {features.map((feature) => (
            <div
              key={feature.title}
              className={`group p-8 rounded-xl bg-card border-2 ${feature.borderColor} hover:shadow-lg hover:shadow-brand-teal/5 transition-all duration-300`}
            >
              <div className={`w-14 h-14 rounded-xl ${feature.lightBg} flex items-center justify-center mb-6`}>
                <feature.icon className={`h-7 w-7 ${feature.color.replace('bg-', 'text-')}`} />
              </div>
              <h3 className="text-xl font-semibold text-brand-navy mb-3">{feature.title}</h3>
              <p className="text-muted-foreground leading-relaxed">{feature.description}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}
