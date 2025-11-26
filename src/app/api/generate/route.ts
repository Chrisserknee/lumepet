import { NextRequest, NextResponse } from "next/server";
import OpenAI from "openai";
import sharp from "sharp";
import { v4 as uuidv4 } from "uuid";
import fs from "fs/promises";
import path from "path";
import { CONFIG } from "@/lib/config";

// Ensure generated images directory exists
async function ensureGeneratedDir() {
  const dir = path.join(process.cwd(), "public", "generated");
  try {
    await fs.access(dir);
  } catch {
    await fs.mkdir(dir, { recursive: true });
  }
  return dir;
}

// Create watermarked version of image
async function createWatermarkedImage(
  inputBuffer: Buffer,
  outputPath: string
): Promise<void> {
  const image = sharp(inputBuffer);
  const metadata = await image.metadata();
  const width = metadata.width || 1024;
  const height = metadata.height || 1024;

  // Create SVG watermark overlay
  const watermarkSvg = `
    <svg width="${width}" height="${height}">
      <defs>
        <pattern id="watermark" width="400" height="200" patternUnits="userSpaceOnUse" patternTransform="rotate(-30)">
          <text x="0" y="100" 
                font-family="Georgia, serif" 
                font-size="28" 
                font-weight="bold"
                fill="rgba(255,255,255,0.4)"
                text-anchor="start">
            PET RENAISSANCE – PREVIEW ONLY
          </text>
        </pattern>
      </defs>
      <rect width="100%" height="100%" fill="url(#watermark)"/>
      <rect width="100%" height="100%" fill="rgba(0,0,0,0.1)"/>
    </svg>
  `;

  await image
    .composite([
      {
        input: Buffer.from(watermarkSvg),
        top: 0,
        left: 0,
      },
    ])
    .toFile(outputPath);
}

export async function POST(request: NextRequest) {
  try {
    // Check for API key
    if (!process.env.OPENAI_API_KEY) {
      return NextResponse.json(
        { error: "OpenAI API key not configured" },
        { status: 500 }
      );
    }

    // Initialize OpenAI client lazily
    const openai = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY,
    });

    // Parse form data
    const formData = await request.formData();
    const imageFile = formData.get("image") as File | null;

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

    // Validate file size
    if (imageFile.size > CONFIG.MAX_FILE_SIZE) {
      return NextResponse.json(
        { error: "File too large. Maximum size is 10MB." },
        { status: 400 }
      );
    }

    // Convert file to buffer
    const bytes = await imageFile.arrayBuffer();
    const buffer = Buffer.from(bytes);

    // Generate unique ID for this generation
    const imageId = uuidv4();

    // Ensure output directory exists
    const generatedDir = await ensureGeneratedDir();

    // Process original image to base64 for OpenAI
    const processedImage = await sharp(buffer)
      .resize(1024, 1024, { fit: "cover" })
      .png()
      .toBuffer();

    // Convert Buffer to Uint8Array for File constructor compatibility
    const uint8Array = new Uint8Array(processedImage);

    // Call OpenAI Images API to generate Renaissance portrait
    // Using the gpt-image-1 model with the edit endpoint
    const response = await openai.images.edit({
      model: "gpt-image-1",
      image: new File([uint8Array], "image.png", { type: "image/png" }),
      prompt: CONFIG.GENERATION_PROMPT,
      n: 1,
      size: "1024x1024",
    });

    // Get the generated image data
    const imageData = response.data?.[0];
    
    if (!imageData) {
      throw new Error("No image generated from OpenAI");
    }

    let generatedBuffer: Buffer;

    // Handle both URL and base64 responses
    if (imageData.b64_json) {
      generatedBuffer = Buffer.from(imageData.b64_json, "base64");
    } else if (imageData.url) {
      // Download the generated image
      const imageResponse = await fetch(imageData.url);
      const arrayBuffer = await imageResponse.arrayBuffer();
      generatedBuffer = Buffer.from(arrayBuffer);
    } else {
      throw new Error("Invalid response from OpenAI");
    }

    // Save the clean HD image (never shown before purchase)
    const hdPath = path.join(generatedDir, `${imageId}-hd.png`);
    await sharp(generatedBuffer).png({ quality: 100 }).toFile(hdPath);

    // Create and save watermarked preview
    const previewPath = path.join(generatedDir, `${imageId}-preview.png`);
    await createWatermarkedImage(generatedBuffer, previewPath);

    // Store metadata (in production, use a database)
    const metadataPath = path.join(generatedDir, `${imageId}.json`);
    await fs.writeFile(
      metadataPath,
      JSON.stringify({
        id: imageId,
        createdAt: new Date().toISOString(),
        paid: false,
      })
    );

    return NextResponse.json({
      imageId,
      previewUrl: `/generated/${imageId}-preview.png`,
    });
  } catch (error) {
    console.error("Generation error:", error);

    // Handle specific OpenAI errors
    if (error instanceof OpenAI.APIError) {
      if (error.status === 401) {
        return NextResponse.json(
          { error: "Invalid OpenAI API key" },
          { status: 500 }
        );
      }
      if (error.status === 429) {
        return NextResponse.json(
          { error: "Too many requests. Please try again in a moment." },
          { status: 429 }
        );
      }
    }

    return NextResponse.json(
      { error: "Failed to generate portrait. Please try again." },
      { status: 500 }
    );
  }
}
