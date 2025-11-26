import { NextRequest, NextResponse } from "next/server";
import OpenAI from "openai";
import sharp from "sharp";
import { v4 as uuidv4 } from "uuid";
import { CONFIG } from "@/lib/config";
import { uploadImage, saveMetadata } from "@/lib/supabase";

// Create watermarked version of image
async function createWatermarkedImage(inputBuffer: Buffer): Promise<Buffer> {
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

export async function POST(request: NextRequest) {
  try {
    // Check for API key
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

    // Process original image for vision API
    const processedImage = await sharp(buffer)
      .resize(512, 512, { fit: "cover" })
      .jpeg({ quality: 85 })
      .toBuffer();

    const base64Image = processedImage.toString("base64");

    // Step 1: Use GPT-4o Vision to analyze the pet
    const visionResponse = await openai.chat.completions.create({
      model: "gpt-4o",
      messages: [
        {
          role: "user",
          content: [
            {
              type: "text",
              text: `Analyze this pet photo and provide a detailed description for creating a Renaissance oil painting portrait. Include:
1. Type of animal (dog, cat, etc.) and breed if identifiable
2. Fur/coat color and pattern
3. Eye color
4. Distinctive features (ear shape, markings, expression)
5. The pet's apparent personality/demeanor

Format your response as a single detailed paragraph that can be used as an art prompt.`,
            },
            {
              type: "image_url",
              image_url: {
                url: `data:image/jpeg;base64,${base64Image}`,
              },
            },
          ],
        },
      ],
      max_tokens: 500,
    });

    const petDescription = visionResponse.choices[0]?.message?.content || "a beloved pet";

    // Step 2: Generate Renaissance portrait with DALL-E 3
    const generationPrompt = `A highly detailed, classical oil painting style portrait of ${petDescription}, posed as nobility, seated on an ornate velvet cushion in a dimly lit, old-world aristocratic interior. The setting features rich baroque architecture with soft shadowed columns, stone steps, and dramatic chiaroscuro lighting reminiscent of 17th–18th century European royal portraiture.

The pet wears luxurious historical attire inspired by royal fashion — such as fur-trimmed robes, embroidered velvet cloaks, ruffled collars, pearl necklaces, or ornate medallions — with variations in fabric color, texture, and era styling (Renaissance, Baroque, or Victorian influences). Expression should feel dignified, composed, and slightly solemn, with carefully rendered fur, lifelike glassy eyes, and painterly brushstroke textures.

The cushion beneath the pet varies in design — deep emerald or sapphire velvet with gold tassels, brocade patterns with embroidered filigree, or plush silk pillows with royal insignias.

Color palette: rich and moody with warm golds, deep burgundies, forest greens, and shadowed browns. The atmosphere feels timeless, noble, and slightly dramatic — like a museum-quality heirloom portrait of a royal pet.

Ultra-detailed, realistic oil painting, soft diffused light, painterly texture, cinematic shadows, classical composition, museum-grade fine art.`;

    const imageResponse = await openai.images.generate({
      model: "dall-e-3",
      prompt: generationPrompt,
      n: 1,
      size: "1024x1024",
      quality: "hd",
      style: "vivid",
    });

    const generatedImageUrl = imageResponse.data?.[0]?.url;

    if (!generatedImageUrl) {
      throw new Error("No image generated");
    }

    // Download the generated image
    const downloadResponse = await fetch(generatedImageUrl);
    const arrayBuffer = await downloadResponse.arrayBuffer();
    const generatedBuffer = Buffer.from(arrayBuffer);

    // Create watermarked preview
    const watermarkedBuffer = await createWatermarkedImage(generatedBuffer);

    // Upload HD image to Supabase Storage
    const hdUrl = await uploadImage(
      generatedBuffer,
      `${imageId}-hd.png`,
      "image/png"
    );

    // Upload watermarked preview to Supabase Storage
    const previewUrl = await uploadImage(
      watermarkedBuffer,
      `${imageId}-preview.png`,
      "image/png"
    );

    // Save metadata to Supabase database
    await saveMetadata(imageId, {
      created_at: new Date().toISOString(),
      paid: false,
      pet_description: petDescription,
      hd_url: hdUrl,
      preview_url: previewUrl,
    });

    return NextResponse.json({
      imageId,
      previewUrl,
    });
  } catch (error) {
    console.error("Generation error:", error);

    // Handle specific OpenAI errors
    if (error instanceof OpenAI.APIError) {
      console.error("OpenAI API Error:", error.message, error.status);
      
      if (error.status === 401) {
        return NextResponse.json(
          { error: "Invalid API key. Please check your configuration." },
          { status: 500 }
        );
      }
      if (error.status === 429) {
        return NextResponse.json(
          { error: "Too many requests. Please try again in a moment." },
          { status: 429 }
        );
      }
      if (error.status === 400) {
        return NextResponse.json(
          { error: "Invalid request. Please try a different image." },
          { status: 400 }
        );
      }
    }

    return NextResponse.json(
      { error: "Failed to generate portrait. Please try again." },
      { status: 500 }
    );
  }
}
