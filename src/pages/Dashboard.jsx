// C:\Users\ADMIN\scraper\src\pages\Dashboard.jsx
import { useState } from 'react'
import { LogOut, Package, ShoppingBag, RefreshCw } from 'lucide-react'
import ProductsTab from './products/ProductsTab'
import EbayTab from './ebay/EbayTab'
import SyncTab from './sync/SyncTab'

export default function Dashboard({ session, onLogout }) {
  const [activeTab, setActiveTab] = useState('products')

  function handleLogout() {
    localStorage.removeItem('scraper_session')
    onLogout()
  }

  const tabs = [
    { id: 'products', label: 'Products', icon: Package },
    { id: 'ebay',     label: 'Stores',   icon: ShoppingBag },
    { id: 'sync',     label: 'Sync',     icon: RefreshCw },
  ]

  return (
    <div className="flex h-screen bg-white font-sans text-sm overflow-hidden">

      {/* Sidebar */}
      <aside className="w-52 border-r border-gray-100 flex flex-col flex-shrink-0 py-4">
        <div className="px-4 mb-6 flex items-center gap-2">
          <div className="w-6 h-6 rounded-full border-2 border-gray-800 flex items-center justify-center">
            <div className="w-2 h-2 rounded-full bg-gray-800" />
          </div>
          <span className="font-semibold text-gray-900 text-sm">Scraper</span>
        </div>

        <div className="px-3 mb-1">
          <p className="text-xs text-gray-400 px-2 mb-1 font-medium">Inventory</p>
          {tabs.map(({ id, label, icon: Icon }) => (
            <button key={id} onClick={() => setActiveTab(id)}
              className={`flex items-center gap-2.5 w-full px-2 py-1.5 rounded-md text-sm mb-0.5 transition-colors ${
                activeTab === id
                  ? 'bg-gray-100 text-gray-900 font-medium'
                  : 'text-gray-400 hover:bg-gray-50 hover:text-gray-700'
              }`}>
              <Icon size={15} className="flex-shrink-0" />
              {label}
            </button>
          ))}
        </div>

        <div className="mt-auto px-3 border-t border-gray-100 pt-3">
          <div className="px-2 py-1.5 mb-2">
            <p className="text-xs text-gray-500 font-medium truncate">{session?.email}</p>
          </div>
          <button onClick={handleLogout}
            className="flex items-center gap-2.5 w-full px-2 py-1.5 rounded-md text-sm text-gray-400 hover:bg-red-50 hover:text-red-500 transition-colors">
            <LogOut size={15} /> Log out
          </button>
        </div>
      </aside>

      {/* Main */}
      <div className="flex-1 flex flex-col overflow-hidden">
        <header className="border-b border-gray-100 px-6 py-3 flex items-center justify-between">
          <h1 className="text-base font-semibold text-gray-900">
            {tabs.find(t => t.id === activeTab)?.label}
          </h1>
        </header>
        <main className="flex-1 overflow-auto">
          {activeTab === 'products' && <ProductsTab />}
          {activeTab === 'ebay'     && <EbayTab />}
          {activeTab === 'sync'     && <SyncTab />}
        </main>
      </div>
    </div>
  )
}