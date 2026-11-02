import {
  useEffect,
  useMemo,
  useState,
} from 'react'

import {
  getTrainingSessions,
  stopTrainingSession,
  submitSubstituteObservation,
} from '../../api/trainingApi.ts'

const STATUS_LABELS = {
  Assigned: 'Đã phân công',
  'In Progress': 'Đang tập',
  Completed: 'Hoàn thành',
  Cancelled: 'Đã dừng / hủy',
  Missed: 'Vắng',
}

function formatDate(
  value,
) {
  if (!value) {
    return '—'
  }

  const date =
    new Date(
      `${value}T00:00:00`,
    )

  if (
    Number.isNaN(
      date.getTime(),
    )
  ) {
    return String(
      value,
    )
  }

  return new Intl.DateTimeFormat(
    'en-US',
    {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
    },
  ).format(date)
}

function formatTime(
  value,
) {
  if (!value) {
    return '—'
  }

  return String(
    value,
  ).slice(
    0,
    5,
  )
}

function show(
  value,
  fallback = '—',
) {
  return value === null ||
    value === undefined ||
    value === ''
    ? fallback
    : value
}

function statusTone(
  status,
) {
  switch (status) {
    case 'Assigned':
      return 'is-assigned'

    case 'In Progress':
      return 'is-progress'

    case 'Completed':
      return 'is-completed'

    case 'Cancelled':
      return 'is-cancelled'

    case 'Missed':
      return 'is-missed'

    default:
      return ''
  }
}

function getErrorMessage(
  error,
  fallback,
) {
  if (
    error instanceof Error &&
    error.message
  ) {
    return error.message
  }

  return fallback
}

