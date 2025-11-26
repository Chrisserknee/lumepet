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
  
  // OpenAI prompt for Renaissance transformation
  GENERATION_PROMPT: `Transform this pet photo into a highly detailed Renaissance oil painting portrait. 
Style requirements:
- Classical Renaissance painting technique with visible brushstrokes
- Rich, warm color palette with deep burgundies, golds, and earth tones
- Authentic canvas texture visible throughout
- Ornate baroque-style background with draped velvet curtains
- Dramatic chiaroscuro lighting reminiscent of Rembrandt
- The pet should appear noble and dignified, like royalty
- Add period-appropriate details like a decorative collar or medallion
- Museum-quality fine art appearance
- Majestic and timeless composition`,
};

