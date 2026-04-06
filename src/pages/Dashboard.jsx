import { useState } from 'react'
import { supabase } from '../lib/supabase'
import {
  Home, LayoutDashboard, BarChart2, FolderOpen,
  Users, FileText, BookOpen, MoreHorizontal,
  LogOut, TrendingUp, TrendingDown, Activity
} from 'lucide-react'
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts'

const chartData = [
  { date: 'Jun 24', visitors: 320 },
  { date: 'Jun 25', visitors: 180 },
  { date: 'Jun 26', visitors: 280 },
  { date: 'Jun 27', visitors: 420 },
  { date: 'Jun 28', visitors: 310 },
  { date: 'Jun 29', visitors: 390 },
  { date: 'Jun 30', visitors: 340 },
]

const kpis = [
  { label: 'Total Revenue',    value: '$1,250.00', change: '+12.5%', up: true,  sub: 'Trending up this month',       desc: 'Visitors for the last 6 months' },
  { label: 'New Customers',    value: '1,234',     change: '-20%',   up: false, sub: 'Down 20% this period',         desc: 'Acquisition needs attention' },
  { label: 'Active Accounts',  value: '45,678',    change: '+12.5%', up: true,  sub: 'Strong user retention',        desc: 'Engagement exceed targets' },
  { label: 'Growth Rate',      value: '4.5%',      change: '+4.5%',  up: true,  sub: 'Steady performance increase',  desc: 'Meets growth projections' },
]

