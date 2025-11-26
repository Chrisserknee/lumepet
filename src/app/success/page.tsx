"use client";

import { useSearchParams } from "next/navigation";
import { useState, useEffect, Suspense } from "react";
import Image from "next/image";
import Link from "next/link";

function SuccessContent() {
  const searchParams = useSearchParams();
  const imageId = searchParams.get("imageId");
  
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [isValid, setIsValid] = useState<boolean | null>(null);
  const [isDownloading, setIsDownloading] = useState(false);

  useEffect(() => {
    // Fetch the image metadata to get the HD URL
    if (imageId) {
      fetch(`/api/image-info?imageId=${imageId}`)
        .then((res) => res.json())
        .then((data) => {
          if (data.hdUrl) {
            setImageUrl(data.hdUrl);
            setIsValid(true);
          } else {
            setIsValid(false);
          }
        })
        .catch(() => {
          setIsValid(false);
        });
    } else {
      setIsValid(false);
    }
  }, [imageId]);

  const handleDownload = async () => {
    if (!imageId) return;
    
    setIsDownloading(true);
    
    try {
      const response = await fetch(`/api/download?imageId=${imageId}`);
      
      if (!response.ok) {
        throw new Error("Download failed");
      }
      
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      
      const link = document.createElement("a");
      link.href = url;
      link.download = `pet-renaissance-${imageId}.png`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
    } catch (error) {
      console.error("Download error:", error);
      alert("Failed to download. Please try again.");
    } finally {
      setIsDownloading(false);
    }
  };

  // Loading state
  if (isValid === null) {
    return (
      <div className="min-h-screen bg-renaissance flex items-center justify-center p-6">
        <div className="text-center">
          <div className="w-16 h-16 mx-auto mb-6">
            <div 
              className="w-16 h-16 rounded-full animate-spin"
              style={{ 
                borderWidth: '4px',
                borderStyle: 'solid',
                borderColor: '#C5A572',
                borderTopColor: '#722F37'
              }}
            />
          </div>
          <p style={{ color: '#4A4A4A' }}>Loading your masterpiece...</p>
        </div>
      </div>
    );
  }

  // Error state
  if (!isValid || !imageId) {
    return (
      <div className="min-h-screen bg-renaissance flex items-center justify-center p-6">
        <div className="max-w-md w-full text-center">
          <div 
            className="w-20 h-20 mx-auto mb-6 rounded-full flex items-center justify-center"
            style={{ backgroundColor: '#FEF2F2' }}
          >
            <svg className="w-10 h-10" style={{ color: '#EF4444' }} fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
            </svg>
          </div>
          <h1 
            className="text-3xl font-semibold mb-4"
            style={{ fontFamily: "'Cormorant Garamond', Georgia, serif", color: '#2C2C2C' }}
          >
            Something Went Wrong
          </h1>
          <p className="mb-8" style={{ color: '#4A4A4A' }}>
            We couldn&apos;t find your portrait. The link may be invalid or expired.
          </p>
          <Link href="/" className="btn-primary inline-flex">
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
            </svg>
            Return Home
          </Link>
        </div>
      </div>
    );
  }

  // Success state
  return (
    <div className="min-h-screen bg-renaissance py-12 px-6">
      <div className="max-w-2xl mx-auto">
        {/* Success header */}
        <div className="text-center mb-10 animate-fade-in-up">
          <div 
            className="w-20 h-20 mx-auto mb-6 rounded-full flex items-center justify-center"
            style={{ backgroundColor: '#DCFCE7' }}
          >
            <svg className="w-10 h-10" style={{ color: '#16A34A' }} fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
            </svg>
          </div>
          <h1 
            className="text-3xl sm:text-4xl md:text-5xl font-semibold mb-4"
            style={{ fontFamily: "'Cormorant Garamond', Georgia, serif", color: '#2C2C2C' }}
          >
            Your Renaissance Portrait is Ready
          </h1>
          <p className="text-lg" style={{ color: '#4A4A4A' }}>
            Thank you for your purchase! Your pet has been immortalized.
          </p>
        </div>

        {/* Portrait display - NO WATERMARK */}
        <div className="animate-fade-in-up delay-200">
          <div className="ornate-frame max-w-lg mx-auto mb-8">
            <div className="relative aspect-square rounded overflow-hidden shadow-2xl">
              {imageUrl && (
                <Image
                  src={imageUrl}
                  alt="Your Renaissance pet portrait"
                  fill
                  className="object-cover"
                  priority
                  unoptimized
                />
              )}
            </div>
          </div>
        </div>

        {/* Download button */}
        <div className="text-center animate-fade-in-up delay-300">
          <button
            onClick={handleDownload}
            disabled={isDownloading}
            className="btn-primary text-lg px-10 py-5 mb-6"
          >
            {isDownloading ? (
              <>
                <div 
                  className="w-5 h-5 rounded-full animate-spin"
                  style={{ 
                    borderWidth: '2px',
                    borderStyle: 'solid',
                    borderColor: 'rgba(255, 255, 255, 0.3)',
                    borderTopColor: 'white'
                  }}
                />
                Preparing Download...
              </>
            ) : (
              <>
                <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                </svg>
                Download HD Portrait
              </>
            )}
          </button>

          <p className="text-sm mb-8" style={{ color: '#8B7355' }}>
            High-resolution PNG • Watermark-free • Perfect for printing
          </p>
        </div>

        {/* Tips section */}
        <div className="card animate-fade-in-up delay-400">
          <h3 
            className="text-xl mb-4 text-center"
            style={{ fontFamily: "'Cormorant Garamond', Georgia, serif", color: '#2C2C2C' }}
          >
            ✨ Ideas for Your Portrait
          </h3>
          <div className="grid sm:grid-cols-2 gap-4 text-sm" style={{ color: '#4A4A4A' }}>
            <div className="flex items-start gap-3">
              <span className="text-lg">🖼️</span>
              <span>Print and frame it for an elegant wall display</span>
            </div>
            <div className="flex items-start gap-3">
              <span className="text-lg">🎁</span>
              <span>Make it into a gift for fellow pet lovers</span>
            </div>
            <div className="flex items-start gap-3">
              <span className="text-lg">📱</span>
              <span>Use as a unique profile picture on social media</span>
            </div>
            <div className="flex items-start gap-3">
              <span className="text-lg">☕</span>
              <span>Print on canvas, mugs, or other merchandise</span>
            </div>
          </div>
        </div>

        {/* Back home link */}
        <div className="text-center mt-10 animate-fade-in-up delay-500">
          <Link 
            href="/" 
            className="inline-flex items-center gap-2 transition-colors hover:text-[#5A252C]"
            style={{ color: '#722F37' }}
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
            </svg>
            Create another masterpiece
          </Link>
        </div>
      </div>
    </div>
  );
}

export default function SuccessPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen bg-renaissance flex items-center justify-center p-6">
        <div className="text-center">
          <div className="w-16 h-16 mx-auto mb-6">
            <div 
              className="w-16 h-16 rounded-full animate-spin"
              style={{ 
                borderWidth: '4px',
                borderStyle: 'solid',
                borderColor: '#C5A572',
                borderTopColor: '#722F37'
              }}
            />
          </div>
          <p style={{ color: '#4A4A4A' }}>Loading your masterpiece...</p>
        </div>
      </div>
    }>
      <SuccessContent />
    </Suspense>
  );
}
