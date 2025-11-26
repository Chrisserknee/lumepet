"use client";

import { useEffect, useRef } from "react";

const steps = [
  {
    number: "01",
    title: "Upload",
    description: "Select your favorite photo of your beloved pet. Any clear image works beautifully.",
    icon: (
      <svg className="w-8 h-8" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
      </svg>
    ),
  },
  {
    number: "02",
    title: "We Paint",
    description: "Our master painters transform your pet into a stunning Renaissance oil painting masterpiece.",
    icon: (
      <svg className="w-8 h-8" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9.53 16.122a3 3 0 00-5.78 1.128 2.25 2.25 0 01-2.4 2.245 4.5 4.5 0 008.4-2.245c0-.399-.078-.78-.22-1.128zm0 0a15.998 15.998 0 003.388-1.62m-5.043-.025a15.994 15.994 0 011.622-3.395m3.42 3.42a15.995 15.995 0 004.764-4.648l3.876-5.814a1.151 1.151 0 00-1.597-1.597L14.146 6.32a15.996 15.996 0 00-4.649 4.763m3.42 3.42a6.776 6.776 0 00-3.42-3.42" />
      </svg>
    ),
  },
  {
    number: "03",
    title: "Download",
    description: "Purchase to unlock your high-resolution, museum-quality portrait. Print and frame it!",
    icon: (
      <svg className="w-8 h-8" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
      </svg>
    ),
  },
];

export default function HowItWorks() {
  const sectionRef = useRef<HTMLElement>(null);

  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            entry.target.classList.add("visible");
          }
        });
      },
      { threshold: 0.1 }
    );

    const elements = sectionRef.current?.querySelectorAll(".reveal");
    elements?.forEach((el) => observer.observe(el));

    return () => observer.disconnect();
  }, []);

  return (
    <section ref={sectionRef} className="py-24 px-6" id="how-it-works">
      <div className="max-w-5xl mx-auto">
        {/* Section Header */}
        <div className="text-center mb-16 reveal">
          <span 
            className="uppercase tracking-[0.3em] text-sm font-medium mb-4 block"
            style={{ color: '#C5A572' }}
          >
            Simple Process
          </span>
          <h2 
            className="text-3xl sm:text-4xl md:text-5xl font-semibold"
            style={{ fontFamily: "'Cormorant Garamond', Georgia, serif", color: '#2C2C2C' }}
          >
            How it works
          </h2>
        </div>

        {/* Steps */}
        <div className="grid md:grid-cols-3 gap-8 md:gap-12">
          {steps.map((step, index) => (
            <div
              key={step.number}
              className="reveal"
              style={{ transitionDelay: `${index * 150}ms` }}
            >
              <div className="card text-center group h-full">
                {/* Number */}
                <div 
                  className="text-6xl font-bold mb-4 transition-colors"
                  style={{ 
                    fontFamily: "'Cormorant Garamond', Georgia, serif",
                    color: 'rgba(197, 165, 114, 0.3)' 
                  }}
                >
                  {step.number}
                </div>
                
                {/* Icon */}
                <div 
                  className="w-16 h-16 mx-auto mb-6 rounded-full flex items-center justify-center transition-all duration-300 group-hover:text-white"
                  style={{ 
                    backgroundColor: '#F5EFE6',
                    color: '#722F37'
                  }}
                >
                  {step.icon}
                </div>
                
                {/* Title */}
                <h3 
                  className="text-2xl font-semibold mb-3"
                  style={{ fontFamily: "'Cormorant Garamond', Georgia, serif", color: '#2C2C2C' }}
                >
                  {step.title}
                </h3>
                
                {/* Description */}
                <p style={{ color: '#4A4A4A', lineHeight: 1.7 }}>
                  {step.description}
                </p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
