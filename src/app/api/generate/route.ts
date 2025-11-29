import { NextRequest, NextResponse } from "next/server";
import OpenAI from "openai";
import Replicate from "replicate";
import sharp from "sharp";
import path from "path";
import fs from "fs";
import { v4 as uuidv4 } from "uuid";
import { CONFIG } from "@/lib/config";
import { uploadImage, saveMetadata, incrementPortraitCount } from "@/lib/supabase";
import { checkRateLimit, getClientIP, RATE_LIMITS } from "@/lib/rate-limit";
import { validateImageMagicBytes } from "@/lib/validation";

// Rainbow Bridge memorial quotes - randomly selected for each portrait
const RAINBOW_BRIDGE_QUOTES = [
  "Where there is love, there is never truly goodbye.",
  "Your pawprints may fade from the earth, but they shine forever at the Rainbow Bridge.",
  "Until we meet again at the Bridge, run free, sweet soul.",
  "The Rainbow Bridge is not the end—just a place where love waits.",
  "Every pet who crosses the Bridge carries a piece of our heart with them.",
  "What we shared cannot be lost; it just waits for us in the light.",
  "They walk beside us for a while, but stay in our hearts forever.",
  "Some angels have wings. Some have fur and wait for us at the Bridge.",
  "The hardest part of having a pet is saying goodbye. The most beautiful part is knowing love continues at the Bridge.",
  "One day, the love you shared will guide you back to each other at the Rainbow Bridge.",
];

// Add text overlay to rainbow bridge portrait (pet name and quote)
async function addRainbowBridgeTextOverlay(
  imageBuffer: Buffer,
  petName: string
): Promise<{ buffer: Buffer; quote: string }> {
  console.log("🌈 Adding Rainbow Bridge text overlay for:", petName);
  console.log("   Input buffer size:", imageBuffer.length, "bytes");
  
  // Get random quote
  const quote = RAINBOW_BRIDGE_QUOTES[Math.floor(Math.random() * RAINBOW_BRIDGE_QUOTES.length)];
  console.log("   Selected quote:", quote);
  
  // Get image dimensions
  const metadata = await sharp(imageBuffer).metadata();
  const width = metadata.width || 1024;
  const height = metadata.height || 1024;
  console.log(`   Image dimensions: ${width}x${height}`);
  
  // Create text SVG overlay - using simpler approach for better compatibility
  const fontSize = Math.floor(width * 0.055); // 5.5% of width for name
  const quoteFontSize = Math.floor(width * 0.026); // 2.6% of width for quote
  const padding = Math.floor(width * 0.04); // 4% padding
  
  // Escape special characters for SVG
  const escapedName = petName
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
  const escapedQuote = quote
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
  
  // Split quote into multiple lines if too long
  const maxCharsPerLine = 50;
  const words = escapedQuote.split(' ');
  const quoteLines: string[] = [];
  let currentLine = '';
  
  for (const word of words) {
    if ((currentLine + ' ' + word).trim().length <= maxCharsPerLine) {
      currentLine = (currentLine + ' ' + word).trim();
    } else {
      if (currentLine) quoteLines.push(currentLine);
      currentLine = word;
    }
  }
  if (currentLine) quoteLines.push(currentLine);
  
  // Calculate positions
  const lineHeight = Math.floor(quoteFontSize * 1.5);
  const totalQuoteHeight = quoteLines.length * lineHeight;
  const nameY = height - padding;
  const quoteStartY = nameY - fontSize - 15 - totalQuoteHeight + lineHeight;
  const gradientStartY = quoteStartY - padding * 2;
  const gradientHeight = height - gradientStartY;
  
  // Build quote lines as separate text elements for better compatibility
  const quoteTextElements = quoteLines.map((line, i) => {
    const y = quoteStartY + (i * lineHeight);
    return `<text x="${width / 2}" y="${y}" font-family="serif" font-size="${quoteFontSize}" font-style="italic" fill="#FFFFFF" fill-opacity="0.95" text-anchor="middle" stroke="#000000" stroke-width="1" stroke-opacity="0.3">${line}</text>`;
  }).join('\n      ');
  
  // Simpler SVG without complex filters for better serverless compatibility
  const svgOverlay = `<svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="goldGrad" x1="0%" y1="0%" x2="100%" y2="0%">
      <stop offset="0%" stop-color="#D4AF37"/>
      <stop offset="50%" stop-color="#F5E6A3"/>
      <stop offset="100%" stop-color="#D4AF37"/>
    </linearGradient>
    <linearGradient id="fadeGrad" x1="0%" y1="0%" x2="0%" y2="100%">
      <stop offset="0%" stop-color="#000000" stop-opacity="0"/>
      <stop offset="50%" stop-color="#000000" stop-opacity="0.4"/>
      <stop offset="100%" stop-color="#000000" stop-opacity="0.6"/>
    </linearGradient>
  </defs>
  <rect x="0" y="${gradientStartY}" width="${width}" height="${gradientHeight}" fill="url(#fadeGrad)"/>
  ${quoteTextElements}
  <text x="${width / 2}" y="${nameY}" font-family="serif" font-size="${fontSize}" font-weight="bold" fill="url(#goldGrad)" text-anchor="middle" stroke="#000000" stroke-width="2" stroke-opacity="0.3" letter-spacing="3">${escapedName}</text>
</svg>`;

  console.log("   SVG created, length:", svgOverlay.length, "chars");
  
  try {
    // Convert SVG string to buffer
    const svgBuffer = Buffer.from(svgOverlay, 'utf-8');
    console.log("   SVG buffer size:", svgBuffer.length, "bytes");
    
    // Render SVG to PNG with sharp - use exact dimensions
    const overlayPng = await sharp(svgBuffer, { density: 150 })
      .resize(width, height, { fit: 'fill' })
      .ensureAlpha()
      .png()
      .toBuffer();
    
    console.log("   Overlay PNG buffer size:", overlayPng.length, "bytes");
    
    // Ensure base image has alpha channel
    const baseWithAlpha = await sharp(imageBuffer)
      .ensureAlpha()
      .toBuffer();
    
    // Composite overlay onto base image
    const result = await sharp(baseWithAlpha)
      .composite([{
        input: overlayPng,
        top: 0,
        left: 0,
        blend: 'over'
      }])
      .png({ quality: 100, compressionLevel: 6 })
      .toBuffer();
    
    console.log("   Result buffer size:", result.length, "bytes");
    console.log("✅ Rainbow Bridge text overlay added successfully");
    return { buffer: result, quote };
  } catch (svgError) {
    console.error("❌ SVG rendering failed:", svgError);
    // Return original image if overlay fails
    return { buffer: imageBuffer, quote };
  }
}

// Generate image using FLUX model via Replicate for better pet identity preservation
async function generateWithFlux(
  imageBase64: string,
  prompt: string
): Promise<Buffer> {
  console.log("=== FLUX IMAGE-TO-IMAGE GENERATION ===");
  
  if (!process.env.REPLICATE_API_TOKEN) {
    throw new Error("REPLICATE_API_TOKEN not configured");
  }
  
  const replicate = new Replicate({
    auth: process.env.REPLICATE_API_TOKEN,
  });

  // Convert base64 to data URL if needed
  const imageDataUrl = imageBase64.startsWith("data:") 
    ? imageBase64 
    : `data:image/jpeg;base64,${imageBase64}`;

  // Get prompt strength from environment variable (default: 0.15 = 85% original preserved)
  // Lower values = more faithful to original image
  // Recommended range: 0.10 - 0.25
  const promptStrength = parseFloat(process.env.FLUX_PROMPT_STRENGTH || "0.15");
  
  // Lower guidance scale for subtle style application (default: 2.5)
  const guidanceScale = parseFloat(process.env.FLUX_GUIDANCE_SCALE || "2.5");

  console.log("FLUX parameters:");
  console.log("- Prompt strength:", promptStrength, `(${Math.round((1 - promptStrength) * 100)}% original preserved)`);
  console.log("- Guidance scale:", guidanceScale);
  console.log("- Prompt length:", prompt.length);
  
  try {
    // Use FLUX 1.1 Pro for best quality img2img
    const output = await replicate.run(
      "black-forest-labs/flux-1.1-pro",
      {
        input: {
          prompt: prompt,
          image: imageDataUrl,
          prompt_strength: promptStrength, // 0.15 = 85% original image preserved
          num_inference_steps: 28,
          guidance_scale: guidanceScale, // Lower = more subtle style application
          output_format: "png",
          output_quality: 95,
          safety_tolerance: 5, // More permissive for pet images
          aspect_ratio: "1:1",
        }
      }
    );

    console.log("FLUX generation complete, output type:", typeof output);
    
    // FLUX returns a URL or array of URLs
    let imageUrl: string;
    if (Array.isArray(output)) {
      imageUrl = output[0] as string;
    } else if (typeof output === "string") {
      imageUrl = output;
    } else {
      throw new Error("Unexpected FLUX output format");
    }
    
    console.log("Downloading generated image from:", imageUrl.substring(0, 50) + "...");
    
    // Download the generated image
    const response = await fetch(imageUrl);
    if (!response.ok) {
      throw new Error(`Failed to download FLUX image: ${response.status}`);
    }
    
    const arrayBuffer = await response.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    
    console.log("✅ FLUX generation successful, buffer size:", buffer.length);
    
    return buffer;
  } catch (error) {
    console.error("FLUX generation error:", error);
    throw error;
  }
}

// Generate image using OpenAI img2img (images.edit) for primary generation
// This uses OpenAI's image editing API to transform the pet photo into a late 18th-century aristocratic portrait
async function generateWithOpenAIImg2Img(
  imageBuffer: Buffer,
  prompt: string,
  openai: OpenAI
): Promise<Buffer> {
  console.log("=== OPENAI IMAGE-TO-IMAGE GENERATION ===");
  
  try {
    // Convert buffer to File for OpenAI API
    const uint8Array = new Uint8Array(imageBuffer);
    const imageBlob = new Blob([uint8Array], { type: "image/png" });
    const imageFile = new File([imageBlob], "pet-photo.png", { type: "image/png" });
    
    console.log("OpenAI img2img parameters:");
    console.log("- Model: gpt-image-1");
    console.log("- Prompt length:", prompt.length);
    console.log("- Image size:", imageBuffer.length, "bytes");
    
    const response = await openai.images.edit({
      model: "gpt-image-1",
      image: imageFile,
      prompt: prompt,
      n: 1,
      size: "1024x1024",
    });
    
    const imageData = response.data?.[0];
    if (!imageData) throw new Error("No image generated from OpenAI img2img");
    
    let buffer: Buffer;
    if (imageData.b64_json) {
      buffer = Buffer.from(imageData.b64_json, "base64");
      console.log("✅ OpenAI img2img generation successful (base64), buffer size:", buffer.length);
    } else if (imageData.url) {
      const downloadResponse = await fetch(imageData.url);
      if (!downloadResponse.ok) throw new Error(`Failed to download OpenAI img2img image: ${downloadResponse.status}`);
      buffer = Buffer.from(await downloadResponse.arrayBuffer());
      console.log("✅ OpenAI img2img generation successful (URL), buffer size:", buffer.length);
    } else {
      throw new Error("No image data in OpenAI img2img response");
    }
    
    return buffer;
  } catch (error) {
    console.error("OpenAI img2img generation error:", error);
    throw error;
  }
}

// Generate image using IP-Adapter for maximum pet identity preservation
// IP-Adapter uses the reference image to preserve subject identity while applying style
async function generateWithIPAdapter(
  referenceImageBase64: string,
  prompt: string
): Promise<Buffer> {
  console.log("=== IP-ADAPTER IDENTITY-PRESERVING GENERATION ===");
  
  if (!process.env.REPLICATE_API_TOKEN) {
    throw new Error("REPLICATE_API_TOKEN not configured");
  }
  
  const replicate = new Replicate({
    auth: process.env.REPLICATE_API_TOKEN,
  });

  // Convert base64 to data URL if needed
  const imageDataUrl = referenceImageBase64.startsWith("data:") 
    ? referenceImageBase64 
    : `data:image/jpeg;base64,${referenceImageBase64}`;

  // IP-Adapter scale controls how much the reference image influences the result
  // Higher values (0.7-0.9) = stronger identity preservation
  const ipAdapterScale = parseFloat(process.env.IP_ADAPTER_SCALE || "0.8");
  
  console.log("IP-Adapter parameters:");
  console.log("- IP Adapter Scale:", ipAdapterScale, "(higher = more faithful to reference)");
  console.log("- Prompt length:", prompt.length);
  
  try {
    // Use IP-Adapter SDXL for identity-preserving generation
    const output = await replicate.run(
      "lucataco/ip-adapter-sdxl:49b78367e7928e0ddfcc35a96854eb3c34c35e3d17a92d1ec30d69b88b97c9a1",
      {
        input: {
          prompt: prompt,
          image: imageDataUrl,
          scale: ipAdapterScale,
          negative_prompt: "deformed, distorted, disfigured, poorly drawn, bad anatomy, wrong anatomy, extra limb, missing limb, floating limbs, mutated hands and fingers, disconnected limbs, mutation, mutated, ugly, disgusting, blurry, amputation, human face, human body, humanoid, dark, gloomy, shadowy, muted colors, dull colors",
          num_outputs: 1,
          num_inference_steps: 30,
          guidance_scale: 7.5,
          scheduler: "K_EULER_ANCESTRAL",
        }
      }
    );

    console.log("IP-Adapter generation complete, output type:", typeof output);
    
    // IP-Adapter returns array of URLs
    let imageUrl: string;
    if (Array.isArray(output) && output.length > 0) {
      imageUrl = output[0] as string;
    } else if (typeof output === "string") {
      imageUrl = output;
    } else {
      throw new Error("Unexpected IP-Adapter output format");
    }
    
    console.log("Downloading generated image from:", imageUrl.substring(0, 50) + "...");
    
    // Download the generated image
    const response = await fetch(imageUrl);
    if (!response.ok) {
      throw new Error(`Failed to download IP-Adapter image: ${response.status}`);
    }
    
    const arrayBuffer = await response.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    
    console.log("✅ IP-Adapter generation successful, buffer size:", buffer.length);
    
    return buffer;
  } catch (error) {
    console.error("IP-Adapter generation error:", error);
    throw error;
  }
}

// Apply style transfer using SDXL img2img with very low denoising
// This preserves 90%+ of the pet's identity - only changes surface texture/style
async function applyStyleTransfer(
  contentImageBase64: string
): Promise<Buffer> {
  console.log("=== STYLE TRANSFER (SDXL low-denoise) ===");
  
  if (!process.env.REPLICATE_API_TOKEN) {
    throw new Error("REPLICATE_API_TOKEN not configured");
  }
  
  const replicate = new Replicate({
    auth: process.env.REPLICATE_API_TOKEN,
  });

  // Convert base64 to data URL if needed
  const contentImageUrl = contentImageBase64.startsWith("data:") 
    ? contentImageBase64 
    : `data:image/jpeg;base64,${contentImageBase64}`;

  // Style strength controls how much artistic style is applied
  // 0.12 = 88% original preserved (good for identity + subtle texture)
  // Lower values = more photo-like, higher = more painterly
  const styleStrength = parseFloat(process.env.STYLE_TRANSFER_STRENGTH || "0.12");
  
  console.log("Style Transfer parameters:");
  console.log("- Denoise strength:", styleStrength, `(${Math.round((1 - styleStrength) * 100)}% original preserved)`);
  console.log("- Method: SDXL img2img with oil painting prompt");
  
  try {
    // Use SDXL img2img with very low denoising - essentially style transfer
    // This preserves the pet's structure while adding painterly texture
    const output = await replicate.run(
      "stability-ai/sdxl:7762fd07cf82c948538e41f63f77d685e02b063e37e496e96eefd46c929f9bdc",
      {
        input: {
          image: contentImageUrl,
          prompt: "oil painting portrait, late 18th-century European aristocratic style (1770-1830), Georgian Regency Napoleonic era portraiture, classical fine art, LONG FLOWING visible brushstrokes, elongated brushwork, rich impasto texture, BRIGHT warm golden lighting, BRIGHTER overall illumination, DEEP RICH SATURATED luminous colors, rich jewel tones, SILKY LUSTROUS fabrics with visible sheen, PURE BRIGHT WHITE highlights, SUBTLE LUMINOUS GLOW throughout, gentle radiance and brightness, hand-painted charm with slight imperfections, elegant AIRY NOT gloomy, DEEP RICH SATURATED colors, DARKER TONES retained in shadows and background for depth, SPACIOUS background with DEPTH, luminous glazing technique, BRIGHT and beautiful, BRIGHTER illumination, subject GLOWS with BRIGHT warm light, fabrics GLOW with DEEP RICH color, preserve deep blacks rich and intact, slightly soft edges painterly, Gainsborough Reynolds Vigée Le Brun style",
          negative_prompt: "photograph, photo, realistic, modern, digital art, cartoon, anime, blurry, low quality, watermark, gloomy, overly dark, dark background, muted colors, dull colors, dark colors, short brushstrokes, grey whites, muddy whites, too perfect, clinical, sharp edges everywhere, flat background, medieval, Renaissance, matte fabrics, non-silky textures, human clothing, sleeves, buttons, tailored garments, human-like pose, anthropomorphic, human posture",
          prompt_strength: styleStrength,
          num_inference_steps: 25,
          guidance_scale: 7.5,
          scheduler: "K_EULER",
          refine: "no_refiner",
          high_noise_frac: 0.8,
          num_outputs: 1,
        }
      }
    );

    console.log("Style transfer complete, output type:", typeof output);
    
    // SDXL returns array of FileOutput objects (ReadableStream with url() method)
    let buffer: Buffer;
    
    if (Array.isArray(output) && output.length > 0) {
      const firstOutput = output[0];
      console.log("First output type:", typeof firstOutput);
      console.log("First output constructor:", firstOutput?.constructor?.name);
      
      if (typeof firstOutput === "string") {
        // Direct URL string
        console.log("Downloading from URL string:", firstOutput.substring(0, 80));
        const response = await fetch(firstOutput);
        if (!response.ok) throw new Error(`Failed to download: ${response.status}`);
        buffer = Buffer.from(await response.arrayBuffer());
      } else if (firstOutput && typeof firstOutput === "object") {
        // FileOutput object from Replicate SDK
        // FileOutput has: blob() method, url getter, toString() method
        const outputObj = firstOutput as Record<string, unknown>;
        
        console.log("FileOutput detected, using blob() method");
        
        // Use blob() method - this is the most reliable way to get the data
        if (typeof outputObj.blob === "function") {
          const blob = await (outputObj.blob as () => Promise<Blob>)();
          console.log("Got blob, size:", blob.size, "type:", blob.type);
          buffer = Buffer.from(await blob.arrayBuffer());
        }
        // Fallback: try toString() which should return the URL string
        else if (typeof outputObj.toString === "function") {
          const urlString = outputObj.toString();
          console.log("Using toString() URL:", urlString);
          const response = await fetch(urlString);
          if (!response.ok) throw new Error(`Failed to download: ${response.status}`);
          buffer = Buffer.from(await response.arrayBuffer());
        }
        else {
          throw new Error(`Cannot extract image data from FileOutput`);
        }
      } else {
        throw new Error(`Unexpected output item type: ${typeof firstOutput}`);
      }
    } else if (typeof output === "string") {
      console.log("Downloading from direct URL string");
      const response = await fetch(output);
      if (!response.ok) throw new Error(`Failed to download: ${response.status}`);
      buffer = Buffer.from(await response.arrayBuffer());
    } else {
      throw new Error(`Unexpected SDXL output format: ${typeof output}`);
    }
    
    console.log("✅ Style transfer successful, buffer size:", buffer.length);
    
    return buffer;
  } catch (error) {
    console.error("Style transfer error:", error);
    throw error;
  }
}

