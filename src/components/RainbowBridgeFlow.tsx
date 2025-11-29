"use client";

import { useState, useEffect, useCallback } from "react";
import Image from "next/image";
import { CONFIG } from "@/lib/config";
import { captureEvent } from "@/lib/posthog";

type Stage = "preview" | "generating" | "result" | "checkout" | "email" | "expired";
type Gender = "male" | "female" | null;

interface RainbowBridgeFlowProps {
  file: File | null;
  onReset: () => void;
}

interface GeneratedResult {
  imageId: string;
  previewUrl: string;
}

// Heavenly phrases for generation animation
const HEAVENLY_PHRASES = [
  "Preparing their heavenly portrait...",
  "Surrounding them with angelic light...",
  "Adding soft ethereal glow...",
  "Creating their peaceful resting place...",
  "Painting wings of light...",
  "Capturing their eternal spirit...",
  "Adding rainbow bridge colors...",
  "A beautiful tribute takes form...",
];

// Retry limit management using localStorage
const STORAGE_KEY = "lumepet_generation_limits";

interface GenerationLimits {
  freeGenerations: number;
  freeRetriesUsed: number;
  purchases: number;
  packPurchases: number;
  packCredits: number;
  lastReset?: string;
}

const getLimits = (): GenerationLimits => {
  if (typeof window === "undefined") {
    return { freeGenerations: 0, freeRetriesUsed: 0, purchases: 0, packPurchases: 0, packCredits: 0 };
  }
  const stored = localStorage.getItem(STORAGE_KEY);
  if (stored) {
    try {
      const parsed = JSON.parse(stored);
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
  const freeLimit = 2;
  const freeUsed = limits.freeGenerations;
  const purchaseBonus = limits.purchases * 5;
  const totalAllowed = freeLimit + purchaseBonus;
  const totalUsed = freeUsed;
  
  if (limits.packCredits > 0) {
    return { allowed: true, hasPackCredits: true };
  }
  
  if (totalUsed >= totalAllowed) {
    return {
      allowed: false,
      reason: `You've reached your free generation limit. Purchase a pack to create more memorial portraits.`,
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

const usePackCredit = () => {
  const limits = getLimits();
  if (limits.packCredits > 0) {
    limits.packCredits -= 1;
    saveLimits(limits);
  }
  return limits;
};

export default function RainbowBridgeFlow({ file, onReset }: RainbowBridgeFlowProps) {
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
  const [petName, setPetName] = useState("");
  const [generationLimits, setGenerationLimits] = useState<GenerationLimits>(getLimits());
  const [limitCheck, setLimitCheck] = useState<{ allowed: boolean; reason?: string } | null>(null);
  const [secretClickCount, setSecretClickCount] = useState(0);
  const [secretActivated, setSecretActivated] = useState(false);
  const [useSecretCredit, setUseSecretCredit] = useState(false);

  // Set preview URL when file is provided
  useEffect(() => {
    if (file && !previewUrl) {
      const reader = new FileReader();
      reader.onloadend = () => {
        const base64Url = reader.result as string;
        setPreviewUrl(base64Url);
        captureEvent("rainbow_bridge_image_uploaded", {
          file_name: file.name,
          file_size: file.size,
          file_type: file.type,
        });
      };
      reader.onerror = () => {
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

  // Check generation limits on mount
  useEffect(() => {
    const limits = getLimits();
    setGenerationLimits(limits);
    const check = canGenerate(limits);
    setLimitCheck(check);
    setRetryUsed(limits.freeRetriesUsed >= 1);
  }, [file]);

  // Phrase cycling animation
  useEffect(() => {
    if (stage !== "generating") return;

    const cycleInterval = setInterval(() => {
      setPhraseVisible(false);
      setTimeout(() => {
        setCurrentPhrase((prev) => (prev + 1) % HEAVENLY_PHRASES.length);
        setPhraseVisible(true);
      }, 1000);
    }, 5000);

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

  // Compress image before upload
  const compressImage = async (file: File, maxSizeMB: number = 3.5): Promise<File> => {
    return new Promise((resolve) => {
      const reader = new FileReader();
      reader.onload = (e) => {
        const img = document.createElement('img');
        img.onload = () => {
          const canvas = document.createElement('canvas');
          let width = img.width;
          let height = img.height;
          
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
          
          canvas.toBlob(
            (blob) => {
              if (blob) {
                const compressedFile = new File([blob], file.name, {
                  type: 'image/jpeg',
                  lastModified: Date.now(),
                });
                resolve(compressedFile);
              } else {
                resolve(file);
              }
            },
            'image/jpeg',
            0.85
          );
        };
        img.src = e.target?.result as string;
      };
      reader.readAsDataURL(file);
    });
  };

  const handleGenerate = async (isRetry: boolean = false) => {
    if (!file || !petName.trim()) return;
    
    const limits = getLimits();
    // Allow generation if secret credit is activated, even if limits are reached
    const check = canGenerate(limits);
    if (!check.allowed && !useSecretCredit) {
      setError(check.reason || "Generation limit reached.");
      setStage("preview");
      return;
    }
    
    setStage("generating");
    setError(null);
    setCurrentPhrase(0);
    setPhraseVisible(true);

    captureEvent("rainbow_bridge_generation_started", {
      is_retry: isRetry,
      has_pack_credits: limits.packCredits > 0,
      gender: gender || "not_selected",
      pet_name: petName,
    });

    try {
      let fileToUpload = file;
      if (file.size > 3.5 * 1024 * 1024) {
        fileToUpload = await compressImage(file, 3.5);
      }
      
      const formData = new FormData();
      formData.append("image", fileToUpload);
      formData.append("style", "rainbow-bridge");
      formData.append("petName", petName.trim());
      console.log("🌈 Sending Rainbow Bridge generation request with petName:", petName.trim());
      if (gender) {
        formData.append("gender", gender);
      }
      
      const currentLimits = getLimits();
      if (currentLimits.packCredits > 0) {
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

      if (response.status === 413) {
        throw new Error("Image file is too large. Please use an image smaller than 4MB.");
      }

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || `Failed to generate portrait (${response.status})`);
      }

      setResult(data);
      
      const usedPackCredit = currentLimits.packCredits > 0;
      const usedSecretCredit = useSecretCredit;
      
      if (usedPackCredit) {
        const updatedLimits = usePackCredit();
        setGenerationLimits(updatedLimits);
      } else if (usedSecretCredit) {
        // Secret credit used - increment generation count (uses up the free slot granted by secret)
        const updatedLimits = incrementGeneration(isRetry);
        setGenerationLimits(updatedLimits);
        setUseSecretCredit(false); // Reset secret credit flag after use
      } else {
        const updatedLimits = incrementGeneration(isRetry);
        setGenerationLimits(updatedLimits);
      }
      const newCheck = canGenerate(getLimits());
      setLimitCheck(newCheck);
      
      captureEvent("rainbow_bridge_generation_completed", {
        image_id: data.imageId,
        is_retry: isRetry,
        used_pack_credit: usedPackCredit,
        used_secret_credit: usedSecretCredit,
        gender: gender || "not_selected",
        pet_name: petName,
      });
      
      setExpirationTime(Date.now() + 15 * 60 * 1000);
      setStage("result");
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : "Something went wrong. Please try again.";
      setError(errorMessage);
      setStage("preview");
    }
  };

  const handleRetry = () => {
    const limits = getLimits();
    
    if (limits.freeRetriesUsed >= 1) {
      setError("You've already used your free retry.");
      return;
    }
    
    const check = canGenerate(limits);
    if (!check.allowed) {
      setError(check.reason || "Generation limit reached.");
      return;
    }
    
    setRetryUsed(true);
    setResult(null);
    setExpirationTime(null);
    setError(null);
    handleGenerate(true);
  };

  const handlePurchaseClick = () => {
    captureEvent("rainbow_bridge_purchase_clicked", {
      image_id: result?.imageId,
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

    if (!result) {
      console.error("No result found when trying to checkout");
      setError("Please generate a portrait first.");
      return;
    }
    
    // Track email submitted
    const isPackPurchase = result.imageId === "pack";
    captureEvent("rainbow_bridge_email_submitted", {
      is_pack_purchase: isPackPurchase,
      pack_type: isPackPurchase ? "2-pack" : null,
      image_id: isPackPurchase ? null : result.imageId,
    });
    
    setStage("checkout");
    setError(null); // Clear any previous errors

    try {
      const isPackPurchase = result.imageId === "pack";
      
      console.log("Creating checkout session:", {
        imageId: isPackPurchase ? null : result.imageId,
        email,
        type: isPackPurchase ? "pack" : "image",
        packType: isPackPurchase ? "2-pack" : undefined,
      });
      
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
      console.log("Checkout API response:", data);

      if (!response.ok) {
        console.error("Checkout API error:", data);
        throw new Error(data.error || "Failed to create checkout session");
      }

      if (!data.checkoutUrl) {
        console.error("No checkout URL in response:", data);
        throw new Error("No checkout URL received from server");
      }

      console.log("Redirecting to:", data.checkoutUrl);
      window.location.href = data.checkoutUrl;
    } catch (err) {
      console.error("Checkout error:", err);
      const errorMessage = err instanceof Error ? err.message : "Failed to redirect to checkout.";
      setError(errorMessage);
      setStage("email"); // Go back to email stage so user can see the error
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
    setPetName("");
    setSecretClickCount(0);
    setSecretActivated(false);
    setUseSecretCredit(false);
    
    const limits = getLimits();
    setGenerationLimits(limits);
    const check = canGenerate(limits);
    setLimitCheck(check);
    setRetryUsed(limits.freeRetriesUsed >= 1);
    
    onReset();
  };

  if (!file) return null;

  const canSubmit = gender && petName.trim().length > 0 && (limitCheck?.allowed ?? false);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 overflow-y-auto">
      {/* Backdrop - Soft heavenly gradient */}
      <div 
        className="absolute inset-0 backdrop-blur-sm" 
        style={{ 
          background: 'linear-gradient(180deg, rgba(255, 255, 255, 0.95) 0%, rgba(248, 246, 243, 0.98) 50%, rgba(245, 240, 235, 0.95) 100%)'
        }}
      />
      
      {/* Content */}
      <div 
        className="relative w-full max-w-2xl rounded-3xl shadow-2xl animate-fade-in-up my-8"
        style={{ 
          backgroundColor: '#FFFFFF',
          border: '1px solid rgba(212, 175, 55, 0.2)',
          boxShadow: '0 25px 50px rgba(0, 0, 0, 0.1), 0 0 100px rgba(212, 175, 55, 0.1)'
        }}
      >
        {/* Close button */}
        <button
          onClick={handleReset}
          className="absolute top-4 right-4 z-10 w-10 h-10 rounded-full flex items-center justify-center shadow-lg transition-colors hover:bg-gray-100"
          style={{ backgroundColor: 'rgba(0, 0, 0, 0.05)', color: '#6B6B6B' }}
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
                style={{ fontFamily: "'Cormorant Garamond', Georgia, serif", color: '#4A4A4A' }}
              >
                Create a Memorial Portrait
              </h3>
              <p style={{ color: '#6B6B6B' }}>
                Honor your beloved companion with a heavenly tribute
              </p>
            </div>

            <div 
              className="relative aspect-square max-w-sm mx-auto rounded-2xl overflow-hidden shadow-lg mb-6 cursor-pointer"
              style={{ border: '2px solid rgba(212, 175, 55, 0.3)' }}
              onClick={() => {
                if (secretActivated) return; // Already activated
                const newCount = secretClickCount + 1;
                setSecretClickCount(newCount);
                
                if (newCount >= 6) {
                  // Grant extra free generation by reducing used count
                  const limits = getLimits();
                  const oldUsed = limits.freeGenerations;
                  limits.freeGenerations = Math.max(0, limits.freeGenerations - 1); // Reduce used count by 1
                  saveLimits(limits);
                  setGenerationLimits(limits);
                  const newCheck = canGenerate(limits);
                  setLimitCheck(newCheck);
                  setSecretActivated(true);
                  setUseSecretCredit(true); // Enable un-watermarked generation for testing
                  
                  // Show subtle feedback
                  console.log(`🎉 Secret activated! Extra free generation granted (un-watermarked). Used count: ${oldUsed} → ${limits.freeGenerations}`);
                  console.log("Can generate:", newCheck.allowed);
                }
              }}
            >
              {previewUrl && (
                <Image
                  src={previewUrl}
                  alt="Your beloved pet"
                  fill
                  className="object-cover"
                  unoptimized
                />
              )}
              {/* Secret click indicator (very subtle) */}
              {secretClickCount > 0 && secretClickCount < 6 && (
                <div className="absolute top-2 right-2 w-2 h-2 rounded-full animate-pulse" style={{ backgroundColor: 'rgba(212, 175, 55, 0.3)' }}></div>
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
                  color: '#DC2626'
                }}
              >
                <p className="text-sm">{error}</p>
              </div>
            )}

            {/* Pet Name Input */}
            <div className="mb-6">
              <label className="block text-center mb-2 text-sm" style={{ color: '#6B6B6B' }}>
                What was your pet&apos;s name?
              </label>
              <input
                type="text"
                value={petName}
                onChange={(e) => setPetName(e.target.value)}
                placeholder="Enter their name"
                maxLength={30}
                className="w-full max-w-xs mx-auto block px-4 py-3 rounded-xl text-center text-lg outline-none transition-all"
                style={{ 
                  backgroundColor: 'rgba(212, 175, 55, 0.05)',
                  border: '2px solid rgba(212, 175, 55, 0.3)',
                  color: '#4A4A4A',
                  fontFamily: "'Cormorant Garamond', Georgia, serif"
                }}
              />
            </div>

            {/* Gender Selection */}
            <div className="mb-6">
              <p className="text-center mb-3 text-sm" style={{ color: '#6B6B6B' }}>
                Select your pet&apos;s gender:
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
                    backgroundColor: gender === "male" ? '#D4AF37' : 'rgba(212, 175, 55, 0.1)',
                    color: gender === "male" ? '#FFFFFF' : '#D4AF37',
                    border: `2px solid ${gender === "male" ? '#D4AF37' : 'rgba(212, 175, 55, 0.3)'}`,
                  }}
                >
                  ♂ Boy
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
                    backgroundColor: gender === "female" ? '#D4AF37' : 'rgba(212, 175, 55, 0.1)',
                    color: gender === "female" ? '#FFFFFF' : '#D4AF37',
                    border: `2px solid ${gender === "female" ? '#D4AF37' : 'rgba(212, 175, 55, 0.3)'}`,
                  }}
                >
                  ♀ Girl
                </button>
              </div>
            </div>

            {/* Generation Limit Display */}
            {limitCheck && !limitCheck.allowed && (
              <div className="mb-4 p-3 rounded-xl text-center text-sm" style={{ 
                backgroundColor: 'rgba(239, 68, 68, 0.1)',
                border: '1px solid rgba(239, 68, 68, 0.3)',
                color: '#DC2626'
              }}>
                <p className="mb-3">{limitCheck.reason}</p>
                <button
                  onClick={() => {
                    setStage("email");
                    setEmailError(null);
                    setResult({ imageId: "pack", previewUrl: "" } as GeneratedResult);
                  }}
                  className="py-2 px-4 rounded-lg font-semibold text-sm transition-all hover:scale-105"
                  style={{ 
                    backgroundColor: '#D4AF37', 
                    color: '#FFFFFF',
                  }}
                >
                  Buy 2-Pack ($15)
                </button>
              </div>
            )}

            <div className="text-center">
              <button 
                onClick={() => handleGenerate(false)} 
                disabled={!canSubmit}
                className={`px-8 py-4 rounded-xl font-semibold text-lg transition-all hover:scale-105 ${!canSubmit ? 'opacity-50 cursor-not-allowed' : ''}`}
                style={{ 
                  background: canSubmit ? 'linear-gradient(135deg, #D4AF37 0%, #E6C866 50%, #D4AF37 100%)' : 'rgba(212, 175, 55, 0.3)',
                  color: '#FFFFFF',
                  boxShadow: canSubmit ? '0 4px 20px rgba(212, 175, 55, 0.3)' : 'none',
                  fontFamily: "'Cormorant Garamond', Georgia, serif",
                }}
              >
                <span className="flex items-center gap-3">
                  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.53 16.122a3 3 0 00-5.78 1.128 2.25 2.25 0 01-2.4 2.245 4.5 4.5 0 008.4-2.245c0-.399-.078-.78-.22-1.128zm0 0a15.998 15.998 0 003.388-1.62m-5.043-.025a15.994 15.994 0 011.622-3.395m3.42 3.42a15.995 15.995 0 004.764-4.648l3.876-5.814a1.151 1.151 0 00-1.597-1.597L14.146 6.32a15.996 15.996 0 00-4.649 4.763m3.42 3.42a6.776 6.776 0 00-3.42-3.42" />
                  </svg>
                  Create Memorial Portrait
                </span>
              </button>
            </div>
          </div>
        )}

        {/* Generating Stage - Heavenly Animation */}
        {stage === "generating" && (
          <div className="p-8 text-center min-h-[500px] flex flex-col items-center justify-center relative overflow-hidden">
            {/* Soft light background */}
            <div className="absolute inset-0 pointer-events-none">
              <div 
                className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-96 h-96 rounded-full blur-3xl opacity-30 animate-pulse"
                style={{ 
                  background: 'radial-gradient(circle, rgba(255, 223, 186, 0.5) 0%, rgba(230, 230, 250, 0.3) 50%, transparent 70%)',
                  animationDuration: '4s' 
                }}
              ></div>
            </div>

            {/* Angelic spinner */}
            <div className="w-24 h-24 mb-10 relative z-10">
              <div 
                className="absolute inset-0 border-2 rounded-full"
                style={{ borderColor: 'rgba(212, 175, 55, 0.2)' }}
              />
              <div 
                className="absolute inset-0 border-2 border-transparent rounded-full animate-spin"
                style={{ borderTopColor: '#D4AF37', borderRightColor: 'rgba(212, 175, 55, 0.5)', animationDuration: '1.5s' }}
              />
              <div 
                className="absolute inset-2 border rounded-full"
                style={{ borderColor: 'rgba(212, 175, 55, 0.15)' }}
              />
              <div 
                className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-3 h-3 rounded-full animate-pulse"
                style={{ backgroundColor: '#D4AF37', animationDuration: '1s' }}
              ></div>
            </div>
            
            {/* Fading heavenly phrase */}
            <div className="h-32 flex items-center justify-center mb-6 relative z-10">
              <p 
                className={`text-2xl sm:text-3xl italic transition-all duration-1000 ease-in-out ${phraseVisible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-2'}`}
                style={{ 
                  fontFamily: "'Cormorant Garamond', Georgia, serif", 
                  color: '#9B8AA0',
                  letterSpacing: '0.05em',
                  fontWeight: 400
                }}
              >
                {HEAVENLY_PHRASES[currentPhrase]}
              </p>
            </div>

            {/* Progress indicator */}
            <div className="w-64 max-w-full mx-auto mb-4 relative z-10">
              <div className="h-1 rounded-full overflow-hidden" style={{ backgroundColor: 'rgba(212, 175, 55, 0.1)' }}>
                <div 
                  className="h-full rounded-full animate-pulse"
                  style={{ 
                    backgroundColor: '#D4AF37',
                    width: '60%',
                    boxShadow: '0 0 10px rgba(212, 175, 55, 0.5)',
                    animationDuration: '2s'
                  }}
                ></div>
              </div>
            </div>

            <p className="text-sm mt-2 relative z-10" style={{ color: '#9B8AA0', fontStyle: 'italic' }}>
              Creating {petName}&apos;s memorial... this may take up to 60 seconds
            </p>
          </div>
        )}

        {/* Result Stage */}
        {stage === "result" && result && result.imageId !== "pack" && (
          <div className="p-4 sm:p-8 max-h-[90vh] overflow-y-auto">
            <div className="flex justify-center mb-2 sm:mb-4">
              <svg className="w-6 h-6 sm:w-8 sm:h-8" style={{ color: '#9B8AA0' }} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
              </svg>
            </div>

            <h3 
              className="text-2xl sm:text-3xl md:text-4xl font-semibold text-center mb-2 sm:mb-4"
              style={{ fontFamily: "'Cormorant Garamond', Georgia, serif", color: '#4A4A4A' }}
            >
              {petName}&apos;s Memorial Portrait
            </h3>

            <div className="text-center mb-2">
              <span className="text-3xl sm:text-4xl font-bold" style={{ color: '#4A4A4A' }}>$9</span>
            </div>

            <div className="text-center mb-3 sm:mb-4">
              <span className="text-sm sm:text-base" style={{ color: '#6B6B6B' }}>Expires in </span>
              <span className="font-mono font-bold text-sm sm:text-base" style={{ color: '#4A4A4A' }}>{timeRemaining}</span>
            </div>

            {result.previewUrl && (
              <div className="relative max-w-[200px] sm:max-w-xs mx-auto mb-4 sm:mb-6 rounded-xl overflow-hidden shadow-lg">
                <div className="relative aspect-square">
                  <Image
                    src={result.previewUrl}
                    alt={`${petName}'s memorial portrait`}
                    fill
                    className="object-cover"
                    unoptimized
                  />
                </div>
              </div>
            )}

            <p className="text-center mb-3 sm:mb-4 text-sm sm:text-base" style={{ color: '#6B6B6B' }}>
              A beautiful tribute to {petName} —<br className="hidden sm:block" />
              <span className="sm:hidden"> </span>forever in your heart.
            </p>

            <div className="space-y-2 sm:space-y-3 mb-4 sm:mb-6">
              <div className="flex items-center gap-2 sm:gap-3 text-sm sm:text-base" style={{ color: '#6B6B6B' }}>
                <svg className="w-4 h-4 sm:w-5 sm:h-5 flex-shrink-0" style={{ color: '#10B981' }} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
                <span>No Watermark</span>
              </div>
              <div className="flex items-center gap-2 sm:gap-3 text-sm sm:text-base" style={{ color: '#6B6B6B' }}>
                <svg className="w-4 h-4 sm:w-5 sm:h-5 flex-shrink-0" style={{ color: '#10B981' }} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
                <span>Instant Download</span>
              </div>
              <div className="flex items-center gap-2 sm:gap-3 text-sm sm:text-base" style={{ color: '#6B6B6B' }}>
                <svg className="w-4 h-4 sm:w-5 sm:h-5 flex-shrink-0" style={{ color: '#10B981' }} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
                <span>High-Resolution</span>
              </div>
            </div>

            <button 
              onClick={handlePurchaseClick}
              className="w-full py-3 sm:py-4 rounded-xl font-semibold text-base sm:text-lg transition-all hover:scale-[1.02] shadow-lg"
              style={{ 
                background: 'linear-gradient(135deg, #D4AF37 0%, #E6C866 50%, #D4AF37 100%)',
                color: '#FFFFFF',
              }}
            >
              Download Memorial Portrait
            </button>

            {error && (
              <div 
                className="mt-4 p-3 rounded-xl text-center text-sm"
                style={{ 
                  backgroundColor: 'rgba(239, 68, 68, 0.1)',
                  border: '1px solid rgba(239, 68, 68, 0.3)',
                  color: '#DC2626'
                }}
              >
                {error}
              </div>
            )}

            {/* Retry section */}
            <div className="mt-6 pt-6 border-t" style={{ borderColor: 'rgba(0,0,0,0.1)' }}>
              {(() => {
                const limits = getLimits();
                const check = canGenerate(limits);
                const hasFreeRetry = limits.freeRetriesUsed < 1;
                const canRetry = check.allowed && hasFreeRetry;
                
                if (canRetry) {
                  return (
                    <button 
                      onClick={handleRetry}
                      className="w-full text-center text-sm py-2 transition-colors hover:opacity-80"
                      style={{ color: '#9B8AA0' }}
                    >
                      🔄 Try Again (1 free retry)
                    </button>
                  );
                } else {
                  return (
                    <div className="text-center">
                      <p className="text-sm mb-3" style={{ color: '#9B8AA0' }}>
                        Want to create more memorial portraits?
                      </p>
                      <button
                        onClick={() => {
                          setStage("email");
                          setEmailError(null);
                          setResult({ imageId: "pack", previewUrl: "" } as GeneratedResult);
                        }}
                        className="py-2 px-4 rounded-lg font-semibold text-sm transition-all hover:scale-105"
                        style={{ 
                          backgroundColor: '#D4AF37', 
                          color: '#FFFFFF',
                        }}
                      >
                        Buy 2-Pack ($15)
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
                style={{ fontFamily: "'Cormorant Garamond', Georgia, serif", color: '#4A4A4A' }}
              >
                Almost There
              </h3>
              <p style={{ color: '#6B6B6B' }}>
                {result?.imageId === "pack" 
                  ? "Enter your email to complete your pack purchase"
                  : `Enter your email to receive ${petName}'s memorial`}
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
                  backgroundColor: 'rgba(212, 175, 55, 0.05)',
                  border: emailError ? '2px solid #DC2626' : '2px solid rgba(212, 175, 55, 0.3)',
                  color: '#4A4A4A'
                }}
                onKeyDown={(e) => e.key === 'Enter' && handleEmailSubmit()}
              />
              
              {emailError && (
                <p className="text-center text-sm mb-4" style={{ color: '#DC2626' }}>
                  {emailError}
                </p>
              )}

              {error && (
                <div 
                  className="mb-4 p-3 rounded-xl text-center text-sm"
                  style={{ 
                    backgroundColor: 'rgba(239, 68, 68, 0.1)',
                    border: '1px solid rgba(239, 68, 68, 0.3)',
                    color: '#DC2626'
                  }}
                >
                  {error}
                </div>
              )}

              <button 
                onClick={handleEmailSubmit}
                className="w-full py-4 rounded-xl font-semibold text-lg transition-all hover:scale-[1.02]"
                style={{ 
                  background: 'linear-gradient(135deg, #D4AF37 0%, #E6C866 50%, #D4AF37 100%)',
                  color: '#FFFFFF',
                }}
              >
                Continue to Payment
              </button>

              <button 
                onClick={() => setStage("result")}
                className="w-full text-center text-sm py-3 mt-3 transition-colors hover:opacity-80"
                style={{ color: '#9B8AA0' }}
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
              <svg className="w-8 h-8" style={{ color: '#DC2626' }} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </div>
            
            <h3 
              className="text-2xl font-semibold mb-2"
              style={{ fontFamily: "'Cormorant Garamond', Georgia, serif", color: '#4A4A4A' }}
            >
              Session Expired
            </h3>
            <p className="mb-6" style={{ color: '#6B6B6B' }}>
              This session has expired. Create a new memorial portrait for {petName}.
            </p>

            <button 
              onClick={handleReset}
              className="px-8 py-4 rounded-xl font-semibold text-lg transition-all hover:scale-105"
              style={{ 
                background: 'linear-gradient(135deg, #D4AF37 0%, #E6C866 50%, #D4AF37 100%)',
                color: '#FFFFFF',
              }}
            >
              Create New Memorial
            </button>
          </div>
        )}

        {/* Checkout Stage */}
        {stage === "checkout" && (
          <div className="p-8 text-center">
            <div 
              className="w-16 h-16 mx-auto mb-6 rounded-full flex items-center justify-center"
              style={{ backgroundColor: 'rgba(212, 175, 55, 0.1)' }}
            >
              <div 
                className="w-8 h-8 rounded-full animate-spin"
                style={{ 
                  borderWidth: '3px',
                  borderStyle: 'solid',
                  borderColor: 'rgba(212, 175, 55, 0.2)',
                  borderTopColor: '#D4AF37'
                }}
              />
            </div>
            <h3 
              className="text-2xl font-semibold mb-2"
              style={{ fontFamily: "'Cormorant Garamond', Georgia, serif", color: '#4A4A4A' }}
            >
              Redirecting to Checkout...
            </h3>
            <p style={{ color: '#6B6B6B' }}>
              Taking you to our secure payment page.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}




