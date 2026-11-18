import { useEffect } from 'react';
import { Link } from 'react-router-dom';
import { Award, Copy, Mail, MessageCircle, Phone, ShieldCheck, User, Wallet } from 'lucide-react';
import { useStore } from '../context/StoreContext';
import { formatIDR, normalizeWhatsappNumber } from '../shared/pricing';
import { ResellerLayout } from '../components/reseller/ResellerLayout';
import { NavyButton } from '../components/Interactive';

export function ResellerProfilePage() {
  const { userProfile, resellerWallet, storefront, showToast } = useStore();

  useEffect(() => {
    document.title = 'Profil Reseller — Catrizzz Store';
  }, []);

  const waAdmin = normalizeWhatsappNumber(
    storefront?.storeSettings?.whatsappNumber || '6287738172871'
  );

  const copyValue = async (value: string, label: string) => {
    try {
      await navigator.clipboard.writeText(value);
      showToast(`${label} berhasil disalin.`, 'success');
    } catch {
      showToast('Gagal menyalin ke clipboard.', 'error');
    }
  };

  return (
    <ResellerLayout
      title="Profil Reseller"
      subtitle="Identitas resmi mitra reseller, kode referral pribadi, dan ringkasan status akun."
    >
      {userProfile && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
          <div className="lg:col-span-7 surface-card rounded-2xl p-6 space-y-5">
            <div className="flex items-center justify-between gap-4 border-b border-[#E5EAF0] pb-4">
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 rounded-2xl bg-[#102A43] text-white flex items-center justify-center font-bold text-lg">
                  {userProfile.name.slice(0, 1).toUpperCase()}
                </div>
                <div>
                  <h2 className="font-display text-lg font-bold text-[#102A43]">
                    {userProfile.name}
                  </h2>
                  <p className="text-xs font-mono-num text-[#718096]">@{userProfile.username}</p>
                </div>
              </div>
              <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-md bg-emerald-50 border border-emerald-200 text-emerald-700 text-xs font-semibold">
                <ShieldCheck className="w-3.5 h-3.5" />
                Active Reseller
              </span>
            </div>

            <dl className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
              <div className="surface-subtle rounded-xl p-3.5 space-y-1">
                <dt className="text-[#718096] flex items-center gap-1.5">
                  <Award className="w-3.5 h-3.5 text-[#244B75]" />
                  ID Reseller Unik
                </dt>
                <dd className="font-mono-num font-bold text-sm text-[#102A43]">
                  {userProfile.resellerId || '-'}
                </dd>
              </div>

              <div className="surface-subtle rounded-xl p-3.5 space-y-1">
                <dt className="text-[#718096] flex items-center gap-1.5">
                  <User className="w-3.5 h-3.5 text-[#244B75]" />
                  Tanggal Bergabung
                </dt>
                <dd className="font-semibold text-sm text-[#102A43]">
                  {userProfile.joinedAt
                    ? new Date(userProfile.joinedAt).toLocaleDateString('id-ID', {
                        day: '2-digit',
                        month: 'long',
                        year: 'numeric',
                      })
                    : '-'}
                </dd>
              </div>

              <div className="surface-subtle rounded-xl p-3.5 space-y-1">
                <dt className="text-[#718096] flex items-center gap-1.5">
                  <Mail className="w-3.5 h-3.5 text-[#244B75]" />
                  Email Terdaftar
                </dt>
                <dd className="font-medium text-sm text-[#102A43] break-all">
                  {userProfile.email}
                </dd>
              </div>

              <div className="surface-subtle rounded-xl p-3.5 space-y-1">
                <dt className="text-[#718096] flex items-center gap-1.5">
                  <Phone className="w-3.5 h-3.5 text-[#244B75]" />
                  Nomor WhatsApp
                </dt>
                <dd className="font-mono-num font-semibold text-sm text-[#102A43]">
                  +{userProfile.whatsapp}
                </dd>
              </div>
            </dl>

            {userProfile.referralCode && (
              <div className="p-4 rounded-xl bg-[#EAF2FA]/60 border border-[#244B75]/20 flex flex-wrap items-center justify-between gap-3">
                <div>
                  <p className="text-xs text-[#718096]">Kode Referral Resmi</p>
                  <p className="font-mono-num text-base font-bold text-[#102A43]">
                    {userProfile.referralCode}
                  </p>
                </div>
                <NavyButton
                  type="button"
                  onClick={() => copyValue(userProfile.referralCode || '', 'Kode referral')}
                  className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-semibold cursor-pointer"
                >
                  <Copy className="w-3.5 h-3.5" />
                  Salin Kode
                </NavyButton>
              </div>
            )}
          </div>

          <div className="lg:col-span-5 space-y-4">
            <div className="surface-card rounded-2xl p-6 space-y-4">
              <h3 className="text-base font-bold text-[#102A43] flex items-center gap-2">
                <Wallet className="w-4 h-4 text-[#244B75]" />
                Ringkasan Saldo Wallet
              </h3>
              <div className="space-y-2 text-xs">
                <div className="flex justify-between">
                  <span className="text-[#718096]">Saldo Aktif</span>
                  <span className="font-mono-num font-bold text-base text-[#102A43]">
                    {formatIDR(resellerWallet?.balance ?? 0)}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-[#718096]">Total Top Up</span>
                  <span className="font-mono-num font-semibold text-[#102A43]">
                    {formatIDR(resellerWallet?.totalTopup ?? 0)}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-[#718096]">Total Biaya Top Up (10%)</span>
                  <span className="font-mono-num font-semibold text-[#244B75]">
                    {formatIDR(resellerWallet?.totalFeesPaid ?? 0)}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-[#718096]">Total Belanja Wallet</span>
                  <span className="font-mono-num font-semibold text-[#102A43]">
                    {formatIDR(resellerWallet?.totalSpent ?? 0)}
                  </span>
                </div>
                <div className="flex justify-between pt-1.5 border-t border-[#E5EAF0]">
                  <span className="text-[#718096]">Biaya Keanggotaan &amp; Admin</span>
                  <span className="font-mono-num font-semibold text-emerald-700">
                    Gratis (Rp0)
                  </span>
                </div>
              </div>
              <div className="flex gap-2 pt-2">
                <Link
                  to="/reseller/topup"
                  className="btn-navy-primary flex-1 text-center py-2.5 rounded-xl text-xs font-semibold"
                >
                  Top Up Saldo
                </Link>
                <Link
                  to="/reseller/wallet/history"
                  className="btn-navy-outline flex-1 text-center py-2.5 rounded-xl text-xs font-semibold"
                >
                  Mutasi Saldo
                </Link>
              </div>
            </div>

            <div className="surface-subtle rounded-2xl p-5 space-y-3">
              <h3 className="text-sm font-bold text-[#102A43]">Bantuan &amp; Perubahan Data</h3>
              <p className="text-xs text-[#718096] leading-relaxed">
                Untuk pembaruan nomor WhatsApp, email terdaftar, atau kendala akun reseller, hubungi admin Catrizzz Store secara langsung.
              </p>
              <a
                href={`https://wa.me/${waAdmin}?text=${encodeURIComponent(
                  `Halo Admin Catrizzz Store, saya reseller @${userProfile.username} (${userProfile.resellerId || ''}) ingin menanyakan perihal profil reseller.`
                )}`}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center justify-center gap-2 w-full py-2.5 px-4 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold"
              >
                <MessageCircle className="w-4 h-4" />
                Hubungi WhatsApp Admin
              </a>
            </div>
          </div>
        </div>
      )}
    </ResellerLayout>
  );
}