// Full Stable Diffusion generation using SDXL img2img
// This uses moderate denoising to create a beautiful late 18th-century aristocratic portrait
// while preserving the pet's key identity features from the reference image
async function generateWithStableDiffusion(
  contentImageBase64: string,
  petDescription: string,
  species: string,
  breed: string
): Promise<Buffer> {
  console.log("=== FULL STABLE DIFFUSION GENERATION (SDXL) ===");
  
  if (!process.env.REPLICATE_API_TOKEN) {
    throw new Error("REPLICATE_API_TOKEN not configured");
  }
  
  const replicate = new Replicate({
    auth: process.env.REPLICATE_API_TOKEN,
  });

  // Convert base64 to data URL if needed
  const contentImageUrl = contentImageBase64.startsWith("data:") 
    ? contentImageBase64 
    : `data:image/jpeg;base64,${contentImageBase64}`;

  // Prompt strength for full SD generation
  // 0.35-0.45 = good balance between creativity and identity preservation
  // Higher = more creative, lower = closer to original
  const promptStrength = parseFloat(process.env.SD_PROMPT_STRENGTH || "0.40");
  const guidanceScale = parseFloat(process.env.SD_GUIDANCE_SCALE || "8.0");
  const numSteps = parseInt(process.env.SD_NUM_STEPS || "30");
  
  console.log("Stable Diffusion parameters:");
  console.log("- Prompt strength:", promptStrength, `(${Math.round((1 - promptStrength) * 100)}% original preserved)`);
  console.log("- Guidance scale:", guidanceScale);
  console.log("- Inference steps:", numSteps);
  console.log("- Species:", species);
  console.log("- Breed:", breed || "Unknown");

  // Extract key identifying features from pet description for the prompt
  const breedInfo = breed ? `${breed} ${species.toLowerCase()}` : species.toLowerCase();
  
  // Create a detailed prompt that describes both the pet and the desired style
  const sdPrompt = `A majestic royal late 18th-century European aristocratic oil painting portrait of a ${breedInfo}, seated regally on a luxurious velvet cushion. Georgian/Regency/Napoleonic era style (1770-1830).

SUBJECT - THIS SPECIFIC ${species.toUpperCase()}:
The ${species.toLowerCase()} has the exact features from the reference image - preserve the face structure, eye color, markings, and unique characteristics.

STYLE AND SETTING:
- Classical Flemish/Dutch Golden Age oil painting style
- Rich impasto brushstrokes, visible paint texture
- Luminous glazing technique with depth
- Warm golden late 18th-century portrait lighting from the left
- Elegant palace interior background with rich colors

ROYAL ATTIRE:
- Dainty delicate velvet cloak in sapphire blue, ruby red, cream, or white - soft plush velvety texture
- Gold thread embroidery patterns throughout
- Ermine-style white fur trim with black spots
- Dainty delicate fabric with soft plush velvety texture draped delicately over body
- Dainty antique jewelry: gem clusters (ruby, emerald, amethyst, topaz), gold filigree, small pearls, multi-chain necklaces
- NOT modern jewelry, NOT simple beads

COMPOSITION:
- Subject LOW and CENTRAL on velvet throne cushion
- Body ¾ view, head forward - late 18th-century aristocratic portrait posture
- Front paws visible, resting on cushion
- Cloak draped over body + cushion with realistic folds
- Medium close-up: chest to top of head
- Noble, dignified expression

BACKGROUND:
- Deep dark gradient: black → espresso → deep olive (soft painterly, NOT uniform)
- Large draped fabrics behind: heavy velvet/brocade in burgundy, crimson, deep purple
- Visible folds, shadows, texture
- ZERO modern elements - late 18th-century aristocratic portrait studio only

LIGHTING (18th-19th Century Style):
- Single warm key light from upper left/front
- Soft dramatic chiaroscuro: deep shadows, strong highlights
- Sculpted fur texture, background falls into darkness
- Warm golden rim highlights around pet

RENDERING:
- TRUE OIL PAINTING: LONG FLOWING visible brush strokes, thick layered pigments
- ELONGATED brushwork - longer strokes for painterly effect
- BRIGHT highlights throughout
- BRIGHTER overall illumination - well-lit subject
- High detail but NOT photorealistic
- Late 18th-century aristocratic portrait feel (1770-1830)
- NOT digital, NOT airbrushed, NOT smooth
- NOT Renaissance - specifically Georgian/Regency/Napoleonic era`;

  const negativePrompt = `photograph, photo, photorealistic, modern, digital art, cartoon, anime, 3d render, 
blurry, low quality, watermark, text, logo, 
human body, humanoid, anthropomorphic, bipedal, 
wrong species, different animal, 
dark, gloomy, shadowy, muddy colors, muted colors, dull colors,
deformed, disfigured, bad anatomy, wrong proportions,
ugly, duplicate, extra limbs, missing limbs`;
  
  console.log("Generating with SDXL...");
  
  try {
    const output = await replicate.run(
      "stability-ai/sdxl:7762fd07cf82c948538e41f63f77d685e02b063e37e496e96eefd46c929f9bdc",
      {
        input: {
          image: contentImageUrl,
          prompt: sdPrompt,
          negative_prompt: negativePrompt,
          prompt_strength: promptStrength,
          num_inference_steps: numSteps,
          guidance_scale: guidanceScale,
          scheduler: "K_EULER_ANCESTRAL",
          refine: "expert_ensemble_refiner",
          high_noise_frac: 0.8,
          num_outputs: 1,
          width: 1024,
          height: 1024,
        }
      }
    );

    console.log("SDXL generation complete, output type:", typeof output);
    
    // Handle FileOutput from Replicate
    let buffer: Buffer;
    
    if (Array.isArray(output) && output.length > 0) {
      const firstOutput = output[0];
      console.log("First output type:", typeof firstOutput);
      
      if (typeof firstOutput === "string") {
        console.log("Downloading from URL string");
        const response = await fetch(firstOutput);
        if (!response.ok) throw new Error(`Failed to download: ${response.status}`);
        buffer = Buffer.from(await response.arrayBuffer());
      } else if (firstOutput && typeof firstOutput === "object") {
        const outputObj = firstOutput as Record<string, unknown>;
        
        if (typeof outputObj.blob === "function") {
          const blob = await (outputObj.blob as () => Promise<Blob>)();
          console.log("Got blob, size:", blob.size);
          buffer = Buffer.from(await blob.arrayBuffer());
        } else if (typeof outputObj.toString === "function") {
          const urlString = outputObj.toString();
          const response = await fetch(urlString);
          if (!response.ok) throw new Error(`Failed to download: ${response.status}`);
          buffer = Buffer.from(await response.arrayBuffer());
        } else {
          throw new Error("Cannot extract image data from FileOutput");
        }
      } else {
        throw new Error(`Unexpected output type: ${typeof firstOutput}`);
      }
    } else if (typeof output === "string") {
      const response = await fetch(output);
      if (!response.ok) throw new Error(`Failed to download: ${response.status}`);
      buffer = Buffer.from(await response.arrayBuffer());
    } else {
      throw new Error(`Unexpected SDXL output format: ${typeof output}`);
    }
    
    console.log("✅ Stable Diffusion generation successful, buffer size:", buffer.length);
    
    return buffer;
  } catch (error) {
    console.error("Stable Diffusion generation error:", error);
    throw error;
  }
}

// ============================================
// COMPOSITE APPROACH FUNCTIONS
// ============================================

// Step 1: Segment pet from background using rembg
async function segmentPet(imageBase64: string): Promise<Buffer> {
  console.log("=== PET SEGMENTATION (rembg) ===");
  
  if (!process.env.REPLICATE_API_TOKEN) {
    throw new Error("REPLICATE_API_TOKEN not configured");
  }
  
  const replicate = new Replicate({
    auth: process.env.REPLICATE_API_TOKEN,
  });

  const imageDataUrl = imageBase64.startsWith("data:") 
    ? imageBase64 
    : `data:image/jpeg;base64,${imageBase64}`;

  console.log("Removing background from pet image...");
  
  try {
    const output = await replicate.run(
      "cjwbw/rembg:fb8af171cfa1616ddcf1242c093f9c46bcada5ad4cf6f2fbe8b81b330ec5c003",
      {
        input: {
          image: imageDataUrl,
        }
      }
    );

    console.log("Segmentation complete, output type:", typeof output);
    
    // Handle FileOutput from Replicate
    let buffer: Buffer;
    if (typeof output === "string") {
      const response = await fetch(output);
      if (!response.ok) throw new Error(`Failed to download: ${response.status}`);
      buffer = Buffer.from(await response.arrayBuffer());
    } else if (output && typeof output === "object") {
      const outputObj = output as Record<string, unknown>;
      if (typeof outputObj.blob === "function") {
        const blob = await (outputObj.blob as () => Promise<Blob>)();
        buffer = Buffer.from(await blob.arrayBuffer());
      } else {
        throw new Error("Cannot extract segmented image");
      }
    } else {
      throw new Error("Unexpected rembg output format");
    }
    
    console.log("✅ Pet segmented successfully, buffer size:", buffer.length);
    return buffer;
  } catch (error) {
    console.error("Segmentation error:", error);
    throw error;
  }
}

// Step 2: Generate Victorian royal scene (background + elements, no pet)
async function generateRoyalScene(
  species: string,
  openai: OpenAI
): Promise<Buffer> {
  console.log("=== GENERATING ROYAL SCENE ===");
  
  const scenePrompt = `A luxurious Victorian royal portrait scene with bright vibrant jewel tones and ornate details, empty and ready for a pet to be placed.

SCENE ELEMENTS:
- Plush BRIGHT TEAL/TURQUOISE velvet cushion with intricate GOLD EMBROIDERY and gold tassel, positioned in foreground
- Sumptuous BRIGHT DEEP RED/BURGUNDY velvet royal robe with ornate GOLD FILIGREE trim, draped elegantly
- Dainty delicate PEARL NECKLACE with small bright colorful gemstone pendant (vibrant rubies, emeralds, sapphires), displayed on cushion
- Cream/ivory RUFFLED LACE COLLAR (Elizabethan ruff style) ready to frame a pet's neck
- BRIGHT DEEP GREEN velvet curtain draped on one side for depth
- Rich warm BRIGHT GOLDEN-OLIVE background with soft painterly gradient, luminous and vibrant

COLORS (IMPORTANT):
- Bright vibrant teal/turquoise velvet cushion
- Bright deep burgundy/crimson red robe  
- Gold embroidery and trim throughout
- Bright deep forest green curtain accent
- Warm bright golden background
- Cream/ivory lace details
- Pearl white and bright colorful gemstone jewelry (vibrant rubies, emeralds, sapphires)
- Preserve deep blacks rich and intact where they exist

LIGHTING:
- Bright warm, golden late 18th-century portrait lighting
- Luminous and vibrant, not harsh
- Gentle shadows for depth
- Rich, bright, and inviting atmosphere

STYLE:
- Classical Flemish/Dutch Golden Age oil painting
- Visible brushstrokes and rich impasto texture
- Museum masterpiece quality
- Ornate, luxurious, regal

IMPORTANT: 
- Leave clear space in center for a pet to be composited
- No animals or people in the scene
- The cushion and robe should be arranged for a pet to appear seated/resting
- Make it look like a real late 18th-century aristocratic portrait painting (Gainsborough, Reynolds, Vigée Le Brun style)`;

  console.log("Generating scene with GPT-Image-1...");
  
  try {
    const response = await openai.images.generate({
      model: "gpt-image-1",
      prompt: scenePrompt,
      n: 1,
      size: "1024x1024",
      quality: "high",
    });
    
    const imageData = response.data?.[0];
    if (!imageData) throw new Error("No scene generated");
    
    let buffer: Buffer;
    if (imageData.b64_json) {
      buffer = Buffer.from(imageData.b64_json, "base64");
    } else if (imageData.url) {
      const downloadResponse = await fetch(imageData.url);
      if (!downloadResponse.ok) throw new Error(`Failed to download: ${downloadResponse.status}`);
      buffer = Buffer.from(await downloadResponse.arrayBuffer());
    } else {
      throw new Error("No image data in response");
    }
    
    console.log("✅ Royal scene generated, buffer size:", buffer.length);
    return buffer;
  } catch (error) {
    console.error("Scene generation error:", error);
    throw error;
  }
}

// Step 3: Composite segmented pet onto royal scene
async function compositePortrait(
  petBuffer: Buffer,
  sceneBuffer: Buffer
): Promise<Buffer> {
  console.log("=== COMPOSITING PORTRAIT ===");
  
  try {
    // Get dimensions of the scene
    const sceneMetadata = await sharp(sceneBuffer).metadata();
    const sceneWidth = sceneMetadata.width || 1024;
    const sceneHeight = sceneMetadata.height || 1024;
    
    // Resize pet to fit nicely on the scene (about 70% of scene height)
    const targetPetHeight = Math.round(sceneHeight * 0.70);
    const resizedPet = await sharp(petBuffer)
      .resize({ height: targetPetHeight, fit: "inside" })
      .toBuffer();
    
    // Get resized pet dimensions
    const petMetadata = await sharp(resizedPet).metadata();
    const petWidth = petMetadata.width || 500;
    const petHeight = petMetadata.height || 700;
    
    // Position pet in center-bottom of scene (on the cushion)
    const leftOffset = Math.round((sceneWidth - petWidth) / 2);
    const topOffset = Math.round(sceneHeight - petHeight - (sceneHeight * 0.08)); // Slightly above bottom
    
    console.log(`Compositing pet (${petWidth}x${petHeight}) onto scene (${sceneWidth}x${sceneHeight})`);
    console.log(`Position: left=${leftOffset}, top=${topOffset}`);
    
    // Composite the pet onto the scene
    const composited = await sharp(sceneBuffer)
      .composite([
        {
          input: resizedPet,
          left: leftOffset,
          top: topOffset,
          blend: "over",
        }
      ])
      .png()
      .toBuffer();
    
    console.log("✅ Portrait composited successfully, buffer size:", composited.length);
    return composited;
  } catch (error) {
    console.error("Compositing error:", error);
    throw error;
  }
}

// Step 4: Apply final harmonization pass to blend pet with scene
async function harmonizePortrait(
  compositedBuffer: Buffer,
  species: string,
  openai: OpenAI
): Promise<Buffer> {
  console.log("=== HARMONIZING PORTRAIT ===");
  
  try {
    // Convert buffer to File for OpenAI
    const uint8Array = new Uint8Array(compositedBuffer);
    const imageBlob = new Blob([uint8Array], { type: "image/png" });
    const imageFile = new File([imageBlob], "composited.png", { type: "image/png" });
    
    const harmonizePrompt = `Add ONLY a soft shadow beneath the ${species} and very slightly blend the hard edges where the ${species} meets the background. 

CRITICAL - DO NOT MODIFY THE ${species.toUpperCase()} AT ALL:
- Do NOT change the ${species}'s appearance in any way
- Do NOT add texture or painterly effects to the ${species}
- Do NOT alter the ${species}'s colors, fur, face, or body
- The ${species} must remain EXACTLY as it appears - completely unchanged

ONLY ALLOWED CHANGES:
- Add a soft, subtle drop shadow under the ${species}
- Slightly soften the hard edge where ${species} meets background (1-2 pixels only)
- That's it - nothing else

Keep the image bright and beautiful. Museum-quality finish.`;

    const response = await openai.images.edit({
      model: "gpt-image-1",
      image: imageFile,
      prompt: harmonizePrompt,
      n: 1,
      size: "1024x1024",
    });
    
    const imageData = response.data?.[0];
    if (!imageData) throw new Error("No harmonized image");
    
    let buffer: Buffer;
    if (imageData.b64_json) {
      buffer = Buffer.from(imageData.b64_json, "base64");
    } else if (imageData.url) {
      const downloadResponse = await fetch(imageData.url);
      if (!downloadResponse.ok) throw new Error(`Failed to download: ${downloadResponse.status}`);
      buffer = Buffer.from(await downloadResponse.arrayBuffer());
    } else {
      throw new Error("No image data in response");
    }
    
    console.log("✅ Portrait harmonized successfully, buffer size:", buffer.length);
    return buffer;
  } catch (error) {
    console.error("Harmonization error:", error);
    throw error;
  }
}

