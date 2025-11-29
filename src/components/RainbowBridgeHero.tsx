"use client";

import { useState, useEffect } from "react";
import Image from "next/image";
import { captureEvent } from "@/lib/posthog";

interface RainbowBridgeHeroProps {
  onUploadClick: () => void;
}

export default function RainbowBridgeHero({ onUploadClick }: RainbowBridgeHeroProps) {
  const [selectedImage, setSelectedImage] = useState<string | null>(null);

  // Close modal on ESC key
  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setSelectedImage(null);
      }
    };

    if (selectedImage) {
      document.addEventListener("keydown", handleEscape);
      // Prevent body scroll when modal is open
      document.body.style.overflow = "hidden";
    }

    return () => {
      document.removeEventListener("keydown", handleEscape);
      document.body.style.overflow = "unset";
    };
  }, [selectedImage]);

  return (
    <section className="min-h-[85vh] flex flex-col items-center justify-center px-4 sm:px-6 pt-6 sm:pt-10 pb-8 sm:pb-12 relative overflow-hidden w-full">
      {/* Heavenly background elements */}
      <div 
        className="absolute inset-0 pointer-events-none"
        style={{
          background: `
            radial-gradient(ellipse 120% 80% at 50% 20%, rgba(255, 223, 186, 0.15) 0%, transparent 50%),
            radial-gradient(ellipse 100% 60% at 30% 80%, rgba(230, 230, 250, 0.2) 0%, transparent 50%),
            radial-gradient(ellipse 100% 60% at 70% 80%, rgba(255, 228, 230, 0.2) 0%, transparent 50%)
          `
        }}
      />
      
      {/* Subtle rainbow arc at the top */}
      <div 
        className="absolute top-0 left-1/2 -translate-x-1/2 w-[200%] h-64 pointer-events-none opacity-30"
        style={{
          background: `
            radial-gradient(ellipse 50% 100% at 50% 0%, 
              rgba(255, 182, 193, 0.3) 0%,
              rgba(255, 218, 185, 0.25) 15%,
              rgba(255, 255, 200, 0.2) 30%,
              rgba(200, 255, 200, 0.2) 45%,
              rgba(200, 220, 255, 0.25) 60%,
              rgba(230, 200, 255, 0.3) 75%,
              transparent 90%
            )
          `
        }}
      />

      {/* Soft light rays */}
      <div 
        className="absolute top-0 left-1/2 -translate-x-1/2 w-full h-full pointer-events-none opacity-20"
        style={{
          background: `
            conic-gradient(from 180deg at 50% 0%, 
              transparent 40%, 
              rgba(255, 255, 255, 0.5) 45%, 
              transparent 50%,
              transparent 90%,
              rgba(255, 255, 255, 0.5) 95%,
              transparent 100%
            )
          `
        }}
      />

      <div className="w-full max-w-4xl mx-auto text-center relative z-10 flex flex-col items-center">
        {/* Back to Home Link Pill */}
        <div className="mb-4 sm:mb-5 animate-fade-in-up">
          <a
            href="/"
            className="inline-flex items-center gap-2 px-4 py-2 rounded-full transition-all duration-300 hover:scale-105 hover:shadow-lg"
            style={{
              background: 'linear-gradient(135deg, rgba(255, 255, 255, 0.2) 0%, rgba(255, 255, 255, 0.15) 100%)',
              border: '1px solid rgba(212, 175, 55, 0.3)',
              backdropFilter: 'blur(10px)',
              color: '#4A4A4A',
              fontFamily: "'Cormorant Garamond', Georgia, serif",
              fontSize: '0.9rem',
              fontWeight: 500,
              letterSpacing: '0.05em',
              textDecoration: 'none',
              boxShadow: '0 2px 8px rgba(212, 175, 55, 0.2)'
            }}
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" />
            </svg>
            <span>Back to LumePet</span>
          </a>
        </div>

        {/* Logo */}
        <div className="mb-4 sm:mb-6 animate-fade-in-up">
          <div className="flex justify-center">
            <div className="relative">
              <Image
                src="/samples/LumePet2.png"
                alt="LumePet Logo"
                width={100}
                height={100}
                className="object-contain"
                style={{
                  filter: 'drop-shadow(0 0 20px rgba(255, 255, 255, 0.8)) drop-shadow(0 0 40px rgba(230, 200, 255, 0.4))'
                }}
                priority
              />
            </div>
          </div>
        </div>

        {/* Tagline */}
        <p 
          className="text-base sm:text-lg mb-2 animate-fade-in-up tracking-wide"
          style={{ 
            color: '#9B8AA0',
            fontFamily: "'Cormorant Garamond', Georgia, serif",
            fontStyle: 'italic'
          }}
        >
          A Heavenly Tribute to Your Beloved Companion
        </p>

        {/* Main headline */}
        <h1 
          className="text-3xl sm:text-4xl md:text-5xl lg:text-6xl mb-4 sm:mb-6 animate-fade-in-up delay-100 text-center relative"
          style={{ 
            fontFamily: "'EB Garamond', 'Cormorant Garamond', Georgia, serif", 
            color: '#4A4A4A', 
            fontWeight: 400,
            letterSpacing: '0.02em',
            lineHeight: '1.15'
          }}
        >
          <span className="block mb-1.5" style={{ letterSpacing: '0.03em', fontWeight: 300 }}>
            Rainbow Bridge
          </span>
          <span 
            className="relative block mx-auto text-center"
            style={{ 
              background: 'linear-gradient(135deg, #D4AF37 0%, #E6C866 25%, #D4AF37 50%, #C5A028 75%, #D4AF37 100%)',
              WebkitBackgroundClip: 'text',
              WebkitTextFillColor: 'transparent',
              backgroundClip: 'text',
              fontWeight: 500,
              letterSpacing: '0.03em',
              filter: 'drop-shadow(0 2px 4px rgba(212, 175, 55, 0.3))'
            }}
          >
            Portraits
          </span>
        </h1>

        {/* Subheadline */}
        <p 
          className="text-base sm:text-lg mb-6 sm:mb-8 animate-fade-in-up delay-200 max-w-xl mx-auto leading-relaxed"
          style={{ color: '#6B6B6B' }}
        >
          Honor your beloved pet who has crossed the Rainbow Bridge with a 
          beautiful, angelic portrait — a lasting tribute to the love you shared.
        </p>

        {/* Sample Rainbow Bridge portraits */}
        <div className="flex justify-center items-center gap-3 sm:gap-6 mb-8 sm:mb-10 animate-fade-in-up delay-250">
          {/* Winston Portrait Frame (Left) */}
          <div 
            className="w-36 h-44 sm:w-48 sm:h-60 md:w-56 md:h-72 transform -rotate-3 hover:rotate-0 hover:scale-105 transition-all duration-300 relative flex-shrink-0 cursor-pointer"
            style={{ 
              padding: '2px',
            }}
            onClick={() => {
              setSelectedImage("/samples/rainbowbridgewinston.png");
              captureEvent("rainbow_bridge_hero_portrait_clicked", { pet: "Winston" });
            }}
          >
            {/* Soft outer glow/vignette - heavenly theme */}
            <div 
              className="absolute inset-0 rounded-2xl"
              style={{
                background: 'radial-gradient(ellipse at center, rgba(255, 255, 255, 0.4) 0%, rgba(230, 200, 255, 0.2) 50%, transparent 70%)',
                filter: 'blur(20px)',
                zIndex: 0,
                transform: 'scale(1.1)'
              }}
            />
            
            {/* Outer frame layer - heavenly gold */}
            <div 
              className="absolute inset-0 rounded-2xl"
              style={{
                background: 'linear-gradient(135deg, #F5E6A3 0%, #E6C866 20%, #D4AF37 40%, #E6C866 60%, #D4AF37 80%, #F5E6A3 100%)',
                padding: '1px',
                boxShadow: `
                  0 8px 32px rgba(212, 175, 55, 0.3),
                  0 0 0 1px rgba(212, 175, 55, 0.5),
                  inset 0 2px 4px rgba(255, 255, 255, 0.5),
                  inset 0 -2px 4px rgba(197, 165, 38, 0.3)
                `.trim().replace(/\s+/g, ' '),
                zIndex: 1
              }}
            >
              {/* Middle frame layer */}
              <div 
                className="absolute inset-0.5 rounded-xl"
                style={{
                  background: 'linear-gradient(135deg, #E6C866 0%, #D4AF37 30%, #E6C866 60%, #D4AF37 100%)',
                  padding: '0.5px',
                  boxShadow: `
                    inset 0 1px 2px rgba(255, 255, 255, 0.4),
                    inset 0 -1px 2px rgba(197, 165, 38, 0.3)
                  `.trim().replace(/\s+/g, ' ')
                }}
              >
                {/* Inner frame layer */}
                <div 
                  className="absolute inset-0.5 rounded-lg"
                  style={{
                    background: 'linear-gradient(135deg, #F5E6A3 0%, #E6C866 25%, #D4AF37 50%, #E6C866 75%, #F5E6A3 100%)',
                    padding: '0.5px',
                    boxShadow: 'inset 0 1px 1px rgba(255, 255, 255, 0.4)'
                  }}
                >
                  {/* Portrait container */}
                  <div 
                    className="relative w-full h-full rounded-md overflow-hidden"
                    style={{
                      boxShadow: 'inset 0 2px 8px rgba(0, 0, 0, 0.2), inset 0 1px 4px rgba(0, 0, 0, 0.15)'
                    }}
                  >
                    <Image 
                      src="/samples/rainbowbridgewinston.png" 
                      alt="Winston's Rainbow Bridge memorial portrait"
                      fill
                      className="object-cover"
                      sizes="(max-width: 640px) 144px, (max-width: 768px) 192px, 224px"
                    />
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Biscuit Portrait Frame (Right) */}
          <div 
            className="w-36 h-44 sm:w-48 sm:h-60 md:w-56 md:h-72 transform rotate-3 hover:rotate-0 hover:scale-105 transition-all duration-300 relative flex-shrink-0 cursor-pointer"
            style={{ 
              padding: '2px',
            }}
            onClick={() => {
              setSelectedImage("/samples/rainbowbridgecat2.png");
              captureEvent("rainbow_bridge_hero_portrait_clicked", { pet: "Biscuit" });
            }}
          >
            {/* Soft outer glow/vignette - heavenly theme */}
            <div 
              className="absolute inset-0 rounded-2xl"
              style={{
                background: 'radial-gradient(ellipse at center, rgba(255, 255, 255, 0.4) 0%, rgba(230, 200, 255, 0.2) 50%, transparent 70%)',
                filter: 'blur(20px)',
                zIndex: 0,
                transform: 'scale(1.1)'
              }}
            />
            
            {/* Outer frame layer - heavenly gold */}
            <div 
              className="absolute inset-0 rounded-2xl"
              style={{
                background: 'linear-gradient(135deg, #F5E6A3 0%, #E6C866 20%, #D4AF37 40%, #E6C866 60%, #D4AF37 80%, #F5E6A3 100%)',
                padding: '1px',
                boxShadow: `
                  0 8px 32px rgba(212, 175, 55, 0.3),
                  0 0 0 1px rgba(212, 175, 55, 0.5),
                  inset 0 2px 4px rgba(255, 255, 255, 0.5),
                  inset 0 -2px 4px rgba(197, 165, 38, 0.3)
                `.trim().replace(/\s+/g, ' '),
                zIndex: 1
              }}
            >
              {/* Middle frame layer */}
              <div 
                className="absolute inset-0.5 rounded-xl"
                style={{
                  background: 'linear-gradient(135deg, #E6C866 0%, #D4AF37 30%, #E6C866 60%, #D4AF37 100%)',
                  padding: '0.5px',
                  boxShadow: `
                    inset 0 1px 2px rgba(255, 255, 255, 0.4),
                    inset 0 -1px 2px rgba(197, 165, 38, 0.3)
                  `.trim().replace(/\s+/g, ' ')
                }}
              >
                {/* Inner frame layer */}
                <div 
                  className="absolute inset-0.5 rounded-lg"
                  style={{
                    background: 'linear-gradient(135deg, #F5E6A3 0%, #E6C866 25%, #D4AF37 50%, #E6C866 75%, #F5E6A3 100%)',
                    padding: '0.5px',
                    boxShadow: 'inset 0 1px 1px rgba(255, 255, 255, 0.4)'
                  }}
                >
                  {/* Portrait container */}
                  <div 
                    className="relative w-full h-full rounded-md overflow-hidden"
                    style={{
                      boxShadow: 'inset 0 2px 8px rgba(0, 0, 0, 0.2), inset 0 1px 4px rgba(0, 0, 0, 0.15)'
                    }}
                  >
                    <Image 
                      src="/samples/rainbowbridgecat2.png" 
                      alt="Biscuit's Rainbow Bridge memorial portrait"
                      fill
                      className="object-cover"
                      sizes="(max-width: 640px) 144px, (max-width: 768px) 192px, 224px"
                    />
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Decorative divider */}
        <div className="flex items-center justify-center gap-4 mb-8 animate-fade-in-up delay-250">
          <div className="w-16 h-px bg-gradient-to-r from-transparent via-[#D4AF37] to-transparent opacity-50"></div>
          <svg className="w-5 h-5 text-[#D4AF37] opacity-60" fill="currentColor" viewBox="0 0 20 20">
            <path d="M3.172 5.172a4 4 0 015.656 0L10 6.343l1.172-1.171a4 4 0 115.656 5.656L10 17.657l-6.828-6.829a4 4 0 010-5.656z" />
          </svg>
          <div className="w-16 h-px bg-gradient-to-r from-transparent via-[#D4AF37] to-transparent opacity-50"></div>
        </div>

        {/* CTA Button */}
        <div className="animate-fade-in-up delay-300">
          <button
            onClick={() => {
              captureEvent("rainbow_bridge_upload_clicked", {
                source: "hero",
              });
              onUploadClick();
            }}
            className="group relative px-8 py-4 text-lg font-medium rounded-xl transition-all duration-300 hover:scale-105"
            style={{
              background: 'linear-gradient(135deg, #D4AF37 0%, #E6C866 50%, #D4AF37 100%)',
              color: '#FFFFFF',
              boxShadow: '0 4px 20px rgba(212, 175, 55, 0.3), 0 2px 8px rgba(212, 175, 55, 0.2)',
              fontFamily: "'Cormorant Garamond', Georgia, serif",
              letterSpacing: '0.05em'
            }}
          >
            <span className="flex items-center gap-3">
              <svg className="w-5 h-5 transition-transform group-hover:scale-110" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
              </svg>
              Create Memorial Portrait
            </span>
          </button>
          <p 
            className="text-sm mt-4 animate-fade-in-up delay-400"
            style={{ color: '#9B8AA0', fontStyle: 'italic' }}
          >
            Forever in our hearts
          </p>
        </div>

        {/* Gentle reminder text */}
        <div className="mt-10 animate-fade-in-up delay-500 max-w-md mx-auto">
          <p 
            className="text-sm leading-relaxed text-center"
            style={{ color: '#8B8B8B' }}
          >
            &ldquo;Until we meet again at the Bridge, run free, sweet soul.&rdquo;
          </p>
        </div>
      </div>

      {/* Lightbox Modal for Enlarged Portraits */}
      {selectedImage && (
        <div 
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm"
          onClick={() => setSelectedImage(null)}
          style={{ animation: 'fadeIn 0.3s ease-in-out' }}
        >
          {/* Close button */}
          <button
            onClick={() => setSelectedImage(null)}
            className="absolute top-4 right-4 z-10 w-10 h-10 rounded-full flex items-center justify-center transition-colors hover:bg-white/20"
            style={{ backgroundColor: 'rgba(255, 255, 255, 0.1)', color: '#FFFFFF' }}
          >
            <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>

          {/* Enlarged Image */}
          <div 
            className="relative max-w-4xl max-h-[90vh] w-full h-full flex items-center justify-center"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="relative w-full h-full max-w-2xl max-h-[85vh] rounded-2xl overflow-hidden shadow-2xl">
              <Image
                src={selectedImage}
                alt="Enlarged Rainbow Bridge memorial portrait"
                fill
                className="object-contain"
                sizes="(max-width: 768px) 100vw, 800px"
                priority
              />
            </div>
          </div>
        </div>
      )}
    </section>
  );
}




