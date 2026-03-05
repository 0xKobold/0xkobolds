'use client';

import { ResumeSections, Template } from '@/types';
import { TEMPLATES } from '@/lib/templates';

interface ResumePreviewProps {
  resume: ResumeSections;
  templateId?: string;
}

export function ResumePreview({ resume, templateId = 'modern' }: ResumePreviewProps) {
  const template = TEMPLATES.find((t) => t.id === templateId);
  const style = template?.style || 'modern';

  const containerClasses: Record<Template['style'], string> = {
    modern: 'font-sans bg-white',
    classic: 'font-serif bg-stone-50',
    creative: 'font-sans bg-gradient-to-br from-purple-50 to-pink-50',
    tech: 'font-mono bg-slate-50',
  };

  const headerClasses: Record<Template['style'], string> = {
    modern: 'border-b-2 border-blue-500',
    classic: 'border-b border-stone-300 pb-4',
    creative: 'border-b-4 border-purple-400',
    tech: 'border-b border-slate-400',
  };

  const sectionTitleClasses: Record<Template['style'], string> = {
    modern: 'text-blue-600 uppercase tracking-wide text-sm',
    classic: 'text-stone-700 uppercase text-xs tracking-widest font-bold',
    creative: 'text-purple-600 font-bold',
    tech: 'text-slate-600 uppercase text-xs font-bold',
  };

  return (
    <div className={`${containerClasses[style]} p-8 shadow-lg rounded-lg min-h-[800px] text-gray-800`}>
      {/* Header */}
      <header className={`mb-6 ${headerClasses[style]}`}>
        <h1 className="text-2xl font-bold text-gray-900 mb-1">{resume.header.name}</h1>
        <p className="text-sm text-gray-600 mb-2">{resume.header.contact}</p>
        <p className="text-gray-700 leading-relaxed">{resume.header.summary}</p>
      </header>

      {/* Experience */}
      <section className="mb-6">
        <h2 className={`${sectionTitleClasses[style]} mb-3`}>Experience</h2>
        {resume.experience.map((exp, i) => (
          <div key={i} className="mb-4">
            <div className="flex justify-between items-baseline mb-1">
              <h3 className="font-semibold text-gray-900">{exp.title}</h3>
              <span className="text-sm text-gray-500">{exp.dates}</span>
            </div>
            <p className="text-sm font-medium text-gray-700 mb-2">{exp.company}</p>
            <ul className="space-y-1">
              {exp.bullets.map((bullet, j) => (
                <li key={j} className="text-sm text-gray-600 pl-4 relative">
                  <span className="absolute left-0">•</span>
                  {bullet}
                </li>
              ))}
            </ul>
          </div>
        ))}
      </section>

      {/* Education */}
      <section className="mb-6">
        <h2 className={`${sectionTitleClasses[style]} mb-3`}>Education</h2>
        {resume.education.map((edu, i) => (
          <div key={i} className="mb-2">
            <div className="flex justify-between items-baseline">
              <p className="font-medium text-gray-900">{edu.degree}</p>
              <span className="text-sm text-gray-500">{edu.year}</span>
            </div>
            <p className="text-sm text-gray-600">{edu.school}</p>
          </div>
        ))}
      </section>

      {/* Skills */}
      <section>
        <h2 className={`${sectionTitleClasses[style]} mb-3`}>Skills</h2>
        <div className="flex flex-wrap gap-2">
          {resume.skills.map((skill, i) => (
            <span
              key={i}
              className={`px-2 py-1 text-sm rounded ${
                style === 'creative'
                  ? 'bg-purple-100 text-purple-700'
                  : 'bg-gray-100 text-gray-700'
              }`}
            >
              {skill}
            </span>
          ))}
        </div>
      </section>
    </div>
  );
}
