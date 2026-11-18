import { useCallback, useEffect, useState } from 'react';
import { ChevronDown, ChevronUp, RefreshCw, Search } from 'lucide-react';
import { useStore } from '../../context/StoreContext';
import { formatIDR } from '../../shared/pricing';
import type {
  AuditLog,
  CustomerRecord,
  InventoryLog,
  OrderStatus,
  PaymentStatus,
} from '../../shared/types';
import { OrderStatusBadge, PaymentStatusBadge } from '../StatusBadge';
import { NavyButton } from '../Interactive';

type CustomerWithOrders = CustomerRecord & {
  orders: Array<{
    id: string;
    orderNumber: string;
    totalAmount: number;
    paymentStatus: PaymentStatus;
    orderStatus: OrderStatus;
    createdAt: string;
  }>;
};

export function AdminLogsCustomersTab({
  initialSubTab = 'customers',
}: {
  initialSubTab?: 'customers' | 'audit' | 'inventory';
}) {
  const { getAuthHeader, subscribeRealtime } = useStore();
  const [subTab, setSubTab] = useState<'customers' | 'audit' | 'inventory'>(initialSubTab);

  useEffect(() => {
    setSubTab(initialSubTab);
  }, [initialSubTab]);

  const [customers, setCustomers] = useState<CustomerWithOrders[]>([]);
  const [auditLogs, setAuditLogs] = useState<AuditLog[]>([]);
  const [inventoryLogs, setInventoryLogs] = useState<InventoryLog[]>([]);
  const [search, setSearch] = useState('');
  const [expandedCustomer, setExpandedCustomer] = useState<string | null>(null);

  const loadData = useCallback(async () => {
    const headers = await getAuthHeader();
    const [custRes, logsRes] = await Promise.all([
      fetch('/api/admin/customers', { headers, credentials: 'include', cache: 'no-store' }),
      fetch('/api/admin/logs', { headers, credentials: 'include', cache: 'no-store' }),
    ]);
    if (custRes.ok) {
      const json = await custRes.json();
      setCustomers(json.customers || []);
    }
    if (logsRes.ok) {
      const json = await logsRes.json();
      setAuditLogs(json.auditLogs || []);
      setInventoryLogs(json.inventoryLogs || []);
    }
  }, [getAuthHeader]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  useEffect(() => {
    return subscribeRealtime(['logs', 'orders', 'resellers'], () => {
      loadData();
    });
  }, [subscribeRealtime, loadData]);

  const filteredCustomers = customers.filter((c) => {
    const q = search.trim().toLowerCase();
    if (!q) return true;
    return (
      c.name.toLowerCase().includes(q) ||
      c.whatsapp.includes(q) ||
      (c.email || '').toLowerCase().includes(q)
    );
  });

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex gap-1.5 p-1 rounded-xl bg-[#F8FAFC] border border-[#E5EAF0]">
          <button
            type="button"
            onClick={() => setSubTab('customers')}
            className={`px-3.5 py-1.5 rounded-lg text-xs font-semibold cursor-pointer ${
              subTab === 'customers' ? 'bg-[#102A43] text-white' : 'text-[#718096]'
            }`}
          >
            Pelanggan ({customers.length})
          </button>
          <button
            type="button"
            onClick={() => setSubTab('audit')}
            className={`px-3.5 py-1.5 rounded-lg text-xs font-semibold cursor-pointer ${
              subTab === 'audit' ? 'bg-[#102A43] text-white' : 'text-[#718096]'
            }`}
          >
            Log Audit ({auditLogs.length})
          </button>
          <button
            type="button"
            onClick={() => setSubTab('inventory')}
            className={`px-3.5 py-1.5 rounded-lg text-xs font-semibold cursor-pointer ${
              subTab === 'inventory' ? 'bg-[#102A43] text-white' : 'text-[#718096]'
            }`}
          >
            Log Inventaris ({inventoryLogs.length})
          </button>
        </div>

        <NavyButton
          type="button"
          variant="outline"
          onClick={loadData}
          className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold cursor-pointer"
        >
          <RefreshCw className="w-3.5 h-3.5" />
          Refresh
        </NavyButton>
      </div>

      {subTab === 'customers' && (
        <div className="space-y-4">
          <div className="relative max-w-sm">
            <Search className="w-4 h-4 text-[#718096] absolute left-3.5 top-1/2 -translate-y-1/2" />
            <input
              type="search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Cari nama atau WhatsApp pelanggan..."
              className="input-navy w-full rounded-xl pl-10 pr-3 py-2 text-sm"
            />
          </div>

          {filteredCustomers.length === 0 ? (
            <div className="surface-card rounded-2xl p-10 text-center text-sm text-[#718096]">
              Belum ada data pelanggan tercatat.
            </div>
          ) : (
            <div className="space-y-3">
              {filteredCustomers.map((c) => {
                const isOpen = expandedCustomer === c.id;
                return (
                  <div key={c.id} className="surface-card rounded-2xl overflow-hidden">
                    <button
                      type="button"
                      onClick={() => setExpandedCustomer(isOpen ? null : c.id)}
                      className="w-full p-4 flex flex-wrap items-center justify-between gap-4 text-left hover:bg-[#F8FAFC] cursor-pointer"
                    >
                      <div>
                        <p className="text-sm font-semibold text-[#102A43]">{c.name}</p>
                        <p className="text-xs font-mono-num text-[#244B75]">
                          +{c.whatsapp}
                          {c.email ? ` · ${c.email}` : ''}
                        </p>
                      </div>
                      <div className="flex items-center gap-6">
                        <div className="text-right">
                          <p className="text-xs text-[#718096]">Total Pesanan</p>
                          <p className="text-sm font-mono-num font-bold text-[#102A43]">
                            {c.totalOrders}x · {formatIDR(c.totalSpent)}
                          </p>
                        </div>
                        {isOpen ? (
                          <ChevronUp className="w-4 h-4 text-[#718096]" />
                        ) : (
                          <ChevronDown className="w-4 h-4 text-[#718096]" />
                        )}
                      </div>
                    </button>

                    {isOpen && (
                      <div className="px-4 pb-4 pt-2 border-t border-[#E5EAF0] space-y-2 bg-[#F8FAFC]">
                        <p className="text-xs font-semibold text-[#718096]">
                          Riwayat Transaksi
                        </p>
                        {c.orders.length === 0 ? (
                          <p className="text-xs text-[#718096]">
                            Tidak ada riwayat pesanan.
                          </p>
                        ) : (
                          <div className="divide-y divide-[#E5EAF0]">
                            {c.orders.map((ord) => (
                              <div
                                key={ord.id}
                                className="py-2 flex flex-wrap items-center justify-between gap-2 text-xs"
                              >
                                <span className="font-mono-num text-[#244B75] font-semibold">
                                  {ord.orderNumber}
                                </span>
                                <span className="text-[#718096]">
                                  {new Date(ord.createdAt).toLocaleDateString('id-ID')}
                                </span>
                                <div className="flex items-center gap-2">
                                  <PaymentStatusBadge status={ord.paymentStatus} />
                                  <OrderStatusBadge status={ord.orderStatus} />
                                </div>
                                <span className="font-mono-num text-[#102A43] font-bold">
                                  {formatIDR(ord.totalAmount)}
                                </span>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {subTab === 'audit' && (
        <div className="surface-card rounded-2xl overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="border-b border-[#E5EAF0] text-[#718096]">
              <tr>
                <th className="p-4">Waktu</th>
                <th className="p-4">Aktor</th>
                <th className="p-4">Aksi</th>
                <th className="p-4">Ringkasan</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#E5EAF0]">
              {auditLogs.length === 0 ? (
                <tr>
                  <td colSpan={4} className="p-8 text-center text-[#718096]">
                    Belum ada log aktivitas admin.
                  </td>
                </tr>
              ) : (
                auditLogs.map((log) => (
                  <tr key={log.id} className="hover:bg-[#F8FAFC]">
                    <td className="p-4 font-mono-num text-[#718096] whitespace-nowrap">
                      {new Date(log.createdAt).toLocaleString('id-ID', {
                        timeZone: 'Asia/Jakarta',
                        dateStyle: 'short',
                        timeStyle: 'short',
                      })}
                    </td>
                    <td className="p-4 text-[#244B75] font-semibold">{log.actorEmail}</td>
                    <td className="p-4 font-mono-num text-[#102A43] font-medium">
                      {log.action}
                    </td>
                    <td className="p-4 text-[#253449]">{log.summary}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      )}

      {subTab === 'inventory' && (
        <div className="surface-card rounded-2xl overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="border-b border-[#E5EAF0] text-[#718096]">
              <tr>
                <th className="p-4">Waktu</th>
                <th className="p-4">Produk</th>
                <th className="p-4">Perubahan</th>
                <th className="p-4">Stok</th>
                <th className="p-4">Keterangan</th>
                <th className="p-4">Aktor</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#E5EAF0]">
              {inventoryLogs.length === 0 ? (
                <tr>
                  <td colSpan={6} className="p-8 text-center text-[#718096]">
                    Belum ada mutasi stok tercatat.
                  </td>
                </tr>
              ) : (
                inventoryLogs.map((log) => (
                  <tr key={log.id} className="hover:bg-[#F8FAFC]">
                    <td className="p-4 font-mono-num text-[#718096] whitespace-nowrap">
                      {new Date(log.createdAt).toLocaleString('id-ID', {
                        timeZone: 'Asia/Jakarta',
                        dateStyle: 'short',
                        timeStyle: 'short',
                      })}
                    </td>
                    <td className="p-4 font-semibold text-[#102A43]">{log.productName}</td>
                    <td
                      className={`p-4 font-mono-num font-bold ${
                        log.delta >= 0 ? 'text-emerald-700' : 'text-rose-700'
                      }`}
                    >
                      {log.delta >= 0 ? `+${log.delta}` : log.delta}
                    </td>
                    <td className="p-4 font-mono-num text-[#253449]">
                      {log.previousStock} → {log.newStock}
                    </td>
                    <td className="p-4 text-[#253449]">{log.reason}</td>
                    <td className="p-4 text-[#718096]">{log.actor}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
