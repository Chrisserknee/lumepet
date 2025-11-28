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
    <section className="min-h-[85vh] flex flex-col items-center justify-center px-6 py-12 sm:py-16 relative overflow-hidden">
      {/* Decorative elements */}
      <div 
        className="absolute top-20 left-10 w-32 h-32 rounded-full blur-3xl" 
        style={{ backgroundColor: 'rgba(197, 165, 114, 0.08)' }} 
      />
      <div 
        className="absolute bottom-20 right-10 w-48 h-48 rounded-full blur-3xl" 
        style={{ backgroundColor: 'rgba(139, 58, 66, 0.08)' }} 
      />

      <div className="max-w-4xl mx-auto text-center relative z-10">
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
                src="/samples/lumepet.png"
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
          className="text-3xl sm:text-4xl md:text-5xl lg:text-6xl mb-4 sm:mb-5 animate-fade-in-up delay-100 leading-[1.1] tracking-[-0.03em]"
          style={{ fontFamily: "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Roboto', 'Helvetica Neue', Arial, sans-serif", color: '#F0EDE8', fontWeight: 300, letterSpacing: '-0.03em' }}
        >
          Turn your pet into a{" "}
          <span className="relative" style={{ color: '#C5A572', fontWeight: 400 }}>
            beautifully timeless portrait
            <svg 
              className="absolute -bottom-2 left-0 w-full h-3" 
              style={{ color: 'rgba(139, 58, 66, 0.6)' }} 
              viewBox="0 0 200 12" 
              preserveAspectRatio="none"
            >
              <path d="M0 6 Q50 0, 100 6 T200 6" stroke="currentColor" strokeWidth="3" fill="none"/>
            </svg>
          </span>.
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
        <div className="flex justify-center gap-4 sm:gap-6 mb-8 sm:mb-10 animate-fade-in-up delay-300">
          <div 
            className="w-32 h-40 sm:w-40 sm:h-52 md:w-48 md:h-64 rounded-xl overflow-hidden shadow-2xl transform -rotate-3 hover:rotate-0 hover:scale-105 transition-all duration-300"
            style={{ 
              background: 'linear-gradient(135deg, #C5A572 0%, #A68B5B 100%)',
              padding: '5px',
              boxShadow: '0 15px 50px rgba(0, 0, 0, 0.6), 0 0 40px rgba(197, 165, 114, 0.25)'
            }}
          >
            <img 
              src="/samples/whitecat.png" 
              alt="Majestic White Cat portrait"
              className="w-full h-full object-cover rounded-lg"
            />
          </div>
          <div 
            className="w-32 h-40 sm:w-40 sm:h-52 md:w-48 md:h-64 rounded-xl overflow-hidden shadow-2xl transform rotate-3 hover:rotate-0 hover:scale-105 transition-all duration-300"
            style={{ 
              background: 'linear-gradient(135deg, #C5A572 0%, #A68B5B 100%)',
              padding: '5px',
              boxShadow: '0 15px 50px rgba(0, 0, 0, 0.6), 0 0 40px rgba(197, 165, 114, 0.25)'
            }}
          >
            <img 
              src="/samples/chihuahua.png" 
              alt="Royal Chihuahua portrait"
              className="w-full h-full object-cover rounded-lg"
            />
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
