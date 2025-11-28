import { NextRequest, NextResponse } from "next/server";
import OpenAI from "openai";
import Replicate from "replicate";
import sharp from "sharp";
import { v4 as uuidv4 } from "uuid";
import { CONFIG } from "@/lib/config";
import { uploadImage, saveMetadata, incrementPortraitCount } from "@/lib/supabase";
import { checkRateLimit, getClientIP, RATE_LIMITS } from "@/lib/rate-limit";
import { validateImageMagicBytes } from "@/lib/validation";

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
// This uses OpenAI's image editing API to transform the pet photo into a Renaissance portrait
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
          negative_prompt: "deformed, distorted, disfigured, poorly drawn, bad anatomy, wrong anatomy, extra limb, missing limb, floating limbs, mutated hands and fingers, disconnected limbs, mutation, mutated, ugly, disgusting, blurry, amputation, human face, human body, humanoid",
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
          prompt: "oil painting portrait, Renaissance masterpiece style, classical fine art, visible brushstrokes, rich impasto texture, warm golden lighting, museum quality painting, Rembrandt style, dramatic chiaroscuro, luminous glazing technique",
          negative_prompt: "photograph, photo, realistic, modern, digital art, cartoon, anime, blurry, low quality, watermark",
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
// This uses moderate denoising to create a beautiful Renaissance portrait
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
  const sdPrompt = `A majestic royal Renaissance oil painting portrait of a ${breedInfo}, seated regally on a luxurious velvet cushion.

SUBJECT - THIS SPECIFIC ${species.toUpperCase()}:
The ${species.toLowerCase()} has the exact features from the reference image - preserve the face structure, eye color, markings, and unique characteristics.

STYLE AND SETTING:
- Classical Flemish/Dutch Golden Age oil painting style
- Rich impasto brushstrokes, visible paint texture
- Luminous glazing technique with depth
- Warm golden Renaissance lighting from the left
- Elegant palace interior background with rich colors

ROYAL ATTIRE:
- Luxurious velvet robe in deep jewel tones (burgundy, navy, forest green)
- White ermine fur trim with black spots
- Elegant pearl necklace with gemstone pendant
- Delicate lace collar or ruff
- Rich embroidery with gold thread accents

COMPOSITION:
- Full body portrait showing the entire ${species.toLowerCase()}
- Seated majestically, all four paws visible
- Noble, dignified expression
- Well-lit, bright and beautiful
- Museum masterpiece quality

COLOR PALETTE:
- Rich jewel tones: deep reds, royal blues, emerald greens
- Warm golds and creams
- Bright, luminous - not dark or gloomy
- Classical oil painting richness`;

  const negativePrompt = `photograph, photo, photorealistic, modern, digital art, cartoon, anime, 3d render, 
blurry, low quality, watermark, text, logo, 
human body, humanoid, anthropomorphic, bipedal, 
wrong species, different animal, 
dark, gloomy, shadowy, muddy colors,
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
  
  const scenePrompt = `A luxurious Victorian royal portrait scene with rich jewel tones and ornate details, empty and ready for a pet to be placed.

SCENE ELEMENTS:
- Plush TEAL/TURQUOISE velvet cushion with intricate GOLD EMBROIDERY and gold tassel, positioned in foreground
- Sumptuous DEEP RED/BURGUNDY velvet royal robe with ornate GOLD FILIGREE trim, draped elegantly
- Delicate PEARL NECKLACE with large RUBY pendant in diamond setting, displayed on cushion
- Cream/ivory RUFFLED LACE COLLAR (Elizabethan ruff style) ready to frame a pet's neck
- DARK GREEN velvet curtain draped on one side for depth
- Rich warm GOLDEN-OLIVE background with soft painterly gradient

COLORS (IMPORTANT):
- Teal/turquoise velvet cushion
- Deep burgundy/crimson red robe  
- Gold embroidery and trim throughout
- Dark forest green curtain accent
- Warm golden background
- Cream/ivory lace details
- Pearl white and ruby red jewelry

