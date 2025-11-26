// Configuration constants
export const CONFIG = {
  // Price for HD portrait in dollars
  PRICE_DISPLAY: "$0.50",
  PRICE_AMOUNT: parseInt(process.env.PRICE_AMOUNT || "50", 10), // in cents (50¢ for testing)
  
  // Pack pricing
  PACK_2_PRICE_DISPLAY: "$15",
  PACK_2_PRICE_AMOUNT: 1500, // $15 in cents
  PACK_2_GENERATIONS: 2, // 2 generations per pack
  
  // Product details
  PRODUCT_NAME: "LumePet Royal Portrait",
  PRODUCT_DESCRIPTION: "Full-resolution, watermark-free royal Renaissance portrait of your beloved pet as nobility",
  
  PACK_PRODUCT_NAME: "LumePet Generation Pack (2)",
  PACK_PRODUCT_DESCRIPTION: "2 un-watermarked generations - Create beautiful portraits without watermarks",
  
  // API URLs
  BASE_URL: process.env.NEXT_PUBLIC_BASE_URL || "http://localhost:3000",
  
  // Image settings
  // Vercel has a 4.5MB body size limit, so we limit to 4MB to be safe
  MAX_FILE_SIZE: 4 * 1024 * 1024, // 4MB (Vercel limit is 4.5MB)
  ACCEPTED_TYPES: ["image/jpeg", "image/png", "image/webp"],
  
  // Style description for UI
  STYLE_DESCRIPTION: "Dutch Golden Age royal portrait with velvet robes, ermine trim, ornate jewelry, and dramatic Rembrandt lighting",
};
