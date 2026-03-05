import { NextRequest, NextResponse } from 'next/server';
import { generateResume } from '@/lib/openrouter';
import { buildResumePrompt } from '@/lib/prompts';
import { GenerationRequest, GenerationResponse, ResumeSections } from '@/types';

export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    const body: GenerationRequest = await request.json();
    const { resumeText, jobDescription, answers, templateId } = body;

    if (!resumeText || !jobDescription) {
      return NextResponse.json<GenerationResponse>(
        { success: false, error: 'Missing required fields' },
        { status: 400 }
      );
    }

    // Build prompt
    const prompt = buildResumePrompt(resumeText, jobDescription, answers, templateId);

    // Generate with LLM
    const llmResponse = await generateResume(prompt);

    // Parse the JSON from LLM response
    // Handle both JSON code blocks and plain JSON
    let jsonStr = llmResponse;
    const codeBlockMatch = llmResponse.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (codeBlockMatch) {
      jsonStr = codeBlockMatch[1];
    }

    const resume: ResumeSections = JSON.parse(jsonStr);

    return NextResponse.json<GenerationResponse>({
      success: true,
      resume,
    });
  } catch (error) {
    console.error('Generation error:', error);
    return NextResponse.json<GenerationResponse>(
      { success: false, error: (error as Error).message },
      { status: 500 }
    );
  }
}
