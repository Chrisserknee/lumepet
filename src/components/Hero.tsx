"use client";

import { useState, useEffect } from "react";
import Image from "next/image";
import { captureEvent } from "@/lib/posthog";

interface HeroProps {
  onUploadClick: () => void;
}

export default function Hero({ onUploadClick }: HeroProps) {
  const [portraitCount, setPortraitCount] = useState<number>(335);
  
  useEffect(() => {
    // Fetch current portrait count
    fetch("/api/stats")
      .then((res) => res.json())
      .then((data) => {
        if (data.portraitsCreated) {
          setPortraitCount(data.portraitsCreated);
        }
      })
      .catch(() => {
        // Keep default count on error
      });
  }, []);

  return (
    <section className="min-h-[85vh] flex flex-col items-center justify-center px-4 sm:px-6 py-12 sm:py-16 relative overflow-hidden w-full">
      {/* Decorative elements */}
      <div 
        className="absolute top-20 left-10 w-32 h-32 rounded-full blur-3xl" 
        style={{ backgroundColor: 'rgba(197, 165, 114, 0.08)' }} 
      />
      <div 
        className="absolute bottom-20 right-10 w-48 h-48 rounded-full blur-3xl" 
        style={{ backgroundColor: 'rgba(139, 58, 66, 0.08)' }} 
      />

      <div className="w-full max-w-4xl mx-auto text-center relative z-10 flex flex-col items-center">
        {/* Subtle vignette behind headline */}
        <div 
          className="absolute inset-0 -z-10 pointer-events-none"
          style={{
            background: 'radial-gradient(ellipse 80% 60% at 50% 45%, rgba(197, 165, 114, 0.08) 0%, rgba(197, 165, 114, 0.03) 40%, transparent 70%)',
            filter: 'blur(40px)',
            opacity: 0.6
          }}
        />

        {/* LumePet Logo */}
        <div className="mb-4 sm:mb-5 animate-fade-in-up">
          <div className="flex justify-center">
            <div 
              className="relative logo-sparkle-container"
              style={{
                animation: 'pulse-glow 3s ease-in-out infinite'
              }}
            >
              <Image
                src="/samples/LumePet2.png"
                alt="LumePet Logo"
                width={100}
                height={100}
                className="object-contain animate-float"
                priority
              />
              {/* Sparkle particles */}
              <span className="sparkle sparkle-1"></span>
              <span className="sparkle sparkle-2"></span>
              <span className="sparkle sparkle-3"></span>
              <span className="sparkle sparkle-4"></span>
              <span className="sparkle sparkle-5"></span>
              <span className="sparkle sparkle-6"></span>
              <span className="sparkle sparkle-7"></span>
              <span className="sparkle sparkle-8"></span>
            </div>
          </div>
        </div>

        {/* Tagline */}
        <p 
          className="text-base sm:text-lg mb-3 animate-fade-in-up tracking-wide"
          style={{ color: '#C5A572', fontFamily: "'Cormorant Garamond', Georgia, serif" }}
        >
          Your Cherished Pet in a Classic Masterpiece
        </p>

        {/* Main headline */}
        <h1 
          className="text-3xl sm:text-4xl md:text-5xl lg:text-6xl mb-6 sm:mb-8 animate-fade-in-up delay-100 text-center relative"
          style={{ 
            fontFamily: "'EB Garamond', 'Cormorant Garamond', Georgia, serif", 
            color: '#F0EDE8', 
            fontWeight: 400,
            letterSpacing: '0.02em',
            textShadow: '0 2px 10px rgba(0, 0, 0, 0.3), 0 1px 3px rgba(0, 0, 0, 0.2)',
            lineHeight: '1.15'
          }}
        >
          <span className="block mb-1.5" style={{ letterSpacing: '0.03em', fontWeight: 250 }}>
            Turn your pet into a
          </span>
          <span 
            className="relative block mx-auto text-center"
            style={{ 
              color: '#C5A572',
              fontWeight: 600,
              letterSpacing: '0.03em',
              textShadow: `
                0 0 8px rgba(197, 165, 114, 0.5),
                0 0 16px rgba(197, 165, 114, 0.3),
                0 0 24px rgba(197, 165, 114, 0.15),
                0 2px 8px rgba(0, 0, 0, 0.4),
                0 0 60px rgba(0, 0, 0, 0.3)
              `.trim().replace(/\s+/g, ' ')
            }}
          >
            {/* Candlelit glow effect - tighter, more focused */}
            <span 
              className="absolute inset-0 blur-xl opacity-30 pointer-events-none"
              style={{
                background: 'radial-gradient(ellipse 60% 40% at 50% 50%, rgba(197, 165, 114, 0.6) 0%, rgba(197, 165, 114, 0.2) 50%, transparent 80%)',
                transform: 'translateY(10%)',
                zIndex: -1
              }}
            />
            <span style={{ fontStyle: 'italic' }}>beautifully timeless</span> portrait.
          </span>
        </h1>

        {/* Subheadline */}
        <p 
          className="text-base sm:text-lg mb-6 sm:mb-8 animate-fade-in-up delay-200 max-w-xl mx-auto"
          style={{ color: '#B8B2A8' }}
        >
          Upload a photo. We&apos;ll paint them like a royal oil portrait — 
          worthy of hanging in the finest galleries of Europe.
        </p>

        {/* Sample portraits */}
        <div className="flex justify-center items-center gap-3 sm:gap-6 mb-8 sm:mb-10 animate-fade-in-up delay-300">
          {/* First Portrait Frame */}
          <div 
            className="w-40 h-48 sm:w-52 sm:h-64 md:w-64 md:h-80 transform -rotate-3 hover:rotate-0 hover:scale-105 transition-all duration-300 relative flex-shrink-0"
            style={{ 
              padding: '2px',
            }}
          >
            {/* Soft outer glow/vignette */}
            <div 
              className="absolute inset-0 rounded-2xl"
              style={{
                background: 'radial-gradient(ellipse at center, rgba(212, 184, 150, 0.3) 0%, rgba(197, 165, 114, 0.15) 50%, transparent 70%)',
                filter: 'blur(20px)',
                zIndex: 0,
                transform: 'scale(1.1)'
              }}
            />
            
            {/* Outer frame layer - beveled edge */}
            <div 
              className="absolute inset-0 rounded-2xl"
              style={{
                background: 'linear-gradient(135deg, #E8D4B0 0%, #D4B896 20%, #C5A572 40%, #D4B896 60%, #C5A572 80%, #E8D4B0 100%)',
                padding: '1px',
                  boxShadow: `
                  0 8px 32px rgba(197, 165, 114, 0.4),
                  0 0 0 1px rgba(197, 165, 114, 0.6),
                  inset 0 2px 4px rgba(255, 255, 255, 0.4),
                  inset 0 -2px 4px rgba(166, 139, 91, 0.4)
                `.trim().replace(/\s+/g, ' '),
                zIndex: 1
              }}
            >
              {/* Middle frame layer - dimensional molding */}
              <div 
                className="absolute inset-0.5 rounded-xl"
                style={{
                  background: 'linear-gradient(135deg, #D4B896 0%, #C5A572 30%, #D4B896 60%, #C5A572 100%)',
                  padding: '0.5px',
                    boxShadow: `
                    inset 0 1px 2px rgba(255, 255, 255, 0.35),
                    inset 0 -1px 2px rgba(166, 139, 91, 0.35)
                  `.trim().replace(/\s+/g, ' ')
                }}
              >
                {/* Inner frame layer */}
                <div 
                  className="absolute inset-0.5 rounded-lg"
                  style={{
                    background: 'linear-gradient(135deg, #E8D4B0 0%, #D4B896 25%, #C5A572 50%, #D4B896 75%, #E8D4B0 100%)',
                    padding: '0.5px',
                    boxShadow: 'inset 0 1px 1px rgba(255, 255, 255, 0.3)'
                  }}
                >
                  {/* Portrait container with inner shadow */}
                  <div 
                    className="relative w-full h-full rounded-md overflow-hidden"
                    style={{
                      boxShadow: 'inset 0 2px 8px rgba(0, 0, 0, 0.3), inset 0 1px 4px rgba(0, 0, 0, 0.2)'
                    }}
                  >
                    <img 
                      src="/samples/whitecat.png" 
                      alt="Majestic White Cat portrait"
                      className="w-full h-full object-cover"
                    />
                  </div>
                </div>
              </div>
            </div>

          </div>

          {/* Second Portrait Frame */}
          <div 
            className="w-40 h-48 sm:w-52 sm:h-64 md:w-64 md:h-80 transform rotate-3 hover:rotate-0 hover:scale-105 transition-all duration-300 relative flex-shrink-0"
            style={{ 
              padding: '2px',
            }}
          >
            {/* Soft outer glow/vignette */}
            <div 
              className="absolute inset-0 rounded-2xl"
              style={{
                background: 'radial-gradient(ellipse at center, rgba(212, 184, 150, 0.3) 0%, rgba(197, 165, 114, 0.15) 50%, transparent 70%)',
                filter: 'blur(20px)',
                zIndex: 0,
                transform: 'scale(1.1)'
              }}
            />
            
            {/* Outer frame layer - beveled edge */}
            <div 
              className="absolute inset-0 rounded-2xl"
              style={{
                background: 'linear-gradient(135deg, #E8D4B0 0%, #D4B896 20%, #C5A572 40%, #D4B896 60%, #C5A572 80%, #E8D4B0 100%)',
                padding: '1px',
                  boxShadow: `
                  0 8px 32px rgba(197, 165, 114, 0.4),
                  0 0 0 1px rgba(197, 165, 114, 0.6),
                  inset 0 2px 4px rgba(255, 255, 255, 0.4),
                  inset 0 -2px 4px rgba(166, 139, 91, 0.4)
                `.trim().replace(/\s+/g, ' '),
                zIndex: 1
              }}
            >
              {/* Middle frame layer - dimensional molding */}
              <div 
                className="absolute inset-0.5 rounded-xl"
                style={{
                  background: 'linear-gradient(135deg, #D4B896 0%, #C5A572 30%, #D4B896 60%, #C5A572 100%)',
                  padding: '0.5px',
                    boxShadow: `
                    inset 0 1px 2px rgba(255, 255, 255, 0.35),
                    inset 0 -1px 2px rgba(166, 139, 91, 0.35)
                  `.trim().replace(/\s+/g, ' ')
                }}
              >
                {/* Inner frame layer */}
                <div 
                  className="absolute inset-0.5 rounded-lg"
                  style={{
                    background: 'linear-gradient(135deg, #E8D4B0 0%, #D4B896 25%, #C5A572 50%, #D4B896 75%, #E8D4B0 100%)',
                    padding: '0.5px',
                    boxShadow: 'inset 0 1px 1px rgba(255, 255, 255, 0.3)'
                  }}
                >
                  {/* Portrait container with inner shadow */}
                  <div 
                    className="relative w-full h-full rounded-md overflow-hidden"
                    style={{
                      boxShadow: 'inset 0 2px 8px rgba(0, 0, 0, 0.3), inset 0 1px 4px rgba(0, 0, 0, 0.2)'
                    }}
                  >
                    <img 
                      src="/samples/chihuahua.png" 
                      alt="Royal Chihuahua portrait"
                      className="w-full h-full object-cover"
                    />
                  </div>
                </div>
              </div>
            </div>

          </div>
        </div>

        {/* CTA Button */}
        <div className="animate-fade-in-up delay-400">
          <button
            onClick={() => {
              captureEvent("upload_button_clicked", {
                source: "hero",
              });
              onUploadClick();
            }}
            className="btn-primary text-lg px-8 py-4 group"
          >
            <svg className="w-5 h-5 transition-transform group-hover:scale-110" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
            </svg>
            Upload your pet photo
          </button>
          <p 
            className="text-sm mt-3 animate-fade-in-up delay-500"
            style={{ color: '#7A756D', fontStyle: 'italic' }}
          >
            No sign up required
          </p>
        </div>

        {/* Social Proof Counter */}
        <div className="mt-6 animate-fade-in-up delay-500">
          <p className="text-sm" style={{ color: '#7A756D' }}>
            <span style={{ color: '#C5A572', fontWeight: '500' }}>
              {portraitCount.toLocaleString()}+
            </span>
            {" "}portraits created
          </p>
        </div>

        {/* Trust Badges */}
        <div className="mt-6 flex flex-wrap justify-center gap-4 sm:gap-6 animate-fade-in-up delay-600">
          {/* Secure Checkout */}
          <div className="flex items-center gap-2" style={{ color: '#7A756D' }}>
            <svg className="w-4 h-4" style={{ color: '#4ADE80' }} fill="currentColor" viewBox="0 0 20 20">
              <path fillRule="evenodd" d="M5 9V7a5 5 0 0110 0v2a2 2 0 012 2v5a2 2 0 01-2 2H5a2 2 0 01-2-2v-5a2 2 0 012-2zm8-2v2H7V7a3 3 0 016 0z" clipRule="evenodd" />
            </svg>
            <span className="text-xs sm:text-sm">Secure Checkout</span>
          </div>
          
          {/* Instant Delivery */}
          <div className="flex items-center gap-2" style={{ color: '#7A756D' }}>
            <svg className="w-4 h-4" style={{ color: '#60A5FA' }} fill="currentColor" viewBox="0 0 20 20">
              <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm1-12a1 1 0 10-2 0v4a1 1 0 00.293.707l2.828 2.829a1 1 0 101.415-1.415L11 9.586V6z" clipRule="evenodd" />
            </svg>
            <span className="text-xs sm:text-sm">Instant Delivery</span>
          </div>
          
          {/* Satisfaction Guaranteed */}
          <div className="flex items-center gap-2" style={{ color: '#7A756D' }}>
            <svg className="w-4 h-4" style={{ color: '#FBBF24' }} fill="currentColor" viewBox="0 0 20 20">
              <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
            </svg>
            <span className="text-xs sm:text-sm">Satisfaction Guaranteed</span>
          </div>
        </div>
      </div>
    </section>
  );
}
