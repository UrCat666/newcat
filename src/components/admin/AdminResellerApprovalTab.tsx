import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Ban,
  Check,
  Clock,
  Eye,
  History,
  RefreshCw,
  Search,
  ShieldAlert,
  ShieldCheck,
  UserCheck,
  X,
} from 'lucide-react';
import { useStore } from '../../context/StoreContext';
import type {
  ResellerApplication,
  ResellerProfileStatus,
  ResellerStatusHistoryEntry,
} from '../../shared/types';
import { NavyButton } from '../Interactive';
import { ResellerAppStatusBadge } from '../StatusBadge';

interface ResellerAdminSummary {
  totalResellers: number;
  activeResellers: number;
  pendingApprovalResellers?: number;
  rejectedResellers?: number;
  suspendedResellers: number;
  bannedResellers: number;
  pendingApplications: number;
}

interface ResellerProfileRow {
  id: string;
  userId: string;
  username: string;
  name: string;
  email: string;
  whatsapp: string;
  referralCode: string;
  status: ResellerProfileStatus;
  applicationId: string;
  statusHistory?: ResellerStatusHistoryEntry[];
  joinedAt: string;
  updatedAt: string;
}

interface ApprovalDetailModalState {
  application: ResellerApplication | null;
  profile: ResellerProfileRow | null;
}

interface AdminResellerApprovalTabProps {
  onPendingCountChange?: (count: number) => void;
}

