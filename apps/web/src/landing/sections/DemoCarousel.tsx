import React, { useState } from 'react';
import { ChevronLeft, ChevronRight, Upload, Download, Sparkles, MousePointer } from 'lucide-react';

const demoSteps = [
  {
    title: 'Upload Your Media',
    description: 'Drag and drop images or videos. Lableit supports all common formats including JPG, PNG, MP4, and more.',
    icon: Upload,
    color: 'indigo',
    mockup: (
      <div className="relative w-full h-64 glass-panel rounded-2xl p-6 flex flex-col items-center justify-center border-2 border-dashed border-indigo-500/30">
        <div className="w-16 h-16 rounded-2xl bg-indigo-500/20 flex items-center justify-center mb-4 animate-pulse">
          <Upload className="w-8 h-8 text-indigo-400" />
        </div>
        <p className="text-text-muted text-center">Drop files here or click to browse</p>
        <div className="flex gap-2 mt-4">
          <span className="px-3 py-1 rounded-lg bg-indigo-500/20 text-indigo-400 text-xs">JPG</span>
          <span className="px-3 py-1 rounded-lg bg-purple-500/20 text-purple-400 text-xs">PNG</span>
          <span className="px-3 py-1 rounded-lg bg-pink-500/20 text-pink-400 text-xs">MP4</span>
        </div>
      </div>
    )
  },
  {
    title: 'Click to Annotate',
    description: 'Simply click on objects to detect and segment them. SAM3 AI does the heavy lifting.',
    icon: MousePointer,
    color: 'purple',
    mockup: (
      <div className="relative w-full h-64 glass-panel rounded-2xl overflow-hidden">
        <div className="w-full h-full bg-gradient-to-br from-gray-800 to-gray-900 flex items-center justify-center">
          <div className="relative">
            <div className="w-32 h-32 rounded-xl bg-gradient-to-br from-purple-500/30 to-pink-500/30 border-2 border-purple-500 shadow-[0_0_20px_rgba(168,85,247,0.4)]">
              <div className="absolute -top-2 -right-2 w-4 h-4 rounded-full bg-purple-500 ring-4 ring-purple-500/30 animate-ping" />
              <div className="absolute -top-2 -right-2 w-4 h-4 rounded-full bg-purple-500" />
            </div>
            <div className="absolute -top-8 left-0 px-2 py-1 rounded bg-purple-500 text-white text-xs font-medium">
              Object 1
            </div>
          </div>
        </div>
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 pointer-events-none">
          <MousePointer className="w-6 h-6 text-white animate-bounce" />
        </div>
      </div>
    )
  },
  {
    title: 'AI Magic ✨',
    description: 'Watch as SAM3 automatically generates precise segmentation masks and bounding boxes.',
    icon: Sparkles,
    color: 'emerald',
    mockup: (
      <div className="relative w-full h-64 glass-panel rounded-2xl overflow-hidden">
        <div className="w-full h-full bg-gradient-to-br from-gray-800 to-gray-900 flex items-center justify-center">
          <div className="relative flex gap-4">
            <div className="w-24 h-24 rounded-lg bg-emerald-500/30 border-2 border-emerald-500 animate-pulse">
              <div className="absolute -top-6 left-0 px-2 py-0.5 rounded bg-emerald-500 text-white text-xs">Car</div>
            </div>
            <div className="w-20 h-28 rounded-lg bg-cyan-500/30 border-2 border-cyan-500 animate-pulse" style={{ animationDelay: '0.2s' }}>
              <div className="absolute -top-6 left-0 px-2 py-0.5 rounded bg-cyan-500 text-white text-xs">Person</div>
            </div>
            <div className="w-16 h-16 rounded-full bg-amber-500/30 border-2 border-amber-500 animate-pulse" style={{ animationDelay: '0.4s' }}>
              <div className="absolute -top-6 left-0 px-2 py-0.5 rounded bg-amber-500 text-white text-xs">Ball</div>
            </div>
          </div>
        </div>
        <div className="absolute bottom-4 left-4 right-4">
          <div className="h-1 bg-white/10 rounded-full overflow-hidden">
            <div className="h-full w-3/4 bg-gradient-to-r from-emerald-500 to-cyan-500 animate-pulse" />
          </div>
          <p className="text-xs text-emerald-400 mt-2 flex items-center gap-2">
            <Sparkles className="w-3 h-3" /> Processing with SAM3...
          </p>
        </div>
      </div>
    )
  },
  {
    title: 'Export Anywhere',
    description: 'Download your labeled dataset in COCO, YOLO, VOC, or any other format you need.',
    icon: Download,
    color: 'pink',
    mockup: (
      <div className="relative w-full h-64 glass-panel rounded-2xl p-6">
        <h4 className="text-text font-semibold mb-4">Choose Export Format</h4>
        <div className="grid grid-cols-2 gap-3">
          {['COCO JSON', 'YOLO', 'Pascal VOC', 'LabelMe'].map((format, i) => (
            <div 
              key={format}
              className={`p-4 rounded-xl border transition-all cursor-pointer ${
                i === 0 
                  ? 'bg-pink-500/20 border-pink-500/50 shadow-[0_0_15px_rgba(236,72,153,0.3)]' 
                  : 'glass-button hover:border-pink-500/30'
              }`}
            >
              <div className="flex items-center justify-between">
                <span className="text-text text-sm font-medium">{format}</span>
                {i === 0 && <div className="w-3 h-3 rounded-full bg-pink-500" />}
              </div>
            </div>
          ))}
        </div>
        <button className="mt-4 w-full btn-primary-gradient flex items-center justify-center gap-2">
          <Download className="w-4 h-4" /> Export Dataset
        </button>
      </div>
    )
  }
];

