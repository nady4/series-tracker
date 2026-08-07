"use client";

export default function GlobalError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <html lang="en">
      <body>
        <main className="auth-wrap">
          <div className="empty-state error-state" role="alert">
            <h3>Something went wrong</h3>
            <p>Please try loading the app again.</p>
            <button className="btn btn-primary" onClick={reset}>
              Try again
            </button>
          </div>
        </main>
      </body>
    </html>
  );
}
