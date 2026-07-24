// src/pages/ebay/EbayListingEditPage.jsx
import { useState, useEffect, useRef } from 'react'
import { api } from '../../lib/api'
import {
  ArrowLeft, Save, X, ExternalLink,
  ImagePlus, Check, AlertCircle,
  Tag, Package, Pencil, AlertTriangle, Link, Trash2, Send
} from 'lucide-react'

function parseImages(raw) {
  if (Array.isArray(raw)) return raw
  if (typeof raw === 'string' && raw.trim()) return raw.split('|').filter(Boolean)
  return []
}

function StockBadge({ stock }) {
  if (stock === 0)
    return <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs bg-red-50 text-red-600 border border-red-100 whitespace-nowrap">Out of stock</span>
  if (stock <= 3)
    return <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs bg-amber-50 text-amber-600 border border-amber-100 whitespace-nowrap">Low stock</span>
  return <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs bg-emerald-50 text-emerald-700 border border-emerald-100 whitespace-nowrap">In stock</span>
}

function ConfirmModal({ open, icon, title, message, confirmLabel, confirmClass, cancelLabel, onConfirm, onCancel, busy }) {
  if (!open) return null
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/30 backdrop-blur-sm" onClick={busy ? undefined : onCancel} />
      <div className="relative bg-white rounded-2xl shadow-xl border border-gray-100 w-full max-w-sm p-6">
        <div className="flex flex-col items-center text-center gap-3">
          {icon && <div className="w-12 h-12 rounded-full bg-red-50 flex items-center justify-center text-red-500">{icon}</div>}
          <h2 className="text-sm font-semibold text-gray-900">{title}</h2>
          {message && <p className="text-xs text-gray-500 leading-relaxed">{message}</p>}
        </div>
        <div className="flex gap-2 mt-5">
          <button onClick={onCancel} disabled={busy} className="flex-1 px-4 py-2 text-xs font-medium border border-gray-200 text-gray-600 rounded-lg hover:bg-gray-50 transition-colors disabled:opacity-50">{cancelLabel || 'Cancel'}</button>
          <button onClick={onConfirm} disabled={busy} className={`flex-1 px-4 py-2 text-xs font-semibold text-white rounded-lg transition-colors disabled:opacity-50 ${confirmClass || 'bg-red-600 hover:bg-red-700'}`}>
            {busy ? 'Pushing…' : (confirmLabel || 'Confirm')}
          </button>
        </div>
      </div>
    </div>
  )
}

function UnsavedModal({ open, onDiscard, onCancel }) {
  if (!open) return null
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/30 backdrop-blur-sm" onClick={onCancel} />
      <div className="relative bg-white rounded-2xl shadow-xl border border-gray-100 w-full max-w-sm p-6">
        <div className="flex flex-col items-center text-center gap-3">
          <div className="w-12 h-12 rounded-full bg-amber-50 flex items-center justify-center text-amber-500"><AlertTriangle size={22} /></div>
          <h2 className="text-sm font-semibold text-gray-900">Unsaved changes</h2>
          <p className="text-xs text-gray-500 leading-relaxed">You have unsaved changes. Push them live before leaving, or discard them?</p>
        </div>
        <div className="flex gap-2 mt-5">
          <button onClick={onCancel} className="flex-1 px-4 py-2 text-xs font-medium border border-gray-200 text-gray-600 rounded-lg hover:bg-gray-50 transition-colors">Keep editing</button>
          <button onClick={onDiscard} className="flex-1 px-4 py-2 text-xs font-medium border border-gray-200 text-red-500 rounded-lg hover:bg-red-50 transition-colors">Discard</button>
        </div>
      </div>
    </div>
  )
}

function ImageLinkModal({ open, url, onClose }) {
  const inputRef = useRef(null)
  useEffect(() => { if (open && inputRef.current) inputRef.current.select() }, [open])
  if (!open) return null
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/30 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-white rounded-2xl shadow-xl border border-gray-100 w-full max-w-md p-5">
        <div className="flex items-center gap-2 mb-3">
          <Link size={14} className="text-gray-400" />
          <h3 className="text-xs font-semibold text-gray-600 uppercase tracking-wider">Image URL</h3>
          <button onClick={onClose} className="ml-auto text-gray-300 hover:text-gray-500 transition-colors"><X size={14} /></button>
        </div>
        <input ref={inputRef} readOnly value={url}
          className="w-full px-3 py-2 text-xs border border-gray-200 rounded-lg font-mono text-gray-700 bg-gray-50 focus:outline-none focus:border-gray-400 mb-3" />
        <div className="flex gap-2">
          <button onClick={() => setShowConfirm(true)} disabled={!dirty || form.title.length > 80}
            className="flex-1 px-3 py-2 text-xs font-medium bg-gray-100 hover:bg-gray-200 text-gray-600 rounded-lg transition-colors">Copy URL</button>
          <a href={url} target="_blank" rel="noreferrer"
            className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2 text-xs font-semibold bg-red-600 hover:bg-red-700 text-white rounded-lg transition-colors">
            <ExternalLink size={11} /> Open in new tab
          </a>
        </div>
      </div>
    </div>
  )
}

