'use client';

import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { useResumeStore } from '@/store/resumeStore';

const QUESTIONS = [
  {
    key: 'achievements' as const,
    label: 'Top Achievements',
    placeholder: 'What are your top 3 key achievements? Be specific and include metrics if possible.',
  },
  {
    key: 'unique' as const,
    label: 'Unique Value',
    placeholder: 'What makes you uniquely suited for this role? What sets you apart?',
  },
  {
    key: 'industries' as const,
    label: 'Industry Experience',
    placeholder: 'Which industries have you worked in? (e.g., Tech, Healthcare, Finance)',
  },
  {
    key: 'softSkills' as const,
    label: 'Soft Skills',
    placeholder: 'Which soft skills do you excel at? (e.g., Leadership, Communication, Problem-solving)',
  },
  {
    key: 'highlights' as const,
    label: 'Additional Highlights',
    placeholder: 'Any specific accomplishments, certifications, or projects to highlight?',
  },
];

export function FormBuilder() {
  const { answers, setAnswer } = useResumeStore();

  return (
    <div className="space-y-6">
      {QUESTIONS.map((q) => (
        <div key={q.key} className="space-y-2">
          <Label htmlFor={q.key} className="text-sm font-medium text-gray-700">
            {q.label}
          </Label>
          <Textarea
            id={q.key}
            placeholder={q.placeholder}
            value={answers[q.key]}
            onChange={(e) => setAnswer(q.key, e.target.value)}
            className="min-h-[80px] resize-none border-gray-200 focus:border-blue-500 focus:ring-blue-500"
          />
        </div>
      ))}
    </div>
  );
}
