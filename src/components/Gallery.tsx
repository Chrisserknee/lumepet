"use client";

import { useEffect, useRef } from "react";
import Image from "next/image";

const samples = [
  {
    id: 1,
    title: "Royal Chihuahua",
    pet: "Chihuahua",
    image: "/samples/chihuahua.png",
  },
  {
    id: 2,
    title: "Duke Barkington",
    pet: "Golden Retriever",
    image: "/samples/golden.png",
  },
  {
    id: 3,
    title: "Countess Tabby",
    pet: "Tabby Cat",
    image: "/samples/tabbycat.png",
  },
  {
    id: 4,
    title: "Noble Companion",
    pet: "Mixed Breed Dog",
    image: "/samples/dog2.png",
  },
  {
    id: 5,
    title: "Majestic Shadow",
    pet: "Black Cat",
    image: "/samples/cat2.png",
  },
  {
    id: 6,
    title: "Regal Companion",
    pet: "Chihuahua",
    image: "/samples/dog3.png",
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
      style={{ backgroundColor: 'rgba(20, 20, 20, 0.5)' }}
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
            style={{ fontFamily: "'Cormorant Garamond', Georgia, serif", color: '#F0EDE8' }}
          >
            Royal Pet Portraits
          </h2>
          <p className="max-w-xl mx-auto" style={{ color: '#B8B2A8' }}>
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
                    style={{ backgroundColor: '#1A1A1A' }}
                  >
                    {/* Actual Image */}
                    <Image
                      src={sample.image}
                      alt={`${sample.title} - ${sample.pet}`}
                      fill
                      className="object-cover"
                      sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw"
                    />
                    
                    {/* Hover overlay */}
                    <div 
                      className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-300 flex items-center justify-center"
                      style={{ backgroundColor: 'rgba(0, 0, 0, 0.7)' }}
                    >
                      <div className="text-center text-white p-4">
                        <p 
                          className="text-2xl mb-1"
                          style={{ fontFamily: "'Cormorant Garamond', Georgia, serif" }}
                        >
                          {sample.title}
                        </p>
                        <p className="text-sm" style={{ color: 'rgba(255, 255, 255, 0.6)' }}>
                          {sample.pet}
                        </p>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Caption */}
                <div className="mt-4 text-center">
                  <h3 
                    className="text-xl group-hover:text-[#C5A572] transition-colors"
                    style={{ fontFamily: "'Cormorant Garamond', Georgia, serif", color: '#F0EDE8' }}
                  >
                    {sample.title}
                  </h3>
                  <p className="text-sm" style={{ color: '#7A756D' }}>{sample.pet}</p>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
