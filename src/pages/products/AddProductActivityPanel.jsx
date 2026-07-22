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
  if (!job) return null
  const hasItemResults = job.results && job.results.length > 0
  const isRunning = job.done < job.total && job.status === 'running'
  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/30 px-4" onClick={onClose}>
      <div className="bg-white rounded-xl shadow-xl w-full max-w-lg max-h-[70vh] flex flex-col" onClick={e => e.stopPropagation()}>
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

        {/* Progress bar for batch-style jobs (bulk delete / bulk update) */}
        {job.kind === 'batch' && (
          <div className="px-4 pt-3 pb-1">
            <ProgressBar done={job.done} total={job.total} />
          </div>
        )}

        <div className="overflow-y-auto divide-y divide-gray-50">
          {hasItemResults ? (
            job.results.map((r, i) => (
              <div key={i} className="flex items-start gap-2.5 px-4 py-2.5">
                {r.status === 'success'
                  ? <CheckCircle2 size={13} className="text-green-500 mt-0.5 shrink-0" />
                  : <AlertCircle size={13} className="text-red-500 mt-0.5 shrink-0" />}
                <div className="min-w-0 flex-1">
                  <p className="text-xs font-medium text-gray-900 truncate">{r.title || r.asin}</p>
                  <p className="text-[11px] text-gray-400 font-mono">{r.asin}</p>
                  {r.status === 'error' && r.message && (
                    <p className="text-[11px] text-red-500 mt-0.5">{r.message}</p>
                  )}
                </div>
              </div>
            ))
          ) : job.summary ? (
            <div className="px-4 py-6 text-center">
              {job.status === 'error'
                ? <AlertCircle size={20} className="text-red-500 mx-auto mb-2" />
                : job.done >= job.total
                  ? <CheckCircle2 size={20} className="text-green-500 mx-auto mb-2" />
                  : <Loader2 size={20} className="text-gray-400 mx-auto mb-2 animate-spin" />}
              <p className="text-xs text-gray-700">{job.summary}</p>
            </div>
          ) : (
            <p className="px-4 py-6 text-xs text-gray-400 text-center">No results yet…</p>
          )}
        </div>
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
                <div key={job.jobId} className="flex items-center gap-2.5 px-3 py-2.5">
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
                      {'  '}
                      <button
                        onClick={() => setDetailsJob(job)}
                        className="text-blue-600 hover:text-blue-700 font-medium"
                      >
                        View details
                      </button>
                    </p>
                    {job.kind === 'batch' && running && (
                      <div className="mt-1"><ProgressBar done={job.done} total={job.total} /></div>
                    )}
                  </div>
                  <button
                    onClick={() => onRemoveJob(job.jobId)}
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