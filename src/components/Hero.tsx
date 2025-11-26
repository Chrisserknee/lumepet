"use client";

interface HeroProps {
  onUploadClick: () => void;
}

export default function Hero({ onUploadClick }: HeroProps) {
  return (
    <section className="min-h-[100dvh] flex flex-col items-center justify-center px-6 py-16 relative overflow-hidden">
      {/* Decorative elements */}
      <div 
        className="absolute top-20 left-10 w-32 h-32 rounded-full blur-3xl" 
        style={{ backgroundColor: 'rgba(197, 165, 114, 0.1)' }} 
      />
      <div 
        className="absolute bottom-20 right-10 w-48 h-48 rounded-full blur-3xl" 
        style={{ backgroundColor: 'rgba(114, 47, 55, 0.1)' }} 
      />
      
      {/* Ornate corner decorations */}
      <div 
        className="absolute top-8 left-8 w-16 h-16 border-l-2 border-t-2 rounded-tl-lg" 
        style={{ borderColor: 'rgba(197, 165, 114, 0.3)' }} 
      />
      <div 
        className="absolute top-8 right-8 w-16 h-16 border-r-2 border-t-2 rounded-tr-lg" 
        style={{ borderColor: 'rgba(197, 165, 114, 0.3)' }} 
      />
      <div 
        className="absolute bottom-8 left-8 w-16 h-16 border-l-2 border-b-2 rounded-bl-lg" 
        style={{ borderColor: 'rgba(197, 165, 114, 0.3)' }} 
      />
      <div 
        className="absolute bottom-8 right-8 w-16 h-16 border-r-2 border-b-2 rounded-br-lg" 
        style={{ borderColor: 'rgba(197, 165, 114, 0.3)' }} 
      />

      <div className="max-w-3xl mx-auto text-center relative z-10">
        {/* Crown icon */}
        <div className="mb-8 animate-fade-in-up">
          <svg 
            className="w-16 h-16 mx-auto animate-float" 
            style={{ color: '#C5A572' }}
            viewBox="0 0 24 24" 
            fill="currentColor"
          >
            <path d="M5 16L3 5l5.5 5L12 4l3.5 6L21 5l-2 11H5zm14 3c0 .6-.4 1-1 1H6c-.6 0-1-.4-1-1v-1h14v1z"/>
          </svg>
        </div>

        {/* Main headline */}
        <h1 
          className="text-4xl sm:text-5xl md:text-6xl lg:text-7xl font-semibold mb-6 animate-fade-in-up delay-100 leading-tight"
          style={{ fontFamily: "'Cormorant Garamond', Georgia, serif", color: '#2C2C2C' }}
        >
          Turn your pet into a{" "}
          <span className="relative" style={{ color: '#722F37' }}>
            Renaissance
            <svg 
              className="absolute -bottom-2 left-0 w-full h-3" 
              style={{ color: 'rgba(197, 165, 114, 0.4)' }} 
              viewBox="0 0 200 12" 
              preserveAspectRatio="none"
            >
              <path d="M0 6 Q50 0, 100 6 T200 6" stroke="currentColor" strokeWidth="3" fill="none"/>
            </svg>
          </span>{" "}
          masterpiece.
        </h1>

        {/* Subheadline */}
        <p 
          className="text-lg sm:text-xl mb-10 animate-fade-in-up delay-200 max-w-xl mx-auto"
          style={{ color: '#4A4A4A' }}
        >
          Upload a photo. We&apos;ll paint them like a royal oil portrait — 
          worthy of hanging in the finest galleries of Europe.
        </p>

        {/* CTA Button */}
        <div className="animate-fade-in-up delay-300">
          <button
            onClick={onUploadClick}
            className="btn-primary text-lg px-8 py-4 group"
          >
            <svg className="w-5 h-5 transition-transform group-hover:scale-110" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
            </svg>
            Upload your pet photo
          </button>
        </div>

      </div>

      {/* Scroll indicator */}
      <div className="absolute bottom-8 left-1/2 -translate-x-1/2 animate-fade-in delay-500">
        <div 
          className="flex flex-col items-center gap-2"
          style={{ color: 'rgba(197, 165, 114, 0.6)' }}
        >
          <span className="text-xs uppercase tracking-widest">Scroll</span>
          <svg className="w-5 h-5 animate-bounce" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 14l-7 7m0 0l-7-7m7 7V3" />
          </svg>
        </div>
      </div>
    </section>
  );
}
