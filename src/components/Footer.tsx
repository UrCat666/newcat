import { Link } from 'react-router-dom';
import { Award, Mail, MapPin, MessageCircle, Shield } from 'lucide-react';
import { useStore } from '../context/StoreContext';
import { normalizeWhatsappNumber } from '../shared/pricing';

export function Footer() {
  const { storefront, isResellerActive } = useStore();
  const settings = storefront?.storeSettings;
  const content = storefront?.siteContent;

  const storeName = settings?.storeName || 'Catrizzz Store';
  const waNumber = normalizeWhatsappNumber(settings?.whatsappNumber || '6287738172871');
  const waHref = `https://wa.me/${waNumber}`;

  const footerNavItems = (storefront?.navigationMenus || [])
    .filter((m) => m.location === 'footer' && m.active && m.group !== 'portal')
    .sort((a, b) => a.sortOrder - b.sortOrder);

  const footerPortalItems = (storefront?.navigationMenus || [])
    .filter((m) => m.location === 'footer' && m.active && m.group === 'portal')
    .sort((a, b) => a.sortOrder - b.sortOrder);

  const footerCmsPages = (storefront?.publishedPages || []).filter((p) => p.showInFooter);

  return (
    <footer className="no-print border-t border-[#E5EAF0] bg-[#F8FAFC] text-[#253449] mt-20">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 py-14 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-10">
        <div className="space-y-4">
          <Link to="/" className="inline-flex items-center gap-2.5 text-lg font-bold text-[#102A43]">
            {settings?.logoUrl ? (
              <img
                src={settings.logoUrl}
                alt={storeName}
                className="w-7 h-7 rounded-lg object-cover border border-[#E5EAF0]"
                referrerPolicy="no-referrer"
              />
            ) : (
              <span className="w-7 h-7 rounded-lg bg-[#102A43] flex items-center justify-center text-white text-xs font-bold">
                {storeName.slice(0, 1).toUpperCase()}
              </span>
            )}
            <span className="font-display">{storeName}</span>
          </Link>
          <p className="text-sm text-[#718096] leading-relaxed">
            {content?.footerDescription ||
              'Platform aplikasi premium dan produk digital terpercaya. Pembayaran QRIS resmi, verifikasi cepat, dan resi transaksi terenkripsi.'}
          </p>
          <div className="flex flex-wrap items-center gap-3 text-xs text-[#244B75] font-medium">
            {content?.socialLinks?.instagram && (
              <a
                href={content.socialLinks.instagram}
                target="_blank"
                rel="noopener noreferrer"
                className="hover:text-[#102A43] transition-colors underline underline-offset-4"
              >
                Instagram
              </a>
            )}
            {content?.socialLinks?.tiktok && (
              <a
                href={content.socialLinks.tiktok}
                target="_blank"
                rel="noopener noreferrer"
                className="hover:text-[#102A43] transition-colors underline underline-offset-4"
              >
                TikTok
              </a>
            )}
            {content?.socialLinks?.telegram && (
              <a
                href={content.socialLinks.telegram}
                target="_blank"
                rel="noopener noreferrer"
                className="hover:text-[#102A43] transition-colors underline underline-offset-4"
              >
                Telegram
              </a>
            )}
            {content?.socialLinks?.youtube && (
              <a
                href={content.socialLinks.youtube}
                target="_blank"
                rel="noopener noreferrer"
                className="hover:text-[#102A43] transition-colors underline underline-offset-4"
              >
                YouTube
              </a>
            )}
            <a
              href={waHref}
              target="_blank"
              rel="noopener noreferrer"
              className="hover:text-[#102A43] transition-colors underline underline-offset-4"
            >
              WhatsApp
            </a>
          </div>
        </div>

        <div className="space-y-3">
          <h3 className="text-sm font-semibold text-[#102A43]">Navigasi</h3>
          <ul className="space-y-2.5 text-sm text-[#718096]">
            {footerNavItems.length > 0 ? (
              footerNavItems.map((item) => (
                <li key={item.id}>
                  {item.openInNewTab || /^https?:\/\//i.test(item.href) ? (
                    <a
                      href={item.href}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="hover:text-[#102A43] transition-colors"
                    >
                      {item.label}
                    </a>
                  ) : (
                    <Link to={item.href} className="hover:text-[#102A43] transition-colors">
                      {item.label}
                    </Link>
                  )}
                </li>
              ))
            ) : (
              <>
                <li>
                  <Link to="/" className="hover:text-[#102A43] transition-colors">
                    Beranda
                  </Link>
                </li>
                <li>
                  <Link to="/produk" className="hover:text-[#102A43] transition-colors">
                    Semua Produk
                  </Link>
                </li>
                <li>
                  <Link to="/kategori" className="hover:text-[#102A43] transition-colors">
                    Kategori Aplikasi
                  </Link>
                </li>
                <li>
                  <Link to="/cek-resi" className="hover:text-[#102A43] transition-colors">
                    Cek Resi Transaksi
                  </Link>
                </li>
                <li>
                  <Link to="/bantuan" className="hover:text-[#102A43] transition-colors">
                    Pusat Bantuan
                  </Link>
                </li>
              </>
            )}
          </ul>
        </div>

        <div className="space-y-3">
          <h3 className="text-sm font-semibold text-[#102A43]">Portal &amp; Kebijakan</h3>
          <ul className="space-y-2.5 text-sm text-[#718096]">
            <li>
              <Link
                to={isResellerActive ? '/reseller/dashboard' : '/join-reseller'}
                className="hover:text-[#102A43] transition-colors"
              >
                {isResellerActive ? 'Dashboard Reseller' : 'Join Reseller (-20%)'}
              </Link>
            </li>
            <li>
              <Link
                to={isResellerActive ? '/reseller/dashboard' : '/reseller/login'}
                className="inline-flex items-center gap-1.5 hover:text-[#102A43] transition-colors font-medium text-[#244B75]"
              >
                <Award className="w-3.5 h-3.5" />
                Login Reseller
              </Link>
            </li>
            <li>
              <Link
                to="/admin/login"
                className="inline-flex items-center gap-1.5 hover:text-[#102A43] transition-colors font-medium text-[#244B75]"
              >
                <Shield className="w-3.5 h-3.5" />
                Portal Admin
              </Link>
            </li>
            {footerPortalItems.length > 0 ? (
              footerPortalItems.map((item) => (
                <li key={item.id}>
                  <Link to={item.href} className="hover:text-[#102A43] transition-colors">
                    {item.label}
                  </Link>
                </li>
              ))
            ) : (
              <>
                <li>
                  <Link to="/kebijakan-privasi" className="hover:text-[#102A43] transition-colors">
                    Kebijakan Privasi
                  </Link>
                </li>
                <li>
                  <Link to="/syarat-ketentuan" className="hover:text-[#102A43] transition-colors">
                    Syarat dan Ketentuan
                  </Link>
                </li>
              </>
            )}
            {footerCmsPages.map((pg) => (
              <li key={pg.id}>
                <Link to={`/p/${pg.slug}`} className="hover:text-[#102A43] transition-colors">
                  {pg.title}
                </Link>
              </li>
            ))}
          </ul>
        </div>

        <div className="space-y-3">
          <h3 className="text-sm font-semibold text-[#102A43]">Kontak Resmi</h3>
          <div className="space-y-2.5 text-sm text-[#718096]">
            <a
              href={waHref}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-2 text-[#102A43] font-medium hover:text-[#244B75] transition-colors"
            >
              <MessageCircle className="w-4 h-4 shrink-0" />
              <span className="font-mono-num">+{waNumber}</span>
            </a>
            {(settings?.email || content?.socialLinks?.email) && (
              <div className="flex items-center gap-2">
                <Mail className="w-4 h-4 shrink-0 text-[#718096]" />
                <span>{settings?.email || content?.socialLinks?.email}</span>
              </div>
            )}
            {settings?.address && (
              <div className="flex items-start gap-2">
                <MapPin className="w-4 h-4 shrink-0 text-[#718096] mt-0.5" />
                <span>{settings.address}</span>
              </div>
            )}
            {settings?.operatingHours && (
              <p className="text-xs text-[#718096]">{settings.operatingHours}</p>
            )}
          </div>
        </div>
      </div>

      <div className="border-t border-[#E5EAF0] py-5 px-4 sm:px-6 bg-white">
        <div className="max-w-7xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-2 text-xs text-[#718096]">
          <p>{content?.footerCopyright || '© 2026 Catrizzz Store. Seluruh hak cipta dilindungi.'}</p>
          <p>Pembayaran QRIS Resmi · Verifikasi Admin</p>
        </div>
      </div>
    </footer>
  );
}
