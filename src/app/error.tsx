"use client";
export default function ErrorPage({ reset }: { reset: () => void }) {
  return (
    <main className="empty-state">
      <h1>Chưa mở được Vietnam Social</h1>
      <p>Kiểm tra cấu hình và kết nối rồi thử lại.</p>
      <button className="dark-button" onClick={reset}>
        Thử lại
      </button>
    </main>
  );
}
