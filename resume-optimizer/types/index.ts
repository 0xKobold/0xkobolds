export interface ResumeData {
  originalText: string;
  jobDescription: string;
  answers: {
    achievements: string;
    unique: string;
    industries: string;
    softSkills: string;
    highlights: string;
  };
  selectedTemplate: string | null;
  generatedResume: ResumeSections | null;
  isLoading: boolean;
}

export interface ResumeSections {
  header: {
    name: string;
    contact: string;
    summary: string;
  };
  experience: Array<{
    title: string;
    company: string;
    dates: string;
    bullets: string[];
  }>;
  education: Array<{
    degree: string;
    school: string;
    year: string;
  }>;
  skills: string[];
}

export interface Template {
  id: string;
  name: string;
  description: string;
  style: 'modern' | 'classic' | 'creative' | 'tech';
}

export type GenerationRequest = {
  resumeText: string;
  jobDescription: string;
  answers: ResumeData['answers'];
  templateId: string;
};

export type GenerationResponse = {
  success: boolean;
  resume?: ResumeSections;
  error?: string;
};

export type UploadResponse = {
  success: boolean;
  text?: string;
  error?: string;
};