// Main composite generation function
async function generateCompositePortrait(
  petImageBase64: string,
  species: string,
  openai: OpenAI
): Promise<Buffer> {
  console.log("=== COMPOSITE PORTRAIT GENERATION ===");
  console.log("Step 1/4: Segmenting pet from background...");
  
  // Step 1: Segment pet
  const segmentedPet = await segmentPet(petImageBase64);
  
  console.log("Step 2/4: Generating royal scene...");
  
  // Step 2: Generate royal scene
  const royalScene = await generateRoyalScene(species, openai);
  
  console.log("Step 3/4: Compositing pet onto scene...");
  
  // Step 3: Composite
  const composited = await compositePortrait(segmentedPet, royalScene);
  
  console.log("Step 4/4: Harmonizing final portrait...");
  
  // Step 4: Harmonize (optional - disabled by default to preserve pet appearance)
  // Set ENABLE_HARMONIZATION=true to enable edge blending
  const enableHarmonization = process.env.ENABLE_HARMONIZATION === "true";
  
  if (enableHarmonization) {
    const harmonized = await harmonizePortrait(composited, species, openai);
    console.log("✅ Composite portrait complete (with harmonization)");
    return harmonized;
  } else {
    console.log("✅ Composite portrait complete (no harmonization)");
    return composited;
  }
}

// Analyze facial structure and breed-specific characteristics for high-fidelity portrait generation
async function analyzeFacialStructure(
  openai: OpenAI,
  imageBase64: string,
  species: string,
  breed: string
): Promise<string> {
  console.log("=== FACIAL STRUCTURE ANALYSIS ===");
  
  const facialAnalysisResponse = await openai.chat.completions.create({
    model: "gpt-4o",
    messages: [
      {
        role: "user",
        content: [
          {
            type: "text",
            text: `You are an expert in animal anatomy and breed identification. Analyze this ${species}'s facial structure with EXTREME PRECISION for portrait generation.

BREED CONTEXT: ${breed || "Unknown breed - analyze visible characteristics"}

Provide a DETAILED facial structure analysis:

=== SKULL AND HEAD STRUCTURE ===
1. SKULL TYPE: Classify as:
   - Brachycephalic (flat-faced, shortened skull - e.g., Pugs, Persians, Bulldogs)
   - Mesocephalic (medium proportions - e.g., Labradors, most cats)
   - Dolichocephalic (long, narrow skull - e.g., Greyhounds, Collies, Siamese)

2. HEAD SHAPE: Describe the overall silhouette
   - Round, oval, square, wedge-shaped, or heart-shaped?
   - Width-to-length ratio estimate (e.g., "head is 80% as wide as it is long")

=== SNOUT/MUZZLE ANALYSIS ===
3. SNOUT LENGTH: Estimate as percentage of total head length
   - Very short (<15% of head), Short (15-25%), Medium (25-35%), Long (35-45%), Very long (>45%)
   
4. SNOUT WIDTH: Relative to head width
   - Narrow, medium, or wide? Estimate percentage.
   
5. SNOUT SHAPE: Profile view characteristics
   - Straight, slightly curved, strongly curved, flat/pushed in?
   - Nose tip position: upturned, straight, or downturned?

=== EYE ANALYSIS ===
6. EYE SHAPE: Round, almond, oval, or triangular?

7. EYE SIZE: Relative to face
   - Small (<8% of face width), Medium (8-12%), Large (12-18%), Very large (>18%)
   
8. EYE POSITION: 
   - Set high, medium, or low on face?
   - Wide-set, normal, or close-set? Estimate distance between eyes relative to eye width.
   - Forward-facing or more lateral?

9. EYE ANGLE: Horizontal, slightly upward slant, or downward slant?

=== EAR ANALYSIS ===
10. EAR SIZE: Relative to head
    - Small (<15% of head height), Medium (15-25%), Large (25-40%), Very large (>40%)

11. EAR SHAPE: Pointed, rounded, folded, rose, button, drop/pendant?

12. EAR SET: High on head, medium, or low? Wide apart or close together?

13. EAR CARRIAGE: Erect, semi-erect, folded, or drooping?

=== DISTINCTIVE FEATURES ===
14. UNIQUE STRUCTURAL FEATURES:
    - Any asymmetry in facial features?
    - Distinctive bone structure visible?
    - Unusual proportions compared to breed standard?

15. BREED-SPECIFIC MARKERS:
    - What features confirm this breed identification?
    - Any mixed-breed indicators?

=== NUMERIC SUMMARY ===
Provide these estimates:
- Snout-to-skull ratio: X%
- Eye spacing (in eye-widths apart): X
- Ear-to-head ratio: X%
- Face width-to-height ratio: X:1
- Forehead prominence: Low/Medium/High

Format your response as structured data that can be used to ensure the generated portrait matches this EXACT facial structure.`,
          },
          {
            type: "image_url",
            image_url: {
              url: `data:image/jpeg;base64,${imageBase64}`,
              detail: "high",
            },
          },
        ],
      },
    ],
    max_tokens: 2000, // Increased for enhanced detailed facial structure analysis
    temperature: 0.05, // Very low temperature for extremely consistent, precise analysis
  });
  
  const facialAnalysis = facialAnalysisResponse.choices[0]?.message?.content || "";
  console.log("Facial structure analysis length:", facialAnalysis.length);
  console.log("Facial analysis preview:", facialAnalysis.substring(0, 300));
  
  return facialAnalysis;
}

// Compare original pet photo with generated portrait and create refinement prompt
// Enhanced with identity-focused corrections for maximum recognizability
async function compareAndRefine(
  openai: OpenAI,
  originalImageBuffer: Buffer,
  generatedImageBuffer: Buffer,
  originalDescription: string,
  species: string
): Promise<string> {
  console.log("=== STAGE 2: Identity-Focused Comparison and Refinement ===");
  
  // Process both images for vision API
  const processedOriginal = await sharp(originalImageBuffer)
    .resize(1024, 1024, { fit: "inside", withoutEnlargement: true })
    .jpeg({ quality: 95 })
    .toBuffer();
  
  const processedGenerated = await sharp(generatedImageBuffer)
    .resize(1024, 1024, { fit: "inside", withoutEnlargement: true })
    .jpeg({ quality: 95 })
    .toBuffer();
  
  const originalBase64 = processedOriginal.toString("base64");
  const generatedBase64 = processedGenerated.toString("base64");
  
  // Use GPT-4o vision to compare both images with identity focus
  const comparisonResponse = await openai.chat.completions.create({
    model: "gpt-4o",
    messages: [
      {
        role: "user",
        content: [
          {
            type: "text",
            text: `You are an expert at pet identification comparing two images. Your goal is to ensure the generated portrait is INSTANTLY RECOGNIZABLE as the original pet.

IMAGE 1 (LEFT): The ORIGINAL pet photo - the TRUE reference.
IMAGE 2 (RIGHT): The GENERATED portrait - must be refined to match.

ORIGINAL DESCRIPTION: ${originalDescription}

=== IDENTITY VERIFICATION (MOST CRITICAL) ===
Ask yourself: "Would the pet's owner instantly recognize this as THEIR pet?"

Rate these identity factors (1-10 each):
1. FACIAL STRUCTURE MATCH: Does the skull shape, snout length, and overall head structure match?
2. EYE RECOGNITION: Are the eyes the right shape, size, spacing, color, and expression?
3. EAR ACCURACY: Do the ears match in shape, size, position, and carriage?
4. DISTINCTIVE FEATURES: Are ALL unique markings in their EXACT locations?
5. OVERALL "LOOK": Does the portrait capture this pet's unique personality/expression?

=== DETAILED COMPARISON ===

1. SKULL AND FACIAL STRUCTURE (Critical for recognition):
   - Is the skull type correct? (brachycephalic/flat vs mesocephalic/medium vs dolichocephalic/long)
   - Is the snout-to-head ratio accurate?
   - Does the forehead prominence match?
   - Is the jaw/chin shape correct?
   - List EVERY structural discrepancy

2. EYES (The window to recognition):
   - Eye SHAPE: Round, almond, oval - is it exact?
   - Eye SIZE relative to face - is it accurate?
   - Eye SPACING - are they the right distance apart?
   - Eye COLOR - is the exact shade matched?
   - Eye EXPRESSION - does it capture the pet's "look"?
   - Eye ANGLE - horizontal or slanted?

3. EARS (Major recognition factor):
   - Shape accuracy (pointed, rounded, folded, etc.)
   - Size relative to head
   - Position on head (high, medium, low)
   - Carriage (erect, semi-erect, drooping)
   - Any asymmetry preserved?

4. MARKINGS AND PATTERNS:
   - Is EVERY marking present?
   - Is each marking in the EXACT correct location?
   - Are marking shapes accurate?
   - Are marking colors correct?
   - List EVERY missing, misplaced, or incorrect marking

5. COAT AND COLORING:
   - Is the base color the exact right shade?
   - Are color transitions/gradients preserved?
   - Is the coat texture represented correctly?
   - Are any color areas wrong?

=== IDENTITY MATCH SCORE ===
Overall Identity Match: X/10
(8+ = Owner would recognize immediately)
(6-7 = Somewhat recognizable but issues)
(<6 = Would not be recognized as this specific pet)

=== PRIORITY CORRECTIONS FOR IDENTITY ===
List corrections in order of impact on recognizability:

CRITICAL (Must fix - affects instant recognition):
1. [Issue]: [Specific fix required]
2. [Issue]: [Specific fix required]

IMPORTANT (Should fix - improves accuracy):
3. [Issue]: [Specific fix required]
4. [Issue]: [Specific fix required]

MINOR (Nice to fix - fine details):
5. [Issue]: [Specific fix required]

=== REFINED GENERATION PROMPT ===
Write a corrected description that addresses ALL issues, emphasizing:
- Exact facial structure corrections needed
- Precise eye, ear, and marking corrections
- Any proportion adjustments required

The refined prompt should result in a portrait the owner would INSTANTLY recognize as their beloved pet.`,
          },
          {
            type: "image_url",
            image_url: {
              url: `data:image/jpeg;base64,${originalBase64}`,
              detail: "high",
            },
          },
          {
            type: "image_url",
            image_url: {
              url: `data:image/jpeg;base64,${generatedBase64}`,
              detail: "high",
            },
          },
        ],
      },
    ],
    max_tokens: 2000, // Increased for more detailed analysis
    temperature: 0.2, // Lower temperature for consistent, precise analysis
  });
  
  const refinementPrompt = comparisonResponse.choices[0]?.message?.content || "";
  console.log("Identity-focused refinement analysis complete");
  console.log("Refinement prompt length:", refinementPrompt.length);
  console.log("Refinement preview:", refinementPrompt.substring(0, 400));
  
  return refinementPrompt;
}

// Create watermarked version of image with LumePet logo
async function createWatermarkedImage(inputBuffer: Buffer): Promise<Buffer> {
  const image = sharp(inputBuffer);
  const metadata = await image.metadata();
  const width = metadata.width || 1024;
  const height = metadata.height || 1024;

  // Load LumePet logo from public folder
  const fs = await import("fs");
  const path = await import("path");
  const logoPath = path.join(process.cwd(), "public", "samples", "LumePet2.png");
  
  let logoBuffer: Buffer;
  try {
    logoBuffer = fs.readFileSync(logoPath);
  } catch (error) {
    console.error("Failed to load logo, using text watermark:", error);
    // Fallback to text watermark if logo not found
  const watermarkSvg = `
    <svg width="${width}" height="${height}">
      <defs>
        <pattern id="watermark" width="400" height="200" patternUnits="userSpaceOnUse" patternTransform="rotate(-30)">
          <text x="0" y="100" 
                font-family="Georgia, serif" 
                font-size="28" 
                font-weight="bold"
                  fill="rgba(255,255,255,0.5)"
                text-anchor="start">
              LUMEPET – PREVIEW ONLY
          </text>
        </pattern>
      </defs>
      <rect width="100%" height="100%" fill="url(#watermark)"/>
      </svg>
    `;
    return await sharp(inputBuffer)
      .composite([
        {
          input: Buffer.from(watermarkSvg),
          top: 0,
          left: 0,
        },
      ])
      .png()
      .toBuffer();
  }

  // Get logo dimensions and resize it to be more intrusive
  const logoImage = sharp(logoBuffer);
  const logoMetadata = await logoImage.metadata();
  const logoWidth = logoMetadata.width || 200;
  const logoHeight = logoMetadata.height || 200;
  
  // Make logo larger - about 35% of image width for more intrusiveness
  const watermarkSize = Math.max(width, height) * 0.35;
  const watermarkAspectRatio = logoWidth / logoHeight;
  const watermarkWidth = watermarkSize;
  const watermarkHeight = watermarkSize / watermarkAspectRatio;

  // Convert logo to base64 for SVG embedding
  const logoBase64 = logoBuffer.toString("base64");
  const logoMimeType = logoMetadata.format === "png" ? "image/png" : "image/jpeg";

  // Create SVG with logo watermarks around the edges (NOT in center to keep pet face visible)
  // Watermarks are WHITE and BRIGHT for better visibility
  const watermarkSvg = `
    <svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <!-- White filter to make logo appear white and bright -->
        <filter id="whiteBright" x="-50%" y="-50%" width="200%" height="200%">
          <feColorMatrix type="matrix" values="
            0 0 0 0 1
            0 0 0 0 1
            0 0 0 0 1
            0 0 0 1 0"/>
          <feComponentTransfer>
            <feFuncA type="linear" slope="1.2"/>
          </feComponentTransfer>
        </filter>
      </defs>
      <!-- NO CENTER WATERMARK - keep pet's face clearly visible -->
      
      <!-- Top-left corner (larger, 65% opacity - brighter white) -->
      <image 
        x="${Math.round(width * 0.05)}" 
        y="${Math.round(height * 0.05)}" 
        width="${Math.round(watermarkWidth * 0.6)}" 
        height="${Math.round(watermarkHeight * 0.6)}" 
        href="data:${logoMimeType};base64,${logoBase64}"
        opacity="0.65"
        filter="url(#whiteBright)"
      />
      <!-- Top-right corner (larger, 65% opacity - brighter white) -->
      <image 
        x="${Math.round(width * 0.95 - watermarkWidth * 0.6)}" 
        y="${Math.round(height * 0.05)}" 
        width="${Math.round(watermarkWidth * 0.6)}" 
        height="${Math.round(watermarkHeight * 0.6)}" 
        href="data:${logoMimeType};base64,${logoBase64}"
        opacity="0.65"
        filter="url(#whiteBright)"
      />
      <!-- Bottom-left corner (larger, 65% opacity - brighter white) -->
      <image 
        x="${Math.round(width * 0.05)}" 
        y="${Math.round(height * 0.95 - watermarkHeight * 0.6)}" 
        width="${Math.round(watermarkWidth * 0.6)}" 
        height="${Math.round(watermarkHeight * 0.6)}" 
        href="data:${logoMimeType};base64,${logoBase64}"
        opacity="0.65"
        filter="url(#whiteBright)"
      />
      <!-- Bottom-right corner (larger, 65% opacity - brighter white) -->
      <image 
        x="${Math.round(width * 0.95 - watermarkWidth * 0.6)}" 
        y="${Math.round(height * 0.95 - watermarkHeight * 0.6)}" 
        width="${Math.round(watermarkWidth * 0.6)}" 
        height="${Math.round(watermarkHeight * 0.6)}" 
        href="data:${logoMimeType};base64,${logoBase64}"
        opacity="0.65"
        filter="url(#whiteBright)"
      />
      <!-- Top center (medium, 60% opacity - brighter white) -->
      <image 
        x="${Math.round((width - watermarkWidth * 0.5) / 2)}" 
        y="${Math.round(height * 0.02)}" 
        width="${Math.round(watermarkWidth * 0.5)}" 
        height="${Math.round(watermarkHeight * 0.5)}" 
        href="data:${logoMimeType};base64,${logoBase64}"
        opacity="0.6"
        filter="url(#whiteBright)"
      />
      <!-- Bottom center (medium, 60% opacity - brighter white) -->
      <image 
        x="${Math.round((width - watermarkWidth * 0.5) / 2)}" 
        y="${Math.round(height * 0.98 - watermarkHeight * 0.5)}" 
        width="${Math.round(watermarkWidth * 0.5)}" 
        height="${Math.round(watermarkHeight * 0.5)}" 
        href="data:${logoMimeType};base64,${logoBase64}"
        opacity="0.6"
        filter="url(#whiteBright)"
      />
      <!-- Left edge upper (55% opacity - brighter white) -->
      <image 
        x="${Math.round(width * 0.02)}" 
        y="${Math.round(height * 0.30)}" 
        width="${Math.round(watermarkWidth * 0.45)}" 
        height="${Math.round(watermarkHeight * 0.45)}" 
        href="data:${logoMimeType};base64,${logoBase64}"
        opacity="0.55"
        filter="url(#whiteBright)"
      />
      <!-- Left edge lower (55% opacity - brighter white) -->
      <image 
        x="${Math.round(width * 0.02)}" 
        y="${Math.round(height * 0.60)}" 
        width="${Math.round(watermarkWidth * 0.45)}" 
        height="${Math.round(watermarkHeight * 0.45)}" 
        href="data:${logoMimeType};base64,${logoBase64}"
        opacity="0.55"
        filter="url(#whiteBright)"
      />
      <!-- Right edge upper (55% opacity - brighter white) -->
      <image 
        x="${Math.round(width * 0.98 - watermarkWidth * 0.45)}" 
        y="${Math.round(height * 0.30)}" 
        width="${Math.round(watermarkWidth * 0.45)}" 
        height="${Math.round(watermarkHeight * 0.45)}" 
        href="data:${logoMimeType};base64,${logoBase64}"
        opacity="0.55"
        filter="url(#whiteBright)"
      />
      <!-- Right edge lower (55% opacity - brighter white) -->
      <image 
        x="${Math.round(width * 0.98 - watermarkWidth * 0.45)}" 
        y="${Math.round(height * 0.60)}" 
        width="${Math.round(watermarkWidth * 0.45)}" 
        height="${Math.round(watermarkHeight * 0.45)}" 
        href="data:${logoMimeType};base64,${logoBase64}"
        opacity="0.55"
        filter="url(#whiteBright)"
      />
    </svg>
  `;

  return await sharp(inputBuffer)
    .composite([
      {
        input: Buffer.from(watermarkSvg),
        top: 0,
        left: 0,
        blend: "over",
      },
    ])
    .png()
    .toBuffer();
}

