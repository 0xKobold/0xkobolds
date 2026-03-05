import { ResumeData } from '@/types';

export function buildResumePrompt(
  resumeText: string,
  jobDescription: string,
  answers: ResumeData['answers'],
  templateStyle: string
): string {
  return `Given the following information, create an optimized, professional resume tailored to the job description.

## ORIGINAL RESUME
${resumeText}

## JOB DESCRIPTION
${jobDescription}

## ADDITIONAL CONTEXT
1. Key Achievements: ${answers.achievements}
2. Unique Value Proposition: ${answers.unique}
3. Industries Worked In: ${answers.industries}
4. Soft Skills: ${answers.softSkills}
5. Additional Highlights: ${answers.highlights}

## TEMPLATE STYLE
${templateStyle}

## INSTRUCTIONS
1. Analyze the job description and identify key requirements, skills, and qualifications
2. Rewrite the resume to emphasize relevant experience and skills that match the job
3. Use strong action verbs and quantify achievements where possible
4. Keep the content concise and professional
5. Optimize for ATS (Applicant Tracking Systems) by including relevant keywords
6. Generate a compelling professional summary that bridges the candidate's experience with the role

## OUTPUT FORMAT
Return ONLY a JSON object with this exact structure (no markdown code blocks):
{
  "header": {
    "name": "Full Name",
    "contact": "City, State | Phone | Email | LinkedIn",
    "summary": "Compelling 3-4 sentence professional summary"
  },
  "experience": [
    {
      "title": "Job Title",
      "company": "Company Name",
      "dates": "Start - End",
      "bullets": ["Achievement 1", "Achievement 2", "Achievement 3"]
    }
  ],
  "education": [
    {
      "degree": "Degree Name",
      "school": "School Name",
      "year": "Year"
    }
  ],
  "skills": ["Skill 1", "Skill 2", "Skill 3", "Skill 4", "Skill 5"]
}`;
}
