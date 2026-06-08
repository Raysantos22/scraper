// C:\Users\ADMIN\scraper\src\pages\checklist\ChecklistTab.jsx
import { useState, useCallback } from 'react'
import {
  ShieldAlert, TrendingDown, RefreshCw, BarChart2, Plus, Upload,
  Activity, Play, ArrowUpCircle, Star, Search, Bot, Trash2, FileSpreadsheet,
} from 'lucide-react'

const STORAGE_KEY = 'checklist_state_v4'
const today = () => new Date().toISOString().slice(0, 10)

const SECTIONS = [
  {
    id: 'daily',
    label: 'Daily Checks',
    accent: '#ef4444',
    tasks: [
      { id: 'd1', icon: ShieldAlert, title: 'Check "Banned on eBay" count',          sub: 'If > 0 → Banned SKUs page → export CSV → end listings immediately',        badge: 'urgent',  badgeStyle: { background: '#fee2e2', color: '#dc2626', border: '1px solid #fca5a5' } },
      { id: 'd2', icon: TrendingDown, title: 'Check "Not Updating" count',            sub: 'If spiking → download Active — No AutoDS CSV → bulk add ASINs',            badge: 'monitor', badgeStyle: { background: '#fffbeb', color: '#d97706', border: '1px solid #fcd34d' } },
      { id: 'd3', icon: BarChart2,    title: 'Check overall pair rate',               sub: 'If below 90% → check which stores dropped → investigate unmonitored SKUs',  badge: 'health',  badgeStyle: { background: '#f0fdf4', color: '#16a34a', border: '1px solid #86efac' } },
      { id: 'd4', icon: Activity,     title: 'Check Out of Stock by store',           sub: 'High-OOS stores → check AutoDS for restocking or price changes',             badge: null },
      { id: 'd5', icon: RefreshCw,    title: 'Hard refresh dashboard (Ctrl+Shift+R)', sub: 'Cache updates at 1:00 am/pm — wait until then for fresh numbers',           badge: null },
      { id: 'd6', icon: BarChart2,    title: 'Compare Total Listings vs yesterday',   sub: 'Big drops (1000+) mean listings were ended — investigate by store',         badge: null },
      { id: 'd7', icon: ShieldAlert,  title: 'Check stores with banned badge',        sub: 'Any store showing ⚠ BANNED → remove from eBay immediately',                 badge: 'urgent',  badgeStyle: { background: '#fee2e2', color: '#dc2626', border: '1px solid #fca5a5' } },
      { id: 'd8', icon: Plus,         title: 'Add new SKUs to AutoDS',                sub: 'New eBay listings today → ensure they are in AutoDS for monitoring',         badge: null },
    ],
  },
  {
    id: 'weekly',
    label: 'Weekly Tasks',
    accent: '#2563eb',
    tasks: [
      { id: 'w1', icon: Upload,      title: 'Download AutoDS — Not on eBay CSV',      sub: 'Products in AutoDS not listed on eBay — potential new listings to create',  badge: 'weekly', badgeStyle: { background: '#eff6ff', color: '#2563eb', border: '1px solid #bfdbfe' } },
      { id: 'w2', icon: Upload,      title: 'Download All — No AutoDS CSV (30k+)',     sub: 'Prioritize active high-stock ones to add to AutoDS for monitoring',         badge: 'weekly', badgeStyle: { background: '#eff6ff', color: '#2563eb', border: '1px solid #bfdbfe' } },
      { id: 'w3', icon: BarChart2,   title: 'Review stores with pair rate < 90%',      sub: 'Find unmonitored SKUs → drill into store listings → add to AutoDS',        badge: 'weekly', badgeStyle: { background: '#eff6ff', color: '#2563eb', border: '1px solid #bfdbfe' } },
      { id: 'w4', icon: ShieldAlert, title: 'Clean up banned SKUs list',               sub: 'Remove already-ended SKUs to keep the list accurate',                       badge: 'weekly', badgeStyle: { background: '#eff6ff', color: '#2563eb', border: '1px solid #bfdbfe' } },
      { id: 'w5', icon: Activity,    title: 'Check AZDP Not Updating count',           sub: 'AZDP listings with no AutoDS match may need remapping',                     badge: 'weekly', badgeStyle: { background: '#eff6ff', color: '#2563eb', border: '1px solid #bfdbfe' } },
    ],
  },
  {
    id: 'monthly',
    label: 'Monthly Tasks',
    accent: '#7c3aed',
    tasks: [
      { id: 'm1', icon: Search,    title: 'Review AutoDS All export for dead products', sub: 'OOS 30+ days → consider ending those eBay listings',                      badge: 'monthly', badgeStyle: { background: '#f5f3ff', color: '#7c3aed', border: '1px solid #ddd6fe' } },
      { id: 'm2', icon: Plus,      title: 'Bulk add No AutoDS backlog to AutoDS',       sub: 'Work through Active — No AutoDS CSV in batches to reduce 30k+ gap',       badge: 'monthly', badgeStyle: { background: '#f5f3ff', color: '#7c3aed', border: '1px solid #ddd6fe' } },
      { id: 'm3', icon: BarChart2, title: 'Audit low-performing stores',                sub: 'Low pair rate or high OOS for a month → check sync, consider repricing',  badge: 'monthly', badgeStyle: { background: '#f5f3ff', color: '#7c3aed', border: '1px solid #ddd6fe' } },
      { id: 'm4', icon: RefreshCw, title: 'Verify automated schedule ran correctly',    sub: 'Check cron logs at /scraper/ebay/logs and /scraper/autods/logs',           badge: 'monthly', badgeStyle: { background: '#f5f3ff', color: '#7c3aed', border: '1px solid #ddd6fe' } },
    ],
  },
  {
    id: 'tracking',
    label: 'Tracking',
    accent: '#0891b2',
    tasks: [
      { id: 't1', icon: Play,            title: 'Run tracking status scraper',          sub: 'Pull latest order tracking statuses from all stores',                      badge: 'daily', badgeStyle: { background: '#ecfeff', color: '#0891b2', border: '1px solid #a5f3fc' } },
      { id: 't2', icon: ArrowUpCircle,   title: 'Extract and upload tracking status',   sub: 'Extract tracking data from scraper output → upload to eBay / AutoDS',      badge: 'daily', badgeStyle: { background: '#ecfeff', color: '#0891b2', border: '1px solid #a5f3fc' } },
      { id: 't3', icon: FileSpreadsheet, title: 'Upload tracking data to sheet',        sub: 'Copy extracted tracking results into the Google Sheet / Excel tracker',     badge: 'daily', badgeStyle: { background: '#ecfeff', color: '#0891b2', border: '1px solid #a5f3fc' } },
    ],
  },
  {
    id: 'scraping',
    label: 'Scraping',
    accent: '#7c3aed',
    tasks: [
      { id: 's1', icon: Star,          title: 'Run best seller scraper',                sub: 'Scrape latest Amazon best seller rankings for product research',            badge: 'daily', badgeStyle: { background: '#f5f3ff', color: '#7c3aed', border: '1px solid #ddd6fe' } },
      { id: 's2', icon: Bot,           title: 'Run full Amazon scraper',                sub: 'Run full product scraper → review results',                                badge: 'daily', badgeStyle: { background: '#f5f3ff', color: '#7c3aed', border: '1px solid #ddd6fe' } },
      { id: 's3', icon: Upload,        title: 'Upload best sellers to AutoDS',          sub: 'Take best seller results → add new products into AutoDS for monitoring',   badge: 'daily', badgeStyle: { background: '#f5f3ff', color: '#7c3aed', border: '1px solid #ddd6fe' } },
      { id: 's4', icon: Trash2,        title: 'Delete OOS products from AutoDS',        sub: 'Check scraper output for OOS items → remove them from AutoDS if OOS',      badge: 'daily', badgeStyle: { background: '#f5f3ff', color: '#7c3aed', border: '1px solid #ddd6fe' } },
    ],
  },
]