LIGHTING:
- Warm, golden Renaissance lighting
- Soft and elegant, not harsh
- Gentle shadows for depth
- Rich and inviting atmosphere

STYLE:
- Classical Flemish/Dutch Golden Age oil painting
- Visible brushstrokes and rich impasto texture
- Museum masterpiece quality
- Ornate, luxurious, regal

IMPORTANT: 
- Leave clear space in center for a pet to be composited
- No animals or people in the scene
- The cushion and robe should be arranged for a pet to appear seated/resting
- Make it look like a real old master painting`;

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
    max_tokens: 1200,
    temperature: 0.1, // Low temperature for consistent, precise analysis
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
  const logoPath = path.join(process.cwd(), "public", "samples", "lumepet.png");
  
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
- DOG: Has a snout/muzzle, floppy or pointed ears, canine facial structure, typically larger nose, wider head
- CAT: Has whiskers, pointed triangular ears, smaller nose, more compact facial structure, feline features
- RABBIT: Long ears, round body, no snout like a dog, different facial structure

LOOK CAREFULLY: Examine the facial structure, ear shape, nose size, and overall anatomy to determine if this is a DOG or CAT.

Start your response with [DOG] or [CAT] or [RABBIT] - this is CRITICAL for accurate generation.

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
List 7-10 distinctive features that would allow someone to RECOGNIZE this specific pet:
- Asymmetrical features with EXACT locations (e.g., "slightly larger left ear")
- Unique markings with PRECISE positions (e.g., "white blaze starting 2cm above nose, widening to 3cm between eyes")
- The pet's characteristic expression or "look in their eyes"
- Any scars, notches, or physical quirks
- What makes THIS pet different from other pets of the same breed

=== SECTION 2 - FACIAL STRUCTURE (NUMERIC PROPORTIONS) ===
Provide SPECIFIC measurements and ratios:
- Skull type: Brachycephalic (flat-faced), Mesocephalic (medium), or Dolichocephalic (long)
- Face width-to-height ratio (e.g., "face is 85% as wide as tall")
- Snout length as percentage of head (e.g., "snout is 30% of total head length")
- Eye shape: Round, Almond, Oval, or Triangular
- Eye size relative to face (e.g., "eyes take up 15% of face width each")
- Eye spacing in eye-widths (e.g., "eyes are 1.5 eye-widths apart")
- Eye angle: Horizontal, upward slant, or downward slant
- Eye color: Use PRECISE color (amber honey, dark chocolate, bright emerald, ice blue, heterochromia details)
- Nose size relative to face width (e.g., "nose is 20% of face width")
- Nose color and any unique patterns
- Muzzle length category: Very short (<15%), Short (15-25%), Medium (25-35%), Long (>35%)

=== SECTION 3 - EARS (WITH PROPORTIONS) ===
- Ear size as percentage of head height (e.g., "ears are 35% of head height")
- Ear shape: Pointed, Rounded, Rose, Button, Drop/Pendant, Folded
- Ear set: High/Medium/Low on head
- Ear spacing: Close together, Normal, Wide apart
- Ear carriage: Erect, Semi-erect, Folded forward, Drooping
- Any ear markings, color variations, or asymmetry

=== SECTION 4 - COLORING (EXHAUSTIVE DETAIL) ===
Primary coat color using EXACT shade comparisons:
- Base color (e.g., "rich mahogany brown like polished wood" not just "brown")
- Secondary colors and their precise locations
- Color gradients with transition points (e.g., "darkens from golden to russet starting at shoulder line")

Markings map - describe EVERY marking:
- Location using clock positions for face (e.g., "white patch at 2 o'clock position on left cheek")
- Size estimates (e.g., "approximately 2cm diameter")
- Shape description (e.g., "irregular star shape", "perfect circle", "lightning bolt")
- Any symmetry or asymmetry in markings

Pattern type if applicable:
- Tabby (mackerel, classic, spotted, ticked)
- Bicolor, tricolor, tortoiseshell, calico
- Merle, brindle, sable, tuxedo
- Specific pattern placement

=== SECTION 5 - FUR/COAT TEXTURE ===
- Length: Very short, Short, Medium, Long, Very long
- Texture: Sleek/smooth, Soft/plush, Fluffy, Wiry, Curly, Double-coat
- Density: Sparse, Normal, Dense, Very thick
- Shine level: Matte, Slight sheen, Glossy
- Any variations in different body areas (e.g., "longer fur around neck forming mane")

=== SECTION 6 - EXPRESSION AND PERSONALITY ===
- Eye expression: Alert, Soft, Intense, Playful, Wise, Mischievous
- Resting face characteristics
- Any distinctive "look" this pet has
- The emotional quality that makes this pet recognizable

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
      max_tokens: 1500, // Increased for more detailed analysis
      temperature: 0.2, // Lower temperature for consistent, precise descriptions
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
                text: `Look at this image carefully. Is this a DOG or a CAT? 

