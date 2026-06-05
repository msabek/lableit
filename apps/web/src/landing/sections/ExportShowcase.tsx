import React, { useState } from 'react';
import { FileJson, FileText, Code, Image, Check, Download, ArrowRight } from 'lucide-react';

const exportFormats = [
  {
    id: 'coco',
    name: 'COCO',
    fullName: 'COCO JSON Format',
    icon: FileJson,
    color: 'indigo',
    description: 'Industry standard format for object detection and segmentation datasets.',
    useCases: ['PyTorch Detectron2', 'TensorFlow Object Detection API', 'MMDetection'],
    sample: `{
  "images": [
    {"id": 1, "file_name": "image.jpg", "width": 1920, "height": 1080}
  ],
  "annotations": [
    {"id": 1, "image_id": 1, "category_id": 1, "bbox": [100, 200, 150, 180]}
  ],
  "categories": [
    {"id": 1, "name": "car"}
  ]
}`
  },
  {
    id: 'yolo',
    name: 'YOLO',
    fullName: 'YOLO Detection & Segmentation',
    icon: FileText,
    color: 'emerald',
    description: 'Ultralytics YOLO format with normalized coordinates for fast training.',
    useCases: ['YOLOv5', 'YOLOv8', 'YOLOv9', 'YOLO11'],
    sample: `# class x_center y_center width height
0 0.523437 0.462963 0.156250 0.166667
1 0.234375 0.731481 0.093750 0.111111`
  },
  {
    id: 'voc',
    name: 'Pascal VOC',
    fullName: 'Pascal VOC XML Format',
    icon: Code,
    color: 'purple',
    description: 'Classic XML-based annotation format compatible with many frameworks.',
    useCases: ['TensorFlow', 'Keras', 'Classic ML pipelines'],
    sample: `<annotation>
  <filename>image.jpg</filename>
  <object>
    <name>car</name>
    <bndbox>
      <xmin>100</xmin><ymin>200</ymin>
      <xmax>250</xmax><ymax>380</ymax>
    </bndbox>
  </object>
</annotation>`
  },
  {
    id: 'masks',
    name: 'PNG Masks',
    fullName: 'Semantic Segmentation Masks',
    icon: Image,
    color: 'pink',
    description: 'Color-coded PNG masks for semantic segmentation tasks.',
    useCases: ['DeepLab', 'U-Net', 'Semantic segmentation models'],
    sample: `[PNG image with colored regions]
- Background: (0, 0, 0)
- Class 1 (car): (255, 107, 107)
- Class 2 (person): (78, 205, 196)`
  }
];

const colorMap: Record<string, { bg: string; text: string; border: string; lightBg: string }> = {
  indigo: { bg: 'bg-indigo-100 dark:bg-indigo-500/20', text: 'text-indigo-600 dark:text-indigo-400', border: 'border-indigo-200 dark:border-indigo-500/30', lightBg: 'bg-indigo-50 dark:bg-indigo-500/10' },
  emerald: { bg: 'bg-emerald-100 dark:bg-emerald-500/20', text: 'text-emerald-600 dark:text-emerald-400', border: 'border-emerald-200 dark:border-emerald-500/30', lightBg: 'bg-emerald-50 dark:bg-emerald-500/10' },
  purple: { bg: 'bg-purple-100 dark:bg-purple-500/20', text: 'text-purple-600 dark:text-purple-400', border: 'border-purple-200 dark:border-purple-500/30', lightBg: 'bg-purple-50 dark:bg-purple-500/10' },
  pink: { bg: 'bg-pink-100 dark:bg-pink-500/20', text: 'text-pink-600 dark:text-pink-400', border: 'border-pink-200 dark:border-pink-500/30', lightBg: 'bg-pink-50 dark:bg-pink-500/10' },
};

