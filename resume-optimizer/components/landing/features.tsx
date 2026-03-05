import { Zap, Layout, Clock } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';

const features = [
  {
    icon: Zap,
    title: 'AI-Powered Optimization',
    description: 'Our AI analyzes job descriptions and tailors your resume to match key requirements, maximizing your chances of getting noticed.',
  },
  {
    icon: Layout,
    title: 'Professional Templates',
    description: 'Choose from 4 ATS-friendly templates designed by hiring experts. Clean, modern layouts that showcase your experience.',
  },
  {
    icon: Clock,
    title: 'Instant Results',
    description: 'Generate a professional, optimized resume in seconds. No waiting, no hassle - just instant, quality results.',
  },
];

export function Features() {
  return (
    <section className="py-20 bg-gray-50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="text-center mb-16">
          <h2 className="text-3xl sm:text-4xl font-bold text-gray-900 mb-4">
            How it works
          </h2>
          <p className="text-lg text-gray-600 max-w-2xl mx-auto">
            Three simple steps to a better resume
          </p>
        </div>

        <div className="grid md:grid-cols-3 gap-8">
          {features.map((feature, index) => (
            <Card key={index} className="border-0 shadow-lg">
              <CardContent className="p-6">
                <div className="w-12 h-12 bg-blue-100 rounded-xl flex items-center justify-center mb-4">
                  <feature.icon className="w-6 h-6 text-blue-600" />
                </div>
                <h3 className="text-xl font-semibold text-gray-900 mb-2">
                  {feature.title}
                </h3>
                <p className="text-gray-600">{feature.description}</p>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    </section>
  );
}
