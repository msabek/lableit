import React from 'react';
import { Upload, Wand2, MousePointer, Download, ArrowRight, CheckCircle2 } from 'lucide-react';

const steps = [
  {
    number: '01',
    icon: Upload,
    title: 'Upload Your Data',
    description: 'Drag and drop your images or videos. We support all common formats including JPG, PNG, WebP, and MP4. Video frames are automatically extracted.',
    features: ['Batch upload support', 'Video frame extraction', 'Cloud storage integration'],
    color: 'indigo',
  },
  {
    number: '02',
    icon: Wand2,
    title: 'Define Your Classes',
    description: 'Create custom object classes with unique colors and detection thresholds. Import existing class definitions or start fresh.',
    features: ['Custom color coding', 'Adjustable thresholds', 'CSV import/export'],
    color: 'purple',
  },
  {
    number: '03',
    icon: MousePointer,
    title: 'AI-Powered Detection',
    description: 'Let SAM3 automatically detect and segment objects, or manually refine annotations. One-click batch processing for large datasets.',
    features: ['Text-prompt detection', 'Point & click refinement', 'Batch inference'],
    color: 'cyan',
  },
  {
    number: '04',
    icon: Download,
    title: 'Export & Deploy',
    description: 'Export your labeled dataset in any major format. Ready for training with PyTorch, TensorFlow, YOLO, and more.',
    features: ['8 export formats', 'ML-ready output', 'Metadata preservation'],
    color: 'emerald',
  },
];

const colorMap: Record<string, { bg: string; text: string; border: string; accent: string }> = {
  indigo: { bg: 'bg-indigo-100 dark:bg-indigo-500/20', text: 'text-indigo-600 dark:text-indigo-400', border: 'border-indigo-200 dark:border-indigo-500/30', accent: 'from-indigo-500 to-indigo-600' },
  purple: { bg: 'bg-purple-100 dark:bg-purple-500/20', text: 'text-purple-600 dark:text-purple-400', border: 'border-purple-200 dark:border-purple-500/30', accent: 'from-purple-500 to-purple-600' },
  cyan: { bg: 'bg-cyan-100 dark:bg-cyan-500/20', text: 'text-cyan-600 dark:text-cyan-400', border: 'border-cyan-200 dark:border-cyan-500/30', accent: 'from-cyan-500 to-cyan-600' },
  emerald: { bg: 'bg-emerald-100 dark:bg-emerald-500/20', text: 'text-emerald-600 dark:text-emerald-400', border: 'border-emerald-200 dark:border-emerald-500/30', accent: 'from-emerald-500 to-emerald-600' },
};

export default function HowItWorksSection() {
  return (
    <div className="max-w-6xl mx-auto w-full">
      {/* Section Header */}
      <div className="text-center mb-16">
        <h2 className="animate-on-scroll heading-lg mb-4">
          <span className="text-slate-800 dark:text-white">How It </span>
          <span className="gradient-text">Works</span>
        </h2>
        <p className="animate-on-scroll body-lg text-slate-600 dark:text-slate-400 max-w-2xl mx-auto">
          From raw images to ML-ready datasets in four simple steps
        </p>
      </div>

      {/* Steps */}
      <div className="relative">
        {/* Connection line for desktop */}
        <div className="hidden lg:block absolute top-24 left-[12%] right-[12%] h-0.5 bg-gradient-to-r from-indigo-200 via-purple-200 via-cyan-200 to-emerald-200 dark:from-indigo-500/20 dark:via-purple-500/20 dark:via-cyan-500/20 dark:to-emerald-500/20" />

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-8">
          {steps.map((step, index) => {
            const colors = colorMap[step.color];
            const Icon = step.icon;

            return (
              <div key={step.number} className="animate-on-scroll relative">
                {/* Mobile/Tablet connection line */}
                {index < steps.length - 1 && (
                  <div className="lg:hidden absolute -bottom-4 left-1/2 transform -translate-x-1/2 flex items-center text-slate-300 dark:text-slate-600">
                    <ArrowRight className="w-5 h-5 rotate-90" />
                  </div>
                )}

                {/* Step card */}
                <div className="glass-card rounded-2xl p-6 h-full hover-lift">
                  {/* Number badge */}
                  <div className="flex items-center justify-between mb-6">
                    <div className={`w-14 h-14 rounded-2xl ${colors.bg} ${colors.border} border flex items-center justify-center relative`}>
                      <Icon className={`w-7 h-7 ${colors.text}`} />
                      {/* Animated ring on hover */}
                      <div className={`absolute inset-0 rounded-2xl border-2 ${colors.border} opacity-0 group-hover:opacity-100 animate-ping`} />
                    </div>
                    <span className={`text-3xl font-bold ${colors.text} opacity-30`}>
                      {step.number}
                    </span>
                  </div>

                  {/* Content */}
                  <h3 className="text-xl font-semibold text-slate-800 dark:text-white mb-3">
                    {step.title}
                  </h3>
                  <p className="text-slate-600 dark:text-slate-400 mb-4 text-sm leading-relaxed">
                    {step.description}
                  </p>

                  {/* Features list */}
                  <ul className="space-y-2">
                    {step.features.map((feature) => (
                      <li key={feature} className="flex items-center gap-2 text-sm text-slate-600 dark:text-slate-400">
                        <CheckCircle2 className={`w-4 h-4 ${colors.text} flex-shrink-0`} />
                        {feature}
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Bottom CTA */}
      <div className="animate-on-scroll mt-16 text-center">
        <div className="inline-flex items-center gap-6 p-6 rounded-2xl glass-card">
          <div className="text-left">
            <p className="text-slate-800 dark:text-white font-semibold">
              Ready to streamline your labeling workflow?
            </p>
            <p className="text-sm text-slate-600 dark:text-slate-400">
              Free for academic research
            </p>
          </div>
          <a
            href="/auth/sign-in"
            className="btn-primary-gradient flex items-center gap-2 whitespace-nowrap"
          >
            Get Started
            <ArrowRight className="w-4 h-4" />
          </a>
        </div>
      </div>
    </div>
  );
}