export default function TrainerSessionsPage() {
  const [
    sessions,
    setSessions,
  ] = useState([])

  const [
    loading,
    setLoading,
  ] = useState(true)

  const [
    refreshing,
    setRefreshing,
  ] = useState(false)

  const [
    busy,
    setBusy,
  ] = useState(false)

  const [
    error,
    setError,
  ] = useState('')

  const [
    message,
    setMessage,
  ] = useState('')

  const [
    statusFilter,
    setStatusFilter,
  ] = useState('all')

  const [
    search,
    setSearch,
  ] = useState('')

  const [
    stopTarget,
    setStopTarget,
  ] = useState(null)

  const [
    stopReason,
    setStopReason,
  ] = useState('')

  const [
    observationTarget,
    setObservationTarget,
  ] = useState(null)

  const [
    substituteObservation,
    setSubstituteObservation,
  ] = useState('')

  async function fetchSessions() {
    const rows =
      await getTrainingSessions({
        mine: true,
      })

    return Array.isArray(
      rows,
    )
      ? rows
      : []
  }

  useEffect(() => {
    let active = true

    fetchSessions()
      .then((rows) => {
        if (!active) {
          return
        }

        setSessions(
          rows,
        )

        setError(
          '',
        )
      })
      .catch(
        (loadError) => {
          if (!active) {
            return
          }

          setError(
            getErrorMessage(
              loadError,
              'Không thể tải các buổi tập giám sát.',
            ),
          )
        },
      )
      .finally(() => {
        if (active) {
          setLoading(
            false,
          )
        }
      })

    return () => {
      active = false
    }
  }, [])

  const filteredSessions =
    useMemo(() => {
      const keyword =
        search
          .trim()
          .toLowerCase()

      return sessions.filter(
        (session) => {
          const matchesStatus =
            statusFilter ===
              'all' ||
            session.Status ===
              statusFilter

          const matchesSearch =
            !keyword ||
            String(
              session.HorseName ||
                '',
            )
              .toLowerCase()
              .includes(
                keyword,
              ) ||
            String(
              session.WorkRiderName ||
                '',
            )
              .toLowerCase()
              .includes(
                keyword,
              ) ||
            String(
              session.TrainingType ||
                '',
            )
              .toLowerCase()
              .includes(
                keyword,
              ) ||
            String(
              session.StageName ||
                '',
            )
              .toLowerCase()
              .includes(
                keyword,
              )

          return (
            matchesStatus &&
            matchesSearch
          )
        },
      )
    }, [
      sessions,
      statusFilter,
      search,
    ])

  const summary =
    useMemo(
      () => ({
        total:
          sessions.length,

        assigned:
          sessions.filter(
            (session) =>
              session.Status ===
              'Assigned',
          ).length,

        progress:
          sessions.filter(
            (session) =>
              session.Status ===
              'In Progress',
          ).length,

        substitute:
          sessions.filter(
            (session) =>
              session.IsSubstitute,
          ).length,
      }),
      [
        sessions,
      ],
    )

  async function refresh() {
    setRefreshing(
      true,
    )

    setError('')
    setMessage('')

    try {
      const rows =
        await fetchSessions()

      setSessions(
        rows,
      )
    } catch (
      loadError
    ) {
      setError(
        getErrorMessage(
          loadError,
          'Không thể làm mới danh sách.',
        ),
      )
    } finally {
      setRefreshing(
        false,
      )
    }
  }

  function openStopModal(
    session,
  ) {
    if (
      ![
        'Assigned',
        'In Progress',
      ].includes(
        session.Status,
      )
    ) {
      setError(
        'Chỉ Session Assigned hoặc In Progress mới có thể dừng.',
      )

      return
    }

    setStopTarget(
      session,
    )

    setStopReason(
      '',
    )

    setError('')
    setMessage('')
  }

  async function confirmStop() {
    if (!stopTarget) {
      return
    }

    const reason =
      stopReason.trim()

    if (!reason) {
      setError(
        'Vui lòng nhập lý do dừng buổi tập.',
      )

      return
    }

    setBusy(
      true,
    )

    setError('')
    setMessage('')

    try {
      await stopTrainingSession(
        stopTarget
          .TrainingSessionID,
        {
          Reason: reason,
          ReportHealth: true,
          Severity: 'Urgent',
          Description: reason,
        },
      )

      const horseName =
        stopTarget.HorseName

      setStopTarget(
        null,
      )

      setStopReason(
        '',
      )

      const rows =
        await fetchSessions()

      setSessions(
        rows,
      )

      setMessage(
        `Đã dừng tập và gửi báo cáo sự cố của ${horseName} cho Vet.`,
      )
    } catch (
      actionError
    ) {
      setError(
        getErrorMessage(
          actionError,
          'Không thể dừng buổi tập.',
        ),
      )
    } finally {
      setBusy(
        false,
      )
    }
  }

  function openObservationModal(
    session,
  ) {
    if (
      !session.IsSubstitute
    ) {
      setError(
        'Chỉ Substitute Trainer của Session mới được ghi nhận xét giám sát thay.',
      )

      return
    }

    if (
      !session.Result
    ) {
      setError(
        'Work Rider chưa ghi Training Result nên chưa thể lưu Substitute Observation.',
      )

      return
    }

    setObservationTarget(
      session,
    )

    setSubstituteObservation(
      session.Result
        .SubstituteObservation ||
        '',
    )

    setError('')
    setMessage('')
  }

  async function saveSubstituteObservation(
    event,
  ) {
    event.preventDefault()

    if (
      !observationTarget
    ) {
      return
    }

    const observation =
      substituteObservation
        .trim()

    if (!observation) {
      setError(
        'Vui lòng nhập nhận xét của Substitute Trainer.',
      )

      return
    }

    setBusy(
      true,
    )

    setError('')
    setMessage('')

    try {
      await submitSubstituteObservation(
        observationTarget
          .TrainingSessionID,
        observation,
      )

      const horseName =
        observationTarget.HorseName

      setObservationTarget(
        null,
      )

      setSubstituteObservation(
        '',
      )

      const rows =
        await fetchSessions()

      setSessions(
        rows,
      )

      setMessage(
        `Đã lưu nhận xét giám sát thay cho buổi tập của ${horseName}.`,
      )
    } catch (
      actionError
    ) {
      setError(
        getErrorMessage(
          actionError,
          'Không thể lưu Substitute Observation.',
        ),
      )
    } finally {
      setBusy(
        false,
      )
    }
  }

  if (
    loading
  ) {
    return (
      <main className="page-content trainer-supervision-page">
        <section
          className="panel trainer-supervision-loading"
          role="status"
        >
          <div className="trainer-supervision-loading-bar" />

          <div>
            <strong>
              Đang tải buổi tập giám sát
            </strong>

            <span>
              Đang lấy các Buổi tập
              thuộc phạm vi giám sát của
              Trainer.
            </span>
          </div>
        </section>
      </main>
    )
  }

  return (
    <main className="page-content trainer-supervision-page">
      <div className="breadcrumb">
        <span>
          Huấn luyện
        </span>

        <span>
          /
        </span>

        <strong>
          Buổi tập giám sát
        </strong>
      </div>

      <div className="page-heading trainer-supervision-page-heading">
        <div>
          <p className="eyebrow">
            HUẤN LUYỆN VIÊN
          </p>

          <h1>
            Buổi tập giám sát
          </h1>

          <p>
            Theo dõi Session đang phụ trách,
            giám sát thay và xử lý khi cần
            dừng buổi tập.
          </p>
        </div>

        <></>
      </div>

      {error && (
        <div
          className="alert-banner"
          role="alert"
        >
          {error}
        </div>
      )}

      {message && (
        <div
          className="success-message"
          role="status"
        >
          {message}
        </div>
      )}

      <section className="trainer-supervision-summary-grid">
        <article>
          <span>
            Tổng Session
          </span>

          <strong>
            {summary.total}
          </strong>
        </article>

        <article>
          <span>
            Chưa bắt đầu
          </span>

          <strong>
            {summary.assigned}
          </strong>
        </article>

        <article>
          <span>
            Đang diễn ra
          </span>

          <strong>
            {summary.progress}
          </strong>
        </article>

        <article>
          <span>
            Giám sát thay
          </span>

          <strong>
            {summary.substitute}
          </strong>
        </article>
      </section>

      <section className="filter-card trainer-supervision-filter">
        <label className="filter-field">
          <span>
            Trạng thái
          </span>

          <select
            value={
              statusFilter
            }
            onChange={(event) =>
              setStatusFilter(
                event.target.value,
              )
            }
          >
            <option value="all">
              Tất cả
            </option>

            <option value="Assigned">
              Đã phân công
            </option>

            <option value="In Progress">
              Đang tập
            </option>

            <option value="Completed">
              Hoàn thành
            </option>

            <option value="Cancelled">
              Đã dừng / hủy
            </option>

            <option value="Missed">
              Vắng
            </option>
          </select>
        </label>

        <label className="filter-field trainer-supervision-search">
          <span>
            Tìm kiếm
          </span>

          <input
            type="search"
            value={
              search
            }
            placeholder="Ngựa, Nhân viên cưỡi ngựa, Giai đoạn, bài tập..."
            onChange={(event) =>
              setSearch(
                event.target.value,
              )
            }
          />
        </label>
      </section>

      <section className="panel trainer-supervision-list-panel">
        <div className="trainer-supervision-section-head">
          <div>
            <span className="trainer-supervision-kicker">
              SUPERVISION
            </span>

            <h2>
              Buổi tập
            </h2>

            <p>
              Session có Người giám sát thay thế
              sẽ được đánh dấu riêng.
            </p>
          </div>
        </div>

        {filteredSessions.length ===
        0 ? (
          <div className="empty-state">
            <h3>
              Không có buổi tập
            </h3>

            <p>
              Không có Session phù hợp với
              bộ lọc hiện tại.
            </p>
          </div>
        ) : (
          <div className="trainer-supervision-session-list">
            {filteredSessions.map(
              (session) => {
                const canStop =
                  [
                    'Assigned',
                    'In Progress',
                  ].includes(
                    session.Status,
                  )

                const canObservation =
                  session.IsSubstitute &&
                  Boolean(
                    session.Result,
                  )

                const hasObservation =
                  Boolean(
                    session
                      .Result
                      ?.SubstituteObservation,
                  )

                return (
                  <article
                    className="trainer-supervision-card"
                    key={
                      session.TrainingSessionID
                    }
                  >
                    <div className="trainer-supervision-card-head">
                      <div>
                        <span className="trainer-supervision-session-code">
                          SESSION #
                          {
                            session.TrainingSessionID
                          }
                        </span>

                        <h3>
                          {
                            session.HorseName
                          }
                        </h3>

                        <p>
                          {formatDate(
                            session.SessionDate,
                          )}
                          {' · '}
                          {formatTime(
                            session.StartTime,
                          )}

                          {session.EndTime
                            ? ` → ${formatTime(
                                session.EndTime,
                              )}`
                            : ''}

                          {' · '}
                          Slot{' '}
                          {
                            session.SequenceNo
                          }
                        </p>
                      </div>

                      <div className="trainer-supervision-head-badges">
                        {session.IsSubstitute && (
                          <span className="status-badge trainer-supervision-substitute-badge">
                            Substitute
                          </span>
                        )}

                        <span
                          className={`status-badge trainer-supervision-status ${statusTone(
                            session.Status,
                          )}`}
                        >
                          {STATUS_LABELS[
                            session.Status
                          ] ||
                            session.Status}
                        </span>
                      </div>
                    </div>

                    <div className="trainer-supervision-info-grid">
                      <div>
                        <span>
                          Huấn luyện viên phụ trách
                        </span>

                        <strong>
                          {
                            session.AssignedTrainerName
                          }
                        </strong>
                      </div>

                      <div>
                        <span>
                          Người giám sát
                        </span>

                        <strong>
                          {
                            session.SupervisingTrainerName
                          }
                        </strong>
                      </div>

                      <div>
                        <span>
                          Work Rider
                        </span>

                        <strong>
                          {
                            session.WorkRiderName
                          }
                        </strong>
                      </div>

                      <div>
                        <span>
                          Giáo án
                        </span>

                        <strong>
                          #
                          {
                            session.TrainingPlanID
                          }
                        </strong>
                      </div>

                      <div>
                        <span>
                          Giai đoạn
                        </span>

                        <strong>
                          {
                            session.StageName
                          }
                        </strong>
                      </div>

                      <div>
                        <span>
                          Bài tập
                        </span>

                        <strong>
                          {
                            session.TrainingType
                          }
                        </strong>
                      </div>

                      <div>
                        <span>
                          Mức tải tập luyện
                        </span>

                        <strong>
                          {show(
                            session.TrainingLoad,
                          )}
                        </strong>
                      </div>

                      <div>
                        <span>
                          Quãng đường
                        </span>

                        <strong>
                          {session.DistancePlannedKm ===
                            null ||
                          session.DistancePlannedKm ===
                            undefined
                            ? '—'
                            : `${session.DistancePlannedKm} km`}
                        </strong>
                      </div>

                      <div>
                        <span>
                          Tốc độ mục tiêu
                        </span>

                        <strong>
                          {session.TargetSpeedKmh ===
                            null ||
                          session.TargetSpeedKmh ===
                            undefined
                            ? '—'
                            : `${session.TargetSpeedKmh} km/h`}
                        </strong>
                      </div>

                      <div>
                        <span>
                          Mặt sân
                        </span>

                        <strong>
                          {show(
                            session.Surface,
                          )}
                        </strong>
                      </div>

                      <div>
                        <span>
                          Địa điểm
                        </span>

                        <strong>
                          {show(
                            session.Location,
                          )}
                        </strong>
                      </div>
                    </div>

                    {session.Instructions && (
                      <div className="trainer-supervision-text-block">
                        <span>
                          Hướng dẫn buổi tập
                        </span>

                        <p>
                          {
                            session.Instructions
                          }
                        </p>
                      </div>
                    )}

                    {session.Result && (
                      <div className="trainer-supervision-result">
                        <div className="trainer-supervision-result-head">
                          <div>
                            <span className="trainer-supervision-kicker">
                              NHÂN VIÊN CƯỠI NGỰA RESULT
                            </span>

                            <h4>
                              Kết quả thực tế
                            </h4>
                          </div>

                          <span className="status-badge trainer-supervision-result-badge">
                            Đã ghi kết quả
                          </span>
                        </div>

                        <div className="trainer-supervision-result-grid">
                          <div>
                            <span>
                              Thời lượng
                            </span>

                            <strong>
                              {session.Result
                                .ActualDurationMinutes ===
                                null ||
                              session.Result
                                .ActualDurationMinutes ===
                                undefined
                                ? '—'
                                : `${session.Result.ActualDurationMinutes} phút`}
                            </strong>
                          </div>

                          <div>
                            <span>
                              Quãng đường
                            </span>

                            <strong>
                              {session.Result
                                .ActualDistanceKm ===
                                null ||
                              session.Result
                                .ActualDistanceKm ===
                                undefined
                                ? '—'
                                : `${session.Result.ActualDistanceKm} km`}
                            </strong>
                          </div>

                          <div>
                            <span>
                              Avg Speed
                            </span>

                            <strong>
                              {session.Result
                                .AvgSpeedKmh ===
                                null ||
                              session.Result
                                .AvgSpeedKmh ===
                                undefined
                                ? '—'
                                : `${session.Result.AvgSpeedKmh} km/h`}
                            </strong>
                          </div>

                          <div>
                            <span>
                              Max Speed
                            </span>

                            <strong>
                              {session.Result
                                .MaxSpeedKmh ===
                                null ||
                              session.Result
                                .MaxSpeedKmh ===
                                undefined
                                ? '—'
                                : `${session.Result.MaxSpeedKmh} km/h`}
                            </strong>
                          </div>

                          <div>
                            <span>
                              Avg Heart Rate
                            </span>

                            <strong>
                              {show(
                                session.Result
                                  .AvgHeartRate,
                              )}
                            </strong>
                          </div>

                          <div>
                            <span>
                              Recovery
                            </span>

                            <strong>
                              {session.Result
                                .RecoveryMinutes ===
                                null ||
                              session.Result
                                .RecoveryMinutes ===
                                undefined
                                ? '—'
                                : `${session.Result.RecoveryMinutes} phút`}
                            </strong>
                          </div>

                          <div>
                            <span>
                              Performance
                            </span>

                            <strong>
                              {show(
                                session.Result
                                  .PerformanceScore,
                              )}
                            </strong>
                          </div>
                        </div>

                        {session.Result
                          .RiderObservation && (
                          <div className="trainer-supervision-text-block">
                            <span>
                              Work Rider Observation
                            </span>

                            <p>
                              {
                                session.Result
                                  .RiderObservation
                              }
                            </p>
                          </div>
                        )}

                        {hasObservation && (
                          <div className="trainer-supervision-substitute-observation">
                            <span>
                              SUBSTITUTE OBSERVATION
                            </span>

                            <p>
                              {
                                session.Result
                                  .SubstituteObservation
                              }
                            </p>
                          </div>
                        )}
                      </div>
                    )}

                    <div className="trainer-supervision-actions">
                      {canStop && (
                        <button
                          className="trainer-supervision-stop-button"
                          type="button"
                          disabled={
                            busy
                          }
                          onClick={() =>
                            openStopModal(
                              session,
                            )
                          }
                        >
                          Dừng tập và báo sự cố
                        </button>
                      )}

                      {canObservation && (
                        <button
                          className="button button-secondary"
                          type="button"
                          disabled={
                            busy
                          }
                          onClick={() =>
                            openObservationModal(
                              session,
                            )
                          }
                        >
                          {hasObservation
                            ? 'Cập nhật nhận xét giám sát'
                            : 'Ghi nhận xét giám sát'}
                        </button>
                      )}

                      {session.IsSubstitute &&
                        !session.Result &&
                        session.Status !==
                          'Cancelled' &&
                        session.Status !==
                          'Missed' && (
                        <div className="trainer-supervision-waiting-note">
                          Substitute Observation
                          sẽ được lưu sau khi
                          Work Rider ghi Result.
                        </div>
                      )}

                   {session.Status ===
  'Completed' &&
  !session.IsSubstitute && (
  <div className="trainer-supervision-completed-note">
    Buổi tập đã hoàn thành.
  </div>
)}

                      {session.Status ===
                        'Cancelled' && (
                        <div className="trainer-supervision-stopped-note">
                          Session đã dừng hoặc
                          bị hủy.
                        </div>
                      )}

                      {session.Status ===
                        'Missed' && (
                        <div className="trainer-supervision-waiting-note">
                          Session đã được đánh
                          dấu Missed.
                        </div>
                      )}
                    </div>
                  </article>
                )
              },
            )}
          </div>
        )}
      </section>

      {stopTarget && (
        <div
          className="trainer-supervision-modal-backdrop"
          role="presentation"
          onMouseDown={(event) => {
            if (
              event.target ===
                event.currentTarget &&
              !busy
            ) {
              setStopTarget(
                null,
              )
            }
          }}
        >
          <section
            className="trainer-supervision-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="trainer-stop-title"
          >
            <span className="trainer-supervision-kicker">
              STOP SESSION
            </span>

            <h2 id="trainer-stop-title">
              Dừng tập và báo sự cố
            </h2>

            <p>
              {
                stopTarget.HorseName
              }
              {' · '}
              {
                stopTarget.TrainingType
              }
              {' · '}
              {formatDate(
                stopTarget.SessionDate,
              )}
            </p>

            <div className="trainer-supervision-stop-warning">
              Session sẽ chuyển sang trạng
              thái Cancelled theo xử lý của
              Backend.
            </div>

            <label className="form-field">
              <span>
                Lý do dừng *
              </span>

              <textarea
                rows="5"
                maxLength="1000"
                value={
                  stopReason
                }
                placeholder="Ví dụ: Ngựa có dấu hiệu không ổn định, cần dừng buổi tập..."
                onChange={(event) =>
                  setStopReason(
                    event.target.value,
                  )
                }
              />
            </label>

            <div className="trainer-supervision-modal-actions">
              <button
                className="button button-secondary"
                type="button"
                disabled={
                  busy
                }
                onClick={() => {
                  setStopTarget(
                    null,
                  )

                  setStopReason(
                    '',
                  )
                }}
              >
                Quay lại
              </button>

              <button
                className="button trainer-supervision-modal-stop"
                type="button"
                disabled={
                  busy
                }
                onClick={() =>
                  void confirmStop()
                }
              >
                {busy
                  ? 'Đang dừng...'
                  : 'Xác nhận dừng'}
              </button>
            </div>
          </section>
        </div>
      )}

      {observationTarget && (
        <div
          className="trainer-supervision-modal-backdrop"
          role="presentation"
          onMouseDown={(event) => {
            if (
              event.target ===
                event.currentTarget &&
              !busy
            ) {
              setObservationTarget(
                null,
              )
            }
          }}
        >
          <section
            className="trainer-supervision-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="substitute-observation-title"
          >
            <span className="trainer-supervision-kicker">
              SUBSTITUTE HUẤN LUYỆN VIÊN
            </span>

            <h2 id="substitute-observation-title">
              Nhận xét giám sát thay
            </h2>

            <p>
              {
                observationTarget.HorseName
              }
              {' · '}
              {
                observationTarget.TrainingType
              }
              {' · '}
              {formatDate(
                observationTarget.SessionDate,
              )}
            </p>

            <div className="trainer-supervision-observation-context">
              <div>
                <span>
                  Huấn luyện viên phụ trách
                </span>

                <strong>
                  {
                    observationTarget
                      .AssignedTrainerName
                  }
                </strong>
              </div>

              <div>
                <span>
                  Substitute
                </span>

                <strong>
                  {
                    observationTarget
                      .SupervisingTrainerName
                  }
                </strong>
              </div>

              <div>
                <span>
                  Work Rider
                </span>

                <strong>
                  {
                    observationTarget
                      .WorkRiderName
                  }
                </strong>
              </div>
            </div>

            <form
              noValidate
              onSubmit={
                saveSubstituteObservation
              }
            >
              <label className="form-field">
                <span>
                  Nhận xét *
                </span>

                <textarea
                  rows="6"
                  maxLength="2000"
                  value={
                    substituteObservation
                  }
                  placeholder="Ghi lại những gì quan sát được trong quá trình giám sát..."
                  onChange={(event) =>
                    setSubstituteObservation(
                      event.target.value,
                    )
                  }
                />
              </label>

              <div className="trainer-supervision-modal-actions">
                <button
                  className="button button-secondary"
                  type="button"
                  disabled={
                    busy
                  }
                  onClick={() => {
                    setObservationTarget(
                      null,
                    )

                    setSubstituteObservation(
                      '',
                    )
                  }}
                >
                  Hủy
                </button>

                <button
                  className="button"
                  type="submit"
                  disabled={
                    busy
                  }
                >
                  {busy
                    ? 'Đang lưu...'
                    : 'Lưu nhận xét'}
                </button>
              </div>
            </form>
          </section>
        </div>
      )}
    </main>
  )
}
