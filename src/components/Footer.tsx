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
            <svg className="w-8 h-8" style={{ color: '#C5A572' }} viewBox="0 0 24 24" fill="currentColor">
              <path d="M5 16L3 5l5.5 5L12 4l3.5 6L21 5l-2 11H5zm14 3c0 .6-.4 1-1 1H6c-.6 0-1-.4-1-1v-1h14v1z"/>
            </svg>
            <span 
              className="text-xl"
              style={{ fontFamily: "'Cormorant Garamond', Georgia, serif", color: '#2C2C2C' }}
            >
              Pet Renaissance
            </span>
          </div>

          {/* Links */}
          <nav className="flex items-center gap-6 text-sm" style={{ color: '#8B7355' }}>
            <a href="#how-it-works" className="hover:text-[#2C2C2C] transition-colors">
              How it Works
            </a>
            <a href="#gallery" className="hover:text-[#2C2C2C] transition-colors">
              Gallery
            </a>
            <a href="#faq" className="hover:text-[#2C2C2C] transition-colors">
              FAQ
            </a>
          </nav>

          {/* Copyright */}
          <p className="text-sm" style={{ color: '#8B7355' }}>
            © {currentYear} Pet Renaissance
          </p>
        </div>

        {/* Fine print */}
        <div 
          className="mt-8 pt-6 text-center"
          style={{ borderTop: '1px solid rgba(197, 165, 114, 0.1)' }}
        >
          <p className="text-xs" style={{ color: 'rgba(139, 115, 85, 0.7)' }}>
            Made with ♥ for pet lovers everywhere.
          </p>
        </div>
      </div>
    </footer>
  );
}
