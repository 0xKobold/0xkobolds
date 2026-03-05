'use client';

import { Template } from '@/types';
import { Card } from '@/components/ui/card';
import { Check } from 'lucide-react';

interface TemplateCardProps {
  template: Template;
  isSelected: boolean;
  onSelect: () => void;
}

export function TemplateCard({ template, isSelected, onSelect }: TemplateCardProps) {
  const stylePreviews: Record<Template['style'], string> = {
    modern: 'bg-gradient-to-br from-gray-50 to-gray-100 border-gray-200',
    classic: 'bg-gradient-to-br from-stone-50 to-stone-100 border-stone-200',
    creative: 'bg-gradient-to-br from-purple-50 to-pink-50 border-purple-200',
    tech: 'bg-gradient-to-br from-slate-50 to-slate-100 border-slate-200',
  };

  return (
    <Card
      onClick={onSelect}
      className={`relative cursor-pointer border-2 transition-all hover:shadow-lg ${
        isSelected ? 'border-blue-500 shadow-lg' : 'border-transparent hover:border-gray-200'
      }`}
    >
      <div className="p-6">
        {/* Preview Area */}
        <div
          className={`h-32 rounded-md mb-4 border-2 border-dashed ${stylePreviews[template.style]}`}
        >
          <div className="h-full flex items-center justify-center">
            <div className="w-16 h-20 bg-white rounded shadow-sm p-2">
              <div className="h-2 w-10 bg-gray-200 rounded mb-1" />
              <div className="h-1 w-full bg-gray-100 rounded mb-1" />
              <div className="h-1 w-3/4 bg-gray-100 rounded mb-1" />
              <div className="h-1 w-5/6 bg-gray-100 rounded mb-1" />
              <div className="h-1 w-full bg-gray-100 rounded mb-1" />
              <div className="h-1 w-4/5 bg-gray-100 rounded" />
            </div>
          </div>
        </div>

        {/* Info */}
        <h3 className="font-semibold text-gray-900 mb-1">{template.name}</h3>
        <p className="text-sm text-gray-500">{template.description}</p>

        {/* Checkmark */}
        {isSelected && (
          <div className="absolute top-3 right-3 w-6 h-6 bg-blue-500 rounded-full flex items-center justify-center">
            <Check className="w-4 h-4 text-white" />
          </div>
        )}
      </div>
    </Card>
  );
}
