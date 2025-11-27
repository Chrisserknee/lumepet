import { NextRequest, NextResponse } from "next/server";
import OpenAI from "openai";
import sharp from "sharp";
import { v4 as uuidv4 } from "uuid";
import { CONFIG } from "@/lib/config";
import { uploadImage, saveMetadata, incrementPortraitCount } from "@/lib/supabase";
import { checkRateLimit, getClientIP, RATE_LIMITS } from "@/lib/rate-limit";
import { validateImageMagicBytes } from "@/lib/validation";

// Compare original pet photo with generated portrait and create refinement prompt
async function compareAndRefine(
  openai: OpenAI,
  originalImageBuffer: Buffer,
  generatedImageBuffer: Buffer,
  originalDescription: string,
  species: string
): Promise<string> {
  console.log("=== STAGE 2: Comparing and refining ===");
  
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
  
  // Use GPT-4o vision to compare both images
  const comparisonResponse = await openai.chat.completions.create({
    model: "gpt-4o",
    messages: [
      {
        role: "user",
        content: [
          {
            type: "text",
            text: `You are comparing two images to identify differences and create a refinement prompt.

IMAGE 1 (LEFT): The ORIGINAL pet photo - this is the reference that must be matched exactly.
IMAGE 2 (RIGHT): The GENERATED portrait - this needs to be refined to match the original.

ORIGINAL DESCRIPTION: ${originalDescription}

CRITICAL TASK: Compare these two images and identify EVERY difference between the generated portrait and the original pet photo.

Analyze these aspects in detail:

1. MARKINGS AND PATTERNS:
   - Are ALL markings from the original present in the generated image?
   - Are markings in the EXACT same locations? (left/right, top/bottom)
   - Are any markings missing, added incorrectly, or in wrong locations?
   - List each discrepancy with specific location details

2. COLORS:
   - Do colors match EXACTLY? (e.g., is "midnight black" actually midnight black, or is it charcoal gray?)
   - Are color gradients preserved? (darker on back, lighter on belly, etc.)
   - Are there any color mismatches or approximations?
   - List each color discrepancy

3. FACE PROPORTIONS:
   - Does the face shape match? (round vs oval vs square)
   - Is eye spacing correct? (close together vs wide apart)
   - Is nose size relative to face correct?
   - Is muzzle length correct? (short vs medium vs long)
   - List each proportion discrepancy

4. EXPRESSION AND FEATURES:
   - Does the facial expression match the original?
   - Are unique features captured? (scars, distinctive markings, etc.)
   - Is the overall "look" of the pet preserved?
   - List any missing or incorrect features

5. OVERALL ACCURACY:
   - On a scale of 1-10, how accurately does the generated image match the original?
   - What are the 3-5 most critical issues that need to be fixed?

FORMAT YOUR RESPONSE AS A REFINEMENT PROMPT:

=== REFINEMENT NEEDED ===
[Overall accuracy score: X/10]

CRITICAL CORRECTIONS REQUIRED:
1. [Specific issue 1]: [How to fix it]
2. [Specific issue 2]: [How to fix it]
3. [Specific issue 3]: [How to fix it]
[Continue for all issues found]

REFINED DESCRIPTION:
[Updated description incorporating all corrections]

The refinement prompt should be specific, actionable, and address every discrepancy you find.`,
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
    max_tokens: 1500,
  });
  
  const refinementPrompt = comparisonResponse.choices[0]?.message?.content || "";
  console.log("Refinement prompt generated:", refinementPrompt.substring(0, 300));
  
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

CRITICAL: Identify the specific breed or breed mix if possible. This helps with accurate generation.

CRITICAL: Determine the AGE/STAGE of the animal:
- If this is a PUPPY (young dog): Note "PUPPY" - look for large eyes relative to face, rounder features, smaller size proportions, playful appearance
- If this is a KITTEN (young cat): Note "KITTEN" - look for large eyes relative to face, rounder features, smaller size proportions, youthful appearance
- If this is an ADULT: Note "ADULT" - fully developed features, mature proportions

Start with [CAT] or [DOG] in brackets, then describe:

SECTION 1 - WHAT MAKES THIS PET UNIQUE (most important):
List 5-7 distinctive features that set THIS pet apart from others of the same breed. Focus on:
- Any asymmetrical features or unusual markings - describe these in DETAIL
- Unique color patterns or patches - describe EXACT location (e.g., "white patch on left cheek", "brown spot on right shoulder")
- Distinctive facial expression or "look"
- Anything that makes this pet special/recognizable
- If there are ANY asymmetrical features, describe them in detail

SECTION 2 - FACE (critical for recognition):
- Face shape: Is it round like a circle, long/narrow, wedge-shaped, or square?
- Face proportions: Describe face width relative to head height (e.g., "face is 60% as wide as head is tall")
- Eye spacing: Are eyes close together, wide apart, or normal? Describe the exact spacing
- Eye color: Use specific comparisons (like amber honey, dark chocolate, bright emerald, sky blue)
- Nose: Color (pink, black, brown, spotted) and size relative to face
- Muzzle: Short/medium/long, width relative to head
- Any facial markings, scars, or distinctive features

SECTION 3 - EARS:
- Shape and size RELATIVE to the head (large ears? small ears?)
- Position: High on head, low, wide apart?
- Pointed, rounded, floppy, or folded?
- Any ear markings or color variations

SECTION 4 - COLORING (describe EVERY visible marking, spot, patch, or color variation):
- Main fur color using specific comparisons (honey gold, charcoal gray, snow white, midnight black, caramel brown)
- Any color gradients (darker on back, lighter underneath?) - describe EXACTLY where colors transition
- Specific markings and their EXACT locations - be precise (left side, right side, chest, back, etc.)
- If there are multiple colors, describe each color and where it appears
- Any patterns (stripes, spots, patches) and their precise locations

SECTION 5 - FUR TYPE:
- Length and texture (short sleek, medium fluffy, long silky, wiry)
- Any variations in fur length in different areas

SECTION 6 - AGE/STAGE:
- Is this a PUPPY, KITTEN, or ADULT?
- If young: Describe youthful features (large eyes relative to face, rounder features, smaller proportions, etc.)
- Preserve the exact age appearance - do not age up or down

Format your response as: "[SPECIES] AGE: [PUPPY/KITTEN/ADULT]. BREED: [breed if identifiable]. UNIQUE FEATURES: [list the 5-7 most distinctive things with exact locations]. FACE: [face details including proportions]. EARS: [ear details]. COLORING: [color details with exact locations of all markings]. FUR: [texture]."`,
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
      max_tokens: 1000,
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
    
    const generationPrompt = `CRITICAL SPECIES REQUIREMENT: THIS IS A ${species}. YOU MUST GENERATE A ${species}. ${notSpecies} REPEAT: THIS IS A ${species} - GENERATE ONLY A ${species}. DO NOT GENERATE THE WRONG SPECIES.

THIS IS A ${species}. Generate a ${species}. ${notSpecies}

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

=== CRITICAL: EXACT MATCHING ===
The generated pet MUST match the description EXACTLY:
- Same colors - if described as 'midnight black', use midnight black, not charcoal gray
- Same markings in same locations - if description says 'white patch on left cheek', generate a white patch on the LEFT CHEEK
- Same face proportions - if described as 'round face', generate a round face, not oval
- Preserve color gradients exactly - if darker on back, lighter on belly, maintain this gradient
- Every marking, spot, patch, or stripe described MUST appear in the generated image in the EXACT same location
- If asymmetrical markings are described, they MUST be asymmetrical in the generated image
- Eye spacing, nose size, muzzle length must match the description precisely

=== THE ${species} - MUST MATCH EXACTLY ===
${petDescription}${genderInfo}${agePreservationInstructions}

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

    // Generate image with GPT-Image-1 (OpenAI's newest image model)
    console.log("Generating image with gpt-image-1...");
    console.log("Generation type:", useSecretCredit ? "SECRET CREDIT (un-watermarked)" : usePackCredit ? "PACK CREDIT (un-watermarked)" : "FREE (watermarked)");
    console.log("Detected species:", species);
    console.log("Species enforcement:", notSpecies);
    
    // gpt-image-1 supports longer prompts than DALL-E 3
    console.log("Prompt length:", generationPrompt.length);
    console.log("Prompt preview (first 500 chars):", generationPrompt.substring(0, 500));
    console.log("Prompt includes species enforcement:", generationPrompt.includes(notSpecies));
    
    // Note: gpt-image-1 may not support image-to-image directly
    // The detailed vision analysis description should provide sufficient reference
    // If image-to-image becomes available, we can add it here with lower strength (0.3-0.4)
    
    // IMPORTANT: Prompt generation is IDENTICAL for all generation types (free, pack, secret)
    // The only difference is watermarking, which happens AFTER image generation

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
    let firstGeneratedBuffer: Buffer;

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
    
    console.log("✅ Stage 1 complete: First portrait generated");
    
    // STAGE 2: Compare and refine (can be disabled via environment variable)
    const enableTwoStage = process.env.ENABLE_TWO_STAGE_GENERATION !== "false"; // Default: enabled
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
