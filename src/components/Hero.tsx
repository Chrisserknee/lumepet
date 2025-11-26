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
        style={{ backgroundColor: 'rgba(197, 165, 114, 0.08)' }} 
      />
      <div 
        className="absolute bottom-20 right-10 w-48 h-48 rounded-full blur-3xl" 
        style={{ backgroundColor: 'rgba(139, 58, 66, 0.08)' }} 
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

      <div className="max-w-4xl mx-auto text-center relative z-10">
        {/* Crown icon */}
        <div className="mb-6 animate-fade-in-up">
          <svg 
            className="w-12 h-12 mx-auto animate-float" 
            style={{ color: '#C5A572' }}
            viewBox="0 0 24 24" 
            fill="currentColor"
          >
            <path d="M5 16L3 5l5.5 5L12 4l3.5 6L21 5l-2 11H5zm14 3c0 .6-.4 1-1 1H6c-.6 0-1-.4-1-1v-1h14v1z"/>
          </svg>
        </div>

        {/* Tagline */}
        <p 
          className="text-lg sm:text-xl mb-4 animate-fade-in-up tracking-wide"
          style={{ color: '#C5A572', fontFamily: "'Cormorant Garamond', Georgia, serif" }}
        >
          Your Cherished Pet in a Classic Masterpiece
        </p>

        {/* Main headline */}
        <h1 
          className="text-4xl sm:text-5xl md:text-6xl lg:text-7xl font-semibold mb-6 animate-fade-in-up delay-100 leading-tight"
          style={{ fontFamily: "'Cormorant Garamond', Georgia, serif", color: '#F0EDE8' }}
        >
          Turn your pet into a{" "}
          <span className="relative" style={{ color: '#C5A572' }}>
            Renaissance
            <svg 
              className="absolute -bottom-2 left-0 w-full h-3" 
              style={{ color: 'rgba(139, 58, 66, 0.6)' }} 
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
          className="text-lg sm:text-xl mb-8 animate-fade-in-up delay-200 max-w-xl mx-auto"
          style={{ color: '#B8B2A8' }}
        >
          Upload a photo. We&apos;ll paint them like a royal oil portrait — 
          worthy of hanging in the finest galleries of Europe.
        </p>

        {/* Sample portraits */}
        <div className="flex justify-center gap-6 sm:gap-8 mb-12 animate-fade-in-up delay-300">
          <div 
            className="w-40 h-52 sm:w-52 sm:h-68 md:w-60 md:h-80 rounded-xl overflow-hidden shadow-2xl transform -rotate-3 hover:rotate-0 hover:scale-105 transition-all duration-300"
            style={{ 
              background: 'linear-gradient(135deg, #C5A572 0%, #A68B5B 100%)',
              padding: '5px',
              boxShadow: '0 15px 50px rgba(0, 0, 0, 0.6), 0 0 40px rgba(197, 165, 114, 0.25)'
            }}
          >
            <img 
              src="/samples/chihuahua.png" 
              alt="Renaissance Chihuahua portrait"
              className="w-full h-full object-cover rounded-lg"
            />
          </div>
          <div 
            className="w-40 h-52 sm:w-52 sm:h-68 md:w-60 md:h-80 rounded-xl overflow-hidden shadow-2xl transform rotate-3 hover:rotate-0 hover:scale-105 transition-all duration-300"
            style={{ 
              background: 'linear-gradient(135deg, #C5A572 0%, #A68B5B 100%)',
              padding: '5px',
              boxShadow: '0 15px 50px rgba(0, 0, 0, 0.6), 0 0 40px rgba(197, 165, 114, 0.25)'
            }}
          >
            <img 
              src="/samples/golden.png" 
              alt="Renaissance Golden Retriever portrait"
              className="w-full h-full object-cover rounded-lg"
            />
          </div>
        </div>

        {/* CTA Button */}
        <div className="animate-fade-in-up delay-400">
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
    </section>
  );
}
