import React from 'react';
import { ArrowRight, Sparkles, Check, Code2, MessageCircle, Heart } from 'lucide-react';

interface CTASectionProps {
  onGetStarted: () => void;
}

const benefits = [
  'Free tier with 100 images/month',
  'No credit card required',
  'Export unlimited times',
  'GPU-accelerated inference'
];

export default function CTASection({ onGetStarted }: CTASectionProps) {
  return (
    <div className="max-w-4xl mx-auto text-center w-full">
      {/* Decorative element */}
      <div className="animate-on-scroll mb-8">
        <div className="inline-flex items-center justify-center w-20 h-20 rounded-2xl bg-gradient-to-br from-indigo-500 to-purple-600 shadow-lg shadow-indigo-500/25">
          <Sparkles className="w-10 h-10 text-white" />
        </div>
      </div>

      {/* Main CTA */}
      <h2 className="animate-on-scroll heading-lg mb-6">
        <span className="text-slate-800 dark:text-white">Ready to </span>
        <span className="gradient-text">Start Labeling?</span>
      </h2>

      <p className="animate-on-scroll body-lg text-slate-600 dark:text-slate-400 max-w-2xl mx-auto mb-8">
        Join researchers and engineering teams using Lableit to create high-quality training datasets faster than ever.
      </p>
      <p className="animate-on-scroll text-sm text-slate-500 dark:text-slate-400 max-w-3xl mx-auto mb-8">
        Lableit was created by <span className="font-semibold text-slate-700 dark:text-slate-300">PhD Mohamed Sabek</span> at the
        IHT Lab, Department of Civil and Environmental Engineering, University of Alberta, Edmonton, Canada.
      </p>

      {/* Benefits */}
      <div className="animate-on-scroll flex flex-wrap justify-center gap-3 mb-10">
        {benefits.map((benefit) => (
          <div
            key={benefit}
            className="flex items-center gap-2 px-4 py-2 glass-card rounded-xl"
          >
            <div className="w-5 h-5 rounded-full bg-emerald-100 dark:bg-emerald-500/20 flex items-center justify-center">
              <Check className="w-3 h-3 text-emerald-600 dark:text-emerald-400" />
            </div>
            <span className="text-slate-700 dark:text-slate-300 text-sm">{benefit}</span>
          </div>
        ))}
      </div>

      {/* CTA Button */}
      <div className="animate-on-scroll space-y-4">
        <button
          onClick={onGetStarted}
          className="btn-primary-gradient text-xl px-12 py-5 flex items-center gap-3 mx-auto group shadow-lg shadow-indigo-500/25"
        >
          Get Started for Free
          <ArrowRight className="w-6 h-6 group-hover:translate-x-1 transition-transform" />
        </button>
        <p className="text-sm text-slate-500 dark:text-slate-500">
          No credit card required • Setup in under 2 minutes
        </p>
      </div>

      {/* Social Links / Footer */}
      <div className="animate-on-scroll mt-20 pt-8 border-t border-slate-200 dark:border-slate-800">
        <div className="flex items-center justify-center gap-6 mb-6">
          <a
            href="https://github.com"
            target="_blank"
            rel="noopener noreferrer"
            className="text-slate-500 hover:text-slate-700 dark:text-slate-500 dark:hover:text-slate-300 transition-colors flex items-center gap-2"
          >
            <Code2 className="w-5 h-5" />
            <span className="text-sm font-medium">GitHub</span>
          </a>
          <a
            href="https://twitter.com"
            target="_blank"
            rel="noopener noreferrer"
            className="text-slate-500 hover:text-slate-700 dark:text-slate-500 dark:hover:text-slate-300 transition-colors flex items-center gap-2"
          >
            <MessageCircle className="w-5 h-5" />
            <span className="text-sm font-medium">Twitter</span>
          </a>
        </div>
        <p className="text-slate-500 dark:text-slate-500 text-sm flex items-center justify-center gap-1">
          Made with <Heart className="w-4 h-4 text-rose-500" /> by PhD Mohamed Sabek · IHT Lab · University of Alberta
        </p>
        <p className="text-slate-400 dark:text-slate-600 text-xs mt-2">
          © {new Date().getFullYear()} Lableit. All rights reserved.
        </p>
      </div>
    </div>
  );
}
