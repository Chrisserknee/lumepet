import { NextRequest, NextResponse } from "next/server";
import Stripe from "stripe";
import { CONFIG } from "@/lib/config";
import { getMetadata, saveEmail } from "@/lib/supabase";
import { checkRateLimit, getClientIP, RATE_LIMITS } from "@/lib/rate-limit";
import { isValidEmail, isValidUUID, sanitizeString } from "@/lib/validation";

export async function POST(request: NextRequest) {
  const clientIP = getClientIP(request);
  
  // Rate limiting
  const rateLimit = checkRateLimit(`checkout:${clientIP}`, RATE_LIMITS.checkout);
  if (!rateLimit.allowed) {
    return NextResponse.json(
      { error: "Too many requests. Please wait a moment before trying again." },
      { status: 429, headers: { "Retry-After": Math.ceil(rateLimit.resetIn / 1000).toString() } }
    );
  }
  
  try {
    // Check for Stripe key
    if (!process.env.STRIPE_SECRET_KEY) {
      console.error("❌ STRIPE_SECRET_KEY environment variable is not set");
      console.error("Available env vars:", Object.keys(process.env).filter(k => k.includes('STRIPE')));
      return NextResponse.json(
        { error: "Stripe is not configured. Please contact support." },
        { status: 500 }
      );
    }

    // Initialize Stripe client
    const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

    // Parse request body
    const body = await request.json();
    const { imageId, email, type, packType, canvasImageDataUrl } = body;

    // Validate email with strict validation
    if (!email || !isValidEmail(email)) {
      return NextResponse.json(
        { error: "Please provide a valid email address" },
        { status: 400 }
      );
    }
    
    // Sanitize email
    const sanitizedEmail = sanitizeString(email.toLowerCase().trim(), 254);

    // Check if this is a pack purchase
    const isPackPurchase = type === "pack";
    
    // Validate imageId format for non-pack purchases
    if (!isPackPurchase) {
      if (!imageId) {
        return NextResponse.json(
          { error: "Image ID is required" },
          { status: 400 }
        );
      }
      if (!isValidUUID(imageId)) {
        return NextResponse.json(
          { error: "Invalid image ID format" },
          { status: 400 }
        );
      }
    }

    let metadata = null;
    let priceAmount = CONFIG.PRICE_AMOUNT; // Use config price (default $9)
    let productName = CONFIG.PRODUCT_NAME;
    let productDescription = CONFIG.PRODUCT_DESCRIPTION;
    let productImage: string[] = [];

    if (isPackPurchase) {
      // Pack purchase
      if (packType === "2-pack") {
        priceAmount = CONFIG.PACK_2_PRICE_AMOUNT;
        productName = CONFIG.PACK_PRODUCT_NAME;
        productDescription = CONFIG.PACK_PRODUCT_DESCRIPTION;
      }
      console.log(`Creating pack checkout session: ${packType}, price: ${priceAmount} cents ($${(priceAmount / 100).toFixed(2)})`);
    } else {
      // Individual image purchase
      // Verify the image exists in Supabase
      metadata = await getMetadata(imageId);
      
      if (!metadata) {
        return NextResponse.json(
          { error: "Portrait not found. Please generate a new one." },
          { status: 404 }
        );
      }
      
      // If canvas image with text overlay is provided, upload it and use for Stripe
      if (canvasImageDataUrl && canvasImageDataUrl.startsWith('data:image/')) {
        try {
          console.log("Uploading canvas image with text overlay for Stripe...");
          const { uploadImage } = await import("@/lib/supabase");
          
          // Convert data URL to buffer
          const base64Data = canvasImageDataUrl.split(',')[1];
          const imageBuffer = Buffer.from(base64Data, 'base64');
          
          // Upload to Supabase with unique name
          const canvasFileName = `${imageId}-stripe-preview.png`;
          const canvasUrl = await uploadImage(imageBuffer, canvasFileName, 'image/png');
          
          productImage = [canvasUrl];
          console.log("Canvas image uploaded for Stripe:", canvasUrl.substring(0, 80) + "...");
        } catch (uploadError) {
          console.error("Failed to upload canvas image, using original:", uploadError);
          productImage = [metadata.preview_url];
        }
      } else {
        productImage = [metadata.preview_url];
      }
      console.log(`Creating checkout session with price: ${priceAmount} cents ($${(priceAmount / 100).toFixed(2)})`);
    }

    // Save email to emails table for marketing (using sanitized email)
    await saveEmail(sanitizedEmail, imageId || null, isPackPurchase ? "pack-checkout" : "checkout");

    // Get the base URL from the request (works for both localhost and production)
    // Stripe requires absolute URLs, so we need to ensure we have a valid URL
    let baseUrl = CONFIG.BASE_URL;
    const origin = request.headers.get("origin");
    const referer = request.headers.get("referer");
    
    // Try to get a valid absolute URL
    if (origin) {
      try {
        const originUrl = new URL(origin);
        baseUrl = `${originUrl.protocol}//${originUrl.host}`;
      } catch (e) {
        console.error("Invalid origin URL:", origin);
      }
    } else if (referer) {
      // Extract origin from referer URL
      try {
        const refererUrl = new URL(referer);
        baseUrl = `${refererUrl.protocol}//${refererUrl.host}`;
      } catch (e) {
        console.error("Invalid referer URL:", referer);
      }
    }
    
    // Validate the baseUrl is a proper absolute URL
    try {
      const testUrl = new URL(baseUrl);
      baseUrl = `${testUrl.protocol}//${testUrl.host}`;
    } catch (e) {
      console.error("Invalid base URL, using CONFIG.BASE_URL:", baseUrl);
      baseUrl = CONFIG.BASE_URL;
      // Final validation
      try {
        new URL(baseUrl);
      } catch (e2) {
        console.error("CONFIG.BASE_URL is also invalid:", baseUrl);
        throw new Error("Invalid base URL configuration");
      }
    }
    
    baseUrl = baseUrl.replace(/\/$/, ""); // Remove trailing slash
    console.log(`Using base URL: ${baseUrl}`);
    
    // Validate URLs before passing to Stripe
    const successUrl = `${baseUrl}/success?imageId=${imageId}&session_id={CHECKOUT_SESSION_ID}`;
    try {
      new URL(successUrl);
    } catch (e) {
      console.error("Invalid success URL:", successUrl);
      throw new Error("Failed to create valid success URL");
    }
    
    try {
      new URL(baseUrl);
    } catch (e) {
      console.error("Invalid cancel URL:", baseUrl);
      throw new Error("Failed to create valid cancel URL");
    }

    // Create Stripe Checkout Session
    const session = await stripe.checkout.sessions.create({
      payment_method_types: ["card"],
      customer_email: sanitizedEmail,
      line_items: [
        {
          price_data: {
            currency: "usd",
            product_data: {
              name: productName,
              description: productDescription,
              images: productImage,
            },
            unit_amount: priceAmount,
          },
          quantity: 1,
        },
      ],
      mode: "payment",
      success_url: isPackPurchase 
        ? `${baseUrl}/success?type=pack&packType=${packType}&session_id={CHECKOUT_SESSION_ID}`
        : successUrl,
      cancel_url: baseUrl,
      metadata: {
        ...(imageId ? { imageId } : {}),
        customerEmail: sanitizedEmail,
        ...(isPackPurchase ? { type: "pack", packType: sanitizeString(packType || "", 20) } : {}),
      },
    });

    // Return the checkout URL
    return NextResponse.json({
      checkoutUrl: session.url,
      sessionId: session.id,
    });
  } catch (error) {
    console.error("Checkout error:", error);

    if (error instanceof Stripe.errors.StripeError) {
      console.error("Stripe error details:", error.message, error.type);
      return NextResponse.json(
        { error: error.message || "Payment service error. Please try again." },
        { status: 500 }
      );
    }

    const errorMessage = error instanceof Error ? error.message : "Failed to create checkout session. Please try again.";
    console.error("Error message:", errorMessage);
    return NextResponse.json(
      { error: errorMessage },
      { status: 500 }
    );
  }
}
