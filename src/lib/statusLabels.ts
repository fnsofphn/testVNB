export function getStatusDisplayLabel(status: string | null | undefined) {
  switch (String(status || '').trim()) {
    case 'todo':
    case 'not_started':
      return 'Chưa bắt đầu';
    case 'draft':
      return 'Bản nháp';
    case 'submitted':
      return 'Đã gửi';
    case 'submitted_qc':
      return 'Đã gửi QC';
    case 'submitted_video':
      return 'Chờ duyệt';
    case 'review':
    case 'in_review':
      return 'Đang duyệt';
    case 'claimed':
      return 'Đã nhận xử lý';
    case 'changes_requested':
      return 'Cần chỉnh sửa';
    case 'qc_fail':
    case 'fail':
    case 'rejected':
      return 'Bị trả lại';
    case 'approved':
      return 'Đã duyệt';
    case 'accepted':
      return 'Đã chấp nhận';
    case 'confirmed':
      return 'Đã xác nhận';
    case 'qc_passed':
      return 'QC đạt';
    case 'done':
    case 'completed':
      return 'Hoàn thành';
    case 'ready_delivery':
      return 'Sẵn sàng bàn giao';
    case 'ready_for_launch':
      return 'Sẵn sàng khởi chạy';
    case 'pending_launch':
      return 'Chờ khởi chạy';
    case 'pending_acceptance':
      return 'Chờ nghiệm thu';
    case 'pm_review':
      return 'PM đang duyệt';
    case 'in_progress':
    case 'started':
      return 'Đang thực hiện';
    case 'in_production':
      return 'Đang sản xuất';
    case 'recording':
      return 'Đang thu âm';
    case 'editing':
      return 'Đang biên tập';
    case 'packaging':
      return 'Đang đóng gói';
    case 'paid':
      return 'Đã thanh toán';
    case 'sent':
      return 'Đã gửi';
    case 'success':
      return 'Thành công';
    case 'warning':
      return 'Cảnh báo';
    case 'critical':
      return 'Khẩn cấp';
    case 'info':
      return 'Thông tin';
    case 'overdue':
      return 'Quá hạn';
    case 'active':
      return 'Đang hoạt động';
    case 'paused':
      return 'Tạm dừng';
    case 'inactive':
      return 'Ngưng hoạt động';
    case 'profile-only':
      return 'Chỉ có hồ sơ';
    case 'linked':
      return 'Đã liên kết';
    default:
      return String(status || '-');
  }
}
