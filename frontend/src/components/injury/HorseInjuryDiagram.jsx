import { useEffect, useId, useRef, useState } from 'react'
import { bodyRegions, DIAGRAM_HEIGHT, DIAGRAM_WIDTH, diagramAsset, diagramViews, regionAnchor } from './horseDiagram.js'
import { filterDiagramMarkers, hasDiagramPosition, injuryStatuses, markerStatus, pointerInSvg, regionLabel } from './injuryDiagramDomain.js'
import { loadHorsePhoto } from './horsePhotoHitMap.js'

export default function HorseInjuryDiagram({ view, onView, mode, canAdd, onMode, markers, filters, draft, selectedId, onPick, onSelect, onReady, busy, asset: configuredAsset, regionSelection, onToggleRegion }) {
  const svg = useRef(null), titleId = useId(), helpId = useId(), photoId = useId(), maskId = useId()
  const selectingRegions = Array.isArray(regionSelection)
  // Each view uses the same transform for its illustration, alpha mask and
  // hit regions. Anatomical side comes from view metadata, never screen x.
  const asset = configuredAsset || diagramAsset(view)
  const [loaded, setLoaded] = useState(null)
  const [attempt, setAttempt] = useState(0)
  const [width, setWidth] = useState(720)
  const [hovered, setHovered] = useState(null)
  const photo = loaded?.url === asset.url && loaded.attempt === attempt ? loaded : { state: asset.url ? 'loading' : 'waiting' }
  const ready = photo.state === 'ready'
  const placing = canAdd && ready && (mode === 'add' || mode === 'reposition') && !busy
  const unit = DIAGRAM_WIDTH / Math.max(width, 1)
  const visible = filterDiagramMarkers(markers, filters).filter(marker => marker.id !== draft?.id)
  if (draft) visible.push({ ...draft, id: draft.id || 'draft' })
  const imageTransform = asset.mirrorImage ? `translate(${DIAGRAM_WIDTH} 0) scale(-1 1)` : undefined
  const regionTransform = asset.mirrorRegions ? `translate(${DIAGRAM_WIDTH} 0) scale(-1 1)` : undefined
  const activeRegion = hovered?.view === view ? hovered.id : draft?.view === view && hasDiagramPosition(draft) ? draft.bodyRegion : ''
  useEffect(() => {
    if (!asset.url) return undefined
    let active = true
    loadHorsePhoto(asset.url).then(map => { if (active) setLoaded({ url: asset.url, attempt, state: 'ready', map }) })
      .catch(() => { if (active) setLoaded({ url: asset.url, attempt, state: 'error' }) })
    return () => { active = false }
  }, [asset.url, attempt])
  useEffect(() => { onReady?.(ready) }, [ready, onReady])
  useEffect(() => {
    const observer = new ResizeObserver(entries => { if (entries[0].contentRect.width) setWidth(entries[0].contentRect.width) })
    observer.observe(svg.current)
    return () => observer.disconnect()
  }, [])

  function choose(region, event) {
    if (!placing) return
    // A region click has already passed the SVG path hit test. Region selection
    // must not depend on an anchor pixel's opacity (thin ears/legs can have an
    // anchor in transparent space). Coordinate markers still use the alpha map.
    if (selectingRegions) {
      if (!event?.detail || photo.map.contains(pointerInSvg(svg.current, event.clientX, event.clientY), asset.mirrorImage)) onToggleRegion(region.id, view)
      return
    }
    let point = regionAnchor(region.id, view)
    if (event?.detail) {
      point = pointerInSvg(svg.current, event.clientX, event.clientY)
      const local = svg.current.createSVGPoint()
      local.x = event.clientX; local.y = event.clientY
      const matrix = event.currentTarget.getScreenCTM()
      if (!matrix || !event.currentTarget.isPointInFill(local.matrixTransform(matrix.inverse()))) return
    }
    if (photo.map.contains(point, asset.mirrorImage)) {
      onPick(region.id, view, point)
    }
  }
  return <div className="injury-diagram-viewer">
    <div className="injury-diagram-toolbar">
      <div role="group" aria-label="Bên cơ thể ngựa">{Object.entries(diagramViews).map(([key, label]) => <button type="button" key={key} aria-pressed={view === key} onClick={() => onView(key)} disabled={busy}>{label}</button>)}</div>
      {!selectingRegions && <div role="group" aria-label="Chế độ sơ đồ">
        <button type="button" aria-pressed={mode === 'view'} onClick={() => onMode('view')} disabled={busy}>Xem chấn thương</button>
        {canAdd && <button type="button" aria-pressed={mode === 'add' || mode === 'reposition'} onClick={() => onMode('add')} disabled={busy || !ready}>Thêm vị trí chấn thương</button>}
      </div>}
    </div>
    <div className="injury-diagram-instruction" id={helpId} role="status"><strong>{diagramViews[view]}</strong><span>{selectingRegions ? canAdd ? 'Bấm vùng để chọn hoặc bỏ chọn. Có thể chọn nhiều vùng.' : 'Chỉ xem vị trí chấn thương.' : mode === 'reposition' ? 'Chọn vùng mới để đổi vị trí, sau đó lưu.' : placing ? 'Chọn vùng trên ảnh hoặc dùng danh sách vùng bên dưới.' : 'Chọn dấu đánh số hoặc một chấn thương trong danh sách để xem.'}</span></div>
    <p className="injury-photo-note">{asset.illustrationOnly ? 'Góc nhìn bên phải dùng ảnh phản chiếu để minh họa, không phải ảnh chụp riêng của bên phải.' : 'Ảnh tham chiếu minh họa vị trí, không phải ảnh của ngựa trong hồ sơ.'} Không chia thêm vùng ở phần cơ thể bị che khuất.</p>
    <div className={`injury-diagram-stage${placing ? ' is-placing' : ''}`} data-photo-state={photo.state}>
      <svg ref={svg} className="injury-horse-svg" viewBox={`0 0 ${DIAGRAM_WIDTH} ${DIAGRAM_HEIGHT}`} preserveAspectRatio="xMidYMid meet" role="group" aria-labelledby={titleId} aria-describedby={helpId}>
        <title id={titleId}>Sơ đồ chấn thương trên ảnh ngựa — {diagramViews[view].toLocaleLowerCase('vi-VN')}</title>
        {asset.url && <image id={photoId} href={asset.url} x="0" y="0" width={DIAGRAM_WIDTH} height={DIAGRAM_HEIGHT} preserveAspectRatio="xMidYMid meet" transform={imageTransform} pointerEvents="none" aria-hidden="true" />}
        <defs><mask id={maskId} maskUnits="userSpaceOnUse" x="0" y="0" width={DIAGRAM_WIDTH} height={DIAGRAM_HEIGHT} style={{ maskType: 'alpha' }}><use href={`#${photoId}`} /></mask></defs>
        <g mask={`url(#${maskId})`}>
          <g transform={regionTransform}>
            {bodyRegions.map(region => <path key={region.id} d={region.path} data-region={region.id} role="button" tabIndex={ready && !busy ? 0 : -1}
              aria-label={`${region.label} · ${diagramViews[view]}`} aria-disabled={!placing} aria-pressed={selectingRegions ? regionSelection.includes(`${region.id}:${view}`) : draft?.bodyRegion === region.id && draft?.view === view && hasDiagramPosition(draft)}
              className={`injury-body-region${(selectingRegions ? regionSelection.includes(`${region.id}:${view}`) : activeRegion === region.id) ? ' is-selected' : ''}`}
              onPointerEnter={() => { if (ready) setHovered({ view, id: region.id }) }} onPointerLeave={() => setHovered(null)}
              onFocus={() => setHovered({ view, id: region.id })} onBlur={() => setHovered(null)}
              onClick={event => choose(region, event)} onKeyDown={event => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); choose(region) } }}>
              <title>{region.label} · {diagramViews[view]}</title>
            </path>)}
          </g>
        </g>
        <g className="injury-svg-markers">{ready && visible.filter(marker => marker.view === view && hasDiagramPosition(marker)).map(marker => {
          const index = markers.findIndex(item => item.id === marker.id)
          const selected = marker.id === (draft?.id || (draft ? 'draft' : selectedId))
          const x = marker.xRatio * DIAGRAM_WIDTH, y = marker.yRatio * DIAGRAM_HEIGHT
          const tooltipWidth = Math.min(220, width - 16) * unit
          const tooltipX = Math.min(Math.max(x - tooltipWidth / 2, 8 * unit), DIAGRAM_WIDTH - tooltipWidth - 8 * unit) - x
          return <g key={marker.id} role="button" tabIndex={busy ? -1 : 0} className={`injury-svg-marker status-${markerStatus(marker)}${selected ? ' is-selected' : ''}${marker.id === 'draft' ? ' is-draft' : ''}`}
            transform={`translate(${x} ${y})`} data-marker-id={marker.id} aria-disabled={busy}
            aria-label={`${index >= 0 ? `Chấn thương ${index + 1}` : 'Vị trí mới'}: ${regionLabel(marker.bodyRegion)} · ${diagramViews[view]} · ${injuryStatuses[markerStatus(marker)]}`}
            aria-pressed={selected} onClick={event => { event.stopPropagation(); if (!busy && marker.id !== 'draft') onSelect(marker) }}
            onKeyDown={event => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); event.stopPropagation(); if (!busy && marker.id !== 'draft') onSelect(marker) } }}>
            <title>{regionLabel(marker.bodyRegion)}: {marker.description || 'Vị trí mới, chưa lưu'}</title>
            <circle className="injury-marker-hit" r={22 * unit} />
            {selected && <circle className="injury-marker-ring" r={14 * unit} strokeWidth={1.5 * unit} strokeDasharray={marker.id === 'draft' ? `${3 * unit} ${2 * unit}` : undefined} />}
            <circle className="injury-svg-marker-dot" r={10 * unit} strokeWidth={2 * unit} />
            <text className="injury-marker-number" textAnchor="middle" dominantBaseline="central" fontSize={10 * unit}>{index >= 0 ? index + 1 : '+'}</text>
            <g className="injury-svg-tooltip" transform={`translate(${tooltipX} ${y > 100 * unit ? -80 * unit : 24 * unit})`} aria-hidden="true">
              <rect width={tooltipWidth} height={66 * unit} rx={7 * unit} strokeWidth={unit} />
              <text x={10 * unit} y={18 * unit} fontSize={11 * unit} fontWeight="650">{regionLabel(marker.bodyRegion)} · {diagramViews[view]}</text>
              <text x={10 * unit} y={37 * unit} fontSize={11 * unit}>{(marker.description || 'Vị trí mới, chưa lưu').slice(0, 30)}{marker.description?.length > 30 ? '…' : ''}</text>
              <text x={10 * unit} y={55 * unit} fontSize={10 * unit}>{injuryStatuses[markerStatus(marker)]}</text>
            </g>
          </g>
        })}</g>
      </svg>
      {!ready && <div className="injury-photo-state" role={photo.state === 'error' ? 'alert' : 'status'}><strong>{photo.state === 'loading' ? 'Đang tải ảnh ngựa…' : photo.state === 'waiting' ? 'Cần bổ sung ảnh ngựa tách nền' : 'Không tải được ảnh ngựa phù hợp'}</strong><p>{photo.state === 'loading' ? 'Đang chuẩn bị ảnh và các vùng cơ thể.' : 'Cần PNG/WebP nền trong suốt, độ phân giải cao, có đủ đầu, tai, đuôi và chân. Chưa thể đặt vị trí khi thiếu ảnh.'}</p>{photo.state === 'error' && <button className="button button-secondary" type="button" onClick={() => setAttempt(value => value + 1)}>Thử tải lại ảnh</button>}</div>}
    </div>
    <p className="injury-region-caption" aria-live="polite">{activeRegion ? `${regionLabel(activeRegion)} · ${diagramViews[view]}` : 'Rê chuột hoặc dùng Tab để xem tên vùng; vùng đã chọn được tô màu.'}</p>
    {ready && photo.map.naturalWidth < 1200 && <p className="injury-photo-note">Ảnh có độ phân giải thấp; cần ảnh lớn hơn để xem rõ chi tiết.</p>}
    {placing && !selectingRegions && <label className="form-field injury-region-picker"><span>Chọn vùng bằng danh sách</span><select name="diagramRegion" value={draft?.view === view ? draft.bodyRegion : ''} onChange={event => { const region = bodyRegions.find(item => item.id === event.target.value); if (region) choose(region) }}><option value="">Chọn vùng cơ thể…</option>{bodyRegions.map(region => <option key={region.id} value={region.id}>{region.label} · {view === 'left' ? 'bên trái' : 'bên phải'}</option>)}</select></label>}
    <div className="injury-view-footer">{selectingRegions ? <div className="injury-region-key" aria-label="Chú giải màu vùng"><span><i />Vùng đã chọn</span><span><i className="injury-region-key-hover" />Vùng đang xem</span></div> : <div className="injury-legend">{Object.entries(injuryStatuses).map(([key, label]) => <span className={`injury-status status-${key}`} key={key}><i />{label}</span>)}</div>}<p>Trái/phải tính theo cơ thể ngựa, không theo vị trí trên màn hình.</p></div>
  </div>
}
