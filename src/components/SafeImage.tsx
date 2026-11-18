import { useState } from 'react';
import { Package } from 'lucide-react';

interface SafeImageProps {
  src?: string;
  alt: string;
  className?: string;
  eager?: boolean;
}

export function SafeImage({ src, alt, className = '', eager = false }: SafeImageProps) {
  const [failed, setFailed] = useState(false);

  if (!src || failed) {
    return (
      <div
        role="img"
        aria-label={alt}
        className={`flex flex-col items-center justify-center bg-[#F8FAFC] text-[#244B75]/70 p-4 text-center ${className}`}
      >
        <Package className="w-8 h-8 mb-2 opacity-75" />
        <span className="text-xs text-[#718096] line-clamp-2 max-w-[160px]">{alt}</span>
      </div>
    );
  }

  return (
    <img
      src={src}
      alt={alt}
      loading={eager ? 'eager' : 'lazy'}
      referrerPolicy="no-referrer"
      onError={() => setFailed(true)}
      className={className}
    />
  );
}
