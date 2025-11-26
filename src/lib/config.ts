// Configuration constants
export const CONFIG = {
  // Price for HD portrait in dollars
  PRICE_DISPLAY: "$9",
  PRICE_AMOUNT: parseInt(process.env.PRICE_AMOUNT || "900", 10), // in cents
  
  // Product details
  PRODUCT_NAME: "Renaissance Pet Portrait",
  PRODUCT_DESCRIPTION: "Full-resolution, watermark-free Renaissance portrait of your beloved pet",
  
  // API URLs
  BASE_URL: process.env.NEXT_PUBLIC_BASE_URL || "http://localhost:3000",
  
  // Image settings
  MAX_FILE_SIZE: 10 * 1024 * 1024, // 10MB
  ACCEPTED_TYPES: ["image/jpeg", "image/png", "image/webp"],
  
  // Core style prompt for pet portraits
  GENERATION_PROMPT: `A museum-quality fine art oil painting of a majestic pet, portrayed with rich texture and expressive brushstrokes. The subject is set within a natural environment that softly complements its habitat. Dramatic yet elegant lighting, painterly depth, and subtle color variations create a timeless, classical atmosphere. Each image should feature slight differences in pose, expression, lighting direction, background composition, and brushstroke style to ensure every result feels uniquely handcrafted. Ultra-detailed, gallery-worthy, classical oil painting, refined realism with artistic interpretation, gentle stylistic randomness for individuality.`,
};
