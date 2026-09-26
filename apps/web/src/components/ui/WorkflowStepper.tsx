import React from 'react';
import { Check, Upload, Tag, Eye, Download } from 'lucide-react';

export type WorkflowStep = 'upload' | 'label' | 'review' | 'export';

interface Step {
  id: WorkflowStep;
  label: string;
  icon: React.ReactNode;
}

const steps: Step[] = [
  { id: 'upload', label: 'Upload', icon: <Upload className="w-4 h-4" /> },
  { id: 'label', label: 'Label', icon: <Tag className="w-4 h-4" /> },
  { id: 'review', label: 'Review', icon: <Eye className="w-4 h-4" /> },
  { id: 'export', label: 'Export', icon: <Download className="w-4 h-4" /> }
];

interface WorkflowStepperProps {
  currentStep: WorkflowStep;
  completedSteps?: WorkflowStep[];
  onStepClick?: (step: WorkflowStep) => void;
  compact?: boolean;
}

export const WorkflowStepper: React.FC<WorkflowStepperProps> = ({
  currentStep,
  completedSteps = [],
  onStepClick,
  compact = false
}) => {
  const currentIndex = steps.findIndex(s => s.id === currentStep);

  const getStepStatus = (step: Step, index: number) => {
    if (completedSteps.includes(step.id)) return 'completed';
    if (step.id === currentStep) return 'current';
    if (index < currentIndex) return 'completed';
    return 'upcoming';
  };

  return (
    <div className={`w-full ${compact ? 'px-2' : 'px-4'}`}>
      <div className="flex items-center justify-between relative">
        {/* Progress line background */}
        <div className="absolute left-0 right-0 top-1/2 h-0.5 bg-border -translate-y-1/2 mx-8" />

        {/* Progress line filled */}
        <div
          className="absolute left-0 top-1/2 h-0.5 bg-gradient-primary -translate-y-1/2 mx-8 transition-all duration-500"
          style={{
            width: `calc(${(currentIndex / (steps.length - 1)) * 100}% - 4rem)`,
            maxWidth: 'calc(100% - 4rem)'
          }}
        />

        {steps.map((step, index) => {
          const status = getStepStatus(step, index);
          const isClickable = onStepClick && (status === 'completed' || status === 'current');

          return (
            <div
              key={step.id}
              className="relative flex flex-col items-center z-10"
            >
              <button
                onClick={() => isClickable && onStepClick?.(step.id)}
                disabled={!isClickable}
                className={`
                  w-10 h-10 rounded-full flex items-center justify-center transition-all duration-300
                  ${status === 'completed'
                    ? 'bg-gradient-primary text-white shadow-lg shadow-primary/30'
                    : status === 'current'
                    ? 'bg-primary/20 text-primary border-2 border-primary ring-4 ring-primary/20'
                    : 'bg-surface-elevated text-text-muted border-2 border-border'
                  }
                  ${isClickable ? 'cursor-pointer hover:scale-110' : 'cursor-default'}
                `}
              >
                {status === 'completed' ? (
                  <Check className="w-5 h-5" />
                ) : (
                  step.icon
                )}
              </button>

              {!compact && (
                <span className={`
                  mt-2 text-xs font-medium transition-colors
                  ${status === 'current' ? 'text-primary' : status === 'completed' ? 'text-text' : 'text-text-muted'}
                `}>
                  {step.label}
                </span>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
};

// Compact inline version for header
export const WorkflowStepperInline: React.FC<WorkflowStepperProps> = ({
  currentStep,
  completedSteps = [],
  onStepClick
}) => {
  const currentIndex = steps.findIndex(s => s.id === currentStep);

  return (
    <div className="flex items-center gap-1">
      {steps.map((step, index) => {
        const isCompleted = completedSteps.includes(step.id) || index < currentIndex;
        const isCurrent = step.id === currentStep;
        const isClickable = onStepClick && (isCompleted || isCurrent);

        return (
          <React.Fragment key={step.id}>
            <button
              onClick={() => isClickable && onStepClick?.(step.id)}
              disabled={!isClickable}
              className={`
                flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium transition-all
                ${isCurrent
                  ? 'bg-primary/20 text-primary'
                  : isCompleted
                  ? 'text-text hover:bg-surface-elevated'
                  : 'text-text-muted'
                }
                ${isClickable ? 'cursor-pointer' : 'cursor-default'}
              `}
            >
              {isCompleted && !isCurrent ? (
                <Check className="w-3.5 h-3.5 text-success" />
              ) : (
                <span className={`w-4 h-4 rounded-full flex items-center justify-center text-[10px] font-bold
                  ${isCurrent ? 'bg-primary text-white' : 'bg-surface-elevated text-text-muted'}
                `}>
                  {index + 1}
                </span>
              )}
              <span className="hidden sm:inline">{step.label}</span>
            </button>

            {index < steps.length - 1 && (
              <div className={`w-4 h-0.5 ${index < currentIndex ? 'bg-primary' : 'bg-border'}`} />
            )}
          </React.Fragment>
        );
      })}
    </div>
  );
};

export default WorkflowStepper;
