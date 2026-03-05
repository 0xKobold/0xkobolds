import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { ArrowRight, Sparkles } from 'lucide-react';

export function Hero() {
  return (
    <section className="relative overflow-hidden">
      {/* Background gradient */}
      <div className="absolute inset-0 bg-gradient-to-br from-blue-600 via-indigo-700 to-purple-800" />
      
      {/* Pattern overlay */}
      <div className="absolute inset-0 opacity-10"
        style={{
          backgroundImage: `radial-gradient(circle at 2px 2px, white 1px, transparent 0)`,
          backgroundSize: '32px 32px',
        }}
      />

      <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-24">
        <div className="text-center max-w-3xl mx-auto">
          <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-white/10 border border-white/20 text-white/90 text-sm mb-6">
            <Sparkles className="w-4 h-4" />
            <span>AI-Powered Resume Enhancement</span>
          </div>

          <h1 className="text-4xl sm:text-5xl lg:text-6xl font-bold text-white leading-tight mb-6">
            Optimize Your Resume with
            <span className="text-transparent bg-clip-text bg-gradient-to-r from-cyan-300 to-emerald-300">
              {' '}AI Precision
            </span>
          </h1>

          <p className="text-lg sm:text-xl text-white/80 mb-10 leading-relaxed">
            Upload your resume, add a job description, answer 5 targeted questions,
            and receive a professionally tailored resume optimized for ATS systems and human recruiters.
          </p>

          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <Link href="/optimize">
              <Button size="lg" className="bg-white text-blue-700 hover:bg-gray-100 px-8 py-6 text-lg font-semibold rounded-xl shadow-xl">
                Optimize My Resume
                <ArrowRight className="ml-2 w-5 h-5" />
              </Button>
            </Link>
          </div>
        </div>
      </div>
    </section>
  );
}
