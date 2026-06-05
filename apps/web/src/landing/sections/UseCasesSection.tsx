import React, { useState } from 'react';
import {
  Car,
  Stethoscope,
  Factory,
  ShoppingBag,
  Video,
  Plane,
  Microscope,
  MapPin,
  ArrowRight
} from 'lucide-react';

const useCases = [
  {
    id: 'autonomous',
    icon: Car,
    title: 'Autonomous Vehicles',
    shortDesc: 'Self-driving car training data',
    description: 'Create precise annotations for pedestrians, vehicles, road signs, and lane markings. Essential for training perception models in autonomous driving systems.',
    stats: ['99.2% accuracy', '10x faster labeling', 'KITTI format support'],
    color: 'blue',
    image: '/use-cases/autonomous.jpg',
  },
  {
    id: 'medical',
    icon: Stethoscope,
    title: 'Medical Imaging',
    shortDesc: 'Healthcare AI diagnostics',
    description: 'Annotate medical scans including X-rays, MRIs, and CT scans. Support for tumor detection, organ segmentation, and diagnostic assistance systems.',
    stats: ['HIPAA compatible', 'DICOM support', 'Multi-layer masks'],
    color: 'emerald',
    image: '/use-cases/medical.jpg',
  },
  {
    id: 'manufacturing',
    icon: Factory,
    title: 'Quality Control',
    shortDesc: 'Defect detection systems',
    description: 'Train AI models to detect manufacturing defects, surface anomalies, and quality issues in production lines. Reduce human error and increase throughput.',
    stats: ['Sub-pixel precision', 'Real-time inference', 'Edge deployment'],
    color: 'amber',
    image: '/use-cases/manufacturing.jpg',
  },
  {
    id: 'retail',
    icon: ShoppingBag,
    title: 'Retail & E-commerce',
    shortDesc: 'Product recognition',
    description: 'Label product images for inventory management, visual search, and automated checkout systems. Perfect for catalog management and recommendation engines.',
    stats: ['Product tagging', 'SKU classification', 'Visual search ready'],
    color: 'pink',
    image: '/use-cases/retail.jpg',
  },
  {
    id: 'security',
    icon: Video,
    title: 'Security & Surveillance',
    shortDesc: 'Video analytics',
    description: 'Create training data for person detection, facial recognition, and activity recognition in security systems. Handle video streams efficiently.',
    stats: ['Video support', 'Frame extraction', 'Motion tracking'],
    color: 'red',
    image: '/use-cases/security.jpg',
  },
  {
    id: 'aerospace',
    icon: Plane,
    title: 'Aerospace & Drones',
    shortDesc: 'Aerial imagery analysis',
    description: 'Annotate satellite and drone imagery for terrain mapping, object detection, and infrastructure inspection. Large-scale georeferenced datasets.',
    stats: ['GeoTIFF support', 'Tile processing', 'Coordinate export'],
    color: 'indigo',
    image: '/use-cases/aerospace.jpg',
  },
  {
    id: 'research',
    icon: Microscope,
    title: 'Scientific Research',
    shortDesc: 'Research data annotation',
    description: 'Annotate microscopy images, scientific visualizations, and experimental data for academic and industrial research applications.',
    stats: ['Cell counting', 'Particle tracking', 'Custom schemas'],
    color: 'purple',
    image: '/use-cases/research.jpg',
  },
  {
    id: 'geospatial',
    icon: MapPin,
    title: 'Geospatial Analysis',
    shortDesc: 'Mapping & GIS',
    description: 'Label aerial and satellite imagery for land use classification, urban planning, and environmental monitoring applications.',
    stats: ['Large images', 'Polygon tools', 'QGIS export'],
    color: 'cyan',
    image: '/use-cases/geospatial.jpg',
  },
];

const colorMap: Record<string, { bg: string; text: string; border: string; gradient: string }> = {
  blue: { bg: 'bg-blue-100 dark:bg-blue-500/20', text: 'text-blue-600 dark:text-blue-400', border: 'border-blue-200 dark:border-blue-500/30', gradient: 'from-blue-500 to-blue-600' },
  emerald: { bg: 'bg-emerald-100 dark:bg-emerald-500/20', text: 'text-emerald-600 dark:text-emerald-400', border: 'border-emerald-200 dark:border-emerald-500/30', gradient: 'from-emerald-500 to-emerald-600' },
  amber: { bg: 'bg-amber-100 dark:bg-amber-500/20', text: 'text-amber-600 dark:text-amber-400', border: 'border-amber-200 dark:border-amber-500/30', gradient: 'from-amber-500 to-amber-600' },
  pink: { bg: 'bg-pink-100 dark:bg-pink-500/20', text: 'text-pink-600 dark:text-pink-400', border: 'border-pink-200 dark:border-pink-500/30', gradient: 'from-pink-500 to-pink-600' },
  red: { bg: 'bg-red-100 dark:bg-red-500/20', text: 'text-red-600 dark:text-red-400', border: 'border-red-200 dark:border-red-500/30', gradient: 'from-red-500 to-red-600' },
  indigo: { bg: 'bg-indigo-100 dark:bg-indigo-500/20', text: 'text-indigo-600 dark:text-indigo-400', border: 'border-indigo-200 dark:border-indigo-500/30', gradient: 'from-indigo-500 to-indigo-600' },
  purple: { bg: 'bg-purple-100 dark:bg-purple-500/20', text: 'text-purple-600 dark:text-purple-400', border: 'border-purple-200 dark:border-purple-500/30', gradient: 'from-purple-500 to-purple-600' },
  cyan: { bg: 'bg-cyan-100 dark:bg-cyan-500/20', text: 'text-cyan-600 dark:text-cyan-400', border: 'border-cyan-200 dark:border-cyan-500/30', gradient: 'from-cyan-500 to-cyan-600' },
};

