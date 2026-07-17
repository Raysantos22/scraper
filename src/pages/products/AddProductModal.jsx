// AddProductModal.jsx — src/pages/products/AddProductModal.jsx
import React, { useState, useEffect, useRef } from 'react'
import { X, Loader2, Plus, Upload } from 'lucide-react'
import { api } from '../../lib/api'

const MAX_BULK_ASINS = 500

function parseAsinsFromText(text) {
  return Array.from(new Set(
    text.split(/[\n,]+/).map(s => s.trim().toUpperCase()).filter(Boolean)
  ))
}

function parseCsvFile(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => {
      const text = String(reader.result || '')
      const lines = text.split(/\r?\n/).filter(l => l.trim())
      if (!lines.length) return resolve([])

      const header = lines[0].split(',').map(h => h.trim().toUpperCase())
      let col = header.findIndex(h => h === 'ASIN' || h === 'SKU')
      let startIdx = 1
      if (col === -1) { col = 0; startIdx = 0 } // no matching header — use first column, include every line

      const asins = []
      for (let i = startIdx; i < lines.length; i++) {
        const cells = lines[i].split(',')
        const val = (cells[col] || '').trim().toUpperCase()
        if (val) asins.push(val)
      }
      resolve(Array.from(new Set(asins)))
    }
    reader.onerror = reject
    reader.readAsText(file)
  })
}

