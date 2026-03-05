'use client';

import { useEffect, useState, useCallback } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ResumePreview } from '@/components/resume-preview';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { ArrowLeft, Download, Copy, RotateCcw } from 'lucide-react';
import { useResumeStore } from '@/store/resumeStore';
import { ResumeSections } from '@/types';

export default function ResultPage() {
  const router = useRouter();
  const [error, setError] = useState('');
  const [localResume, setLocalResume] = useState<ResumeSections | null>(null);

  const {
    originalText,
    jobDescription,
    answers,
    selectedTemplate,
    generatedResume,
    isLoading,
    setGeneratedResume,
    setLoading,
    reset,
  } = useResumeStore();

  const generateResume = useCallback(async () => {
    if (!selectedTemplate || !originalText || !jobDescription) {
      setError('Missing required data. Please start over.');
      setLoading(false);
      return;
    }

    try {
      const response = await fetch('/api/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          resumeText: originalText,
          jobDescription,
          answers,
          templateId: selectedTemplate,
        }),
      });

      const data = await response.json();

      if (!data.success) {
        throw new Error(data.error || 'Generation failed');
      }

      setGeneratedResume(data.resume);
      setLocalResume(data.resume);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  }, [originalText, jobDescription, answers, selectedTemplate, setGeneratedResume, setLoading]);

  useEffect(() => {
    // Redirect if missing data
    if (!selectedTemplate || !originalText) {
      router.push('/optimize');
      return;
    }

    // Generate on mount if not already done
    if (!generatedResume && !localResume && isLoading) {
      generateResume();
    }
  }, [
    selectedTemplate,
    originalText,
    generatedResume,
    localResume,
    isLoading,
    router,
    generateResume,
  ]);

  const handleDownload = () => {
    const resume = generatedResume || localResume;
    if (!resume) return;

    const content = JSON.stringify(resume, null, 2);
    const blob = new Blob([content], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `optimized-resume-${Date.now()}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const handleCopy = async () => {
    const resume = generatedResume || localResume;
    if (!resume) return;

    const plainText = `${resume.header.name}
${resume.header.contact}

Summary:
${resume.header.summary}

Experience:
${resume.experience
  .map(
    (e) =>
      `${e.title} at ${e.company} (${e.dates})\n${e.bullets.map((b) => `  • ${b}`).join('\n')}`
  )
  .join('\n\n')}

Education:
${resume.education.map((e) => `${e.degree} - ${e.school} (${e.year})`).join('\n')}

Skills:
${resume.skills.join(', ')}`;

    await navigator.clipboard.writeText(plainText);
    alert('Resume copied to clipboard!');
  };

  const handleStartOver = () => {
    reset();
    router.push('/');
  };

  const resume = generatedResume || localResume;

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="bg-gradient-to-r from-blue-600 to-indigo-700 py-12">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <h1 className="text-3xl font-bold text-white">Your Optimized Resume</h1>
          <p className="text-blue-100 mt-2">AI-powered and tailored just for you</p>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {isLoading ? (
          <div className="text-center py-20">
            <div className="animate-spin w-12 h-12 border-4 border-blue-200 border-t-blue-600 rounded-full mx-auto mb-4"></div>
            <h2 className="text-xl font-semibold text-gray-900">Generating your resume... </h2>
            <p className="text-gray-500 mt-2">This may take a few seconds</p>
          </div>
        ) : error ? (
          <Card className="p-8">
            <div className="text-center">
              <h2 className="text-xl font-semibold text-red-600 mb-2">Error</h2>
              <p className="text-gray-600 mb-4">{error}</p>
              <Button onClick={() => router.push('/optimize')}>
                <ArrowLeft className="mr-2 w-4 h-4" />
                Try Again
              </Button>
            </div>
          </Card>
        ) : resume ? (
          <div className="grid lg:grid-cols-3 gap-8">
            <div className="lg:col-span-2">
              <ResumePreview resume={resume} templateId={selectedTemplate || undefined} />
            </div>
            <div className="space-y-4">
              <Card className="p-4">
                <h3 className="font-semibold mb-4">Actions</h3>
                <div className="space-y-2">
                  <Button onClick={handleDownload} className="w-full">
                    <Download className="mr-2 w-4 h-4" />
                    Download JSON
                  </Button>
                  <Button variant="outline" onClick={handleCopy} className="w-full">
                    <Copy className="mr-2 w-4 h-4" />
                    Copy Text
                  </Button>
                </div>
              </Card>

              <Card className="p-4">
                <h3 className="font-semibold mb-4">Start Over</h3>
                <Button variant="ghost" onClick={handleStartOver} className="w-full">
                  <RotateCcw className="mr-2 w-4 h-4" />
                  Create New Resume
                </Button>
              </Card>
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}
