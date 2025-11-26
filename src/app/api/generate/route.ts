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

    // Log for debugging
    console.log("Pet description from vision:", petDescription);

    // Extract species from the description (format: [DOG], [CAT], etc.)
    const speciesMatch = petDescription.match(/\[(DOG|CAT|RABBIT|BIRD|HAMSTER|GUINEA PIG|FERRET|HORSE|PET)\]/i);
    let species = speciesMatch ? speciesMatch[1].toUpperCase() : "";
    
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
    
    // Create negative species instruction
    const notSpecies = species === "DOG" ? "DO NOT generate a cat or any feline." 
                     : species === "CAT" ? "DO NOT generate a dog or any canine."
                     : `DO NOT generate any animal other than a ${species}.`;
    
    console.log("Detected species:", species);

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
      "soft dove gray background with dusty blue velvet drapes and white marble column",
      "light cream wall with sage green curtains and silver-framed mirror",
      "pale stone gray interior with ivory silk drapes and classical sculpture",
      "muted blue-gray backdrop with soft white curtains and porcelain vase",
      "light taupe wall with cool gray drapery and antique books",
      "soft silver-gray study with pale blue accents and crystal chandelier",
      "creamy ivory background with muted teal curtains and gilded frame",
      "cool neutral gray backdrop with blush pink drapery and marble bust"
    ];
    
    const lightingDirections = [
      "bright natural daylight from upper left, creating soft shadows",
      "clean diffused light from the left, with gentle fill light",
      "bright studio lighting from above and left, evenly illuminated",
      "soft natural window light from the left, bright and airy"
    ];

    // Pick random elements
    const cushion = cushions[Math.floor(Math.random() * cushions.length)];
    const robe = robes[Math.floor(Math.random() * robes.length)];
    const jewelryItem = jewelry[Math.floor(Math.random() * jewelry.length)];
    const background = backgrounds[Math.floor(Math.random() * backgrounds.length)];
    const lighting = lightingDirections[Math.floor(Math.random() * lightingDirections.length)];

    // Step 2: Generate Renaissance royal portrait with DALL-E
    const generationPrompt = `!!!!! CRITICAL - THIS IS A ${species} !!!!!
Generate a portrait of a ${species}. ${notSpecies}

===== SPECIES VERIFICATION =====
Animal type: ${species}
${notSpecies}
The subject is a ${species}. Only generate a ${species}.

===== THE SUBJECT (${species}) =====
${petDescription}

===== REQUIREMENTS =====
1. SPECIES: This is a ${species}. Generate ONLY a ${species}. ${notSpecies}
2. COLOR ACCURACY: 
   - If described as BLACK fur, paint it TRUE BLACK/JET BLACK (not gray, not dark brown)
   - If described as WHITE fur, paint it PURE WHITE
   - Match the EXACT colors described above
3. The ${species} must be recognizable as the specific animal described

===== COMPOSITION (WIDE SHOT - PULL BACK) =====
- Frame from a DISTANCE showing the ${species}'s FULL BODY with generous space around
- The ${species} should occupy only 40-50% of the frame height
- Show LOTS of background and environment around the subject
- Include the complete cushion, visible floor, and architectural elements
- The scene should feel like a full room portrait, not a close-up

===== UNIQUE ELEMENTS FOR THIS PAINTING =====
- CUSHION: ${cushion}
- ATTIRE: ${robe}
- JEWELRY: ${jewelryItem}
- SETTING: ${background}

===== LIGHTING & COLOR (BRIGHT, NEUTRAL, HIGH WHITE BALANCE) =====
- ${lighting}
- HIGH WHITE BALANCE - NO orange cast, NO sepia tones, NO yellowed colors
- Clean, bright color palette with TRUE-TO-LIFE colors
- Soft shadows, well-illuminated scene - the ${species}'s features clearly visible
- Cool to neutral color temperature - like a professional photograph
- AVOID: warm/orange tint, grungy look, muddy colors, aged appearance

===== ARTISTIC STYLE =====
- Classical oil painting with visible brushstrokes and canvas texture
- Museum-quality Dutch Golden Age portraiture style
- Noble, dignified ${species} pose - seated regally on the cushion
- Unique artistic interpretation - like a one-of-a-kind commissioned painting

!!!!! FINAL CHECK: This portrait MUST show a ${species}. ${notSpecies} !!!!!`;

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

    // TODO: Change back to previewUrl for production (watermarked version)
    return NextResponse.json({
      imageId,
      previewUrl: hdUrl, // Using HD URL for testing - no watermark
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
