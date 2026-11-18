import React from 'react';
import { AlertTriangle, MessageCircle, RefreshCw } from 'lucide-react';

interface State {
  hasError: boolean;
}

export class ErrorBoundary extends React.Component<{ children: React.ReactNode }, State> {
  state: State = { hasError: false };

  static getDerivedStateFromError(): State {
    return { hasError: true };
  }

  componentDidCatch(error: unknown) {
    console.error('UI ErrorBoundary caught:', error);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen bg-white text-[#253449] flex items-center justify-center p-6">
          <div className="max-w-md w-full surface-card rounded-2xl p-8 text-center space-y-5">
            <div className="w-12 h-12 rounded-xl bg-[#EAF2FA] text-[#102A43] flex items-center justify-center mx-auto">
              <AlertTriangle className="w-6 h-6" />
            </div>
            <div className="space-y-2">
              <h1 className="text-xl font-semibold text-[#102A43]">Terjadi Gangguan Tampilan</h1>
              <p className="text-sm text-[#718096] leading-relaxed">
                Halaman mengalami kendala tak terduga. Silakan muat ulang halaman atau hubungi admin Catrizzz Store jika kendala berlanjut.
              </p>
            </div>
            <div className="flex flex-wrap gap-3 justify-center">
              <button
                type="button"
                onClick={() => window.location.reload()}
                className="btn-navy-primary inline-flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold cursor-pointer"
              >
                <RefreshCw className="w-4 h-4" />
                Muat Ulang
              </button>
              <a
                href={`https://wa.me/${
                  (typeof window !== 'undefined' &&
                    (window as unknown as { __CATRIZZZ_WA__?: string }).__CATRIZZZ_WA__) ||
                  '6287738172871'
                }`}
                target="_blank"
                rel="noopener noreferrer"
                className="btn-navy-outline inline-flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-medium"
              >
                <MessageCircle className="w-4 h-4" />
                Hubungi Admin
              </a>
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
