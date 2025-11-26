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

    // Step 1: Use GPT-4o Vision to analyze the pet with extreme detail for accuracy
    const visionResponse = await openai.chat.completions.create({
      model: "gpt-4o",
      messages: [
        {
          role: "user",
          content: [
            {
              type: "text",
              text: `You are an expert pet portrait artist. Analyze this pet photo with EXTREME PRECISION.

CRITICAL: Start your response with the EXACT species in caps, like this:
"[DOG] This is a..." or "[CAT] This is a..." or "[RABBIT] This is a..."

Then describe in meticulous detail:

1. SPECIES & BREED: Exact animal type (DOG, CAT, RABBIT, etc.) and specific breed. Be very precise.

2. COAT COLOR - BE EXTREMELY PRECISE:
   - If the fur is BLACK, say "JET BLACK" or "SOLID BLACK" - do NOT say dark gray or charcoal
   - If the fur is WHITE, say "PURE WHITE" 
   - For other colors, be specific: "golden blonde", "chocolate brown", "ginger orange"
   - Note any patterns: tabby stripes, spots, patches, etc.

3. FACE: Head shape, muzzle length, nose color, ear shape (pointed/floppy/folded)

4. EYES: Exact color (green, amber, blue, brown), shape, expression

5. DISTINCTIVE MARKINGS: Any unique features - white patches, facial markings, etc.

6. FUR TEXTURE: Short, medium, long, fluffy, sleek, wiry

FORMAT YOUR RESPONSE EXACTLY LIKE THIS:
"[SPECIES] This is a [breed] with [exact coat color] fur..."

The description must be accurate enough that the owner instantly recognizes their specific pet.`,
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
      max_tokens: 600,
    });

    const petDescription = visionResponse.choices[0]?.message?.content || "a beloved pet";

    // Extract species from the description (format: [DOG], [CAT], etc.)
    const speciesMatch = petDescription.match(/\[(DOG|CAT|RABBIT|BIRD|HAMSTER|GUINEA PIG|FERRET|HORSE|PET)\]/i);
    const species = speciesMatch ? speciesMatch[1].toUpperCase() : "PET";

    // Step 2: Generate Renaissance royal portrait with DALL-E
    const generationPrompt = `IMPORTANT: Generate a portrait of a ${species}, NOT any other animal.

Create a classical oil painting portrait in the Dutch Golden Age style.

===== THE SUBJECT (MUST MATCH EXACTLY) =====
${petDescription}

===== CRITICAL REQUIREMENTS =====
1. SPECIES: This MUST be a ${species}. Do NOT generate any other type of animal.
2. COLOR ACCURACY: 
   - If described as BLACK fur, paint it TRUE BLACK/JET BLACK (not gray, not dark brown)
   - If described as WHITE fur, paint it PURE WHITE
   - Match the EXACT colors described above
3. The pet must be recognizable as the specific animal described

===== COMPOSITION (MEDIUM-WIDE SHOT) =====
- Frame the subject from mid-distance showing FULL BODY on the cushion
- Include substantial background space around the subject
- The pet should occupy about 60% of the frame height, not filling the entire canvas
- Show the complete velvet cushion with decorative tassels at corners
- Include visible floor space in front of the cushion

===== ROYAL ATTIRE =====
- Luxurious velvet robe or cape (burgundy, crimson, or purple) with ermine fur trim
- Ornate gold medallion necklace with gemstone
- Pet posed regally on an emerald/teal velvet cushion with gold embroidered scrollwork

===== LIGHTING (BRIGHT BUT CLASSICAL) =====
- Well-lit scene with warm golden lighting from upper left
- Soft shadows, NOT overly dark or muddy
- Rich but BRIGHT color palette - the pet's features should be clearly visible
- Warm amber/golden tones throughout
- Background: warm brown with subtle velvet drapery, but NOT too dark

===== ARTISTIC STYLE =====
- Classical oil painting with visible brushstrokes
- Museum-quality Dutch Golden Age portraiture
- Noble, dignified expression
- Three-quarter view pose with front paws on cushion`;

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

    let generatedBuffer: Buffer;

    // Handle both base64 and URL responses
    if (imageData.b64_json) {
      // gpt-image-1 returns base64
      generatedBuffer = Buffer.from(imageData.b64_json, "base64");
    } else if (imageData.url) {
      // DALL-E 3 returns URL
      const downloadResponse = await fetch(imageData.url);
      const arrayBuffer = await downloadResponse.arrayBuffer();
      generatedBuffer = Buffer.from(arrayBuffer);
    } else {
      throw new Error("Invalid image response format");
    }

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

    // Get detailed error message
    let errorMessage = "Failed to generate portrait. Please try again.";
    let statusCode = 500;

    if (error instanceof OpenAI.APIError) {
      console.error("OpenAI API Error:", error.message, error.status, error.code);
      
      if (error.status === 401) {
        errorMessage = "Invalid API key. Please check your configuration.";
      } else if (error.status === 429) {
        errorMessage = "Too many requests. Please try again in a moment.";
        statusCode = 429;
      } else if (error.status === 400) {
        errorMessage = `Invalid request: ${error.message}`;
        statusCode = 400;
      } else if (error.message.includes("content_policy")) {
        errorMessage = "Image couldn't be generated due to content policy. Please try a different photo.";
        statusCode = 400;
      } else {
        errorMessage = `OpenAI Error: ${error.message}`;
      }
    } else if (error instanceof Error) {
      errorMessage = `Error: ${error.message}`;
      console.error("Error details:", error.stack);
    }

    return NextResponse.json(
      { error: errorMessage },
      { status: statusCode }
    );
  }
}
