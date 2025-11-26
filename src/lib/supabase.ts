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
    console.error("Error code:", error.code);
    console.error("Error message:", error.message);
    console.error("Error details:", error.details);
    console.error("Error hint:", error.hint);
    console.error("Full error:", JSON.stringify(error, null, 2));
    console.error("ImageId:", imageId);
    console.error("Metadata keys:", Object.keys(metadata));
    console.error("pet_description length:", (metadata.pet_description as string)?.length);
    console.error("pet_description preview:", (metadata.pet_description as string)?.substring(0, 100));
    
    // Extract the most useful error message
    const errorMessage = error.message || error.details || error.hint || JSON.stringify(error);
    throw new Error(`Failed to save metadata: ${errorMessage}`);
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

// Helper to save email to emails table
export async function saveEmail(email: string, imageId?: string, source: string = "checkout") {
  const { error } = await supabase
    .from("emails")
    .upsert({
      email: email.toLowerCase().trim(),
      image_id: imageId || null,
      source,
      created_at: new Date().toISOString(),
    }, {
      onConflict: "email",
    });

  if (error) {
    console.error("Failed to save email:", error);
    return false;
  }
  return true;
}

// Helper to get all emails (for export)
export async function getAllEmails() {
  const { data, error } = await supabase
    .from("emails")
    .select("*")
    .order("created_at", { ascending: false });

  if (error) {
    console.error("Failed to get emails:", error);
    return [];
  }

  return data;
}


