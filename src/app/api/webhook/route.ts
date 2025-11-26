import { NextRequest, NextResponse } from "next/server";
import Stripe from "stripe";
import { saveMetadata, getMetadata } from "@/lib/supabase";

// Initialize Stripe
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY || "");

export async function POST(request: NextRequest) {
  const body = await request.text();
  const signature = request.headers.get("stripe-signature");

  if (!signature) {
    return NextResponse.json(
      { error: "Missing stripe-signature header" },
      { status: 400 }
    );
  }

  if (!process.env.STRIPE_WEBHOOK_SECRET) {
    console.error("STRIPE_WEBHOOK_SECRET not configured");
    return NextResponse.json(
      { error: "Webhook secret not configured" },
      { status: 500 }
    );
  }

  let event: Stripe.Event;

  try {
    // Verify the webhook signature
    event = stripe.webhooks.constructEvent(
      body,
      signature,
      process.env.STRIPE_WEBHOOK_SECRET
    );
  } catch (err) {
    console.error("Webhook signature verification failed:", err);
    return NextResponse.json(
      { error: "Invalid signature" },
      { status: 400 }
    );
  }

  // Handle the event
  switch (event.type) {
    // ✅ Payment successful
    case "checkout.session.completed": {
      const session = event.data.object as Stripe.Checkout.Session;
      const imageId = session.metadata?.imageId;
      
      if (imageId) {
        await saveMetadata(imageId, {
          paid: true,
          paid_at: new Date().toISOString(),
          stripe_session_id: session.id,
          customer_email: session.customer_details?.email || null,
          status: "completed",
        });
        console.log(`✅ Payment confirmed for image: ${imageId}`);
      }
      break;
    }

    // ⏰ Checkout session expired
    case "checkout.session.expired": {
      const session = event.data.object as Stripe.Checkout.Session;
      const imageId = session.metadata?.imageId;
      
      if (imageId) {
        await saveMetadata(imageId, {
          status: "expired",
          expired_at: new Date().toISOString(),
        });
        console.log(`⏰ Checkout expired for image: ${imageId}`);
      }
      break;
    }

    // 💸 Refund issued
    case "charge.refunded": {
      const charge = event.data.object as Stripe.Charge;
      console.log(`💸 Refund processed: ${charge.id}`);
      break;
    }

    // ⚠️ Dispute created
    case "charge.dispute.created": {
      const dispute = event.data.object as Stripe.Dispute;
      console.log(`⚠️ Dispute created: ${dispute.id}`);
      break;
    }

    // ❌ Payment failed
    case "payment_intent.payment_failed": {
      const paymentIntent = event.data.object as Stripe.PaymentIntent;
      console.log(`❌ Payment failed: ${paymentIntent.id}`);
      break;
    }

    default:
      console.log(`Unhandled event type: ${event.type}`);
  }

  return NextResponse.json({ received: true });
}
