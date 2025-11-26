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
    // Check for API keys - need either OpenAI or xAI
    const useGrok = !!process.env.XAI_API_KEY;
    
    if (!process.env.OPENAI_API_KEY && !process.env.XAI_API_KEY) {
      return NextResponse.json(
        { error: "No API key configured (need OPENAI_API_KEY or XAI_API_KEY)" },
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

    // Initialize API clients
    // Use Grok (xAI) for everything if available, otherwise fall back to OpenAI
    const grok = useGrok ? new OpenAI({
      apiKey: process.env.XAI_API_KEY,
      baseURL: "https://api.x.ai/v1",
    }) : null;
    
    const openai = process.env.OPENAI_API_KEY ? new OpenAI({
      apiKey: process.env.OPENAI_API_KEY,
    }) : null;
    
    // Use Grok for BOTH vision and image generation if available
    const visionClient = grok || openai!;
    const imageClient = grok || openai!;
    
    console.log(`Using ${grok ? 'Grok' : 'OpenAI'} for vision analysis`);
    console.log(`Using ${grok ? 'Grok' : 'OpenAI'} for image generation`);

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

    // Step 1: Use vision model to analyze the pet with extreme detail for accuracy
    // Grok uses grok-2-vision, OpenAI uses gpt-4o
    const visionModel = grok ? "grok-2-vision-1212" : "gpt-4o";
    const visionResponse = await visionClient.chat.completions.create({
      model: visionModel,
      messages: [
        {
          role: "user",
          content: [
            {
              type: "text",
              text: `You are an expert pet portrait artist. Analyze this pet photo with EXTREME PRECISION to capture THIS EXACT pet - not a generic version of the breed.

CRITICAL: Start your response with the EXACT species in caps:
"[DOG] This is a..." or "[CAT] This is a..." or "[RABBIT] This is a..."

Describe THIS SPECIFIC PET in meticulous detail:

1. SPECIES & BREED: Exact animal type and specific breed or mix.

2. COAT COLOR - BE EXTREMELY PRECISE:
   - BLACK fur = "JET BLACK" or "SOLID BLACK" (never say gray/charcoal)
   - WHITE fur = "PURE WHITE" or "SNOW WHITE"
   - Other colors: be very specific ("golden honey blonde", "rich chocolate brown", "warm ginger orange")
   - Describe ANY patterns: tabby stripes, spots, patches, brindle, ticking

3. FACE STRUCTURE & PROPORTIONS:
   - Head shape (round, wedge, square, dome-shaped)
   - Muzzle: length (short/medium/long), width, shape
   - Nose: color, size, shape
   - Distance between eyes (close-set, wide-set, normal)

4. EARS - VERY IMPORTANT:
   - Shape (pointed, rounded, folded, floppy, erect, semi-erect)
   - Size relative to head (large, small, proportionate)
   - Position (high-set, low-set, wide apart)
   - Inner ear color

5. EYES:
   - EXACT color (emerald green, copper amber, ice blue, warm brown, heterochromia)
   - Shape (round, almond, oval)
   - Size and expression

6. UNIQUE IDENTIFIERS - What makes THIS pet unique:
   - Specific markings (white blaze, chest patch, sock feet, facial mask)
   - Any asymmetry or distinctive features
   - Whisker patterns, eyebrow markings
   - Scars, spots, or color variations

7. BODY PROPORTIONS:
   - Build (slender, stocky, muscular, petite)
   - Leg length relative to body
   - Overall size impression

8. FUR TEXTURE: Length (short/medium/long), texture (silky, fluffy, wiry, sleek, plush)

FORMAT: "[SPECIES] This is a [breed] with [exact coat color] fur. [Detailed description...]"

IMPORTANT: This description must capture what makes THIS SPECIFIC PET unique and recognizable to their owner - not just a generic breed description.`,
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
      max_tokens: 800,
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
      "soft SAGE GREEN velvet cushion with delicate gold vine and pink rose embroidery, silk tassels at corners",
      "muted DUSTY ROSE velvet cushion with gold floral scrollwork embroidery and braided gold trim",
      "elegant FOREST GREEN plush velvet cushion with gold leaf embroidery and antique gold tassels",
      "soft SLATE GRAY velvet cushion with gold and rose floral embroidery, silk fringe trim",
      "muted OLIVE GREEN velvet cushion with delicate pink flower embroidery and gold piping",
      "dusty TEAL velvet cushion with gold botanical embroidery and corner rosettes",
      "soft BURGUNDY velvet cushion with cream and gold floral pattern, silk tassels",
      "muted NAVY velvet cushion with gold vine embroidery and antique brass trim"
    ];
    
    const robes = [
      "elegant IVORY CREAM silk robe with delicate gold and pink floral embroidery, white ermine fur trim with black spots, and lace collar",
      "soft DUSTY BLUE satin cape with gold thread rose embroidery, pristine ermine trim with spots, and delicate lace ruff",
      "refined CHAMPAGNE GOLD brocade mantle with floral patterns, white ermine lining with black spots, and pearl buttons",
      "graceful SOFT GRAY velvet robe with silver floral embroidery, ermine collar with spots, and antique lace trim",
      "delicate BLUSH PINK silk cloak with gold botanical embroidery, ermine fur trim, and layered lace collar",
      "classic DEEP BURGUNDY velvet cape with gold rose embroidery, spotted ermine collar, and cream lace ruff",
      "sophisticated SLATE BLUE velvet robe with silver and gold floral details, ermine trim, and delicate lace accents",
      "timeless ANTIQUE WHITE damask robe with gold vine embroidery, spotted ermine lapels, and fine lace collar"
    ];
    
    const jewelry = [
      "layered gold chains with delicate pearl strands and small ruby pendant, elegant and refined",
      "multiple pearl necklaces layered together with a gold floral centerpiece and teardrop gem",
      "delicate gold filigree collar with rose-pink gems and small pearl drops",
      "layered antique gold necklaces with cameo pendant and pearl accents",
      "elegant triple-strand pearl choker with gold flower clasp and small gemstone",
      "refined gold chain with floral gem clusters in pink and gold, layered with pearls",
      "multiple delicate chains - pearls, gold links, and a small ornate pendant",
      "layered jewelry: pearl strand, gold chain with pendant, and delicate gem necklace"
    ];
    
    const backgrounds = [
      "DARK rich brown/black old master background with subtle burgundy velvet drape visible on one side",
      "DEEP shadowy background in warm umber tones with a hint of dark teal curtain",
      "DARK atmospheric backdrop fading to black with subtle crimson drapery accent",
      "MOODY dark brown classical background with soft dusty rose velvet drape",
      "SHADOWY rich black/brown backdrop with glimpse of deep green velvet curtain",
      "DARK old master style background with subtle gold-brown tones and burgundy fabric",
      "DEEP umber/black atmospheric backdrop with hint of dusty blue silk drape",
      "CLASSIC dark portrait background in rich browns with muted plum velvet accent"
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

===== CRITICAL: PET ACCURACY REQUIREMENTS =====
THIS IS A SPECIFIC ${species}, NOT A GENERIC ONE. The portrait must look like THIS EXACT PET.

1. SPECIES: This is a ${species}. Generate ONLY a ${species}. ${notSpecies}

2. PHYSICAL ACCURACY - MUST MATCH EXACTLY:
   - Face shape, muzzle length, and proportions as described
   - Ear shape, size, and position as described
   - Eye color and shape as described
   - ALL markings and patterns in the correct locations
   - Body proportions and build as described

3. COLOR ACCURACY: 
   - BLACK fur = TRUE BLACK/JET BLACK (never gray or dark brown)
   - WHITE fur = PURE BRIGHT WHITE (never gray or cream)
   - Match ALL colors EXACTLY as described

4. THIS IS A SPECIFIC PET: The owner must instantly recognize their pet. Replicate the EXACT features described - this is not a generic ${species}, it's THEIR ${species}.

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

===== LIGHTING (LUMINOUS OLD MASTER STYLE) =====
- ${lighting}
- Classic Rembrandt/old master lighting - dark background with the subject BEAUTIFULLY ILLUMINATED
- The ${species}'s face and features should be BRIGHT, WELL-LIT, and clearly visible
- Soft, flattering light that brings out fur texture and fabric details

BRIGHT WHITES - VERY IMPORTANT:
- WHITES must be BRIGHT, CLEAN, PURE WHITE - never muted, grayish, or dingy
- White ermine fur should be LUMINOUS, GLOWING WHITE with crisp black spots
- Lace collars and white fabrics should be BRIGHT and RADIANT
- Pearls should gleam with bright white highlights
- Any white fur on the pet should be TRUE BRIGHT WHITE

- Rich, elegant colors - not washed out, not overly saturated
- NO harsh orange/sepia cast
- Dark atmospheric background making the bright subject POP

===== ARTISTIC STYLE (LUMINOUS OLD MASTER OIL PAINTING) =====
- Museum-quality oil painting with LUMINOUS, GLOWING quality
- Rich oil painting GLAZING technique - layers of translucent color creating depth and inner glow
- SILKY, LUMINOUS quality to fur and fabrics - like soft light emanating from within
- Vermeer-like luminosity - that magical soft glow that makes old master paintings so captivating
- Visible brushwork with smooth, refined blending
- The ${species} should look NOBLE, DIGNIFIED, and beautifully lit

OIL PAINTING GLOW EFFECTS:
- Soft ETHEREAL GLOW on highlights - especially on fur, fabrics, and jewelry
- Silky, lustrous sheen on velvet and satin
- Pearls and gems should have inner luminosity
- Fur should look soft and touchable with subtle highlights
- Overall painting should have a RADIANT, LUMINOUS quality - not flat or matte

AESTHETIC DETAILS:
- DARK moody background contrasting with the GLOWING, well-lit subject
- Soft, elegant color palette - dusty blues, sage greens, ivory, blush pink, soft burgundy
- Delicate floral embroidery on fabrics - roses, vines, botanical patterns
- White ermine fur with distinctive BLACK SPOTS - should GLOW with brightness
- Delicate LACE collars and ruffs - intricate, refined, and luminous
- LAYERED jewelry - pearls and gold with beautiful light reflections
- Velvet textures with rich depth and silky sheen
- Overall feeling: LUMINOUS, ELEGANT, GLOWING - like a treasured masterpiece

!!!!! FINAL ACCURACY CHECK !!!!!
- This MUST be a ${species}. ${notSpecies}
- The ${species} MUST look like the SPECIFIC pet described - same face, same markings, same proportions
- The owner must be able to recognize THIS IS THEIR PET, not just a generic ${species}
!!!!!`;

    // Use appropriate image generation model
    // Prioritize Grok if available
    const imageModel = grok ? "grok-2-image" : "gpt-image-1";
    
    const imageResponse = await imageClient.images.generate({
      model: imageModel,
      prompt: generationPrompt,
      n: 1,
      size: "1024x1024",
      ...(!grok ? { quality: "high" } : {}), // quality param only for OpenAI
    });

    const imageData = imageResponse.data?.[0];

    if (!imageData) {
      throw new Error("No image generated");
    }

    let generatedBuffer: Buffer;

    // Handle both base64 and URL responses
    if (imageData.b64_json) {
      // gpt-image-1 and grok return base64
      generatedBuffer = Buffer.from(imageData.b64_json, "base64");
    } else if (imageData.url) {
      // Some models return URL
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
