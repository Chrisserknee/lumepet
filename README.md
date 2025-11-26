# 🎨 Pet Renaissance

Transform your beloved pet into a stunning Renaissance oil painting masterpiece using AI.

![Pet Renaissance](https://your-domain.com/og-image.jpg)

## ✨ Features

- **AI-Powered Transformation**: Uses OpenAI's image generation to create authentic Renaissance-style pet portraits
- **Watermarked Previews**: Generate previews for free; purchase to unlock HD, watermark-free versions
- **Stripe Integration**: Secure payment processing with Stripe Checkout
- **Mobile-First Design**: Beautiful, responsive design inspired by premium web experiences
- **Elegant UI**: Fable-inspired design with soft gradients, ornate frames, and smooth animations

## 🚀 Getting Started

### Prerequisites

- Node.js 18+ 
- npm or yarn
- OpenAI API key
- Stripe account

### Installation

1. Clone the repository:
```bash
git clone https://github.com/your-username/pet-renaissance.git
cd pet-renaissance
```

2. Install dependencies:
```bash
npm install
```

3. Create a `.env.local` file in the root directory:
```env
# OpenAI API Key for image generation
OPENAI_API_KEY=sk-your-openai-api-key-here

# Stripe Keys
STRIPE_SECRET_KEY=sk_test_your-stripe-secret-key-here

# Base URL for success/cancel redirects
NEXT_PUBLIC_BASE_URL=http://localhost:3000

# Price in cents (900 = $9.00)
PRICE_AMOUNT=900
```

4. Run the development server:
```bash
npm run dev
```

5. Open [http://localhost:3000](http://localhost:3000) in your browser.

## 🛠️ Tech Stack

- **Framework**: Next.js 15 (App Router) + TypeScript
- **Styling**: Tailwind CSS 4
- **AI**: OpenAI Images API (gpt-image-1)
- **Payments**: Stripe Checkout
- **Image Processing**: Sharp (for watermarking)

## 📁 Project Structure

```
src/
├── app/
│   ├── api/
│   │   ├── generate/     # Image generation endpoint
│   │   ├── checkout/     # Stripe checkout session
│   │   └── download/     # HD image download
│   ├── success/          # Post-purchase success page
│   ├── globals.css       # Global styles & theme
│   ├── layout.tsx        # Root layout
│   └── page.tsx          # Landing page
├── components/
│   ├── Hero.tsx          # Hero section
│   ├── HowItWorks.tsx    # 3-step process
│   ├── Gallery.tsx       # Sample portraits
│   ├── FAQ.tsx           # FAQ accordion
│   ├── Footer.tsx        # Site footer
│   ├── UploadModal.tsx   # File upload modal
│   └── GenerationFlow.tsx # Generation & checkout flow
└── lib/
    └── config.ts         # App configuration
```

## 🔒 Security Notes

- **Watermarking**: All preview images are server-side watermarked
- **HD Protection**: Clean HD images are only accessible after successful payment
- **Payment Verification**: In production, implement Stripe webhooks to verify payments

### Adding Stripe Webhook (Production)

For production, add a webhook endpoint to verify payments:

```typescript
// src/app/api/webhook/route.ts
// Verify payment before marking images as paid
```

## 🎨 Design Philosophy

The design is inspired by [Fable](https://fable.surrealium.world/) with:
- Full-height hero sections with bold typography
- Soft cream gradients and warm gold accents
- Ornate frames reminiscent of museum galleries
- Elegant serif headings (Cormorant Garamond)
- Clean sans-serif body text (DM Sans)
- Smooth scroll animations and micro-interactions

## 📱 Mobile-First

The app is optimized for iPhone and mobile devices:
- Full-width CTAs
- Touch-friendly file picker
- Comfortable spacing and font sizes
- No horizontal scroll

## 🤝 Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

## 📄 License

MIT License - feel free to use this project for your own purposes.

---

Made with ♥ for pet lovers everywhere 🐕 🐈 🐰
