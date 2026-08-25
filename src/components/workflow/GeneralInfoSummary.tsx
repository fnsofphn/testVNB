import { Link } from 'react-router-dom';

type GeneralInfoSummaryProps = {
  infoTitle?: string;
  infoLabel?: string;
  name: string;
  orderCode: string;
  orderId?: string | null;
  productCode: string;
  assigneeLabel: string;
  startDate: string;
  deadline: string;
  note?: string | null;
};

export function GeneralInfoSummary({
  infoTitle,
  infoLabel,
  name,
  orderCode,
  orderId,
  productCode,
  assigneeLabel,
  startDate,
  deadline,
  note: _note,
}: GeneralInfoSummaryProps) {
  return (
    <div className="intake-popup-summary">
      <article className="intake-popup-product-card">
        {infoTitle ? <div className="muted-text">{infoTitle}</div> : null}
        <div className="intake-popup-product-name">{name || 'Chưa đặt tên sản phẩm'}</div>
        {infoLabel ? <div className="muted-text">{infoLabel}</div> : null}
        <div className="intake-popup-order-link">
          <span>Mã đơn:</span>
          {orderId ? (
            <Link to={`/client-order-detail?orderId=${encodeURIComponent(orderId)}`}>{orderCode}</Link>
          ) : (
            <strong>{orderCode}</strong>
          )}
        </div>
      </article>

      <article className="intake-popup-meta-card">
        <div className="intake-popup-meta-item">
          <span>Mã sản phẩm</span>
          <strong>{productCode}</strong>
        </div>
        <div className="intake-popup-meta-item">
          <span>Người phụ trách</span>
          <strong className="intake-popup-assignee">
            <span className="intake-popup-assignee-dot" aria-hidden="true" />
            {assigneeLabel}
          </strong>
        </div>
      </article>

      <article className="intake-popup-date-card">
        <div className="intake-popup-meta-item">
          <span>Ngày bắt đầu</span>
          <strong>{startDate}</strong>
        </div>
        <div className="intake-popup-meta-item">
          <span>Deadline</span>
          <strong className="intake-popup-deadline">{deadline}</strong>
        </div>
      </article>
    </div>
  );
}