function Section({ title, icon: Icon, children }) {
  return (
    <div className="bg-white rounded-2xl border border-gray-100 overflow-hidden">
      <div className="flex items-center gap-2 px-5 py-4 border-b border-gray-50">
        {Icon && <Icon size={14} className="text-gray-400" />}
        <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wider">{title}</h3>
      </div>
      <div className="p-5">{children}</div>
    </div>
  )
}

function Field({ label, children, hint }) {
  return (
    <div>
      <label className="block text-xs font-medium text-gray-500 mb-1.5">{label}</label>
      {children}
      {hint && <p className="text-[10px] text-gray-400 mt-1">{hint}</p>}
    </div>
  )
}

function Input({ value, onChange, placeholder, type = 'text', className = '' }) {
  return (
    <input type={type} value={value ?? ''} onChange={e => onChange(e.target.value)} placeholder={placeholder}
      className={`w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:border-gray-400 focus:ring-1 focus:ring-gray-200 placeholder-gray-300 text-gray-800 transition-colors ${className}`}
    />
  )
}

function Textarea({ value, onChange, placeholder, rows = 4 }) {
  return (
    <textarea value={value ?? ''} onChange={e => onChange(e.target.value)} placeholder={placeholder} rows={rows}
      className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:border-gray-400 focus:ring-1 focus:ring-gray-200 placeholder-gray-300 text-gray-800 resize-none transition-colors"
    />
  )
}

function ImageManager({ images, onChange }) {
  const [newUrl, setNewUrl]           = useState('')
  const [active, setActive]           = useState(0)
  const [deleteIndex, setDeleteIndex] = useState(null)
  const [linkUrl, setLinkUrl]         = useState(null)

  function addUrl() {
    const url = newUrl.trim()
    if (!url) return
    onChange([...images, url])
    setNewUrl('')
    setActive(images.length)
  }

  function doRemove() {
    const i    = deleteIndex
    const next = images.filter((_, idx) => idx !== i)
    onChange(next)
    setActive(Math.min(active, Math.max(0, next.length - 1)))
    setDeleteIndex(null)
  }

  function moveUp(i) {
    if (i === 0) return
    const next = [...images]
    ;[next[i - 1], next[i]] = [next[i], next[i - 1]]
    onChange(next)
    setActive(i - 1)
  }

  return (
    <>
      <ConfirmModal open={deleteIndex !== null} icon={<Trash2 size={22} />} title="Remove this image?"
        message="This image will be removed. Push live to persist the change to eBay."
        confirmLabel="Yes, remove" confirmClass="bg-red-600 hover:bg-red-700" cancelLabel="Cancel"
        onConfirm={doRemove} onCancel={() => setDeleteIndex(null)} />
      <ImageLinkModal open={!!linkUrl} url={linkUrl || ''} onClose={() => setLinkUrl(null)} />
      <div className="space-y-3">
        <div className="relative bg-gray-50 rounded-xl border border-gray-100 h-56 flex items-center justify-center overflow-hidden">
          {images[active]
            ? <img src={images[active]} alt="" className="max-h-full max-w-full object-contain p-4" />
            : <div className="flex flex-col items-center gap-2 text-gray-300"><ImagePlus size={32} /><span className="text-xs">No images yet</span></div>}
          {images[active] && (
            <div className="absolute top-2 right-2 flex gap-1">
              <button onClick={() => setLinkUrl(images[active])} className="w-7 h-7 bg-white rounded-full shadow border border-gray-100 flex items-center justify-center text-gray-400 hover:text-blue-500 transition-colors"><Link size={12} /></button>
              <button onClick={() => setDeleteIndex(active)} className="w-7 h-7 bg-white rounded-full shadow border border-gray-100 flex items-center justify-center text-gray-400 hover:text-red-500 transition-colors"><X size={12} /></button>
            </div>
          )}
        </div>
        {images.length > 0 && (
          <div className="flex gap-2 overflow-x-auto pb-1">
            {images.map((img, i) => (
              <div key={i} className="relative shrink-0 group">
                <button onClick={() => setActive(i)} className={`w-14 h-14 rounded-lg overflow-hidden border-2 transition-colors ${active === i ? 'border-red-400' : 'border-transparent'}`}>
                  <img src={img} alt="" className="w-full h-full object-cover" />
                </button>
                <div className="absolute -top-1 -right-1 hidden group-hover:flex gap-0.5">
                  {i > 0 && <button onClick={() => moveUp(i)} className="w-4 h-4 bg-white rounded-full shadow border border-gray-200 flex items-center justify-center text-gray-500 hover:text-gray-800 text-[8px]">↑</button>}
                  <button onClick={() => setDeleteIndex(i)} className="w-4 h-4 bg-white rounded-full shadow border border-gray-200 flex items-center justify-center text-red-400"><X size={8} /></button>
                </div>
              </div>
            ))}
          </div>
        )}
        <div className="flex gap-2">
          <input type="url" value={newUrl} onChange={e => setNewUrl(e.target.value)} onKeyDown={e => e.key === 'Enter' && addUrl()}
            placeholder="Paste image URL and press Enter..."
            className="flex-1 px-3 py-2 text-xs border border-gray-200 rounded-lg focus:outline-none focus:border-gray-400 placeholder-gray-300" />
          <button onClick={addUrl} className="px-3 py-2 text-xs font-medium bg-gray-100 hover:bg-gray-200 text-gray-600 rounded-lg transition-colors">Add</button>
        </div>
      </div>
    </>
  )
}

