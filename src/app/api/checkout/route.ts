import { NextRequest, NextResponse } from "next/server";
import Stripe from "stripe";
import { CONFIG } from "@/lib/config";
import { getMetadata } from "@/lib/supabase";

export async function POST(request: NextRequest) {
  try {
    // Check for Stripe key
    if (!process.env.STRIPE_SECRET_KEY) {
      return NextResponse.json(
        { error: "Stripe is not configured" },
        { status: 500 }
      );
    }

    // Initialize Stripe client
    const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

    // Parse request body
    const body = await request.json();
    const { imageId } = body;

    if (!imageId) {
      return NextResponse.json(
        { error: "Image ID is required" },
        { status: 400 }
      );
    }

    // Verify the image exists in Supabase
    const metadata = await getMetadata(imageId);
    
    if (!metadata) {
      return NextResponse.json(
        { error: "Portrait not found. Please generate a new one." },
        { status: 404 }
      );
    }

    // Create Stripe Checkout Session
    const session = await stripe.checkout.sessions.create({
      payment_method_types: ["card"],
      line_items: [
        {
          price_data: {
            currency: "usd",
            product_data: {
              name: CONFIG.PRODUCT_NAME,
              description: CONFIG.PRODUCT_DESCRIPTION,
              images: [metadata.preview_url],
            },
            unit_amount: CONFIG.PRICE_AMOUNT,
          },
          quantity: 1,
        },
      ],
      mode: "payment",
      success_url: `${CONFIG.BASE_URL}/success?imageId=${imageId}&session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: CONFIG.BASE_URL,
      metadata: {
        imageId,
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
      return NextResponse.json(
        { error: "Payment service error. Please try again." },
        { status: 500 }
      );
    }

    return NextResponse.json(
      { error: "Failed to create checkout session. Please try again." },
      { status: 500 }
    );
  }
}
