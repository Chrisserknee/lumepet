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
    
    // Check file type
    const validTypes = ["image/jpeg", "image/png", "image/webp"];
    if (!validTypes.includes(file.type)) {
      setError("Please upload a JPEG, PNG, or WebP image.");
      return false;
    }
    
    // Check file size (10MB max)
    if (file.size > 10 * 1024 * 1024) {
      setError("Image must be under 10MB.");
      return false;
    }
    
    return true;
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file && validateFile(file)) {
      onFileSelected(file);
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
        style={{ backgroundColor: 'rgba(44, 44, 44, 0.6)' }}
        onClick={onClose}
      />
      
      {/* Modal */}
      <div className="relative w-full max-w-lg bg-white rounded-3xl shadow-2xl animate-fade-in-up p-8">
        {/* Close button */}
        <button
          onClick={onClose}
          className="absolute top-4 right-4 w-10 h-10 rounded-full flex items-center justify-center transition-colors hover:bg-[#FAF7F2]"
          style={{ backgroundColor: '#F5EFE6', color: '#4A4A4A' }}
        >
          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>

        {/* Header */}
        <div className="text-center mb-8">
          <div 
            className="w-16 h-16 mx-auto mb-4 rounded-full flex items-center justify-center"
            style={{ backgroundColor: 'rgba(197, 165, 114, 0.1)' }}
          >
            <svg className="w-8 h-8" style={{ color: '#C5A572' }} fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
            </svg>
          </div>
          <h3 
            className="text-2xl font-semibold mb-2"
            style={{ fontFamily: "'Cormorant Garamond', Georgia, serif", color: '#2C2C2C' }}
          >
            Choose Your Pet Photo
          </h3>
          <p style={{ color: '#4A4A4A' }}>
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
            borderColor: isDragging ? '#722F37' : 'rgba(197, 165, 114, 0.3)',
            backgroundColor: isDragging ? 'rgba(114, 47, 55, 0.05)' : 'transparent'
          }}
          onClick={() => inputRef.current?.click()}
        >
          <input
            ref={inputRef}
            type="file"
            accept="image/jpeg,image/png,image/webp"
            onChange={handleFileChange}
            className="hidden"
          />
          
          <div className="flex flex-col items-center gap-4">
            <div 
              className="w-12 h-12 rounded-full flex items-center justify-center transition-colors"
              style={{ 
                backgroundColor: isDragging ? 'rgba(114, 47, 55, 0.1)' : '#F5EFE6',
                color: isDragging ? '#722F37' : '#8B7355'
              }}
            >
              <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
              </svg>
            </div>
            
            <div>
              <p className="font-medium" style={{ color: '#2C2C2C' }}>
                {isDragging ? "Drop your photo here" : "Drag & drop your photo here"}
              </p>
              <p className="text-sm mt-1" style={{ color: '#8B7355' }}>
                or click to browse
              </p>
            </div>
            
            <p className="text-xs" style={{ color: '#8B7355' }}>
              JPEG, PNG, or WebP • Max 10MB
            </p>
          </div>
        </div>

        {/* Error message */}
        {error && (
          <div 
            className="mt-4 p-3 rounded-lg text-sm text-center"
            style={{ 
              backgroundColor: '#FEF2F2',
              border: '1px solid #FECACA',
              color: '#B91C1C'
            }}
          >
            {error}
          </div>
        )}

        {/* Tips */}
        <div 
          className="mt-6 p-4 rounded-xl"
          style={{ backgroundColor: 'rgba(245, 239, 230, 0.5)' }}
        >
          <p className="text-sm" style={{ color: '#4A4A4A' }}>
            <span className="font-medium" style={{ color: '#2C2C2C' }}>💡 Tip:</span>{" "}
            Front-facing photos with good lighting produce the most majestic Renaissance portraits!
          </p>
        </div>
      </div>
    </div>
  );
}
