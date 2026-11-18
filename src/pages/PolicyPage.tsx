import { useEffect } from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft, MessageCircle } from 'lucide-react';
import { useStore } from '../context/StoreContext';
import { normalizeWhatsappNumber } from '../shared/pricing';

export function PolicyPage({ type }: { type: 'privacy' | 'terms' | 'return' }) {
  const { storefront } = useStore();
  const content = storefront?.siteContent;

  const title =
    type === 'privacy'
      ? 'Kebijakan Privasi'
      : type === 'terms'
        ? 'Syarat dan Ketentuan'
        : 'Kebijakan Pengembalian';

  const body =
    type === 'privacy'
      ? content?.privacyPolicy
      : type === 'terms'
        ? content?.termsConditions
        : content?.returnPolicy;

  useEffect(() => {
    document.title = `${title} — Catrizzz Store`;
  }, [title]);

  return (
    <main className="max-w-3xl mx-auto px-4 sm:px-6 py-12 space-y-6 bg-white">
      <Link
        to="/"
        className="inline-flex items-center gap-2 text-sm text-[#718096] hover:text-[#102A43]"
      >
        <ArrowLeft className="w-4 h-4" />
        Kembali ke Beranda
      </Link>
      <article className="surface-card rounded-2xl p-8 space-y-4">
        <h1 className="font-display text-2xl sm:text-3xl font-bold text-[#102A43]">
          {title}
        </h1>
        <p className="text-sm sm:text-base text-[#253449] leading-relaxed whitespace-pre-line">
          {body || 'Informasi kebijakan sedang dimuat.'}
        </p>
      </article>
    </main>
  );
}

export function NotFoundPage() {
  const { storefront } = useStore();
  const waNum = normalizeWhatsappNumber(storefront?.storeSettings?.whatsappNumber || '6287738172871');

  useEffect(() => {
    document.title = `Halaman Tidak Ditemukan — ${storefront?.storeSettings?.storeName || 'Catrizzz Store'}`;
  }, [storefront?.storeSettings?.storeName]);

  return (
    <main className="max-w-xl mx-auto px-4 py-24 text-center space-y-5 bg-white">
      <p className="text-sm font-mono-num text-[#244B75] font-semibold">404</p>
      <h1 className="font-display text-3xl font-bold text-[#102A43]">
        Halaman Tidak Ditemukan
      </h1>
      <p className="text-sm text-[#718096]">
        Tautan yang Anda buka mungkin telah berpindah atau tidak tersedia.
      </p>
      <div className="flex justify-center gap-3">
        <Link
          to="/"
          className="btn-navy-primary px-5 py-2.5 rounded-xl text-sm font-semibold"
        >
          Kembali ke Home
        </Link>
        <a
          href={`https://wa.me/${waNum}`}
          target="_blank"
          rel="noopener noreferrer"
          className="btn-navy-outline inline-flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-medium"
        >
          <MessageCircle className="w-4 h-4" />
          Hubungi Admin
        </a>
      </div>
    </main>
  );
}
