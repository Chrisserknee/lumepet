import { NextRequest, NextResponse } from "next/server";
import OpenAI from "openai";
import sharp from "sharp";
import { v4 as uuidv4 } from "uuid";
import { CONFIG } from "@/lib/config";
import { uploadImage, saveMetadata } from "@/lib/supabase";
import { checkRateLimit, getClientIP, RATE_LIMITS } from "@/lib/rate-limit";
import { validateImageMagicBytes } from "@/lib/validation";

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
  const watermarkSvg = `
    <svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg">
      <!-- NO CENTER WATERMARK - keep pet's face clearly visible -->
      
      <!-- Top-left corner (larger, 45% opacity) -->
      <image 
        x="${Math.round(width * 0.05)}" 
        y="${Math.round(height * 0.05)}" 
        width="${Math.round(watermarkWidth * 0.6)}" 
        height="${Math.round(watermarkHeight * 0.6)}" 
        href="data:${logoMimeType};base64,${logoBase64}"
        opacity="0.45"
      />
      <!-- Top-right corner (larger, 45% opacity) -->
      <image 
        x="${Math.round(width * 0.95 - watermarkWidth * 0.6)}" 
        y="${Math.round(height * 0.05)}" 
        width="${Math.round(watermarkWidth * 0.6)}" 
        height="${Math.round(watermarkHeight * 0.6)}" 
        href="data:${logoMimeType};base64,${logoBase64}"
        opacity="0.45"
      />
      <!-- Bottom-left corner (larger, 45% opacity) -->
      <image 
        x="${Math.round(width * 0.05)}" 
        y="${Math.round(height * 0.95 - watermarkHeight * 0.6)}" 
        width="${Math.round(watermarkWidth * 0.6)}" 
        height="${Math.round(watermarkHeight * 0.6)}" 
        href="data:${logoMimeType};base64,${logoBase64}"
        opacity="0.45"
      />
      <!-- Bottom-right corner (larger, 45% opacity) -->
      <image 
        x="${Math.round(width * 0.95 - watermarkWidth * 0.6)}" 
        y="${Math.round(height * 0.95 - watermarkHeight * 0.6)}" 
        width="${Math.round(watermarkWidth * 0.6)}" 
        height="${Math.round(watermarkHeight * 0.6)}" 
        href="data:${logoMimeType};base64,${logoBase64}"
        opacity="0.45"
      />
      <!-- Top center (medium, 40% opacity) -->
      <image 
        x="${Math.round((width - watermarkWidth * 0.5) / 2)}" 
        y="${Math.round(height * 0.02)}" 
        width="${Math.round(watermarkWidth * 0.5)}" 
        height="${Math.round(watermarkHeight * 0.5)}" 
        href="data:${logoMimeType};base64,${logoBase64}"
        opacity="0.4"
      />
      <!-- Bottom center (medium, 40% opacity) -->
      <image 
        x="${Math.round((width - watermarkWidth * 0.5) / 2)}" 
        y="${Math.round(height * 0.98 - watermarkHeight * 0.5)}" 
        width="${Math.round(watermarkWidth * 0.5)}" 
        height="${Math.round(watermarkHeight * 0.5)}" 
        href="data:${logoMimeType};base64,${logoBase64}"
        opacity="0.4"
      />
      <!-- Left edge upper (35% opacity) -->
      <image 
        x="${Math.round(width * 0.02)}" 
        y="${Math.round(height * 0.30)}" 
        width="${Math.round(watermarkWidth * 0.45)}" 
        height="${Math.round(watermarkHeight * 0.45)}" 
        href="data:${logoMimeType};base64,${logoBase64}"
        opacity="0.35"
      />
      <!-- Left edge lower (35% opacity) -->
      <image 
        x="${Math.round(width * 0.02)}" 
        y="${Math.round(height * 0.60)}" 
        width="${Math.round(watermarkWidth * 0.45)}" 
        height="${Math.round(watermarkHeight * 0.45)}" 
        href="data:${logoMimeType};base64,${logoBase64}"
        opacity="0.35"
      />
      <!-- Right edge upper (35% opacity) -->
      <image 
        x="${Math.round(width * 0.98 - watermarkWidth * 0.45)}" 
        y="${Math.round(height * 0.30)}" 
        width="${Math.round(watermarkWidth * 0.45)}" 
        height="${Math.round(watermarkHeight * 0.45)}" 
        href="data:${logoMimeType};base64,${logoBase64}"
        opacity="0.35"
      />
      <!-- Right edge lower (35% opacity) -->
      <image 
        x="${Math.round(width * 0.98 - watermarkWidth * 0.45)}" 
        y="${Math.round(height * 0.60)}" 
        width="${Math.round(watermarkWidth * 0.45)}" 
        height="${Math.round(watermarkHeight * 0.45)}" 
        href="data:${logoMimeType};base64,${logoBase64}"
        opacity="0.35"
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

    // Randomize elements for unique paintings - elegant palette: light blues, blacks, whites
    const cushions = [
      "SOFT POWDER BLUE silk velvet cushion with white lace trim and silver thread embroidery",
      "PURE WHITE plush velvet cushion with delicate light blue floral embroidery and silver accents",
      "ELEGANT LIGHT PERIWINKLE satin cushion with white pearls and silver scrollwork",
      "DEEP CHARCOAL BLACK velvet cushion with white ermine trim and silver embroidery",
      "PALE SKY BLUE silk cushion with white lace edges and subtle silver details",
      "RICH NAVY BLUE velvet cushion with white satin trim and silver thread patterns",
      "IVORY WHITE plush cushion with light blue and silver botanical embroidery",
      "SLATE GRAY velvet cushion with white lace border and silver accents"
    ];
    
    const robes = [
      "PURE WHITE silk robe with light blue floral embroidery and silver thread details, white ermine fur trim with black spots, delicate white lace collar",
      "SHIMMERING LIGHT BLUE satin cape with white pearl accents and silver embroidery, pristine white ermine trim with spots, ornate white lace ruff",
      "ELEGANT CHARCOAL BLACK velvet robe with white ermine lining and black spots, silver thread embroidery, white lace trim",
      "SOFT POWDER BLUE velvet robe with white floral embroidery and silver accents, spotted white ermine collar, white lace trim",
      "LUMINOUS ANTIQUE WHITE silk damask robe with light blue and silver botanical embroidery, white ermine fur trim, layered white lace collar",
      "RICH NAVY BLUE velvet cape with white ermine trim and silver embroidery, spotted white ermine collar, white lace ruff",
      "PALE PERIWINKLE BLUE satin robe with white pearl details and silver thread, white ermine trim, delicate white lace accents",
      "ELEGANT SLATE GRAY velvet robe with white and light blue embroidery, white ermine lapels with black spots, white lace collar"
    ];
    
    const jewelry = [
      "layered silver chains with delicate white pearl strands and small sapphire pendant, elegant and refined",
      "multiple white pearl necklaces layered together with a silver floral centerpiece and teardrop gem",
      "delicate silver filigree collar with light blue gems and small white pearl drops",
      "layered antique silver necklaces with cameo pendant and white pearl accents",
      "elegant triple-strand white pearl choker with silver flower clasp and small blue gemstone",
      "refined silver chain with floral gem clusters in light blue and white, layered with white pearls",
      "multiple delicate chains - white pearls, silver links, and a small ornate pendant",
      "layered jewelry: white pearl strand, silver chain with pendant, and delicate blue gem necklace"
    ];
    
    const backgrounds = [
      "DARK background with RICH NAVY BLUE velvet drape on one side and white accent on the other",
      "DEEP shadowy background with LIGHT BLUE silk curtain and white column",
      "DARK atmospheric backdrop with CHARCOAL BLACK velvet drapery cascading on the side",
      "MOODY dark background with SLATE GRAY velvet drape and white architectural detail",
      "SHADOWY backdrop with DEEP BLACK velvet curtain and soft white candlelight glow",
      "DARK old master background with RICH NAVY BLUE and WHITE silk drapes",
      "DEEP black backdrop with LIGHT PERIWINKLE BLUE silk drape and white frame edge",
      "CLASSIC dark background with CHARCOAL GRAY velvet and LIGHT BLUE accents visible"
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
    const genderInfo = gender ? `\n=== GENDER ===\nThis is a ${gender === "male" ? "male" : "female"} ${species}.` : "";
    
    const generationPrompt = `THIS IS A ${species}. Generate a ${species}. ${notSpecies}