export function AdminResellerApprovalTab({
  onPendingCountChange,
}: AdminResellerApprovalTabProps) {
  const { getAuthHeader, showToast, subscribeRealtime } = useStore();

  const [applications, setApplications] = useState<ResellerApplication[]>([]);
  const [resellers, setResellers] = useState<ResellerProfileRow[]>([]);
  const [summary, setSummary] = useState<ResellerAdminSummary>({
    totalResellers: 0,
    activeResellers: 0,
    pendingApprovalResellers: 0,
    rejectedResellers: 0,
    suspendedResellers: 0,
    bannedResellers: 0,
    pendingApplications: 0,
  });
  const [loading, setLoading] = useState(true);

  const [statusFilter, setStatusFilter] = useState<
    'all' | 'pending_approval' | 'approved' | 'rejected' | 'suspended'
  >('all');
  const [search, setSearch] = useState('');

  const [detailModal, setDetailModal] = useState<ApprovalDetailModalState | null>(null);
  const [rejectTargetApp, setRejectTargetApp] = useState<ResellerApplication | null>(null);
  const [rejectionReason, setRejectionReason] = useState('');
  const [statusChangeReason, setStatusChangeReason] = useState('');
  const [processingId, setProcessingId] = useState<string | null>(null);

  const loadData = useCallback(
    async (silent = false) => {
      if (!silent) {
        setLoading(true);
      }
      try {
        const headers = await getAuthHeader();
        const res = await fetch('/api/admin/resellers', {
          headers,
          credentials: 'include',
          cache: 'no-store',
        });
        const json = await res.json().catch(() => null);
        if (res.ok && json) {
          setApplications(json.applications || []);
          setResellers(json.resellers || []);
          if (json.summary) {
            setSummary(json.summary);
            onPendingCountChange?.(json.summary.pendingApplications ?? 0);
          }
        } else if (!silent) {
          showToast(json?.error || 'Gagal memuat data pendaftaran reseller.', 'error');
        }
      } catch {
        if (!silent) {
          showToast('Koneksi bermasalah saat memuat pendaftaran reseller.', 'error');
        }
      } finally {
        if (!silent) {
          setLoading(false);
        }
      }
    },
    [getAuthHeader, onPendingCountChange, showToast]
  );

  useEffect(() => {
    loadData();
  }, [loadData]);

  useEffect(() => {
    return subscribeRealtime(['reseller_apps', 'resellers'], () => {
      loadData(true);
    });
  }, [subscribeRealtime, loadData]);

  const profileByAppId = useMemo(() => {
    const map = new Map<string, ResellerProfileRow>();
    for (const r of resellers) {
      if (r.applicationId) map.set(r.applicationId, r);
    }
    return map;
  }, [resellers]);

  const profileByUserId = useMemo(() => {
    const map = new Map<string, ResellerProfileRow>();
    for (const r of resellers) {
      map.set(r.userId, r);
    }
    return map;
  }, [resellers]);

  const isPendingStatus = (status: ResellerApplication['status']) =>
    status === 'pending_approval' ||
    status === 'pending_verification' ||
    status === 'unpaid';

  const filteredApplications = useMemo(() => {
    const q = search.trim().toLowerCase();
    return applications.filter((app) => {
      const linkedProfile =
        profileByAppId.get(app.id) ||
        (app.userId ? profileByUserId.get(app.userId) : undefined);

      if (statusFilter === 'pending_approval' && !isPendingStatus(app.status)) {
        return false;
      }
      if (statusFilter === 'approved' && app.status !== 'approved') {
        return false;
      }
      if (statusFilter === 'rejected' && app.status !== 'rejected') {
        return false;
      }
      if (
        statusFilter === 'suspended' &&
        linkedProfile?.status !== 'suspended' &&
        linkedProfile?.status !== 'banned'
      ) {
        return false;
      }
      if (q) {
        return (
          app.applicationNumber.toLowerCase().includes(q) ||
          app.applicantName.toLowerCase().includes(q) ||
          app.username.toLowerCase().includes(q) ||
          app.applicantEmail.toLowerCase().includes(q) ||
          app.applicantWhatsapp.toLowerCase().includes(q) ||
          (linkedProfile?.referralCode || '').toLowerCase().includes(q)
        );
      }
      return true;
    });
  }, [applications, profileByAppId, profileByUserId, search, statusFilter]);

  const handleApproveApplication = async (app: ResellerApplication) => {
    setProcessingId(app.id);
    try {
      const headers = {
        ...(await getAuthHeader()),
        'Content-Type': 'application/json',
      };
      const res = await fetch(`/api/admin/resellers/applications/${app.id}/verify`, {
        method: 'POST',
        headers,
        credentials: 'include',
        body: JSON.stringify({ decision: 'approve' }),
      });
      const json = await res.json().catch(() => null);
      if (!res.ok) {
        showToast(json?.error || 'Gagal menyetujui pendaftaran reseller.', 'error');
        return;
      }
      showToast(
        `Akun reseller @${app.username} disetujui dan berstatus Active.`,
        'success'
      );
      setDetailModal(null);
      await loadData();
    } catch {
      showToast('Koneksi bermasalah saat menyetujui pendaftaran reseller.', 'error');
    } finally {
      setProcessingId(null);
    }
  };

  const handleRejectSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!rejectTargetApp) return;
    if (rejectionReason.trim().length < 3) {
      showToast('Alasan penolakan pendaftaran wajib diisi minimal 3 karakter.', 'error');
      return;
    }

    setProcessingId(rejectTargetApp.id);
    try {
      const headers = {
        ...(await getAuthHeader()),
        'Content-Type': 'application/json',
      };
      const res = await fetch(
        `/api/admin/resellers/applications/${rejectTargetApp.id}/verify`,
        {
          method: 'POST',
          headers,
          credentials: 'include',
          body: JSON.stringify({
            decision: 'reject',
            rejectionReason: rejectionReason.trim(),
          }),
        }
      );
      const json = await res.json().catch(() => null);
      if (!res.ok) {
        showToast(json?.error || 'Gagal menolak pendaftaran reseller.', 'error');
        return;
      }
      showToast(`Pendaftaran @${rejectTargetApp.username} ditolak.`, 'success');
      setRejectTargetApp(null);
      setRejectionReason('');
      setDetailModal(null);
      await loadData();
    } catch {
      showToast('Koneksi bermasalah saat menolak pendaftaran reseller.', 'error');
    } finally {
      setProcessingId(null);
    }
  };

  const handleUpdateProfileStatus = async (
    profile: ResellerProfileRow,
    nextStatus: ResellerProfileStatus
  ) => {
    setProcessingId(profile.id);
    try {
      const headers = {
        ...(await getAuthHeader()),
        'Content-Type': 'application/json',
      };
      const res = await fetch(`/api/admin/resellers/${profile.id}/status`, {
        method: 'PATCH',
        headers,
        credentials: 'include',
        body: JSON.stringify({
          status: nextStatus,
          reason: statusChangeReason.trim() || undefined,
        }),
      });
      const json = await res.json().catch(() => null);
      if (!res.ok) {
        showToast(json?.error || 'Gagal memperbarui status akun reseller.', 'error');
        return;
      }
      showToast(
        `Status akun @${profile.username} diubah menjadi ${nextStatus}.`,
        'success'
      );
      setStatusChangeReason('');
      setDetailModal(null);
      await loadData();
    } catch {
      showToast('Koneksi bermasalah saat memperbarui status reseller.', 'error');
    } finally {
      setProcessingId(null);
    }
  };

  const renderProfileBadge = (status?: ResellerProfileStatus) => {
    if (!status) return null;
    const map: Record<ResellerProfileStatus, { label: string; cls: string }> = {
      pending_approval: {
        label: 'Pending Approval',
        cls: 'bg-amber-50 border-amber-200 text-amber-800',
      },
      active: {
        label: 'Active',
        cls: 'bg-emerald-50 border-emerald-200 text-emerald-700',
      },
      suspended: {
        label: 'Suspended',
        cls: 'bg-amber-100 border-amber-300 text-amber-900',
      },
      banned: {
        label: 'Banned',
        cls: 'bg-rose-100 border-rose-300 text-rose-800',
      },
      rejected: {
        label: 'Rejected',
        cls: 'bg-rose-50 border-rose-200 text-rose-700',
      },
    };
    const cfg = map[status] || map.pending_approval;
    return (
      <span
        className={`inline-flex items-center px-2 py-0.5 rounded-md border text-[11px] font-semibold whitespace-nowrap ${cfg.cls}`}
      >
        {cfg.label}
      </span>
    );
  };

  return (
    <div className="space-y-6">
      {/* Header KPI Strip */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div
          data-spotlight="true"
          className="surface-card spotlight-surface rounded-2xl p-4 space-y-1 border-l-4 border-l-amber-500"
        >
          <p className="text-xs text-[#718096]">Menunggu Persetujuan</p>
          <p className="text-2xl font-bold font-mono-num text-amber-700">
            {summary.pendingApplications}
          </p>
          <p className="text-[11px] text-[#718096]">Status: pending_approval</p>
        </div>

        <div
          data-spotlight="true"
          className="surface-card spotlight-surface rounded-2xl p-4 space-y-1 border-l-4 border-l-emerald-600"
        >
          <p className="text-xs text-[#718096]">Reseller Aktif</p>
          <p className="text-2xl font-bold font-mono-num text-emerald-700">
            {summary.activeResellers}
          </p>
          <p className="text-[11px] text-[#718096]">Dapat login, top up &amp; transaksi</p>
        </div>

        <div data-spotlight="true" className="surface-card spotlight-surface rounded-2xl p-4 space-y-1">
          <p className="text-xs text-[#718096]">Pendaftaran Ditolak</p>
          <p className="text-2xl font-bold font-mono-num text-rose-700">
            {summary.rejectedResellers ??
              applications.filter((a) => a.status === 'rejected').length}
          </p>
          <p className="text-[11px] text-[#718096]">Tidak dapat akses portal reseller</p>
        </div>

        <div data-spotlight="true" className="surface-card spotlight-surface rounded-2xl p-4 space-y-1">
          <p className="text-xs text-[#718096]">Suspended / Banned</p>
          <p className="text-2xl font-bold font-mono-num text-[#102A43]">
            {summary.suspendedResellers + summary.bannedResellers}
          </p>
          <p className="text-[11px] text-[#718096]">
            {summary.suspendedResellers} suspended · {summary.bannedResellers} banned
          </p>
        </div>
      </div>

      {/* Filter & Search Bar */}
      <div className="surface-card rounded-2xl p-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap gap-1 p-1 rounded-xl bg-[#F8FAFC] border border-[#E5EAF0]">
          {[
            { id: 'all', label: `Semua (${applications.length})` },
            { id: 'pending_approval', label: `Pending Approval (${summary.pendingApplications})` },
            {
              id: 'approved',
              label: `Disetujui (${applications.filter((a) => a.status === 'approved').length})`,
            },
            {
              id: 'rejected',
              label: `Ditolak (${applications.filter((a) => a.status === 'rejected').length})`,
            },
            {
              id: 'suspended',
              label: `Suspended/Banned (${summary.suspendedResellers + summary.bannedResellers})`,
            },
          ].map((btn) => (
            <button
              key={btn.id}
              type="button"
              onClick={() => setStatusFilter(btn.id as typeof statusFilter)}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold cursor-pointer whitespace-nowrap ${
                statusFilter === btn.id
                  ? 'bg-[#102A43] text-white'
                  : 'text-[#718096] hover:text-[#102A43]'
              }`}
            >
              {btn.label}
            </button>
          ))}
        </div>

        <div className="flex items-center gap-2 flex-1 sm:flex-initial">
          <div className="relative flex-1 sm:w-64">
            <Search className="w-4 h-4 text-[#718096] absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Cari nama, username, email, WA, RSL..."
              className="input-navy w-full rounded-xl pl-9 pr-3 py-2 text-xs"
            />
          </div>
          <NavyButton
            type="button"
            variant="outline"
            onClick={() => loadData()}
            className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold cursor-pointer"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            Refresh
          </NavyButton>
        </div>
      </div>

      {/* Applications & Approval Queue List */}
      <div className="space-y-3">
        {loading ? (
          <div className="surface-card rounded-2xl p-10 text-center text-sm text-[#718096]">
            Memuat daftar pendaftaran reseller...
          </div>
        ) : filteredApplications.length === 0 ? (
          <div className="surface-card rounded-2xl p-10 text-center text-sm text-[#718096]">
            Tidak ada pendaftaran reseller sesuai filter saat ini.
          </div>
        ) : (
          filteredApplications.map((app) => {
            const linkedProfile =
              profileByAppId.get(app.id) ||
              (app.userId ? profileByUserId.get(app.userId) : undefined);
            const pending = isPendingStatus(app.status);

            return (
              <div
                key={app.id}
                data-spotlight="true"
                className="surface-card spotlight-surface rounded-2xl p-5 flex flex-col lg:flex-row lg:items-center justify-between gap-4"
              >
                <div className="space-y-1.5 text-xs">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-mono-num font-bold text-[#102A43] text-sm">
                      {app.applicationNumber}
                    </span>
                    <ResellerAppStatusBadge status={app.status} />
                    {linkedProfile && renderProfileBadge(linkedProfile.status)}
                    <span className="px-2 py-0.5 rounded bg-emerald-50 border border-emerald-200 text-emerald-700 font-mono-num font-semibold">
                      Gratis (Rp0)
                    </span>
                  </div>

                  <p className="text-sm font-bold text-[#102A43]">
                    {app.applicantName}{' '}
                    <span className="text-xs font-mono-num font-normal text-[#244B75]">
                      (@{app.username})
                    </span>
                  </p>

                  <div className="flex flex-wrap gap-x-4 gap-y-1 text-[#718096]">
                    <span>
                      Email: <strong className="text-[#253449]">{app.applicantEmail}</strong>
                    </span>
                    <span>
                      WhatsApp:{' '}
                      <strong className="font-mono-num text-[#253449]">
                        +{app.applicantWhatsapp}
                      </strong>
                    </span>
                    <span>
                      Daftar:{' '}
                      <span className="font-mono-num text-[#253449]">
                        {new Date(app.createdAt).toLocaleString('id-ID', {
                          timeZone: 'Asia/Jakarta',
                          dateStyle: 'medium',
                          timeStyle: 'short',
                        })}
                      </span>
                    </span>
                    {linkedProfile?.referralCode && (
                      <span>
                        Kode Ref:{' '}
                        <strong className="font-mono-num text-[#244B75]">
                          {linkedProfile.referralCode}
                        </strong>
                      </span>
                    )}
                  </div>

                  {app.notes && (
                    <p className="text-[#253449]">Catatan: {app.notes}</p>
                  )}
                  {app.rejectionReason && (
                    <p className="text-rose-700 font-medium">
                      Alasan Penolakan: {app.rejectionReason}
                    </p>
                  )}
                </div>

                <div className="flex flex-wrap items-center gap-2 shrink-0">
                  <NavyButton
                    type="button"
                    variant="outline"
                    onClick={() => {
                      setStatusChangeReason('');
                      setDetailModal({
                        application: app,
                        profile: linkedProfile || null,
                      });
                    }}
                    className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-semibold cursor-pointer"
                  >
                    <Eye className="w-3.5 h-3.5" />
                    Detail &amp; Riwayat
                  </NavyButton>

                  {pending && (
                    <>
                      <button
                        type="button"
                        disabled={processingId === app.id}
                        onClick={() => handleApproveApplication(app)}
                        className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold disabled:opacity-50 cursor-pointer"
                      >
                        <Check className="w-3.5 h-3.5" />
                        Setujui (Approve)
                      </button>
                      <button
                        type="button"
                        disabled={processingId === app.id}
                        onClick={() => {
                          setRejectTargetApp(app);
                          setRejectionReason('');
                        }}
                        className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-rose-600 hover:bg-rose-700 text-white text-xs font-semibold disabled:opacity-50 cursor-pointer"
                      >
                        <X className="w-3.5 h-3.5" />
                        Tolak (Reject)
                      </button>
                    </>
                  )}
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* Registration Detail & Status History Modal */}
      {detailModal && detailModal.application && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Detail Pendaftaran Reseller"
          className="fixed inset-0 z-50 bg-[#102A43]/60 backdrop-blur-xs flex items-center justify-center p-4 overflow-y-auto"
        >
          <div className="surface-card rounded-2xl max-w-2xl w-full p-6 space-y-5 my-8 max-h-[90vh] overflow-y-auto shadow-xl">
            <div className="flex items-start justify-between gap-4 border-b border-[#E5EAF0] pb-4">
              <div className="space-y-1">
                <div className="flex items-center gap-2 flex-wrap">
                  <UserCheck className="w-5 h-5 text-[#244B75]" />
                  <h3 className="font-display text-lg font-bold text-[#102A43]">
                    Detail Pendaftaran Reseller — {detailModal.application.applicationNumber}
                  </h3>
                </div>
                <div className="flex items-center gap-2 flex-wrap">
                  <ResellerAppStatusBadge status={detailModal.application.status} />
                  {detailModal.profile && renderProfileBadge(detailModal.profile.status)}
                </div>
              </div>
              <button
                type="button"
                onClick={() => setDetailModal(null)}
                aria-label="Tutup detail pendaftaran"
                className="p-1.5 rounded-lg text-[#718096] hover:text-[#102A43] cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs bg-[#F8FAFC] p-4 rounded-xl border border-[#E5EAF0]">
              <div>
                <p className="text-[#718096]">Nama Lengkap</p>
                <p className="font-semibold text-[#102A43] mt-0.5">
                  {detailModal.application.applicantName}
                </p>
              </div>
              <div>
                <p className="text-[#718096]">Username</p>
                <p className="font-mono-num font-semibold text-[#244B75] mt-0.5">
                  @{detailModal.application.username}
                </p>
              </div>
              <div>
                <p className="text-[#718096]">Email</p>
                <p className="font-medium text-[#102A43] mt-0.5">
                  {detailModal.application.applicantEmail}
                </p>
              </div>
              <div>
                <p className="text-[#718096]">Nomor WhatsApp</p>
                <p className="font-mono-num font-medium text-[#102A43] mt-0.5">
                  +{detailModal.application.applicantWhatsapp}
                </p>
              </div>
              <div>
                <p className="text-[#718096]">Biaya Pendaftaran / Keanggotaan</p>
                <p className="font-mono-num font-bold text-emerald-700 mt-0.5">
                  Gratis (Rp0)
                </p>
              </div>
              <div>
                <p className="text-[#718096]">Kode Referral</p>
                <p className="font-mono-num font-bold text-[#102A43] mt-0.5">
                  {detailModal.profile?.referralCode || '-'}
                </p>
              </div>
              {detailModal.application.notes && (
                <div className="sm:col-span-2">
                  <p className="text-[#718096]">Catatan Pendaftar</p>
                  <p className="text-[#253449] mt-0.5">{detailModal.application.notes}</p>
                </div>
              )}
              {detailModal.application.rejectionReason && (
                <div className="sm:col-span-2 p-2.5 rounded-lg bg-rose-50 border border-rose-200 text-rose-800">
                  <strong>Alasan Penolakan:</strong> {detailModal.application.rejectionReason}
                </div>
              )}
            </div>

            {/* Status History Timeline */}
            <div className="space-y-2.5">
              <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-[#102A43]">
                <History className="w-4 h-4 text-[#244B75]" />
                Riwayat Perubahan Status Akun (Status History)
              </div>
              {(() => {
                const history =
                  detailModal.profile?.statusHistory?.length
                    ? detailModal.profile.statusHistory
                    : detailModal.application.statusHistory || [];
                if (history.length === 0) {
                  return (
                    <p className="text-xs text-[#718096] p-3 rounded-xl bg-[#F8FAFC] border border-[#E5EAF0]">
                      Belum ada catatan perubahan status.
                    </p>
                  );
                }
                return (
                  <div className="space-y-2 border border-[#E5EAF0] rounded-xl p-3 bg-white max-h-56 overflow-y-auto">
                    {history.map((entry) => (
                      <div
                        key={entry.id}
                        className="flex items-start justify-between gap-3 text-xs pb-2 border-b border-[#E5EAF0] last:border-b-0 last:pb-0"
                      >
                        <div className="space-y-0.5">
                          <p className="font-semibold text-[#102A43]">
                            {entry.previousStatus ? `${entry.previousStatus} → ` : ''}
                            <span className="font-mono-num text-[#244B75]">{entry.newStatus}</span>
                          </p>
                          {entry.reason && (
                            <p className="text-[#253449]">{entry.reason}</p>
                          )}
                          <p className="text-[11px] text-[#718096]">
                            Oleh: {entry.changedByName}
                          </p>
                        </div>
                        <span className="text-[11px] font-mono-num text-[#718096] whitespace-nowrap">
                          {new Date(entry.createdAt).toLocaleString('id-ID', {
                            timeZone: 'Asia/Jakarta',
                            dateStyle: 'short',
                            timeStyle: 'short',
                          })}
                        </span>
                      </div>
                    ))}
                  </div>
                );
              })()}
            </div>

            {/* Admin Actions inside Modal */}
            <div className="pt-3 border-t border-[#E5EAF0] space-y-3">
              {isPendingStatus(detailModal.application.status) ? (
                <div className="flex flex-wrap items-center justify-end gap-2">
                  <button
                    type="button"
                    disabled={processingId === detailModal.application.id}
                    onClick={() => {
                      setRejectTargetApp(detailModal.application);
                      setRejectionReason('');
                    }}
                    className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-rose-600 hover:bg-rose-700 text-white text-xs font-semibold cursor-pointer"
                  >
                    <X className="w-3.5 h-3.5" />
                    Tolak Pendaftaran
                  </button>
                  <button
                    type="button"
                    disabled={processingId === detailModal.application.id}
                    onClick={() => handleApproveApplication(detailModal.application!)}
                    className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold cursor-pointer"
                  >
                    <ShieldCheck className="w-3.5 h-3.5" />
                    Setujui &amp; Aktifkan Reseller
                  </button>
                </div>
              ) : detailModal.profile ? (
                <div className="space-y-3">
                  <label className="block space-y-1 text-xs font-semibold text-[#253449]">
                    Catatan / Alasan Perubahan Status (Opsional untuk Audit &amp; Status History)
                    <input
                      type="text"
                      value={statusChangeReason}
                      onChange={(e) => setStatusChangeReason(e.target.value)}
                      placeholder="Contoh: Aktivasi kembali setelah klarifikasi data atau penangguhan sementara"
                      className="input-navy w-full rounded-xl px-3.5 py-2 text-xs font-normal"
                    />
                  </label>
                  <div className="flex flex-wrap items-center justify-end gap-2">
                    {detailModal.profile.status !== 'active' && (
                      <button
                        type="button"
                        disabled={processingId === detailModal.profile.id}
                        onClick={() => handleUpdateProfileStatus(detailModal.profile!, 'active')}
                        className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold cursor-pointer"
                      >
                        <Check className="w-3.5 h-3.5" />
                        Aktifkan Kembali
                      </button>
                    )}
                    {detailModal.profile.status === 'active' && (
                      <button
                        type="button"
                        disabled={processingId === detailModal.profile.id}
                        onClick={() =>
                          handleUpdateProfileStatus(detailModal.profile!, 'suspended')
                        }
                        className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-amber-600 hover:bg-amber-700 text-white text-xs font-semibold cursor-pointer"
                      >
                        <Ban className="w-3.5 h-3.5" />
                        Suspend Akun
                      </button>
                    )}
                    {detailModal.profile.status !== 'banned' && (
                      <button
                        type="button"
                        disabled={processingId === detailModal.profile.id}
                        onClick={() => handleUpdateProfileStatus(detailModal.profile!, 'banned')}
                        className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-rose-600 hover:bg-rose-700 text-white text-xs font-semibold cursor-pointer"
                      >
                        <ShieldAlert className="w-3.5 h-3.5" />
                        Ban Permanen
                      </button>
                    )}
                    <NavyButton
                      type="button"
                      variant="outline"
                      onClick={() => setDetailModal(null)}
                      className="px-4 py-2 rounded-xl text-xs font-semibold cursor-pointer"
                    >
                      Tutup
                    </NavyButton>
                  </div>
                </div>
              ) : null}
            </div>
          </div>
        </div>
      )}

      {/* Reject Reason Modal */}
      {rejectTargetApp && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Tolak Pendaftaran Reseller"
          className="fixed inset-0 z-[60] bg-[#102A43]/60 backdrop-blur-xs flex items-center justify-center p-4"
        >
          <form
            onSubmit={handleRejectSubmit}
            className="surface-card rounded-2xl max-w-md w-full p-6 space-y-4 shadow-xl"
          >
            <div className="flex items-center gap-2 text-rose-700">
              <Clock className="w-5 h-5" />
              <h3 className="font-display text-lg font-bold text-[#102A43]">
                Tolak Pendaftaran @{rejectTargetApp.username}
              </h3>
            </div>
            <p className="text-xs text-[#718096]">
              Akun yang ditolak tidak akan bisa login, top up saldo, atau bertransaksi. Alasan penolakan akan ditampilkan kepada pendaftar.
            </p>
            <textarea
              rows={3}
              required
              minLength={3}
              value={rejectionReason}
              onChange={(e) => setRejectionReason(e.target.value)}
              placeholder="Contoh: Data WhatsApp atau email tidak valid / belum memenuhi kriteria reseller."
              className="input-navy w-full rounded-xl px-3.5 py-2.5 text-sm"
            />
            <div className="flex justify-end gap-2">
              <NavyButton
                type="button"
                variant="outline"
                onClick={() => setRejectTargetApp(null)}
                className="px-4 py-2 rounded-xl text-xs font-semibold cursor-pointer"
              >
                Batal
              </NavyButton>
              <button
                type="submit"
                disabled={processingId === rejectTargetApp.id}
                className="px-4 py-2 rounded-xl bg-rose-600 hover:bg-rose-700 text-white text-xs font-semibold disabled:opacity-50 cursor-pointer"
              >
                {processingId === rejectTargetApp.id ? 'Menolak...' : 'Tolak Pendaftaran'}
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
