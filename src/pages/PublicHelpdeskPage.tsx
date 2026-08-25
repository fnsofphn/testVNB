import { type FormEvent, useState } from 'react';
import { useParams } from 'react-router-dom';
import { useMutation, useQuery } from '@tanstack/react-query';
import { CheckCircle2, ImagePlus, LifeBuoy, Send } from 'lucide-react';
import { AppSplash } from '@/components/system/AppSplash';
import { createHelpdeskTicket, getHelpdeskProjectBySlug } from '@/lib/helpdesk';

const MAX_FILES = 5;
const MAX_FILE_SIZE = 10 * 1024 * 1024;
const ACCEPTED_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];

export default function PublicHelpdeskPage() {
  const { slug = '' } = useParams();
  const [learnerName, setLearnerName] = useState('');
  const [learnerEmail, setLearnerEmail] = useState('');
  const [learnerPhone, setLearnerPhone] = useState('');
  const [issueText, setIssueText] = useState('');
  const [files, setFiles] = useState<File[]>([]);
  const [fileError, setFileError] = useState('');

  const projectQuery = useQuery({
    queryKey: ['public-helpdesk', slug],
    queryFn: () => getHelpdeskProjectBySlug(slug),
  });
  const project = projectQuery.data || null;

  const submitMutation = useMutation({
    mutationFn: () => {
      if (!project) throw new Error('Project hỗ trợ không khả dụng.');
      return createHelpdeskTicket({
        projectId: project.id,
        projectSlug: project.slug,
        learnerName,
        learnerEmail,
        learnerPhone,
        issueText,
        files,
      });
    },
  });

  const handleFiles = (nextFiles: FileList | null) => {
    setFileError('');
    const selected = Array.from(nextFiles || []);
    if (selected.length > MAX_FILES) {
      setFileError(`Chỉ được gửi tối đa ${MAX_FILES} ảnh.`);
      return;
    }
    const invalid = selected.find((file) => !ACCEPTED_TYPES.includes(file.type) || file.size > MAX_FILE_SIZE);
    if (invalid) {
      setFileError('Ảnh đính kèm chỉ nhận JPG, PNG, WEBP, GIF và tối đa 10MB/file.');
      return;
    }
    setFiles(selected);
  };

  const handleSubmit = (event: FormEvent) => {
    event.preventDefault();
    if (!learnerName.trim() || !learnerEmail.trim() || !issueText.trim()) return;
    submitMutation.mutate();
  };

  if (projectQuery.isLoading) return <AppSplash />;

  if (!project) {
    return (
      <main className="public-helpdesk-shell">
        <section className="public-helpdesk-card">
          <LifeBuoy size={34} />
          <h1>Link hỗ trợ không khả dụng</h1>
          <p>Project hỗ trợ đã đóng hoặc đường dẫn không đúng.</p>
        </section>
      </main>
    );
  }

  if (submitMutation.data) {
    return (
      <main className="public-helpdesk-shell">
        <section className="public-helpdesk-card">
          <CheckCircle2 size={38} />
          <h1>Đã gửi yêu cầu hỗ trợ</h1>
          <p>Mã yêu cầu của bạn:</p>
          <strong className="public-helpdesk-code">{submitMutation.data.ticketCode}</strong>
          <span>Vui lòng lưu mã này để đối chiếu khi cần trao đổi thêm với ban tổ chức.</span>
        </section>
      </main>
    );
  }

  return (
    <main className="public-helpdesk-shell">
      <section className="public-helpdesk-card">
        <div className="public-helpdesk-heading">
          <LifeBuoy size={34} />
          <div>
            <span>Vinabrain V-helpdesk</span>
            <h1>{project.name}</h1>
            {project.programName ? <p>{project.programName}</p> : null}
          </div>
        </div>

        <form className="public-helpdesk-form" onSubmit={handleSubmit}>
          <label><span>Họ tên *</span><input required value={learnerName} onChange={(event) => setLearnerName(event.target.value)} /></label>
          <label><span>Email *</span><input required type="email" value={learnerEmail} onChange={(event) => setLearnerEmail(event.target.value)} /></label>
          <label><span>Số điện thoại</span><input value={learnerPhone} onChange={(event) => setLearnerPhone(event.target.value)} /></label>
          <label className="full"><span>Vấn đề gặp phải *</span><textarea required rows={6} value={issueText} onChange={(event) => setIssueText(event.target.value)} /></label>
          <label className="full public-helpdesk-upload">
            <span><ImagePlus size={18} /> Ảnh đính kèm nếu có</span>
            <input accept={ACCEPTED_TYPES.join(',')} multiple type="file" onChange={(event) => handleFiles(event.target.files)} />
            <small>{files.length ? `${files.length} ảnh đã chọn` : 'Tối đa 5 ảnh, 10MB/file.'}</small>
            {fileError ? <em>{fileError}</em> : null}
          </label>
          <button className="btn btn-primary" disabled={submitMutation.isPending} type="submit"><Send size={17} /> Gửi yêu cầu</button>
          {submitMutation.error ? <div className="form-error">{submitMutation.error instanceof Error ? submitMutation.error.message : 'Không gửi được yêu cầu.'}</div> : null}
        </form>
      </section>
    </main>
  );
}
