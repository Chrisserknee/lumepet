import Image from "next/image";

export default function Footer() {
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
                filter: 'drop-shadow(0 0 15px rgba(255, 215, 0, 0.8)) drop-shadow(0 0 30px rgba(255, 223, 0, 0.6)) drop-shadow(0 0 45px rgba(255, 200, 0, 0.4))'
              }}
            >
              <Image
                src="/samples/lumepet.png"
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
