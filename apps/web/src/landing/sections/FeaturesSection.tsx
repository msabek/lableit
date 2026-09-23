import React from 'react';
import {
  Cpu,
  Layers,
  Video,
  Download,
  Boxes,
  Eye,
  Zap,
  Shield
} from 'lucide-react';

const features = [
  {
    icon: Cpu,
    title: 'SAM3 AI Engine',
    description: 'State-of-the-art Segment Anything 3 model for precise object detection and segmentation with text prompts.',
    color: 'indigo'
  },
  {
    icon: Layers,
    title: 'Boxes and Masks',
    description: 'SAM3 returns boxes and segmentation masks together; draw or adjust boxes yourself, with mask opacity you control.',
    color: 'purple'
  },
  {
    icon: Video,
    title: 'Video Frame Extraction',
    description: 'Automatically slice videos into frames at custom intervals for efficient labeling workflows.',
    color: 'pink'
  },
  {
    icon: Download,
    title: 'Universal Export',
    description: 'Export to COCO, YOLO, Pascal VOC, LabelMe, CreateML, and more with a single click.',
    color: 'emerald'
  },
  {
    icon: Boxes,
    title: 'Batch Processing',
    description: 'Label hundreds of images automatically with AI-powered batch inference and smart queuing.',
    color: 'amber'
  },
  {
    icon: Eye,
    title: 'Real-Time Preview',
    description: 'See your annotations in real-time with adjustable mask opacity and instant visual feedback.',
    color: 'cyan'
  }
];

const colorClasses: Record<string, { bg: string; text: string; border: string }> = {
  indigo: { bg: 'bg-indigo-100 dark:bg-indigo-500/20', text: 'text-indigo-600 dark:text-indigo-400', border: 'border-indigo-200 dark:border-indigo-500/30' },
  purple: { bg: 'bg-purple-100 dark:bg-purple-500/20', text: 'text-purple-600 dark:text-purple-400', border: 'border-purple-200 dark:border-purple-500/30' },
  pink: { bg: 'bg-pink-100 dark:bg-pink-500/20', text: 'text-pink-600 dark:text-pink-400', border: 'border-pink-200 dark:border-pink-500/30' },
  emerald: { bg: 'bg-emerald-100 dark:bg-emerald-500/20', text: 'text-emerald-600 dark:text-emerald-400', border: 'border-emerald-200 dark:border-emerald-500/30' },
  amber: { bg: 'bg-amber-100 dark:bg-amber-500/20', text: 'text-amber-600 dark:text-amber-400', border: 'border-amber-200 dark:border-amber-500/30' },
  cyan: { bg: 'bg-cyan-100 dark:bg-cyan-500/20', text: 'text-cyan-600 dark:text-cyan-400', border: 'border-cyan-200 dark:border-cyan-500/30' },
};

export default function FeaturesSection() {
  return (
    <div className="max-w-6xl mx-auto w-full">
      {/* Section Header */}
      <div className="text-center mb-16">
        <h2 className="animate-on-scroll heading-lg mb-4">
          <span className="text-slate-800 dark:text-white">Powerful Features for </span>
          <span className="gradient-text">Modern Labeling</span>
        </h2>
        <p className="animate-on-scroll body-lg text-slate-600 dark:text-slate-400 max-w-2xl mx-auto">
          Everything you need to create high-quality training datasets, faster than ever before
        </p>
        <p className="animate-on-scroll text-sm text-slate-500 dark:text-slate-500 max-w-3xl mx-auto mt-3">
          Developed at the IHT Lab, Department of Civil and Environmental Engineering,
          University of Alberta, Edmonton, Canada.
        </p>
      </div>

      {/* Features Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {features.map((feature) => {
          const colors = colorClasses[feature.color];
          const Icon = feature.icon;

          return (
            <div
              key={feature.title}
              className="animate-on-scroll glass-card rounded-2xl p-6 hover-lift group feature-card"
            >
              <div className={`feature-icon-wrapper w-14 h-14 rounded-2xl ${colors.bg} ${colors.border} border flex items-center justify-center mb-5`}>
                <Icon className={`w-7 h-7 ${colors.text}`} />
              </div>
              <h3 className="text-xl font-semibold text-slate-800 dark:text-white mb-3">
                {feature.title}
              </h3>
              <p className="text-slate-600 dark:text-slate-400 leading-relaxed">
                {feature.description}
              </p>
            </div>
          );
        })}
      </div>

      {/* Stats Row */}
      <div className="animate-on-scroll mt-16 grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="text-center glass-card rounded-2xl p-8 hover-lift">
          <div className="flex items-center justify-center gap-2 mb-2">
            <Zap className="w-6 h-6 text-indigo-500" />
            <span className="text-4xl font-bold gradient-text">1</span>
          </div>
          <div className="text-slate-600 dark:text-slate-400">Text Prompt</div>
          <p className="text-sm text-slate-500 dark:text-slate-500 mt-1">Finds every matching object at once</p>
        </div>
        <div className="text-center glass-card rounded-2xl p-8 hover-lift">
          <div className="flex items-center justify-center gap-2 mb-2">
            <Download className="w-6 h-6 text-emerald-500" />
            <span className="text-4xl font-bold gradient-text">8</span>
          </div>
          <div className="text-slate-600 dark:text-slate-400">Export Formats</div>
          <p className="text-sm text-slate-500 dark:text-slate-500 mt-1">COCO, YOLO, VOC, and more</p>
        </div>
        <div className="text-center glass-card rounded-2xl p-8 hover-lift">
          <div className="flex items-center justify-center gap-2 mb-2">
            <Shield className="w-6 h-6 text-purple-500" />
            <span className="text-4xl font-bold gradient-text">You</span>
          </div>
          <div className="text-slate-600 dark:text-slate-400">Stay in Control</div>
          <p className="text-sm text-slate-500 dark:text-slate-500 mt-1">Review and correct every SAM3 label</p>
        </div>
      </div>
    </div>
  );
}
