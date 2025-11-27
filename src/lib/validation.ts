/**
 * Input validation utilities for security
 */

// Email validation with strict regex
export function isValidEmail(email: string): boolean {
  if (!email || typeof email !== "string") return false;
  
  // RFC 5322 compliant email regex (simplified but secure)
  const emailRegex = /^[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)*$/;
  
  if (!emailRegex.test(email)) return false;
  
  // Additional checks
  if (email.length > 254) return false; // Max email length
  if (email.includes("..")) return false; // No consecutive dots
  
  // Check for common disposable email domains (optional, add more as needed)
  const disposableDomains = ["tempmail.com", "throwaway.email", "mailinator.com"];
  const domain = email.split("@")[1]?.toLowerCase();
  if (domain && disposableDomains.includes(domain)) {
    return false;
  }
  
  return true;
}

// UUID validation
export function isValidUUID(uuid: string): boolean {
  if (!uuid || typeof uuid !== "string") return false;
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  return uuidRegex.test(uuid);
}

// Sanitize string input (prevent XSS/injection)
export function sanitizeString(input: string, maxLength: number = 1000): string {
  if (!input || typeof input !== "string") return "";
  
  return input
    .slice(0, maxLength)
    .replace(/[<>]/g, "") // Remove angle brackets
    .replace(/javascript:/gi, "") // Remove javascript: protocol
    .replace(/on\w+=/gi, "") // Remove event handlers
    .trim();
}

// Validate file type by magic bytes (more secure than MIME type)
export async function validateImageMagicBytes(buffer: ArrayBuffer): Promise<boolean> {
  const arr = new Uint8Array(buffer.slice(0, 12));
  
  // JPEG: FF D8 FF
  if (arr[0] === 0xff && arr[1] === 0xd8 && arr[2] === 0xff) {
    return true;
  }
  
  // PNG: 89 50 4E 47 0D 0A 1A 0A
  if (
    arr[0] === 0x89 &&
    arr[1] === 0x50 &&
    arr[2] === 0x4e &&
    arr[3] === 0x47 &&
    arr[4] === 0x0d &&
    arr[5] === 0x0a &&
    arr[6] === 0x1a &&
    arr[7] === 0x0a
  ) {
    return true;
  }
  
  // WebP: RIFF....WEBP
  if (
    arr[0] === 0x52 && // R
    arr[1] === 0x49 && // I
    arr[2] === 0x46 && // F
    arr[3] === 0x46 && // F
    arr[8] === 0x57 && // W
    arr[9] === 0x45 && // E
    arr[10] === 0x42 && // B
    arr[11] === 0x50 // P
  ) {
    return true;
  }
  
  return false;
}

// Validate URL format
export function isValidUrl(url: string): boolean {
  if (!url || typeof url !== "string") return false;
  
  try {
    const parsed = new URL(url);
    return parsed.protocol === "https:" || parsed.protocol === "http:";
  } catch {
    return false;
  }
}

// Rate-safe parseInt (prevent prototype pollution)
export function safeParseInt(value: unknown, defaultValue: number): number {
  if (typeof value === "number" && Number.isFinite(value)) {
    return Math.floor(value);
  }
  if (typeof value === "string") {
    const parsed = parseInt(value, 10);
    return Number.isFinite(parsed) ? parsed : defaultValue;
  }
  return defaultValue;
}



