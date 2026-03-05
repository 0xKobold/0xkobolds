import { Template } from '@/types';

export const TEMPLATES: Template[] = [
  {
    id: 'modern',
    name: 'Modern Minimal',
    description: 'Clean, contemporary design with ample white space',
    style: 'modern',
  },
  {
    id: 'classic',
    name: 'Professional Classic',
    description: 'Traditional layout trusted by Fortune 500 companies',
    style: 'classic',
  },
  {
    id: 'creative',
    name: 'Creative Bold',
    description: 'Eye-catching design for creative industries',
    style: 'creative',
  },
  {
    id: 'tech',
    name: 'Tech Focused',
    description: 'Optimized for tech roles with clear skill highlighting',
    style: 'tech',
  },
];

export function getTemplateById(id: string): Template | undefined {
  return TEMPLATES.find((t) => t.id === id);
}

export function getTemplateStyleClass(style: Template['style']): string {
  const classes: Record<Template['style'], string> = {
    modern: 'font-sans bg-white',
    classic: 'font-serif bg-gray-50',
    creative: 'font-sans bg-gradient-to-br',
    tech: 'font-mono bg-slate-50',
  };
  return classes[style];
}
