import { useEffect } from 'react';
import { BrowserRouter, Route, Routes, useLocation } from 'react-router-dom';
import { motion, MotionConfig } from 'motion/react';
import { StoreProvider } from './context/StoreContext';
import { ErrorBoundary } from './components/ErrorBoundary';
import { Navbar } from './components/Navbar';
import { Footer } from './components/Footer';
import { CartDrawer } from './components/CartDrawer';
import { ToastContainer } from './components/ToastContainer';
import { CursorAmbienceController } from './components/Interactive';
import { HomePage } from './pages/HomePage';
import { CatalogPage } from './pages/CatalogPage';
import { CategoriesPage } from './pages/CategoriesPage';
import { HelpPage } from './pages/HelpPage';
import { ProductDetailPage } from './pages/ProductDetailPage';
import { CartPage } from './pages/CartPage';
import { CheckoutPage } from './pages/CheckoutPage';
import { PaymentPage } from './pages/PaymentPage';
import { CheckReceiptPage } from './pages/CheckReceiptPage';
import { ReceiptDetailPage } from './pages/ReceiptDetailPage';
import { AdminPage } from './pages/AdminPage';
import { AdminLoginPage } from './pages/AdminLoginPage';
import { JoinResellerPage } from './pages/JoinResellerPage';
import { ResellerLoginPage } from './pages/ResellerLoginPage';
import { ResellerActivatePage } from './pages/ResellerActivatePage';
import { ResellerDashboardPage } from './pages/ResellerDashboardPage';
import { ResellerTopupPage } from './pages/ResellerTopupPage';
import { ResellerTopupHistoryPage } from './pages/ResellerTopupHistoryPage';
import { ResellerWalletHistoryPage } from './pages/ResellerWalletHistoryPage';
import { ResellerProfilePage } from './pages/ResellerProfilePage';
import { NotFoundPage, PolicyPage } from './pages/PolicyPage';

function ScrollToTop() {
  const { pathname } = useLocation();
  useEffect(() => {
    window.scrollTo(0, 0);
  }, [pathname]);
  return null;
}

function AppShell() {
  const location = useLocation();
  const isAdminRoute = location.pathname.startsWith('/admin');

  return (
    <div className="min-h-screen flex flex-col bg-white text-[#253449] relative">
      <CursorAmbienceController />
      <div className="cursor-ambient-layer" aria-hidden="true" />
      <ScrollToTop />
      <Navbar />
      <div className="flex-1 bg-white relative z-[2]">
        <motion.div
          key={location.pathname}
          initial={{ opacity: 0.92, y: 4 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.14, ease: 'easeOut' }}
        >
          <Routes location={location}>
            <Route path="/" element={<HomePage />} />
            <Route path="/produk" element={<CatalogPage />} />
            <Route path="/produk/:slug" element={<ProductDetailPage />} />
            <Route path="/kategori" element={<CategoriesPage />} />
            <Route path="/bantuan" element={<HelpPage />} />
            <Route path="/keranjang" element={<CartPage />} />
            <Route path="/checkout" element={<CheckoutPage />} />
            <Route path="/pembayaran/:orderId" element={<PaymentPage />} />
            <Route path="/cek-resi" element={<CheckReceiptPage />} />
            <Route path="/resi/:token" element={<ReceiptDetailPage />} />
            <Route path="/join-reseller" element={<JoinResellerPage />} />
            <Route path="/reseller/join" element={<JoinResellerPage />} />
            <Route path="/reseller/login" element={<ResellerLoginPage />} />
            <Route path="/reseller/activate" element={<ResellerActivatePage />} />
            <Route path="/reseller/dashboard" element={<ResellerDashboardPage />} />
            <Route path="/reseller/topup" element={<ResellerTopupPage />} />
            <Route path="/reseller/topup/history" element={<ResellerTopupHistoryPage />} />
            <Route path="/reseller/wallet/history" element={<ResellerWalletHistoryPage />} />
            <Route path="/reseller/profile" element={<ResellerProfilePage />} />
            <Route path="/admin/login" element={<AdminLoginPage />} />
            <Route path="/admin/payment-settings" element={<AdminPage initialTab="payment" />} />
            <Route path="/admin/reseller-approval" element={<AdminPage initialTab="reseller-approval" />} />
            <Route path="/admin/topups" element={<AdminPage initialTab="topups" />} />
            <Route path="/admin/cms" element={<AdminPage initialTab="cms" />} />
            <Route path="/admin" element={<AdminPage />} />
            <Route path="/kebijakan-privasi" element={<PolicyPage type="privacy" />} />
            <Route path="/syarat-ketentuan" element={<PolicyPage type="terms" />} />
            <Route path="/kebijakan-pengembalian" element={<PolicyPage type="return" />} />
            <Route path="*" element={<NotFoundPage />} />
          </Routes>
        </motion.div>
      </div>
      {!isAdminRoute && <Footer />}
      <CartDrawer />
      <ToastContainer />
    </div>
  );
}

export default function App() {
  return (
    <ErrorBoundary>
      <MotionConfig reducedMotion="user">
        <BrowserRouter>
          <StoreProvider>
            <AppShell />
          </StoreProvider>
        </BrowserRouter>
      </MotionConfig>
    </ErrorBoundary>
  );
}
