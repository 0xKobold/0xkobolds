import { NextRequest, NextResponse } from 'next/server';
import { parseResume } from '@/lib/resumeParser';
import { UploadResponse } from '@/types';

export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    const formData = await request.formData();
    const file = formData.get('file') as File | null;

    if (!file) {
      return NextResponse.json<UploadResponse>(
        { success: false, error: 'No file provided' },
        { status: 400 }
      );
    }

    // Validate file type
    const validTypes = [
      'application/pdf',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'application/msword',
      'text/plain',
    ];

    if (!validTypes.includes(file.type)) {
      return NextResponse.json<UploadResponse>(
        { success: false, error: 'Invalid file type. Only PDF, DOCX, and TXT are allowed.' },
        { status: 400 }
      );
    }

    // Parse resume text
    const text = await parseResume(file);

    return NextResponse.json<UploadResponse>({
      success: true,
      text: text.slice(0, 50000), // Limit to 50k chars
    });
  } catch (error) {
    console.error('Upload error:', error);
    return NextResponse.json<UploadResponse>(
      { success: false, error: (error as Error).message },
      { status: 500 }
    );
  }
}
