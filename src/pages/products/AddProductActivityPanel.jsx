// AddProductActivityPanel.jsx — src/pages/products/AddProductActivityPanel.jsx
import React, { useState, useEffect, useRef } from 'react'
import { CheckCircle2, AlertCircle, Loader2, Trash2, X, ListChecks } from 'lucide-react'

function ProgressBar({ done, total }) {
  const pct = total > 0 ? Math.min(100, Math.round((done / total) * 100)) : 0
  return (
    <div className="w-full h-1.5 bg-gray-100 rounded-full overflow-hidden">
      <div
        className="h-full bg-blue-400 transition-all duration-300 ease-out"
        style={{ width: `${pct}%` }}
      />
    </div>
  )
}

function JobDetailsModal({ job, onClose, onCancel }) {
  const [items, setItems] = useState([])
  const [itemsLoading, setItemsLoading] = useState(false)
  const [itemsTotal, setItemsTotal] = useState(0)
  const [successCount, setSuccessCount] = useState(0)
  const [errorCount, setErrorCount] = useState(0)
  const [statusFilter, setStatusFilter] = useState('all') // 'all' | 'success' | 'error'
  const [search, setSearch] = useState('')
  const [page, setPage] = useState(0)
  const PAGE_SIZE = 25

  const usesItemLog = job && job.kind !== 'batch' // bulk-add jobs only, for now

  useEffect(() => {
    if (!job || !usesItemLog) return
    setPage(0)
  }, [job?.jobId, statusFilter, search]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!job || !usesItemLog) return
    let cancelled = false
    setItemsLoading(true)
    const params = new URLSearchParams({ page, limit: PAGE_SIZE })
    if (statusFilter !== 'all') params.set('status', statusFilter)
    if (search.trim()) params.set('search', search.trim())

    import('../../lib/api').then(({ api }) => {
      api.get(`/api/activity/${job.jobId}/items?${params}`).then(res => {
        if (cancelled || !res) return
        setItems(res.data || [])
        setItemsTotal(res.count || 0)
        setSuccessCount(res.success_count || 0)
        setErrorCount(res.error_count || 0)
        setItemsLoading(false)
      }).catch(() => { if (!cancelled) setItemsLoading(false) })
    })
    return () => { cancelled = true }
  }, [job?.jobId, usesItemLog, page, statusFilter, search])

  if (!job) return null
  const isRunning = job.done < job.total && job.status === 'running'
  const pageCount = Math.ceil(itemsTotal / PAGE_SIZE)

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/30 px-4" onClick={onClose}>
      <div className="bg-white rounded-xl shadow-xl w-full max-w-2xl max-h-[80vh] flex flex-col" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100">
          <h3 className="text-sm font-semibold text-gray-900">{job.label} #{job.jobId}</h3>
          <div className="flex items-center gap-2">
            {isRunning && (
              <button
                onClick={() => onCancel(job.jobId)}
                className="text-xs font-semibold text-red-600 hover:text-red-700 px-2 py-1 rounded hover:bg-red-50"
              >
                Cancel import
              </button>
            )}
            <button onClick={onClose} className="text-gray-400 hover:text-gray-600"><X size={16} /></button>
          </div>
        </div>

        {/* Summary line */}
        <div className="px-4 py-2.5 border-b border-gray-50 bg-gray-50/60 flex items-center gap-2">
          {job.status === 'error'
            ? <AlertCircle size={14} className="text-red-500 shrink-0" />
            : job.done >= job.total
              ? <CheckCircle2 size={14} className="text-green-500 shrink-0" />
              : <Loader2 size={14} className="text-gray-400 shrink-0 animate-spin" />}
          <p className="text-xs text-gray-700">
            {job.summary || `${job.done.toLocaleString()}/${job.total.toLocaleString()} finished`}
          </p>
        </div>

        {job.kind === 'batch' && (
          <div className="px-4 pt-3 pb-1">
            <ProgressBar done={job.done} total={job.total} />
          </div>
        )}

        {usesItemLog ? (
          <>
            {/* Filter bar */}
            <div className="flex items-center gap-2 px-4 py-2.5 border-b border-gray-50">
              <input
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder="Search SKU or title…"
                className="flex-1 px-2.5 py-1.5 text-xs border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-red-500/30 focus:border-red-400"
              />
              <div className="flex gap-1 bg-gray-100 rounded-lg p-1 shrink-0">
                {[
                  { key: 'all',     label: `All ${(successCount + errorCount).toLocaleString()}` },
                  { key: 'success', label: `✓ ${successCount.toLocaleString()}` },
                  { key: 'error',   label: `✕ ${errorCount.toLocaleString()}` },
                ].map(f => (
                  <button
                    key={f.key}
                    onClick={() => setStatusFilter(f.key)}
                    className={`px-2.5 py-1 text-[11px] font-semibold rounded-md transition-colors ${
                      statusFilter === f.key ? 'bg-white shadow-sm text-gray-900' : 'text-gray-500 hover:text-gray-700'
                    }`}
                  >
                    {f.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Results table */}
            <div className="overflow-y-auto flex-1">
              {itemsLoading ? (
                <div className="px-4 py-10 text-center">
                  <Loader2 size={18} className="animate-spin text-gray-300 mx-auto" />
                </div>
              ) : items.length === 0 ? (
                <p className="px-4 py-10 text-xs text-gray-300 text-center">No results match this filter.</p>
              ) : (
                <table className="w-full text-xs">
                  <thead>
                    <tr className="border-b border-gray-100 bg-gray-50 sticky top-0">
                      <th className="w-6 px-3 py-2" />
                      <th className="text-left px-2 py-2 text-[11px] text-gray-400 font-medium">SKU / ASIN</th>
                      <th className="text-left px-2 py-2 text-[11px] text-gray-400 font-medium">Title / Reason</th>
                    </tr>
                  </thead>
                  <tbody>
                    {items.map(r => (
                      <tr key={r.id} className="border-b border-gray-50 last:border-none">
                        <td className="px-3 py-2">
                          {r.status === 'success'
                            ? <CheckCircle2 size={12} className="text-green-500" />
                            : <AlertCircle size={12} className="text-red-500" />}
                        </td>
                        <td className="px-2 py-2 font-mono text-gray-500">{r.identifier}</td>
                        <td className="px-2 py-2 text-gray-700 truncate max-w-[260px]">
                          {r.status === 'success' ? r.title : (r.message || '—')}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>

            {/* Pagination */}
            {pageCount > 1 && (
              <div className="flex items-center justify-between px-4 py-2 border-t border-gray-50 text-[11px] text-gray-400">
                <span>Page {page + 1} of {pageCount}</span>
                <div className="flex gap-1">
                  <button
                    onClick={() => setPage(p => Math.max(0, p - 1))}
                    disabled={page === 0}
                    className="px-2 py-1 border border-gray-200 rounded disabled:opacity-30"
                  >Prev</button>
                  <button
                    onClick={() => setPage(p => Math.min(pageCount - 1, p + 1))}
                    disabled={page >= pageCount - 1}
                    className="px-2 py-1 border border-gray-200 rounded disabled:opacity-30"
                  >Next</button>
                </div>
              </div>
            )}
          </>
        ) : (
          <div className="px-4 py-6 text-center text-xs text-gray-400">
            Per-item detail isn't tracked for this job type yet.
          </div>
        )}

        <div className="px-4 py-2.5 border-t border-gray-50 bg-gray-50/60 text-[11px] text-gray-500">
          {job.done.toLocaleString()}/{job.total.toLocaleString()} finished
          {job.kind !== 'batch' && ` — ${job.success} succeeded, ${job.failed} failed`}
        </div>
      </div>
    </div>
  )
}

export default function AddProductActivityPanel({ jobs, onRemoveJob, onCancelJob }) {
  const [open, setOpen] = useState(false)
  const [detailsJob, setDetailsJob] = useState(null)
  const panelRef = useRef(null)

  useEffect(() => {
    if (!open) return
    function handleClick(e) {
      if (panelRef.current && !panelRef.current.contains(e.target)) setOpen(false)
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [open])

  if (!jobs || jobs.length === 0) return null

  const runningCount = jobs.filter(j => j.done < j.total && j.status !== 'error').length
  const anyFailed = jobs.some(j => j.failed > 0 || j.status === 'error')

  return (
    <div className="relative" ref={panelRef}>
      <JobDetailsModal job={detailsJob} onClose={() => setDetailsJob(null)} onCancel={onCancelJob} />

      <button
        onClick={() => setOpen(o => !o)}
        className="relative flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold border border-gray-200 text-gray-600 rounded-lg hover:bg-gray-50 transition-colors"
        title="Activity"
      >
        {runningCount > 0
          ? <Loader2 size={13} className="animate-spin text-gray-400" />
          : <ListChecks size={13} />}
        Activity
        {jobs.length > 0 && (
          <span className={`ml-0.5 min-w-[16px] h-4 px-1 flex items-center justify-center rounded-full text-[9px] font-bold leading-none text-white ${
            runningCount > 0 ? 'bg-blue-500' : anyFailed ? 'bg-red-500' : 'bg-green-500'
          }`}>
            {jobs.length}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 mt-2 w-96 bg-white border border-gray-100 rounded-xl shadow-xl z-50 overflow-hidden">
          <div className="max-h-80 overflow-y-auto divide-y divide-gray-50">
            {jobs.map(job => {
              const running = job.done < job.total && job.status !== 'error'
              return (
                <div
                  key={job.jobId}
                  onClick={() => setDetailsJob(job)}
                  className="flex items-center gap-2.5 px-3 py-2.5 cursor-pointer hover:bg-gray-50 transition-colors"
                >
                  <div className="shrink-0">
                    {running
                      ? <Loader2 size={15} className="animate-spin text-gray-400" />
                      : job.status === 'error' || job.failed > 0
                        ? <AlertCircle size={15} className="text-red-500" />
                        : <CheckCircle2 size={15} className="text-green-500" />}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-xs text-gray-700 truncate">
                      {job.label} #{job.jobId}{' '}
                      <span className="text-gray-400">
                        ({job.done.toLocaleString()}/{job.total.toLocaleString()} finished)
                      </span>
                    </p>
                    {job.kind === 'batch' && running && (
                      <div className="mt-1"><ProgressBar done={job.done} total={job.total} /></div>
                    )}
                  </div>
                  <button
                    onClick={e => { e.stopPropagation(); onRemoveJob(job.jobId) }}
                    className="shrink-0 text-gray-300 hover:text-red-500 transition-colors"
                    title="Remove"
                  >
                    <Trash2 size={12} />
                  </button>
                </div>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}