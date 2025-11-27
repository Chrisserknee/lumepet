"use client";

import { useRef, useState, useCallback } from "react";

interface UploadModalProps {
  isOpen: boolean;
  onClose: () => void;
  onFileSelected: (file: File) => void;
}

export default function UploadModal({ isOpen, onClose, onFileSelected }: UploadModalProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const validateFile = (file: File): boolean => {
    setError(null);
    
    // More lenient type checking for Android (sometimes MIME types can be inconsistent)
    const validTypes = ["image/jpeg", "image/jpg", "image/png", "image/webp"];
    const validExtensions = [".jpg", ".jpeg", ".png", ".webp"];
    const fileName = file.name.toLowerCase();
    const fileType = file.type.toLowerCase();
    
    // Check both MIME type and file extension for better Android compatibility
    const isValidType = validTypes.includes(fileType) || 
                       validExtensions.some(ext => fileName.endsWith(ext)) ||
                       fileType.startsWith("image/"); // Fallback: accept any image/* type
    
    if (!isValidType && file.size > 0) {
      setError("Please upload a JPEG, PNG, or WebP image.");
      return false;
    }
    
    if (file.size > 10 * 1024 * 1024) {
      setError("Image must be under 10MB.");
      return false;
    }
    
    if (file.size === 0) {
      setError("File appears to be empty. Please try a different image.");
      return false;
    }
    
    return true;
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      // Check if file was actually selected (not just dialog closed)
      if (file.size === 0 && file.name === '') {
        // User cancelled or permission denied
        return;
      }
      
      if (validateFile(file)) {
        onFileSelected(file);
      }
    }
    
    // Reset input to allow selecting same file again
    if (inputRef.current) {
      inputRef.current.value = '';
    }
  };

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    
    const file = e.dataTransfer.files?.[0];
    if (file && validateFile(file)) {
      onFileSelected(file);
    }
  }, [onFileSelected]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* Backdrop */}
      <div 
        className="absolute inset-0 backdrop-blur-sm animate-fade-in"
        style={{ backgroundColor: 'rgba(0, 0, 0, 0.8)' }}
        onClick={onClose}
      />
      
      {/* Modal */}
      <div 
        className="relative w-full max-w-lg rounded-3xl shadow-2xl animate-fade-in-up p-8"
        style={{ 
          backgroundColor: '#1A1A1A',
          border: '1px solid rgba(197, 165, 114, 0.2)',
          boxShadow: '0 25px 50px rgba(0, 0, 0, 0.5), 0 0 100px rgba(197, 165, 114, 0.1)'
        }}
      >
        {/* Close button */}
        <button
          onClick={onClose}
          className="absolute top-4 right-4 w-10 h-10 rounded-full flex items-center justify-center transition-colors"
          style={{ backgroundColor: 'rgba(255, 255, 255, 0.05)', color: '#B8B2A8' }}
        >
          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>

        {/* Header */}
        <div className="text-center mb-8">
          <div 
            className="w-16 h-16 mx-auto mb-4 rounded-full flex items-center justify-center"
            style={{ backgroundColor: 'rgba(197, 165, 114, 0.1)', border: '1px solid rgba(197, 165, 114, 0.2)' }}
          >
            <svg className="w-8 h-8" style={{ color: '#C5A572' }} fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
            </svg>
          </div>
          <h3 
            className="text-2xl font-semibold mb-2"
            style={{ fontFamily: "'Cormorant Garamond', Georgia, serif", color: '#F0EDE8' }}
          >
            Choose Your Pet Photo
          </h3>
          <p style={{ color: '#B8B2A8' }}>
            Select a clear, well-lit photo of your pet
          </p>
        </div>

        {/* Drop zone */}
        <div
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
          className="relative border-2 border-dashed rounded-2xl p-8 text-center transition-all duration-300 cursor-pointer"
          style={{
            borderColor: isDragging ? '#C5A572' : 'rgba(197, 165, 114, 0.2)',
            backgroundColor: isDragging ? 'rgba(197, 165, 114, 0.05)' : 'rgba(255, 255, 255, 0.02)'
          }}
          onClick={() => {
            try {
              inputRef.current?.click();
            } catch (error) {
              console.error("File input error:", error);
              setError("Unable to access files. Please check your browser permissions or try a different browser.");
            }
          }}
        >
          <input
            ref={inputRef}
            type="file"
            accept="image/*"
            onChange={handleFileChange}
            className="hidden"
          />
          
          <div className="flex flex-col items-center gap-4">
            <div 
              className="w-12 h-12 rounded-full flex items-center justify-center transition-colors"
              style={{ 
                backgroundColor: isDragging ? 'rgba(197, 165, 114, 0.15)' : 'rgba(197, 165, 114, 0.1)',
                color: '#C5A572'
              }}
            >
              <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
              </svg>
            </div>
            
            <div>
              <p className="font-medium" style={{ color: '#F0EDE8' }}>
                {isDragging ? "Drop your photo here" : "Drag & drop your photo here"}
              </p>
              <p className="text-sm mt-1" style={{ color: '#7A756D' }}>
                or click to browse
              </p>
            </div>
            
            <p className="text-xs" style={{ color: '#7A756D' }}>
              JPEG, PNG, or WebP • Max 10MB
            </p>
          </div>
        </div>

        {/* Error message */}
        {error && (
          <div 
            className="mt-4 p-3 rounded-lg text-sm text-center"
            style={{ 
              backgroundColor: 'rgba(239, 68, 68, 0.1)',
              border: '1px solid rgba(239, 68, 68, 0.3)',
              color: '#F87171'
            }}
          >
            {error}
          </div>
        )}

        {/* Tips */}
        <div 
          className="mt-6 p-4 rounded-xl"
          style={{ backgroundColor: 'rgba(197, 165, 114, 0.05)', border: '1px solid rgba(197, 165, 114, 0.1)' }}
        >
          <p className="text-sm" style={{ color: '#B8B2A8' }}>
            <span className="font-medium" style={{ color: '#C5A572' }}>💡 Tip:</span>{" "}
            Front-facing photos with good lighting produce the most majestic Renaissance portraits!
          </p>
        </div>
      </div>
    </div>
  );
}
