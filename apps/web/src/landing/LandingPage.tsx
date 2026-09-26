import React, { useRef, useLayoutEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import gsap from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import Logo from '../components/Logo';
import HeroSection from './sections/HeroSection';
import FeaturesSection from './sections/FeaturesSection';
import HowItWorksSection from './sections/HowItWorksSection';
import TryDemoSection from './sections/TryDemoSection';
import UseCasesSection from './sections/UseCasesSection';
import ExportShowcase from './sections/ExportShowcase';
import CTASection from './sections/CTASection';

// Register ScrollTrigger plugin
gsap.registerPlugin(ScrollTrigger);

export default function LandingPage() {
  const navigate = useNavigate();
  const containerRef = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    // Get all sections
    const sections = gsap.utils.toArray<HTMLElement>('.landing-section');

    // Animate each section as it scrolls into view
    sections.forEach((section) => {
      const elements = section.querySelectorAll('.animate-on-scroll');

      gsap.fromTo(elements,
        { opacity: 0, y: 50 },
        {
          opacity: 1,
          y: 0,
          duration: 0.7,
          stagger: 0.12,
          ease: 'power3.out',
          scrollTrigger: {
            trigger: section,
            start: 'top 85%',
            end: 'top 25%',
            toggleActions: 'play none none reverse',
          },
        }
      );
    });

    // Parallax effect for decorative elements
    gsap.utils.toArray<HTMLElement>('.parallax-slow').forEach((el) => {
      gsap.to(el, {
        y: -80,
        ease: 'none',
        scrollTrigger: {
          trigger: el,
          start: 'top bottom',
          end: 'bottom top',
          scrub: 1,
        },
      });
    });

    // Cleanup
    return () => {
      ScrollTrigger.getAll().forEach(t => t.kill());
    };
  }, []);

  const handleGetStarted = () => {
    navigate('/projects');
  };

  const navLinks = [
    { href: '#features', label: 'Features' },
    { href: '#how-it-works', label: 'How It Works' },
    { href: '#try-demo', label: 'Try Demo' },
    { href: '#use-cases', label: 'Use Cases' },
    { href: '#exports', label: 'Exports' },
  ];

  return (
    <div ref={containerRef} className="bg-mesh-gradient min-h-screen">
      {/* Navigation Bar */}
      <nav className="fixed top-0 left-0 right-0 z-50 glass-panel border-b border-slate-200 dark:border-slate-800">
        <div className="max-w-7xl mx-auto px-6 py-3 flex items-center justify-between">
          <Logo size="md" />

          {/* Desktop Navigation */}
          <div className="hidden md:flex items-center gap-1">
            {navLinks.map((link) => (
              <a
                key={link.href}
                href={link.href}
                className="px-4 py-2 rounded-lg text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors text-sm font-medium"
              >
                {link.label}
              </a>
            ))}
          </div>

          <div className="flex items-center gap-3">
            <button
              onClick={handleGetStarted}
              className="btn-primary-gradient text-sm px-5 py-2.5"
            >
              Open Lableit
            </button>
          </div>
        </div>
      </nav>

      {/* Section 1: Hero */}
      <section className="landing-section min-h-screen flex items-center justify-center px-6 pt-24 pb-16">
        <HeroSection onGetStarted={handleGetStarted} />
      </section>

      {/* Section 2: Features */}
      <section id="features" className="landing-section py-24 px-6">
        <FeaturesSection />
      </section>

      {/* Section 3: How It Works */}
      <section id="how-it-works" className="landing-section py-24 px-6 bg-slate-50/50 dark:bg-slate-900/30">
        <HowItWorksSection />
      </section>

      {/* Section 4: Interactive Demo */}
      <section id="try-demo" className="landing-section py-24 px-6">
        <TryDemoSection />
      </section>

      {/* Section 5: Use Cases */}
      <section id="use-cases" className="landing-section py-24 px-6 bg-slate-50/50 dark:bg-slate-900/30">
        <UseCasesSection />
      </section>

      {/* Section 6: Export Showcase */}
      <section id="exports" className="landing-section py-24 px-6">
        <ExportShowcase />
      </section>

      {/* Section 7: CTA */}
      <section className="landing-section py-24 px-6 bg-gradient-to-b from-transparent to-indigo-50/50 dark:to-indigo-950/20">
        <CTASection onGetStarted={handleGetStarted} />
      </section>

      {/* Decorative floating elements */}
      <div className="fixed inset-0 pointer-events-none overflow-hidden -z-10">
        <div className="parallax-slow absolute w-[500px] h-[500px] rounded-full bg-indigo-200/20 dark:bg-indigo-500/5 blur-3xl -top-64 -left-64" />
        <div className="parallax-slow absolute w-[400px] h-[400px] rounded-full bg-purple-200/20 dark:bg-purple-500/5 blur-3xl top-1/4 right-0" />
        <div className="parallax-slow absolute w-[450px] h-[450px] rounded-full bg-cyan-200/15 dark:bg-cyan-500/5 blur-3xl bottom-1/4 left-1/4" />
        <div className="parallax-slow absolute w-[350px] h-[350px] rounded-full bg-emerald-200/15 dark:bg-emerald-500/5 blur-3xl bottom-0 right-1/4" />
      </div>

      {/* Scroll progress indicator */}
      <div className="fixed right-6 top-1/2 -translate-y-1/2 z-40 hidden lg:flex flex-col gap-3">
        {['Hero', 'Features', 'Process', 'Demo', 'Industries', 'Exports', 'Start'].map((label, i) => {
          const hrefs = ['#', '#features', '#how-it-works', '#try-demo', '#use-cases', '#exports', '#'];
          return (
            <a
              key={label}
              href={hrefs[i]}
              aria-label={`Jump to ${label} section`}
              className="group flex items-center gap-3"
            >
              <span className="text-xs text-slate-400 dark:text-slate-500 opacity-0 group-hover:opacity-100 transition-opacity font-medium">
                {label}
              </span>
              <div className="w-2 h-2 rounded-full bg-slate-300 dark:bg-slate-700 group-hover:bg-indigo-500 group-hover:scale-125 transition-all" />
            </a>
          );
        })}
      </div>
    </div>
  );
}
