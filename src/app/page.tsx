"use client";

import { useState } from "react";
import Hero from "@/components/Hero";
import HowItWorks from "@/components/HowItWorks";
import Gallery from "@/components/Gallery";
import FAQ from "@/components/FAQ";
import Footer from "@/components/Footer";
import UploadModal from "@/components/UploadModal";
import GenerationFlow from "@/components/GenerationFlow";

export default function Home() {
  const [isUploadModalOpen, setIsUploadModalOpen] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);

  const handleUploadClick = () => {
    setIsUploadModalOpen(true);
  };

  const handleFileSelected = (file: File) => {
    setSelectedFile(file);
    setIsUploadModalOpen(false);
  };

  const handleReset = () => {
    setSelectedFile(null);
  };

  return (
    <main className="min-h-screen">
      {/* Hero Section */}
      <Hero onUploadClick={handleUploadClick} />

      {/* How It Works Section */}
      <HowItWorks />

      {/* Sample Gallery Section */}
      <Gallery />

      {/* FAQ Section */}
      <FAQ />

      {/* Footer */}
      <Footer />

      {/* Upload Modal */}
      <UploadModal
        isOpen={isUploadModalOpen}
        onClose={() => setIsUploadModalOpen(false)}
        onFileSelected={handleFileSelected}
      />

      {/* Generation Flow (shows after file selection) */}
      {selectedFile && (
        <GenerationFlow file={selectedFile} onReset={handleReset} />
      )}
    </main>
  );
}
