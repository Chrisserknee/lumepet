import { createClient } from "@supabase/supabase-js";

// Create Supabase client
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

export const supabase = createClient(supabaseUrl, supabaseServiceKey);

// Storage bucket name
export const STORAGE_BUCKET = "pet-portraits";

// Helper to upload image to Supabase Storage
export async function uploadImage(
  buffer: Buffer,
  fileName: string,
  contentType: string = "image/png"
): Promise<string> {
  const { data, error } = await supabase.storage
    .from(STORAGE_BUCKET)
    .upload(fileName, buffer, {
      contentType,
      upsert: true,
    });

  if (error) {
    throw new Error(`Failed to upload image: ${error.message}`);
  }

  // Get public URL
  const { data: urlData } = supabase.storage
    .from(STORAGE_BUCKET)
    .getPublicUrl(fileName);

  return urlData.publicUrl;
}

// Helper to get public URL for an image
export function getImageUrl(fileName: string): string {
  const { data } = supabase.storage
    .from(STORAGE_BUCKET)
    .getPublicUrl(fileName);

  return data.publicUrl;
}

// Helper to save metadata to Supabase database
export async function saveMetadata(imageId: string, metadata: Record<string, unknown>) {
  const { error } = await supabase
    .from("portraits")
    .upsert({
      id: imageId,
      ...metadata,
      updated_at: new Date().toISOString(),
    });

  if (error) {
    console.error("Failed to save metadata:", error);
  }
}

// Helper to get metadata from Supabase database
export async function getMetadata(imageId: string) {
  const { data, error } = await supabase
    .from("portraits")
    .select("*")
    .eq("id", imageId)
    .single();

  if (error) {
    return null;
  }

  return data;
}

