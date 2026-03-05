import pdfParse from 'pdf-parse';
import mammoth from 'mammoth';

export async function parseResume(file: File): Promise<string> {
  const arrayBuffer = await file.arrayBuffer();
  const buffer = Buffer.from(arrayBuffer);
  const type = file.type;

  if (type === 'application/pdf') {
    return await parsePDF(buffer);
  } else if (
    type === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' ||
    type === 'application/msword'
  ) {
    return await parseDOCX(buffer);
  } else if (type === 'text/plain') {
    return new TextDecoder().decode(arrayBuffer);
  }

  throw new Error('Unsupported file type. Please upload PDF or DOCX.');
}

async function parsePDF(buffer: Buffer): Promise<string> {
  try {
    const data = await pdfParse(buffer);
    return data.text;
  } catch (error) {
    throw new Error('Failed to parse PDF: ' + (error as Error).message);
  }
}

async function parseDOCX(buffer: Buffer): Promise<string> {
  try {
    const result = await mammoth.extractRawText({ buffer });
    return result.value;
  } catch (error) {
    throw new Error('Failed to parse DOCX: ' + (error as Error).message);
  }
}