export default function ExportShowcase() {
  const [selectedFormat, setSelectedFormat] = useState(exportFormats[0]);

  const colors = colorMap[selectedFormat.color];

  return (
    <div className="max-w-6xl mx-auto w-full">
      {/* Section Header */}
      <div className="text-center mb-12">
        <h2 className="animate-on-scroll heading-lg mb-4">
          <span className="text-slate-800 dark:text-white">Export to </span>
          <span className="gradient-text">Any Format</span>
        </h2>
        <p className="animate-on-scroll body-lg text-slate-600 dark:text-slate-400 max-w-2xl mx-auto">
          Seamlessly integrate with your existing ML pipelines. All major formats supported.
        </p>
      </div>

      <div className="animate-on-scroll flex flex-col lg:flex-row gap-6">
        {/* Format Selector */}
        <div className="lg:w-1/3 flex lg:flex-col gap-3 overflow-x-auto lg:overflow-visible pb-2 lg:pb-0">
          {exportFormats.map((format) => {
            const Icon = format.icon;
            const isSelected = selectedFormat.id === format.id;
            const fColors = colorMap[format.color];

            return (
              <button
                key={format.id}
                onClick={() => setSelectedFormat(format)}
                className={`flex-shrink-0 lg:flex-shrink text-left p-4 rounded-xl transition-all duration-300 ${
                  isSelected
                    ? `${fColors.bg} ${fColors.border} border shadow-lg`
                    : 'glass-button hover:border-slate-300 dark:hover:border-slate-600'
                }`}
              >
                <div className="flex items-center gap-3">
                  <div className={`p-2 rounded-lg ${isSelected ? fColors.bg : 'bg-slate-100 dark:bg-slate-800'}`}>
                    <Icon className={`w-5 h-5 ${isSelected ? fColors.text : 'text-slate-500 dark:text-slate-400'}`} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className={`font-semibold text-sm ${isSelected ? 'text-slate-800 dark:text-white' : 'text-slate-600 dark:text-slate-400'}`}>
                      {format.name}
                    </div>
                    <div className="text-xs text-slate-500 dark:text-slate-500 truncate">{format.fullName}</div>
                  </div>
                  {isSelected && (
                    <div className={`w-5 h-5 rounded-full flex items-center justify-center ${fColors.bg}`}>
                      <Check className={`w-3 h-3 ${fColors.text}`} />
                    </div>
                  )}
                </div>
              </button>
            );
          })}
        </div>

        {/* Format Details */}
        <div className="lg:w-2/3 glass-card rounded-2xl p-6">
          <div className="flex items-start gap-4 mb-6">
            <div className={`p-3 rounded-xl ${colors.bg} ${colors.border} border`}>
              {React.createElement(selectedFormat.icon, { className: `w-8 h-8 ${colors.text}` })}
            </div>
            <div className="flex-1">
              <h3 className="text-2xl font-bold text-slate-800 dark:text-white mb-1">{selectedFormat.fullName}</h3>
              <p className="text-slate-600 dark:text-slate-400">{selectedFormat.description}</p>
            </div>
          </div>

          {/* Use Cases */}
          <div className="mb-6">
            <h4 className="text-sm font-semibold text-slate-500 dark:text-slate-500 uppercase tracking-wider mb-3">Compatible With</h4>
            <div className="flex flex-wrap gap-2">
              {selectedFormat.useCases.map((useCase) => (
                <span
                  key={useCase}
                  className={`px-3 py-1.5 rounded-lg text-sm font-medium ${colors.bg} ${colors.text} ${colors.border} border`}
                >
                  {useCase}
                </span>
              ))}
            </div>
          </div>

          {/* Sample Output */}
          <div>
            <h4 className="text-sm font-semibold text-slate-500 dark:text-slate-500 uppercase tracking-wider mb-3">Sample Output</h4>
            <pre className="p-4 rounded-xl bg-slate-900 dark:bg-black/40 text-sm text-slate-300 overflow-x-auto font-mono border border-slate-800 dark:border-slate-700">
              {selectedFormat.sample}
            </pre>
          </div>
        </div>
      </div>

      {/* Additional Info */}
      <div className="animate-on-scroll mt-12 grid grid-cols-1 md:grid-cols-3 gap-4">
        {[
          { icon: Download, label: 'One-Click Export', desc: 'Download in any format instantly' },
          { icon: FileJson, label: 'Metadata Preserved', desc: 'All annotation details included' },
          { icon: ArrowRight, label: 'ML-Ready Output', desc: 'Start training immediately' },
        ].map((item) => (
          <div key={item.label} className="text-center p-6 glass-card rounded-2xl">
            <div className="inline-flex items-center justify-center w-12 h-12 rounded-xl bg-indigo-100 dark:bg-indigo-500/20 mb-3">
              <item.icon className="w-6 h-6 text-indigo-600 dark:text-indigo-400" />
            </div>
            <h4 className="font-semibold text-slate-800 dark:text-white mb-1">{item.label}</h4>
            <p className="text-sm text-slate-600 dark:text-slate-400">{item.desc}</p>
          </div>
        ))}
      </div>
    </div>
  );
}
