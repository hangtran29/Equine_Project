import { useEffect, useRef, useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { ApiError } from '../../api/apiClient.ts';
import { getMedicalRecords, type ExaminationInput, type MedicalRecord } from '../../api/horseApi.ts';
import { getCompleteVetList } from '../../api/vetApi.ts';
import type { Horse, User } from '../../types';
import HorseAvatar from '../../components/horse/HorseAvatar.jsx';
import { formatHorseCode } from '../../components/horse/horseDisplay.js';
import { formatHorseGender } from '../../components/horse/horseLabels.js';
import { useResource } from '../../components/common/useOperations.js';
import { clubDateTimeInput, clubToday, clubTimezone, examLabels, healthLabels, latestSigned, recordHealthLabels, trainingLabels, vetAge, vetDate, vetDateTime, vetError } from './vetDomain.js';
import { TrainingLocks } from './VetOperations.jsx';
import { useVetResource } from './useVetResource.js';
import VetPrescription, { PrescriptionSummary } from './VetPrescription.jsx';
import VetRecordDetails from './VetRecordDetails.jsx';
import VetLoading from './VetLoading.jsx';
import useClinicalWarning from './useClinicalWarning.js';
import HorseInjuryRegionPicker from '../../components/injury/HorseInjuryRegionPicker.jsx';
import './VetWorkspace.css';

interface Props {
  horse: Horse; currentUser: User; records?: MedicalRecord[]; draft?: MedicalRecord; signedRecord?: MedicalRecord;
  registrationRequestId?: string; healthReportId?: string; conflictNotice?: string;
  onSaveDraft: (horseId: string, input: ExaminationInput, draftId?: string) => Promise<MedicalRecord>;
  onSign: (id: string) => Promise<MedicalRecord>; onAfterSign: () => Promise<void>; onConflict: () => Promise<void>;
  onDraftSaved?: (record: MedicalRecord) => void;
}
const fields = {
  examType: ['ExamType', 'Loại khám'], examDate: ['ExamDate', 'Thời điểm khám'], weightKg: ['WeightKg', 'Cân nặng'], heightCm: ['HeightCm', 'Chiều cao'],
  symptoms: ['Symptoms', 'Triệu chứng / lý do khám'], note: ['Note', 'Kết quả kiểm tra / ghi chú'], diagnosis: ['Diagnosis', 'Chẩn đoán'], injuryLocation: ['InjuryLocation', 'Vị trí chấn thương'],
  treatmentPlan: ['TreatmentPlan', 'Hướng điều trị'], conclusion: ['Conclusion', 'Kết luận'], healthStatus: ['HealthStatus', 'Trạng thái sức khỏe'],
  trainingEligibility: ['TrainingEligibility', 'Điều kiện tập'], restrictionNote: ['RestrictionNote', 'Hạn chế cụ thể'], followUpDate: ['FollowUpDate', 'Ngày chỉ định tái khám'],
} as const;
type Key = keyof typeof fields;
interface TreatmentRow { TreatmentID: string | number; MedicalRecordID: string | number; StartDate: string; EndDate?: string; MedicineName: string; Dose: string }
interface ReportRow { HorseID: string | number; VetID?: string | number; MedicalRecordID?: string | number; Status: string; Description: string; ReportedByName: string; ReportedAt: string; TrainingSessionID?: number }
function canonicalTime(value: string) { const local = clubDateTimeInput(value); return local.length === 16 ? local + ':00' : local; }
function initial(draft: MedicalRecord | undefined, horse: Horse, reportId?: string): ExaminationInput {
  return { examType: draft?.examType || (horse.profileStatus === 'PENDING_EXAM' ? 'Initial Exam' : ''),
    healthReportId: reportId, followUpLockId: draft?.followUpLockId || '', trainingSessionId: draft?.trainingSessionId, examDate: clubDateTimeInput(draft?.examDate),
    weightKg: draft?.weightKg, heightCm: draft?.heightCm, symptoms: draft?.symptoms || '', diagnosis: draft?.diagnosis || '',
    treatmentPlan: draft?.treatmentPlan || '', conclusion: draft?.conclusion || '', healthStatus: draft?.healthStatus || '', trainingEligibility: draft?.trainingEligibility || '',
    restrictionNote: draft?.restrictionNote || '', followUpDate: draft?.followUpDate || '', injuryLocation: draft?.injuryLocation || '', note: draft?.note || '' };
}
export default function VetClinicalExam({ horse, currentUser, records = [], draft, signedRecord, registrationRequestId, healthReportId, conflictNotice, onSaveDraft, onSign, onAfterSign, onConflict, onDraftSaved }: Props) {
  const [form, setForm] = useState<ExaminationInput>(() => initial(draft, horse, healthReportId));
  const [savedSnapshot, setSavedSnapshot] = useState(() => JSON.stringify(form));
  const [record, setRecord] = useState<MedicalRecord | undefined>(draft);
  const [signed, setSigned] = useState<MedicalRecord | undefined>(signedRecord);
  const [busy, setBusy] = useState(false);
  const [review, setReview] = useState(false);
  const [drugDirty, setDrugDirty] = useState(false);
  const [error, setError] = useState('');
  const [fieldErrors, setFieldErrors] = useState<Partial<Record<Key, string>>>({});
  const [notice, setNotice] = useState(draft ? 'Đã lưu bệnh án nháp. Bạn có thể tiếp tục khám.' : '');
  const [uncertain, setUncertain] = useState(false);
  const [signUncertain, setSignUncertain] = useState(false);
  const [reviewDrugs, setReviewDrugs] = useState<Record<string, unknown>[] | null>(null);
  const gate = useRef(false);
  const mounted = useRef(true);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  const pending = useRef<ExaminationInput | null>(null);
  const root = useRef<HTMLElement>(null);
  const allowLeave = useClinicalWarning(!signed && (busy || JSON.stringify(form) !== savedSnapshot || drugDirty));
  const reportData = useResource(healthReportId ? '/health-reports/' + encodeURIComponent(healthReportId) : null);
  const locks = useVetResource('/training-locks?HorseID=' + encodeURIComponent(horse.id) + '&LockStatus=Active');
  const treatments = useVetResource('/horses/' + encodeURIComponent(horse.id) + '/treatments');
  const isInitial = (signed?.examType || form.examType) === 'Initial Exam';
  const profile = '/vet/horses/' + horse.id;
  const previous = latestSigned(records, horse.id);
  const signedIds = new Set(records.filter(r => r.recordStatus === 'Signed').map(r => r.id));
  const activeTreatments = (treatments.rows as TreatmentRow[]).filter(t => signedIds.has(String(t.MedicalRecordID)) && t.StartDate <= clubToday() && (!t.EndDate || t.EndDate >= clubToday()));
  const title = signed ? 'Bệnh án đã chốt' : isInitial ? 'Khám đầu vào' : 'Khám và điều trị';
  function focus(key: Key) { requestAnimationFrame(() => { const control = document.getElementById('clinical-' + key); control?.scrollIntoView({ block: 'center', behavior: 'smooth' }); control?.focus(); }); }
  function change<K extends keyof ExaminationInput>(key: K, value: ExaminationInput[K]) {
    setForm(s => ({ ...s, [key]: value })); setFieldErrors(s => ({ ...s, [key]: undefined })); setNotice(''); setError(''); setReview(false);
  }
  function validate(final = false) {
    const invalid: Partial<Record<Key, string>> = {};
    if (!form.examType) invalid.examType = 'Chọn loại khám trước khi lưu.';
    if ((form.injuryLocation || '').length > 500) invalid.injuryLocation = 'Vị trí chấn thương tối đa 500 ký tự.';
    if (!form.examDate || !Number.isFinite(Date.parse(form.examDate))) invalid.examDate = 'Nhập ngày giờ khám hợp lệ.';
    if (form.weightKg != null && (!(form.weightKg > 0) || form.weightKg > 99999.9)) invalid.weightKg = 'Cân nặng phải lớn hơn 0 và không vượt 99.999,9 kg.';
    if (form.heightCm != null && (!(form.heightCm > 0) || form.heightCm > 9999.9)) invalid.heightCm = 'Chiều cao phải lớn hơn 0 và không vượt 9.999,9 cm.';
    if (form.trainingEligibility === 'Restricted' && !form.restrictionNote.trim()) invalid.restrictionNote = 'Ghi rõ giới hạn khi chọn hạn chế tập.';
    if (form.followUpDate && form.followUpDate < form.examDate.slice(0, 10)) invalid.followUpDate = 'Ngày tái khám không được trước ngày khám.';
    if (final && !form.healthStatus) invalid.healthStatus = 'Chọn trạng thái sức khỏe để chốt bệnh án.';
    if (final && !form.trainingEligibility) invalid.trainingEligibility = 'Chọn điều kiện tập để chốt bệnh án.';
    setFieldErrors(invalid);
    const first = Object.keys(invalid)[0] as Key | undefined;
    if (first) { setReview(false); setError('Vui lòng sửa các mục được đánh dấu. Nội dung đã nhập được giữ nguyên.'); focus(first); return false; }
    return true;
  }
  async function persist() {
    const values = { ...form, symptoms: form.symptoms.trim(), diagnosis: form.diagnosis.trim(), treatmentPlan: form.treatmentPlan.trim(), conclusion: form.conclusion.trim(), restrictionNote: form.restrictionNote.trim() };
    pending.current = values;
    const result = await onSaveDraft(horse.id, values, record?.id);
    setRecord(result); setSavedSnapshot(JSON.stringify(form));
    return result;
  }
  function failure(failed: unknown, signing = false) {
    if (!(failed instanceof ApiError) || !failed.status || failed.status >= 500) {
      setUncertain(true); setSignUncertain(signing); setError('Chưa xác nhận được kết quả lưu. Hãy kiểm tra trạng thái đã lưu trước khi tiếp tục; hệ thống sẽ không tự gửi lặp thao tác.'); return;
    }
    if (failed.status === 409) {
      setUncertain(true); setSignUncertain(signing); setError('Trạng thái bệnh án đã thay đổi. Đang tải lại hồ sơ và bác sĩ đang xử lý.');
      void onConflict().catch(() => setError('Không tải được trạng thái mới. Hãy kiểm tra lại kết nối trước khi tiếp tục.')); return;
    }
    const errors: Partial<Record<Key, string>> = {};
    for (const key of Object.keys(fields) as Key[]) if (failed.fieldErrors[fields[key][0]]) errors[key] = 'Vui lòng kiểm tra định dạng và giới hạn của mục này.';
    setFieldErrors(errors); setReview(false);
    setError(vetError(failed, 'Chưa lưu được bệnh án. Kiểm tra các mục được đánh dấu rồi thử lại.'));
    if (Object.keys(errors).length) focus(Object.keys(errors)[0] as Key);
  }
  async function saveDraft() {
    if (gate.current || uncertain || !validate()) return;
    gate.current = true; setBusy(true); setError(''); setNotice('');
    try {
      const result = await persist(); setNotice('Đã lưu bệnh án nháp.');
      if (!mounted.current) return;
      if (!drugDirty) { allowLeave(); onDraftSaved?.(result); }
    } catch (failed) { failure(failed); }
    finally { gate.current = false; setBusy(false); }
  }
  async function prepareReview(event?: FormEvent) {
    event?.preventDefault();
    if (gate.current || uncertain || !validate(true)) return;
    if (drugDirty) { setError('Đơn thuốc còn nội dung chưa lưu. Hãy lưu thuốc hoặc bỏ thay đổi thuốc trước khi chốt.'); document.getElementById('exam-prescription')?.scrollIntoView({ block: 'center' }); return; }
    gate.current = true; setBusy(true); setError('');
    try { setReviewDrugs(record ? await getCompleteVetList('/medical-records/' + record.id + '/treatments') : []); setReview(true); requestAnimationFrame(() => document.getElementById('exam-review')?.focus()); }
    catch { setError('Không tải được đơn thuốc để kiểm tra. Hãy thử lại trước khi chốt.'); }
    finally { gate.current = false; setBusy(false); }
  }
  async function sign() {
    if (gate.current || uncertain || drugDirty || !validate(true) || !currentUser.permissions.includes('MEDICAL_SIGN')) return;
    gate.current = true; setBusy(true); setError('');
    let signing = false;
    try {
      const saved = await persist();
      if (!mounted.current) return;
      signing = true;
      const result = await onSign(saved.id);
      if (!mounted.current) return;
      setSigned(result); setReview(false); allowLeave();
      try { await onAfterSign(); } catch { setNotice('Bệnh án đã chốt. Một số danh sách chưa cập nhật được; hãy tải lại hồ sơ.'); }
    } catch (failed) { failure(failed, signing); }
    finally { gate.current = false; setBusy(false); }
  }
  async function verify() {
    if (gate.current) return;
    gate.current = true; setBusy(true);
    try {
      const rows = await getMedicalRecords(horse.id);
      const ids = new Set(records.map(r => r.id));
      const candidates = record ? rows.filter(r => r.id === record.id) : rows.filter(r => !ids.has(r.id) && r.vetId === currentUser.id && r.examType === pending.current?.examType && pending.current?.examDate && canonicalTime(r.examDate) === canonicalTime(pending.current.examDate));
      if (candidates.length === 1) {
        const latest = candidates[0];
        if (latest.vetId !== currentUser.id && latest.recordStatus === 'Draft') { setError('Phiếu nháp do bác sĩ khác xử lý. Hãy quay về hồ sơ để xem trạng thái mới.'); return; }
        setRecord(latest);
        if (latest.recordStatus === 'Signed') { setSigned(latest); setReview(false); allowLeave(); setUncertain(false); setError(''); await onAfterSign(); return; }
        const same = pending.current && (Object.keys(fields) as Key[]).every(k => k === 'examDate' ? canonicalTime(latest.examDate) === canonicalTime(pending.current!.examDate) : (latest[k] ?? '') === (pending.current?.[k] ?? ''));
        if (same) { setUncertain(false); setError(''); setNotice(signUncertain ? 'Bệnh án vẫn là nháp. Đã đối chiếu nội dung; bạn có thể kiểm tra và chốt lại.' : 'Đã kiểm tra: bệnh án nháp đã được lưu.'); setSavedSnapshot(JSON.stringify(form)); return; }
      }
      setError('Chưa xác định chắc chắn kết quả thao tác. Nội dung đang được giữ tại trang này. Hãy đối chiếu hồ sơ trước khi lập hoặc chốt thêm phiếu.');
    } catch { setError('Chưa tải được trạng thái đã lưu. Hãy kiểm tra lại khi kết nối ổn định.'); }
    finally { gate.current = false; setBusy(false); }
  }
  function control(key: Key, type = 'text', maxLength?: number, options?: Record<string, string>) {
    const common = { id: 'clinical-' + key, name: fields[key][0], form: 'vet-clinical-form', value: form[key] ?? '', disabled: busy || uncertain || (key === 'examType' && !!record), 'aria-invalid': !!fieldErrors[key], 'aria-describedby': fieldErrors[key] ? 'error-' + key : undefined };
    return <label className={'form-field clinical-field-' + key} key={key}><span>{fields[key][1]}{key === 'weightKg' ? ' (kg)' : key === 'heightCm' ? ' (cm)' : ''}</span>
      {options ? <select {...common} onChange={e => change(key, e.target.value as never)}><option value="">Chọn {fields[key][1].toLocaleLowerCase()}</option>{Object.entries(options).map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select> : type === 'textarea' ? <textarea {...common} rows={key === 'diagnosis' || key === 'treatmentPlan' ? 4 : 3} maxLength={maxLength} onChange={e => change(key, e.target.value as never)} /> : <input {...common} type={type} maxLength={maxLength} min={type === 'number' ? '0.1' : key === 'followUpDate' ? form.examDate.slice(0, 10) : undefined} step={type === 'number' ? '0.1' : type === 'datetime-local' ? '1' : undefined} onChange={e => change(key, (type === 'number' ? e.target.value ? Number(e.target.value) : undefined : e.target.value) as never)} />}
      {fieldErrors[key] && <small id={'error-' + key} className="error-message">{fieldErrors[key]}</small>}</label>;
  }
  const owns = !record || record.vetId === currentUser.id;
  const report = reportData.value as ReportRow | null;
  const reportInvalid = healthReportId && !reportData.loading && (!report || String(report.HorseID) !== horse.id || (report.VetID && String(report.VetID) !== currentUser.id) || (report.MedicalRecordID && String(report.MedicalRecordID) !== record?.id) || report.Status === 'Resolved');
  const mayEdit = currentUser.permissions.includes('MEDICAL_MANAGE') && owns && !reportInvalid && !reportData.error;
  return <main className="page-content vet-workspace vet-exam-workspace" ref={root}>
    <nav className="breadcrumb"><Link to="/vet/horses-needing-exam">Hàng chờ khám</Link><span>/</span><Link to={profile}>{horse.name}</Link><span>/</span><span>{title}</span></nav>
    <header className="page-heading vet-profile-heading"><div className="vet-profile-identity"><HorseAvatar horseId={horse.id} documents={horse.documents} name={horse.name} /><div><p className="eyebrow">HỒ SƠ THÚ Y</p><h1>{horse.name}</h1><p>{formatHorseCode(horse.code)} · Microchip: {horse.microchipNumber || 'Chưa cập nhật'}</p><p>{title} · Bác sĩ: {record?.vetName || signed?.vetName || currentUser.fullName}</p></div></div><Link className="button button-secondary" to={profile}>Xem hồ sơ ngựa</Link></header>
    <div className="vet-profile-badges"><span className="vet-pill">{signed ? 'Đã chốt' : record ? 'Đang khám · Nháp #' + record.id : 'Chưa bắt đầu'}</span><span className={'vet-pill health-' + horse.healthStatus}>{healthLabels[horse.healthStatus]}</span><span className="vet-pill">{signed ? trainingLabels[signed.trainingEligibility as keyof typeof trainingLabels] : 'Kết luận điều kiện tập: đang đánh giá'}</span></div>
    {conflictNotice && <p role="alert" className="error-message">{conflictNotice}</p>}
    {error && <div className="vet-error-summary" role="alert"><p>{error}</p>{Object.keys(fieldErrors).map(key => <button key={key} type="button" onClick={() => { setReview(false); focus(key as Key); }}>{fields[key as Key][1]}</button>)}</div>}
    {notice && <p className="success-message" role="status">{notice}</p>}
    {uncertain && <div className="vet-toolbar"><button className="button button-secondary" disabled={busy} onClick={() => void verify()}>Kiểm tra trạng thái đã lưu</button><button type="button" className="button button-secondary" disabled={busy} onClick={() => { if (window.confirm('Tải lại hồ sơ sẽ bỏ nội dung chưa lưu. Tiếp tục?')) { allowLeave(); void onConflict(); } }}>Đối chiếu lại hồ sơ</button></div>}
    {signed ? <section className="panel intake-vet-conclusion"><p className="success-message">{isInitial ? 'Đã chốt bệnh án khám đầu vào. Quản lý sẽ xử lý tiếp nhận.' : 'Bệnh án đã chốt và được lưu vào hồ sơ y tế.'}</p><VetRecordDetails key={signed.id} record={signed} canAmend={currentUser.permissions.includes('MEDICAL_MANAGE')} /></section> : !owns ? <section className="panel"><h2>Phiếu nháp do bác sĩ khác xử lý</h2><p>{record?.vetName || 'Bác sĩ lập phiếu'} đang phụ trách phiếu #{record?.id}. Chỉ người lập phiếu được tiếp tục khám và chốt.</p><Link to={profile}>Quay về hồ sơ</Link></section> : isInitial && (horse.profileStatus !== 'PENDING_EXAM' || horse.initialExamSigned !== false || !registrationRequestId) ? <section className="panel" role="alert"><h2>Chưa thể tiếp tục khám đầu vào</h2><p>Hồ sơ tiếp nhận đã thay đổi hoặc chưa xác định được lần đăng ký hiện tại. Hãy tải lại hàng chờ để kiểm tra.</p><Link to="/vet/horses-needing-exam">Quay về hàng chờ</Link></section> : healthReportId && reportData.loading ? <VetLoading label="Đang kiểm tra báo cáo liên quan…" /> : reportInvalid || reportData.error ? <section className="panel" role="alert"><h2>Cần kiểm tra báo cáo liên quan</h2><p>Báo cáo đã có bệnh án, đã kết thúc hoặc đang do bác sĩ khác xử lý. Hãy mở báo cáo để tiếp tục đúng hồ sơ.</p><Link className="button button-secondary" to={'/vet/reports?report=' + healthReportId + '&status=all'}>Mở báo cáo sức khỏe</Link><button className="button button-secondary" onClick={reportData.reload}>Thử lại</button></section> : !mayEdit ? <section className="panel">Bạn không có quyền lập bệnh án.</section> : <>
      <div className="vet-exam-layout"><div className="vet-exam-main">
        {!review ? <>
          <nav className="vet-exam-steps" aria-label="Các phần khám">{[['exam-visit', 'Lần khám'], ['exam-findings', 'Kiểm tra'], ['exam-diagnosis', 'Chẩn đoán'], ['exam-prescription', 'Điều trị'], ['exam-conclusion', 'Kết luận']].map(([id, label], i) => <a key={id} href={'#' + id}><span>{i + 1}</span>{label}</a>)}</nav>
          <form id="vet-clinical-form" onSubmit={e => void prepareReview(e)} />
          <section className="panel post-exam-form-panel" id="exam-visit"><p className="eyebrow">01 · LẦN KHÁM</p><h2>Thông tin lần khám</h2><p>{isInitial ? 'Nguồn khám: hồ sơ tiếp nhận #' + registrationRequestId : healthReportId ? 'Nguồn khám: báo cáo sức khỏe #' + healthReportId : form.examType === 'Follow-up' ? 'Tái khám sau lần khám trước' : 'Lần khám mới sau tiếp nhận'}</p>
            {report && <blockquote className="vet-source-note">{report.Description}<small>{report.ReportedByName} · {vetDateTime(report.ReportedAt)}{report.TrainingSessionID ? ' · Buổi tập #' + report.TrainingSessionID : ''}</small></blockquote>}
            {!report && form.trainingSessionId && <p>Buổi tập liên quan: #{form.trainingSessionId}</p>}
            {isInitial ? <p><strong>Khám đầu vào</strong> · Gắn với đúng hồ sơ tiếp nhận.</p> : control('examType', 'text', undefined, Object.fromEntries(Object.entries(examLabels).filter(([k]) => k !== 'Initial Exam')))}
            {control('examDate', 'datetime-local')}<small>Ngày giờ tại câu lạc bộ ({clubTimezone}).</small>
          </section>
          <section className="panel" id="exam-findings"><p className="eyebrow">02 · KIỂM TRA</p><h2>Triệu chứng và kết quả kiểm tra</h2>{control('symptoms', 'textarea', 1500)}<div className="horse-form-grid">{control('weightKg', 'number')}{control('heightCm', 'number')}</div>{control('note', 'textarea', 1500)}</section>
          <section className="panel" id="exam-diagnosis"><p className="eyebrow">03 · CHẨN ĐOÁN</p><h2>Chẩn đoán và chấn thương</h2>{control('diagnosis', 'textarea', 1500)}<HorseInjuryRegionPicker value={form.injuryLocation || ''} onChange={(value: string) => change('injuryLocation', value)} disabled={busy || uncertain} inputId="clinical-injuryLocation" error={fieldErrors.injuryLocation || ''} /><p className="vet-caption">Ghi rõ vùng và bên bị ảnh hưởng. Vùng chọn được lưu cùng phiếu khám dưới dạng mô tả vị trí.</p></section>
          <section className="panel" id="exam-prescription"><p className="eyebrow">04 · ĐIỀU TRỊ</p><h2>Phác đồ và đơn thuốc</h2>{control('treatmentPlan', 'textarea', 3000)}<VetPrescription key={record?.id || 'unsaved'} recordId={record?.id} canEdit onDirtyChange={setDrugDirty} disabled={busy || uncertain} /></section>
          <section className="panel" id="exam-conclusion">
            <p className="eyebrow">05 · KẾT LUẬN</p><h2>Kết luận và tái khám</h2>{control('conclusion', 'textarea', 1500)}
            <div className="horse-form-grid">{control('healthStatus', 'text', undefined, recordHealthLabels)}{control('trainingEligibility', 'text', undefined, trainingLabels)}</div>
            {control('restrictionNote', 'textarea', 1000)}{control('followUpDate', 'date')}
            {form.examType === 'Follow-up' && <label className="form-field"><span>Đợt khóa được tái khám</span><select id="clinical-followUpLockId" name="FollowUpLockID" form="vet-clinical-form" value={form.followUpLockId || ''} disabled={busy || locks.loading || !!locks.error} onChange={e => change('followUpLockId', e.target.value)}><option value="">Không liên quan đợt khóa</option>{(locks.rows as { TrainingLockID: number; Reason: string }[]).map(lock => <option key={String(lock.TrainingLockID)} value={String(lock.TrainingLockID)}>#{String(lock.TrainingLockID)} · {String(lock.Reason)}</option>)}</select></label>}
            <p className="vet-caption">Khi ký phiếu, hệ thống ghi lịch tái khám tương ứng. Đặt khóa Restricted và tải tối đa trước khi ký kết luận hạn chế tập.</p>
          </section>
        </> : <section className="panel vet-review" id="exam-review" tabIndex={-1}><p className="eyebrow">KIỂM TRA TRƯỚC KHI CHỐT</p><h2>Xác nhận bệnh án</h2><p>Đối chiếu nội dung khám và đơn thuốc. Bệnh án đã chốt được giữ nguyên; sửa nội dung bằng đính chính.</p><dl className="vet-details">{[
          ['Loại khám', examLabels[form.examType as keyof typeof examLabels]], ['Ngày giờ khám', vetDateTime(form.examDate)], ['Triệu chứng', form.symptoms], ['Chẩn đoán', form.diagnosis], ['Vị trí chấn thương', form.injuryLocation], ['Hướng điều trị', form.treatmentPlan], ['Kết luận', form.conclusion], ['Sức khỏe', recordHealthLabels[form.healthStatus as keyof typeof recordHealthLabels]], ['Điều kiện tập', trainingLabels[form.trainingEligibility as keyof typeof trainingLabels]], ['Hạn chế cụ thể', form.restrictionNote], ['Chỉ định tái khám', vetDate(form.followUpDate)],
        ].map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{value || 'Chưa ghi nhận'}</dd></div>)}</dl><h3>Đơn thuốc đã lưu</h3><PrescriptionSummary rows={reviewDrugs || []} /><div className="vet-source-note">{isInitial ? 'Sau khi chốt, quản lý đối chiếu kết quả để quyết định tiếp nhận.' : form.trainingEligibility === 'Not Eligible' ? 'Kết luận không được tập sẽ tạo khóa toàn bộ hoặc nâng khóa hiện hành lên toàn bộ.' : form.trainingEligibility === 'Restricted' ? 'Kết luận hạn chế được lưu trong bệnh án. Để áp dụng giới hạn tải tập, cần lập hoặc điều chỉnh lệnh khóa riêng.' : 'Kết luận cho phép tập không tự mở lệnh khóa đang hoạt động.'}</div><button className="button button-secondary" type="button" disabled={busy} onClick={() => setReview(false)}>Quay lại chỉnh nội dung</button></section>}
      </div><aside className="vet-exam-aside" aria-label="Thông tin tham khảo"><section className="panel"><h2>Tóm tắt ngựa</h2><dl className="vet-details"><div><dt>Giống</dt><dd>{horse.breed || 'Chưa cập nhật'}</dd></div><div><dt>Giới tính</dt><dd>{formatHorseGender(horse.sex)}</dd></div><div><dt>Tuổi / ngày sinh</dt><dd>{vetAge(horse.dateOfBirth)} · {vetDate(horse.dateOfBirth)}</dd></div><div><dt>Ô chuồng</dt><dd>{horse.currentStall?.StallNumber || 'Chưa xếp chuồng'}</dd></div></dl></section>
        <TrainingLocks horse={horse} currentUser={currentUser} compact />
        <section className="panel"><h2>Bệnh án gần nhất</h2>{previous ? <><p>{examLabels[previous.examType as keyof typeof examLabels]} · {vetDateTime(previous.examDate)}</p><p className="vet-preserve">{previous.diagnosis || previous.conclusion || 'Chưa ghi nội dung'}</p><p>{trainingLabels[previous.trainingEligibility as keyof typeof trainingLabels] || 'Chưa kết luận điều kiện tập'}</p><p>{previous.restrictionNote}</p>{previous.followUpDate && <p>Chỉ định tái khám: {vetDate(previous.followUpDate)}</p>}<Link to={profile + '?tab=history&record=' + previous.id}>Xem bệnh án #{previous.id}</Link></> : <p>Chưa có bệnh án đã chốt.</p>}</section>
        <section className="panel"><h2>Thuốc theo thời gian sử dụng</h2>{treatments.loading ? <VetLoading /> : treatments.error ? <div role="alert"><p>Không tải được điều trị đã lưu.</p><button className="button button-secondary" onClick={treatments.reload}>Thử lại</button></div> : activeTreatments.length ? activeTreatments.map(t => <p key={String(t.TreatmentID)}><strong>{t.MedicineName}</strong><br />{t.Dose} · {t.EndDate ? 'Đến ' + vetDate(t.EndDate) : 'Chưa ghi ngày kết thúc'}</p>) : <p>Chưa ghi thuốc có thời gian dùng bao gồm hôm nay trong bệnh án đã chốt.</p>}</section>
      </aside></div>
      <footer className="vet-exam-actions"><span>{drugDirty ? 'Đơn thuốc có thay đổi chưa lưu' : JSON.stringify(form) !== savedSnapshot ? 'Nội dung khám chưa lưu' : record ? 'Bệnh án nháp đã lưu' : 'Chưa tạo bệnh án nháp'}</span><div className="form-actions"><Link className="button button-secondary" to={profile}>Quay lại</Link><button type="button" className="button button-secondary" disabled={busy || uncertain} onClick={() => void saveDraft()}>{busy ? 'Đang xử lý…' : 'Lưu nháp'}</button>{review ? <button type="button" className="button" disabled={busy || uncertain} onClick={() => void sign()}>Chốt bệnh án</button> : <button type="button" className="button" disabled={busy || uncertain || !currentUser.permissions.includes('MEDICAL_SIGN')} onClick={() => void prepareReview()}>Kiểm tra và chốt</button>}</div></footer>
    </>}
  </main>;
}
