import { NextRequest, NextResponse } from "next/server";
import { getMetadata } from "@/lib/supabase";

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const imageId = searchParams.get("imageId");

    if (!imageId) {
      return NextResponse.json(
        { error: "Image ID is required" },
        { status: 400 }
      );
    }

    // Validate imageId format (UUID)
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (!uuidRegex.test(imageId)) {
      return NextResponse.json(
        { error: "Invalid image ID format" },
        { status: 400 }
      );
    }

    // Get metadata from Supabase
    const metadata = await getMetadata(imageId);

    if (!metadata) {
      return NextResponse.json(
        { error: "Image not found" },
        { status: 404 }
      );
    }

    return NextResponse.json({
      imageId: metadata.id,
      hdUrl: metadata.hd_url,
      previewUrl: metadata.preview_url,
      paid: metadata.paid,
      createdAt: metadata.created_at,
    });
  } catch (error) {
    console.error("Image info error:", error);
    return NextResponse.json(
      { error: "Failed to get image info" },
      { status: 500 }
    );
  }
}

