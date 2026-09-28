import { NavLink, Route, Routes, Navigate } from 'react-router-dom'
import { LayoutDashboard, ScanSearch, Inbox, Search, Bell, LifeBuoy } from 'lucide-react'
import Dashboard from './pages/Dashboard'
import NewInspection from './pages/NewInspection'
import Returns from './pages/Returns'
import Support from './pages/Support'
const nav = [['/dashboard','Dashboard',LayoutDashboard],['/inspection/new','New Inspection',ScanSearch],['/returns','Returns Queue',Inbox],['/support','Support',LifeBuoy]] as const
export default function App() {
  return <div className="flex min-h-screen flex-col md:flex-row">
    <aside className="border-b border-line bg-ink text-white md:w-56 md:border-b-0"><div className="px-4 py-4 font-semibold">AI Returns Manager</div>
      <nav className="flex gap-1 overflow-x-auto px-2 pb-2 md:flex-col">{nav.map(([to, label, Icon]) =>
        <NavLink key={to} to={to} className={({ isActive }) => `flex items-center gap-2 whitespace-nowrap rounded px-3 py-2 text-sm ${isActive ? 'bg-white/15' : 'hover:bg-white/10'}`}><Icon size={16}/>{label}</NavLink>)}</nav></aside>
    <div className="flex-1"><header className="flex items-center gap-3 border-b border-line bg-white px-4 py-2">
      <label className="flex flex-1 items-center gap-2 text-sm text-slate-500"><Search size={16}/><input aria-label="Search" placeholder="Search returns" className="w-full bg-transparent outline-none"/></label>
      <span className="hidden text-xs text-slate-500 sm:block">{new Date().toLocaleString()}</span>
      <button aria-label="Notifications"><Bell size={18}/></button><span className="text-sm">Current User</span></header>
      <main className="p-4 md:p-6"><Routes><Route path="/" element={<Navigate to="/dashboard"/>}/><Route path="/dashboard" element={<Dashboard/>}/>
        <Route path="/inspection/new" element={<NewInspection/>}/><Route path="/returns" element={<Returns/>}/><Route path="/support" element={<Support/>}/></Routes></main></div></div>
}
