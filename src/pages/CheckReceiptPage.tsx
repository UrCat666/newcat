import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Receipt, Search, ShieldCheck } from 'lucide-react';
import { NavyButton } from '../components/Interactive';

export function CheckReceiptPage() {
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const navigate = useNavigate();

  useEffect(() => {
    document.title = 'Cek Resi — Catrizzz Store';
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    const clean = query.trim();
    if (!clean) {
      setError('RESI TIDAK DITEMUKAN ATAU KODE AKSES TIDAK VALID.');
      return;
    }

    setLoading(true);
    try {
      const res = await fetch('/api/receipts/lookup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: clean }),
      });
      const json = await res.json();
      if (!res.ok) {
        setError(json.error || 'RESI TIDAK DITEMUKAN ATAU KODE AKSES TIDAK VALID.');
        return;
      }
      navigate(`/resi/${encodeURIComponent(json.token)}`);
    } catch {
      setError('Gagal terhubung ke server. Silakan coba kembali.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="max-w-2xl mx-auto px-4 sm:px-6 py-16 space-y-8 bg-white">
      <div className="text-center space-y-3">
        <div className="w-12 h-12 rounded-2xl bg-[#EAF2FA] border border-[#E5EAF0] flex items-center justify-center mx-auto text-[#102A43]">
          <Receipt className="w-6 h-6" />
        </div>
        <h1 className="font-display text-3xl sm:text-4xl font-bold text-[#102A43] tracking-tight">
          Lacak Transaksi Anda
        </h1>
        <p className="text-sm text-[#718096] leading-relaxed">
          Masukkan Kode Akses Resi unik (
          <span className="font-mono-num text-[#102A43] font-medium">CTRZ-...</span>) atau
          tempel tautan resi Anda untuk melihat status pembayaran dan pengiriman terbaru.
        </p>
      </div>

      <form onSubmit={handleSubmit} className="surface-card rounded-2xl p-6 space-y-4">
        <div className="space-y-1.5">
          <label
            htmlFor="receipt-lookup-input"
            className="block text-xs font-semibold text-[#253449]"
          >
            Token Resi atau Tautan Resi
          </label>
          <div className="flex flex-col sm:flex-row gap-2.5">
            <input
              id="receipt-lookup-input"
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Tempel Token Resi (CTRZ-...) atau Link Resi"
              className="input-navy flex-1 rounded-xl px-4 py-3 text-sm font-mono-num"
            />
            <NavyButton
              type="submit"
              disabled={loading}
              className="inline-flex items-center justify-center gap-2 px-6 py-3 rounded-xl text-sm font-semibold whitespace-nowrap disabled:opacity-50 cursor-pointer"
            >
              <Search className="w-4 h-4" />
              {loading ? 'Memeriksa...' : 'Cek Resi'}
            </NavyButton>
          </div>
        </div>

        {error && (
          <div
            role="alert"
            className="p-3.5 rounded-xl bg-rose-50 border border-rose-200 text-xs sm:text-sm font-medium text-rose-700"
          >
            {error}
          </div>
        )}
      </form>

      <section className="surface-subtle rounded-2xl p-6 space-y-3 text-xs sm:text-sm text-[#253449]">
        <h2 className="font-semibold text-[#102A43] flex items-center gap-2">
          <ShieldCheck className="w-4 h-4 text-[#244B75]" />
          Di Mana Menemukan Kode Resi?
        </h2>
        <ul className="list-disc list-inside space-y-1.5 text-[#718096]">
          <li>
            Kode Akses Resi (
            <span className="font-mono-num text-[#102A43]">CTRZ-...</span>) muncul otomatis
            setelah Anda menyelesaikan checkout atau konfirmasi pembayaran.
          </li>
          <li>
            Link resi lengkap juga tercantum di dalam pesan WhatsApp konfirmasi pesanan Anda.
          </li>
          <li>
            Demi melindungi privasi pembeli, resi hanya dapat dibuka menggunakan token acak
            yang terikat pada transaksi Anda.
          </li>
        </ul>
      </section>
    </main>
  );
}