export default function AddProductModal({
  open, onClose,
  onAdded,           // (product) => void            — single-add success
  onActivityStart,   // (asin) => activityId          — single-add: register pending
  onActivityDone,    // (activityId, patch) => void   — single-add: mark success/error
  onJobStarted,       // (jobId, asins) => void        — bulk-add: hand off to polling
}) {
  const [mode, setMode] = useState('single') // 'single' | 'bulk'

  const [suppliers, setSuppliers] = useState([])
  const [supplierId, setSupplierId] = useState('')
  const [showNewSupplier, setShowNewSupplier] = useState(false)
  const [newSupplierName, setNewSupplierName] = useState('')
  const [creatingSupplier, setCreatingSupplier] = useState(false)

  // Single-ASIN state
  const [asin, setAsin] = useState('')
  const [singleLoading, setSingleLoading] = useState(false)
  const [singleError, setSingleError] = useState('')

  // Bulk state
  const [bulkText, setBulkText] = useState('')
  const [fileAsins, setFileAsins] = useState([])
  const [fileName, setFileName] = useState('')
  const [bulkSubmitting, setBulkSubmitting] = useState(false)
  const [bulkError, setBulkError] = useState('')
  const fileInputRef = useRef(null)

  useEffect(() => {
    if (!open) return
    setMode('single')
    setAsin('')
    setSingleError('')
    setBulkText('')
    setFileAsins([])
    setFileName('')
    setBulkError('')
    setShowNewSupplier(false)
    setNewSupplierName('')
    loadSuppliers()
  }, [open]) // eslint-disable-line react-hooks/exhaustive-deps

  function loadSuppliers() {
    api.get('/api/suppliers').then(list => {
      const opts = (list || []).map(s => ({ id: String(s.supplier_id), name: s.supplier_name }))
      setSuppliers(opts)
      if (opts.length) setSupplierId(opts[0].id)
    })
  }

  if (!open) return null

  async function handleCreateSupplier() {
    const name = newSupplierName.trim()
    if (!name) return

    setCreatingSupplier(true)
    try {
      const data = await api.post('/api/suppliers', { supplier_name: name })
      if (!data || data.error) {
        (mode === 'single' ? setSingleError : setBulkError)(data?.error || 'Failed to create supplier')
        return
      }
      const newOpt = { id: String(data.supplier_id), name: data.supplier_name }
      setSuppliers(prev => (prev.some(s => s.id === newOpt.id) ? prev : [...prev, newOpt]))
      setSupplierId(newOpt.id)
      setShowNewSupplier(false)
      setNewSupplierName('')
    } catch {
      (mode === 'single' ? setSingleError : setBulkError)('Network error creating supplier.')
    } finally {
      setCreatingSupplier(false)
    }
  }

  // --- Single ASIN submit ---------------------------------------------------
  async function handleSingleSubmit(e) {
    e.preventDefault()
    setSingleError('')

    const trimmed = asin.trim()
    if (!trimmed) return setSingleError('Enter an ASIN.')
    if (!supplierId) return setSingleError('Select a supplier.')

    const activityId = onActivityStart?.(trimmed)
    setSingleLoading(true)
    try {
      const data = await api.post('/api/products/add', { asin: trimmed, supplier_id: supplierId })

      if (!data || data.error) {
        const msg = data?.error || 'Failed to add product'
        setSingleError(msg)
        onActivityDone?.(activityId, { status: 'error', message: msg })
        setSingleLoading(false)
        return
      }

      onActivityDone?.(activityId, { status: 'success', title: data.title })
      onAdded?.(data)
      onClose()
    } catch {
      onActivityDone?.(activityId, { status: 'error', message: 'Network error' })
      setSingleError('Network error — check the server is reachable.')
    } finally {
      setSingleLoading(false)
    }
  }

  // --- Bulk submit -----------------------------------------------------------
  async function handleFile(e) {
    const file = e.target.files?.[0]
    if (!file) return
    setFileName(file.name)
    try {
      const asins = await parseCsvFile(file)
      setFileAsins(asins)
    } catch {
      setBulkError('Could not read that CSV file.')
    }
  }

  const pastedAsins = parseAsinsFromText(bulkText)
  const allBulkAsins = Array.from(new Set([...pastedAsins, ...fileAsins]))

  async function handleBulkSubmit() {
    setBulkError('')
    if (allBulkAsins.length === 0) return setBulkError('Paste some ASINs or upload a CSV first.')
    if (!supplierId) return setBulkError('Select a supplier.')
    if (allBulkAsins.length > MAX_BULK_ASINS) return setBulkError(`Max ${MAX_BULK_ASINS} ASINs per batch — split into multiple runs.`)

    setBulkSubmitting(true)
    try {
      const data = await api.post('/api/products/bulk-add', { asins: allBulkAsins, supplier_id: supplierId })
      if (!data || data.error) {
        setBulkError(data?.error || 'Failed to start bulk import')
        setBulkSubmitting(false)
        return
      }
      onJobStarted?.(data.job_id, allBulkAsins)
      onClose()
    } catch {
      setBulkError('Network error starting bulk import.')
    } finally {
      setBulkSubmitting(false)
    }
  }

  const supplierPicker = (
    <div>
      <div className="flex items-center justify-between mb-1">
        <label className="block text-xs text-gray-500">Supplier</label>
        <button
          type="button"
          onClick={() => setShowNewSupplier(v => !v)}
          className="flex items-center gap-0.5 text-xs text-red-600 hover:text-red-700 font-medium"
        >
          <Plus size={11} /> New supplier
        </button>
      </div>

      {showNewSupplier ? (
        <div className="flex gap-1.5">
          <input
            autoFocus
            value={newSupplierName}
            onChange={e => setNewSupplierName(e.target.value)}
            placeholder="e.g. Amazon AU"
            className="flex-1 px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-red-500/30 focus:border-red-400"
          />
          <button
            type="button"
            onClick={handleCreateSupplier}
            disabled={creatingSupplier || !newSupplierName.trim()}
            className="px-3 py-2 text-xs font-semibold bg-gray-900 hover:bg-gray-800 text-white rounded-lg disabled:opacity-40 transition-colors"
          >
            {creatingSupplier ? '…' : 'Create'}
          </button>
        </div>
      ) : (
        <select
          value={supplierId}
          onChange={e => setSupplierId(e.target.value)}
          className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-red-500/30 focus:border-red-400"
        >
          {suppliers.length === 0 && <option value="">No suppliers yet — create one above</option>}
          {suppliers.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
        </select>
      )}
    </div>
  )

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 px-4">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-lg p-5">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-sm font-semibold text-gray-900">Add product</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
            <X size={16} />
          </button>
        </div>

        <div className="flex gap-1 bg-gray-100 rounded-lg p-1 mb-4">
          <button
            onClick={() => setMode('single')}
            className={`flex-1 py-1.5 text-xs font-semibold rounded-md transition-colors ${
              mode === 'single' ? 'bg-white shadow-sm text-gray-900' : 'text-gray-500 hover:text-gray-700'
            }`}
          >
            Single ASIN
          </button>
          <button
            onClick={() => setMode('bulk')}
            className={`flex-1 py-1.5 text-xs font-semibold rounded-md transition-colors ${
              mode === 'bulk' ? 'bg-white shadow-sm text-gray-900' : 'text-gray-500 hover:text-gray-700'
            }`}
          >
            Bulk (paste / CSV)
          </button>
        </div>

        {mode === 'single' ? (
          <form onSubmit={handleSingleSubmit} className="space-y-3">
            <div>
              <label className="block text-xs text-gray-500 mb-1">ASIN</label>
              <input
                autoFocus
                value={asin}
                onChange={e => setAsin(e.target.value)}
                placeholder="e.g. B09NCDFTYK"
                className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-red-500/30 focus:border-red-400"
              />
            </div>

            {supplierPicker}

            {singleError && <p className="text-xs text-red-600">{singleError}</p>}

            <button
              type="submit"
              disabled={singleLoading}
              className="w-full flex items-center justify-center gap-2 py-2 text-xs font-semibold bg-red-600 hover:bg-red-700 text-white rounded-lg disabled:opacity-50 transition-colors"
            >
              {singleLoading ? <Loader2 size={13} className="animate-spin" /> : null}
              {singleLoading ? 'Fetching…' : 'Add product'}
            </button>
          </form>
        ) : (
          <div className="space-y-3">
            <div>
              <label className="block text-xs text-gray-500 mb-1">Paste ASINs (one per line, or comma-separated)</label>
              <textarea
                value={bulkText}
                onChange={e => setBulkText(e.target.value)}
                rows={6}
                placeholder={'B09NCDFTYK\nB09GT7GYMR\nB0D9V8KRQ7'}
                className="w-full px-3 py-2 text-xs font-mono border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-red-500/30 focus:border-red-400"
              />
            </div>

            <div className="flex items-center gap-2">
              <div className="flex-1 h-px bg-gray-100" />
              <span className="text-[10px] text-gray-300 uppercase tracking-wide">or</span>
              <div className="flex-1 h-px bg-gray-100" />
            </div>

            <div>
              <label className="block text-xs text-gray-500 mb-1">Upload CSV (column named ASIN or SKU, or first column)</label>
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="w-full flex items-center justify-center gap-2 py-2.5 text-xs font-medium border border-dashed border-gray-300 text-gray-500 rounded-lg hover:bg-gray-50 transition-colors"
              >
                <Upload size={13} /> {fileName || 'Choose CSV file'}
              </button>
              <input ref={fileInputRef} type="file" accept=".csv" onChange={handleFile} className="hidden" />
              {fileAsins.length > 0 && (
                <p className="text-[11px] text-gray-400 mt-1">{fileAsins.length} ASIN(s) found in file</p>
              )}
            </div>

            {supplierPicker}

            <div className="flex items-center justify-between text-[11px] text-gray-400">
              <span>{allBulkAsins.length} unique ASIN(s) ready</span>
              {allBulkAsins.length > MAX_BULK_ASINS && <span className="text-red-500">Max {MAX_BULK_ASINS} per batch</span>}
            </div>

            {bulkError && <p className="text-xs text-red-600">{bulkError}</p>}

            <button
              onClick={handleBulkSubmit}
              disabled={bulkSubmitting || allBulkAsins.length === 0}
              className="w-full flex items-center justify-center gap-2 py-2 text-xs font-semibold bg-red-600 hover:bg-red-700 text-white rounded-lg disabled:opacity-50 transition-colors"
            >
              {bulkSubmitting ? <Loader2 size={13} className="animate-spin" /> : null}
              {bulkSubmitting ? 'Starting…' : `Start import (${allBulkAsins.length})`}
            </button>
          </div>
        )}
      </div>
    </div>
  )
}