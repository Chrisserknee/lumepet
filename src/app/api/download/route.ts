import { NextRequest, NextResponse } from "next/server";
import fs from "fs/promises";
import path from "path";

export async function GET(request: NextRequest) {
  try {
    // Get imageId from query params
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

    // Check if image exists
    const generatedDir = path.join(process.cwd(), "public", "generated");
    const hdPath = path.join(generatedDir, `${imageId}-hd.png`);

    try {
      await fs.access(hdPath);
    } catch {
      return NextResponse.json(
        { error: "Image not found" },
        { status: 404 }
      );
    }

    // Read the HD image file
    const imageBuffer = await fs.readFile(hdPath);

    // Return the image with download headers
    return new NextResponse(imageBuffer, {
      headers: {
        "Content-Type": "image/png",
        "Content-Disposition": `attachment; filename="pet-renaissance-${imageId}.png"`,
        "Content-Length": imageBuffer.length.toString(),
      },
    });
  } catch (error) {
    console.error("Download error:", error);
    return NextResponse.json(
      { error: "Failed to download image" },
      { status: 500 }
    );
  }
}

