'use client';

import { useRouter } from 'next/navigation';
import { TemplateCard } from '@/components/template-card';
import { Button } from '@/components/ui/button';
import { ArrowLeft, ArrowRight } from 'lucide-react';
import { useResumeStore } from '@/store/resumeStore';
import { TEMPLATES } from '@/lib/templates';
import Link from 'next/link';

export default function TemplatesPage() {
  const router = useRouter();
  const { selectedTemplate, setSelectedTemplate, setLoading } = useResumeStore();

  const handleGenerate = async () => {
    if (!selectedTemplate) return;
    setLoading(true);
    router.push('/optimize/result');
  };

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="bg-gradient-to-r from-blue-600 to-indigo-700 py-12">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <h1 className="text-3xl font-bold text-white">Choose a Template</h1>
          <p className="text-blue-100 mt-2">Step 2: Select a professional template</p>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-6">
          {TEMPLATES.map((template) => (
            <TemplateCard
              key={template.id}
              template={template}
              isSelected={selectedTemplate === template.id}
              onSelect={() => setSelectedTemplate(template.id)}
            />
          ))}
        </div>

        <div className="mt-8 flex justify-between">
          <Link href="/optimize">
            <Button variant="outline" size="lg">
              <ArrowLeft className="mr-2 w-5 h-5" />
              Back
            </Button>
          </Link>

          <Button
            size="lg"
            disabled={!selectedTemplate}
            onClick={handleGenerate}
            className="px-8 bg-gradient-to-r from-blue-600 to-indigo-600"
          >
            Generate Resume
            <ArrowRight className="ml-2 w-5 h-5" />
          </Button>
        </div>

        {!selectedTemplate && (
          <p className="mt-4 text-center text-sm text-gray-500">
            Select a template to continue
          </p>
        )}
      </div>
    </div>
  );
}
