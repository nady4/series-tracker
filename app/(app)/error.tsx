"use client";

import { BrandMark } from "@/components/brand-mark";

export default function AppError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <div className="empty-state error-state" role="alert">
      <div className="empty-mark">
        <BrandMark />
      </div>
      <h3>Something went wrong</h3>
      <p>We couldn&apos;t load this page. Try again.</p>
      <button className="btn btn-primary" onClick={reset}>
        Try again
      </button>
    </div>
  );
}