const ALL_TASKS = SECTIONS.flatMap(s => s.tasks)

function loadStorage() {
  try { const r = localStorage.getItem(STORAGE_KEY); return r ? JSON.parse(r) : null } catch { return null }
}
function saveStorage(data) {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(data)) } catch {}
}
function initState() {
  const saved = loadStorage()
  const todayStr = today()
  if (saved && saved.savedDate === todayStr) return { checked: saved.checked || {}, savedDate: todayStr }
  return { checked: {}, savedDate: todayStr }
}

function SectionProgress({ tasks, checked, accent }) {
  const done = tasks.filter(t => checked[t.id]).length
  const pct  = tasks.length === 0 ? 0 : Math.round((done / tasks.length) * 100)
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
      <div style={{ flex: 1, height: 3, background: '#f1f5f9', borderRadius: 99, overflow: 'hidden' }}>
        <div style={{ width: `${pct}%`, height: '100%', background: accent, borderRadius: 99, transition: 'width 0.3s' }} />
      </div>
      <span style={{ fontSize: 11, color: '#94a3b8', fontWeight: 500, flexShrink: 0 }}>{done}/{tasks.length}</span>
    </div>
  )
}

function TaskRow({ task, checked, onToggle, accent }) {
  const Icon = task.icon
  return (
    <div
      onClick={onToggle}
      style={{
        display: 'flex', alignItems: 'flex-start', gap: 10,
        padding: '7px 10px', borderRadius: 7, cursor: 'pointer',
        background: checked ? 'transparent' : '#fff',
        border: `1px solid #f1f5f9`,
        marginBottom: 4, opacity: checked ? 0.4 : 1,
        transition: 'all 0.15s', userSelect: 'none',
      }}
      onMouseEnter={e => { if (!checked) e.currentTarget.style.borderColor = '#e2e8f0' }}
      onMouseLeave={e => { e.currentTarget.style.borderColor = '#f1f5f9' }}
    >
      <div style={{
        width: 16, height: 16, borderRadius: '50%', flexShrink: 0, marginTop: 1,
        border: checked ? `2px solid ${accent}` : '1.5px solid #cbd5e1',
        background: checked ? accent : 'transparent',
        display: 'flex', alignItems: 'center', justifyContent: 'center', transition: 'all 0.15s',
      }}>
        {checked && <svg viewBox="0 0 10 10" fill="none" width={9} height={9}><polyline points="1.5,5 4,7.5 8.5,2.5" stroke="white" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"/></svg>}
      </div>
      <Icon size={13} style={{ flexShrink: 0, marginTop: 2, color: checked ? '#cbd5e1' : accent }} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
          <span style={{ fontSize: 12, fontWeight: 500, color: checked ? '#94a3b8' : '#1e293b', textDecoration: checked ? 'line-through' : 'none', lineHeight: 1.4 }}>
            {task.title}
          </span>
          {task.badge && (
            <span style={{ fontSize: 10, fontWeight: 600, padding: '1px 7px', borderRadius: 99, ...task.badgeStyle }}>
              {task.badge}
            </span>
          )}
        </div>
        <p style={{ fontSize: 11, color: '#94a3b8', margin: '2px 0 0', lineHeight: 1.5 }}>{task.sub}</p>
      </div>
    </div>
  )
}

function SectionCard({ section, checked, onToggle }) {
  return (
    <div style={{
      background: '#fff', border: '1px solid #e2e8f0', borderRadius: 10,
      padding: '13px 13px 8px',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
        <div style={{ width: 8, height: 8, borderRadius: '50%', background: section.accent }} />
        <span style={{ fontSize: 11, fontWeight: 700, color: '#475569', textTransform: 'uppercase', letterSpacing: '0.07em' }}>
          {section.label}
        </span>
      </div>
      <SectionProgress tasks={section.tasks} checked={checked} accent={section.accent} />
      {section.tasks.map(task => (
        <TaskRow key={task.id} task={task} checked={!!checked[task.id]} onToggle={() => onToggle(task.id)} accent={section.accent} />
      ))}
    </div>
  )
}

export default function ChecklistTab() {
  const [state, setState]     = useState(initState)
  const [flash, setFlash]     = useState(false)
  const [copied, setCopied]   = useState(false)

  const persist = useCallback((next) => {
    saveStorage(next)
    setFlash(true)
    setTimeout(() => setFlash(false), 1400)
  }, [])

  function toggle(taskId) {
    setState(prev => {
      const next = { ...prev, checked: { ...prev.checked, [taskId]: !prev.checked[taskId] } }
      persist(next)
      return next
    })
  }

  function resetAll() {
    const next = { checked: {}, savedDate: today() }
    saveStorage(next); setState(next)
    setFlash(true); setTimeout(() => setFlash(false), 1400)
  }

  const totalDone   = ALL_TASKS.filter(t => state.checked[t.id]).length
  const totalPct    = Math.round((totalDone / ALL_TASKS.length) * 100)
  const checkedDate = new Date().toLocaleDateString('en-AU', { day: '2-digit', month: 'short', year: 'numeric' })

  // Build the copy text — one line per checked task, grouped by section
  const summaryLines = []
  SECTIONS.forEach(section => {
    const done = section.tasks.filter(t => state.checked[t.id])
    if (done.length > 0) {
      done.forEach(t => summaryLines.push(t.title))
    }
  })
  const summaryText = summaryLines.join('\n')

  function copyToClipboard() {
    if (!summaryLines.length) return
    navigator.clipboard.writeText(summaryText).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    })
  }

  return (
    <div style={{ padding: '18px 20px', fontFamily: "'DM Sans', 'Segoe UI', sans-serif", minHeight: '100vh', background: '#f8fafc', boxSizing: 'border-box', width: '100%' }}>

      {/* Top bar */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
        <div>
          <h1 style={{ margin: 0, fontSize: 14, fontWeight: 700, color: '#0f172a' }}>Operations Checklist</h1>
          <p style={{ margin: '2px 0 0', fontSize: 11, color: '#94a3b8' }}>{totalDone} of {ALL_TASKS.length} tasks · {totalPct}% complete</p>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          {flash && <span style={{ fontSize: 11, color: '#10b981' }}>Saved ✓</span>}
          <button onClick={resetAll} style={{ fontSize: 11, color: '#94a3b8', border: '1px solid #e2e8f0', background: '#fff', padding: '5px 12px', borderRadius: 7, cursor: 'pointer' }}>
            Reset all
          </button>
        </div>
      </div>

      {/* Overall progress bar */}
      <div style={{ height: 3, background: '#e2e8f0', borderRadius: 99, marginBottom: 16, overflow: 'hidden' }}>
        <div style={{ width: `${totalPct}%`, height: '100%', background: 'linear-gradient(90deg, #ef4444, #2563eb, #7c3aed)', borderRadius: 99, transition: 'width 0.4s' }} />
      </div>

      {/* Row 1: Daily + Tracking + Scraping */}
      <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr', gap: 12, marginBottom: 12, alignItems: 'start' }}>
        <SectionCard section={SECTIONS[0]} checked={state.checked} onToggle={toggle} />
        <SectionCard section={SECTIONS[3]} checked={state.checked} onToggle={toggle} />
        <SectionCard section={SECTIONS[4]} checked={state.checked} onToggle={toggle} />
      </div>

      {/* Row 2: Weekly + Monthly side by side */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 16 }}>
        <SectionCard section={SECTIONS[1]} checked={state.checked} onToggle={toggle} />
        <SectionCard section={SECTIONS[2]} checked={state.checked} onToggle={toggle} />
      </div>

      {/* Summary panel — only shows when at least 1 task is checked */}
      {summaryLines.length > 0 && (
        <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 10, padding: '14px 16px' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <div style={{ width: 7, height: 7, borderRadius: '50%', background: '#10b981' }} />
              <span style={{ fontSize: 11, fontWeight: 700, color: '#475569', textTransform: 'uppercase', letterSpacing: '0.07em' }}>
                Daily Task Summary · {checkedDate}
              </span>
              <span style={{ fontSize: 11, color: '#94a3b8' }}>({summaryLines.length} tasks done)</span>
            </div>
            <button
              onClick={copyToClipboard}
              style={{
                fontSize: 11, fontWeight: 600, padding: '5px 14px', borderRadius: 7, cursor: 'pointer',
                border: '1px solid #d1fae5', background: copied ? '#10b981' : '#f0fdf4',
                color: copied ? '#fff' : '#059669', transition: 'all 0.2s',
              }}
            >
              {copied ? '✓ Copied!' : 'Copy to clipboard'}
            </button>
          </div>

          {/* Task list grouped by section */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            {SECTIONS.map(section => {
              const done = section.tasks.filter(t => state.checked[t.id])
              if (!done.length) return null
              return (
                <div key={section.id} style={{ display: 'flex', gap: 8, alignItems: 'flex-start' }}>
                  <span style={{
                    fontSize: 10, fontWeight: 700, padding: '2px 7px', borderRadius: 99, flexShrink: 0, marginTop: 1,
                    background: section.accent + '18', color: section.accent, border: `1px solid ${section.accent}30`,
                    textTransform: 'uppercase', letterSpacing: '0.05em',
                  }}>
                    {section.label}
                  </span>
                  <div style={{ flex: 1 }}>
                    {done.map(t => (
                      <div key={t.id} style={{ fontSize: 12, color: '#334155', lineHeight: 1.7 }}>
                        ✓ {t.title}
                      </div>
                    ))}
                  </div>
                </div>
              )
            })}
          </div>

          {/* Raw text for easy copy reading */}
          <textarea
            readOnly
            value={summaryText}
            style={{
              marginTop: 12, width: '100%', height: 80, resize: 'vertical',
              fontSize: 11, color: '#64748b', background: '#f8fafc',
              border: '1px solid #e2e8f0', borderRadius: 7, padding: '8px 10px',
              fontFamily: 'monospace', boxSizing: 'border-box', outline: 'none',
            }}
          />
        </div>
      )}

    </div>
  )
}