export default function UseCasesSection() {
  const [activeCase, setActiveCase] = useState(useCases[0]);

  return (
    <div className="max-w-6xl mx-auto w-full">
      {/* Section Header */}
      <div className="text-center mb-12">
        <h2 className="animate-on-scroll heading-lg mb-4">
          <span className="text-slate-800 dark:text-white">Built for </span>
          <span className="gradient-text">Every Industry</span>
        </h2>
        <p className="animate-on-scroll body-lg text-slate-600 dark:text-slate-400 max-w-2xl mx-auto">
          From autonomous vehicles to medical imaging, Lableit powers AI teams worldwide
        </p>
      </div>

      <div className="animate-on-scroll flex flex-col lg:flex-row gap-8">
        {/* Use case tabs - Left side */}
        <div className="lg:w-1/3 flex flex-row lg:flex-col gap-2 overflow-x-auto lg:overflow-visible pb-2 lg:pb-0">
          {useCases.map((useCase) => {
            const colors = colorMap[useCase.color];
            const Icon = useCase.icon;
            const isActive = activeCase.id === useCase.id;

            return (
              <button
                key={useCase.id}
                onClick={() => setActiveCase(useCase)}
                className={`flex-shrink-0 lg:flex-shrink text-left p-4 rounded-xl transition-all duration-300 ${
                  isActive
                    ? `${colors.bg} ${colors.border} border shadow-lg`
                    : 'glass-button hover:border-slate-300 dark:hover:border-slate-600'
                }`}
              >
                <div className="flex items-center gap-3">
                  <div className={`p-2 rounded-lg ${isActive ? colors.bg : 'bg-slate-100 dark:bg-slate-800'}`}>
                    <Icon className={`w-5 h-5 ${isActive ? colors.text : 'text-slate-500 dark:text-slate-400'}`} />
                  </div>
                  <div className="min-w-0">
                    <div className={`font-semibold text-sm ${isActive ? 'text-slate-800 dark:text-white' : 'text-slate-600 dark:text-slate-400'}`}>
                      {useCase.title}
                    </div>
                    <div className="text-xs text-slate-500 dark:text-slate-500 truncate">
                      {useCase.shortDesc}
                    </div>
                  </div>
                </div>
              </button>
            );
          })}
        </div>

        {/* Use case details - Right side */}
        <div className="lg:w-2/3">
          <div className="glass-card rounded-3xl overflow-hidden">
            {/* Header with gradient */}
            <div className={`bg-gradient-to-r ${colorMap[activeCase.color].gradient} p-6 text-white`}>
              <div className="flex items-center gap-4">
                <div className="p-3 rounded-xl bg-white/20 backdrop-blur-sm">
                  {React.createElement(activeCase.icon, { className: 'w-8 h-8' })}
                </div>
                <div>
                  <h3 className="text-2xl font-bold">{activeCase.title}</h3>
                  <p className="text-white/80">{activeCase.shortDesc}</p>
                </div>
              </div>
            </div>

            {/* Content */}
            <div className="p-6">
              <p className="text-slate-600 dark:text-slate-400 leading-relaxed mb-6">
                {activeCase.description}
              </p>

              {/* Stats/Features */}
              <div className="flex flex-wrap gap-3 mb-6">
                {activeCase.stats.map((stat) => (
                  <span
                    key={stat}
                    className={`px-4 py-2 rounded-xl text-sm font-medium ${colorMap[activeCase.color].bg} ${colorMap[activeCase.color].text} ${colorMap[activeCase.color].border} border`}
                  >
                    {stat}
                  </span>
                ))}
              </div>

              {/* CTA */}
              <a
                href="/auth/sign-in"
                className="inline-flex items-center gap-2 text-indigo-600 dark:text-indigo-400 font-medium hover:gap-3 transition-all"
              >
                Start labeling for {activeCase.title.toLowerCase()}
                <ArrowRight className="w-4 h-4" />
              </a>
            </div>
          </div>
        </div>
      </div>

      {/* Bottom stats */}
      <div className="animate-on-scroll mt-16 grid grid-cols-2 md:grid-cols-4 gap-4">
        {[
          { value: '50K+', label: 'Images Labeled Daily' },
          { value: '200+', label: 'Enterprise Teams' },
          { value: '99.5%', label: 'Accuracy Rate' },
          { value: '15+', label: 'Countries' },
        ].map((stat) => (
          <div key={stat.label} className="text-center p-6 glass-card rounded-2xl">
            <div className="text-3xl font-bold gradient-text mb-1">{stat.value}</div>
            <div className="text-sm text-slate-600 dark:text-slate-400">{stat.label}</div>
          </div>
        ))}
      </div>
    </div>
  );
}
