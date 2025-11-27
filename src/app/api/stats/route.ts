import { NextResponse } from "next/server";
import { getPortraitCount } from "@/lib/supabase";

export async function GET() {
  try {
    const count = await getPortraitCount();
    
    return NextResponse.json({
      portraitsCreated: count,
    }, {
      headers: {
        // Cache for 60 seconds to reduce database calls
        "Cache-Control": "public, s-maxage=60, stale-while-revalidate=120",
      },
    });
  } catch (error) {
    console.error("Stats error:", error);
    return NextResponse.json({
      portraitsCreated: 335, // Fallback
    });
  }
}