export async function POST(request: NextRequest) {
  const userAgent = request.headers.get("user-agent") || "unknown";
  const isMobile = /Mobile|Android|iPhone|iPad/i.test(userAgent);
  const clientIP = getClientIP(request);
  
  console.log("=== Generate API called ===");
  console.log("Client IP:", clientIP);
  console.log("User agent:", userAgent);
  console.log("Is mobile:", isMobile);
  
  // Rate limiting - prevent abuse
  const rateLimit = checkRateLimit(`generate:${clientIP}`, RATE_LIMITS.generate);
  if (!rateLimit.allowed) {
    console.warn(`Rate limit exceeded for IP: ${clientIP}`);
    return NextResponse.json(
      { error: "Too many requests. Please wait a moment before trying again." },
      { 
        status: 429,
        headers: {
          "Retry-After": Math.ceil(rateLimit.resetIn / 1000).toString(),
          "X-RateLimit-Remaining": "0",
        }
      }
    );
  }
  
  try {
    // Check for API keys
    if (!process.env.OPENAI_API_KEY) {
      return NextResponse.json(
        { error: "OpenAI API key not configured" },
        { status: 500 }
      );
    }

    // Check for Supabase config
    if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
      return NextResponse.json(
        { error: "Storage not configured" },
        { status: 500 }
      );
    }

    // Initialize OpenAI client
    const openai = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY,
    });
    
    console.log("Using OpenAI for vision (GPT-4o) and image generation (DALL-E 3)");

    // Parse form data
    const formData = await request.formData();
    const imageFile = formData.get("image") as File | null;
    const gender = formData.get("gender") as string | null;
    const usePackCredit = formData.get("usePackCredit") === "true";
    const useSecretCredit = formData.get("useSecretCredit") === "true";
    const style = formData.get("style") as string | null; // "rainbow-bridge" for memorial portraits
    const petName = formData.get("petName") as string | null; // Pet's name for rainbow bridge portraits
    
    const isRainbowBridge = style === "rainbow-bridge";
    
    // Log Rainbow Bridge parameters
    if (style || petName) {
      console.log(`🌈 Form data - style: "${style}", petName: "${petName}", isRainbowBridge: ${isRainbowBridge}`);
    }

    if (!imageFile) {
      return NextResponse.json(
        { error: "No image file provided" },
        { status: 400 }
      );
    }

    // Validate file type
    if (!CONFIG.ACCEPTED_TYPES.includes(imageFile.type)) {
      return NextResponse.json(
        { error: "Invalid file type. Please upload JPEG, PNG, or WebP." },
        { status: 400 }
      );
    }

    // Validate file size (Vercel has 4.5MB body limit)
    if (imageFile.size > CONFIG.MAX_FILE_SIZE) {
      return NextResponse.json(
        { error: `File too large. Maximum size is ${CONFIG.MAX_FILE_SIZE / 1024 / 1024}MB. Please compress your image or use a smaller file.` },
        { status: 400 }
      );
    }

    // Convert file to buffer
    const bytes = await imageFile.arrayBuffer();
    const buffer = Buffer.from(bytes);
    
    // SECURITY: Validate file is actually an image by checking magic bytes
    // This prevents uploading malicious files with fake MIME types
    const isValidImage = await validateImageMagicBytes(bytes);
    if (!isValidImage) {
      console.warn(`Invalid image magic bytes from IP: ${clientIP}`);
      return NextResponse.json(
        { error: "Invalid image file. Please upload a valid JPEG, PNG, or WebP image." },
        { status: 400 }
      );
    }

    // Generate unique ID for this generation
    const imageId = uuidv4();

    // Process original image for vision API - improved preprocessing for better detail
    // Use higher resolution and preserve full image without cropping
    const processedImage = await sharp(buffer)
      .resize(1024, 1024, { fit: "inside", withoutEnlargement: true })
      .jpeg({ quality: 95 })
      .toBuffer();

    const base64Image = processedImage.toString("base64");

    // Step 1: Use GPT-4o to analyze pet - focus on UNIQUE distinguishing features
    console.log("Analyzing pet with GPT-4o...");
    
    const visionResponse = await openai.chat.completions.create({
      model: "gpt-4o",
      messages: [
        {
          role: "user",
          content: [
            {
              type: "text",
              text: `CRITICAL FIRST STEP: Identify the SPECIES. Start your response with EXACTLY one of these: [CAT] or [DOG] or [RABBIT]

SPECIES IDENTIFICATION RULES (MUST BE ACCURATE):
- DOG: Has a prominent snout/muzzle, canine facial structure, typically larger/wider nose, wider head, canine teeth visible, dog-like facial proportions
- CAT: Has whiskers, smaller triangular nose, more compact facial structure, feline features, cat-like eye shape, smaller nose relative to face, cat-like facial proportions
- RABBIT: Long ears, round body, no snout like a dog, different facial structure

LOOK CAREFULLY: Examine the facial structure, ear shape, nose size, and overall anatomy to determine if this is a DOG or CAT.

KEY DIFFERENCES:
- CATS have smaller noses, more compact faces, whiskers, triangular ears, feline eye shape
- DOGS have larger noses/snouts, wider heads, canine facial structure, dog-like proportions

Start your response with [DOG] or [CAT] or [RABBIT] - this is CRITICAL for accurate generation. Be very careful - misidentifying a cat as a dog or vice versa will cause major errors.

=== BREED IDENTIFICATION (CRITICAL) ===
Identify the specific breed with confidence level:
- State the breed name (or "Mixed breed" if uncertain)
- Confidence: HIGH (90%+), MEDIUM (70-90%), or LOW (<70%)
- If mixed breed, list the likely breeds in the mix
- Note breed-specific characteristics visible (e.g., "Labrador traits: otter tail, broad head, kind eyes")

=== AGE/STAGE ===
- PUPPY (young dog): Large eyes relative to face, rounder features, smaller proportions
- KITTEN (young cat): Large eyes relative to face, rounder features, youthful appearance
- ADULT: Fully developed features, mature proportions

=== SECTION 1 - IDENTITY MARKERS (MOST CRITICAL) ===
List 10-15 distinctive features that would allow someone to RECOGNIZE this specific pet:
- Asymmetrical features with EXACT locations (e.g., "slightly larger left ear")
- Unique markings with PRECISE positions (e.g., "white blaze starting 2cm above nose, widening to 3cm between eyes")
- The pet's characteristic expression or "look in their eyes"
- Any scars, notches, or physical quirks
- What makes THIS pet different from other pets of the same breed
- Subtle facial asymmetries (e.g., "left eye slightly more almond-shaped than right")
- Unique whisker patterns or arrangements
- Individual hair patterns or cowlicks
- Specific texture variations in fur (e.g., "slightly wavier fur on left side")
- Any distinctive body proportions or postural characteristics

=== SECTION 2 - FACIAL STRUCTURE (NUMERIC PROPORTIONS - ENHANCED) ===
Provide SPECIFIC measurements and ratios with FINER DETAIL:
- Skull type: Brachycephalic (flat-faced), Mesocephalic (medium), or Dolichocephalic (long)
- Face width-to-height ratio (e.g., "face is 85% as wide as tall")
- Snout length as percentage of head (e.g., "snout is 30% of total head length")
- Snout width relative to head width (e.g., "snout is 45% of head width at widest point")
- Snout taper: Does it narrow significantly toward nose or maintain width?
- Eye shape: Round, Almond, Oval, or Triangular - describe subtle variations
- Eye size relative to face (e.g., "eyes take up 15% of face width each")
- Eye depth: Deep-set, flush, or prominent?
- Eye spacing in eye-widths (e.g., "eyes are 1.5 eye-widths apart")
- Eye angle: Horizontal, upward slant, or downward slant - measure angle if visible
- Eye color: Use PRECISE color (amber honey, dark chocolate, bright emerald, ice blue, heterochromia details)
- Eye color variations: Any flecks, rings, or gradients within the iris?
- Nose size relative to face width (e.g., "nose is 20% of face width")
- Nose shape: Round, oval, triangular, or square?
- Nose color and any unique patterns or pigmentation variations
- Muzzle length category: Very short (<15%), Short (15-25%), Medium (25-35%), Long (>35%)
- Muzzle shape: Square, rounded, pointed, or tapered?
- Cheekbone prominence: High, medium, or low?
- Jawline definition: Strong, moderate, or soft?

=== SECTION 3 - EARS (WITH PROPORTIONS - ENHANCED) ===
- Ear size as percentage of head height (e.g., "ears are 35% of head height")
- Ear width relative to length (e.g., "ears are 60% as wide as tall")
- Ear shape: Pointed, Rounded, Rose, Button, Drop/Pendant, Folded - describe exact shape
- Ear tip shape: Sharp point, rounded, or slightly folded?
- Ear set: High/Medium/Low on head - measure distance from top of head
- Ear spacing: Close together, Normal, Wide apart - measure relative to head width
- Ear carriage: Erect, Semi-erect, Folded forward, Drooping - describe exact angle
- Ear thickness: Thin, medium, or thick?
- Any ear markings, color variations, or asymmetry
- Inner ear color and texture
- Ear hair patterns or tufts

=== SECTION 4 - COLORING (EXHAUSTIVE DETAIL - ENHANCED) ===
Primary coat color using EXACT shade comparisons:
- Base color (e.g., "rich mahogany brown like polished wood" not just "brown")
- Secondary colors and their precise locations
- Color gradients with transition points (e.g., "darkens from golden to russet starting at shoulder line")
- Subtle color shifts or undertones (e.g., "warm golden undertones in sunlight")
- Color intensity variations across body (e.g., "darker on back, lighter on chest")

Markings map - describe EVERY marking with FINER DETAIL:
- Location using clock positions for face (e.g., "white patch at 2 o'clock position on left cheek")
- Size estimates (e.g., "approximately 2cm diameter")
- Shape description (e.g., "irregular star shape", "perfect circle", "lightning bolt")
- Edge definition: Sharp edges, soft/blended edges, or feathered edges?
- Any symmetry or asymmetry in markings
- Marking color intensity: Pure white, cream, or off-white?
- Multiple layers of markings: Base color, secondary markings, tertiary accents

Pattern type if applicable:
- Tabby (mackerel, classic, spotted, ticked) - describe stripe/spot width and spacing
- Bicolor, tricolor, tortoiseshell, calico - describe color distribution percentages
- Merle, brindle, sable, tuxedo - describe pattern density and distribution
- Specific pattern placement with measurements
- Pattern clarity: Bold and distinct, or subtle and blended?

=== SECTION 5 - FUR/COAT TEXTURE (ENHANCED) ===
- Length: Very short, Short, Medium, Long, Very long - measure longest hairs
- Texture: Sleek/smooth, Soft/plush, Fluffy, Wiry, Curly, Double-coat
- Density: Sparse, Normal, Dense, Very thick - estimate hairs per square cm
- Shine level: Matte, Slight sheen, Glossy - describe reflectivity
- Any variations in different body areas (e.g., "longer fur around neck forming mane")
- Fur direction patterns: Whorls, cowlicks, or directional flow
- Undercoat presence: None, light, moderate, or heavy
- Guard hair characteristics: Coarse, fine, or mixed?
- Fur texture variations: Smooth on head vs. coarser on back?

=== SECTION 6 - EXPRESSION AND PERSONALITY (ENHANCED) ===
- Eye expression: Alert, Soft, Intense, Playful, Wise, Mischievous
- Eye openness: Wide open, half-closed, or squinting?
- Resting face characteristics
- Any distinctive "look" this pet has
- The emotional quality that makes this pet recognizable
- Facial muscle tension: Relaxed, alert, or tense?
- Mouth expression: Neutral, slight smile, or serious?
- Overall demeanor: Confident, shy, curious, or regal?

Format: "[SPECIES] AGE: [stage]. BREED: [breed] (CONFIDENCE: [level]). IDENTITY MARKERS: [7-10 specific features]. FACIAL STRUCTURE: [numeric proportions]. EARS: [detailed ear description]. COLORING: [exhaustive color mapping]. FUR: [texture details]. EXPRESSION: [personality indicators]."`,
            },
            {
              type: "image_url",
              image_url: {
                url: `data:image/jpeg;base64,${base64Image}`,
                detail: "high",
              },
            },
          ],
        },
      ],
      max_tokens: 2500, // Significantly increased for enhanced detailed analysis
      temperature: 0.1, // Lower temperature for even more consistent, precise descriptions
    });

    let petDescription = visionResponse.choices[0]?.message?.content || "a beloved pet";

    // Log vision analysis output for debugging
    console.log("=== VISION ANALYSIS OUTPUT ===");
    console.log("Raw description length:", petDescription.length);
    console.log("Raw description preview:", petDescription.substring(0, 200));
    
    // Validate description quality
    if (petDescription.length < 100) {
      console.warn("⚠️ Vision description is too short - may lack detail");
    }
    if (!petDescription.toLowerCase().includes("unique") && !petDescription.toLowerCase().includes("distinctive")) {
      console.warn("⚠️ Vision description may lack unique features");
    }

    // Sanitize description to remove problematic characters that might fail Supabase pattern validation
    // Keep most characters but remove emojis and problematic unicode
    petDescription = petDescription
      .replace(/[\u{1F300}-\u{1F9FF}]/gu, '') // Remove emojis
      .replace(/[\u{2600}-\u{26FF}]/gu, '') // Remove misc symbols  
      .replace(/[\u{2700}-\u{27BF}]/gu, '') // Remove dingbats
      .replace(/[^\x20-\x7E\u00A0-\uFFFF]/g, '') // Keep printable ASCII + common unicode (but not control chars)
      .replace(/\s+/g, ' ') // Normalize multiple spaces to single space
      .replace(/\n{3,}/g, '\n\n') // Limit consecutive newlines
      .trim();

    // Ensure we have a valid description (not empty after sanitization)
    if (!petDescription || petDescription.length < 10) {
      petDescription = "a beloved pet with distinctive features";
      console.warn("Pet description was too short after sanitization, using fallback");
    }

    // Log for debugging
    console.log("Pet description from vision (sanitized):", petDescription);
    console.log("Description length:", petDescription.length);
    console.log("Description quality check:", {
      hasUniqueFeatures: petDescription.toLowerCase().includes("unique") || petDescription.toLowerCase().includes("distinctive"),
      hasColorDetails: petDescription.toLowerCase().includes("color") || petDescription.toLowerCase().includes("marking"),
      hasFaceDetails: petDescription.toLowerCase().includes("face") || petDescription.toLowerCase().includes("eye"),
      length: petDescription.length,
    });

    // Extract species from the description (format: [DOG], [CAT], etc.)
    const speciesMatch = petDescription.match(/\[(DOG|CAT|RABBIT|BIRD|HAMSTER|GUINEA PIG|FERRET|HORSE|PET)\]/i);
    let species = speciesMatch ? speciesMatch[1].toUpperCase() : "";
    
    // Extract age/stage from the description
    const ageMatch = petDescription.match(/AGE:\s*(PUPPY|KITTEN|ADULT)/i);
    let ageStage = ageMatch ? ageMatch[1].toUpperCase() : "";
    
    // Fallback: search for age keywords if explicit format wasn't found
    if (!ageStage) {
      const lowerDesc = petDescription.toLowerCase();
      if (lowerDesc.includes("puppy") || lowerDesc.includes("young dog")) {
        ageStage = "PUPPY";
      } else if (lowerDesc.includes("kitten") || lowerDesc.includes("young cat")) {
        ageStage = "KITTEN";
      } else {
        ageStage = "ADULT"; // Default to adult if not specified
      }
    }
    
    // Fallback: search for species keywords if bracket format wasn't found
    if (!species) {
      const lowerDesc = petDescription.toLowerCase();
      if (lowerDesc.includes("dog") || lowerDesc.includes("puppy") || lowerDesc.includes("canine")) {
        species = "DOG";
      } else if (lowerDesc.includes("cat") || lowerDesc.includes("kitten") || lowerDesc.includes("feline")) {
        species = "CAT";
      } else if (lowerDesc.includes("rabbit") || lowerDesc.includes("bunny")) {
        species = "RABBIT";
      } else if (lowerDesc.includes("bird") || lowerDesc.includes("parrot") || lowerDesc.includes("parakeet")) {
        species = "BIRD";
      } else if (lowerDesc.includes("hamster") || lowerDesc.includes("guinea pig") || lowerDesc.includes("ferret")) {
        species = "SMALL PET";
      } else {
        species = "PET";
      }
    }
    
    // CRITICAL: Double-check species detection by analyzing the image description more carefully
    // Count explicit mentions of each species
    const lowerDesc = petDescription.toLowerCase();
    const dogMentions = (lowerDesc.match(/\bdog\b|\bpuppy\b|\bcanine\b/g) || []).length;
    const catMentions = (lowerDesc.match(/\bcat\b|\bkitten\b|\bfeline\b/g) || []).length;
    
    // If there's a clear mismatch, correct it
    if (dogMentions > catMentions && species === "CAT") {
      console.warn("⚠️ CORRECTING: Description has more dog mentions but species was CAT. Changing to DOG.");
      species = "DOG";
    } else if (catMentions > dogMentions && species === "DOG") {
      console.warn("⚠️ CORRECTING: Description has more cat mentions but species was DOG. Changing to CAT.");
      species = "CAT";
    }
    
    // ALWAYS validate species with a direct image check - this is critical for accuracy
    console.log("🔍 Performing mandatory species validation check...");
    try {
      const speciesValidationCheck = await openai.chat.completions.create({
        model: "gpt-4o",
        messages: [
          {
            role: "user",
            content: [
              {
                type: "text",
                text: `Look at this image VERY CAREFULLY. Is this a DOG or a CAT?

CRITICAL - Examine these features:
- NOSE SIZE: Dogs have larger/wider noses (snouts). Cats have smaller, more compact noses.
- FACIAL STRUCTURE: Dogs have wider heads and canine facial proportions. Cats have more compact, triangular faces.
- EARS: Both can have pointed ears, but look at the overall facial structure.
- WHISKERS: Cats typically have more prominent whiskers.
- EYE SHAPE: Cats often have more almond-shaped eyes. Dogs have rounder eyes.

Key differences:
- DOG: Larger snout/muzzle, wider head, canine facial structure, dog-like proportions
- CAT: Smaller nose, compact face, triangular face shape, feline features, prominent whiskers

Respond with ONLY one word: DOG or CAT

Be VERY careful - misidentifying will cause major errors.`,
              },
              {
                type: "image_url",
                image_url: {
                  url: `data:image/jpeg;base64,${base64Image}`,
                  detail: "high", // Use high detail for better accuracy
                },
              },
            ],
          },
        ],
        max_tokens: 10,
        temperature: 0, // Use deterministic response
      });
      const validatedSpecies = speciesValidationCheck.choices[0]?.message?.content?.trim().toUpperCase();
      
      // CRITICAL: Always use validation result if it's clear
      if (validatedSpecies === "DOG" || validatedSpecies === "CAT") {
        // If validation differs from initial detection, ALWAYS use validation result
        if (validatedSpecies !== species) {
          console.warn(`⚠️ SPECIES MISMATCH: Initial detection was ${species}, but validation says ${validatedSpecies}. FORCING validated species.`);
          species = validatedSpecies;
        } else {
          console.log(`✅ Species validation confirmed: ${species}`);
        }
      } else if (!species || species === "PET") {
        // If we don't have a species yet, use validation result
        if (validatedSpecies === "DOG" || validatedSpecies === "CAT") {
          species = validatedSpecies;
          console.log(`✅ Species set via validation: ${species}`);
        }
      }
      
      // CRITICAL: If validation failed but we have a species, log warning but continue
      if (!validatedSpecies || (validatedSpecies !== "DOG" && validatedSpecies !== "CAT")) {
        console.warn(`⚠️ Species validation returned unclear result: "${validatedSpecies}". Using detected species: ${species}`);
      }
    } catch (validationError) {
      console.error("⚠️ Species validation check failed:", validationError);
      // If validation fails, we MUST have a species from initial detection
      if (!species || species === "PET") {
        throw new Error("CRITICAL: Unable to determine pet species. Please ensure the image clearly shows a cat or dog.");
      }
      console.warn(`⚠️ Continuing with detected species: ${species} (validation failed)`);
    }
    
    // CRITICAL: Final check - we MUST have a valid species
    if (!species || species === "PET") {
      throw new Error("CRITICAL: Unable to determine pet species. Please ensure the image clearly shows a cat or dog.");
    }
    
    // CRITICAL: Ensure species is either DOG or CAT (most common)
    if (species !== "DOG" && species !== "CAT") {
      console.warn(`⚠️ Unusual species detected: ${species}. Proceeding but may need special handling.`);
    }
    
    console.log("Detected age/stage:", ageStage);
    if (ageStage === "PUPPY" || ageStage === "KITTEN") {
      console.log(`✨ Age preservation enabled: Will preserve ${ageStage} features`);
    }
    
    // Create STRONGER negative species instruction with multiple repetitions
    const notSpecies = species === "DOG" 
      ? "CRITICAL: This is a DOG. DO NOT generate a cat, kitten, or any feline. This MUST be a DOG. Generate ONLY a DOG." 
      : species === "CAT" 
      ? "CRITICAL: This is a CAT. DO NOT generate a dog, puppy, or any canine. This MUST be a CAT. Generate ONLY a CAT."
      : `CRITICAL: This is a ${species}. DO NOT generate any other animal. Generate ONLY a ${species}.`;
    
    console.log("=== SPECIES DETECTION ===");
    console.log("Detected species:", species);
    console.log("Species enforcement:", notSpecies);
    console.log("Pet description analysis:", {
      containsDog: petDescription.toLowerCase().includes("dog") || petDescription.toLowerCase().includes("puppy"),
      containsCat: petDescription.toLowerCase().includes("cat") || petDescription.toLowerCase().includes("kitten"),
      dogMentions,
      catMentions,
      speciesMatch: speciesMatch ? speciesMatch[1] : "none",
    });
    
    // Verify species detection is correct
    if (species === "DOG" && (petDescription.toLowerCase().includes("cat") || petDescription.toLowerCase().includes("kitten"))) {
      console.warn("⚠️ WARNING: Species mismatch detected! Description mentions cat but species is DOG");
    }
    if (species === "CAT" && (petDescription.toLowerCase().includes("dog") || petDescription.toLowerCase().includes("puppy"))) {
      console.warn("⚠️ WARNING: Species mismatch detected! Description mentions dog but species is CAT");
    }

    // Extract breed from description for facial structure analysis
    const breedMatch = petDescription.match(/BREED:\s*([^.(\n]+)/i);
    const detectedBreed = breedMatch ? breedMatch[1].trim() : "";
    console.log("Detected breed:", detectedBreed || "Unknown");

    // Step 1.5: Perform detailed facial structure analysis for high-fidelity generation
    console.log("🔬 Performing detailed facial structure analysis...");
    let facialStructureAnalysis = "";
    try {
      facialStructureAnalysis = await analyzeFacialStructure(openai, base64Image, species, detectedBreed);
      console.log("✅ Facial structure analysis complete");
    } catch (facialError) {
      console.error("⚠️ Facial structure analysis failed, continuing without it:", facialError);
      // Continue without facial analysis - the main description should still work
    }

    // Randomize elements for unique paintings - elegant palette: light blues, blacks, whites
    const cushions = [
      "ORNATE SOFT SAGE GREEN velvet throne cushion with RICH intricate gold embroidery patterns, BRIGHT decorative gold tassels at corners, detailed ornate gold threadwork, luxurious thick velvet texture, visible fabric folds, elaborate decorative details",
      "ORNATE SOFT PERIWINKLE BLUE velvet throne cushion with RICH intricate gold thread embroidery, BRIGHT decorative gold tassels, detailed ornate patterns, rich plush texture, elaborate ornate details",
      "ORNATE WARM TAUPE velvet throne cushion with RICH elegant gold embroidery patterns, BRIGHT gold tassels, detailed ornate gold threadwork, sumptuous velvety texture, elaborate classical styling",
      "ORNATE MUTED EMERALD GREEN velvet cushion with RICH gold braided trim, BRIGHT ornate gold tassels, detailed intricate patterns, thick luxurious fabric, elaborate visible texture",
      "ORNATE DUSTY BLUE velvet throne cushion with RICH antique gold embroidery, BRIGHT decorative gold tassels at corners, detailed ornate patterns, plush royal texture, elaborate details",
      "ORNATE SOFT GREY velvet cushion with RICH gold thread patterns, BRIGHT ornate gold tassels, detailed intricate embroidery, thick velvety surface, elaborate classical details",
      "ORNATE SAGE GREEN velvet throne cushion with RICH intricate gold embroidery, BRIGHT gold tassels, detailed ornate patterns, luxurious deep pile, elaborate ornate styling",
      "ORNATE SOFT SAPPHIRE velvet cushion with RICH antique gold decorative embroidery, BRIGHT gold tassels, detailed ornate patterns, rich thick velvet, elaborate sumptuous texture"
    ];
    
    const robes = [
      "DAINTY SOFT SAPPHIRE BLUE velvet cloak with delicate gold thread embroidery patterns, soft plush velvety texture with visible nap, ermine-style PURE BRIGHT WHITE fur trim with black spots, draped delicately over body, dainty refined luxurious velvet fabric with realistic folds",
      "DAINTY DUSTY ROSE velvet cloak with intricate delicate gold thread patterns, soft plush velvety texture, PURE WHITE ermine fur trim, dainty refined fabric draped over body and cushion, visible velvety texture and soft folds",
      "DAINTY CREAM WHITE velvet cloak with delicate ornate gold embroidery, soft plush velvety texture with visible nap, ermine-style PURE BRIGHT WHITE fur trim with black spots, dainty sumptuous velvet fabric draped naturally",
      "DAINTY SOFT PERIWINKLE BLUE velvet cloak with delicate gold thread detailing, soft plush velvety texture, PURE BRIGHT WHITE ermine fur trim, dainty refined velvet fabric with dramatic draping, realistic soft folds",
      "DAINTY MUTED BURGUNDY velvet cloak with delicate antique gold thread patterns, soft plush velvety texture with visible nap, PURE WHITE ermine fur trim, dainty luxurious velvet fabric draped over body",
      "DAINTY IVORY CREAM velvet cloak with delicate elaborate gold embroidery, soft plush velvety texture, ermine-style PURE BRIGHT WHITE fur trim, dainty refined velvet fabric with natural draping and soft folds",
      "DAINTY SAGE GREEN velvet cloak with delicate gold thread embroidery, soft plush velvety texture with visible nap, PURE BRIGHT WHITE ermine fur trim with black spots, dainty sumptuous velvet fabric draped dramatically",
      "DAINTY DUSTY CORAL velvet cloak with delicate intricate gold patterns, soft plush velvety texture, PURE BRIGHT WHITE ermine fur trim, dainty luxurious velvet fabric with realistic soft draping"
    ];
    
    const jewelry = [
      "dainty antique multi-chain gold necklace with multiple gem clusters (ruby, emerald, amethyst, topaz), gold filigree details, small pearls interspersed, NOT modern jewelry",
      "delicate antique gold necklace with gem clusters (ruby red, emerald green, amethyst purple), intricate gold filigree, tiny pearls, multiple fine chains, classical styling",
      "ornate antique gold multi-chain necklace with small gem clusters (topaz, ruby, emerald), delicate gold filigree work, tiny pearl accents, dainty and refined",
      "elegant antique gold necklace with multiple gem clusters (amethyst, ruby, topaz, emerald), gold filigree details, small pearls, layered fine chains, NOT simple beads",
      "dainty gold filigree necklace with gem clusters (ruby, emerald, amethyst), multiple delicate chains, tiny pearl accents, antique classical styling",
      "refined antique gold multi-chain necklace with small gem clusters (topaz yellow, ruby red, emerald green, amethyst purple), intricate filigree, tiny pearls",
      "delicate antique gold necklace with ornate gem clusters (ruby, amethyst, emerald, topaz), gold filigree work, small pearls, multiple fine chains, dainty and elegant",
      "ornate antique gold necklace with multiple gem clusters (emerald, ruby, topaz, amethyst), delicate gold filigree, tiny pearl accents, NOT modern, classical jewelry"
    ];
    
    const backgrounds = [
      "SPACIOUS grand chamber background with DEPTH, soft gradient from WARM TAUPE to SOFT BROWN with atmospheric perspective, large DUSTY ROSE velvet drapery hanging behind with visible folds, BRIGHTER pastel-leaning tones, elegant and airy NOT gloomy",
      "DEEP SPACIOUS room background with sense of grand chamber, warm SOFT TAUPE to MUTED CARAMEL gradient, heavy SOFT BURGUNDY velvet brocade draped behind with rich texture, BRIGHTER pastel tones, elegant airy atmosphere",
      "grand chamber with ATMOSPHERIC DEPTH, soft WARM BEIGE to TAUPE painterly gradient, large MUTED MAUVE velvet fabric draped behind with visible texture, BRIGHTER color scheme, spacious elegant feel",
      "SPACIOUS background with sense of DEPTH, soft gradient from WARM TAUPE to SOFT OLIVE with atmospheric perspective, heavy SAGE GREEN brocade drapery behind with visible folds, BRIGHTER pastel-leaning jewel tones, airy classical style",
      "DEEP BLACK background creating STRONG CONTRAST with fabrics and jewelry, rich DEEP BLACK velvet drapery hanging behind, dramatic contrast with pet's natural colors and bright fabrics, elegant dramatic atmosphere",
      "ATMOSPHERIC DEPTH background suggesting grand chamber, soft WARM BEIGE to TAUPE to SOFT OLIVE gradient, MUTED LAVENDER velvet drapery behind with visible texture, BRIGHTER elegant pastel tones",
      "DEEP BLACK background with STRONG CONTRAST, rich DEEP BLACK velvet fabric draped behind creating dramatic contrast with bright fabrics and jewelry, elegant dramatic portrait atmosphere",
      "grand chamber with ATMOSPHERIC PERSPECTIVE and DEPTH, soft WARM CARAMEL to TAUPE gradient, large SOFT BURGUNDY brocade drapery with rich folds, BRIGHTER pastel tones, spacious elegant royal atmosphere"
    ];
    
    const lightingDirections = [
      "single WARM KEY LIGHT from upper left, BRIGHTER illumination on subject, soft chiaroscuro with moderate shadows and STRONG BRIGHT WHITE highlights, sculpted fur texture, warm dark background (not pitch black), warm golden RIM HIGHLIGHTS, subtle SOFT GLOW throughout, elegant NOT gloomy",
      "single warm KEY LIGHT from upper front-left, BRIGHTLY LIT subject with subtle SOFT GLOW overall, soft chiaroscuro lighting with moderate shadows, BRIGHT WHITE highlights on fur, warm dark background, warm golden rim light, gentle luminosity",
      "warm KEY LIGHT from upper left creating BRIGHT illumination with subtle SOFT GLOW, soft chiaroscuro, moderate shadows contrasting with STRONG BRIGHT WHITE highlights, fur texture sculpted by light, golden rim highlights, warm dark background, gentle luminous atmosphere",
      "single WARM KEY LIGHT upper left, BRIGHTER overall lighting on subject with subtle SOFT GLOW throughout, classic portrait lighting with moderate shadows and BRIGHT WHITE highlights, sculpted fur texture, warm golden glow around pet, gentle luminosity"
    ];

    // Pick random elements
    let cushion = cushions[Math.floor(Math.random() * cushions.length)];
    let robe = robes[Math.floor(Math.random() * robes.length)];
    let jewelryItem = jewelry[Math.floor(Math.random() * jewelry.length)];
    let background = backgrounds[Math.floor(Math.random() * backgrounds.length)];
    const lighting = lightingDirections[Math.floor(Math.random() * lightingDirections.length)];

    // Adjust for FEMALE pets - feminine aesthetic
    if (gender === "female") {
      // Lighter, softer cloak colors for female pets
      const feminineRobes = [
        "DAINTY SOFT PINK velvet cloak with delicate gold thread embroidery, soft plush velvety texture, PURE WHITE ermine fur trim, dainty refined fabric - lighter softer feminine tones",
        "DAINTY LAVENDER velvet cloak with delicate gold patterns, soft plush velvety texture, PURE BRIGHT WHITE ermine fur trim, dainty luxurious fabric - soft feminine colors",
        "DAINTY SOFT ROSE velvet cloak with delicate ornate gold embroidery, soft plush velvety texture, PURE WHITE ermine fur trim, dainty refined fabric - lighter feminine tones",
        "DAINTY PEARL WHITE velvet cloak with delicate gold thread detailing, soft plush velvety texture, PURE BRIGHT WHITE ermine fur trim, dainty sumptuous fabric - soft luminous feminine",
        "DAINTY SOFT BLUE velvet cloak with delicate gold embroidery, soft plush velvety texture, PURE WHITE ermine fur trim, dainty luxurious fabric - lighter softer feminine colors"
      ];
      robe = feminineRobes[Math.floor(Math.random() * feminineRobes.length)];
      
      // Finer, more delicate jewelry for female pets
      const feminineJewelry = [
        "extra delicate fine antique gold necklace with tiny gem clusters (small ruby, emerald, amethyst), intricate gold filigree, tiny pearls, very fine chains - FINER and more delicate",
        "dainty delicate antique gold necklace with small gem clusters, ornate fine filigree work, tiny pearl accents, multiple fine delicate chains - FINER jewelry",
        "delicate fine gold necklace with petite gem clusters, intricate delicate filigree, small pearls, fine delicate chains - FINER and more refined"
      ];
      jewelryItem = feminineJewelry[Math.floor(Math.random() * feminineJewelry.length)];
    }

    // Check if white cat - add angelic luminous treatment
    const isWhiteCat = species === "CAT" && (
      petDescription.toLowerCase().includes("white") || 
      petDescription.toLowerCase().includes("snow white") ||
      petDescription.toLowerCase().includes("pure white")
    );

    // Step 2: Generate late 18th-century aristocratic royal portrait - SPECIES AND PET ACCURACY ARE #1 PRIORITY
    const genderInfo = gender ? `\n=== GENDER ===\nThis is a ${gender === "male" ? "male" : "female"} ${species}.` : "";
    
    // Add feminine aesthetic instructions for female pets
    const feminineAesthetic = gender === "female" ? `
=== FEMININE AESTHETIC ===
This is a FEMALE ${species} - apply feminine aesthetic:
- LIGHTER, SOFTER cloak colors - pastel pinks, lavenders, soft blues, pearl whites
- DELICATE fabrics - fine, refined, gentle textures
- FINER jewelry - more delicate, smaller gems, intricate filigree
- GENTLER visual tone - softer lighting, more graceful composition
- Overall elegant feminine refinement` : "";

    // Add angelic luminous treatment for white cats
    const whiteCatTreatment = isWhiteCat ? `
=== WHITE CAT - ANGELIC LUMINOUS TREATMENT ===
This is a WHITE CAT - apply angelic luminous aesthetic:
- ANGELIC appearance - ethereal, heavenly, divine
- LUMINOUS glow that enhances white fur - soft radiant light
- SOFT GLOW around the entire cat - gentle radiance
- Enhanced presence - the white cat should GLOW with light
- More luminous than other pets - special angelic treatment` : "";
    
    // Age preservation instructions
    let agePreservationInstructions = "";
    if (ageStage === "PUPPY" || ageStage === "KITTEN") {
      agePreservationInstructions = `
=== CRITICAL: PRESERVE YOUTHFUL APPEARANCE ===
This is a ${ageStage} - preserve their youthful, baby features EXACTLY:
- Keep large eyes relative to face size (puppies/kittens have proportionally larger eyes)
- Maintain rounder, softer facial features (not mature/adult proportions)
- Preserve smaller body proportions and youthful appearance
- Keep the playful, innocent expression characteristic of young animals
- DO NOT age them up - maintain their exact puppy/kitten stage
- The portrait should reflect the animal exactly as it appears - a ${ageStage}, not an adult
- Preserve all youthful characteristics: rounder head, larger eyes, smaller muzzle, softer features`;
    }
    
    // Build facial structure section if analysis was successful
    const facialStructureSection = facialStructureAnalysis ? `
=== DETAILED FACIAL STRUCTURE (CRITICAL FOR RECOGNITION) ===
The following facial structure analysis MUST be preserved exactly:
${facialStructureAnalysis}
` : "";

    const generationPrompt = `CRITICAL SPECIES REQUIREMENT: THIS IS A ${species}. YOU MUST GENERATE A ${species}. ${notSpecies} REPEAT: THIS IS A ${species} - GENERATE ONLY A ${species}. DO NOT GENERATE THE WRONG SPECIES.

THIS IS A ${species}. Generate a ${species}. ${notSpecies}

=== IDENTITY PRESERVATION - MOST CRITICAL ===
This portrait MUST be instantly recognizable as THIS SPECIFIC ${species}. The owner should look at the portrait and immediately feel "That's MY pet!"

IDENTITY REQUIREMENTS:
- The facial structure must match the original EXACTLY - this is what makes pets recognizable
- Preserve the unique "look" in the eyes - the expression that defines this pet's personality
- Every distinctive marking must be in the EXACT correct location
- The overall silhouette and proportions must match the original
- Breed characteristics must be accurate but INDIVIDUAL features take priority
- If this pet has any asymmetrical features, they MUST be preserved
- The portrait should capture what makes THIS pet different from every other pet of the same breed

WHAT CREATES INSTANT RECOGNITION:
- Correct skull shape and snout proportions (these vary significantly even within breeds)
- Exact eye shape, size, spacing, and color
- Precise ear shape, size, and carriage
- Unique markings in their exact locations
- The pet's characteristic expression
- Correct coat color with accurate shading and patterns

=== CRITICAL: FULLY ANIMAL - NO HUMAN FEATURES ===
- The ${species} must be 100% ANIMAL - NOT a human-animal hybrid
- NO human body, NO human posture, NO bipedal stance
- NO human hands, arms, or humanoid body shape
- The ${species} has FOUR LEGS/PAWS - natural animal anatomy only
- Natural animal proportions and body structure
- The pet is a REAL ${species}, not an anthropomorphic character

=== COMPOSITION (CRITICAL - Follow Exactly) ===
- Subject positioned LOW and CENTRAL - resting on cushion, not standing or floating
- Body ¾ VIEW, head forward or slightly angled - late 18th-century aristocratic portrait posture
- FRONT PAWS VISIBLE and resting on cushion - signature trait
- Cloak draped over body + cushion - looks heavy, rests naturally with realistic folds
- MEDIUM CLOSE-UP framing: chest to top of head (NOT full body, NOT face only)
- Camera at pet's eye level or slightly above

=== POSE: REGAL SEATED POSITION ===
- The ${species} is SEATED majestically on throne cushion
- Front paws visible, resting elegantly on cushion
- Head held high with noble, dignified expression
- Body ¾ view - late 18th-century aristocratic portrait posture
- Dainty delicate cloak draped naturally over body - soft plush velvety texture
- Proud, regal posture befitting nobility
${facialStructureSection}
=== THE ${species} - DETAILED DESCRIPTION ===
${petDescription}${genderInfo}${feminineAesthetic}${whiteCatTreatment}${agePreservationInstructions}

=== CRITICAL: EXACT MATCHING ===
The generated pet MUST match the description EXACTLY:
- Same colors - if described as 'midnight black', use midnight black, not charcoal gray
- Same markings in same locations - if description says 'white patch on left cheek', generate a white patch on the LEFT CHEEK
- Same face proportions - if described as 'round face', generate a round face, not oval
- Preserve color gradients exactly - if darker on back, lighter on belly, maintain this gradient
- Every marking, spot, patch, or stripe described MUST appear in the generated image in the EXACT same location
- If asymmetrical markings are described, they MUST be asymmetrical in the generated image
- Eye spacing, nose size, muzzle length must match the description precisely

This ${species} portrait must look like THIS EXACT ${species}. ${notSpecies}

=== STYLE: CLASSICAL OIL PAINTING - ROYAL PORTRAIT ===
This MUST look like a REAL OIL PAINTING with visible brushstrokes, rich texture, and luminous depth:
- CLASSICAL OIL PAINTING TECHNIQUE: Visible brushstrokes, rich impasto texture, layered glazing
- LATE 18TH-CENTURY STYLE: Like Gainsborough, Reynolds, or Vigée Le Brun (1770-1830) - rich, luminous, painterly, Georgian/Regency/Napoleonic era
- TEXTURE: Visible paint texture, brush marks, rich oil paint application
- DEPTH: Multiple layers of paint creating luminous depth and richness
- SURFACE QUALITY: Matte to semi-gloss finish typical of oil paintings
- NO PHOTOGRAPHIC LOOK: Must look hand-painted, not like a photo filter

=== COLOR PALETTE (Brighter, Pastel-Leaning Royal Portrait) ===
BACKGROUND & SHADOWS:
- BRIGHTER warm tones: soft taupe, warm beige, muted caramel, soft olive
- Soft painterly gradients with ATMOSPHERIC DEPTH
- NOT dark or gloomy - warm and inviting

FABRICS & DRAPES:
- BRIGHTER PASTEL-LEANING jewel tones: dusty rose, soft sapphire, muted emerald, soft burgundy, dusty lavender, sage green
- BRIGHT cream/ivory accents
- BRIGHT antique gold embroidery throughout
- Colors should be LUMINOUS and SOFT - not harsh

JEWELRY:
- BRIGHT gold + soft ruby pink + muted emerald + soft amethyst + warm topaz
- Gold filigree, small BRIGHT WHITE pearls, multi-chain necklaces
- BRIGHT gem highlights that sparkle
- NOT modern, NOT simple beads

FUR TONES:
- Naturalistic, warm, softly blended
- Painterly with LONG flowing brushwork
- BRIGHT highlights on fur
- Preserve exact pet coloring
- Keep deep blacks rich and saturated

=== RENDERING STYLE (Critical) ===
- TRUE OIL PAINTING TEXTURE - LONG, FLOWING visible brush strokes throughout
- ELONGATED brushwork - longer strokes for painterly effect
- High detail but NOT photorealistic, NOT too perfect
- Late 18th-century aristocratic portrait feel (1770-1830) - Georgian/Regency/Napoleonic era with hand-painted charm
- Thick, layered pigments with BRIGHT WHITE highlights
- NOT digital, NOT airbrushed, NOT overly smooth, NOT overly perfect
- Painterly fur with LONG flowing brushwork
- Subtle SOFT GLOW throughout - gentle luminosity and warmth
- Slightly soft edges in places - painterly not clinical

=== KEY QUALITIES ===
- SPACIOUS background with DEPTH - feels like grand chamber, NOT flat
- BRIGHTER PASTEL-LEANING fabrics (dusty rose, soft sapphire, sage green, muted mauve)
- Rich velvety textures on cloak and cushion
- Single warm key light - BRIGHTER illumination on subject
- Subtle SOFT GLOW overall - gentle luminous atmosphere
- Warm golden rim highlights around pet
- Dainty antique jewelry with BRIGHT sparkling gem clusters
- PURE BRIGHT WHITE ermine-style fur trim on cloak
- NATURAL ANIMAL BODY - four legs, normal pet anatomy
- PRESERVE DEEP BLACKS in fur - rich and saturated
- BRIGHTER overall - pastel-leaning, airy, NOT gloomy
- Hand-painted feel with slight imperfections - NOT too perfect

=== COLOR MATCHING REQUIREMENTS ===
- Match colors EXACTLY as described - if described as 'midnight black', use rich deep midnight black, not charcoal gray
- PRESERVE DEEP BLACKS: Any black fur or features must remain rich, deep, and saturated - never lighten black areas
- If described as 'snow white', use pure bright white, not off-white
- If described as 'honey gold', use that exact vibrant golden honey color
- Preserve color gradients exactly - if darker on back, lighter on belly, maintain this gradient
- Do not change or approximate colors - use the exact colors described
- Brighten lighter colors while keeping deep blacks intact and rich

=== MARKINGS AND PATTERNS ===
- Every marking, spot, patch, or stripe described MUST appear in the generated image in the EXACT same location
- If description mentions 'left cheek', place marking on LEFT cheek (viewer's perspective)
- If description mentions 'right shoulder', place marking on RIGHT shoulder
- If asymmetrical markings are described, they MUST be asymmetrical in the generated image
- Do not add markings that are not described
- Do not remove or relocate markings that are described

=== FACE PROPORTIONS ===
- Match face proportions EXACTLY - if described as 'round face', generate a round face, not oval
- If described as 'long/narrow face', generate a long narrow face
- Eye spacing must match the description precisely - if eyes are 'close together', they must be close together
- Nose size relative to face must match - if described as 'small nose', generate a small nose
- Muzzle length must match - if described as 'short muzzle', generate a short muzzle

FULL BODY PORTRAIT: The ${species} is SEATED NATURALLY like a real ${species} on ${cushion}, with ${robe} draped over its back (NOT clothing, just draped fabric), with ${jewelryItem} around its neck. ${background}. ${lighting}. NO human clothing - ONLY a draped cloak. Natural animal seated pose. Show the ENTIRE pet from ears to paws - wide framing, not a close-up. 

RENDERING: TRUE OIL PAINTING with LONG FLOWING visible brush strokes, thick layered pigments, BRIGHT WHITE highlights, high detail but NOT photorealistic and NOT too perfect. Late 18th-century European aristocratic portrait feel (1770-1830 Georgian/Regency/Napoleonic era, Gainsborough/Reynolds/Vigée Le Brun style) - elegant and AIRY, NOT gloomy, hand-painted charm with slight imperfections. NOT Renaissance. NOT digital, NOT airbrushed, NOT overly smooth, NOT overly perfect. Subtle SOFT GLOW throughout - gentle luminosity. SPACIOUS background with ATMOSPHERIC DEPTH - feels like grand chamber. Single warm key light - BRIGHTLY LIT subject, soft chiaroscuro with moderate shadows, warm golden rim highlights. DEEP RICH SATURATED jewel-toned fabrics. DAINTY, DELICATE SOFT PLUSH VELVETY cloak DRAPED over pet (NOT clothing, just draped fabric) with visible velvet nap and plush texture, PURE BRIGHT WHITE ermine trim, dainty antique jewelry with BRIGHT sparkling gem clusters and BRIGHT WHITE pearls. Velvet throne cushion with gold embroidery. Pet seated NATURALLY like a real ${species} - NOT human-like pose. NO human clothing. Pet MUST match original EXACTLY - warm natural fur with BRIGHT WHITE painterly highlights and LONG brushwork, deep blacks preserved rich and saturated. All whites should be PURE BRIGHT WHITE. Slightly soft edges - painterly not clinical.`;

    // Determine which model to use for generation
    // Priority: OpenAI img2img > Stable Diffusion > Composite > Style Transfer > IP-Adapter > FLUX > GPT-Image-1
    // OpenAI img2img gets highest priority when explicitly enabled
    // 
    // CRITICAL: All generation types (free, pack credit, secret credit) use the SAME model selection logic.
    // The only difference is watermarking - the actual generation is identical for all types.
    // useSecretCredit and usePackCredit do NOT affect model selection - only watermarking.
    const useOpenAIImg2Img = process.env.USE_OPENAI_IMG2IMG === "true" && process.env.OPENAI_API_KEY;
    const useStableDiffusion = !useOpenAIImg2Img && process.env.USE_STABLE_DIFFUSION === "true" && process.env.REPLICATE_API_TOKEN;
    const useComposite = !useOpenAIImg2Img && !useStableDiffusion && process.env.USE_COMPOSITE === "true" && process.env.REPLICATE_API_TOKEN;
    const useStyleTransfer = !useOpenAIImg2Img && !useStableDiffusion && !useComposite && process.env.USE_STYLE_TRANSFER === "true" && process.env.REPLICATE_API_TOKEN;
    const useIPAdapter = !useOpenAIImg2Img && !useStableDiffusion && !useComposite && !useStyleTransfer && process.env.USE_IP_ADAPTER === "true" && process.env.REPLICATE_API_TOKEN;
    const useFluxModel = !useOpenAIImg2Img && !useStableDiffusion && !useComposite && !useStyleTransfer && !useIPAdapter && process.env.USE_FLUX_MODEL === "true" && process.env.REPLICATE_API_TOKEN;
    
    console.log("=== IMAGE GENERATION ===");
    console.log("Environment check:");
    console.log("- USE_OPENAI_IMG2IMG:", process.env.USE_OPENAI_IMG2IMG || "not set");
    console.log("- USE_STABLE_DIFFUSION:", process.env.USE_STABLE_DIFFUSION || "not set");
    console.log("- USE_COMPOSITE:", process.env.USE_COMPOSITE || "not set");
    console.log("- USE_STYLE_TRANSFER:", process.env.USE_STYLE_TRANSFER || "not set");
    console.log("- USE_IP_ADAPTER:", process.env.USE_IP_ADAPTER || "not set");
    console.log("- USE_FLUX_MODEL:", process.env.USE_FLUX_MODEL || "not set");
    console.log("- OPENAI_API_KEY:", process.env.OPENAI_API_KEY ? "set" : "not set");
    console.log("- REPLICATE_API_TOKEN:", process.env.REPLICATE_API_TOKEN ? "set" : "not set");
    
    const modelName = useOpenAIImg2Img ? "OpenAI img2img (images.edit)"
      : useStableDiffusion ? "Stable Diffusion SDXL (full generation)"
      : useComposite ? "Composite (segment + scene + blend)"
      : useStyleTransfer ? "Style Transfer + GPT Refinement" 
      : useIPAdapter ? "IP-Adapter SDXL (identity preservation)" 
      : useFluxModel ? "FLUX (img2img)" 
      : "GPT-Image-1 (OpenAI)";
    console.log("Model selected:", modelName);
    console.log("Selection reason:", useOpenAIImg2Img ? "USE_OPENAI_IMG2IMG=true" 
      : useStableDiffusion ? "USE_STABLE_DIFFUSION=true"
      : useComposite ? "USE_COMPOSITE=true"
      : useStyleTransfer ? "USE_STYLE_TRANSFER=true"
      : useIPAdapter ? "USE_IP_ADAPTER=true"
      : useFluxModel ? "USE_FLUX_MODEL=true"
      : "No model flags set, using default GPT-Image-1");
    console.log("Generation type:", useSecretCredit ? "SECRET CREDIT (un-watermarked)" : usePackCredit ? "PACK CREDIT (un-watermarked)" : "FREE (watermarked)");
    console.log("⚠️ IMPORTANT: All generation types (free, pack credit, secret credit) use the SAME model:", modelName);
    console.log("⚠️ The only difference is watermarking - generation model is identical for all types.");
    console.log("Detected species:", species);
    console.log("Species enforcement:", notSpecies);
    
    let firstGeneratedBuffer: Buffer;
    
    if (useOpenAIImg2Img) {
      // Use OpenAI img2img for primary generation
      console.log("🎨 Using OpenAI img2img (images.edit) for primary generation...");
      console.log("📌 Pet identity will be preserved from original image");
      console.log("📌 Transforming pet photo directly into late 18th-century aristocratic portrait");
      
      // Create a focused prompt for OpenAI img2img
      // OpenAI's images.edit works best with SHORT, CLEAR instructions
      // Priority: preserve pet identity first, then add minimal styling
      // Extract key identifying features from description for better preservation
      const keyFeatures = petDescription.length > 200 
        ? petDescription.substring(0, 200) + "..."
        : petDescription;
      
      // CRITICAL: Explicitly state the species multiple times to prevent wrong animal generation
      const speciesEnforcement = species === "CAT" 
        ? "CRITICAL: This is a CAT. Generate ONLY a CAT. DO NOT generate a dog. This MUST be a CAT."
        : species === "DOG"
        ? "CRITICAL: This is a DOG. Generate ONLY a DOG. DO NOT generate a cat. This MUST be a DOG."
        : `CRITICAL: This is a ${species}. Generate ONLY a ${species}.`;
      
      // Check if white cat for OpenAI img2img
      const isWhiteCatForOpenAI = species === "CAT" && (
        petDescription.toLowerCase().includes("white") || 
        petDescription.toLowerCase().includes("snow white") ||
        petDescription.toLowerCase().includes("pure white")
      );
      
      const feminineAestheticForOpenAI = gender === "female" ? `
=== FEMININE AESTHETIC ===
This is a FEMALE ${species} - apply feminine aesthetic:
- LIGHTER, SOFTER cloak colors - pastel pinks, lavenders, soft blues, pearl whites
- DELICATE fabrics - fine, refined, gentle textures
- FINER jewelry - more delicate, smaller gems, intricate filigree
- GENTLER visual tone - softer lighting, more graceful composition
- Overall elegant feminine refinement
` : "";

      const whiteCatTreatmentForOpenAI = isWhiteCatForOpenAI ? `
=== WHITE CAT - ANGELIC LUMINOUS TREATMENT ===
This is a WHITE CAT - apply angelic luminous aesthetic:
- ANGELIC appearance - ethereal, heavenly, divine
- LUMINOUS glow that enhances white fur - soft radiant light
- SOFT GLOW around the entire cat - gentle radiance
- Enhanced presence - the white cat should GLOW with light
- More luminous than other pets - special angelic treatment
` : "";

      // RAINBOW BRIDGE MEMORIAL PORTRAIT PROMPT
      // Used when style === "rainbow-bridge" for memorial portraits of pets who have passed
      const rainbowBridgePrompt = isRainbowBridge ? `${speciesEnforcement} DO NOT change the ${species} at all - keep it exactly as shown in the original image. This is a ${species}, not any other animal.

RAINBOW BRIDGE MEMORIAL PORTRAIT - Heavenly, angelic tribute to a beloved pet who has crossed the Rainbow Bridge.

=== CRITICAL PET PRESERVATION ===
- Preserve the face structure, skull shape, snout proportions EXACTLY from the original
- Keep all markings, colors, fur patterns in their EXACT locations
- Maintain the exact eye color, shape, spacing, and expression
- Preserve ear shape, size, and position exactly
- The pet's unique identifying features must remain unchanged
- This is a memorial - accuracy is paramount

=== HEAVENLY/ANGELIC AESTHETIC ===
- ETHEREAL, peaceful, serene atmosphere
- SOFT GLOWING LIGHT surrounding the pet - gentle radiance
- ANGELIC appearance - divine, heavenly, peaceful
- SOFT WHITES and CREAMS dominate the palette
- Gentle pastel rainbow colors subtly present (soft pink, peach, lavender, mint, sky blue)
- LUMINOUS quality throughout - pet appears to glow with inner light
- Peaceful, content expression - at rest in a better place
- Soft, diffused lighting with no harsh shadows
- Dream-like, ethereal quality

=== BACKGROUND VARIATIONS ===
VARY THE COMPOSITION - Use different heavenly settings:
- OPTION 1: Pet sitting or resting on a SOFT CLOUD PILLOW - fluffy, ethereal clouds that look like a comfortable cushion
- OPTION 2: Pet surrounded by gentle HEAVENLY MIST with soft clouds drifting
- OPTION 3: Pet in a field of soft LUMINOUS FLOWERS or petals floating gently
- OPTION 4: Pet on a SOFT GOLDEN LIGHT PLATFORM with ethereal mist below
- SOFT, GLOWING background - creamy whites, pale golds, gentle pastels
- VERY SUBTLE rainbow arc or prismatic light in background (gentle, not overwhelming)
- Soft light rays filtering through clouds
- NO dark elements - all light and peaceful
- Ethereal, heavenly atmosphere

=== COMPOSITION ===
- CENTERED portrait composition
- Pet appears peaceful and serene
- Natural pose - sitting or resting peacefully (sometimes on cloud pillow, sometimes floating)
- VARY the pose: sitting upright, curled up, lying down peacefully
- SOFT GLOW around the pet like a halo or aura
- No royal elements (no thrones, cloaks, jewelry)
- Simple, elegant, heavenly setting
- Focus on the pet's face and peaceful expression

=== LIGHTING ===
- SOFT, DIFFUSED heavenly light
- Gentle glow emanating from and around the pet
- NO harsh shadows - soft and peaceful
- Warm, golden undertones
- Ethereal rim lighting creating angelic glow
- Pet appears to be bathed in soft light
- Light filtering through clouds creates soft dappled effect

=== RENDERING - PAINTERLY STYLE ===
- VISIBLE BRUSHSTROKES - soft, flowing, painterly brushwork
- TEXTURED OIL PAINT appearance - like a classical painting
- CANVAS GRAIN visible - museum-quality fine art
- LONG FLOWING brush strokes - not digital, not airbrushed
- Hand-painted charm with visible paint texture
- Soft, dreamy, ethereal feel with painterly quality
- NOT hyper-realistic - soft, artistic, painted
- Museum-quality memorial portrait
- Warm, comforting atmosphere
- Paint texture visible on clouds, background, and pet's fur
- Classical oil painting technique - like Gainsborough or Reynolds but heavenly

CRITICAL: The ${species} must look EXACTLY like the original photo - this is a memorial portrait. Vary the composition (sometimes on cloud pillow, sometimes floating, sometimes in mist). Use visible brushstrokes and painterly technique throughout. The pet should appear peaceful, serene, and surrounded by heavenly light. Create a beautiful, varied, painterly tribute that brings comfort.` : null;

      const openAIImg2ImgPrompt = isRainbowBridge ? rainbowBridgePrompt! : `${speciesEnforcement} DO NOT change the ${species} at all - keep it exactly as shown in the original image. This is a ${species}, not any other animal.

18th-century aristocratic oil portrait of a pet. Late 18th-century European aristocratic portraiture (1770-1830) - Georgian/Regency/Napoleonic era. Like Gainsborough, Reynolds, Vigée Le Brun. NOT Renaissance.${feminineAestheticForOpenAI}${whiteCatTreatmentForOpenAI}

=== CRITICAL PET PRESERVATION ===
- Preserve the face structure, skull shape, snout proportions EXACTLY from the original
- Keep all markings, colors, fur patterns in their EXACT locations
- Maintain the exact eye color, shape, spacing, and expression
- Preserve ear shape, size, and position exactly
- Warm, natural fur tones with soft painterly highlights and fine brushwork
- The pet's unique identifying features must remain unchanged

=== LIGHTING (Dramatic Directional Chiaroscuro with Glow - Retaining Darker Tones) ===
- Use dramatic, directional CHIAROSCURO lighting with BRIGHTER overall illumination
- STRONG BRIGHT HIGHLIGHT on the FACE - this is the focal point
- DEEP SHADOW FALLOFF around the neck and into the background - RETAINING DARKER TONES
- Single BRIGHT warm key light from upper left creating sculpted fur texture
- Background with DARKER TONES in shadows - rich depth, retaining darker tones
- BRIGHT warm golden RIM HIGHLIGHTS around the pet creating a GLOW
- SUBTLE LUMINOUS GLOW throughout the image - gentle radiance and brightness
- Subject GLOWS with BRIGHT warm light - luminous and well-lit
- DARKER TONES retained in shadows and background for depth and contrast

=== AUTOMATIC COLOR HARMONY (DEEP, RICH Colors Based on Pet's Natural Colors) ===
Select DEEP, RICH, SATURATED cloak, cushion, drapery, and gem colors based on the pet's natural fur, eye, and nose tones. Use DEEP, RICH, SATURATED colors while retaining darker tones in shadows:

FOR WARM-TONED OR TAN PETS: DEEP rich blues, DEEP forest greens, RICH burgundy, or DEEP teal fabrics with gold embroidery - DEEP and SATURATED
FOR BLACK OR DARK-COATED PETS: RICH cream, DEEP ivory, RICH gold, DEEP emerald, DEEP sapphire, RICH lavender fabrics for contrast - DEEP and RICH
FOR WHITE OR PALE PETS: DEEP rich jewel tones (DEEP ruby, DEEP emerald, DEEP sapphire, RICH periwinkle) or DEEP velvets - RICH colors
FOR ORANGE/GINGER PETS: DEEP teal, RICH turquoise, DEEP forest green, or DEEP navy fabrics - DEEP SATURATED tones
FOR GRAY OR SILVER PETS: DEEP burgundy, RICH plum, DEEP amethyst, or RICH gold-trimmed velvets - DEEP and RICH
FOR MULTICOLOR PETS: harmonize with dominant fur tone using DEEP/RICH colors, accent with SATURATED secondary tone

Apply same harmony to GEMSTONES: select DEEP RICH gems that complement pet's eyes or fur (DEEP ruby, DEEP emerald, DEEP sapphire, RICH topaz, DEEP amethyst) - SPARKLING, LUMINOUS, and DEEP SATURATED

=== COMPOSITION (Wide, Centered, Full Cushion Visible) ===
- WIDE and CENTERED composition
- Show FULL CUSHION, regal posture, classical aristocratic portrait aesthetics
- Pet seated NATURALLY like a real ${species} - NOT human-like posture
- Natural animal seated pose: body low, front paws resting naturally on cushion
- Body ¾ view, head forward - natural animal posture
- FRONT PAWS VISIBLE and resting naturally on cushion
- NO human clothing - ONLY a cloak draped over the pet
- All colors automatically unified and harmonious with pet's natural palette

=== THRONE CUSHION ===
- Embroidered SILKY velvet cushion with VISIBLE GOLD TASSELS
- DEEP, RICH, SATURATED color selected to complement pet's fur tones
- SILKY texture with visible sheen
- Gold embroidery, ornate details
- Rich, deep tones - saturated and luminous

=== REGAL CLOAK (Draped Over Pet AND Cushion - NOT Clothing) ===
- DAINTY, DELICATE regal CLOAK DRAPED over BOTH the pet AND cushion - NOT clothing, just draped fabric
- More DAINTY and REFINED - not heavy or bulky
- NO human clothing elements - NO sleeves, NO buttons, NO tailored garments
- Just a DAINTY CLOAK/ROBE draped naturally over the pet's back and shoulders
- SOFT, PLUSH VELVETY texture - luxurious velvet with visible nap and plush feel
- VELVETY appearance - soft, plush, luxurious velvet fabric
- BRIGHT ANTIQUE GOLD EMBROIDERY - delicate and refined
- DEEP, RICH, SATURATED fabric colors adjusted to enhance and balance pet's tones
- WHITE FUR TRIM with BLACK ERMINE SPOTS
- Looks DAINTY, VELVETY, and luxurious - soft plush velvet texture
- Fabric GLOWS with DEEP, RICH color - saturated and luminous, retaining darker tones in folds
- Pet's natural body and fur visible beneath the draped cloak

=== ANTIQUE 18TH-CENTURY JEWELRY ===
- Layered MULTI-CHAIN gold necklaces
- Ornate FILIGREE details
- BRIGHT WHITE PEARLS and small CLUSTERED BRIGHT GEMSTONES
- BRIGHT SPARKLING gems match or complement pet's natural colors (eyes/fur)
- Gems GLOW and SPARKLE - not dull
- NOT modern jewelry, NOT simple beads

=== BACKGROUND DRAPERY ===
- Heavy SILKY velvet drapery with PAINTERLY FOLDS
- DEEP, RICH, SATURATED colors selected to support overall harmony with pet
- SILKY LUSTROUS texture with visible sheen
- Atmospheric depth with DARKER TONES in shadows and folds - retaining darker tones
- Colors should be DEEP, RICH, and SATURATED - rich jewel tones
- DARKER TONES in shadows and background depth
- ZERO modern elements

=== WHITE TONES ===
- All whites should be PURE BRIGHT WHITE - not grey, not muted
- Ermine fur trim: PURE WHITE with black spots
- Pearl accents: BRIGHT WHITE
- White highlights: PURE BRIGHT WHITE

=== RENDERING (Old-Master Realism with Glow - Deep Colors, Darker Tones) ===
- VISIBLE BRUSHSTROKES throughout
- TEXTURED OIL PAINT appearance
- CANVAS GRAIN texture
- MUSEUM-QUALITY rendering
- Hand-painted look with slight imperfections
- LONG, FLOWING brush strokes
- NOT digital, NOT airbrushed, NOT too perfect
- SUBTLE LUMINOUS GLOW throughout - gentle radiance and warmth
- SILKY LUSTROUS textures on fabrics - visible sheen and luster
- DEEP, RICH, SATURATED colors throughout - rich jewel tones
- DARKER TONES retained in shadows and background for depth
- Subject GLOWS with BRIGHT warm light, fabrics GLOW with DEEP RICH color

CRITICAL: The ${species} must sit NATURALLY like a real ${species} - NOT in a human-like pose. NO human clothing - ONLY a cloak draped over. The ${species} itself must remain completely unchanged and identical to the original photo. Remember: this is a ${species}, not a human.`;
      
      // Process the original image buffer for OpenAI
      const processedForOpenAI = await sharp(buffer)
        .resize(1024, 1024, { fit: "inside", withoutEnlargement: true })
        .png()
        .toBuffer();
      
      firstGeneratedBuffer = await generateWithOpenAIImg2Img(
        processedForOpenAI,
        openAIImg2ImgPrompt,
        openai
      );
      
      console.log("✅ OpenAI img2img generation complete");
    } else if (useStableDiffusion) {
      // Use full Stable Diffusion SDXL for generation
      console.log("🎨 Using Full Stable Diffusion SDXL...");
      console.log("📌 Pet identity preserved from reference image");
      console.log("📌 Late 18th-century aristocratic portrait style applied via SDXL");
      
      firstGeneratedBuffer = await generateWithStableDiffusion(
        base64Image,
        petDescription,
        species,
        detectedBreed
      );
      
      console.log("✅ Stable Diffusion generation complete");
    } else if (useComposite) {
      // Use composite approach for maximum face preservation
      console.log("🎨 Using Composite Approach...");
      console.log("📌 Step 1: Segment pet from background");
      console.log("📌 Step 2: Generate Victorian royal scene");
      console.log("📌 Step 3: Composite pet onto scene");
      console.log("📌 Step 4: Harmonize final portrait");
      
      firstGeneratedBuffer = await generateCompositePortrait(
        base64Image,
        species,
        openai
      );
      
      console.log("✅ Composite portrait complete");
    } else if (useStyleTransfer) {
      // Use style transfer - preserves 88%+ of pet identity
      console.log("🎨 Using Style Transfer (SDXL low-denoise)...");
      console.log("📌 Pet photo will be transformed to oil painting style");
      
      // Stage 1: Apply style transfer for identity preservation
      const styleTransferBuffer = await applyStyleTransfer(base64Image);
      console.log("✅ Style transfer complete (Stage 1)");
      
      // Stage 2: GPT Refinement for quality enhancement (if enabled)
      const enableGptRefinement = process.env.ENABLE_GPT_REFINEMENT !== "false"; // Default to true
      
      if (enableGptRefinement) {
        console.log("🎨 Applying GPT-Image-1 refinement (Stage 2)...");
        console.log("📌 Enhancing quality while preserving identity");
        
        // Create enhancement prompt - focus on quality, keep the subject unchanged
        const enhancementPrompt = `Transform this into a beautiful Victorian royal portrait of a ${species}.

BACKGROUND - MAKE IT BEAUTIFUL:
- Create a LIGHTER, more luminous background - soft creams, warm ivories, gentle golden tones
- NOT dark or gloomy - bright and elegant like a sunlit palace
- Add elegant royal elements: plush cushion, luxurious velvet robe draped nearby, ornate gold details
- Soft, diffused late 18th-century portrait lighting throughout
- Beautiful color palette: soft golds, warm creams, touches of deep red velvet and teal

ADD ROYAL ELEMENTS TO THE ${species.toUpperCase()}:
- Elegant pearl necklace with ruby or sapphire pendant around neck
- Perhaps a delicate gold chain or royal collar
- The ${species} should look regal and noble

PAINTING STYLE:
- Classical Flemish/Dutch Golden Age oil painting
- Rich brushstroke texture, visible impasto
- Museum masterpiece quality
- Warm, inviting, elegant atmosphere

CRITICAL - PRESERVE THE ${species.toUpperCase()}'S IDENTITY:
- Keep the ${species}'s exact face, markings, and colors
- The ${species} must be recognizable as the same animal
- Maintain the natural proportions

This is a ${detectedBreed || species}. Create a royal portrait with a LIGHT, BEAUTIFUL background.`;

        try {
          // Create a File object from the buffer for OpenAI API
          // Convert Buffer to Uint8Array for Blob compatibility
          const uint8Array = new Uint8Array(styleTransferBuffer);
          const imageBlob = new Blob([uint8Array], { type: "image/png" });
          const imageFile = new File([imageBlob], "style_transfer.png", { type: "image/png" });
          
          const refinementResponse = await openai.images.edit({
            model: "gpt-image-1",
            image: imageFile,
            prompt: enhancementPrompt,
            n: 1,
            size: "1024x1024",
          });
          
          const refinedData = refinementResponse.data?.[0];
          if (refinedData?.b64_json) {
            firstGeneratedBuffer = Buffer.from(refinedData.b64_json, "base64");
            console.log("✅ GPT refinement complete (Stage 2)");
          } else if (refinedData?.url) {
            const downloadResponse = await fetch(refinedData.url);
            if (!downloadResponse.ok) throw new Error(`Failed to download refined image: ${downloadResponse.status}`);
            firstGeneratedBuffer = Buffer.from(await downloadResponse.arrayBuffer());
            console.log("✅ GPT refinement complete (Stage 2)");
          } else {
            console.log("⚠️ GPT refinement returned no data, using style transfer result");
            firstGeneratedBuffer = styleTransferBuffer;
          }
        } catch (gptError) {
          console.error("⚠️ GPT refinement failed, using style transfer result:", gptError);
          firstGeneratedBuffer = styleTransferBuffer;
        }
      } else {
        console.log("📌 GPT refinement disabled, using style transfer result only");
        firstGeneratedBuffer = styleTransferBuffer;
      }
    } else if (useIPAdapter) {
      // Use IP-Adapter for identity preservation
      console.log("🎨 Using IP-Adapter SDXL for identity-preserving generation...");
      console.log("📌 Pet identity extracted from reference image");
      console.log("📌 No fallback - if Replicate fails, generation fails");
      
      // IP-Adapter prompt focuses ONLY on style/scene - identity comes from reference image
      const ipAdapterPrompt = `A majestic royal late 18th-century European aristocratic oil painting portrait of a ${species}. Georgian/Regency/Napoleonic era style (1770-1830).

PAINTING STYLE:
Classical oil painting with visible brushstrokes, rich impasto texture, luminous glazing.
Late 18th-century technique like Gainsborough, Reynolds, or Vigée Le Brun (1770-1830 Georgian/Regency/Napoleonic era).
Museum-quality fine art, dramatic lighting, rich colors.

COMPOSITION:
Seated NATURALLY like a real ${species} on ${cushion} - NOT human-like pose.
With ${robe} DRAPED over its back - NOT clothing, just draped fabric. NO human clothing elements.
Adorned with ${jewelryItem}.
${background}.
${lighting}.
Full body portrait, natural animal seated pose, all four paws visible.

The ${species} should match the reference image exactly - same face, markings, colors, and expression. CRITICAL: ${species} must sit NATURALLY like a real ${species} - NOT human-like pose. NO human clothing - ONLY a cloak draped over.`;

      // No fallback - if IP-Adapter fails, we fail
      firstGeneratedBuffer = await generateWithIPAdapter(
        base64Image,
        ipAdapterPrompt
      );
      
      console.log("✅ IP-Adapter generation complete");
    } else if (useFluxModel) {
      // Use FLUX for image-to-image generation
      console.log("🎨 Using FLUX img2img for pet accuracy...");
      console.log("📌 Pet identity will be preserved from original image");
      console.log("📌 No fallback - if Replicate fails, generation fails");
      
      // Check if white cat for FLUX
      const isWhiteCatForFlux = species === "CAT" && (
        petDescription.toLowerCase().includes("white") || 
        petDescription.toLowerCase().includes("snow white") ||
        petDescription.toLowerCase().includes("pure white")
      );
      
      const feminineAestheticForFlux = gender === "female" ? `
=== FEMININE AESTHETIC ===
FEMALE ${species} - feminine aesthetic:
- LIGHTER, SOFTER cloak colors - pastel pinks, lavenders, soft blues, pearl whites
- DELICATE fabrics - fine, refined, gentle textures
- FINER jewelry - more delicate, smaller gems, intricate filigree
- GENTLER visual tone - softer lighting, more graceful
` : "";

      const whiteCatTreatmentForFlux = isWhiteCatForFlux ? `
=== WHITE CAT - ANGELIC LUMINOUS ===
WHITE CAT - angelic luminous:
- ANGELIC appearance - ethereal, heavenly
- LUMINOUS glow enhancing white fur - soft radiant light
- SOFT GLOW around entire cat - gentle radiance
- Enhanced presence - cat GLOWS with light
` : "";

      const fluxPrompt = `18th-century aristocratic oil portrait. Late 18th-century European aristocratic portraiture (1770-1830 Georgian/Regency/Napoleonic era). Style of Gainsborough, Reynolds, Vigée Le Brun. NOT Renaissance.${feminineAestheticForFlux}${whiteCatTreatmentForFlux}

=== LIGHTING (Brighter Dramatic Chiaroscuro with Glow - Retaining Darker Tones) ===
- Dramatic, directional CHIAROSCURO lighting with BRIGHTER overall illumination
- STRONG BRIGHT HIGHLIGHT on the FACE - focal point
- DEEP SHADOW FALLOFF around neck and into background - RETAINING DARKER TONES
- Background with DARKER TONES in shadows - rich depth, retaining darker tones
- BRIGHT warm golden RIM HIGHLIGHTS creating a GLOW around pet
- SUBTLE LUMINOUS GLOW throughout - gentle radiance and brightness
- Subject GLOWS with BRIGHT warm light - well-lit and luminous
- DARKER TONES retained in shadows and background for depth and contrast

=== AUTOMATIC COLOR HARMONY (DEEP, RICH Colors) ===
Select DEEP, RICH, SATURATED cloak, cushion, drapery, gem colors based on pet's fur/eye/nose tones while retaining darker tones:
- WARM/TAN PETS: DEEP rich blues, DEEP forest greens, RICH burgundy, DEEP teal - DEEP and SATURATED
- BLACK/DARK PETS: RICH cream, DEEP ivory, RICH gold, DEEP emerald, DEEP sapphire, RICH lavender - DEEP and RICH
- WHITE/PALE PETS: DEEP rich jewel tones (DEEP ruby, DEEP emerald, DEEP sapphire, RICH periwinkle) - RICH colors
- ORANGE/GINGER PETS: DEEP teal, RICH turquoise, DEEP forest green, DEEP navy - DEEP SATURATED tones
- GRAY/SILVER PETS: DEEP burgundy, RICH plum, DEEP amethyst, RICH gold - DEEP and RICH
- MULTICOLOR PETS: harmonize with dominant tone using DEEP/RICH colors

=== COMPOSITION (Wide, Centered, Full Cushion) ===
- WIDE and CENTERED composition showing FULL CUSHION
- Pet seated NATURALLY like a real ${species} on embroidered throne cushion with VISIBLE GOLD TASSELS
- Natural animal seated pose - NOT human-like posture
- Body ¾ view, FRONT PAWS VISIBLE resting naturally on cushion
- DAINTY, DELICATE regal CLOAK DRAPED over BOTH pet AND cushion - NOT clothing, just draped fabric
- More DAINTY and REFINED - not heavy or bulky
- NO human clothing - NO sleeves, NO buttons, NO tailored garments
- SOFT, PLUSH VELVETY texture - luxurious velvet with visible nap and plush feel
- VELVETY appearance - soft, plush, luxurious velvet fabric
- BRIGHT ANTIQUE GOLD EMBROIDERY - delicate and refined
- DEEP, RICH, SATURATED fabric colors
- WHITE FUR TRIM with BLACK ERMINE SPOTS
- Pet's natural body visible beneath draped cloak

=== JEWELRY (Antique 18th-Century) ===
- Layered MULTI-CHAIN gold necklaces, ornate FILIGREE
- BRIGHT WHITE PEARLS and small CLUSTERED BRIGHT GEMSTONES
- BRIGHT SPARKLING gems complement pet's natural colors

=== BACKGROUND ===
- Heavy SILKY velvet drapery with PAINTERLY FOLDS
- Periodically use DEEP BLACK backgrounds for STRONG CONTRAST with fabrics, jewelry, and pet's natural colors
- DEEP, RICH, SATURATED colors support harmony with pet
- SILKY LUSTROUS texture with visible sheen
- Atmospheric depth with DARKER TONES in shadows - retaining darker tones for depth
- DEEP BLACK backgrounds create dramatic contrast and make colors pop

=== RENDERING (Old-Master Realism with Glow) ===
- VISIBLE BRUSHSTROKES, TEXTURED OIL PAINT, CANVAS GRAIN
- MUSEUM-QUALITY rendering
- LONG FLOWING brush strokes
- Hand-painted charm with slight imperfections
- NOT digital, NOT airbrushed, NOT too perfect
- SUBTLE LUMINOUS GLOW throughout - gentle radiance
- SILKY LUSTROUS textures on fabrics - visible sheen
- DEEP, RICH, SATURATED colors throughout - rich jewel tones
- DARKER TONES retained in shadows and background for depth
- Subject GLOWS with BRIGHT warm light, fabrics GLOW with DEEP RICH color

=== PRESERVE FROM ORIGINAL ===
- Exact facial features, all markings, eye color, expression
- Warm natural fur with painterly highlights
- Deep black fur rich and saturated

CRITICAL: ${species} must sit NATURALLY like a real ${species} - NOT human-like pose. NO human clothing - ONLY a cloak draped over. Keep ${species} EXACTLY as shown. Only add 18th-century aristocratic styling with draped cloak.`;

      // No fallback - if FLUX fails, we fail
      firstGeneratedBuffer = await generateWithFlux(
        base64Image,
        fluxPrompt
      );
      
      console.log("✅ FLUX generation complete");
    } else {
      // Use GPT-Image-1 (original approach)
      console.log("🎨 Using GPT-Image-1 for generation...");
      
      const imageResponse = await openai.images.generate({
        model: "gpt-image-1",
        prompt: generationPrompt,
        n: 1,
        size: "1024x1024",
        quality: "high",
      });

      const imageData = imageResponse.data?.[0];

      if (!imageData) {
        throw new Error("No image generated");
      }

      // Handle both base64 (gpt-image-1) and URL (dall-e-3) responses
      if (imageData.b64_json) {
        console.log("Processing base64 image from gpt-image-1...");
        firstGeneratedBuffer = Buffer.from(imageData.b64_json, "base64");
      } else if (imageData.url) {
        console.log("Downloading image from URL...");
        const downloadResponse = await fetch(imageData.url);
        if (!downloadResponse.ok) {
          throw new Error(`Failed to download image: ${downloadResponse.status}`);
        }
        const arrayBuffer = await downloadResponse.arrayBuffer();
        firstGeneratedBuffer = Buffer.from(arrayBuffer);
      } else {
        throw new Error("No image data in response");
      }
    }
    
    console.log("✅ Stage 1 complete: First portrait generated");
    
    // STAGE 2: Compare and refine (disabled by default for faster generations)
    // Set ENABLE_TWO_STAGE_GENERATION=true to enable refinement pass
    const enableTwoStage = process.env.ENABLE_TWO_STAGE_GENERATION === "true"; // Default: disabled for speed
    let finalGeneratedBuffer: Buffer = firstGeneratedBuffer; // Fallback to first if refinement fails
    let refinementUsed = false;
    
    if (enableTwoStage) {
      try {
        console.log("=== Starting Stage 2: Comparison and Refinement ===");
        const refinementPrompt = await compareAndRefine(
          openai,
          buffer, // Original pet photo
          firstGeneratedBuffer, // First generated portrait
          petDescription,
          species
        );
      
      if (refinementPrompt && refinementPrompt.length > 100) {
        console.log("Refinement prompt received, generating refined portrait...");
        
        // Create refined generation prompt combining original prompt with corrections
        // Truncate refinement prompt if too long (API limits)
        const maxRefinementLength = 2000;
        const truncatedRefinement = refinementPrompt.length > maxRefinementLength 
          ? refinementPrompt.substring(0, maxRefinementLength) + "..."
          : refinementPrompt;
        
        const refinedGenerationPrompt = `${generationPrompt}

=== REFINEMENT STAGE - CRITICAL CORRECTIONS FROM COMPARISON ===
This is a SECOND PASS refinement. The first generation was compared with the original pet photo, and these specific corrections were identified:

${truncatedRefinement}

CRITICAL: The refined portrait MUST address EVERY correction listed above. This is your opportunity to fix all discrepancies and create a portrait that matches the original pet photo EXACTLY. Pay special attention to:
- Markings and their exact locations
- Color accuracy
- Face proportions
- Expression and unique features

Generate a refined portrait that addresses ALL corrections and matches the original pet photo with exceptional accuracy.`;
        
        // Generate refined image
        const refinedImageResponse = await openai.images.generate({
          model: "gpt-image-1",
          prompt: refinedGenerationPrompt,
          n: 1,
          size: "1024x1024",
          quality: "high",
        });
        
        const refinedImageData = refinedImageResponse.data?.[0];
        
        if (refinedImageData) {
          if (refinedImageData.b64_json) {
            finalGeneratedBuffer = Buffer.from(refinedImageData.b64_json, "base64");
            refinementUsed = true;
            console.log("✅ Stage 2 complete: Refined portrait generated");
          } else if (refinedImageData.url) {
            const downloadResponse = await fetch(refinedImageData.url);
            if (downloadResponse.ok) {
              const arrayBuffer = await downloadResponse.arrayBuffer();
              finalGeneratedBuffer = Buffer.from(arrayBuffer);
              refinementUsed = true;
              console.log("✅ Stage 2 complete: Refined portrait downloaded");
            }
          }
        }
        } else {
          console.log("⚠️ Refinement prompt too short or empty, using first generation");
        }
      } catch (refinementError) {
        console.error("⚠️ Refinement stage failed, using first generation:", refinementError);
        // Continue with first generation as fallback
      }
    } else {
      console.log("Two-stage generation disabled, using first generation only");
    }
    
    // Use the final buffer (refined if available, otherwise first)
    let generatedBuffer = finalGeneratedBuffer;
    console.log(`Using ${refinementUsed ? "refined" : "first"} generation for final output`);

    // Apply Rainbow Bridge text overlay if this is a memorial portrait
    let selectedQuote: string | null = null;
    console.log(`🌈 Rainbow Bridge check: isRainbowBridge=${isRainbowBridge}, petName="${petName}", style="${style}"`);
    if (isRainbowBridge && petName) {
      try {
        console.log("🌈 Applying Rainbow Bridge text overlay...");
        console.log(`   Pet name: "${petName}"`);
        const overlayResult = await addRainbowBridgeTextOverlay(generatedBuffer, petName);
        generatedBuffer = overlayResult.buffer;
        selectedQuote = overlayResult.quote;
        console.log(`✅ Rainbow Bridge text overlay complete. Quote: "${selectedQuote}"`);
      } catch (overlayError) {
        console.error("❌ Rainbow Bridge text overlay FAILED:", overlayError);
        // Continue without overlay rather than failing the entire generation
      }
    } else if (isRainbowBridge && !petName) {
      console.warn("⚠️ Rainbow Bridge style but NO petName provided - skipping text overlay");
    }

    // Create preview (watermarked if not using pack credit or secret credit, un-watermarked if using either)
    // NOTE: The generation model used above is IDENTICAL for all types (free, pack credit, secret credit).
    // The ONLY difference is watermarking - free gets watermarked, pack/secret get un-watermarked.
    let previewBuffer: Buffer;
    if (usePackCredit || useSecretCredit) {
      // Un-watermarked preview for pack credits or secret credit (testing)
      previewBuffer = generatedBuffer;
      if (useSecretCredit) {
        console.log("Using secret credit - generating un-watermarked image for testing");
      } else {
        console.log("Using pack credit - generating un-watermarked image");
      }
    } else {
      // Watermarked preview for free generations (including Rainbow Bridge)
      previewBuffer = await createWatermarkedImage(generatedBuffer);
      console.log("Free generation - creating watermarked preview");
    }

    // Upload HD image to Supabase Storage (always un-watermarked)
    console.log(`📤 Uploading HD image to pet-portraits bucket: ${imageId}-hd.png${isRainbowBridge ? ' (Rainbow Bridge)' : ''}`);
    const hdUrl = await uploadImage(
      generatedBuffer,
      `${imageId}-hd.png`,
      "image/png"
    );
    console.log(`✅ HD image uploaded successfully: ${hdUrl.substring(0, 80)}...`);

    // Upload preview to Supabase Storage
    console.log(`📤 Uploading preview image to pet-portraits bucket: ${imageId}-preview.png${isRainbowBridge ? ' (Rainbow Bridge)' : ''}`);
    const previewUrl = await uploadImage(
      previewBuffer,
      `${imageId}-preview.png`,
      "image/png"
    );
    console.log(`✅ Preview image uploaded successfully: ${previewUrl.substring(0, 80)}...`);

    // Validate URLs before saving
    try {
      new URL(hdUrl);
      new URL(previewUrl);
    } catch (urlError) {
      console.error("Invalid URL format:", urlError);
      throw new Error("Failed to generate valid image URLs");
    }

    // Validate imageId is a valid UUID
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (!uuidRegex.test(imageId)) {
      throw new Error(`Invalid imageId format: ${imageId}`);
    }

    // Save metadata to Supabase database
    // Truncate pet_description if too long (some databases have length limits)
    const maxDescriptionLength = 2000; // Safe limit
    const truncatedDescription = petDescription.length > maxDescriptionLength 
      ? petDescription.substring(0, maxDescriptionLength) 
      : petDescription;
    
    // Additional sanitization: remove any remaining problematic characters
    const finalDescription = truncatedDescription
      .replace(/[^\x20-\x7E\u00A0-\u024F\u1E00-\u1EFF]/g, '') // Keep Latin characters and common punctuation
      .replace(/['"]/g, "'") // Normalize quotes
      .trim();
    
    try {
      // Validate each field individually to identify which one fails
      console.log("Saving metadata with:", {
        imageId,
        imageIdValid: uuidRegex.test(imageId),
        descriptionLength: finalDescription.length,
        hdUrlLength: hdUrl.length,
        previewUrlLength: previewUrl.length,
        hdUrl: hdUrl.substring(0, 50) + "...",
        previewUrl: previewUrl.substring(0, 50) + "...",
        descriptionPreview: finalDescription.substring(0, 100),
      });
      
    await saveMetadata(imageId, {
      created_at: new Date().toISOString(),
        paid: usePackCredit || useSecretCredit, // Mark as paid only if using pack credit or secret credit
        pet_description: finalDescription,
      hd_url: hdUrl,
      preview_url: previewUrl,
        // Note: style, pet_name, and quote fields not in portraits table schema yet
        // Rainbow Bridge metadata: style="rainbow-bridge", pet_name, quote (stored in pet_description for now)
        ...(usePackCredit ? { pack_generation: true } : {}),
        // Note: secret_generation not saved to DB (testing feature only)
        // Note: refinement_used could be added to DB schema if tracking needed
      });
    
    // Log Rainbow Bridge metadata (for development/debugging)
    if (isRainbowBridge) {
      console.log("🌈 Rainbow Bridge metadata:", {
        pet_name: petName || "N/A",
        quote: selectedQuote || "N/A",
        style: "rainbow-bridge"
      });
    }
      
      if (refinementUsed) {
        console.log("✅ Two-stage generation completed successfully - refined portrait used");
      } else if (enableTwoStage) {
        console.log("ℹ️ Two-stage generation attempted but refinement not used - first generation used");
      }
      console.log("Metadata saved successfully");
      
      // Increment global portrait counter
      const newCount = await incrementPortraitCount();
      console.log(`Portrait count incremented to: ${newCount}`);
    } catch (metadataError) {
      console.error("Metadata save error:", metadataError);
      const errorMsg = metadataError instanceof Error ? metadataError.message : String(metadataError);
      console.error("Full error:", errorMsg);
      console.error("Error details:", JSON.stringify(metadataError, null, 2));
      
      // Always throw pattern validation errors - don't silently continue
      if (errorMsg.includes("pattern") || errorMsg.includes("String did not match") || errorMsg.includes("validation")) {
        throw new Error(`Database validation failed. Please try with a different image or contact support if the issue persists. Error: ${errorMsg}`);
      }
      
      // For other errors, throw as well so user knows something went wrong
      throw new Error(`Failed to save portrait metadata: ${errorMsg}`);
    }

    // Return watermarked preview - HD version only available after purchase
    return NextResponse.json({
      imageId,
      previewUrl: previewUrl, // Watermarked version for preview
    });
  } catch (error) {
    console.error("Generation error:", error);

    // Get detailed error message
    let errorMessage = "Failed to generate portrait. Please try again.";
    
    if (error instanceof Error) {
      errorMessage = error.message;
      console.error("Error details:", error.stack);
    }

    return NextResponse.json(
      { error: errorMessage },
      { status: 500 }
    );
  }
}
