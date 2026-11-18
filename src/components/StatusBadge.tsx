import type { OrderStatus, PaymentStatus, ResellerApplicationStatus } from '../shared/types';

export function PaymentStatusBadge({ status }: { status: PaymentStatus }) {
  const map: Record<PaymentStatus, { label: string; cls: string }> = {
    unpaid: {
      label: 'Menunggu Pembayaran',
      cls: 'bg-[#F8FAFC] text-[#253449] border-[#E5EAF0]',
    },
    pending_verification: {
      label: 'Menunggu Verifikasi',
      cls: 'bg-amber-50 text-amber-800 border-amber-200',
    },
    paid: {
      label: 'Pembayaran Berhasil',
      cls: 'bg-emerald-50 text-emerald-800 border-emerald-200',
    },
    rejected: {
      label: 'Pembayaran Ditolak',
      cls: 'bg-rose-50 text-rose-700 border-rose-200',
    },
    refunded: {
      label: 'Dana Dikembalikan',
      cls: 'bg-[#EAF2FA] text-[#102A43] border-[#244B75]/20',
    },
  };
  const cfg = map[status] || map.unpaid;
  return (
    <span
      className={`inline-flex items-center px-2.5 py-1 rounded-md border text-xs font-medium whitespace-nowrap ${cfg.cls}`}
    >
      {cfg.label}
    </span>
  );
}

export function OrderStatusBadge({ status }: { status: OrderStatus }) {
  const map: Record<OrderStatus, { label: string; cls: string }> = {
    pending_payment: {
      label: 'Menunggu Pembayaran',
      cls: 'bg-[#F8FAFC] text-[#253449] border-[#E5EAF0]',
    },
    processing: {
      label: 'Sedang Diproses',
      cls: 'bg-[#EAF2FA] text-[#102A43] border-[#244B75]/20',
    },
    shipped: {
      label: 'Dikirim',
      cls: 'bg-indigo-50 text-indigo-800 border-indigo-200',
    },
    completed: {
      label: 'Selesai',
      cls: 'bg-emerald-50 text-emerald-800 border-emerald-200',
    },
    cancelled: {
      label: 'Transaksi Dibatalkan',
      cls: 'bg-rose-50 text-rose-700 border-rose-200',
    },
  };
  const cfg = map[status] || map.pending_payment;
  return (
    <span
      className={`inline-flex items-center px-2.5 py-1 rounded-md border text-xs font-medium whitespace-nowrap ${cfg.cls}`}
    >
      {cfg.label}
    </span>
  );
}

export function ResellerAppStatusBadge({ status }: { status: ResellerApplicationStatus }) {
  const map: Record<ResellerApplicationStatus, { label: string; cls: string }> = {
    pending_approval: {
      label: 'Menunggu Persetujuan Admin',
      cls: 'bg-amber-50 text-amber-800 border-amber-200',
    },
    unpaid: {
      label: 'Menunggu Persetujuan Admin',
      cls: 'bg-[#F8FAFC] text-[#253449] border-[#E5EAF0]',
    },
    pending_verification: {
      label: 'Menunggu Verifikasi Admin',
      cls: 'bg-amber-50 text-amber-800 border-amber-200',
    },
    approved: {
      label: 'Disetujui · Reseller Aktif',
      cls: 'bg-emerald-50 text-emerald-800 border-emerald-200',
    },
    rejected: {
      label: 'Ditolak',
      cls: 'bg-rose-50 text-rose-700 border-rose-200',
    },
  };
  const cfg = map[status] || map.pending_approval;
  return (
    <span
      className={`inline-flex items-center px-2.5 py-1 rounded-md border text-xs font-medium whitespace-nowrap ${cfg.cls}`}
    >
      {cfg.label}
    </span>
  );
}
