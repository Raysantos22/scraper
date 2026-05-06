async function exportProductsCsv(supabase, { supplierId, category, stock, search } = {}) {
  let allProducts = [], from = 0
  const BATCH = 1000

  // 1. Fetch all matching products (batched)
  while (true) {
    let q = supabase
      .from('products')
      .select('*')
      .range(from, from + BATCH - 1)

    if (supplierId) q = q.eq('supplier_id', supplierId)
    if (category)   q = q.eq('category', category)
    if (stock === 'in')  q = q.gt('stock', 0)
    if (stock === 'out') q = q.eq('stock', 0)
    if (stock === 'low') q = q.gt('stock', 0).lt('stock', 50)
    if (search) q = q.or(`title.ilike.%${search}%,sku.ilike.%${search}%,brand.ilike.%${search}%`)

    const { data, error } = await q
    if (error || !data?.length) break
    allProducts = [...allProducts, ...data]
    if (data.length < BATCH) break
    from += BATCH
  }

  if (!allProducts.length) return

  // 2. Fetch all variants for variation_parent products in one query
  const parentIds = allProducts
    .filter(p => p.product_type === 'variation_parent')
    .map(p => p.product_id)

  let variantsByParent = {}
  if (parentIds.length) {
    let vFrom = 0
    while (true) {
      const { data: vData, error: vErr } = await supabase
        .from('variants')
        .select('*')
        .in('product_id', parentIds)
        .range(vFrom, vFrom + BATCH - 1)

      if (vErr || !vData?.length) break
      vData.forEach(v => {
        if (!variantsByParent[v.product_id]) variantsByParent[v.product_id] = []
        variantsByParent[v.product_id].push(v)
      })
      if (vData.length < BATCH) break
      vFrom += BATCH
    }
  }

  // 3. Build flattened rows: parent row + child variant rows interleaved
  const productHeaders = Object.keys(allProducts[0])
  // Variant columns we want to include — map them into product-column space
  const variantOnlyFields = ['variant_id', 'variant_sku', 'variant_name', 'option1_name',
    'option1_value', 'option2_name', 'option2_value', 'option3_name', 'option3_value']

  // Final headers = product headers + variant-specific extras
  const extraHeaders = variantOnlyFields.filter(f => !productHeaders.includes(f))
  const allHeaders = [...productHeaders, ...extraHeaders, 'row_type', 'parent_product_id']

  const esc = v => {
    if (Array.isArray(v)) v = v.join(' | ')
    else if (typeof v === 'object' && v !== null) v = JSON.stringify(v)
    const s = v == null ? '' : String(v)
    return s.includes(',') || s.includes('"') || s.includes('\n')
      ? `"${s.replace(/"/g, '""')}"` : s
  }

  const rows = []

  for (const product of allProducts) {
    const isParent = product.product_type === 'variation_parent'

    // Parent / standalone row
    const parentRow = allHeaders.map(h => {
      if (h === 'row_type') return esc(isParent ? 'variation_parent' : 'standalone')
      if (h === 'parent_product_id') return ''
      if (h === 'images') {
        const imgs = (() => { try { return typeof product.images === 'string' ? JSON.parse(product.images) : (Array.isArray(product.images) ? product.images : []) } catch { return [] } })()
        return esc(imgs)
      }
      if (extraHeaders.includes(h)) return '' // variant-only cols blank for parent
      return esc(product[h])
    })
    rows.push(parentRow)

    // Child variant rows (indented under parent)
    if (isParent && variantsByParent[product.product_id]) {
      for (const v of variantsByParent[product.product_id]) {
        const childRow = allHeaders.map(h => {
          if (h === 'row_type') return 'variant'
          if (h === 'parent_product_id') return esc(product.product_id)
          // Prefer variant's own value; fall back to parent for shared fields
          if (h === 'product_id')    return esc(v.variant_id)
          if (h === 'sku')           return esc(v.variant_sku)
          if (h === 'title')         return esc(v.variant_name)
          if (h === 'price')         return esc(v.price)
          if (h === 'stock')         return esc(v.stock)
          if (h === 'images') {
            const vImgs = (() => { try { return typeof v.images === 'string' ? JSON.parse(v.images) : (Array.isArray(v.images) ? v.images : []) } catch { return [] } })()
            return esc(vImgs.length ? vImgs : [])
          }
          if (h === 'created_at')    return esc(v.created_at)
          if (h === 'updated_at')    return esc(v.updated_at)
          if (h === 'metadata')      return esc(v.metadata)
          // variant-specific columns
          if (h === 'variant_id')    return esc(v.variant_id)
          if (h === 'variant_sku')   return esc(v.variant_sku)
          if (h === 'variant_name')  return esc(v.variant_name)
          if (h === 'option1_name')  return esc(v.option1_name)
          if (h === 'option1_value') return esc(v.option1_value)
          if (h === 'option2_name')  return esc(v.option2_name)
          if (h === 'option2_value') return esc(v.option2_value)
          if (h === 'option3_name')  return esc(v.option3_name)
          if (h === 'option3_value') return esc(v.option3_value)
          // inherit parent values for the rest (category, brand, supplier, etc.)
          return esc(product[h] ?? '')
        })
        rows.push(childRow)
      }
    }
  }

  // 4. Build and download CSV
  const csv = [allHeaders.join(','), ...rows.map(r => r.join(','))].join('\n')
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `products_${new Date().toISOString().slice(0, 10).replace(/-/g, '')}.csv`
  document.body.appendChild(a); a.click()
  document.body.removeChild(a); URL.revokeObjectURL(url)
}