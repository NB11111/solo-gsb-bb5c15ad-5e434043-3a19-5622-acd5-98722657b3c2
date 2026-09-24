import { useMemo, useState } from 'react'
import { analyzeTurnTaking } from '../turnTaking.js'
import { fmtSeconds, fmtTime } from '../utils.js'

/**
 * Turn-taking relations panel for the editor page.
 *
 * Props:
 *   segments        editor's current segments (unsaved edits included)
 *   onLocate(range) focus the existing timeline on a transition interval
 *
 * Segments are merged per speaker on half-open millisecond intervals, then
 * every start/end boundary partitions the timeline into solo / overlap /
 * silence zones. For two temporally adjacent solo zones of different
 * speakers, the stretch between them is either:
 *   - only silence of at most the configurable threshold -> 普通接话
 *   - exactly one overlap zone of precisely these two speakers -> 插话
 *   - a third speaker or a mixed transition -> not counted.
 * Results are grouped by directed speaker pair. Everything is recomputed
 * synchronously from the live segment list, so edits refresh the panel
 * immediately, no save required.
 */
export default function TurnTaking({ segments, onLocate }) {
  const [thresholdMs, setThresholdMs] = useState(1000)
  const [activeKey, setActiveKey] = useState(null)

  const report = useMemo(
    () => analyzeTurnTaking(segments, thresholdMs),
    [segments, thresholdMs],
  )

  const locate = (ev) => {
    const key = `${ev.type}-${ev.startMs}-${ev.endMs}-${ev.from}-${ev.to}`
    setActiveKey(key)
    let start = ev.startMs / 1000
    let end = ev.endMs / 1000
    if (ev.type === 'handover' && ev.endMs === ev.startMs) {
      // Zero-length boundary: widen symmetrically around the handover point
      // so the timeline has a visible range to highlight.
      start = Math.max(0, (ev.startMs - 500) / 1000)
      end = (ev.endMs + 500) / 1000
    }
    onLocate?.({
      start,
      end,
      kind: ev.type,
      from: ev.from,
      to: ev.to,
    })
  }

  const renderEvent = (ev) => {
    const key = `${ev.type}-${ev.startMs}-${ev.endMs}-${ev.from}-${ev.to}`
    const isHandover = ev.type === 'handover'
    return (
      <button
        type="button"
        key={key}
        className={`turn-event ${isHandover ? 'handover' : 'interruption'}${
          activeKey === key ? ' active' : ''
        }`}
        onClick={() => locate(ev)}
        title="点击在时间轴定位"
      >
        <span className="turn-event-time">
          {isHandover
            ? fmtTime(ev.startMs / 1000)
            : `${fmtTime(ev.startMs / 1000)} – ${fmtTime(ev.endMs / 1000)}`}
        </span>
        <span className="turn-event-detail">
          {isHandover ? (
            <>
              <span className="tag turn-tag-handover">普通接话</span>
              静默 {fmtSeconds(ev.gapMs / 1000)} s
            </>
          ) : (
            <>
              <span className="tag turn-tag-interruption">插话</span>
              同讲 {fmtSeconds(ev.overlapMs / 1000)} s
            </>
          )}
        </span>
      </button>
    )
  }

  return (
    <div className="panel turn-panel">
      <h3>🔀 接话关系</h3>
      <div className="muted small turn-hint">
        依据<b>当前转写片段</b>（含未保存修改）即时重算：先按毫秒半开区间合并
        同一说话人相交或相接的片段，再以全部起止边界划分独讲 / 同讲 / 静默
        区间。时间相邻且说话人不同的两个独讲区间之间：仅有不超过阈值的静默时
        记「普通接话」；仅有两人同讲区间时记「插话」（后者在前者尚未结束时
        开口）；出现第三人或静默与同讲混合过渡则不计。点击任一记录可定位
        时间轴。
      </div>

      <div className="turn-controls">
        <label className="turn-threshold">
          普通接话静默阈值
          <input
            type="number"
            min="0"
            step="100"
            value={thresholdMs}
            onChange={(e) => setThresholdMs(
              Math.max(0, Math.floor(Number(e.target.value) || 0)))}
          />
          <span className="muted small">ms</span>
        </label>
        <span className="muted small">
          独讲区间 {report.soloCount} · 同讲区间 {report.overlapCount}
          {' '}· 静默区间 {report.silenceCount}
        </span>
      </div>

      <div className="stats-grid turn-summary">
        <div className="stat-box">
          <span className="stat-num">{report.handoverCount}</span>
          <span className="muted small">普通接话总次数</span>
        </div>
        <div className="stat-box">
          <span className="stat-num">{report.interruptionCount}</span>
          <span className="muted small">插话总次数</span>
        </div>
        <div className="stat-box">
          <span className="stat-num">{report.pairs.length}</span>
          <span className="muted small">有向说话人对</span>
        </div>
        <div className="stat-box">
          <span className="stat-num">{report.ignoredCount}</span>
          <span className="muted small">第三人 / 混合过渡（不计）</span>
        </div>
      </div>

      {report.pairs.length === 0 && (
        <div className="empty-hint">
          暂无可统计的接话关系（已忽略空说话人与零长度片段；需存在说话人不同、
          时间相邻的独讲区间）。
        </div>
      )}

      <div className="turn-pair-list">
        {report.pairs.map((pair) => (
          <div
            className="turn-pair"
            key={`${pair.from}->${pair.to}`}
          >
            <div className="turn-pair-head">
              <strong className="turn-pair-name">
                {pair.from}
                <span className="turn-arrow"> → </span>
                {pair.to}
              </strong>
              <span className="turn-pair-counts">
                <span className="tag turn-tag-handover">
                  普通接话 ×{pair.handoverCount}
                </span>
                <span className="tag turn-tag-interruption">
                  插话 ×{pair.interruptionCount}
                </span>
              </span>
            </div>

            <div className="turn-event-list">
              {[...pair.handovers, ...pair.interruptions]
                .sort((a, b) => a.startMs - b.startMs
                  || a.endMs - b.endMs
                  || (a.type < b.type ? -1 : 1))
                .map(renderEvent)}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
