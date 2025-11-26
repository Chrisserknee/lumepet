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

    // Randomize elements for unique paintings
    const cushions = [
      "deep emerald green velvet cushion with gold floral embroidery and silk tassels",
      "rich burgundy velvet cushion with silver damask pattern and braided trim",
      "royal blue satin cushion with gold leaf scrollwork and pearl beading",
      "deep purple velvet cushion with gold heraldic embroidery and fringe",
      "crimson silk cushion with intricate gold brocade and corner rosettes",
      "forest green velvet ottoman with antique gold filigree trim",
      "navy blue velvet cushion with silver thread arabesques and tassels",
      "wine red damask cushion with gold crest embroidery and silk piping"
    ];
    
    const robes = [
      "deep crimson velvet robe with white ermine fur collar and gold clasps",
      "royal purple velvet cape with ermine trim and pearl buttons",
      "midnight blue velvet mantle with silver fox fur lining",
      "burgundy brocade coat with gold embroidery and ermine cuffs",
      "emerald green velvet cloak with sable fur trim and jeweled brooch",
      "rich maroon satin robe with gold damask pattern and ermine collar",
      "deep plum velvet cape with chinchilla fur trim and ruby clasp",
      "antique gold brocade jacket with ermine lapels and emerald buttons"
    ];
    
    const jewelry = [
      "heavy gold chain with large ruby-studded medallion",
      "pearl strand necklace with emerald pendant",
      "ornate gold collar with sapphire centerpiece",
      "antique silver chain with diamond-encrusted locket",
      "gold rope necklace with carved jade medallion",
      "jeweled gold torque with amethyst drops",
      "pearl and gold choker with cameo pendant",
      "layered gold chains with family crest medallion"
    ];
    
    const backgrounds = [
      "warm sienna background with burgundy velvet drapes and marble column",
      "rich umber backdrop with olive green curtains and gilded frame visible",
      "deep brown study with leather-bound books and brass candlestick",
      "warm ochre wall with tapestry glimpse and wooden paneling",
      "muted amber background with wine-colored drapery and ornate mirror",
      "soft brown interior with brocade curtains and antique vase",
      "golden-brown library setting with globe and quill on desk",
      "warm sepia backdrop with velvet curtains parted to show landscape"
    ];
    
    const lightingDirections = [
      "from upper left, creating gentle shadows on the right",
      "from the left side, with soft fill light from the right",
      "from above and slightly left, with warm reflected light below",
      "soft diffused light from a window on the left side"
    ];

    // Pick random elements
    const cushion = cushions[Math.floor(Math.random() * cushions.length)];
    const robe = robes[Math.floor(Math.random() * robes.length)];
    const jewelryItem = jewelry[Math.floor(Math.random() * jewelry.length)];
    const background = backgrounds[Math.floor(Math.random() * backgrounds.length)];
    const lighting = lightingDirections[Math.floor(Math.random() * lightingDirections.length)];

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

===== COMPOSITION (WIDE SHOT - PULL BACK) =====
- Frame from a DISTANCE showing the pet's FULL BODY with generous space around
- The pet should occupy only 40-50% of the frame height
- Show LOTS of background and environment around the subject
- Include the complete cushion, visible floor, and architectural elements
- The scene should feel like a full room portrait, not a close-up

===== UNIQUE ELEMENTS FOR THIS PAINTING =====
- CUSHION: ${cushion}
- ATTIRE: ${robe}
- JEWELRY: ${jewelryItem}
- SETTING: ${background}

===== LIGHTING (BRIGHT BUT CLASSICAL) =====
- Warm golden light ${lighting}
- Soft shadows, NOT overly dark or muddy
- Rich but BRIGHT palette - pet's features clearly visible
- Overall warm, inviting atmosphere

===== ARTISTIC STYLE =====
- Classical oil painting with visible brushstrokes and canvas texture
- Museum-quality Dutch Golden Age portraiture style
- Noble, dignified pose - seated regally on the cushion
- Unique artistic interpretation - like a one-of-a-kind commissioned painting`;

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