Key differences:
- DOG: Has a snout/muzzle, canine facial structure, typically wider head
- CAT: Has whiskers, smaller nose, more compact face, feline features

Respond with ONLY one word: DOG or CAT`,
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
      if (validatedSpecies === "DOG" || validatedSpecies === "CAT") {
        // If validation differs from initial detection, use validation result
        if (validatedSpecies !== species) {
          console.warn(`⚠️ SPECIES MISMATCH: Initial detection was ${species}, but validation says ${validatedSpecies}. Using validated species.`);
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
    } catch (validationError) {
      console.error("⚠️ Species validation check failed:", validationError);
      // Continue with existing species detection
    }
    
    // Final fallback: if species is still unclear, use image analysis fallback
    if (!species || species === "PET") {
      console.warn("⚠️ Species still unclear after validation, using fallback analysis");
      // This should rarely happen now, but keep as safety net
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
      "RICH EMERALD GREEN silk velvet cushion with gold braided trim and decorative gold tassel, luxurious silky texture",
      "CREAM and IVORY WHITE plush silk cushion with delicate gold floral embroidery and silky smooth surface",
      "DEEP BURGUNDY RED velvet cushion with white ermine trim and gold thread patterns, rich silky texture",
      "GOLDEN-OLIVE GREEN brocade cushion with intricate gold embroidery and silky damask pattern",
      "PURE WHITE silk satin cushion with subtle gold accents and lustrous silky sheen",
      "RICH NAVY BLUE velvet cushion with white satin trim and gold thread details, smooth silky feel",
      "CREAM-COLORED silk cushion with gold botanical embroidery and luxurious silky texture",
      "DEEP EMERALD GREEN velvet cushion with gold trim and decorative tassel, rich silky surface"
    ];
    
    const robes = [
      "LUXURIOUS CREAM-COLORED silk cape draped elegantly over shoulders with rich gold floral embroidery along edges, white ermine fur trim with black spots, silky smooth lustrous fabric",
      "SHIMMERING LIGHT BLUE satin cape with silky smooth texture, white pearl accents and gold embroidery, pristine white ermine trim with spots",
      "RICH CREAM and GOLD silk damask cape with silky sheen, white ermine fur trim with black spots, ornate gold botanical patterns",
      "DEEP EMERALD GREEN velvet cape with silky smooth texture, white ermine trim with black spots, gold thread embroidery",
      "LUMINOUS ANTIQUE WHITE silk cape with silky lustrous surface, gold and cream botanical embroidery, white ermine fur trim",
      "RICH BURGUNDY RED velvet cape with silky texture, white ermine trim with black spots, gold embroidery details",
      "CREAM-COLORED silk satin cape with silky smooth sheen, gold floral patterns, white ermine collar with black spots",
      "DEEP NAVY BLUE velvet cape with silky texture, white ermine trim, gold thread patterns, luxurious silky feel"
    ];
    
    const jewelry = [
      "elegant gold chain necklace with multiple sparkling gemstones set in gold, single teardrop pearl or gem dangling from center, delicate and refined",
      "magnificent gold choker-style necklace adorned with sparkling gemstones, teardrop-shaped pearl or gem dangling from center, ornate gold and pearl embellishments",
      "delicate gold chain with small pink or ruby-colored gemstones, elegant and understated",
      "layered gold necklaces with pearls and gemstones, ornate gold floral centerpiece, delicate teardrop pendant",
      "elegant gold necklace with multiple gemstones in gold settings, single pearl or gem pendant, refined luxury",
      "delicate gold chain with ornate gold and pearl embellishments, small gemstone accents, elegant simplicity",
      "refined gold necklace with gemstone clusters, layered with pearls, delicate and beautiful",
      "ornate gold collar-style necklace with sparkling gemstones and pearls, elegant teardrop pendant"
    ];
    
    const backgrounds = [
      "ROYAL PALACE background with BRIGHT RICH NAVY BLUE velvet drapery cascading elegantly, ornate white marble columns, golden architectural details, warm ambient light",
      "REGAL COURT background with LUMINOUS LIGHT BLUE silk curtains, white marble pillars, intricate gold leaf patterns, bright natural window light",
      "NOBLE HALL background with ELEGANT CHARCOAL GRAY velvet drapes with gold trim, white marble accents, ornate gilded frames, soft warm lighting",
      "ROYAL CHAMBER background with BRIGHT NAVY BLUE and PURE WHITE silk drapes, marble columns, gold decorative elements, well-lit and airy",
      "PALATIAL SETTING background with RICH PERIWINKLE BLUE velvet curtains, white marble details, golden scrollwork, bright diffused light",
      "REGAL INTERIOR background with LUMINOUS LIGHT BLUE and IVORY WHITE silk drapes, ornate marble architecture, gold accents, warm natural light",
      "NOBLE BACKGROUND with ELEGANT SLATE BLUE velvet drapery, white marble columns, gold trim details, bright and beautiful lighting",
      "ROYAL SETTING background with BRIGHT NAVY BLUE velvet, pristine white marble, intricate gold decorations, luminous warm ambient glow"
    ];
    
    const lightingDirections = [
      "BRIGHT, WARM natural daylight from upper left, creating soft elegant shadows, well-lit subject",
      "LUMINOUS diffused light from the left with gentle fill light, bright and beautiful",
      "BRIGHT, EVEN studio lighting from above and left, evenly illuminated, no harsh shadows",
      "WARM natural window light from the left, bright and airy, creating a glowing effect"
    ];

    // Pick random elements
    const cushion = cushions[Math.floor(Math.random() * cushions.length)];
    const robe = robes[Math.floor(Math.random() * robes.length)];
    const jewelryItem = jewelry[Math.floor(Math.random() * jewelry.length)];
    const background = backgrounds[Math.floor(Math.random() * backgrounds.length)];
    const lighting = lightingDirections[Math.floor(Math.random() * lightingDirections.length)];

    // Step 2: Generate Renaissance royal portrait - SPECIES AND PET ACCURACY ARE #1 PRIORITY
    const genderInfo = gender ? `\n=== GENDER ===\nThis is a ${gender === "male" ? "male" : "female"} ${species}.` : "";
    
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

=== COMPOSITION: FULL BODY PORTRAIT - NOT A CLOSE-UP ===
- WIDE FRAMING - show the ENTIRE ${species} from head to paws
- DO NOT crop the ears - leave plenty of space above the head
- Medium distance shot - the pet takes up about 60-70% of the frame height
- Include visible space/padding around the entire subject
- NOT a face close-up - this is a FULL BODY seated portrait

=== POSE: REGAL SEATED POSITION ===
- The ${species} is SEATED majestically on a cushion/throne
- ALL FOUR PAWS visible - front paws resting elegantly, back paws tucked
- Head held high with noble, dignified expression
- Natural seated animal pose - like a royal pet portrait
- FULL BODY clearly visible from ears to tail/paws
- Proud, regal posture befitting nobility
- The pet is centered in the frame with room to breathe around edges
${facialStructureSection}
=== THE ${species} - DETAILED DESCRIPTION ===
${petDescription}${genderInfo}${agePreservationInstructions}

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
- OLD MASTER STYLE: Like Rembrandt, Van Dyck, or Gainsborough - rich, luminous, painterly
- TEXTURE: Visible paint texture, brush marks, rich oil paint application
- DEPTH: Multiple layers of paint creating luminous depth and richness
- SURFACE QUALITY: Matte to semi-gloss finish typical of oil paintings
- NO PHOTOGRAPHIC LOOK: Must look hand-painted, not like a photo filter

COLOR PALETTE - BRIGHT, BEAUTIFUL, ROYAL:
- PRIMARY COLORS: BRIGHT light blues, PURE whites, rich deep blues, elegant grays
- ACCENT COLORS: Silver threads, white pearls, light blue gems, subtle gold accents
- BACKGROUND: BRIGHT and ROYAL - rich navy blues, luminous whites, warm ambient lighting
- AVOID: Dark, moody, shadowy backgrounds - use BRIGHT, ROYAL, well-lit backgrounds
- FABRICS: White ermine fur with black spots, white lace, BRIGHT light blue satin, rich velvet
- JEWELRY: White pearls, silver, light blue sapphires, subtle gold details - draped elegantly
- COLORS: BRIGHT, SATURATED, BEAUTIFUL - not muted or dark

KEY QUALITIES:
- BRIGHT, ROYAL BACKGROUND - well-lit palace or noble hall setting
- SILKY, LUMINOUS fabric textures - shimmering satin, plush velvet with visible texture
- WELL-LIT SUBJECT - the pet GLOWS with warm, bright light
- Delicate floral embroidery in BRIGHT light blue, white, and silver
- VISIBLE OIL PAINT BRUSHSTROKES - rich, textured, painterly surface
- LUMINOUS GLAZING TECHNIQUE - multiple layers creating depth and richness
- BRIGHT, BEAUTIFUL color palette - royal blues, pure whites, elegant grays
- NATURAL ANIMAL BODY - four legs, normal pet anatomy
- ROYAL, REGAL atmosphere - like a palace portrait

=== COLOR MATCHING REQUIREMENTS ===
- Match colors EXACTLY as described - if described as 'midnight black', use midnight black, not charcoal gray
- If described as 'snow white', use pure white, not off-white
- If described as 'honey gold', use that exact golden honey color
- Preserve color gradients exactly - if darker on back, lighter on belly, maintain this gradient
- Do not change or approximate colors - use the exact colors described

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

FULL BODY PORTRAIT: The ${species} is SEATED regally on ${cushion}, wearing ${robe} draped over its back, with ${jewelryItem} around its neck. ${background}. ${lighting}. Show the ENTIRE pet from ears to paws - wide framing, not a close-up. 

CLASSICAL OIL PAINTING STYLE: This MUST look like a REAL HAND-PAINTED OIL PAINTING with visible brushstrokes, rich texture, and luminous depth. Like an old master portrait - Rembrandt, Van Dyck, or Gainsborough style. Rich, painterly surface with visible paint application. BRIGHT, ROYAL, WELL-LIT background - not dark or moody. Museum-quality fine art oil painting portrait of a noble pet - fully animal, majestic seated pose, complete body visible, BRIGHT and BEAUTIFUL colors. The pet MUST match the description EXACTLY in every detail.`;

    // Determine which model to use for generation
    // Priority: OpenAI img2img > Stable Diffusion > Composite > Style Transfer > IP-Adapter > FLUX > GPT-Image-1
    // OpenAI img2img gets highest priority when explicitly enabled
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
    console.log("Detected species:", species);
    console.log("Species enforcement:", notSpecies);
    
    let firstGeneratedBuffer: Buffer;
    
    if (useOpenAIImg2Img) {
      // Use OpenAI img2img for primary generation
      console.log("🎨 Using OpenAI img2img (images.edit) for primary generation...");
      console.log("📌 Pet identity will be preserved from original image");
      console.log("📌 Transforming pet photo directly into Renaissance portrait");
      
      // Create a focused prompt for OpenAI img2img
      // OpenAI's images.edit works best with SHORT, CLEAR instructions
      // Priority: preserve pet identity first, then add minimal styling
      // Extract key identifying features from description for better preservation
      const keyFeatures = petDescription.length > 200 
        ? petDescription.substring(0, 200) + "..."
        : petDescription;
      
      const openAIImg2ImgPrompt = `DO NOT change the ${species} at all - keep it exactly as shown. Preserve the face, body, markings, colors, fur pattern, eye color, ear shape, nose, and expression exactly from the original image. Only modify the background and add: a silk cape draped over the ${species}'s back (not clothing, just draped fabric), gold jewelry around the neck, and a cushion beneath. Transform only the background into a Renaissance painting style. The ${species} itself must remain completely unchanged and identical to the original photo.`;
      
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
      console.log("📌 Renaissance portrait style applied via SDXL");
      
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
- Soft, diffused Renaissance lighting throughout
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
      const ipAdapterPrompt = `A majestic royal Renaissance oil painting portrait of a ${species}.

PAINTING STYLE:
Classical oil painting with visible brushstrokes, rich impasto texture, luminous glazing.
Old master technique like Rembrandt, Van Dyck, or Gainsborough.
Museum-quality fine art, dramatic lighting, rich colors.

COMPOSITION:
Seated regally on ${cushion}.
Wearing ${robe}.
Adorned with ${jewelryItem}.
${background}.
${lighting}.
Full body portrait, dignified pose, all four paws visible.

The ${species} should match the reference image exactly - same face, markings, colors, and expression.`;

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
      
      const fluxPrompt = `Transform into a classical Renaissance oil painting portrait.

STYLE REQUIREMENTS:
- Classical oil painting technique with visible brushstrokes and rich impasto texture
- Old master style like Rembrandt, Van Dyck, or Gainsborough
- Luminous depth with layered glazing technique
- Regal royal portrait composition

SCENE ELEMENTS:
- Seated majestically on ${cushion}
- Wearing ${robe} draped elegantly
- Adorned with ${jewelryItem}
- ${background}
- ${lighting}

PRESERVE FROM ORIGINAL IMAGE:
- Exact facial features and structure
- All markings and colorings in precise locations  
- Eye color, shape, and expression
- Fur texture and patterns
- The pet's unique identity and "look"

Keep the ${species}'s appearance EXACTLY as shown in the input image. Only add Renaissance styling, clothing, and background.`;

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
    const generatedBuffer = finalGeneratedBuffer;
    console.log(`Using ${refinementUsed ? "refined" : "first"} generation for final output`);

    // Create preview (watermarked if not using pack credit or secret credit, un-watermarked if using either)
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
      // Watermarked preview for free generations
      previewBuffer = await createWatermarkedImage(generatedBuffer);
      console.log("Free generation - creating watermarked preview");
    }

    // Upload HD image to Supabase Storage (always un-watermarked)
    const hdUrl = await uploadImage(
      generatedBuffer,
      `${imageId}-hd.png`,
      "image/png"
    );

    // Upload preview to Supabase Storage
    const previewUrl = await uploadImage(
      previewBuffer,
      `${imageId}-preview.png`,
      "image/png"
    );

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
        paid: usePackCredit || useSecretCredit, // Mark as paid if using pack credit or secret credit
        pet_description: finalDescription,
      hd_url: hdUrl,
      preview_url: previewUrl,
        ...(usePackCredit ? { pack_generation: true } : {}),
        // Note: secret_generation not saved to DB (testing feature only)
        // Note: refinement_used could be added to DB schema if tracking needed
      });
      
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
