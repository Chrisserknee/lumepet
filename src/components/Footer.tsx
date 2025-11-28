import Image from "next/image";

interface FooterProps {
  onContactClick?: () => void;
}

export default function Footer({ onContactClick }: FooterProps) {
  const currentYear = new Date().getFullYear();

  return (
    <footer 
      className="py-12 px-6"
      style={{ borderTop: '1px solid rgba(197, 165, 114, 0.1)' }}
    >
      <div className="max-w-5xl mx-auto">
        <div className="flex flex-col md:flex-row items-center justify-between gap-6">
          {/* Logo/Brand */}
          <div className="flex items-center gap-3">
            <div
              style={{
                filter: 'drop-shadow(0 0 6px rgba(255, 220, 100, 0.5)) drop-shadow(0 0 12px rgba(255, 215, 80, 0.4)) drop-shadow(0 0 18px rgba(255, 200, 60, 0.3))'
              }}
            >
              <Image
                src="/samples/LumePet2.png"
                alt="LumePet Logo"
                width={40}
                height={40}
                className="object-contain"
              />
            </div>
            <span 
              className="text-xl font-semibold"
              style={{ fontFamily: "'Cormorant Garamond', Georgia, serif", color: '#F0EDE8' }}
            >
              LumePet
            </span>
          </div>

          {/* Links */}
          <nav className="flex items-center gap-6 text-sm" style={{ color: '#7A756D' }}>
            <a href="#how-it-works" className="hover:text-[#C5A572] transition-colors">
              How it Works
            </a>
            <a href="#gallery" className="hover:text-[#C5A572] transition-colors">
              Gallery
            </a>
            <a href="#faq" className="hover:text-[#C5A572] transition-colors">
              FAQ
            </a>
            {onContactClick ? (
              <button
                onClick={onContactClick}
                className="hover:text-[#C5A572] transition-colors bg-transparent border-none cursor-pointer"
                style={{ color: '#7A756D' }}
              >
                Contact
              </button>
            ) : (
              <a href="#contact" className="hover:text-[#C5A572] transition-colors">
                Contact
              </a>
            )}
          </nav>

          {/* Copyright */}
          <p className="text-sm" style={{ color: '#7A756D' }}>
            © {currentYear} LumePet
          </p>
        </div>

        {/* Fine print */}
        <div 
          className="mt-8 pt-6 text-center"
          style={{ borderTop: '1px solid rgba(197, 165, 114, 0.1)' }}
        >
          <p className="text-xs" style={{ color: 'rgba(122, 117, 109, 0.6)' }}>
            Made with ♥ for pet lovers everywhere.
          </p>
        </div>
      </div>
    </footer>
  );
}
