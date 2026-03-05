# Resume Optimizer

AI-powered resume optimization tool built with Next.js, Tailwind CSS, Bun, and OpenRouter.

## Features

- **Upload Resume**: Drag & drop PDF, DOCX, or TXT files
- **Job Description**: Paste target job description for tailored optimization
- **5 Question Form**: Provide additional context to enhance your resume
- **4 Professional Templates**: Modern Minimal, Classic, Creative, Tech Focused
- **AI Generation**: Uses OpenRouter (Claude 3.5 Sonnet by default) for intelligent resume rewriting
- **Instant Results**: Generate and preview ATS-optimized resumes

## Tech Stack

- **Frontend**: Next.js 15 + React + TypeScript
- **Styling**: Tailwind CSS + shadcn/ui
- **State**: Zustand
- **Backend**: Next.js API Routes
- **PDF/DOCX Parsing**: pdf-parse + mammoth
- **LLM**: OpenRouter (Claude 3.5 Sonnet, GPT-4o Mini options)
- **Runtime**: Bun

## Quick Start

1. **Install dependencies**:
   ```bash
   bun install
   ```

2. **Configure OpenRouter**:
   - Copy `.env.local` and add your OpenRouter API key:
   ```bash
   OPENROUTER_API_KEY=sk-or-v1-...
   ```
   Get your key from [OpenRouter](https://openrouter.ai/keys)

3. **Run dev server**:
   ```bash
   bun run dev
   ```

4. **Open**: http://localhost:3000

## Architecture

### Flow
1. **Landing Page** (`/`) - Introduction and CTA
2. **Upload & Context** (`/optimize`) - Upload resume + job description + 5 questions
3. **Template Selection** (`/optimize/templates`) - Choose from 4 templates
4. **Result** (`/optimize/result`) - AI-generated resume with download/copy options

### API Routes
- `POST /api/upload` - Extracts text from PDF/DOCX files
- `POST /api/generate` - Calls OpenRouter to generate optimized resume

### State Management
Zustand store persists resume text, job description, answers, template selection, and generated result.

### Prompt Engineering
The resume generation prompt includes:
- Original resume content
- Target job description
- 5 contextual answers
- Template style preference
- Structured JSON output for consistent formatting

## File Structure

```
├── app/
│   ├── api/
│   │   ├── upload/route.ts      # File upload handler
│   │   └── generate/route.ts      # LLM generation
│   ├── optimize/
│   │   ├── page.tsx               # Upload & form view
│   │   ├── templates/page.tsx     # Template selection
│   │   └── result/page.tsx        # Generated resume
│   ├── page.tsx                   # Landing page
│   └── layout.tsx                 # Root layout
├── components/
│   ├── ui/                        # shadcn components
│   ├── file-upload.tsx            # Drag & drop upload
│   ├── form-builder.tsx           # 5-question form
│   ├── template-card.tsx          # Template selection card
│   ├── resume-preview.tsx         # Resume display
│   └── landing/                   # Landing page components
├── lib/
│   ├── openrouter.ts              # LLM client
│   ├── prompts.ts                 # Resume generation prompts
│   ├── templates.ts               # Template definitions
│   └── resumeParser.ts            # PDF/DOCX parsing
├── store/
│   └── resumeStore.ts             # Zustand state
└── types/
    └── index.ts                   # TypeScript types
```

## Deployment

**Vercel**:
```bash
vercel --prod
```

Set environment variable:
- `OPENROUTER_API_KEY`

## License

MIT
