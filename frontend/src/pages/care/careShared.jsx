// Thành phần giao diện dùng chung cho các trang Flow 4.
import { EMPTY_MEAL, fmtNumber, fmtTime } from './careUtils.js'

// ---------- giao diện ----------
export function CarePage({ crumb, eyebrow, title, description, actions, children }) {
  return <main className="page-content care-page">
    <div className="breadcrumb"><span>Chăm sóc</span><span>/</span><strong>{crumb || title}</strong></div>
    <div className="page-heading">
      <div>
        {eyebrow && <p className="eyebrow">{eyebrow}</p>}
        <h1>{title}</h1>
        {description && <p>{description}</p>}
      </div>
      {actions && <div className="care-heading-actions">{actions}</div>}
    </div>
    {children}
  </main>
}

export function Badge({ map, value }) {
  const [text, tone] = map[value] || [value || '—', 'muted']
  return <span className={`care-badge care-badge-${tone}`}>{text}</span>
}

export function Notice({ state }) {
  return <>
    {state.error && <div className="alert-banner" role="alert">{state.error}</div>}
    {state.notice && <div className="success-message" role="status">{state.notice}</div>}
  </>
}

export function FieldError({ fields, name }) {
  const errors = fields?.[name]
  if (!errors) return null
  const list = Array.isArray(errors) ? errors : [typeof errors === 'string' ? errors : JSON.stringify(errors)]
  return <>{list.map(text => <small className="error-message" role="alert" key={String(text)}>{String(text)}</small>)}</>
}

export function Loading({ state, children, empty, isEmpty }) {
  if (state.loading && !state.data) return <p className="care-muted" role="status">Đang tải dữ liệu…</p>
  if (state.error) return <div className="alert-banner" role="alert">{state.error}
    <button className="button button-secondary care-inline-button" type="button" onClick={state.reload}>Thử lại</button></div>
  if (isEmpty) return <div className="empty-state"><h3>{empty?.[0] || 'Chưa có dữ liệu'}</h3>{empty?.[1] && <p>{empty[1]}</p>}</div>
  return children
}

export function HorsePicker({ horses, value, onChange, label = 'Ngựa', allowAll = false }) {
  return <label className="filter-field"><span>{label}</span>
    <select value={value} onChange={event => onChange(event.target.value)}>
      {allowAll && <option value="">Tất cả ngựa</option>}
      {!allowAll && !value && <option value="">Chọn ngựa</option>}
      {horses.map(horse => <option key={horse.HorseID} value={String(horse.HorseID)}>
        {horse.HorseName}{horse.HorseCode ? ` · ${horse.HorseCode}` : ''}</option>)}
    </select></label>
}

// ---------- danh sách bữa ăn (dùng khi lập / sửa / điều chỉnh khẩu phần) ----------
export function MealEditor({ meals, onChange, fields, disabled }) {
  function update(index, key, value) {
    onChange(meals.map((meal, i) => (i === index ? { ...meal, [key]: value } : meal)))
  }
  return <div className="care-meals">
    <div className="care-meal-row care-meal-head" aria-hidden="true">
      <span>Giờ ăn</span><span>Loại thức ăn</span><span>Lượng</span><span>Đơn vị</span><span>Ghi chú</span><span />
    </div>
    {meals.map((meal, index) => (
      <div className="care-meal-row" key={index}>
        <label><span className="care-sr">Giờ ăn bữa {index + 1}</span>
          <input type="time" required value={meal.MealTime} disabled={disabled}
            onChange={e => update(index, 'MealTime', e.target.value)} /></label>
        <label><span className="care-sr">Loại thức ăn bữa {index + 1}</span>
          <input required maxLength={100} placeholder="vd Yến mạch" value={meal.FeedType} disabled={disabled}
            onChange={e => update(index, 'FeedType', e.target.value)} /></label>
        <label><span className="care-sr">Lượng bữa {index + 1}</span>
          <input type="number" required min="0.01" step="0.01" value={meal.Quantity} disabled={disabled}
            onChange={e => update(index, 'Quantity', e.target.value)} /></label>
        <label><span className="care-sr">Đơn vị bữa {index + 1}</span>
          <input required maxLength={30} list="care-units" value={meal.Unit} disabled={disabled}
            onChange={e => update(index, 'Unit', e.target.value)} /></label>
        <label><span className="care-sr">Ghi chú bữa {index + 1}</span>
          <input maxLength={500} placeholder="Không bắt buộc" value={meal.Note} disabled={disabled}
            onChange={e => update(index, 'Note', e.target.value)} /></label>
        <button className="button button-secondary" type="button" disabled={disabled || meals.length <= 1}
          onClick={() => onChange(meals.filter((_, i) => i !== index))} aria-label={`Xóa bữa ${index + 1}`}>Xóa</button>
      </div>))}
    <datalist id="care-units"><option value="kg" /><option value="g" /><option value="lít" /><option value="ml" /></datalist>
    <button className="button button-secondary" type="button" disabled={disabled}
      onClick={() => onChange([...meals, { ...EMPTY_MEAL }])}>+ Thêm bữa ăn</button>
    <FieldError fields={fields} name="Meals" />
  </div>
}

export function MealList({ meals }) {
  if (!meals?.length) return <p className="care-muted">Chưa có bữa ăn.</p>
  return <ol className="care-meal-list">
    {[...meals].sort((a, b) => String(a.MealTime).localeCompare(String(b.MealTime))).map(meal =>
      <li key={meal.DietMealID || `${meal.MealTime}-${meal.FeedType}`}>
        <time>{fmtTime(meal.MealTime)}</time>
        <strong>{meal.FeedType}</strong>
        <span>{fmtNumber(meal.Quantity)} {meal.Unit}</span>
        {meal.Note && <em>{meal.Note}</em>}
      </li>)}
  </ol>
}
