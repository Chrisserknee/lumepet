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
  
  // Core style prompt for Renaissance pet portraits
  GENERATION_PROMPT: `A highly detailed, classical oil painting style portrait of this pet posed as nobility, seated on an ornate velvet cushion in a dimly lit, old-world aristocratic interior. The setting features rich baroque architecture with soft shadowed columns, stone steps, and dramatic chiaroscuro lighting reminiscent of 17th–18th century European royal portraiture.

The pet wears luxurious historical attire inspired by royal fashion — such as fur-trimmed robes, embroidered velvet cloaks, ruffled collars, pearl necklaces, or ornate medallions — with variations in fabric color, texture, and era styling (Renaissance, Baroque, or Victorian influences). Expression should feel dignified, composed, and slightly solemn, with carefully rendered fur, lifelike glassy eyes, and painterly brushstroke textures.

The cushion beneath the pet should vary in design and material — examples include:
- Deep emerald or sapphire velvet with gold tassels
- Brocade or damask patterns with embroidered filigree
- Plush silk pillows with fringe or royal insignias
- Antique worn upholstery with faded ornate trim

Color palette should remain rich and moody, featuring warm golds, deep burgundies, forest greens, and shadowed browns. The atmosphere should feel timeless, noble, and slightly dramatic — like a museum-quality heirloom portrait of a royal pet.

Ultra-detailed, realistic oil painting, soft diffused light, painterly texture, cinematic shadows, classical composition, museum-grade fine art.`,
};
