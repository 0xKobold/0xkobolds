'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { FileUpload } from '@/components/file-upload';
import { FormBuilder } from '@/components/form-builder';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Card, CardContent } from '@/components/ui/card';
import { ArrowRight, Loader2 } from 'lucide-react';
import { useResumeStore } from '@/store/resumeStore';

export default function OptimizePage() {
  const router = useRouter();
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState('');

  const {
    originalText,
    jobDescription,
    setOriginalText,
    setJobDescription,
  } = useResumeStore();

  const handleFileUpload = async (file: File) => {
    if (!file) {
      setOriginalText('');
      return;
    }

    setUploading(true);
    setUploadError('');

    try {
      const formData = new FormData();
      formData.append('file', file);

      const response = await fetch('/api/upload', {
        method: 'POST',
        body: formData,
      });

      const data = await response.json();

      if (!data.success) {
        throw new Error(data.error || 'Upload failed');
      }

      setOriginalText(data.text);
    } catch (err) {
      setUploadError((err as Error).message);
      setOriginalText('');
    } finally {
      setUploading(false);
    }
  };

  const canProceed = originalText.length > 0 && jobDescription.length > 0;

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="bg-gradient-to-r from-blue-600 to-indigo-700 py-12">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <h1 className="text-3xl font-bold text-white">Optimize Your Resume</h1>
          <p className="text-blue-100 mt-2">Step 1: Upload and provide context</p>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="grid lg:grid-cols-2 gap-8">
          {/* Left Column - Upload & Job Description */}
          <div className="space-y-6">
            <Card>
              <CardContent className="p-6">
                <h2 className="text-lg font-semibold text-gray-900 mb-4">
                  Upload Resume
                </h2>
                <FileUpload onFileSelect={handleFileUpload} />
                {uploading && (
                  <div className="flex items-center gap-2 mt-4 text-blue-600">
                    <Loader2 className="w-4 h-4 animate-spin" />
                    <span className="text-sm">Extracting text from resume... </span>
                  </div>
                )}
                {uploadError && (
                  <p className="mt-4 text-sm text-red-600">{uploadError}</p>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardContent className="p-6">
                <div className="space-y-4">
                  <Label htmlFor="jobDescription" className="text-lg font-semibold">
                    Job Description
                  </Label>
                  <Textarea
                    id="jobDescription"
                    placeholder="Paste the job description here to tailor your resume..."
                    value={jobDescription}
                    onChange={(e) => setJobDescription(e.target.value)}
                    className="min-h-[200px] resize-none"
                  />
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Right Column - Form Builder */}
          <Card>
            <CardContent className="p-6">
              <h2 className="text-lg font-semibold text-gray-900 mb-1">
                Additional Context
              </h2>
              <p className="text-sm text-gray-500 mb-6">
                Answer these questions to help us create a better resume (optional)
              </p>
              <FormBuilder />
            </CardContent>
          </Card>
        </div>

        {/* Continue Button */}
        <div className="mt-8 flex justify-end">
          <Button
            size="lg"
            disabled={!canProceed}
            onClick={() => router.push('/optimize/templates')}
            className="px-8"
          >
            Continue to Templates
            <ArrowRight className="ml-2 w-5 h-5" />
          </Button>
        </div>

        {!canProceed && (
          <p className="mt-4 text-center text-sm text-gray-500">
            Upload a resume and provide a job description to continue
          </p>
        )}
      </div>
    </div>
  );
}
