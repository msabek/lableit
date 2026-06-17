import React from 'react';
import {
  Sparkles,
  ArrowRight,
  Zap,
  Image,
  Tag,
  Play,
  Shield,
  Gauge,
  Layers,
  Check
} from 'lucide-react';
import ualbertaLogo from '../assets/ualberta-logo.svg';

interface HeroSectionProps {
  onGetStarted: () => void;
}

const featurePills = [
  { icon: Zap, text: 'One-Click Segmentation', color: 'indigo' },
  { icon: Image, text: 'Images & Videos', color: 'purple' },
  { icon: Tag, text: '8+ Export Formats', color: 'emerald' },
  { icon: Gauge, text: '10x Faster Labeling', color: 'cyan' },
  { icon: Shield, text: 'Enterprise Ready', color: 'amber' },
  { icon: Layers, text: 'Multi-Layer Masks', color: 'pink' },
];

const colorMap: Record<string, { bg: string; text: string }> = {
  indigo: { bg: 'bg-indigo-100 dark:bg-indigo-500/20', text: 'text-indigo-600 dark:text-indigo-400' },
  purple: { bg: 'bg-purple-100 dark:bg-purple-500/20', text: 'text-purple-600 dark:text-purple-400' },
  emerald: { bg: 'bg-emerald-100 dark:bg-emerald-500/20', text: 'text-emerald-600 dark:text-emerald-400' },
  cyan: { bg: 'bg-cyan-100 dark:bg-cyan-500/20', text: 'text-cyan-600 dark:text-cyan-400' },
  amber: { bg: 'bg-amber-100 dark:bg-amber-500/20', text: 'text-amber-600 dark:text-amber-400' },
  pink: { bg: 'bg-pink-100 dark:bg-pink-500/20', text: 'text-pink-600 dark:text-pink-400' },
};

export default function HeroSection({ onGetStarted }: HeroSectionProps) {
  return (
    <div className="max-w-6xl mx-auto text-center">
      {/* SAM3 Badge */}
      <div className="animate-on-scroll inline-flex items-center gap-2 px-4 py-2 rounded-full bg-indigo-50 dark:bg-indigo-500/10 border border-indigo-200 dark:border-indigo-500/20 text-sm mb-8 shadow-sm">
        <div className="relative">
          <Sparkles className="w-4 h-4 text-indigo-600 dark:text-indigo-400" />
          <div className="absolute inset-0 animate-ping">
            <Sparkles className="w-4 h-4 text-indigo-600 dark:text-indigo-400 opacity-50" />
          </div>
        </div>
        <span className="text-indigo-700 dark:text-indigo-300 font-medium">
          Powered by SAM3 — Meta's Segment Anything Model
        </span>
      </div>

      {/* Main Title */}
      <h1 className="animate-on-scroll heading-xl mb-6 leading-tight">
        <span className="gradient-text">AI-Powered</span>
        <br />
        <span className="text-slate-800 dark:text-white">Image Labeling</span>
      </h1>

      {/* Subtitle */}
      <p className="animate-on-scroll body-lg text-slate-600 dark:text-slate-400 max-w-3xl mx-auto mb-8">
        Create high-quality training datasets in seconds, not hours.
        Lableit combines state-of-the-art
        <span className="text-indigo-600 dark:text-indigo-400 font-semibold"> Segment Anything 3 </span>
        technology with an intuitive interface to supercharge your ML workflow.
        <span className="block mt-3 text-sm text-slate-500 dark:text-slate-400">
          Created by <span className="font-semibold text-slate-700 dark:text-slate-300">PhD Mohamed Sabek</span> at the
          IHT Lab, Department of Civil and Environmental Engineering, University of Alberta, Edmonton, Canada.
        </span>
      </p>

      {/* Key benefits */}
      <div className="animate-on-scroll flex flex-wrap justify-center gap-3 mb-10">
        {[
          'Free to start',
          'No credit card required',
          'GPU-accelerated inference',
        ].map((benefit) => (
          <div key={benefit} className="flex items-center gap-2 text-sm text-slate-600 dark:text-slate-400">
            <Check className="w-4 h-4 text-emerald-500" />
            {benefit}
          </div>
        ))}
      </div>

      {/* CTA Buttons */}
      <div className="animate-on-scroll flex flex-wrap items-center justify-center gap-4 mb-16">
        <button
          onClick={onGetStarted}
          className="btn-primary-gradient text-lg px-8 py-4 flex items-center gap-2 group shadow-lg"
        >
          Start Labeling Free
          <ArrowRight className="w-5 h-5 group-hover:translate-x-1 transition-transform" />
        </button>
        <a
          href="#try-demo"
          className="btn-secondary-glass text-lg px-8 py-4 flex items-center gap-2"
        >
          <Play className="w-5 h-5" />
          Try Demo
        </a>
      </div>

      {/* Feature Pills Grid */}
      <div className="animate-on-scroll grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3 max-w-4xl mx-auto">
        {featurePills.map(({ icon: Icon, text, color }) => {
          const colors = colorMap[color];
          return (
            <div
              key={text}
              className="glass-card rounded-xl px-4 py-3 flex items-center gap-2 hover-lift"
            >
              <div className={`p-1.5 rounded-lg ${colors.bg}`}>
                <Icon className={`w-4 h-4 ${colors.text}`} />
              </div>
              <span className="text-slate-700 dark:text-slate-300 text-xs font-medium">{text}</span>
            </div>
          );
        })}
      </div>

      {/* Social proof */}
      <div className="animate-on-scroll mt-16 pt-8 border-t border-slate-200 dark:border-slate-800">
        <p className="text-sm text-slate-500 dark:text-slate-500 mb-4">
          Trusted by teams in University of Alberta
        </p>
        <div className="flex flex-wrap items-center justify-center gap-6 opacity-80">
          <img
            src={ualbertaLogo}
            alt="University of Alberta logo"
            className="h-14 md:h-16 w-auto"
          />
          <div className="text-left">
            <p className="text-slate-700 dark:text-slate-300 font-semibold">
              University of Alberta
            </p>
            <p className="text-slate-500 dark:text-slate-500 text-sm">
              Civil and Environmental Engineering · IHT Lab
            </p>
          </div>
        </div>
      </div>

      {/* Scroll indicator */}
      <div className="animate-on-scroll mt-16 flex flex-col items-center gap-2 text-slate-400 dark:text-slate-500">
        <span className="text-sm">Scroll to explore</span>
        <div className="w-6 h-10 rounded-full border-2 border-slate-300 dark:border-slate-700 flex items-start justify-center p-2">
          <div className="w-1.5 h-3 rounded-full bg-slate-400 dark:bg-slate-600 animate-bounce" />
        </div>
      </div>
    </div>
  );
}
