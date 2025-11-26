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
  console.log("=== Generate API called ===");
  
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
              text: `FIRST: What animal is this? Start your response with EXACTLY one of these: [CAT] or [DOG] or [RABBIT]

This is CRITICAL - identify the species correctly:
- If it has whiskers, pointed ears, and a small nose = [CAT]
- If it has a snout/muzzle and floppy or pointed dog ears = [DOG]

Start with [CAT] or [DOG] in brackets, then describe:

SECTION 1 - WHAT MAKES THIS PET UNIQUE (most important):
List 3-5 distinctive features that set THIS pet apart from others of the same breed. Focus on:
- Any asymmetrical features or unusual markings
- Unique color patterns or patches (describe exact location)
- Distinctive facial expression or "look"
- Anything that makes this pet special/recognizable

SECTION 2 - FACE (critical for recognition):
- Face shape: Is it round like a circle, long/narrow, wedge-shaped, or square?
- Eye spacing: Are eyes close together, wide apart, or normal?
- Eye color: Use comparisons (like amber honey, dark chocolate, bright emerald, sky blue)
- Nose: Color (pink, black, brown, spotted) and size
- Muzzle: Short/medium/long, width

SECTION 3 - EARS:
- Shape and size RELATIVE to the head (large ears? small ears?)
- Position: High on head, low, wide apart?
- Pointed, rounded, floppy, or folded?

SECTION 4 - COLORING:
- Main fur color using comparisons (honey gold, charcoal gray, snow white, midnight black, caramel brown)
- Any color gradients (darker on back, lighter underneath?)
- Specific markings and their EXACT locations

SECTION 5 - FUR TYPE:
- Length and texture (short sleek, medium fluffy, long silky, wiry)

Format your response as: "[SPECIES] UNIQUE FEATURES: [list the 3-5 most distinctive things]. FACE: [face details]. EARS: [ear details]. COLORING: [color details]. FUR: [texture]."`,
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

    let petDescription = visionResponse.choices[0]?.message?.content || "a beloved pet";

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
      "BRIGHT EMERALD GREEN silk velvet cushion with gold scrollwork embroidery and golden tassels",
      "RICH JADE GREEN plush velvet cushion with pink rose and gold vine embroidery, silk tassels",
      "VIBRANT TEAL satin cushion with gold floral embroidery and corner rosettes",
      "DEEP FOREST GREEN velvet cushion with delicate pink flowers and gold leaf trim",
      "BRIGHT SAGE GREEN silk cushion with gold botanical embroidery and golden fringe",
      "RICH OLIVE GREEN velvet cushion with pink and gold floral pattern, silk tassels",
      "JEWEL-TONE GREEN plush cushion with ornate gold scrollwork and corner tassels",
      "SATURATED HUNTER GREEN velvet cushion with gold embroidery and silk trim"
    ];
    
    const robes = [
      "BRIGHT IVORY CREAM silk robe with colorful floral embroidery (pink roses, green leaves, gold accents), white ermine fur trim with black spots, delicate lace collar",
      "SHIMMERING SKY BLUE satin cape with pink and gold rose embroidery, pristine ermine trim with spots, ornate lace ruff",
      "LUMINOUS CHAMPAGNE GOLD brocade mantle with colorful floral patterns (pink, green, gold), white ermine lining with black spots",
      "RICH CHARCOAL GRAY velvet robe with gold and pink floral embroidery, spotted ermine collar, cream lace trim",
      "SILKY BLUSH PINK satin cloak with gold and green botanical embroidery, ermine fur trim, layered lace collar",
      "DEEP BURGUNDY velvet cape with bright gold rose embroidery and pink accents, spotted ermine collar, cream lace ruff",
      "BRIGHT PERIWINKLE BLUE satin robe with gold and pink floral details, ermine trim, delicate lace accents",
      "LUMINOUS ANTIQUE WHITE silk damask robe with colorful embroidery (gold vines, pink flowers, green leaves), spotted ermine lapels"
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
      "DARK background with RICH BURGUNDY velvet drape on one side and golden accent on the other",
      "DEEP shadowy background with VIBRANT TEAL silk curtain and warm gold column",
      "DARK atmospheric backdrop with BRIGHT CRIMSON velvet drapery cascading on the side",
      "MOODY dark background with RICH MAGENTA velvet drape and gold architectural detail",
      "SHADOWY backdrop with DEEP EMERALD GREEN velvet curtain and warm candlelight glow",
      "DARK old master background with SATURATED BURGUNDY and GOLD silk drapes",
      "DEEP black backdrop with BRIGHT ROYAL BLUE silk drape and gilded frame edge",
      "CLASSIC dark background with RICH PLUM velvet and TEAL accents visible"
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

    // Step 2: Generate Renaissance royal portrait - SPECIES AND PET ACCURACY ARE #1 PRIORITY
    const generationPrompt = `THIS IS A ${species}. Generate a ${species}. ${notSpecies}

=== THE ${species} - MUST MATCH EXACTLY ===
${petDescription}

This ${species} portrait must look like THIS EXACT ${species}. ${notSpecies}

=== STYLE: BRIGHT, COLORFUL, SILKY OIL PAINTING ===
Classical oil painting with BRIGHT, SATURATED colors and SILKY luminous textures.

KEY QUALITIES:
- BRIGHT, VIBRANT colors - rich greens, warm golds, colorful embroidery
- SILKY, LUMINOUS fabric textures - shimmering satin, plush velvet
- Well-lit subject against dark background - the pet GLOWS with light
- Colorful floral embroidery details on fabrics (pink roses, gold, green leaves)
- Soft, smooth brushwork with luminous glazing technique
- Rich jewel tones throughout

The ${species} wears ${robe}, sits on ${cushion}, adorned with ${jewelryItem}. ${background}. Bright, flattering light illuminating the subject beautifully. Museum-quality fine art with rich, saturated colors.`;

    // Generate image with GPT-Image-1 (OpenAI's newest image model)
    console.log("Generating image with gpt-image-1...");
    
    // gpt-image-1 supports longer prompts than DALL-E 3
    console.log("Prompt length:", generationPrompt.length);
    
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
    let generatedBuffer: Buffer;
    
    if (imageData.b64_json) {
      console.log("Processing base64 image from gpt-image-1...");
      generatedBuffer = Buffer.from(imageData.b64_json, "base64");
    } else if (imageData.url) {
      console.log("Downloading image from URL...");
      const downloadResponse = await fetch(imageData.url);
      if (!downloadResponse.ok) {
        throw new Error(`Failed to download image: ${downloadResponse.status}`);
      }
      const arrayBuffer = await downloadResponse.arrayBuffer();
      generatedBuffer = Buffer.from(arrayBuffer);
    } else {
      throw new Error("No image data in response");
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

    // Validate URLs before saving
    try {
      new URL(hdUrl);
      new URL(previewUrl);
    } catch (urlError) {
      console.error("Invalid URL format:", urlError);
      throw new Error("Failed to generate valid image URLs");
    }

    // Save metadata to Supabase database
    // Truncate pet_description if too long (some databases have length limits)
    const maxDescriptionLength = 2000; // Safe limit
    const truncatedDescription = petDescription.length > maxDescriptionLength 
      ? petDescription.substring(0, maxDescriptionLength) 
      : petDescription;
    
    try {
      // Validate each field individually to identify which one fails
      console.log("Saving metadata with:", {
        imageId,
        descriptionLength: truncatedDescription.length,
        hdUrl: hdUrl.substring(0, 50) + "...",
        previewUrl: previewUrl.substring(0, 50) + "...",
      });
      
      await saveMetadata(imageId, {
        created_at: new Date().toISOString(),
        paid: false,
        pet_description: truncatedDescription,
        hd_url: hdUrl,
        preview_url: previewUrl,
      });
      console.log("Metadata saved successfully");
    } catch (metadataError) {
      console.error("Metadata save error:", metadataError);
      const errorMsg = metadataError instanceof Error ? metadataError.message : String(metadataError);
      console.error("Full error:", errorMsg);
      console.error("Error details:", JSON.stringify(metadataError, null, 2));
      
      // If it's a pattern validation error, try to identify the problematic field
      if (errorMsg.includes("pattern") || errorMsg.includes("String did not match")) {
        // Re-throw with more context
        throw new Error(`Database validation error: ${errorMsg}. This may be caused by special characters in the pet description.`);
      }
      
      // For other errors, continue anyway - images are uploaded
      console.warn("Continuing despite metadata save error - images are available");
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
