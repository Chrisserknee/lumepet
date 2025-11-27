"use client";

import { useEffect, useRef } from "react";

const testimonials = [
  {
    id: 1,
    quote: "I honestly didn't expect to get emotional, but this captured my dog's personality so perfectly. It's now framed in our living room and everyone asks about it.",
    author: "Hannah R.",
  },
  {
    id: 2,
    quote: "I uploaded a random photo just to test it and ended up ordering the full version. The detail is actually insane.",
    author: "Marcus L.",
  },
  {
    id: 3,
    quote: "This felt way more personal than I thought it would. It looks like something you'd find in an old European gallery.",
    author: "Claire J.",
  },
];

export default function Testimonials() {
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
      className="py-20 sm:py-24 px-6"
      id="testimonials"
    >
      <div className="max-w-5xl mx-auto">
        {/* Rating Badge */}
        <div className="text-center mb-12 sm:mb-16 reveal">
          <p
            className="text-sm sm:text-base tracking-wide"
            style={{
              fontFamily: "'Cormorant Garamond', Georgia, serif",
              color: '#B8B2A8',
              fontStyle: 'italic',
            }}
          >
            Rated 5.0 ⭐ by happy customers
          </p>
        </div>

        {/* Testimonials Grid */}
        <div className="grid md:grid-cols-3 gap-8 sm:gap-10">
          {testimonials.map((testimonial, index) => (
            <div
              key={testimonial.id}
              className="reveal"
              style={{ transitionDelay: `${index * 150}ms` }}
            >
              <div
                className="h-full p-6 sm:p-8 rounded-2xl relative"
                style={{
                  backgroundColor: 'rgba(26, 26, 26, 0.6)',
                  border: '1px solid rgba(197, 165, 114, 0.15)',
                }}
              >
                {/* Quote mark */}
                <div
                  className="absolute -top-3 left-6"
                  style={{
                    fontFamily: "'Cormorant Garamond', Georgia, serif",
                    fontSize: '4rem',
                    lineHeight: 1,
                    color: 'rgba(197, 165, 114, 0.3)',
                  }}
                >
                  "
                </div>

                {/* Quote text */}
                <blockquote
                  className="text-sm sm:text-base leading-relaxed mb-6 pt-4"
                  style={{
                    fontFamily: "'Cormorant Garamond', Georgia, serif",
                    color: '#E8E4DC',
                    fontStyle: 'italic',
                  }}
                >
                  "{testimonial.quote}"
                </blockquote>

                {/* Author */}
                <p
                  className="text-sm"
                  style={{ color: '#C5A572' }}
                >
                  — {testimonial.author}
                </p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