=== CRITICAL: FULLY ANIMAL - NO HUMAN FEATURES ===
- The ${species} must be 100% ANIMAL - NOT a human-animal hybrid
- NO human body, NO human posture, NO bipedal stance
- NO human hands, arms, or humanoid body shape
- The ${species} has FOUR LEGS/PAWS - natural animal anatomy only
- Natural animal proportions and body structure
- The pet is a REAL ${species}, not an anthropomorphic character

=== POSE: REGAL SEATED POSITION ===
- The ${species} is SEATED majestically on a cushion/throne
- Front paws/legs visible, resting elegantly
- Head held high with noble, dignified expression
- Natural seated animal pose - like a royal pet portrait
- Full body visible, seated facing slightly toward viewer
- Proud, regal posture befitting nobility

=== THE ${species} - MUST MATCH EXACTLY ===
${petDescription}${genderInfo}

This ${species} portrait must look like THIS EXACT ${species}. ${notSpecies}

=== STYLE: ELEGANT, REFINED OIL PAINTING ===
Classical oil painting with ELEGANT, REFINED colors and SILKY luminous textures.

COLOR PALETTE - ELEGANT AND REFINED:
- PRIMARY COLORS: Light blues, pure whites, rich blacks, charcoal grays
- ACCENT COLORS: Silver threads, white pearls, light blue gems (minimal use)
- AVOID: Yellow, gold, warm tones - keep palette cool and elegant
- FABRICS: White ermine fur with black spots, white lace, light blue satin, charcoal velvet
- JEWELRY: White pearls, silver, light blue sapphires (no gold) - draped around neck naturally
- Keep colors sophisticated and understated - elegant, not overdone

KEY QUALITIES:
- SILKY, LUMINOUS fabric textures - shimmering satin, plush velvet
- Well-lit subject against dark background - the pet GLOWS with light
- Delicate floral embroidery in light blue, white, and silver (no gold)
- Soft, smooth brushwork with luminous glazing technique
- Refined color palette - elegant blues, whites, blacks
- NATURAL ANIMAL BODY - four legs, normal pet anatomy

The ${species} is SEATED regally on ${cushion}, wearing ${robe} draped over its back, with ${jewelryItem} around its neck. ${background}. ${lighting}. Museum-quality fine art portrait of a noble pet - fully animal, majestic pose.`;

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

    // Create preview (watermarked if not using pack credit, un-watermarked if using pack credit)
    let previewBuffer: Buffer;
    if (usePackCredit) {
      // Un-watermarked preview for pack credits
      previewBuffer = generatedBuffer;
      console.log("Using pack credit - generating un-watermarked image");
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
        paid: usePackCredit, // Mark as paid if using pack credit
        pet_description: finalDescription,
        hd_url: hdUrl,
        preview_url: previewUrl,
        ...(usePackCredit ? { pack_generation: true } : {}),
      });
      console.log("Metadata saved successfully");
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
