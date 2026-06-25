// src/lib/exportCsv.js
import { api } from './api'

export async function exportProductsCsv({
  filterSupplier: supplierId, filterCategory: category, filterStock: stock,
  search, filterMinQty: minQty, filterMinPrice: minPrice, filterMaxPrice: maxPrice,
  filterOverride,
} = {}) {
  let allProducts = [], page = 0
  const LIMIT = 1000

  // 1. Fetch all matching products (paginated)
  while (true) {
    const params = new URLSearchParams({
      page, limit: LIMIT,
      sort: 'created_at', dir: 'desc',
      ...(filterOverride  ? { override: 'true' }          : {}),
      ...(search          ? { search }                    : {}),
      ...(category        ? { category }                  : {}),
      ...(stock           ? { stock }                     : {}),
      ...(supplierId      ? { supplier_id: supplierId }   : {}),
      ...(minQty   != null && minQty   !== '' ? { minQty }   : {}),
      ...(minPrice != null && minPrice !== '' ? { minPrice } : {}),
      ...(maxPrice != null && maxPrice !== '' ? { maxPrice } : {}),
    })

    const res = await api.get(`/api/products?${params}`)
    if (!res?.data?.length) break
    allProducts = [...allProducts, ...res.data]
    if (allProducts.length >= res.count) break
    page++
  }

  if (!allProducts.length) return

  // 2. Fetch all override SKUs
const allSkus = allProducts.map(p => p.sku)
  let overridesBySku = {}
  try {
    const result = await api.post('/api/product-overrides/bulk-get', { skus: allSkus })
    if (result && !result.error) overridesBySku = result
  } catch {}

  // 3. Fetch variants for variation_parent products
  const parentIds = allProducts.filter(p => p.product_type === 'variation_parent').map(p => p.product_id)
  let variantsByParent = {}
  await Promise.all(
    parentIds.map(async id => {
      try {
        const vs = await api.get(`/api/variants?product_id=${id}`)
        if (vs?.length) variantsByParent[id] = vs
      } catch {}
    })
  )

  // 4. Helper: safely parse images
  const safeParseImages = raw => {
    if (Array.isArray(raw)) return raw
    if (typeof raw === 'string') { try { return JSON.parse(raw) } catch { return [] } }
    return []
  }

  // 5. Merge overrides
  const mergedProducts = allProducts.map(p => {
    const ov = overridesBySku[p.sku]
    if (!ov) return p
    return {
      ...p,
      title:       ov.title       ?? p.title,
      description: ov.description ?? p.description,
      images:      safeParseImages(ov.images ?? p.images),
    }
  })

  // 6. Build headers
  const productHeaders = Object.keys(allProducts[0])
  const variantOnlyFields = [
    'variant_id', 'variant_sku', 'variant_name',
    'option1_name', 'option1_value', 'option2_name', 'option2_value',
    'option3_name', 'option3_value',
  ]
  const extraHeaders = variantOnlyFields.filter(f => !productHeaders.includes(f))
  const allHeaders = [...productHeaders, ...extraHeaders, 'has_override', 'row_type', 'parent_product_id']

  // 7. CSV escape helper
  const esc = v => {
    if (Array.isArray(v)) v = v.join(' | ')
    else if (typeof v === 'object' && v !== null) v = JSON.stringify(v)
    let s = v == null ? '' : String(v)
    s = s.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim()
    return s.includes(',') || s.includes('"') || s.includes('\n') ? `"${s.replace(/"/g, '""')}"` : s
  }

  // 8. Build rows
  const rows = []
  for (const product of mergedProducts) {
    const isParent    = product.product_type === 'variation_parent'
    const hasOverride = !!overridesBySku[product.sku]

    const parentRow = allHeaders.map(h => {
      if (h === 'row_type')          return esc(isParent ? 'variation_parent' : 'standalone')
      if (h === 'parent_product_id') return ''
      if (h === 'has_override')      return esc(hasOverride ? 'yes' : 'no')
      if (h === 'images')            return esc(safeParseImages(product.images))
      if (extraHeaders.includes(h))  return ''
      return esc(product[h])
    })
    rows.push(parentRow)

    if (isParent && variantsByParent[product.product_id]) {
      for (const v of variantsByParent[product.product_id]) {
        const childRow = allHeaders.map(h => {
          if (h === 'row_type')          return 'variant'
          if (h === 'parent_product_id') return esc(product.product_id)
          if (h === 'has_override')      return esc(hasOverride ? 'yes' : 'no')
          if (h === 'product_id')        return esc(v.variant_id)
          if (h === 'sku')               return esc(v.variant_sku)
          if (h === 'title')             return esc(v.variant_name)
          if (h === 'price')             return esc(v.price)
          if (h === 'stock')             return esc(v.stock)
          if (h === 'images')            return esc(safeParseImages(v.images).length ? safeParseImages(v.images) : safeParseImages(product.images))
          if (h === 'description')       return esc(product.description)
          if (h === 'created_at')        return esc(v.created_at)
          if (h === 'updated_at')        return esc(v.updated_at)
          if (h === 'metadata')          return esc(v.metadata)
          if (h === 'variant_id')        return esc(v.variant_id)
          if (h === 'variant_sku')       return esc(v.variant_sku)
          if (h === 'variant_name')      return esc(v.variant_name)
          if (h === 'option1_name')      return esc(v.option1_name)
          if (h === 'option1_value')     return esc(v.option1_value)
          if (h === 'option2_name')      return esc(v.option2_name)
          if (h === 'option2_value')     return esc(v.option2_value)
          if (h === 'option3_name')      return esc(v.option3_name)
          if (h === 'option3_value')     return esc(v.option3_value)
          return esc(product[h] ?? '')
        })
        rows.push(childRow)
      }
    }
  }

  // 9. Download
  const csv  = [allHeaders.join(','), ...rows.map(r => r.join(','))].join('\n')
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
  const url  = URL.createObjectURL(blob)
  const a    = document.createElement('a')
  a.href = url
  a.download = `products_${new Date().toISOString().slice(0, 10).replace(/-/g, '')}.csv`
  document.body.appendChild(a); a.click()
  document.body.removeChild(a); URL.revokeObjectURL(url)
}