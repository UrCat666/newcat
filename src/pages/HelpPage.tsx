import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  ArrowRight,
  Award,
  ChevronDown,
  HelpCircle,
  MessageCircle,
  Receipt,
  ShieldCheck,
} from 'lucide-react';
import { useStore } from '../context/StoreContext';
import { normalizeWhatsappNumber } from '../shared/pricing';

export function HelpPage() {
  const { storefront } = useStore();
  const [openFaqId, setOpenFaqId] = useState<string | null>(null);

  useEffect(() => {
    document.title = 'Pusat Bantuan & Cek Resi — Catrizzz Store';
  }, []);

  const faqs = storefront?.siteContent?.faqs || [];
  const waNumber = normalizeWhatsappNumber(
    storefront?.storeSettings?.whatsappNumber || '6287738172871'
  );
  const waHref = `https://wa.me/${waNumber}?text=${encodeURIComponent(
    'Halo Admin Catrizzz Store, saya membutuhkan bantuan terkait pesanan/layanan digital.'
  )}`;

  return (
    <main className="max-w-5xl mx-auto px-4 sm:px-6 py-12 space-y-10 bg-white">
      <section className="surface-subtle rounded-2xl p-8 space-y-3">
        <div className="inline-flex items-center gap-2 text-xs font-semibold text-[#244B75] uppercase tracking-wider">
          <HelpCircle className="w-4 h-4" />
          <span>Pusat Bantuan</span>
        </div>
        <h1 className="font-display text-3xl font-bold text-[#102A43]">
          Bantuan, Verifikasi Resi &amp; Panduan Pembelian
        </h1>
        <p className="text-sm sm:text-base text-[#253449] max-w-2xl leading-relaxed">
          Semua pembelian di Catrizzz Store dapat dilakukan langsung tanpa login. Gunakan halaman Cek Resi untuk memantau status pesanan atau hubungi tim kami via WhatsApp resmi.
        </p>
      </section>

      <section className="grid grid-cols-1 md:grid-cols-3 gap-5">
        <Link
          to="/cek-resi"
          data-spotlight="true"
          className="surface-card spotlight-surface rounded-2xl p-6 space-y-3 group"
        >
          <div className="w-10 h-10 rounded-xl bg-[#EAF2FA] text-[#102A43] flex items-center justify-center">
            <Receipt className="w-5 h-5" />
          </div>
          <h2 className="font-display text-lg font-bold text-[#102A43] group-hover:text-[#244B75]">
            Cek Resi Transaksi
          </h2>
          <p className="text-xs text-[#718096] leading-relaxed">
            Lacak status verifikasi pembayaran QRIS dan pengiriman akses digital menggunakan kode resi CTRZ atau nomor order.
          </p>
          <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-[#244B75]">
            Buka Cek Resi
            <ArrowRight className="w-3.5 h-3.5" />
          </span>
        </Link>

        <Link
          to="/join-reseller"
          data-spotlight="true"
          className="surface-card spotlight-surface rounded-2xl p-6 space-y-3 group"
        >
          <div className="w-10 h-10 rounded-xl bg-[#EAF2FA] text-[#102A43] flex items-center justify-center">
            <Award className="w-5 h-5" />
          </div>
          <h2 className="font-display text-lg font-bold text-[#102A43] group-hover:text-[#244B75]">
            Bantuan Pendaftaran Reseller
          </h2>
          <p className="text-xs text-[#718096] leading-relaxed">
            Cek status persetujuan pendaftaran atau daftar gratis menjadi mitra reseller resmi (-20%).
          </p>
          <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-[#244B75]">
            Lihat Status Reseller
            <ArrowRight className="w-3.5 h-3.5" />
          </span>
        </Link>

        <a
          href={waHref}
          target="_blank"
          rel="noopener noreferrer"
          data-spotlight="true"
          className="surface-card spotlight-surface rounded-2xl p-6 space-y-3 group"
        >
          <div className="w-10 h-10 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-700 flex items-center justify-center">
            <MessageCircle className="w-5 h-5" />
          </div>
          <h2 className="font-display text-lg font-bold text-[#102A43] group-hover:text-[#244B75]">
            WhatsApp Admin Resmi
          </h2>
          <p className="text-xs text-[#718096] leading-relaxed">
            Butuh bantuan aktivasi akun atau klaim garansi layanan digital? Hubungi admin langsung di +{waNumber}.
          </p>
          <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-emerald-700">
            Chat Sekarang
            <ArrowRight className="w-3.5 h-3.5" />
          </span>
        </a>
      </section>

      <section
        data-spotlight="true"
        className="surface-card spotlight-surface rounded-2xl p-6 sm:p-8 space-y-4"
      >
        <div className="flex items-center gap-2">
          <ShieldCheck className="w-5 h-5 text-[#244B75]" />
          <h2 className="font-display text-xl font-bold text-[#102A43]">
            Pertanyaan yang Sering Diajukan (FAQ)
          </h2>
        </div>

        {faqs.length === 0 ? (
          <p className="text-sm text-[#718096]">
            Silakan hubungi admin melalui WhatsApp jika ada pertanyaan seputar layanan kami.
          </p>
        ) : (
          <div className="divide-y divide-[#E5EAF0]">
            {faqs.map((faq) => {
              const isOpen = openFaqId === faq.id;
              return (
                <div key={faq.id} className="py-3.5">
                  <button
                    type="button"
                    onClick={() => setOpenFaqId(isOpen ? null : faq.id)}
                    aria-expanded={isOpen}
                    className="w-full flex items-center justify-between gap-4 text-left text-sm font-semibold text-[#102A43] hover:text-[#244B75] cursor-pointer"
                  >
                    <span>{faq.question}</span>
                    <ChevronDown
                      className={`w-4 h-4 text-[#718096] transition-transform ${
                        isOpen ? 'rotate-180' : ''
                      }`}
                    />
                  </button>
                  {isOpen && (
                    <p className="mt-2.5 text-sm text-[#253449] leading-relaxed">{faq.answer}</p>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </section>
    </main>
  );
}
