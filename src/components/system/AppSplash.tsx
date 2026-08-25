export function AppSplash() {
  return (
    <div className="vb-splash" aria-label="Vinabrain đang tải">
      <div className="vb-brain-logo" aria-hidden="true">
        <img src="/vinabrain-logo-transparent.png" alt="" />
      </div>
      <p className="vb-splash-status" aria-label="Chúng tôi đang thiết lập mọi thứ cho bạn...">
        <span>Chúng tôi đang thiết lập mọi thứ cho bạn</span>
        <span className="vb-loading-dots" aria-hidden="true">
          <span />
          <span />
          <span />
        </span>
      </p>
    </div>
  );
}
