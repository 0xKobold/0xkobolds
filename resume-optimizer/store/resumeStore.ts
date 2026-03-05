import { create } from 'zustand';
import { ResumeData, ResumeSections } from '@/types';

interface ResumeStore extends ResumeData {
  setOriginalText: (text: string) => void;
  setJobDescription: (desc: string) => void;
  setAnswer: (key: keyof ResumeData['answers'], value: string) => void;
  setSelectedTemplate: (template: string) => void;
  setGeneratedResume: (resume: ResumeSections) => void;
  setLoading: (loading: boolean) => void;
  reset: () => void;
}

const initialState: ResumeData = {
  originalText: '',
  jobDescription: '',
  answers: {
    achievements: '',
    unique: '',
    industries: '',
    softSkills: '',
    highlights: '',
  },
  selectedTemplate: null,
  generatedResume: null,
  isLoading: false,
};

export const useResumeStore = create<ResumeStore>((set) => ({
  ...initialState,
  setOriginalText: (text) => set({ originalText: text }),
  setJobDescription: (desc) => set({ jobDescription: desc }),
  setAnswer: (key, value) =>
    set((state) => ({
      answers: { ...state.answers, [key]: value },
    })),
  setSelectedTemplate: (template) => set({ selectedTemplate: template }),
  setGeneratedResume: (resume) => set({ generatedResume: resume }),
  setLoading: (loading) => set({ isLoading: loading }),
  reset: () => set(initialState),
}));
