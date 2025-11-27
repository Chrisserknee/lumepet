"use client";

import { useState, useEffect, useCallback } from "react";
import Image from "next/image";
import { CONFIG } from "@/lib/config";
import { captureEvent } from "@/lib/posthog";

type Stage = "preview" | "generating" | "result" | "checkout" | "email" | "expired";
type Gender = "male" | "female" | null;

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

// Retry limit management using localStorage
const STORAGE_KEY = "lumepet_generation_limits";

interface GenerationLimits {
  freeGenerations: number; // Total free generations used (starts at 0)
  freeRetriesUsed: number; // Free retries used (max 1)
  purchases: number; // Number of individual image purchases made
  packPurchases: number; // Number of pack purchases made
  packCredits: number; // Remaining pack generation credits (un-watermarked)
  lastReset?: string; // Date of last reset (optional for daily limits)
}

const getLimits = (): GenerationLimits => {
  if (typeof window === "undefined") {
    return { freeGenerations: 0, freeRetriesUsed: 0, purchases: 0, packPurchases: 0, packCredits: 0 };
  }
  const stored = localStorage.getItem(STORAGE_KEY);
  if (stored) {
    try {
      const parsed = JSON.parse(stored);
      // Ensure new fields exist for backward compatibility
      return {
        freeGenerations: parsed.freeGenerations || 0,
        freeRetriesUsed: parsed.freeRetriesUsed || 0,
        purchases: parsed.purchases || 0,
        packPurchases: parsed.packPurchases || 0,
        packCredits: parsed.packCredits || 0,
        lastReset: parsed.lastReset,
      };
    } catch {
      return { freeGenerations: 0, freeRetriesUsed: 0, purchases: 0, packPurchases: 0, packCredits: 0 };
    }
  }
  return { freeGenerations: 0, freeRetriesUsed: 0, purchases: 0, packPurchases: 0, packCredits: 0 };
};

const saveLimits = (limits: GenerationLimits) => {
  if (typeof window !== "undefined") {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(limits));
  }
};

const canGenerate = (limits: GenerationLimits): { allowed: boolean; reason?: string; hasPackCredits?: boolean } => {
  // Free tier: 1 initial generation + 1 free retry = 2 total free
  const freeLimit = 2;
  const freeUsed = limits.freeGenerations;
  
  // Each purchase grants 5 additional generations
  const purchaseBonus = limits.purchases * 5;
  const totalAllowed = freeLimit + purchaseBonus;
  const totalUsed = freeUsed;
  
  // Check if user has pack credits (un-watermarked generations)
  if (limits.packCredits > 0) {
    return { allowed: true, hasPackCredits: true };
  }
  
  if (totalUsed >= totalAllowed) {
    return {
      allowed: false,
      reason: `You've reached your free generation limit (${freeLimit} free generations). Purchase a pack to unlock more un-watermarked generations!`,
      hasPackCredits: false,
    };
  }
  
  return { allowed: true, hasPackCredits: false };
};

const incrementGeneration = (isRetry: boolean = false) => {
  const limits = getLimits();
  limits.freeGenerations += 1;
  if (isRetry) {
    limits.freeRetriesUsed = 1;
  }
  saveLimits(limits);
  return limits;
};

const addPurchase = () => {
  const limits = getLimits();
  limits.purchases += 1;
  saveLimits(limits);
  return limits;
};

const addPackPurchase = (credits: number) => {
  const limits = getLimits();
  limits.packPurchases += 1;
  limits.packCredits += credits;
  saveLimits(limits);
  return limits;
};