const topNav = [
  { id: 'home',      label: 'Home' },
  { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { id: 'lifecycle', label: 'Lifecycle', icon: Activity },
  { id: 'analytics', label: 'Analytics', icon: BarChart2 },
  { id: 'projects',  label: 'Projects',  icon: FolderOpen },
  { id: 'team',      label: 'Team',      icon: Users },
]

const docsNav = [
  { id: 'datalibrary', label: 'Data Library',   icon: BookOpen },
  { id: 'reports',     label: 'Reports',         icon: FileText },
  { id: 'more',        label: 'More',            icon: MoreHorizontal },
]

const tabs = ['Outline', 'Past Performance', 'Key Personnel', 'Focus Documents']
const tabBadges = { 'Past Performance': 3, 'Key Personnel': 2 }

export default function Dashboard({ session }) {
  const [activeNav, setActiveNav] = useState('dashboard')
  const [activeTab, setActiveTab] = useState('Outline')
  const [chartRange, setChartRange] = useState('Last 3 months')

  async function handleLogout() {
    await supabase.auth.signOut()
  }

  return (
    <div className="flex h-screen bg-white font-sans text-sm overflow-hidden">

      {/* Sidebar */}
      <aside className="w-52 border-r border-gray-100 flex flex-col flex-shrink-0 py-4">

        {/* Brand */}
        <div className="px-4 mb-6 flex items-center gap-2">
          <div className="w-6 h-6 rounded-full border-2 border-gray-800 flex items-center justify-center">
            <div className="w-2 h-2 rounded-full bg-gray-800" />
          </div>
          <span className="font-semibold text-gray-900 text-sm">Scraper</span>
        </div>

        {/* Home section */}
        <div className="px-3 mb-1">
          <p className="text-xs text-gray-400 px-2 mb-1 font-medium">Home</p>
          {topNav.map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              onClick={() => setActiveNav(id)}
              className={`flex items-center gap-2.5 w-full px-2 py-1.5 rounded-md text-sm transition-colors
                ${activeNav === id
                  ? 'bg-gray-100 text-gray-900 font-medium'
                  : 'text-gray-500 hover:bg-gray-50 hover:text-gray-700'
                }`}
            >
              {Icon && <Icon size={15} className="flex-shrink-0" />}
              {label}
            </button>
          ))}
        </div>

        {/* Documents section */}
        <div className="px-3 mt-3">
          <p className="text-xs text-gray-400 px-2 mb-1 font-medium">Documents</p>
          {docsNav.map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              onClick={() => setActiveNav(id)}
              className={`flex items-center gap-2.5 w-full px-2 py-1.5 rounded-md text-sm transition-colors
                ${activeNav === id
                  ? 'bg-gray-100 text-gray-900 font-medium'
                  : 'text-gray-500 hover:bg-gray-50 hover:text-gray-700'
                }`}
            >
              {Icon && <Icon size={15} className="flex-shrink-0" />}
              {label}
            </button>
          ))}
        </div>

        {/* Bottom */}
        <div className="mt-auto px-3 border-t border-gray-100 pt-3">
          <button
            onClick={handleLogout}
            className="flex items-center gap-2.5 w-full px-2 py-1.5 rounded-md text-sm text-gray-400 hover:bg-red-50 hover:text-red-500 transition-colors"
          >
            <LogOut size={15} />
            Log out
          </button>
        </div>
      </aside>

      {/* Main */}
      <div className="flex-1 flex flex-col overflow-hidden">

        {/* Top bar */}
        <header className="border-b border-gray-100 px-6 py-3 flex items-center justify-between">
          <h1 className="text-base font-semibold text-gray-900">Documents</h1>
          <button className="flex items-center gap-2 bg-red-600 hover:bg-red-700 text-white text-xs font-semibold px-4 py-2 rounded-lg transition-colors">
            <span className="text-base leading-none">+</span> Quick Create
          </button>
        </header>

        {/* Scrollable content */}
        <main className="flex-1 overflow-auto p-6">

          {/* KPI Cards */}
          <div className="grid grid-cols-4 gap-4 mb-6">
            {kpis.map((k, i) => (
              <div key={i} className="border border-gray-100 rounded-xl p-4 bg-white shadow-sm">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs text-gray-500">{k.label}</span>
                  <span className={`flex items-center gap-1 text-xs font-medium ${k.up ? 'text-green-600' : 'text-red-500'}`}>
                    {k.up ? <TrendingUp size={12} /> : <TrendingDown size={12} />}
                    {k.change}
                  </span>
                </div>
                <p className="text-2xl font-bold text-gray-900 mb-2">{k.value}</p>
                <p className="text-xs text-gray-700 font-medium flex items-center gap-1">
                  {k.sub}
                  {k.up ? <TrendingUp size={11} className="text-green-500" /> : <TrendingDown size={11} className="text-red-400" />}
                </p>
                <p className="text-xs text-gray-400 mt-0.5">{k.desc}</p>
              </div>
            ))}
          </div>

          {/* Chart */}
          <div className="border border-gray-100 rounded-xl p-5 bg-white shadow-sm mb-6">
            <div className="flex items-center justify-between mb-1">
              <div>
                <h2 className="text-sm font-semibold text-gray-900">Total Visitors</h2>
                <p className="text-xs text-gray-400">Total for the last 3 months</p>
              </div>
              <div className="flex gap-1">
                {['Last 3 months', 'Last 30 days', 'Last 7 days'].map(r => (
                  <button
                    key={r}
                    onClick={() => setChartRange(r)}
                    className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors
                      ${chartRange === r
                        ? 'bg-white border-gray-300 text-gray-900 shadow-sm'
                        : 'border-transparent text-gray-400 hover:text-gray-600'
                      }`}
                  >
                    {r}
                  </button>
                ))}
              </div>
            </div>

            <div className="h-52 mt-4">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={chartData}>
                  <defs>
                    <linearGradient id="colorVisitors" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#dc2626" stopOpacity={0.15} />
                      <stop offset="95%" stopColor="#dc2626" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                  <XAxis dataKey="date" tick={{ fontSize: 11, fill: '#9ca3af' }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fontSize: 11, fill: '#9ca3af' }} axisLine={false} tickLine={false} />
                  <Tooltip
                    contentStyle={{ borderRadius: '8px', border: '1px solid #e5e7eb', fontSize: '12px' }}
                    cursor={{ stroke: '#dc2626', strokeWidth: 1 }}
                  />
                  <Area type="monotone" dataKey="visitors" stroke="#dc2626" strokeWidth={2} fill="url(#colorVisitors)" dot={false} />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* Tabs */}
          <div className="border border-gray-100 rounded-xl bg-white shadow-sm">
            <div className="flex items-center justify-between px-5 py-3 border-b border-gray-100">
              <div className="flex gap-1">
                {tabs.map(tab => (
                  <button
                    key={tab}
                    onClick={() => setActiveTab(tab)}
                    className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors
                      ${activeTab === tab
                        ? 'bg-gray-100 text-gray-900'
                        : 'text-gray-400 hover:text-gray-600'
                      }`}
                  >
                    {tab}
                    {tabBadges[tab] && (
                      <span className="bg-gray-200 text-gray-600 text-xs rounded-full w-4 h-4 flex items-center justify-center">
                        {tabBadges[tab]}
                      </span>
                    )}
                  </button>
                ))}
              </div>
              <div className="flex gap-2">
                <button className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-gray-200 text-xs text-gray-500 hover:bg-gray-50 transition-colors">
                  Customize Columns ▾
                </button>
                <button className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-gray-200 text-xs text-gray-500 hover:bg-gray-50 transition-colors">
                  + Add Section
                </button>
              </div>
            </div>

            {/* Table */}
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-gray-100">
                    <th className="text-left px-5 py-3 text-xs text-gray-400 font-medium"><input type="checkbox" className="accent-red-500" /></th>
                    <th className="text-left px-5 py-3 text-xs text-gray-400 font-medium">Header</th>
                    <th className="text-left px-5 py-3 text-xs text-gray-400 font-medium">Section Type</th>
                    <th className="text-left px-5 py-3 text-xs text-gray-400 font-medium">Status</th>
                    <th className="text-left px-5 py-3 text-xs text-gray-400 font-medium">Target</th>
                    <th className="text-left px-5 py-3 text-xs text-gray-400 font-medium">Limit</th>
                    <th className="text-left px-5 py-3 text-xs text-gray-400 font-medium">Reviewer</th>
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <td colSpan={7} className="px-5 py-10 text-center text-gray-300 text-xs">
                      No data yet. Add some records to get started.
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>

        </main>
      </div>
    </div>
  )
}