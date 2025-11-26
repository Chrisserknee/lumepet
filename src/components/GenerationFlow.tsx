"use client";

import { useState, useEffect, useCallback } from "react";
import Image from "next/image";

type Stage = "preview" | "generating" | "result" | "checkout" | "email" | "expired";

interface GenerationFlowProps {
  file: File | null;
  onReset: () => void;
}

interface GeneratedResult {
  imageId: string;
  previewUrl: string;
}

// Victorian-era elegant phrases for generation animation
const VICTORIAN_PHRASES = [
  "Preparing the canvas...",
  "Selecting the finest oils...",
  "The master begins their work...",
  "Capturing noble elegance...",
  "Adding regal flourishes...",
  "Perfecting each brushstroke...",
  "Bestowing royal grandeur...",
  "A masterpiece takes form...",
];

export default function GenerationFlow({ file, onReset }: GenerationFlowProps) {
  const [stage, setStage] = useState<Stage>("preview");
  const [result, setResult] = useState<GeneratedResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [retryUsed, setRetryUsed] = useState(false);
  const [currentPhrase, setCurrentPhrase] = useState(0);
  const [phraseVisible, setPhraseVisible] = useState(true);
  const [expirationTime, setExpirationTime] = useState<number | null>(null);
  const [timeRemaining, setTimeRemaining] = useState<string>("15:00");
  const [email, setEmail] = useState("");
  const [emailError, setEmailError] = useState<string | null>(null);

  // Set preview URL when file is provided
  useEffect(() => {
    if (file && !previewUrl) {
      setPreviewUrl(URL.createObjectURL(file));
    }
  }, [file, previewUrl]);

  // Phrase cycling animation during generation - slow and elegant
  useEffect(() => {
    if (stage !== "generating") return;

    const cycleInterval = setInterval(() => {
      setPhraseVisible(false);
      // Longer fade out, then switch phrase, then fade in
      setTimeout(() => {
        setCurrentPhrase((prev) => (prev + 1) % VICTORIAN_PHRASES.length);
        setPhraseVisible(true);
      }, 1000); // 1 second to fade out before switching
    }, 5000); // 5 seconds per phrase

    return () => clearInterval(cycleInterval);
  }, [stage]);

  // Countdown timer
  useEffect(() => {
    if (!expirationTime || stage === "expired") return;

    const timerInterval = setInterval(() => {
      const now = Date.now();
      const remaining = expirationTime - now;

      if (remaining <= 0) {
        setStage("expired");
        setTimeRemaining("00:00");
        clearInterval(timerInterval);
        return;
      }

      const minutes = Math.floor(remaining / 60000);
      const seconds = Math.floor((remaining % 60000) / 1000);
      setTimeRemaining(`${minutes.toString().padStart(2, "0")}:${seconds.toString().padStart(2, "0")}`);
    }, 1000);

    return () => clearInterval(timerInterval);
  }, [expirationTime, stage]);

  // Compress image before upload to avoid Vercel 413 errors
  const compressImage = async (file: File, maxSizeMB: number = 3.5): Promise<File> => {
    return new Promise((resolve) => {
      const reader = new FileReader();
      reader.onload = (e) => {
        const img = document.createElement('img');
        img.onload = () => {
          const canvas = document.createElement('canvas');
          let width = img.width;
          let height = img.height;
          
          // Calculate new dimensions (max 2000px on longest side)
          const maxDimension = 2000;
          if (width > height && width > maxDimension) {
            height = (height / width) * maxDimension;
            width = maxDimension;
          } else if (height > maxDimension) {
            width = (width / height) * maxDimension;
            height = maxDimension;
          }
          
          canvas.width = width;
          canvas.height = height;
          const ctx = canvas.getContext('2d');
          ctx?.drawImage(img, 0, 0, width, height);
          
          // Convert to blob with compression
          canvas.toBlob(
            (blob) => {
              if (blob) {
                const compressedFile = new File([blob], file.name, {
                  type: 'image/jpeg',
                  lastModified: Date.now(),
                });
                resolve(compressedFile);
              } else {
                resolve(file); // Fallback to original
              }
            },
            'image/jpeg',
            0.85 // 85% quality
          );
        };
        img.src = e.target?.result as string;
      };
      reader.readAsDataURL(file);
    });
  };

  const handleGenerate = async () => {
    if (!file) return;
    
    setStage("generating");
    setError(null);
    setCurrentPhrase(0);
    setPhraseVisible(true);

    try {
      // Compress image if it's too large (over 3.5MB)
      let fileToUpload = file;
      if (file.size > 3.5 * 1024 * 1024) {
        console.log(`Compressing image from ${(file.size / 1024 / 1024).toFixed(2)}MB...`);
        fileToUpload = await compressImage(file, 3.5);
        console.log(`Compressed to ${(fileToUpload.size / 1024 / 1024).toFixed(2)}MB`);
      }
      
      const formData = new FormData();
      formData.append("image", fileToUpload);

      const response = await fetch("/api/generate", {
        method: "POST",
        body: formData,
      });

      // Handle 413 Payload Too Large error specifically
      if (response.status === 413) {
        throw new Error("Image file is too large. Please use an image smaller than 4MB, or try compressing it first.");
      }

      const data = await response.json();

      if (!response.ok) {
        // Log detailed error for debugging
        console.error("Generation API error:", {
          status: response.status,
          statusText: response.statusText,
          error: data.error,
          fullData: data,
        });
        throw new Error(data.error || `Failed to generate portrait (${response.status})`);
      }

      setResult(data);
      // Set 15-minute expiration timer
      setExpirationTime(Date.now() + 15 * 60 * 1000);
      setStage("result");
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : "Something went wrong. Please try again.";
      console.error("Generation error:", err);
      console.error("Error message:", errorMessage);
      setError(errorMessage);
      setStage("preview");
    }
  };

  const handleRetry = useCallback(() => {
    if (retryUsed) return;
    setRetryUsed(true);
    setResult(null);
    setExpirationTime(null);
    handleGenerate();
  }, [retryUsed, file]);

  const handlePurchaseClick = () => {
    setStage("email");
    setEmailError(null);
  };

  const validateEmail = (email: string) => {
    const re = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return re.test(email);
  };

  const handleEmailSubmit = async () => {
    if (!validateEmail(email)) {
      setEmailError("Please enter a valid email address");
      return;
    }

    if (!result) return;
    
    setStage("checkout");

    try {
      const response = await fetch("/api/checkout", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ imageId: result.imageId, email }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Failed to create checkout session");
      }

      window.location.href = data.checkoutUrl;
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to redirect to checkout. Please try again.");
      setStage("result");
    }
  };

  const handleReset = () => {
    if (previewUrl) {
      URL.revokeObjectURL(previewUrl);
    }
    setPreviewUrl(null);
    setResult(null);
    setStage("preview");
    setError(null);
    setRetryUsed(false);
    setExpirationTime(null);
    setEmail("");
    onReset();
  };

  if (!file) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 overflow-y-auto">
      {/* Backdrop */}
      <div 
        className="absolute inset-0 backdrop-blur-sm" 
        style={{ backgroundColor: 'rgba(0, 0, 0, 0.85)' }}
      />
      
      {/* Content */}
      <div 
        className="relative w-full max-w-2xl rounded-3xl shadow-2xl animate-fade-in-up my-8"
        style={{ 
          backgroundColor: '#1A1A1A',
          border: '1px solid rgba(197, 165, 114, 0.2)',
          boxShadow: '0 25px 50px rgba(0, 0, 0, 0.5), 0 0 100px rgba(197, 165, 114, 0.1)'
        }}
      >
        {/* Close button */}
        <button
          onClick={handleReset}
          className="absolute top-4 right-4 z-10 w-10 h-10 rounded-full flex items-center justify-center shadow-lg transition-colors hover:bg-white/20"
          style={{ backgroundColor: 'rgba(255, 255, 255, 0.1)', color: '#B8B2A8' }}
        >
          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>

        {/* Preview Stage */}
        {stage === "preview" && (
          <div className="p-8">
            <div className="text-center mb-6">
              <h3 
                className="text-2xl font-semibold mb-2"
                style={{ fontFamily: "'Cormorant Garamond', Georgia, serif", color: '#F0EDE8' }}
              >
                Your Royal Subject
              </h3>
              <p style={{ color: '#B8B2A8' }}>
                Ready to transform your pet into a Renaissance masterpiece?
              </p>
            </div>

            <div 
              className="relative aspect-square max-w-sm mx-auto rounded-2xl overflow-hidden shadow-lg mb-6"
              style={{ border: '2px solid rgba(197, 165, 114, 0.3)' }}
            >
              {previewUrl && (
                <Image
                  src={previewUrl}
                  alt="Your pet"
                  fill
                  className="object-cover"
                />
              )}
            </div>

            {error && (
              <div 
                className="mb-6 p-4 rounded-xl text-center"
                style={{ 
                  backgroundColor: 'rgba(239, 68, 68, 0.1)',
                  border: '1px solid rgba(239, 68, 68, 0.3)',
                  color: '#F87171'
                }}
              >
                <p className="font-medium mb-1">Oops!</p>
                <p className="text-sm break-words">{error}</p>
                {/* Debug: Show full error details on mobile */}
                <details className="mt-2 text-left">
                  <summary className="text-xs cursor-pointer opacity-70">Debug Details</summary>
                  <pre className="text-xs mt-2 p-2 bg-black/20 rounded overflow-auto max-h-40">
                    {JSON.stringify({ error, timestamp: new Date().toISOString() }, null, 2)}
                  </pre>
                </details>
              </div>
            )}

            <div className="text-center">
              <button onClick={handleGenerate} className="btn-primary text-lg px-8 py-4">
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.53 16.122a3 3 0 00-5.78 1.128 2.25 2.25 0 01-2.4 2.245 4.5 4.5 0 008.4-2.245c0-.399-.078-.78-.22-1.128zm0 0a15.998 15.998 0 003.388-1.62m-5.043-.025a15.994 15.994 0 011.622-3.395m3.42 3.42a15.995 15.995 0 004.764-4.648l3.876-5.814a1.151 1.151 0 00-1.597-1.597L14.146 6.32a15.996 15.996 0 00-4.649 4.763m3.42 3.42a6.776 6.776 0 00-3.42-3.42" />
                </svg>
                Generate Renaissance Portrait
              </button>
            </div>
          </div>
        )}

        {/* Generating Stage - Elegant Victorian Animation */}
        {stage === "generating" && (
          <div className="p-8 text-center min-h-[400px] flex flex-col items-center justify-center">
            {/* Simple elegant spinner */}
            <div className="w-16 h-16 mb-8 relative">
              <div 
                className="absolute inset-0 border-2 rounded-full"
                style={{ borderColor: 'rgba(197, 165, 114, 0.2)' }}
              />
              <div 
                className="absolute inset-0 border-2 border-transparent rounded-full animate-spin"
                style={{ borderTopColor: '#C5A572', animationDuration: '1.5s' }}
              />
            </div>
            
            {/* Fading Victorian phrase - slow elegant fade */}
            <div className="h-24 flex items-center justify-center">
              <p 
                className={`text-xl italic transition-all duration-1000 ease-in-out ${phraseVisible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-2'}`}
                style={{ 
                  fontFamily: "'Cormorant Garamond', Georgia, serif", 
                  color: '#C5A572',
                  letterSpacing: '0.08em'
                }}
              >
                {VICTORIAN_PHRASES[currentPhrase]}
              </p>
            </div>

            <p className="text-sm mt-4" style={{ color: '#7A756D' }}>
              This may take up to 60 seconds
            </p>
          </div>
        )}

        {/* Result Stage - Purchase Modal */}
        {stage === "result" && result && (
          <div className="p-4 sm:p-8 max-h-[90vh] overflow-y-auto">
            {/* Most Popular badge */}
            <div className="flex justify-center -mt-2 sm:-mt-4 mb-2 sm:mb-4">
              <span 
                className="px-3 sm:px-4 py-1 text-xs font-semibold uppercase tracking-wider rounded-full"
                style={{ backgroundColor: '#10B981', color: 'white' }}
              >
                Most Popular
              </span>
            </div>

            {/* Download icon */}
            <div className="flex justify-center mb-2 sm:mb-4">
              <svg className="w-6 h-6 sm:w-8 sm:h-8" style={{ color: '#B8B2A8' }} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
              </svg>
            </div>

            {/* Title - Larger and more visible on mobile */}
            <h3 
              className="text-2xl sm:text-3xl md:text-4xl font-semibold text-center mb-2 sm:mb-4"
              style={{ fontFamily: "'Cormorant Garamond', Georgia, serif", color: '#F0EDE8', textShadow: '0 2px 4px rgba(0,0,0,0.3)' }}
            >
              Instant Masterpiece
            </h3>

            {/* Price */}
            <div className="text-center mb-2">
              <span className="text-base sm:text-lg line-through mr-2" style={{ color: '#7A756D' }}>$9</span>
              <span className="text-3xl sm:text-4xl font-bold" style={{ color: '#F0EDE8' }}>$0.50</span>
            </div>

            {/* Expiration Timer */}
            <div className="text-center mb-3 sm:mb-4">
              <span className="text-sm sm:text-base" style={{ color: '#B8B2A8' }}>Expires in </span>
              <span className="font-mono font-bold text-sm sm:text-base" style={{ color: '#F0EDE8' }}>{timeRemaining}</span>
            </div>

            {/* Preview Image - Smaller on mobile */}
            <div className="relative max-w-[200px] sm:max-w-xs mx-auto mb-4 sm:mb-6 rounded-xl overflow-hidden shadow-lg">
              <div className="relative aspect-square">
                <Image
                  src={result.previewUrl}
                  alt="Renaissance portrait preview"
                  fill
                  className="object-cover"
                  unoptimized
                />
              </div>
            </div>

            {/* Description - Compact on mobile */}
            <p className="text-center mb-3 sm:mb-4 text-sm sm:text-base" style={{ color: '#B8B2A8' }}>
              Instant high-resolution download —<br className="hidden sm:block" />
              <span className="sm:hidden"> </span>perfect for sharing or saving.
            </p>

            {/* Features list - Compact on mobile */}
            <div className="space-y-2 sm:space-y-3 mb-4 sm:mb-6">
              <div className="flex items-center gap-2 sm:gap-3 text-sm sm:text-base" style={{ color: '#B8B2A8' }}>
                <svg className="w-4 h-4 sm:w-5 sm:h-5 flex-shrink-0" style={{ color: '#10B981' }} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
                <span>No Watermark</span>
              </div>
              <div className="flex items-center gap-2 sm:gap-3 text-sm sm:text-base" style={{ color: '#B8B2A8' }}>
                <svg className="w-4 h-4 sm:w-5 sm:h-5 flex-shrink-0" style={{ color: '#10B981' }} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
                <span>Instant Download</span>
              </div>
              <div className="flex items-center gap-2 sm:gap-3 text-sm sm:text-base" style={{ color: '#B8B2A8' }}>
                <svg className="w-4 h-4 sm:w-5 sm:h-5 flex-shrink-0" style={{ color: '#10B981' }} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
                <span className="hidden sm:inline">High-Resolution (3200×4000px)</span>
                <span className="sm:hidden">High-Resolution</span>
              </div>
            </div>

            {/* Download button - Prominent and always visible */}
            <button 
              onClick={handlePurchaseClick}
              className="w-full py-3 sm:py-4 rounded-xl font-semibold text-base sm:text-lg transition-all hover:scale-[1.02] shadow-lg"
              style={{ 
                backgroundColor: '#F0EDE8', 
                color: '#1A1A1A',
              }}
            >
              Download Now
            </button>

            {error && (
              <div 
                className="mt-4 p-3 rounded-xl text-center text-sm"
                style={{ 
                  backgroundColor: 'rgba(239, 68, 68, 0.1)',
                  border: '1px solid rgba(239, 68, 68, 0.3)',
                  color: '#F87171'
                }}
              >
                {error}
              </div>
            )}

            {/* Retry button */}
            <div className="mt-6 pt-6 border-t" style={{ borderColor: 'rgba(255,255,255,0.1)' }}>
              {!retryUsed ? (
                <button 
                  onClick={handleRetry}
                  className="w-full text-center text-sm py-2 transition-colors hover:text-[#C5A572]"
                  style={{ color: '#7A756D' }}
                >
                  🔄 Try Again (1 free retry)
                </button>
              ) : (
                <p className="text-center text-sm" style={{ color: '#7A756D' }}>
                  You&apos;ve used your free retry
                </p>
              )}
            </div>
          </div>
        )}

        {/* Email Capture Stage */}
        {stage === "email" && (
          <div className="p-8">
            <div className="text-center mb-6">
              <h3 
                className="text-2xl font-semibold mb-2"
                style={{ fontFamily: "'Cormorant Garamond', Georgia, serif", color: '#F0EDE8' }}
              >
                Almost There!
              </h3>
              <p style={{ color: '#B8B2A8' }}>
                Enter your email to receive your masterpiece
              </p>
            </div>

            <div className="max-w-sm mx-auto">
              <input
                type="email"
                value={email}
                onChange={(e) => {
                  setEmail(e.target.value);
                  setEmailError(null);
                }}
                placeholder="your@email.com"
                className="w-full px-4 py-3 rounded-xl text-center text-lg mb-4 outline-none transition-all"
                style={{ 
                  backgroundColor: 'rgba(255,255,255,0.1)',
                  border: emailError ? '2px solid #F87171' : '2px solid rgba(197, 165, 114, 0.3)',
                  color: '#F0EDE8'
                }}
                onKeyDown={(e) => e.key === 'Enter' && handleEmailSubmit()}
              />
              
              {emailError && (
                <p className="text-center text-sm mb-4" style={{ color: '#F87171' }}>
                  {emailError}
                </p>
              )}

              <button 
                onClick={handleEmailSubmit}
                className="w-full py-4 rounded-xl font-semibold text-lg transition-all hover:scale-[1.02]"
                style={{ 
                  backgroundColor: '#C5A572', 
                  color: '#1A1A1A',
                }}
              >
                Continue to Payment
              </button>

              <button 
                onClick={() => setStage("result")}
                className="w-full text-center text-sm py-3 mt-3 transition-colors hover:text-[#C5A572]"
                style={{ color: '#7A756D' }}
              >
                ← Go back
              </button>
            </div>
          </div>
        )}

        {/* Expired Stage */}
        {stage === "expired" && (
          <div className="p-8 text-center">
            <div className="w-16 h-16 mx-auto mb-6 rounded-full flex items-center justify-center" style={{ backgroundColor: 'rgba(239, 68, 68, 0.1)' }}>
              <svg className="w-8 h-8" style={{ color: '#F87171' }} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </div>
            
            <h3 
              className="text-2xl font-semibold mb-2"
              style={{ fontFamily: "'Cormorant Garamond', Georgia, serif", color: '#F0EDE8' }}
            >
              Offer Expired
            </h3>
            <p className="mb-6" style={{ color: '#B8B2A8' }}>
              This masterpiece has expired. Generate a new portrait to continue.
            </p>

            <button 
              onClick={handleReset}
              className="btn-primary text-lg px-8 py-4"
            >
              Generate New Portrait
            </button>
          </div>
        )}

        {/* Checkout Stage */}
        {stage === "checkout" && (
          <div className="p-8 text-center">
            <div 
              className="w-16 h-16 mx-auto mb-6 rounded-full flex items-center justify-center"
              style={{ backgroundColor: 'rgba(197, 165, 114, 0.1)' }}
            >
              <div 
                className="w-8 h-8 rounded-full animate-spin"
                style={{ 
                  borderWidth: '3px',
                  borderStyle: 'solid',
                  borderColor: 'rgba(197, 165, 114, 0.2)',
                  borderTopColor: '#C5A572'
                }}
              />
            </div>
            <h3 
              className="text-2xl font-semibold mb-2"
              style={{ fontFamily: "'Cormorant Garamond', Georgia, serif", color: '#F0EDE8' }}
            >
              Redirecting to Checkout...
            </h3>
            <p style={{ color: '#B8B2A8' }}>
              Taking you to our secure payment page.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