const usePackCredit = () => {
  const limits = getLimits();
  if (limits.packCredits > 0) {
    limits.packCredits -= 1;
    saveLimits(limits);
  }
  return limits;
};

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
  const [gender, setGender] = useState<Gender>(null);
  const [generationLimits, setGenerationLimits] = useState<GenerationLimits>(getLimits());
  const [limitCheck, setLimitCheck] = useState<{ allowed: boolean; reason?: string } | null>(null);
  const [secretClickCount, setSecretClickCount] = useState(0);
  const [secretActivated, setSecretActivated] = useState(false);
  const [useSecretCredit, setUseSecretCredit] = useState(false);

  // Set preview URL when file is provided - use base64 data URL for PostHog capture
  useEffect(() => {
    if (file && !previewUrl) {
      // Convert file to base64 data URL for PostHog session replay capture
      // Blob URLs don't persist in session replays
      const reader = new FileReader();
      reader.onloadend = () => {
        const base64Url = reader.result as string;
        setPreviewUrl(base64Url);
        
        // Capture image upload event with thumbnail for PostHog
        captureEvent("image_uploaded_for_generation", {
          file_name: file.name,
          file_size: file.size,
          file_type: file.type,
        });
      };
      reader.onerror = () => {
        // Fallback to blob URL if base64 conversion fails
        console.warn("Base64 conversion failed, using blob URL");
        setPreviewUrl(URL.createObjectURL(file));
      };
      reader.readAsDataURL(file);
      
      // Reset secret click counter for new file
      setSecretClickCount(0);
      setSecretActivated(false);
      setUseSecretCredit(false);
    }
  }, [file, previewUrl]);

  // Check generation limits on mount and when file changes
  useEffect(() => {
    const limits = getLimits();
    setGenerationLimits(limits);
    const check = canGenerate(limits);
    setLimitCheck(check);
    
    // Check if user has used their free retry
    setRetryUsed(limits.freeRetriesUsed >= 1);
  }, [file]);

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

  const handleGenerate = async (isRetry: boolean = false) => {
    if (!file) return;
    
    // Check limits before generating
    const limits = getLimits();
    const check = canGenerate(limits);
    if (!check.allowed) {
      setError(check.reason || "Generation limit reached. Please purchase an image to unlock more generations.");
      setStage("preview");
      return;
    }
    
    setStage("generating");
    setError(null);
    setCurrentPhrase(0);
    setPhraseVisible(true);

    // Track generation started
    captureEvent("generation_started", {
      is_retry: isRetry,
      has_pack_credits: limits.packCredits > 0,
      gender: gender || "not_selected",
    });

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
      if (gender) {
        formData.append("gender", gender);
      }
      
      // Check if user has pack credits (un-watermarked generation)
      const limits = getLimits();
      if (limits.packCredits > 0) {
        formData.append("usePackCredit", "true");
      }
      
      // Check if secret credit is activated (un-watermarked generation for testing)
      if (useSecretCredit) {
        formData.append("useSecretCredit", "true");
      }

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
      
      // Handle pack credit usage or increment generation count
      const currentLimits = getLimits();
      const usedPackCredit = currentLimits.packCredits > 0;
      const usedSecretCredit = useSecretCredit;
      
      if (usedPackCredit) {
        // Use pack credit (un-watermarked)
        const updatedLimits = usePackCredit();
        setGenerationLimits(updatedLimits);
      } else if (usedSecretCredit) {
        // Secret credit used - increment generation count but don't use pack credit
        const updatedLimits = incrementGeneration(isRetry);
        setGenerationLimits(updatedLimits);
        setUseSecretCredit(false); // Reset secret credit flag after use
      } else {
        // Increment generation count (mark as retry if applicable)
        const updatedLimits = incrementGeneration(isRetry);
        setGenerationLimits(updatedLimits);
      }
      const newCheck = canGenerate(getLimits());
      setLimitCheck(newCheck);
      
      // Track generation completed
      captureEvent("generation_completed", {
        image_id: data.imageId,
        is_retry: isRetry,
        used_pack_credit: usedPackCredit,
        used_secret_credit: usedSecretCredit,
        gender: gender || "not_selected",
      });
      
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

  const handleRetry = () => {
    const limits = getLimits();
    
    // Check if retry is allowed
    if (limits.freeRetriesUsed >= 1) {
      setError("You've already used your free retry. Purchase an image to unlock more generations!");
      return;
    }
    
    // Check overall generation limit
    const check = canGenerate(limits);
    if (!check.allowed) {
      setError(check.reason || "Generation limit reached.");
      return;
    }
    
    // Mark retry as used BEFORE generating
    setRetryUsed(true);
    setResult(null);
    setExpirationTime(null);
    setError(null);
    
    // Call handleGenerate with isRetry flag
    handleGenerate(true);
  };

  const handlePurchaseClick = () => {
    // Track purchase button clicked
    captureEvent("purchase_button_clicked", {
      image_id: result?.imageId,
      stage: "result",
    });
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
    
    // Track email submitted
    const isPackPurchase = result.imageId === "pack";
    captureEvent("email_submitted", {
      is_pack_purchase: isPackPurchase,
      pack_type: isPackPurchase ? "2-pack" : null,
      image_id: isPackPurchase ? null : result.imageId,
    });
    
    setStage("checkout");

    try {
      // Check if this is a pack purchase
      const isPackPurchase = result.imageId === "pack";
      
      const response = await fetch("/api/checkout", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ 
          imageId: isPackPurchase ? null : result.imageId, 
          email,
          type: isPackPurchase ? "pack" : "image",
          packType: isPackPurchase ? "2-pack" : undefined,
        }),
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
    setExpirationTime(null);
    setEmail("");
    setGender(null);
    
    // Refresh limits check (don't reset limits - they persist)
    const limits = getLimits();
    setGenerationLimits(limits);
    const check = canGenerate(limits);
    setLimitCheck(check);
    setRetryUsed(limits.freeRetriesUsed >= 1);
    
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
              className="relative aspect-square max-w-sm mx-auto rounded-2xl overflow-hidden shadow-lg mb-6 cursor-pointer"
              style={{ border: '2px solid rgba(197, 165, 114, 0.3)' }}
              onClick={() => {
                if (secretActivated) return; // Already activated
                const newCount = secretClickCount + 1;
                setSecretClickCount(newCount);
                
                if (newCount >= 6) {
                  // Grant extra free generation
                  const limits = getLimits();
                  limits.freeGenerations = Math.max(0, limits.freeGenerations - 1); // Reduce used count by 1
                  saveLimits(limits);
                  setGenerationLimits(limits);
                  const newCheck = canGenerate(limits);
                  setLimitCheck(newCheck);
                  setSecretActivated(true);
                  setUseSecretCredit(true); // Enable un-watermarked generation for testing
                  
                  // Show subtle feedback
                  console.log("🎉 Secret activated! Extra free generation granted (un-watermarked).");
                }
              }}
            >
              {previewUrl && (
                <Image
                  src={previewUrl}
                  alt="Your pet"
                  fill
                  className="object-cover"
                  unoptimized
                  data-posthog-unmask="true"
                  style={{ position: 'absolute', top: 0, left: 0 }}
                />
              )}
              {/* Secret click indicator (very subtle) */}
              {secretClickCount > 0 && secretClickCount < 6 && (
                <div className="absolute top-2 right-2 w-2 h-2 rounded-full animate-pulse" style={{ backgroundColor: 'rgba(197, 165, 114, 0.3)' }}></div>
              )}
              {secretActivated && (
                <div className="absolute inset-0 flex items-center justify-center bg-black/20">
                  <div className="text-xs px-2 py-1 rounded" style={{ backgroundColor: 'rgba(34, 197, 94, 0.2)', color: '#4ADE80' }}>
                    ✨ Bonus granted!
                  </div>
                </div>
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

            {/* Generation Limit Display */}
            {limitCheck && (
              <div className="mb-4 p-3 rounded-xl text-center text-sm" style={{ 
                backgroundColor: limitCheck.allowed ? 'rgba(34, 197, 94, 0.1)' : 'rgba(239, 68, 68, 0.1)',
                border: `1px solid ${limitCheck.allowed ? 'rgba(34, 197, 94, 0.3)' : 'rgba(239, 68, 68, 0.3)'}`,
                color: limitCheck.allowed ? '#4ADE80' : '#F87171'
              }}>
                {limitCheck.allowed ? (
                  <p>
                    {generationLimits.packCredits > 0 ? (
                      `✨ ${generationLimits.packCredits} un-watermarked generation${generationLimits.packCredits !== 1 ? 's' : ''} remaining`
                    ) : generationLimits.purchases > 0 ? (
                      `✨ ${2 + (generationLimits.purchases * 5) - generationLimits.freeGenerations} generations remaining (${generationLimits.purchases} purchase${generationLimits.purchases > 1 ? 's' : ''} active)`
                    ) : (
                      `✨ ${2 - generationLimits.freeGenerations} free generation${2 - generationLimits.freeGenerations !== 1 ? 's' : ''} remaining`
                    )}
                  </p>
                ) : (
                  <div>
                    <p className="mb-3">{limitCheck.reason}</p>
                    {/* Pack Purchase Option */}
                    <div className="mt-4 p-4 rounded-lg" style={{ backgroundColor: 'rgba(197, 165, 114, 0.1)', border: '1px solid rgba(197, 165, 114, 0.3)' }}>
                      <p className="text-sm font-semibold mb-2" style={{ color: '#C5A572' }}>Unlock More Generations</p>
                      <p className="text-xs mb-3" style={{ color: '#B8B2A8' }}>Purchase a pack to get un-watermarked generations</p>
                      <button
                        onClick={() => {
                          captureEvent("pack_purchase_button_clicked", {
                            pack_type: "2-pack",
                            source: "preview_limit_reached",
                          });
                          setStage("email");
                          setEmailError(null);
                          setResult({ imageId: "pack", previewUrl: "" } as GeneratedResult);
                        }}
                        className="w-full py-2 px-4 rounded-lg font-semibold text-sm transition-all hover:scale-105"
                        style={{ 
                          backgroundColor: '#C5A572', 
                          color: '#1A1A1A',
                        }}
                      >
                        Buy 2-Pack ($15) - Un-watermarked
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Gender Selection */}
            <div className="mb-6">
              <p className="text-center mb-3 text-sm" style={{ color: '#B8B2A8' }}>
                Select your pet&apos;s gender for more accurate results:
              </p>
              <div className="flex gap-4 justify-center">
                <button
                  onClick={() => setGender("male")}
                  disabled={limitCheck ? !limitCheck.allowed : false}
                  className={`px-6 py-3 rounded-xl font-semibold transition-all ${
                    gender === "male"
                      ? "scale-105 shadow-lg"
                      : "opacity-70 hover:opacity-100"
                  } ${limitCheck && !limitCheck.allowed ? 'opacity-50 cursor-not-allowed' : ''}`}
                  style={{
                    backgroundColor: gender === "male" ? '#C5A572' : 'rgba(197, 165, 114, 0.2)',
                    color: gender === "male" ? '#1A1A1A' : '#C5A572',
                    border: `2px solid ${gender === "male" ? '#C5A572' : 'rgba(197, 165, 114, 0.3)'}`,
                  }}
                >
                  ♂ Male
                </button>
                <button
                  onClick={() => setGender("female")}
                  disabled={limitCheck ? !limitCheck.allowed : false}
                  className={`px-6 py-3 rounded-xl font-semibold transition-all ${
                    gender === "female"
                      ? "scale-105 shadow-lg"
                      : "opacity-70 hover:opacity-100"
                  } ${limitCheck && !limitCheck.allowed ? 'opacity-50 cursor-not-allowed' : ''}`}
                  style={{
                    backgroundColor: gender === "female" ? '#C5A572' : 'rgba(197, 165, 114, 0.2)',
                    color: gender === "female" ? '#1A1A1A' : '#C5A572',
                    border: `2px solid ${gender === "female" ? '#C5A572' : 'rgba(197, 165, 114, 0.3)'}`,
                  }}
                >
                  ♀ Female
                </button>
              </div>
            </div>

            <div className="text-center">
              <button 
                onClick={() => handleGenerate(false)} 
                disabled={!gender || (limitCheck ? !limitCheck.allowed : false)}
                className={`btn-primary text-lg px-8 py-4 ${!gender || (limitCheck && !limitCheck.allowed) ? 'opacity-50 cursor-not-allowed' : ''}`}
              >
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
          <div className="p-8 text-center min-h-[500px] flex flex-col items-center justify-center relative overflow-hidden">
            {/* Decorative background elements */}
            <div className="absolute inset-0 pointer-events-none">
              {/* Floating particles */}
              <div className="absolute top-1/4 left-1/4 w-2 h-2 rounded-full animate-pulse" style={{ backgroundColor: 'rgba(197, 165, 114, 0.3)', animationDelay: '0s', animationDuration: '2s' }}></div>
              <div className="absolute top-1/3 right-1/4 w-1.5 h-1.5 rounded-full animate-pulse" style={{ backgroundColor: 'rgba(197, 165, 114, 0.4)', animationDelay: '0.5s', animationDuration: '2.5s' }}></div>
              <div className="absolute bottom-1/3 left-1/3 w-2 h-2 rounded-full animate-pulse" style={{ backgroundColor: 'rgba(197, 165, 114, 0.25)', animationDelay: '1s', animationDuration: '3s' }}></div>
              <div className="absolute bottom-1/4 right-1/3 w-1.5 h-1.5 rounded-full animate-pulse" style={{ backgroundColor: 'rgba(197, 165, 114, 0.35)', animationDelay: '1.5s', animationDuration: '2.2s' }}></div>
              
              {/* Subtle glow effect */}
              <div 
                className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-96 h-96 rounded-full blur-3xl opacity-20 animate-pulse"
                style={{ backgroundColor: '#C5A572', animationDuration: '4s' }}
              ></div>
            </div>

            {/* Beautiful ornate spinner */}
            <div className="w-24 h-24 mb-10 relative z-10">
              {/* Outer ring */}
              <div 
                className="absolute inset-0 border-2 rounded-full"
                style={{ borderColor: 'rgba(197, 165, 114, 0.2)' }}
              />
              {/* Animated ring */}
              <div 
                className="absolute inset-0 border-2 border-transparent rounded-full animate-spin"
                style={{ borderTopColor: '#C5A572', borderRightColor: 'rgba(197, 165, 114, 0.5)', animationDuration: '1.5s' }}
              />
              {/* Inner decorative circle */}
              <div 
                className="absolute inset-2 border rounded-full"
                style={{ borderColor: 'rgba(197, 165, 114, 0.15)' }}
              />
              {/* Center dot */}
              <div 
                className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-3 h-3 rounded-full animate-pulse"
                style={{ backgroundColor: '#C5A572', animationDuration: '1s' }}
              ></div>
            </div>
            
            {/* Fading Victorian phrase - slow elegant fade */}
            <div className="h-32 flex items-center justify-center mb-6 relative z-10">
              <p 
                className={`text-2xl sm:text-3xl italic transition-all duration-1000 ease-in-out ${phraseVisible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-2'}`}
                style={{ 
                  fontFamily: "'Cormorant Garamond', Georgia, serif", 
                  color: '#C5A572',
                  letterSpacing: '0.1em',
                  textShadow: '0 2px 8px rgba(197, 165, 114, 0.3)',
                  fontWeight: 500
                }}
              >
                {VICTORIAN_PHRASES[currentPhrase]}
              </p>
            </div>

            {/* Elegant progress indicator */}
            <div className="w-64 max-w-full mx-auto mb-4 relative z-10">
              <div className="h-1 rounded-full overflow-hidden" style={{ backgroundColor: 'rgba(197, 165, 114, 0.1)' }}>
                <div 
                  className="h-full rounded-full animate-pulse"
                  style={{ 
                    backgroundColor: '#C5A572',
                    width: '60%',
                    boxShadow: '0 0 10px rgba(197, 165, 114, 0.5)',
                    animationDuration: '2s'
                  }}
                ></div>
              </div>
            </div>

            <p className="text-sm mt-2 relative z-10" style={{ color: '#7A756D', fontStyle: 'italic' }}>
              Crafting your masterpiece... this may take up to 60 seconds
            </p>
          </div>
        )}

        {/* Result Stage - Purchase Modal */}
        {stage === "result" && result && (
          <div className="p-4 sm:p-8 max-h-[90vh] overflow-y-auto">
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
              <span className="text-3xl sm:text-4xl font-bold" style={{ color: '#F0EDE8' }}>$9</span>
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
              {(() => {
                const limits = getLimits();
                const check = canGenerate(limits);
                const hasFreeRetry = limits.freeRetriesUsed < 1;
                const canRetry = check.allowed && hasFreeRetry;
                
                if (canRetry) {
                  return (
                    <button 
                      onClick={handleRetry}
                      className="w-full text-center text-sm py-2 transition-colors hover:text-[#C5A572]"
                      style={{ color: '#7A756D' }}
                    >
                      🔄 Try Again (1 free retry)
                    </button>
                  );
                } else if (!check.allowed) {
                  return (
                    <div className="text-center">
                      <p className="text-sm mb-3" style={{ color: '#7A756D' }}>
                        {check.reason || "Generation limit reached. Purchase a pack to unlock more!"}
                      </p>
                      <button
                        onClick={() => {
                          captureEvent("pack_purchase_button_clicked", {
                            pack_type: "2-pack",
                            source: "limit_reached",
                          });
                          setStage("email");
                          setEmailError(null);
                          setResult({ imageId: "pack", previewUrl: "" } as GeneratedResult);
                        }}
                        className="w-full py-2 px-4 rounded-lg font-semibold text-sm transition-all hover:scale-105"
                        style={{ 
                          backgroundColor: '#C5A572', 
                          color: '#1A1A1A',
                        }}
                      >
                        Buy 2-Pack ($15) - Un-watermarked
                      </button>
                    </div>
                  );
                } else {
                  return (
                    <div className="text-center">
                      <p className="text-sm mb-3" style={{ color: '#7A756D' }}>
                        You&apos;ve used your free retry. Purchase a pack to unlock more generations!
                      </p>
                      <button
                        onClick={() => {
                          captureEvent("pack_purchase_button_clicked", {
                            pack_type: "2-pack",
                            source: "retry_used",
                          });
                          setStage("email");
                          setEmailError(null);
                          setResult({ imageId: "pack", previewUrl: "" } as GeneratedResult);
                        }}
                        className="w-full py-2 px-4 rounded-lg font-semibold text-sm transition-all hover:scale-105"
                        style={{ 
                          backgroundColor: '#C5A572', 
                          color: '#1A1A1A',
                        }}
                      >
                        Buy 2-Pack ($15) - Un-watermarked
                      </button>
                    </div>
                  );
                }
              })()}
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
