import { Hero } from '@/components/landing/hero';
import { Features } from '@/components/landing/features';

export default function HomePage() {
  return (
    <main>
      <Hero />
      <Features />
      <section className="py-16 bg-white">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <p className="text-gray-500 text-sm">
            Built with Next.js, Tailwind CSS, and OpenRouter AI
          </p>
        </div>
      </section>
    </main>
  );
}
