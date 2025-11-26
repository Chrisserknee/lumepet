"use client";

import { useEffect, useRef } from "react";

const samples = [
  {
    id: 1,
    title: "Sir Whiskers III",
    pet: "Orange Tabby",
  },
  {
    id: 2,
    title: "Duke Barkington",
    pet: "Golden Retriever",
  },
  {
    id: 3,
    title: "Countess Fluffypaws",
    pet: "Persian Cat",
  },
];

export default function Gallery() {
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
    <section 
      ref={sectionRef} 
      className="py-24 px-6" 
      id="gallery"
      style={{ backgroundColor: 'rgba(255, 255, 255, 0.5)' }}
    >
      <div className="max-w-6xl mx-auto">
        {/* Section Header */}
        <div className="text-center mb-16 reveal">
          <span 
            className="uppercase tracking-[0.3em] text-sm font-medium mb-4 block"
            style={{ color: '#C5A572' }}
          >
            The Gallery
          </span>
          <h2 
            className="text-3xl sm:text-4xl md:text-5xl font-semibold mb-4"
            style={{ fontFamily: "'Cormorant Garamond', Georgia, serif", color: '#2C2C2C' }}
          >
            Royal Pet Portraits
          </h2>
          <p className="max-w-xl mx-auto" style={{ color: '#4A4A4A' }}>
            Behold the noble creatures who have been immortalized in the classical tradition. 
            Your pet could be next.
          </p>
        </div>

        {/* Gallery Grid */}
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-8">
          {samples.map((sample, index) => (
            <div
              key={sample.id}
              className="reveal"
              style={{ transitionDelay: `${index * 150}ms` }}
            >
              <div className="group cursor-pointer">
                {/* Frame */}
                <div className="ornate-frame">
                  <div 
                    className="relative aspect-[3/4] overflow-hidden rounded"
                    style={{ backgroundColor: '#F5EFE6' }}
                  >
                    {/* Placeholder */}
                    <div 
                      className="absolute inset-0 flex items-center justify-center"
                      style={{ 
                        background: 'linear-gradient(135deg, rgba(114, 47, 55, 0.2) 0%, rgba(197, 165, 114, 0.2) 100%)' 
                      }}
                    >
                      <div className="text-center p-4">
                        <svg 
                          className="w-16 h-16 mx-auto mb-2" 
                          style={{ color: 'rgba(197, 165, 114, 0.4)' }} 
                          fill="currentColor" 
                          viewBox="0 0 24 24"
                        >
                          <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-1 17.93c-3.95-.49-7-3.85-7-7.93 0-.62.08-1.21.21-1.79L9 15v1c0 1.1.9 2 2 2v1.93zm6.9-2.54c-.26-.81-1-1.39-1.9-1.39h-1v-3c0-.55-.45-1-1-1H8v-2h2c.55 0 1-.45 1-1V7h2c1.1 0 2-.9 2-2v-.41c2.93 1.19 5 4.06 5 7.41 0 2.08-.8 3.97-2.1 5.39z"/>
                        </svg>
                        <span 
                          className="text-sm italic"
                          style={{ 
                            fontFamily: "'Cormorant Garamond', Georgia, serif",
                            color: 'rgba(197, 165, 114, 0.6)' 
                          }}
                        >
                          Sample Portrait
                        </span>
                      </div>
                    </div>
                    
                    {/* Hover overlay */}
                    <div 
                      className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-300 flex items-center justify-center"
                      style={{ backgroundColor: 'rgba(44, 44, 44, 0.6)' }}
                    >
                      <div className="text-center text-white p-4">
                        <p 
                          className="text-2xl mb-1"
                          style={{ fontFamily: "'Cormorant Garamond', Georgia, serif" }}
                        >
                          {sample.title}
                        </p>
                        <p className="text-sm" style={{ color: 'rgba(255, 255, 255, 0.7)' }}>
                          {sample.pet}
                        </p>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Caption */}
                <div className="mt-4 text-center">
                  <h3 
                    className="text-xl group-hover:text-[#722F37] transition-colors"
                    style={{ fontFamily: "'Cormorant Garamond', Georgia, serif", color: '#2C2C2C' }}
                  >
                    {sample.title}
                  </h3>
                  <p className="text-sm" style={{ color: '#8B7355' }}>{sample.pet}</p>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