export default function DemoCarousel() {
  const [currentStep, setCurrentStep] = useState(0);

  const nextStep = () => setCurrentStep((prev) => (prev + 1) % demoSteps.length);
  const prevStep = () => setCurrentStep((prev) => (prev - 1 + demoSteps.length) % demoSteps.length);

  const step = demoSteps[currentStep];
  const Icon = step.icon;

  const colorMap: Record<string, string> = {
    indigo: 'bg-indigo-500/20 border-indigo-500/30 text-indigo-400',
    purple: 'bg-purple-500/20 border-purple-500/30 text-purple-400',
    emerald: 'bg-emerald-500/20 border-emerald-500/30 text-emerald-400',
    pink: 'bg-pink-500/20 border-pink-500/30 text-pink-400',
  };

  return (
    <div className="max-w-5xl mx-auto w-full">
      {/* Section Header */}
      <div className="text-center mb-12">
        <h2 className="animate-on-scroll text-4xl md:text-5xl font-bold mb-4">
          <span className="text-text">See It </span>
          <span className="gradient-text">In Action</span>
        </h2>
        <p className="animate-on-scroll text-lg text-text-muted">
          From upload to export in just a few clicks
        </p>
      </div>

      {/* Demo Card */}
      <div className="animate-on-scroll glass-card rounded-3xl p-8">
        <div className="flex flex-col lg:flex-row gap-8 items-center">
          {/* Left: Step Info */}
          <div className="flex-1 text-center lg:text-left">
            <div className="flex items-center justify-center lg:justify-start gap-3 mb-4">
              <div className={`w-12 h-12 rounded-xl border flex items-center justify-center ${colorMap[step.color]}`}>
                <Icon className="w-6 h-6" />
              </div>
              <div className="text-sm text-text-muted">Step {currentStep + 1} of {demoSteps.length}</div>
            </div>
            <h3 className="text-2xl font-bold text-text mb-3">{step.title}</h3>
            <p className="text-text-muted text-lg">{step.description}</p>
          </div>

          {/* Right: Demo Mockup */}
          <div className="flex-1 w-full">
            {step.mockup}
          </div>
        </div>

        {/* Navigation */}
        <div className="flex items-center justify-between mt-8 pt-6 border-t border-glass-border">
          <button 
            onClick={prevStep}
            className="icon-button-glass p-3"
          >
            <ChevronLeft className="w-5 h-5" />
          </button>

          {/* Step Indicators */}
          <div className="flex gap-2">
            {demoSteps.map((_, i) => (
              <button
                key={i}
                onClick={() => setCurrentStep(i)}
                className={`h-2 rounded-full transition-all ${
                  i === currentStep ? 'w-8 bg-primary' : 'w-2 bg-white/20 hover:bg-white/40'
                }`}
              />
            ))}
          </div>

          <button 
            onClick={nextStep}
            className="icon-button-glass p-3"
          >
            <ChevronRight className="w-5 h-5" />
          </button>
        </div>
      </div>
    </div>
  );
}