export default function EbayListingEditPage({ storeName, sku, onBack, onSaved }) {
  const [listing, setListing] = useState(null)
  const [form, setForm]       = useState(null)
  const [snap, setSnap]       = useState(null)
  const [loading, setLoading] = useState(true)
  const [pushing, setPushing] = useState(false)
  const [pushed, setPushed]   = useState(false)
  const [error, setError]     = useState(null)
  const [showConfirm, setShowConfirm] = useState(false)
  const [showUnsaved, setShowUnsaved] = useState(false)

  useEffect(() => {
    async function load() {
      setLoading(true)
      const data = await api.get(`/api/ebay/listings/detail?store_name=${encodeURIComponent(storeName)}&sku=${encodeURIComponent(sku)}`)
      if (data) {
        setListing(data)
        const f = {
          title: data.title || '',
          description: data.description || '',
          images: parseImages(data.images),
          price: data.price ?? '',
          quantity: data.quantity ?? 0,
        }
        setForm(f)
        setSnap(JSON.parse(JSON.stringify(f)))
      }
      setLoading(false)
    }
    load()
  }, [storeName, sku])

  function isDirty() {
    if (!form || !snap) return false
    return JSON.stringify(form) !== JSON.stringify(snap)
  }
  function setField(field, value) { setForm(f => ({ ...f, [field]: value })) }
  function handleBack() { if (isDirty()) setShowUnsaved(true); else onBack() }

async function doPushLive() {
    setPushing(true); setError(null)
    try {
      const payload = { store_name: storeName, sku }
      if (form.title !== snap.title)             payload.title = form.title
      if (form.description !== snap.description) payload.description = form.description
      if (JSON.stringify(form.images) !== JSON.stringify(snap.images)) payload.images = form.images
      if (String(form.price) !== String(snap.price))       payload.price = parseFloat(form.price) || 0
      if (String(form.quantity) !== String(snap.quantity)) payload.quantity = parseInt(form.quantity) || 0

      await api.post('/api/ebay/listings/push-live', payload)
      setSnap(JSON.parse(JSON.stringify(form)))
      setShowConfirm(false)
      setPushed(true)
      setTimeout(() => setPushed(false), 3000)
      onSaved?.()
    } catch (e) {
      setError(e.message || 'Push to eBay failed')
      setShowConfirm(false)
    }
    setPushing(false)
  }

  if (loading) return <div className="p-8 space-y-4">{[1,2,3].map(i => <div key={i} className="h-32 bg-gray-100 rounded-2xl animate-pulse" />)}</div>
  if (!listing || !form) return <div className="p-8 text-center text-gray-400">Listing not found.</div>

  const dirty = isDirty()

  return (
    <div className="min-h-full bg-gray-50">
      <ConfirmModal open={showConfirm} icon={<Send size={20} />} title="Push changes live to eBay?"
        message={`This will update the live listing for SKU ${sku} on eBay immediately — title, description, images, price, and quantity.`}
        confirmLabel="Yes, push live" confirmClass="bg-red-600 hover:bg-red-700" cancelLabel="Cancel"
        busy={pushing} onConfirm={doPushLive} onCancel={() => !pushing && setShowConfirm(false)} />
      <UnsavedModal open={showUnsaved} onDiscard={() => { setShowUnsaved(false); onBack() }} onCancel={() => setShowUnsaved(false)} />

      <div className="sticky top-0 z-10 bg-white border-b border-gray-100 px-6 py-3 flex items-center justify-between gap-4">
        <div className="flex items-center gap-3 min-w-0">
          <button onClick={handleBack} className="flex items-center gap-1.5 text-xs text-gray-400 hover:text-gray-700 transition-colors shrink-0">
            <ArrowLeft size={14} /> Back to listings
          </button>
          <span className="text-gray-200 shrink-0">|</span>
          <div className="flex items-center gap-2 min-w-0">
            <Package size={13} className="text-gray-400 shrink-0" />
            <span className="text-xs font-medium text-gray-700 truncate max-w-xs">{form.title || sku}</span>
            {dirty && <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs bg-amber-50 text-amber-600 border border-amber-100 whitespace-nowrap shrink-0">● Unsaved</span>}
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {error && <div className="flex items-center gap-1.5 text-xs text-red-500 bg-red-50 px-3 py-1.5 rounded-lg border border-red-100"><AlertCircle size={12} />{error}</div>}
          {pushed && <div className="flex items-center gap-1.5 text-xs text-green-600 bg-green-50 px-3 py-1.5 rounded-lg border border-green-100"><Check size={12} /> Live on eBay</div>}
          {listing.item_id && (
            <a href={`https://www.ebay.com.au/itm/${listing.item_id}`} target="_blank" rel="noreferrer"
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs border border-gray-200 text-gray-500 rounded-lg hover:bg-gray-50 transition-colors">
              <ExternalLink size={12} /> View on eBay
            </a>
          )}
          <button onClick={() => setShowConfirm(true)} disabled={!dirty} className="flex items-center gap-1.5 px-4 py-1.5 text-xs font-semibold bg-red-600 hover:bg-red-700 text-white rounded-lg transition-colors disabled:opacity-40 disabled:cursor-not-allowed">
            <Send size={12} /> Push live
          </button>
        </div>
      </div>

      <div className="p-6 max-w-6xl mx-auto">
        <div className="grid grid-cols-3 gap-5">
          <div className="col-span-2 space-y-5">
            <Section title="Listing Info" icon={Pencil}>
              <div className="space-y-4">
                <Field label="Title" hint={`${form.title.length}/80 characters — pushed to eBay Inventory API on save`}>
                <Input value={form.title} onChange={v => setField('title', v)} placeholder="Product title" />
                {form.title.length > 80 && (
                    <p className="text-[10px] text-red-500 mt-1">Title exceeds eBay's 80 character limit by {form.title.length - 80}</p>
                )}
                </Field>                
                <Field label="Description" hint="Pushed to eBay Inventory API on save"><Textarea value={form.description} onChange={v => setField('description', v)} placeholder="Full product description…" rows={6} /></Field>
              </div>
            </Section>
            <Section title="Images" icon={ImagePlus}><ImageManager images={form.images} onChange={v => setField('images', v)} /></Section>
          </div>

          <div className="space-y-5">
            <Section title="Pricing & Stock" icon={Tag}>
              <div className="space-y-4">
                <Field label="Price ($)" hint="Pushed to eBay Offer API on save"><Input type="number" value={form.price} onChange={v => setField('price', v)} placeholder="0.00" /></Field>
                <Field label="Quantity" hint="Pushed to eBay Inventory API on save"><Input type="number" value={form.quantity} onChange={v => setField('quantity', v)} placeholder="0" /></Field>
                <div className="pt-1"><StockBadge stock={parseInt(form.quantity) || 0} /></div>
              </div>
            </Section>
            <div className="bg-gray-50 rounded-2xl border border-gray-100 p-4 space-y-2">
              <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider">Meta</p>
              <div className="space-y-1 text-xs text-gray-400">
                {[['Store', listing.store_name], ['SKU', listing.sku],
                  ['Origin SKU', listing.origin_sku || '—'], ['AutoDS ID', listing.autods_id || '—'],
                  ['Item ID', listing.item_id || '—'],
                  ['Last synced', listing.updated_at ? new Date(listing.updated_at).toLocaleString() : '—'],
                ].map(([k, v]) => (
                  <div key={k} className="flex justify-between gap-2"><span className="shrink-0">{k}</span><span className="font-mono text-gray-600 truncate">{v}</span></div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}