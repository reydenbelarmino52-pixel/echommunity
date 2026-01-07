import React, { useState, useEffect, useMemo, useRef } from 'react';
import { storageService } from './services/storageService';
import { supabase } from './services/supabaseClient';
import { generateWorkshopDescription, generateChatResponse } from './services/geminiService';
import { User, Workshop, Role, Organization, Comment, Notification, Certificate, Announcement, Badge, ChatMessage, View, Participant } from './types';
import { Button, Input, OrgBadge } from './components/ui';
import { 
  LogOut, Plus, Trash2, Edit2, MessageSquare, 
  Calendar, Award, User as UserIcon, X, Wand2, Save, CheckCircle, Users,
  Shield, FileText, Download, UserCog, BarChart3, TrendingUp, PieChart, Search, Bell, Mail, Menu, Loader2, Heart, Send, AlertTriangle, Camera, LayoutDashboard, Home, BookOpen, ChevronRight, Clock, Star, Sparkles, Moon, Sun, Bot, Database, Settings, ShieldCheck, Briefcase, GraduationCap, Building2, Layers, Upload, ImageIcon, ArrowUpCircle, ArrowDownCircle, Building, UserMinus, ShieldAlert, History, FileUp, Zap, MousePointer2, Activity, TrendingDown, Filter, CheckSquare, Square
} from 'lucide-react';

// --- Global Branding ---
const LOGO_URL = "https://image2url.com/images/1766040794203-211c4e78-0ab5-4958-83ec-ee96be8e7ccc.png"; 

// --- Utility: Improved Relative & Friendly Time ---
const getRelativeTime = (dateString: string) => {
  const date = new Date(dateString);
  const now = new Date();
  const diff = date.getTime() - now.getTime();
  const absDiff = Math.abs(diff);
  const days = Math.floor(absDiff / (1000 * 60 * 60 * 24));

  if (days === 0) {
    const isPast = diff < 0;
    const hours = Math.floor(absDiff / (1000 * 60 * 60));
    if (hours === 0) return isPast ? 'Just now' : 'Starting soon';
    return isPast ? `${hours}h ago` : `In ${hours}h`;
  }
  if (days === 1) return diff < 0 ? 'Yesterday' : 'Tomorrow';
  if (days < 7) return diff < 0 ? `${days}d ago` : `In ${days}d`;
  
  return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
};

const formatFriendlyDate = (dateString: string) => {
  const date = new Date(dateString);
  const now = new Date();
  
  const isToday = date.toDateString() === now.toDateString();
  const tomorrow = new Date(now);
  tomorrow.setDate(tomorrow.getDate() + 1);
  const isTomorrow = date.toDateString() === tomorrow.toDateString();

  const timeOptions: Intl.DateTimeFormatOptions = { 
    hour: 'numeric', 
    minute: '2-digit', 
    hour12: true,
    timeZoneName: 'short' 
  };

  const timeString = date.toLocaleTimeString(undefined, { ...timeOptions, timeZoneName: undefined });

  if (isToday) return `Today at ${timeString}`;
  if (isTomorrow) return `Tomorrow at ${timeString}`;

  return date.toLocaleDateString(undefined, { 
    month: 'short', 
    day: 'numeric', 
    year: date.getFullYear() !== now.getFullYear() ? 'numeric' : undefined,
    hour: 'numeric',
    minute: '2-digit'
  });
};

const isExpired = (dateString: string) => {
  return new Date(dateString).getTime() < new Date().getTime();
};

const formatError = (err: any): string => {
    if (typeof err === 'string') return err;
    if (err?.message) return err.message;
    if (err?.error_description) return err.error_description;
    return JSON.stringify(err);
};

// --- Attendance Trend Chart Component ---
const AttendanceTrendChart: React.FC<{ workshops: Workshop[] }> = ({ workshops }) => {
    const [selectedOrg, setSelectedOrg] = useState<Organization | 'ALL'>('ALL');

    const chartData = useMemo(() => {
        const sorted = [...workshops].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
        const recent = sorted.slice(-8);
        if (recent.length < 2) return null;

        const maxAttendance = Math.max(...recent.map(w => w.participants.length), 5);
        const height = 200;
        const width = 600;
        const padding = 40;

        const points = recent.map((w, i) => {
            const x = padding + (i * (width - 2 * padding)) / (recent.length - 1);
            const y = height - padding - (w.participants.length / maxAttendance) * (height - 2 * padding);
            return { x, y, title: w.title, count: w.participants.length, org: w.organization };
        });

        const pathData = points.reduce((acc, p, i) => 
            i === 0 ? `M ${p.x} ${p.y}` : `${acc} L ${p.x} ${p.y}`, "");

        const areaPath = `${pathData} L ${points[points.length-1].x} ${height - padding} L ${points[0].x} ${height - padding} Z`;

        return { points, pathData, areaPath, width, height, padding, maxAttendance };
    }, [workshops]);

    if (!chartData) return (
        <div className="h-64 flex items-center justify-center border-2 border-dashed border-slate-100 dark:border-slate-800 rounded-[2rem]">
            <p className="text-slate-400 font-bold text-sm">Not enough data to generate trends.</p>
        </div>
    );

    const { points, pathData, areaPath, width, height, padding } = chartData;

    return (
        <div className="space-y-6">
            <div className="flex flex-wrap items-center justify-between gap-4">
                <div className="space-y-1">
                    <h4 className="font-black text-slate-900 dark:text-white tracking-tight">Participation Timeline</h4>
                    <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Tracking last {points.length} sessions</p>
                </div>
                <div className="flex bg-slate-100 dark:bg-slate-800 p-1 rounded-xl">
                    {(['ALL', 'CES', 'TCC', 'ICSO'] as const).map(o => (
                        <button 
                            key={o}
                            onClick={() => setSelectedOrg(o)}
                            className={`px-3 py-1.5 rounded-lg text-[9px] font-black uppercase tracking-widest transition-all ${selectedOrg === o ? 'bg-white dark:bg-slate-900 text-indigo-600 shadow-sm' : 'text-slate-400'}`}
                        >
                            {o}
                        </button>
                    ))}
                </div>
            </div>

            <div className="relative group overflow-hidden bg-slate-50/50 dark:bg-slate-900/50 rounded-[2rem] p-4 md:p-6 border border-slate-100 dark:border-slate-800">
                <svg viewBox={`0 0 ${width} ${height}`} className="w-full h-auto drop-shadow-2xl overflow-visible">
                    {[0, 0.5, 1].map(v => {
                        const y = height - padding - v * (height - 2 * padding);
                        return (
                            <line key={v} x1={padding} y1={y} x2={width - padding} y2={y} stroke="currentColor" className="text-slate-200 dark:text-slate-800" strokeWidth="1" strokeDasharray="4 4" />
                        );
                    })}
                    <path d={areaPath} fill="url(#chartGradient)" className="opacity-10 dark:opacity-20" />
                    <path d={pathData} fill="none" stroke="url(#lineGradient)" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" className="animate-in fade-in duration-1000"/>
                    {points.map((p, i) => (
                        <g key={i} className="cursor-pointer group/point">
                            <circle cx={p.x} cy={p.y} r="6" className={`${p.org === 'CES' ? 'fill-ces' : p.org === 'TCC' ? 'fill-tcc' : p.org === 'ICSO' ? 'fill-icso' : 'fill-slate-400'} stroke-white dark:stroke-slate-900 stroke-2 hover:r-8 transition-all`}/>
                            <g className="opacity-0 group-hover/point:opacity-100 transition-opacity">
                                <rect x={p.x - 30} y={p.y - 35} width="60" height="25" rx="6" className="fill-slate-900" />
                                <text x={p.x} y={p.y - 18} textAnchor="middle" className="fill-white font-black text-[10px]">{p.count} pts</text>
                            </g>
                        </g>
                    ))}
                    <defs>
                        <linearGradient id="chartGradient" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="0%" stopColor="#4f46e5" />
                            <stop offset="100%" stopColor="#4f46e5" stopOpacity="0" />
                        </linearGradient>
                        <linearGradient id="lineGradient" x1="0" y1="0" x2="1" y2="0">
                            <stop offset="0%" stopColor="#6366f1" />
                            <stop offset="100%" stopColor="#10b981" />
                        </linearGradient>
                    </defs>
                </svg>
                <div className="flex justify-between px-[40px] mt-4">
                    {points.map((p, i) => (
                        <div key={i} className="text-center w-0 overflow-visible relative">
                            <span className="absolute left-1/2 -translate-x-1/2 text-[8px] font-black text-slate-400 uppercase tracking-tighter whitespace-nowrap rotate-45 origin-left mt-2">
                                {p.title.split(' ')[0]}
                            </span>
                        </div>
                    ))}
                </div>
            </div>
        </div>
    );
};

// --- Auth Components ---

const AuthScreen: React.FC<{
    onLogin: () => void;
    view: View;
    onSwitchView: (v: View) => void;
}> = ({ onLogin, view, onSwitchView }) => {
    const [loading, setLoading] = useState(false);
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [name, setName] = useState('');

    const handleAuth = async (e: React.FormEvent) => {
        e.preventDefault();
        setLoading(true);
        try {
            if (view === 'LOGIN') {
                const { error } = await supabase.auth.signInWithPassword({ email, password });
                if (error) throw error;
            } else {
                // UPDATED: Pass 'name' in options so the SQL Trigger can use it
                const { error: signUpError } = await supabase.auth.signUp({ 
                    email, 
                    password,
                    options: {
                        data: {
                            name: name // This sends the name to the database trigger
                        }
                    }
                });
                
                if (signUpError) throw signUpError;
                
                // We removed the manual 'profiles.insert' code here because 
                // the Database Trigger now does it automatically.
            }
            onLogin();
        } catch (error: any) {
            alert(formatError(error));
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="min-h-screen bg-slate-50 dark:bg-slate-950 flex items-center justify-center p-4">
            <div className="w-full max-w-md bg-white dark:bg-slate-900 rounded-[3rem] p-8 md:p-12 shadow-2xl border border-slate-100 dark:border-slate-800 text-center animate-in fade-in zoom-in-95 duration-500">
                <div className="w-20 h-20 bg-indigo-600 rounded-[2rem] flex items-center justify-center shadow-xl mx-auto mb-8">
                    <img src={LOGO_URL} alt="" className="w-12 h-12 object-contain" />
                </div>
                <h1 className="text-4xl font-black tracking-tighter mb-2">{view === 'LOGIN' ? 'Welcome Back' : 'Create Account'}</h1>
                <p className="text-slate-500 font-bold text-sm mb-10">Access your student hub and certificates.</p>
                <form onSubmit={handleAuth} className="space-y-4 text-left">
                    {view === 'SIGNUP' && (
                        <Input label="Full Name" placeholder="First Last Name" value={name} onChange={e => setName(e.target.value)} required />
                    )}
                    <Input label="Email Address" type="email" placeholder="user@gmail.com" value={email} onChange={e => setEmail(e.target.value)} required />
                    <Input label="Password" type="password" placeholder="••••••••" value={password} onChange={e => setPassword(e.target.value)} required />
                    <Button type="submit" size="lg" className="w-full rounded-2xl h-14 font-black shadow-xl shadow-indigo-600/20 mt-4" isLoading={loading}>
                        {view === 'LOGIN' ? 'Sign In' : 'Sign Up'}
                    </Button>
                </form>
                <p className="mt-8 text-sm font-bold text-slate-400">
                    {view === 'LOGIN' ? "New here?" : "Already have an account?"}{' '}
                    <button onClick={() => onSwitchView(view === 'LOGIN' ? 'SIGNUP' : 'LOGIN')} className="text-indigo-600 hover:underline">
                        {view === 'LOGIN' ? 'Join Now' : 'Sign In'}
                    </button>
                </p>
            </div>
        </div>
    );
};

const Navbar: React.FC<{
    user: User | null;
    onLogout: () => void;
    onNavigate: (v: View) => void;
    notifications: Notification[];
    currentView: View;
    theme: 'light' | 'dark';
    onToggleTheme: () => void;
    onMarkAllRead: () => void;
}> = ({ user, onLogout, onNavigate, notifications, currentView, theme, onToggleTheme, onMarkAllRead }) => {
    const [showNotifications, setShowNotifications] = useState(false);
    const unreadCount = notifications.filter(n => !n.read).length;

    const navItems = [
        { view: 'DASHBOARD' as View, icon: <Home className="w-4 h-4" />, label: 'Feed' },
        { view: 'WORKSHOPS' as View, icon: <BookOpen className="w-4 h-4" />, label: 'Sessions' },
        { view: 'PROFILE' as View, icon: <UserIcon className="w-4 h-4" />, label: 'Me' },
    ];

    if (user?.role === 'ADMIN' || user?.role === 'OFFICER') {
        navItems.splice(2, 0, { view: 'ORG_DASHBOARD' as View, icon: <Building2 className="w-4 h-4" />, label: 'Hub' });
    }
    
    if (user?.role === 'ADMIN') {
        navItems.push({ view: 'ADMIN_USERS' as View, icon: <Users className="w-4 h-4" />, label: 'Directory' });
        navItems.push({ view: 'ANALYTICS' as View, icon: <BarChart3 className="w-4 h-4" />, label: 'Intelligence' });
    }

    return (
        <nav className="sticky top-0 z-[80] bg-white/80 dark:bg-slate-900/80 backdrop-blur-xl border-b border-slate-200 dark:border-slate-800 transition-colors">
            <div className="max-w-7xl mx-auto px-4 md:px-6 h-16 md:h-20 flex items-center justify-between">
                <div className="flex items-center gap-8">
                    <div className="flex items-center gap-3 cursor-pointer group" onClick={() => onNavigate('DASHBOARD')}>
                        <div className="w-8 h-8 md:w-10 md:h-10 bg-indigo-600 rounded-xl flex items-center justify-center shadow-lg group-hover:scale-110 transition-transform">
                            <img src={LOGO_URL} alt="" className="w-5 h-5 md:w-7 md:h-7 object-contain" />
                        </div>
                        <span className="font-black text-sm md:text-xl tracking-tighter hidden sm:block">ECHO-MMUNITY</span>
                    </div>
                    <div className="hidden md:flex items-center gap-1">
                        {navItems.map(item => (
                            <button 
                                key={item.view}
                                onClick={() => onNavigate(item.view)}
                                className={`px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all flex items-center gap-2 ${currentView === item.view ? 'bg-indigo-50 dark:bg-indigo-900/30 text-indigo-600' : 'text-slate-500 hover:bg-slate-50 dark:hover:bg-slate-800'}`}
                            >
                                {item.icon} {item.label}
                            </button>
                        ))}
                    </div>
                </div>
                <div className="flex items-center gap-2 md:gap-4">
                    <button onClick={onToggleTheme} className="p-2 md:p-2.5 rounded-xl hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-500 transition-colors">
                        {theme === 'light' ? <Moon className="w-5 h-5" /> : <Sun className="w-5 h-5" />}
                    </button>
                    <div className="relative">
                        <button onClick={() => setShowNotifications(!showNotifications)} className="p-2 md:p-2.5 rounded-xl hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-500 transition-colors relative">
                            <Bell className="w-5 h-5" />
                            {unreadCount > 0 && <span className="absolute top-2 right-2 w-2 h-2 bg-rose-500 rounded-full ring-2 ring-white dark:ring-slate-900"></span>}
                        </button>
                        {showNotifications && (
                            <NotificationDropdown 
                                notifications={notifications} 
                                onClose={() => setShowNotifications(false)} 
                                onMarkAllRead={onMarkAllRead} 
                            />
                        )}
                    </div>
                    <div className="h-8 w-[1px] bg-slate-200 dark:bg-slate-800 mx-1 hidden md:block"></div>
                    <button onClick={onLogout} className="p-2 md:p-2.5 rounded-xl hover:bg-rose-50 dark:hover:bg-rose-900/20 text-slate-400 hover:text-rose-500 transition-colors" title="Sign Out">
                        <LogOut className="w-5 h-5" />
                    </button>
                </div>
            </div>
        </nav>
    );
};

// --- Shared Components ---

const Modal: React.FC<{ isOpen: boolean; onClose: () => void; title: string; children: React.ReactNode; footer?: React.ReactNode }> = ({ isOpen, onClose, title, children, footer }) => {
    if (!isOpen) return null;
    return (
        <div className="fixed inset-0 z-[100] flex items-end md:items-center justify-center p-0 md:p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-200">
            <div className="bg-white dark:bg-slate-900 rounded-t-[2.5rem] md:rounded-[2rem] shadow-2xl w-full max-w-2xl overflow-hidden flex flex-col max-h-[95vh] md:max-h-[90vh] border-t md:border border-slate-200 dark:border-slate-800 animate-in slide-in-from-bottom-full md:slide-in-from-bottom-0 md:zoom-in-95 duration-300">
                <div className="px-6 py-5 border-b border-slate-100 dark:border-slate-800 flex justify-between items-center sticky top-0 bg-white/80 dark:bg-slate-900/80 backdrop-blur-md z-10">
                    <h3 className="text-lg md:text-xl font-black text-slate-900 dark:text-slate-100 tracking-tight">{title}</h3>
                    <button onClick={onClose} className="p-2 rounded-xl hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors">
                        <X className="w-5 h-5 text-slate-400" />
                    </button>
                </div>
                <div className="p-6 md:p-8 overflow-y-auto flex-1 pb-10 md:pb-8">{children}</div>
                {footer && <div className="px-6 py-5 bg-slate-50 dark:bg-slate-800/50 flex flex-col sm:flex-row justify-end gap-3 border-t border-slate-100 dark:border-slate-800 pb-safe-bottom">{footer}</div>}
            </div>
        </div>
    );
};

const NotificationDropdown: React.FC<{
    notifications: Notification[];
    onClose: () => void;
    onMarkAllRead: () => void;
}> = ({ notifications, onClose, onMarkAllRead }) => {
    const ref = useRef<HTMLDivElement>(null);
    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (ref.current && !ref.current.contains(event.target as Node)) onClose();
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, [onClose]);

    const sorted = [...notifications].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

    return (
        <div ref={ref} className="fixed md:absolute top-20 md:top-auto md:mt-2 left-4 right-4 md:left-auto md:right-0 md:w-96 bg-white dark:bg-slate-900 rounded-[2rem] md:rounded-2xl shadow-2xl border border-slate-200 dark:border-slate-800 z-[100] overflow-hidden animate-in slide-in-from-top-4 duration-300 ring-1 ring-black/5">
            <div className="px-6 py-4 border-b border-slate-100 dark:border-slate-800 flex justify-between items-center bg-slate-50 dark:bg-slate-800/50">
                <h3 className="font-black text-xs md:text-sm text-slate-900 dark:text-slate-100 uppercase tracking-widest">Notifications</h3>
                {notifications.some(n => !n.read) && (
                    <button onClick={() => { onMarkAllRead(); onClose(); }} className="text-[10px] font-black uppercase text-indigo-600 dark:text-indigo-400 hover:text-indigo-700 tracking-widest">Mark All Read</button>
                )}
            </div>
            <div className="max-h-[70vh] md:max-h-[30rem] overflow-y-auto">
                {sorted.length === 0 ? (
                    <div className="p-10 text-center text-slate-400 text-sm">
                        <Mail className="w-10 h-10 mx-auto mb-3 opacity-20" />
                        <p className="font-bold tracking-tight">Inbox is empty</p>
                    </div>
                ) : (
                    sorted.map(n => (
                        <div key={n.id} className={`p-5 border-b border-slate-50 dark:border-slate-800 last:border-0 hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors ${!n.read ? 'bg-indigo-50/30 dark:bg-indigo-900/10' : ''}`}>
                            <div className="flex justify-between items-start mb-1.5">
                                <span className={`text-[9px] font-black px-2 py-0.5 rounded uppercase tracking-wider ${n.type === 'SUCCESS' ? 'bg-emerald-100 text-emerald-800' : n.type === 'WARNING' ? 'bg-rose-100 text-rose-800' : 'bg-indigo-100 text-indigo-800'}`}>{n.type}</span>
                                <span className="text-[9px] text-slate-400 font-bold uppercase">{getRelativeTime(n.createdAt)}</span>
                            </div>
                            <h4 className="text-sm font-black text-slate-900 dark:text-slate-100 tracking-tight leading-snug">{n.title}</h4>
                            <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 leading-relaxed">{n.message}</p>
                        </div>
                    ))
                )}
            </div>
        </div>
    );
};

const AnnouncementCard: React.FC<{ 
    announcement: Announcement; 
    user: User | null; 
    onLike: (id: string, isLiked: boolean) => void;
    onComment: (id: string, text: string) => void;
    onDelete?: (id: string) => void;
    onEdit?: (announcement: Announcement) => void;
}> = ({ announcement, user, onLike, onComment, onDelete, onEdit }) => {
    const [showComments, setShowComments] = useState(false);
    const isLiked = user ? announcement.likes.includes(user.id) : false;
    const canDelete = user?.role === 'ADMIN' || (user?.role === 'OFFICER' && user?.officerOrg === announcement.organization) || user?.id === announcement.authorId;
    const canEdit = user?.id === announcement.authorId || user?.role === 'ADMIN';

    return (
        <div className="bg-white dark:bg-slate-900 rounded-[2rem] md:rounded-[3rem] border border-slate-100 dark:border-slate-800 shadow-sm overflow-hidden transition-all duration-300">
            <div className="p-6 md:p-10">
                <div className="flex items-center justify-between mb-5 md:mb-6">
                    <div className="flex items-center space-x-3 md:space-x-4">
                        <div className="w-10 h-10 md:w-12 md:h-12 rounded-xl md:rounded-2xl bg-slate-100 dark:bg-slate-800 flex items-center justify-center overflow-hidden border border-slate-200 dark:border-slate-700 shadow-sm">
                            {announcement.authorAvatar ? <img src={announcement.authorAvatar} alt="" className="w-full h-full object-cover" /> : <UserIcon className="w-5 h-5 md:w-6 md:h-6 text-slate-300" />}
                        </div>
                        <div className="min-w-0">
                            <div className="flex items-center gap-1.5 flex-wrap">
                                <p className="font-black text-slate-900 dark:text-white leading-none text-sm md:text-base tracking-tight truncate">{announcement.authorName}</p>
                                <OrgBadge org={announcement.organization} />
                            </div>
                            <p className="text-[9px] text-slate-400 font-bold uppercase tracking-widest mt-1">{getRelativeTime(announcement.createdAt)}</p>
                        </div>
                    </div>
                    <div className="flex items-center gap-0.5 md:gap-1">
                        {canEdit && onEdit && (
                            <button onClick={() => onEdit(announcement)} className="p-2 rounded-xl hover:bg-indigo-50 dark:hover:bg-indigo-900/20 text-slate-300 hover:text-indigo-600 transition-colors">
                                <Edit2 className="w-4 h-4" />
                            </button>
                        )}
                        {canDelete && onDelete && (
                            <button onClick={() => onDelete(announcement.id)} className="p-2 rounded-xl hover:bg-red-50 dark:hover:bg-red-900/20 text-slate-300 hover:text-red-500 transition-colors">
                                <Trash2 className="w-4 h-4" />
                            </button>
                        )}
                    </div>
                </div>
                <h3 className="text-xl md:text-3xl font-black text-slate-900 dark:text-white mb-3 md:mb-4 tracking-tighter leading-tight">{announcement.title}</h3>
                <p className="text-slate-600 dark:text-slate-400 text-sm md:text-lg leading-relaxed mb-6 md:mb-8 font-medium">{announcement.content}</p>
                {announcement.imageUrl && (
                    <div className="rounded-2xl md:rounded-[2rem] overflow-hidden mb-6 md:mb-8 border border-slate-100 dark:border-slate-800 shadow-lg">
                        <img src={announcement.imageUrl} alt="" className="w-full h-auto object-cover max-h-[30rem]" />
                    </div>
                )}
                <div className="flex items-center space-x-5 md:space-x-6 border-t border-slate-50 dark:border-slate-800 pt-5 md:pt-8">
                    <button onClick={() => onLike(announcement.id, isLiked)} className={`flex items-center space-x-2 text-[10px] font-black uppercase tracking-widest transition-colors ${isLiked ? 'text-rose-500' : 'text-slate-400 hover:text-rose-500'}`}>
                        <Heart className={`w-4 h-4 md:w-5 md:h-5 ${isLiked ? 'fill-current' : ''}`} />
                        <span>{announcement.likes.length}</span>
                    </button>
                    <button onClick={() => setShowComments(!showComments)} className="flex items-center space-x-2 text-[10px] font-black text-slate-400 hover:text-indigo-600 uppercase tracking-widest transition-colors">
                        <MessageSquare className="w-4 h-4 md:w-5 md:h-5" />
                        <span>{announcement.comments.length}</span>
                    </button>
                </div>
            </div>
            {showComments && (
                <div className="bg-slate-50 dark:bg-slate-800/30 p-5 md:p-10 border-t border-slate-100 dark:border-slate-800 animate-in slide-in-from-top-4">
                    <div className="space-y-4 md:space-y-6 mb-6 md:mb-8">
                        {announcement.comments.length === 0 ? (
                            <p className="text-center text-slate-400 text-[10px] font-black uppercase tracking-[0.2em] py-4">Be the first to comment</p>
                        ) : (
                            announcement.comments.map(c => (
                                <div key={c.id} className="flex space-x-3 md:space-x-4">
                                    <div className="w-8 h-8 md:w-10 md:h-10 rounded-lg md:rounded-xl bg-slate-200 dark:bg-slate-700 flex-shrink-0 overflow-hidden shadow-sm">
                                        {c.userAvatar && <img src={c.userAvatar} className="w-full h-full object-cover" />}
                                    </div>
                                    <div className="flex-1 bg-white dark:bg-slate-900 p-3 md:p-4 rounded-2xl rounded-tl-none border border-slate-100 dark:border-slate-800 shadow-sm">
                                        <div className="flex justify-between items-center mb-1">
                                            <p className="text-[9px] font-black uppercase text-indigo-600 tracking-wider">{c.userName}</p>
                                            <span className="text-[8px] text-slate-400 font-bold">{getRelativeTime(c.createdAt)}</span>
                                        </div>
                                        <p className="text-slate-700 dark:text-slate-300 text-xs md:text-sm leading-relaxed font-medium">{c.content}</p>
                                    </div>
                                </div>
                            ))
                        )}
                    </div>
                    <form onSubmit={(e) => {
                        e.preventDefault();
                        const val = (e.target as any).comment.value;
                        if (val) { onComment(announcement.id, val); (e.target as any).reset(); }
                    }} className="flex gap-2 md:gap-3">
                        <Input name="comment" placeholder="Add your thoughts..." className="rounded-xl md:rounded-2xl h-11 md:h-12 text-xs md:text-sm bg-white dark:bg-slate-900 border-none shadow-inner" />
                        <button type="submit" className="bg-indigo-600 text-white px-4 md:px-5 rounded-xl md:rounded-2xl hover:bg-indigo-700 transition-all shadow-lg shadow-indigo-600/20 flex items-center justify-center flex-shrink-0">
                            <Send className="w-4 h-4 md:w-5 md:h-5" />
                        </button>
                    </form>
                </div>
            )}
        </div>
    );
};

const WorkshopCard: React.FC<{ 
    workshop: Workshop; 
    onClick: (id: string) => void;
    onEdit?: (workshop: Workshop) => void;
    onDelete?: (id: string) => void;
}> = ({ workshop, onClick, onEdit, onDelete }) => {
    const expired = isExpired(workshop.date);
    
    return (
        <div onClick={() => onClick(workshop.id)} className={`bg-white dark:bg-slate-900 rounded-[2rem] md:rounded-[2.5rem] border border-slate-200 dark:border-slate-800 overflow-hidden shadow-sm hover:shadow-xl active:scale-[0.98] md:hover:active:scale-[1] transition-all duration-300 cursor-pointer group relative ${expired ? 'opacity-80' : ''}`}>
            {expired && (
                <div className="absolute top-4 left-4 z-10 bg-slate-900/80 backdrop-blur-md text-white px-3 py-1 rounded-full text-[8px] font-black uppercase tracking-widest flex items-center gap-1.5 shadow-xl border border-white/10">
                    <History className="w-3 h-3" /> Session Ended
                </div>
            )}
            <div className="absolute top-4 right-4 z-10 flex gap-1.5 opacity-100 md:opacity-0 md:group-hover:opacity-100 transition-opacity">
                {onEdit && (
                    <button onClick={(e) => { e.stopPropagation(); onEdit(workshop); }} className="p-2 rounded-xl bg-white/90 dark:bg-slate-800/90 text-indigo-600 shadow-lg border border-slate-200 dark:border-slate-700 active:scale-90">
                        <Edit2 className="w-4 h-4" />
                    </button>
                )}
                {onDelete && (
                    <button onClick={(e) => { e.stopPropagation(); onDelete(workshop.id); }} className="p-2 rounded-xl bg-white/90 dark:bg-slate-800/90 text-rose-600 shadow-lg border border-slate-200 dark:border-slate-700 active:scale-90">
                        <Trash2 className="w-4 h-4" />
                    </button>
                )}
            </div>
            <div className="h-40 md:h-60 bg-slate-100 dark:bg-slate-800 relative">
                {workshop.bannerUrl ? (
                    <img src={workshop.bannerUrl} alt={workshop.title} className={`w-full h-full object-cover group-hover:scale-105 transition-transform duration-700 ${expired ? 'grayscale' : ''}`} />
                ) : (
                    <div className="w-full h-full flex items-center justify-center"><Calendar className="w-10 md:w-12 text-slate-300 opacity-50" /></div>
                )}
                <div className="absolute top-6 right-6 md:opacity-100 opacity-0 group-hover:opacity-100 transition-opacity"><OrgBadge org={workshop.organization} /></div>
                <div className="absolute inset-0 bg-gradient-to-t from-black/60 to-transparent opacity-0 md:group-hover:opacity-100 transition-opacity duration-300 flex items-end p-6 md:p-8">
                    <span className="text-white font-black text-[10px] uppercase tracking-[0.2em]">View Highlights</span>
                </div>
            </div>
            <div className="p-6 md:p-10">
                <div className="flex items-center gap-2 mb-2 md:hidden">
                    <OrgBadge org={workshop.organization} />
                </div>
                <h3 className="text-lg md:text-2xl font-black mb-2 md:mb-3 line-clamp-1 group-hover:text-indigo-600 transition-colors tracking-tight leading-tight">{workshop.title}</h3>
                <p className="text-slate-500 dark:text-slate-400 text-xs md:text-sm line-clamp-2 mb-6 md:mb-8 h-8 md:h-10 leading-relaxed font-medium">{workshop.description}</p>
                <div className="flex items-center justify-between text-[9px] md:text-[10px] font-black text-slate-400 uppercase tracking-widest border-t border-slate-50 dark:border-slate-800 pt-5 md:pt-6">
                    <span className="flex items-center"><Clock className={`w-3.5 h-3.5 md:w-4 md:h-4 mr-1.5 md:mr-2 ${expired ? 'text-slate-400' : 'text-indigo-500'}`} /> {formatFriendlyDate(workshop.date)}</span>
                    <span className="flex items-center"><Users className="w-3.5 h-3.5 md:w-4 md:h-4 mr-1.5 md:mr-2 text-emerald-500" /> {workshop.participants.length}</span>
                </div>
            </div>
        </div>
    );
};

const MobileBottomNav: React.FC<{
    user: User | null;
    currentView: View;
    onNavigate: (v: View) => void;
}> = ({ user, currentView, onNavigate }) => {
    if (!user) return null;
    const items = [
        { view: 'DASHBOARD' as View, icon: <Home className="w-5 h-5" />, label: 'Feed' },
        { view: 'WORKSHOPS' as View, icon: <BookOpen className="w-5 h-5" />, label: 'Sessions' },
        { view: 'PROFILE' as View, icon: <UserIcon className="w-5 h-5" />, label: 'Me' }
    ];
    if (user.role === 'ADMIN' || user.role === 'OFFICER') {
        items.splice(2, 0, { view: 'ORG_DASHBOARD' as View, icon: <Building2 className="w-5 h-5" />, label: 'Hub' });
    }
    return (
        <div className="md:hidden fixed bottom-0 left-0 right-0 z-[60] bg-white/90 dark:bg-slate-900/90 backdrop-blur-xl border-t border-slate-200 dark:border-slate-800 px-4 pt-3 pb-safe-bottom shadow-[0_-10px_20px_rgba(0,0,0,0.05)]">
            <div className="flex items-center justify-around">
                {items.map(item => (
                    <button 
                        key={item.view} 
                        onClick={() => onNavigate(item.view)}
                        className={`flex flex-col items-center gap-1 min-w-[3.5rem] py-2 transition-all ${currentView === item.view ? 'text-indigo-600 scale-110' : 'text-slate-400 hover:text-slate-600 dark:hover:text-slate-200'}`}
                    >
                        <div className={`p-1.5 rounded-xl transition-colors ${currentView === item.view ? 'bg-indigo-50 dark:bg-indigo-900/20' : ''}`}>
                            {item.icon}
                        </div>
                        <span className="text-[9px] font-black uppercase tracking-widest">{item.label}</span>
                    </button>
                ))}
            </div>
        </div>
    );
};

// --- Main App ---

export default function App() {
  const [user, setUser] = useState<User | null>(null);
  const [currentView, setCurrentView] = useState<View>('LOGIN');
  const [workshops, setWorkshops] = useState<Workshop[]>([]);
  const [announcements, setAnnouncements] = useState<Announcement[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const [orgFilter, setOrgFilter] = useState<Organization | 'ALL'>('ALL');
  const [activeOrg, setActiveOrg] = useState<Organization>('GENERAL');
  const [searchQuery, setSearchQuery] = useState('');
  const [userSearchQuery, setUserSearchQuery] = useState('');
  const [selectedWorkshopId, setSelectedWorkshopId] = useState<string | null>(null);
  const [loadingInitial, setLoadingInitial] = useState(true);
  const [theme, setTheme] = useState<'light' | 'dark'>(() => (localStorage.getItem('theme') as any) || 'light');
  const [dataTick, setDataTick] = useState(0);
  const [isCreatingPost, setIsCreatingPost] = useState(false);
  const [editingPost, setEditingPost] = useState<Announcement | null>(null);
  const [isCreatingWorkshop, setIsCreatingWorkshop] = useState(false);
  const [editingWorkshop, setEditingWorkshop] = useState<Workshop | null>(null);
  const [isEditingProfile, setIsEditingProfile] = useState(false);
  const [isSavingWorkshop, setIsSavingWorkshop] = useState(false);
  const [isSavingPost, setIsSavingPost] = useState(false);
  
  // Selection state for bulk actions
  const [selectedParticipants, setSelectedParticipants] = useState<Set<string>>(new Set());
  const [isBulkIssuing, setIsBulkIssuing] = useState(false);

  const analyticsData = useMemo(() => {
    const orgs: Organization[] = ['CES', 'TCC', 'ICSO', 'GENERAL'];
    const perOrg = orgs.map(org => {
      const orgW = workshops.filter(w => w.organization === org);
      const orgA = announcements.filter(a => a.organization === org);
      const totalParts = orgW.reduce((acc, w) => acc + w.participants.length, 0);
      const engagementScore = (orgW.length * 5) + (orgA.length * 2) + (totalParts * 1);
      return { name: org, workshops: orgW.length, announcements: orgA.length, participants: totalParts, score: engagementScore };
    });
    const mostActive = [...perOrg].sort((a, b) => b.score - a.score)[0];
    const totalAwards = users.reduce((acc, u) => acc + u.badges.length + u.certificates.length, 0);
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    const newMembersCount = users.filter(u => new Date(u.createdAt) > thirtyDaysAgo).length;
    return { perOrg, mostActive, totalAwards, newMembers: newMembersCount };
  }, [workshops, announcements, users]);

  const filteredUsers = useMemo(() => {
    return users.filter(u => u.name.toLowerCase().includes(userSearchQuery.toLowerCase()) || u.email.toLowerCase().includes(userSearchQuery.toLowerCase()));
  }, [users, userSearchQuery]);

  const orgStats = useMemo(() => {
    const orgWorkshops = workshops.filter(w => w.organization === activeOrg);
    const orgAnnouncements = announcements.filter(a => a.organization === activeOrg);
    const totalParticipants = orgWorkshops.reduce((acc, w) => acc + w.participants.length, 0);
    const avgAttendance = orgWorkshops.length > 0 ? (totalParticipants / orgWorkshops.length).toFixed(1) : 0;
    return { workshopCount: orgWorkshops.length, postCount: orgAnnouncements.length, participantTotal: totalParticipants, avgAttendance };
  }, [workshops, announcements, activeOrg]);

  useEffect(() => {
    const root = window.document.documentElement;
    if (theme === 'dark') root.classList.add('dark');
    else root.classList.remove('dark');
    localStorage.setItem('theme', theme);
  }, [theme]);

  const loadAll = async () => {
    const [wData, aData, uData, currUser] = await Promise.all([
        storageService.getWorkshops(),
        storageService.getAnnouncements(orgFilter === 'ALL' ? undefined : orgFilter),
        user?.role === 'ADMIN' ? storageService.getUsers() : Promise.resolve([]),
        storageService.getCurrentUser()
    ]);
    setWorkshops(wData);
    setAnnouncements(aData);
    if (uData.length > 0) setUsers(uData);
    if (currUser) {
        setUser(currUser);
        if (currUser.role === 'OFFICER' && currUser.officerOrg) {
            setActiveOrg(currUser.officerOrg);
        }
    }
  };

  useEffect(() => {
    const init = async () => {
        setLoadingInitial(true);
        const currentUser = await storageService.getCurrentUser();
        if (currentUser) { 
            setUser(currentUser); 
            setCurrentView('DASHBOARD'); 
            if (currentUser.role === 'OFFICER' && currentUser.officerOrg) {
                setActiveOrg(currentUser.officerOrg);
            }
            await loadAll(); 
        }
        else { setCurrentView('LOGIN'); }
        setLoadingInitial(false);
    };
    init();
  }, []);

  useEffect(() => {
    if (['DASHBOARD', 'WORKSHOPS', 'WORKSHOP_DETAIL', 'ADMIN_USERS', 'ANALYTICS', 'PROFILE', 'ORG_DASHBOARD'].includes(currentView)) {
        loadAll();
    }
  }, [dataTick, currentView, orgFilter]);

  const handleLike = async (id: string, liked: boolean) => {
    if (!user) return;
    try {
        await storageService.toggleAnnouncementLike(id, user.id, liked);
        setDataTick(t => t + 1);
    } catch (e: any) {
        alert("Operation failed: " + formatError(e));
    }
  };

  const handleComment = async (id: string, content: string) => {
    if (!user) return;
    try {
        await storageService.addAnnouncementComment(id, user.id, content);
        setDataTick(t => t + 1);
    } catch (e: any) {
        alert("Operation failed: " + formatError(e));
    }
  };

  const handleDeleteAnnouncement = async (id: string) => {
    if (!confirm("Are you sure you want to remove this update?")) return;
    try {
        await storageService.deleteAnnouncement(id);
        setDataTick(t => t + 1);
    } catch (e: any) {
        alert("Delete failed: " + formatError(e));
    }
  };

  const handleDeleteWorkshop = async (id: string) => {
    if (!confirm("Are you sure you want to delete this workshop? All participant records will be lost.")) return;
    try {
        await storageService.deleteWorkshop(id);
        if (selectedWorkshopId === id) {
            setSelectedWorkshopId(null);
            setCurrentView('WORKSHOPS');
        }
        setDataTick(t => t + 1);
    } catch (e: any) {
        alert("Delete failed: " + formatError(e));
    }
  };

  const handleMarkAllRead = async () => {
    if (!user) return;
    try {
        await storageService.markAllNotificationsRead(user.id);
        setDataTick(t => t + 1);
    } catch (e: any) {
        alert("Failed to update: " + formatError(e));
    }
  };

  const handleJoinWorkshop = async (wId: string) => {
    if (!user) return;
    const w = workshops.find(item => item.id === wId);
    if (!w) return;
    if (isExpired(w.date)) {
        alert("This workshop has already ended and is no longer accepting registrations.");
        return;
    }
    if (w.participants.some(p => p.id === user.id)) {
        alert("You are already registered for this session!");
        return;
    }
    try {
        await storageService.joinWorkshop(wId, user.id);
        await storageService.sendNotification(user.id, "Registered!", `You've joined "${w?.title}". See you there!`, 'SUCCESS');
        alert("Successfully registered!");
        setDataTick(t => t + 1);
    } catch (e: any) {
        alert("Registration failed: " + formatError(e));
    }
  };

  const handleCreateOrUpdatePost = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;
    setIsSavingPost(true);
    try {
        const form = e.target as HTMLFormElement;
        const formData = new FormData(form);
        const title = formData.get('title') as string;
        const content = formData.get('content') as string;
        const organization = (formData.get('org') as Organization) || 'GENERAL';
        const imageFile = formData.get('image') as File;

        let imageUrl = editingPost?.imageUrl;
        if (imageFile && imageFile.size > 0) {
            const uploadedUrl = await storageService.uploadImage(imageFile);
            if (uploadedUrl) imageUrl = uploadedUrl;
        }

        if (user.role === 'OFFICER' && organization !== user.officerOrg) {
            throw new Error(`You can only post updates for ${user.officerOrg}`);
        }

        if (editingPost) {
            await storageService.updateAnnouncement(editingPost.id, { 
                title, 
                content, 
                organization,
                imageUrl
            });
        } else {
            await storageService.createAnnouncement({ 
                title, 
                content, 
                organization, 
                imageUrl,
                authorId: user.id, 
                authorRole: user.role 
            });
        }
        
        setIsCreatingPost(false);
        setEditingPost(null);
        setDataTick(t => t + 1);
    } catch (error: any) {
        alert(`Failed to save: ${formatError(error)}`);
    } finally {
        setIsSavingPost(false);
    }
  };

  const handlePromoteUser = async (targetUser: User) => {
    if (user?.role !== 'ADMIN') return;
    let nextRole: Role = targetUser.role;
    let nextOrg = targetUser.officerOrg;

    if (targetUser.role === 'MEMBER') {
        nextRole = 'OFFICER';
        nextOrg = 'GENERAL'; 
    } else if (targetUser.role === 'OFFICER') {
        if (!confirm("Promote this Officer to a full Platform Admin?")) return;
        nextRole = 'ADMIN';
    } else {
        alert("User is already an Admin.");
        return;
    }

    try {
        await storageService.saveUser({ ...targetUser, role: nextRole, officerOrg: nextOrg });
        setDataTick(t => t + 1);
        await storageService.sendNotification(targetUser.id, "Role Upgrade!", `You have been promoted to ${nextRole}${nextOrg ? ` for ${nextOrg}` : ''}.`, 'SUCCESS');
    } catch (e: any) {
        alert("Failed to update role: " + formatError(e));
    }
  };

  const handleDemoteUser = async (targetUser: User) => {
    if (user?.role !== 'ADMIN') return;
    let nextRole: Role = targetUser.role;
    let nextOrg: Organization | undefined = targetUser.officerOrg;

    if (targetUser.role === 'ADMIN') {
        if (!confirm("Demote this Admin to Officer status?")) return;
        nextRole = 'OFFICER';
        if (!nextOrg) nextOrg = 'GENERAL';
    } else if (targetUser.role === 'OFFICER') {
        if (!confirm("Demote this Officer to a regular Member? This removes their Org Hub access.")) return;
        nextRole = 'MEMBER';
        nextOrg = undefined;
    } else {
        alert("User is already at the lowest role.");
        return;
    }

    try {
        await storageService.saveUser({ ...targetUser, role: nextRole, officerOrg: nextOrg });
        setDataTick(t => t + 1);
        await storageService.sendNotification(targetUser.id, "Role Change", `Your role has been updated to ${nextRole}.`, 'WARNING');
    } catch (e: any) {
        alert("Demote failed: " + formatError(e));
    }
  };

  const handleUpdateOfficerOrg = async (targetUser: User, newOrg: Organization) => {
    if (user?.role !== 'ADMIN') return;
    try {
        await storageService.saveUser({ ...targetUser, officerOrg: newOrg });
        setDataTick(t => t + 1);
    } catch (e: any) {
        alert("Update failed: " + formatError(e));
    }
  };

  const handleUpdateProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;
    try {
        const form = e.target as HTMLFormElement;
        const formData = new FormData(form);
        const newName = formData.get('name') as string;
        const avatarFile = formData.get('avatar') as File;
        
        let avatarUrl = user.avatarUrl;
        if (avatarFile && avatarFile.size > 0) {
            const uploadedUrl = await storageService.uploadImage(avatarFile);
            if (uploadedUrl) avatarUrl = uploadedUrl;
        }

        await storageService.saveUser({
            ...user,
            name: newName || user.name,
            avatarUrl
        });
        setIsEditingProfile(false);
        setDataTick(t => t + 1);
    } catch (e: any) {
        alert("Profile update failed: " + formatError(e));
    }
  };

  const handleCreateOrUpdateWorkshop = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;
    setIsSavingWorkshop(true);
    try {
        const f = e.target as HTMLFormElement;
        const fd = new FormData(f);
        const bannerFile = fd.get('banner') as File;
        const badgeFile = fd.get('badge') as File;
        const certFile = fd.get('certificate') as File;
        const organization = (fd.get('org') as Organization) || 'GENERAL';

        if (user.role === 'OFFICER' && organization !== user.officerOrg) {
            throw new Error(`You can only manage workshops for ${user.officerOrg}`);
        }
        
        let bannerUrl = editingWorkshop?.bannerUrl;
        if (bannerFile && bannerFile.size > 0) {
            const uploaded = await storageService.uploadImage(bannerFile);
            if (uploaded) bannerUrl = uploaded;
        }

        let badgeUrl = editingWorkshop?.badgeUrl;
        if (badgeFile && badgeFile.size > 0) {
            const uploaded = await storageService.uploadImage(badgeFile);
            if (uploaded) badgeUrl = uploaded;
        }

        let certificateUrl = editingWorkshop?.certificateUrl;
        if (certFile && certFile.size > 0) {
            const uploaded = await storageService.uploadImage(certFile);
            if (uploaded) certificateUrl = uploaded;
        }

        const workshopData = {
            title: fd.get('title') as string,
            description: fd.get('desc') as string,
            date: new Date(fd.get('date') as string).toISOString(),
            organization,
            limit: parseInt(fd.get('limit') as string) || 0,
            bannerUrl,
            badgeUrl,
            certificateUrl
        };

        if (editingWorkshop) {
            await storageService.updateWorkshop(editingWorkshop.id, workshopData);
        } else {
            await storageService.createWorkshop(workshopData);
        }
        
        setIsCreatingWorkshop(false);
        setEditingWorkshop(null);
        setDataTick(t => t + 1);
    } catch (error: any) {
        alert(`Failed to save workshop: ${formatError(error)}`);
    } finally {
        setIsSavingWorkshop(false);
    }
  };

  const handleRemoveParticipant = async (participantId: string, workshopId: string) => {
    if (!confirm("Remove this participant from the session?")) return;
    try {
        await storageService.removeParticipant(workshopId, participantId);
        setDataTick(t => t + 1);
        await storageService.sendNotification(participantId, "Session Update", "You have been removed from a workshop session.", "WARNING");
    } catch (e: any) {
        alert("Failed to remove participant: " + formatError(e));
    }
  };

  const handleIssueAwards = async (participant: any, workshop: Workshop) => {
    try {
        const issuedAt = new Date().toISOString();
        await storageService.issueBadge({ userId: participant.id, title: `${workshop.title} Graduate`, organization: workshop.organization, workshopTitle: workshop.title, issuedAt, imageUrl: workshop.badgeUrl });
        await storageService.issueCertificate({ userId: participant.id, title: `Certificate of Completion - ${workshop.title}`, organization: workshop.organization, workshopTitle: workshop.title, content: `This certifies that ${participant.name} has successfully completed the workshop ${workshop.title} hosted by ${workshop.organization}.`, issuedAt, fileUrl: workshop.certificateUrl });
        await storageService.sendNotification(participant.id, "Awards Granted!", `Congratulations! You've received a badge and certificate for ${workshop.title}.`, "SUCCESS");
        alert(`Awards issued to ${participant.name} successfully!`);
    } catch (e: any) {
        alert("Failed to issue awards: " + formatError(e));
    }
  };

  // Bulk issue awards logic
  const handleBulkIssueAwards = async () => {
    if (!selectedWorkshopId || selectedParticipants.size === 0) return;
    const workshop = workshops.find(w => w.id === selectedWorkshopId);
    if (!workshop) return;
    
    if (!confirm(`Issue awards to all ${selectedParticipants.size} selected participants?`)) return;

    setIsBulkIssuing(true);
    try {
        const ids = Array.from(selectedParticipants);
        const issuedAt = new Date().toISOString();
        
        await Promise.all(ids.map(async (pId) => {
            const participant = workshop.participants.find(p => p.id === pId);
            if (!participant) return;

            await storageService.issueBadge({ userId: pId, title: `${workshop.title} Graduate`, organization: workshop.organization, workshopTitle: workshop.title, issuedAt, imageUrl: workshop.badgeUrl });
            await storageService.issueCertificate({ userId: pId, title: `Certificate of Completion - ${workshop.title}`, organization: workshop.organization, workshopTitle: workshop.title, content: `This certifies that ${participant.name} has successfully completed the workshop ${workshop.title} hosted by ${workshop.organization}.`, issuedAt, fileUrl: workshop.certificateUrl });
            await storageService.sendNotification(pId, "Awards Granted!", `Congratulations! You've received a badge and certificate for ${workshop.title}.`, "SUCCESS");
        }));

        alert(`Successfully issued awards to ${selectedParticipants.size} participants!`);
        setSelectedParticipants(new Set());
    } catch (e: any) {
        alert("Failed to issue some awards: " + formatError(e));
    } finally {
        setIsBulkIssuing(false);
    }
  };

  const toggleParticipantSelection = (id: string) => {
    const next = new Set(selectedParticipants);
    if (next.has(id)) next.delete(id); else next.add(id);
    setSelectedParticipants(next);
  };

  const handleSelectAll = (parts: any[]) => {
    if (selectedParticipants.size === parts.length) {
        setSelectedParticipants(new Set());
    } else {
        setSelectedParticipants(new Set(parts.map(p => p.id)));
    }
  };

  const handleOpenEditWorkshop = (w: Workshop) => { setEditingWorkshop(w); setIsCreatingWorkshop(true); };

  if (loadingInitial) return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-slate-50 dark:bg-slate-950 p-10 text-center">
        <div className="relative mb-8">
            <div className="w-16 h-16 md:w-24 md:h-24 bg-indigo-600 rounded-2xl md:rounded-[2rem] flex items-center justify-center shadow-2xl animate-bounce">
                <img src={LOGO_URL} alt="" className="w-10 h-10 md:w-16 md:h-16 object-contain" />
            </div>
            <div className="absolute -inset-4 border-2 border-indigo-600/20 rounded-[2.5rem] animate-ping"></div>
        </div>
        <p className="text-[10px] md:text-sm font-black text-slate-400 uppercase tracking-[0.3em]">Igniting Community Hub...</p>
    </div>
  );

  if (currentView === 'LOGIN' || currentView === 'SIGNUP') {
    return <AuthScreen onLogin={() => { setDataTick(t => t + 1); setCurrentView('DASHBOARD'); }} view={currentView} onSwitchView={setCurrentView} />;
  }

  const selectedWorkshop = workshops.find(w => w.id === selectedWorkshopId);
  const canManageSelectedWorkshop = user && (user.role === 'ADMIN' || (user.role === 'OFFICER' && user.officerOrg === selectedWorkshop?.organization));
  const sessionExpired = selectedWorkshop ? isExpired(selectedWorkshop.date) : false;

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100 pb-safe-bottom md:pb-24 transition-colors">
      <Navbar 
        user={user} 
        onLogout={async () => { await supabase.auth.signOut(); setUser(null); setCurrentView('LOGIN'); }} 
        onNavigate={setCurrentView} 
        notifications={user?.notifications || []} 
        currentView={currentView} 
        theme={theme} 
        onToggleTheme={() => setTheme(t => t === 'light' ? 'dark' : 'light')} 
        onMarkAllRead={handleMarkAllRead}
      />
      
      <main className="max-w-7xl mx-auto px-4 md:px-6 pt-6 md:pt-12 pb-24 md:pb-0">
        {currentView === 'DASHBOARD' && user && (
            <div className="space-y-8 md:space-y-12 animate-in fade-in duration-700">
                <div className="bg-white dark:bg-slate-900 rounded-[2rem] md:rounded-[3rem] p-6 md:p-16 border border-slate-100 dark:border-slate-800 shadow-2xl relative overflow-hidden">
                    <div className="absolute top-0 right-0 w-64 h-64 md:w-96 md:h-96 bg-indigo-500/5 blur-[100px] rounded-full -mr-32 -mt-32"></div>
                    <div className="relative z-10 grid grid-cols-1 lg:grid-cols-2 gap-8 md:gap-12 items-center">
                        <div>
                            <div className="inline-flex items-center space-x-2 px-3 md:px-5 py-1.5 md:py-2 rounded-full bg-indigo-50 dark:bg-indigo-900/30 text-indigo-700 dark:text-indigo-300 text-[9px] md:text-[11px] font-black uppercase tracking-[0.2em] mb-4 md:mb-6 shadow-sm">
                                <Sparkles className="w-3.5 h-3.5 md:w-4 md:h-4" />
                                <span>Pulse Board</span>
                            </div>
                            <h1 className="text-3xl md:text-7xl font-black mb-4 md:mb-6 tracking-tighter leading-[0.9]">Hey {user.name.split(' ')[0]}!</h1>
                            <div className="flex items-center gap-2 md:gap-3 mb-6 md:mb-8">
                                <span className="bg-indigo-100 dark:bg-indigo-900/40 text-indigo-600 dark:text-indigo-300 px-3 md:px-4 py-0.5 md:py-1 rounded-full text-[10px] md:text-xs font-black uppercase tracking-widest">{user.role}</span>
                                {user.officerOrg && <OrgBadge org={user.officerOrg} />}
                            </div>
                            <p className="text-slate-500 dark:text-slate-400 text-base md:text-2xl font-medium mb-8 md:mb-10 max-w-lg leading-relaxed">
                                Ready for your next milestone? Check out what's trending in your community.
                            </p>
                            <div className="flex flex-col sm:flex-row gap-3 md:gap-4">
                                <Button size="lg" onClick={() => setCurrentView('WORKSHOPS')} className="rounded-2xl shadow-xl shadow-indigo-600/30 px-6 md:px-10 font-black h-14 md:h-16 text-sm md:text-lg w-full sm:w-auto">Browse Sessions</Button>
                                {user.role !== 'MEMBER' && (
                                  <Button variant="outline" size="lg" onClick={() => { setEditingPost(null); setIsCreatingPost(true); }} className="rounded-2xl font-black px-6 md:px-10 h-14 md:h-16 text-sm md:text-lg border-2 w-full sm:w-auto">Share Update</Button>
                                )}
                            </div>
                        </div>
                        <div className="hidden lg:block">
                            <div className="bg-indigo-600 rounded-[3.5rem] p-12 text-white shadow-2xl relative overflow-hidden group hover:rotate-1 transition-transform">
                                <div className="absolute top-0 right-0 p-8 opacity-20"><TrendingUp className="w-32 h-32" /></div>
                                <h3 className="text-3xl font-black mb-6 tracking-tight">Earning Path</h3>
                                <p className="text-indigo-100 text-lg mb-10 leading-relaxed font-medium">You have <span className="text-white font-black underline">{user.badges.length} active credentials</span>. Join 2 more workshops to unlock the "Pro Collaborator" elite badge.</p>
                                <Button variant="secondary" className="w-full bg-white text-indigo-600 font-black py-5 rounded-2xl text-lg hover:bg-slate-50 transition-colors" onClick={() => setCurrentView('WORKSHOPS')}>Find Workshops</Button>
                            </div>
                        </div>
                    </div>
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 md:gap-12">
                    <div className="lg:col-span-2 space-y-6 md:space-y-10">
                        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
                            <h2 className="text-2xl md:text-3xl font-black flex items-center gap-3 md:gap-4 tracking-tight"><Bell className="w-6 h-6 md:w-8 md:h-8 text-indigo-600" /> Community Feed</h2>
                            <div className="flex bg-slate-100 dark:bg-slate-800 p-1 rounded-xl md:rounded-2xl w-full sm:w-auto overflow-x-auto no-scrollbar">
                                {['ALL', 'CES', 'TCC', 'ICSO'].map(o => (
                                    <button 
                                        key={o} 
                                        onClick={() => setOrgFilter(o as any)}
                                        className={`flex-1 sm:flex-none px-4 py-1.5 md:py-2 rounded-lg md:rounded-xl text-[9px] md:text-[10px] font-black uppercase tracking-wider transition-all whitespace-nowrap ${orgFilter === o ? 'bg-white dark:bg-slate-900 shadow-sm text-indigo-600' : 'text-slate-400'}`}
                                    >
                                        {o}
                                    </button>
                                ))}
                            </div>
                        </div>
                        <div className="space-y-6 md:space-y-10">
                            {announcements.length === 0 ? (
                                <div className="text-center py-16 md:py-20 bg-white dark:bg-slate-900 rounded-[2rem] md:rounded-[3rem] border border-dashed border-slate-200 dark:border-slate-800">
                                    <Mail className="w-12 h-12 md:w-16 md:h-16 mx-auto mb-4 text-slate-200" />
                                    <p className="text-slate-400 font-black uppercase tracking-widest text-xs">No updates found</p>
                                </div>
                            ) : (
                                announcements.map(a => <AnnouncementCard 
                                  key={a.id} 
                                  announcement={a} 
                                  user={user} 
                                  onLike={handleLike} 
                                  onComment={handleComment} 
                                  onDelete={handleDeleteAnnouncement}
                                  onEdit={(a) => { setEditingPost(a); setIsCreatingPost(true); }}
                                />)
                            )}
                        </div>
                    </div>
                    <div className="space-y-8 md:space-y-10 hidden md:block">
                        <div className="bg-white dark:bg-slate-900 p-10 rounded-[3rem] border border-slate-200 dark:border-slate-800 shadow-sm sticky top-28">
                            <h3 className="font-black mb-8 flex items-center gap-4 text-xl tracking-tight"><LayoutDashboard className="w-7 h-7 text-emerald-500" /> Stats Overview</h3>
                            <div className="space-y-6">
                                <div className="p-6 bg-slate-50 dark:bg-slate-800/40 rounded-[2rem] border border-slate-100 dark:border-slate-700/50 flex items-center justify-between">
                                    <div className="flex items-center gap-4">
                                        <div className="w-12 h-12 bg-indigo-100 dark:bg-indigo-900/30 rounded-2xl flex items-center justify-center text-indigo-600"><Award className="w-6 h-6" /></div>
                                        <div>
                                            <p className="text-[10px] font-black uppercase text-slate-400 tracking-widest">Badges</p>
                                            <p className="text-2xl font-black text-slate-900 dark:text-white leading-none mt-1">{user.badges.length}</p>
                                        </div>
                                    </div>
                                    <ChevronRight className="w-5 h-5 text-slate-300" />
                                </div>
                                <div className="p-6 bg-slate-50 dark:bg-slate-800/40 rounded-[2rem] border border-slate-100 dark:border-slate-700/50 flex items-center justify-between">
                                    <div className="flex items-center gap-4">
                                        <div className="w-12 h-12 bg-emerald-100 dark:bg-emerald-900/30 rounded-2xl flex items-center justify-center text-emerald-600"><FileText className="w-6 h-6" /></div>
                                        <div>
                                            <p className="text-[10px] font-black uppercase text-slate-400 tracking-widest">Certs</p>
                                            <p className="text-2xl font-black text-slate-900 dark:text-white leading-none mt-1">{user.certificates.length}</p>
                                        </div>
                                    </div>
                                    <ChevronRight className="w-5 h-5 text-slate-300" />
                                </div>
                            </div>
                            <Button variant="ghost" className="w-full mt-8 rounded-2xl font-black py-4 uppercase tracking-widest text-xs" onClick={() => setCurrentView('PROFILE')}>View Full Profile</Button>
                        </div>
                    </div>
                </div>
            </div>
        )}

        {currentView === 'ORG_DASHBOARD' && user && (
            <div className="space-y-8 md:space-y-12 animate-in slide-in-from-bottom-8 duration-700 pb-12">
                <div className={`p-8 md:p-20 rounded-[2.5rem] md:rounded-[4rem] text-white shadow-2xl relative overflow-hidden ${
                    activeOrg === 'CES' ? 'bg-ces' : activeOrg === 'TCC' ? 'bg-tcc' : activeOrg === 'ICSO' ? 'bg-icso' : 'bg-slate-800'
                }`}>
                    <div className="absolute top-0 right-0 p-8 md:p-12 opacity-10"><Building2 className="w-48 h-48 md:w-64 md:h-64" /></div>
                    <div className="relative z-10">
                        <div className="flex flex-col md:flex-row md:items-center justify-between gap-6 md:gap-8">
                            <div>
                                <h1 className="text-4xl md:text-8xl font-black tracking-tighter mb-2 md:mb-4">{activeOrg} Hub</h1>
                                <p className="text-white/80 text-sm md:text-xl font-medium max-w-xl">Centralized management suite for organization growth and student engagement.</p>
                            </div>
                            {user.role === 'ADMIN' && (
                                <div className="bg-black/20 backdrop-blur-md p-2 md:p-4 rounded-2xl md:rounded-3xl flex flex-wrap gap-1 md:gap-2">
                                    {(['CES', 'TCC', 'ICSO'] as Organization[]).map(o => (
                                        <button 
                                            key={o} 
                                            onClick={() => setActiveOrg(o)}
                                            className={`flex-1 md:flex-none px-4 md:px-6 py-2 rounded-xl md:rounded-2xl text-[10px] md:text-xs font-black uppercase tracking-widest transition-all ${activeOrg === o ? 'bg-white text-slate-900 shadow-xl' : 'text-white/60 hover:text-white'}`}
                                        >
                                            {o}
                                        </button>
                                    ))}
                                </div>
                            )}
                        </div>
                    </div>
                </div>

                <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 md:gap-8">
                    <div className="bg-white dark:bg-slate-900 p-5 md:p-8 rounded-2xl md:rounded-[2.5rem] border border-slate-100 dark:border-slate-800 shadow-sm">
                        <div className="w-10 h-10 md:w-12 md:h-12 bg-indigo-50 dark:bg-indigo-900/30 rounded-xl md:rounded-2xl flex items-center justify-center text-indigo-600 mb-4 md:mb-6"><BarChart3 className="w-5 h-5 md:w-6 md:h-6" /></div>
                        <p className="text-[9px] md:text-[10px] font-black uppercase text-slate-400 tracking-widest mb-1">Sessions</p>
                        <p className="text-2xl md:text-4xl font-black">{orgStats.workshopCount}</p>
                    </div>
                    <div className="bg-white dark:bg-slate-900 p-5 md:p-8 rounded-2xl md:rounded-[2.5rem] border border-slate-100 dark:border-slate-800 shadow-sm">
                        <div className="w-10 h-10 md:w-12 md:h-12 bg-emerald-50 dark:bg-emerald-900/30 rounded-xl md:rounded-2xl flex items-center justify-center text-emerald-600 mb-4 md:mb-6"><Users className="w-5 h-5 md:w-6 md:h-6" /></div>
                        <p className="text-[9px] md:text-[10px] font-black uppercase text-slate-400 tracking-widest mb-1">Impact</p>
                        <p className="text-2xl md:text-4xl font-black">{orgStats.participantTotal}</p>
                    </div>
                    <div className="bg-white dark:bg-slate-900 p-5 md:p-8 rounded-2xl md:rounded-[2.5rem] border border-slate-100 dark:border-slate-800 shadow-sm">
                        <div className="w-10 h-10 md:w-12 md:h-12 bg-amber-50 dark:bg-amber-900/30 rounded-xl md:rounded-2xl flex items-center justify-center text-amber-600 mb-4 md:mb-6"><TrendingUp className="w-5 h-5 md:w-6 md:h-6" /></div>
                        <p className="text-[9px] md:text-[10px] font-black uppercase text-slate-400 tracking-widest mb-1">Avg Attend</p>
                        <p className="text-2xl md:text-4xl font-black">{orgStats.avgAttendance}</p>
                    </div>
                    <div className="bg-white dark:bg-slate-900 p-5 md:p-8 rounded-2xl md:rounded-[2.5rem] border border-slate-100 dark:border-slate-800 shadow-sm">
                        <div className="w-10 h-10 md:w-12 md:h-12 bg-rose-50 dark:bg-rose-900/30 rounded-xl md:rounded-2xl flex items-center justify-center text-rose-600 mb-4 md:mb-6"><Layers className="w-5 h-5 md:w-6 md:h-6" /></div>
                        <p className="text-[9px] md:text-[10px] font-black uppercase text-slate-400 tracking-widest mb-1">Total Posts</p>
                        <p className="text-2xl md:text-4xl font-black">{orgStats.postCount}</p>
                    </div>
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 md:gap-12">
                    <div className="space-y-6 md:space-y-8">
                        <div className="flex justify-between items-center">
                            <h2 className="text-xl md:text-2xl font-black flex items-center gap-3 md:gap-4 tracking-tight"><Calendar className="w-6 h-6 md:w-7 md:h-7 text-indigo-600" /> Workshops</h2>
                            {(user.role === 'ADMIN' || (user.role === 'OFFICER' && user.officerOrg === activeOrg)) && (
                              <Button size="sm" onClick={() => { setEditingWorkshop(null); setIsCreatingWorkshop(true); }} className="rounded-xl px-4 py-1.5 md:py-2 text-[10px] font-black uppercase tracking-widest">Add New</Button>
                            )}
                        </div>
                        <div className="grid grid-cols-1 gap-4 md:gap-6">
                            {workshops.filter(w => w.organization === activeOrg).length === 0 ? (
                                <p className="text-center text-slate-400 py-10 font-bold text-sm bg-white dark:bg-slate-900 rounded-3xl border border-slate-100 dark:border-slate-800">No sessions scheduled.</p>
                            ) : (
                                workshops.filter(w => w.organization === activeOrg).map(w => (
                                    <div key={w.id} className="bg-white dark:bg-slate-900 p-4 md:p-6 rounded-2xl md:rounded-[2rem] border border-slate-100 dark:border-slate-800 flex items-center justify-between hover:shadow-lg transition-all group cursor-pointer active:scale-[0.98]" onClick={() => { setSelectedWorkshopId(w.id); setCurrentView('WORKSHOP_DETAIL'); }}>
                                        <div className="flex items-center gap-4 md:gap-6 min-w-0">
                                            <div className="w-12 h-12 md:w-16 md:h-16 rounded-xl md:rounded-2xl bg-slate-100 dark:bg-slate-800 overflow-hidden flex-shrink-0">
                                                {w.bannerUrl ? <img src={w.bannerUrl} className="w-full h-full object-cover" /> : <GraduationCap className="w-6 h-6 md:w-8 md:h-8 m-3 md:m-4 text-slate-300" />}
                                            </div>
                                            <div className="min-w-0">
                                                <h4 className="font-black text-sm md:text-lg tracking-tight group-hover:text-indigo-600 transition-colors truncate">{w.title}</h4>
                                                <p className="text-[9px] md:text-xs text-slate-400 font-bold uppercase tracking-widest flex items-center gap-1.5 mt-1"><Clock className="w-3 h-3" /> {formatFriendlyDate(w.date)}</p>
                                            </div>
                                        </div>
                                        <div className="flex flex-col items-end flex-shrink-0 pl-2">
                                            <p className="text-lg md:text-xl font-black text-emerald-600">{w.participants.length}</p>
                                            <p className="text-[8px] md:text-[9px] font-black uppercase text-slate-400 tracking-widest">Joined</p>
                                        </div>
                                    </div>
                                ))
                            )}
                        </div>
                    </div>
                    <div className="space-y-6 md:space-y-8">
                        <div className="flex justify-between items-center">
                            <h2 className="text-xl md:text-2xl font-black flex items-center gap-3 md:gap-4 tracking-tight"><Mail className="w-6 h-6 md:w-7 md:h-7 text-rose-500" /> Posts</h2>
                            {(user.role === 'ADMIN' || (user.role === 'OFFICER' && user.officerOrg === activeOrg)) && (
                              <Button size="sm" variant="outline" onClick={() => { setEditingPost(null); setIsCreatingPost(true); }} className="rounded-xl px-4 py-1.5 md:py-2 text-[10px] font-black uppercase tracking-widest border-2">New Update</Button>
                            )}
                        </div>
                        <div className="space-y-4 md:space-y-6">
                            {announcements.filter(a => a.organization === activeOrg).length === 0 ? (
                                <p className="text-center text-slate-400 py-10 font-bold text-sm bg-white dark:bg-slate-900 rounded-3xl border border-slate-100 dark:border-slate-800">No updates yet.</p>
                            ) : (
                                announcements.filter(a => a.organization === activeOrg).map(a => (
                                    <div key={a.id} className="bg-white dark:bg-slate-900 p-6 md:p-8 rounded-[1.5rem] md:rounded-[2rem] border border-slate-100 dark:border-slate-800 shadow-sm relative group active:scale-[0.98] transition-transform">
                                        <h4 className="font-black text-base md:text-xl tracking-tight mb-1.5 md:mb-2">{a.title}</h4>
                                        <p className="text-slate-500 dark:text-slate-400 text-xs md:text-sm line-clamp-2 mb-4 leading-relaxed font-medium">{a.content}</p>
                                        <div className="flex justify-between items-center text-[8px] md:text-[10px] font-black uppercase tracking-widest text-slate-400">
                                            <span className="flex items-center gap-1.5"><Heart className="w-3.5 h-3.5 md:w-4 md:h-4 text-rose-500" /> {a.likes.length} Likes</span>
                                            <span>{getRelativeTime(a.createdAt)}</span>
                                        </div>
                                    </div>
                                ))
                            )}
                        </div>
                    </div>
                </div>
            </div>
        )}

        {currentView === 'WORKSHOPS' && (
            <div className="space-y-8 md:space-y-12 animate-in slide-in-from-bottom-8 duration-500">
                <div className="flex flex-col md:flex-row md:items-end justify-between gap-6 md:gap-8">
                    <div>
                        <div className="inline-flex items-center space-x-2 px-3 md:px-4 py-1 md:py-1.5 rounded-full bg-emerald-50 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-300 text-[9px] md:text-[10px] font-black uppercase tracking-widest mb-3 md:mb-4">
                            <BookOpen className="w-3.5 h-3.5 md:w-4 md:h-4" />
                            <span>Academic Sessions</span>
                        </div>
                        <h2 className="text-3xl md:text-7xl font-black tracking-tighter leading-none">Workshop Gallery</h2>
                        <p className="text-slate-500 font-bold mt-2 md:mt-4 text-sm md:text-lg max-w-2xl leading-relaxed">Fuel your growth with specialized sessions hosted by community leaders.</p>
                    </div>
                    <div className="flex flex-col sm:flex-row items-stretch gap-3 md:gap-4 w-full md:w-auto">
                        <div className="relative group flex-1 md:flex-none">
                            <Search className="absolute left-4 md:left-5 top-1/2 -translate-y-1/2 w-4 h-4 md:w-5 md:h-5 text-slate-400 group-focus-within:text-indigo-600 transition-colors" />
                            <Input 
                                placeholder="Search skills..." 
                                className="pl-12 md:pl-14 rounded-xl md:rounded-2xl h-12 md:h-16 md:w-80 bg-white dark:bg-slate-900 border-2 border-slate-100 dark:border-slate-800 shadow-sm text-sm md:text-lg font-medium" 
                                value={searchQuery} 
                                onChange={e => setSearchQuery(e.target.value)} 
                            />
                        </div>
                        {(user?.role === 'ADMIN' || user?.role === 'OFFICER') && (
                             <Button onClick={() => { setEditingWorkshop(null); setIsCreatingWorkshop(true); }} className="h-12 md:h-16 px-6 md:px-8 rounded-xl md:rounded-2xl shadow-xl shadow-emerald-600/20 font-black text-sm md:text-lg bg-emerald-600 hover:bg-emerald-700 w-full sm:w-auto">
                                <Plus className="w-5 h-5 md:w-6 md:h-6 mr-2 md:mr-3" /> New Session
                             </Button>
                        )}
                    </div>
                </div>
                
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6 md:gap-10">
                    {workshops.filter(w => w.title.toLowerCase().includes(searchQuery.toLowerCase())).length === 0 ? (
                        <div className="col-span-full text-center py-20 bg-white dark:bg-slate-900 rounded-[2rem] border border-slate-100 dark:border-slate-800">
                             <Search className="w-12 h-12 mx-auto mb-4 text-slate-200" />
                             <p className="text-slate-400 font-bold uppercase tracking-widest text-xs">No matching sessions</p>
                        </div>
                    ) : (
                        workshops.filter(w => w.title.toLowerCase().includes(searchQuery.toLowerCase())).map(w => {
                            const canManage = user && (user.role === 'ADMIN' || (user.role === 'OFFICER' && user.officerOrg === w.organization));
                            return (
                                <WorkshopCard 
                                    key={w.id} 
                                    workshop={w} 
                                    onClick={id => { setSelectedWorkshopId(id); setCurrentView('WORKSHOP_DETAIL'); }} 
                                    onEdit={canManage ? handleOpenEditWorkshop : undefined}
                                    onDelete={canManage ? handleDeleteWorkshop : undefined}
                                />
                            );
                        })
                    )}
                </div>
            </div>
        )}

        {currentView === 'WORKSHOP_DETAIL' && selectedWorkshop && (
            <div className="max-w-5xl mx-auto animate-in zoom-in-95 duration-500 pb-12">
                 <button onClick={() => { setCurrentView('WORKSHOPS'); setSelectedParticipants(new Set()); }} className="flex items-center text-slate-400 hover:text-indigo-600 font-black mb-6 md:mb-10 text-[9px] md:text-[11px] uppercase tracking-[0.3em] transition-colors group">
                    <ChevronRight className="w-4 h-4 md:w-5 md:h-5 mr-2 md:mr-3 rotate-180 group-hover:-translate-x-1 transition-transform" /> Back to Gallery
                </button>
                <div className="bg-white dark:bg-slate-900 rounded-[2rem] md:rounded-[3.5rem] overflow-hidden border border-slate-100 dark:border-slate-800 shadow-2xl">
                     <div className="h-[18rem] md:h-[35rem] bg-slate-200 relative">
                        {selectedWorkshop.bannerUrl ? (
                            <img src={selectedWorkshop.bannerUrl} className={`w-full h-full object-cover ${sessionExpired ? 'grayscale contrast-75' : ''}`} />
                        ) : (
                            <div className="w-full h-full flex items-center justify-center bg-indigo-600"><GraduationCap className="w-24 h-24 md:w-40 md:h-40 text-white opacity-20" /></div>
                        )}
                        <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-transparent p-6 md:p-16 flex flex-col justify-end">
                            <div className="flex items-center gap-3 md:gap-4 mb-4 md:mb-6">
                                <OrgBadge org={selectedWorkshop.organization || 'GENERAL'} />
                                <span className={`px-3 md:px-4 py-1 md:py-1.5 rounded-full text-[8px] md:text-[10px] font-black uppercase tracking-widest backdrop-blur-md shadow-lg border flex items-center gap-1.5 md:gap-2 ${sessionExpired ? 'bg-rose-500/20 text-rose-100 border-rose-500/30' : 'bg-white/10 text-white border-white/20'}`}>
                                    {sessionExpired ? <History className="w-3 h-3 md:w-4 md:h-4" /> : <Clock className="w-3 h-3 md:w-4 md:h-4" />}
                                    {formatFriendlyDate(selectedWorkshop.date)}
                                </span>
                            </div>
                            <h1 className="text-2xl md:text-7xl font-black text-white tracking-tighter leading-tight md:leading-[0.9]">{selectedWorkshop.title}</h1>
                            {sessionExpired && <p className="text-rose-400 font-black uppercase tracking-[0.3em] text-[8px] md:text-[10px] mt-3 md:mt-4 flex items-center gap-2"><ShieldAlert className="w-3 h-3 md:w-4 md:h-4" /> This session is archived</p>}
                        </div>
                     </div>
                     <div className="p-6 md:p-20">
                        <div className="grid grid-cols-1 lg:grid-cols-3 gap-10 md:gap-16">
                            <div className="lg:col-span-2 space-y-10 md:space-y-12">
                                <div className="space-y-4 md:space-y-6">
                                    <div className="flex justify-between items-center">
                                        <h3 className="text-xl md:text-2xl font-black tracking-tight flex items-center gap-3 md:gap-4"><FileText className="w-6 h-6 md:w-7 md:h-7 text-indigo-500" /> Description</h3>
                                        {canManageSelectedWorkshop && (
                                            <div className="flex gap-1.5 md:gap-2">
                                                <button onClick={() => handleOpenEditWorkshop(selectedWorkshop)} className="p-2 rounded-lg md:rounded-xl bg-indigo-50 dark:bg-indigo-900/30 text-indigo-600 active:scale-90 transition-transform">
                                                    <Edit2 className="w-4 h-4 md:w-5 md:h-5" />
                                                </button>
                                                <button onClick={() => handleDeleteWorkshop(selectedWorkshop.id)} className="p-2 rounded-lg md:rounded-xl bg-rose-50 dark:bg-rose-900/30 text-rose-600 active:scale-90 transition-transform">
                                                    <Trash2 className="w-4 h-4 md:w-5 md:h-5" />
                                                </button>
                                            </div>
                                        )}
                                    </div>
                                    <p className="text-slate-600 dark:text-slate-400 text-base md:text-xl leading-relaxed font-medium whitespace-pre-wrap">
                                        {selectedWorkshop.description}
                                    </p>
                                </div>
                                <div className="space-y-4 md:space-y-6">
                                    <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
                                        <h3 className="text-xl md:text-2xl font-black tracking-tight flex items-center gap-3 md:gap-4"><Users className="w-6 h-6 md:w-7 md:h-7 text-emerald-500" /> Community ({selectedWorkshop.participants.length})</h3>
                                        {canManageSelectedWorkshop && selectedWorkshop.participants.length > 0 && (
                                            <button 
                                                onClick={() => handleSelectAll(selectedWorkshop.participants)}
                                                className="text-[10px] font-black uppercase tracking-widest text-indigo-600 hover:text-indigo-700 flex items-center gap-2"
                                            >
                                                {selectedParticipants.size === selectedWorkshop.participants.length ? <CheckSquare className="w-4 h-4" /> : <Square className="w-4 h-4" />}
                                                {selectedParticipants.size === selectedWorkshop.participants.length ? "Deselect All" : "Select All"}
                                            </button>
                                        )}
                                    </div>
                                    <div className="grid grid-cols-1 gap-3 md:gap-4">
                                        {selectedWorkshop.participants.length === 0 ? (
                                             <p className="text-slate-400 font-bold text-xs md:text-sm italic py-4">No participants yet.</p>
                                        ) : (
                                            selectedWorkshop.participants.map((p: Participant) => {
                                                const currentW = selectedWorkshop; // Narrowing helper for closures
                                                return (
                                                <div 
                                                    key={p.id} 
                                                    onClick={() => canManageSelectedWorkshop && toggleParticipantSelection(p.id)}
                                                    className={`bg-slate-50 dark:bg-slate-800/50 p-4 md:p-6 rounded-2xl md:rounded-[2rem] border-2 flex items-center justify-between transition-all active:scale-[0.99] cursor-pointer ${
                                                        canManageSelectedWorkshop && selectedParticipants.has(p.id) 
                                                        ? 'border-indigo-500 bg-indigo-50/30 dark:bg-indigo-900/10' 
                                                        : 'border-transparent'
                                                    }`}
                                                >
                                                    <div className="flex items-center gap-3 md:gap-4 min-w-0">
                                                        {canManageSelectedWorkshop && (
                                                            <div className="mr-1">
                                                                {selectedParticipants.has(p.id) ? (
                                                                    <CheckSquare className="w-5 h-5 text-indigo-600" />
                                                                ) : (
                                                                    <Square className="w-5 h-5 text-slate-300" />
                                                                )}
                                                            </div>
                                                        )}
                                                        <div className="w-10 h-10 md:w-12 md:h-12 rounded-xl bg-white dark:bg-slate-900 overflow-hidden border border-slate-200 dark:border-slate-700 shadow-sm flex-shrink-0">
                                                            {p.avatarUrl ? <img src={p.avatarUrl} className="w-full h-full object-cover" /> : <UserIcon className="w-5 h-5 m-2.5 md:m-3.5 text-slate-300" />}
                                                        </div>
                                                        <div className="min-w-0">
                                                            <p className="font-black text-slate-900 dark:text-white leading-none text-sm md:text-base tracking-tight truncate">{p.name}</p>
                                                            <p className="text-[10px] md:text-xs text-slate-400 font-bold uppercase tracking-widest mt-1 truncate">{p.email}</p>
                                                        </div>
                                                    </div>
                                                    {canManageSelectedWorkshop && (
                                                        <div className="flex gap-1.5 md:gap-2 flex-shrink-0 pl-2">
                                                            <button onClick={(e) => { e.stopPropagation(); handleIssueAwards(p, currentW); }} className="p-2.5 md:p-3 rounded-lg md:rounded-2xl bg-indigo-50 dark:bg-indigo-900/30 text-indigo-600 dark:text-indigo-400 active:bg-indigo-600 active:text-white transition-all shadow-sm" title="Issue Awards"><Award className="w-4 h-4 md:w-5 md:h-5" /></button>
                                                            <button onClick={(e) => { e.stopPropagation(); handleRemoveParticipant(p.id, currentW.id); }} className="p-2.5 md:p-3 rounded-lg md:rounded-2xl bg-rose-50 dark:bg-rose-900/30 text-rose-600 dark:text-rose-400 active:bg-rose-600 active:text-white transition-all shadow-sm" title="Remove Participant"><UserMinus className="w-4 h-4 md:w-5 md:h-5" /></button>
                                                        </div>
                                                    )}
                                                </div>
                                            )})
                                        )}
                                    </div>
                                </div>
                            </div>
                            <div className="order-first lg:order-last">
                                <div className="bg-slate-50 dark:bg-slate-800/50 p-6 md:p-8 rounded-2xl md:rounded-[2.5rem] border border-slate-100 dark:border-slate-700 sticky top-28 space-y-6 md:space-y-8">
                                    <div className="space-y-2 md:space-y-3">
                                        <p className="text-[9px] md:text-[10px] font-black uppercase text-slate-400 tracking-[0.2em]">Credential Preview</p>
                                        <div className="flex items-center gap-3 p-3 md:p-4 bg-white dark:bg-slate-900 rounded-xl md:rounded-2xl shadow-sm border border-slate-100 dark:border-slate-800">
                                            <Award className="w-5 h-5 md:w-6 md:h-6 text-indigo-500" />
                                            <span className="font-black text-xs md:text-sm tracking-tight">Verified Badge</span>
                                        </div>
                                        <div className="flex items-center gap-3 p-3 md:p-4 bg-white dark:bg-slate-900 rounded-xl md:rounded-2xl shadow-sm border border-slate-100 dark:border-slate-800">
                                            <FileText className="w-5 h-5 md:w-6 md:h-6 text-emerald-500" />
                                            <span className="font-black text-xs md:text-sm tracking-tight">PDF Certificate</span>
                                        </div>
                                    </div>
                                    {!selectedWorkshop.participants.some(p => p.id === user?.id) && !sessionExpired && (
                                        <Button className="w-full py-5 md:py-6 rounded-xl md:rounded-2xl font-black text-base md:text-xl shadow-2xl shadow-indigo-600/30 h-14 md:h-auto" onClick={() => handleJoinWorkshop(selectedWorkshop.id)}>Join Session</Button>
                                    )}
                                    {sessionExpired && !selectedWorkshop.participants.some(p => p.id === user?.id) && (
                                        <div className="p-4 rounded-xl md:rounded-2xl bg-slate-200 dark:bg-slate-800 text-slate-400 dark:text-slate-500 text-center font-black uppercase text-[10px] md:text-xs tracking-widest flex items-center justify-center gap-2 border border-slate-300 dark:border-slate-700">
                                            <History className="w-4 h-4" /> Session Closed
                                        </div>
                                    )}
                                    {selectedWorkshop.participants.some(p => p.id === user?.id) && (
                                        <div className="p-4 rounded-xl md:rounded-2xl bg-emerald-50 dark:bg-emerald-900/30 text-emerald-600 dark:text-emerald-400 text-center font-black uppercase text-[10px] md:text-xs tracking-widest flex items-center justify-center gap-2 border border-emerald-100 dark:border-emerald-800">
                                            <CheckCircle className="w-4 h-4" /> Spot Secured
                                        </div>
                                    )}
                                    <p className="text-[9px] md:text-[10px] text-center text-slate-400 font-bold uppercase tracking-widest">Platform access verified</p>
                                    {canManageSelectedWorkshop && (
                                        <div className="pt-6 border-t border-slate-200 dark:border-slate-700 space-y-4">
                                            <p className="text-[9px] md:text-[10px] font-black uppercase text-slate-400 tracking-[0.2em]">Manage</p>
                                            <Button variant="outline" className="w-full rounded-xl py-3.5 md:py-4 font-black uppercase text-[9px] md:text-[10px] tracking-[0.2em] border-2 h-12 md:h-auto" onClick={() => { setEditingPost(null); setIsCreatingPost(true); }}>Announce</Button>
                                        </div>
                                    )}
                                </div>
                            </div>
                        </div>
                     </div>
                </div>
            </div>
        )}

        {/* Floating Bulk Action Bar */}
        {currentView === 'WORKSHOP_DETAIL' && canManageSelectedWorkshop && selectedParticipants.size > 0 && (
            <div className="fixed bottom-24 md:bottom-10 left-1/2 -translate-x-1/2 z-[90] w-[calc(100%-2rem)] max-w-2xl bg-slate-900 text-white rounded-3xl p-4 md:p-6 shadow-2xl animate-in slide-in-from-bottom-full duration-500 flex flex-col md:flex-row items-center justify-between gap-4 border border-white/10 backdrop-blur-lg">
                <div className="flex items-center gap-4">
                    <div className="w-12 h-12 bg-indigo-600 rounded-2xl flex items-center justify-center font-black text-lg">{selectedParticipants.size}</div>
                    <div>
                        <p className="font-black text-sm md:text-base tracking-tight">Selected Participants</p>
                        <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest">Perform bulk administrative actions</p>
                    </div>
                </div>
                <div className="flex gap-2 w-full md:w-auto">
                    <Button 
                        onClick={() => setSelectedParticipants(new Set())}
                        variant="secondary" 
                        className="flex-1 md:flex-none rounded-xl bg-slate-800 text-white hover:bg-slate-700 border-none h-12 px-6 text-xs font-black uppercase tracking-widest"
                        disabled={isBulkIssuing}
                    >
                        Cancel
                    </Button>
                    <Button 
                        onClick={handleBulkIssueAwards}
                        className="flex-1 md:flex-none rounded-xl bg-indigo-600 hover:bg-indigo-700 h-12 px-8 text-xs font-black uppercase tracking-widest shadow-xl shadow-indigo-600/30"
                        isLoading={isBulkIssuing}
                    >
                        Issue Awards
                    </Button>
                </div>
            </div>
        )}

        {currentView === 'PROFILE' && user && (
             <div className="max-w-5xl mx-auto space-y-8 md:space-y-12 animate-in fade-in duration-700 pb-12">
                <div className="bg-white dark:bg-slate-900 rounded-[2rem] md:rounded-[3.5rem] p-8 md:p-20 border border-slate-100 dark:border-slate-800 shadow-2xl text-center relative overflow-hidden">
                    <div className="absolute top-0 inset-x-0 h-40 bg-gradient-to-b from-indigo-600/5 to-transparent"></div>
                    <div className="relative z-10 flex flex-col items-center">
                        <div className="w-32 h-32 md:w-40 md:h-40 rounded-3xl md:rounded-[3rem] bg-slate-100 dark:bg-slate-800 overflow-hidden border-[6px] md:border-8 border-white dark:border-slate-900 shadow-2xl mb-6 md:mb-8 relative group cursor-pointer">
                            {user.avatarUrl ? <img src={user.avatarUrl} className="w-full h-full object-cover" /> : <UserIcon className="w-16 h-16 md:w-20 md:h-20 m-8 md:m-10 text-slate-300" />}
                            <div onClick={() => setIsEditingProfile(true)} className="absolute inset-0 bg-black/40 opacity-0 md:group-hover:opacity-100 flex items-center justify-center transition-opacity cursor-pointer">
                                <Camera className="w-8 h-8 text-white" />
                            </div>
                        </div>
                        <h1 className="text-3xl md:text-6xl font-black tracking-tighter mb-2 leading-none">{user.name}</h1>
                        <p className="text-slate-400 font-black uppercase tracking-[0.2em] md:tracking-[0.3em] text-[10px] md:text-sm mb-6">{user.role} {user.officerOrg ? `• ${user.officerOrg}` : ''}</p>
                        <div className="flex flex-col items-center gap-4">
                            <div className="flex gap-2 md:gap-4">
                                <div className="px-4 md:px-6 py-2 bg-indigo-50 dark:bg-indigo-900/30 rounded-xl md:rounded-2xl text-indigo-600 text-[9px] md:text-xs font-black uppercase tracking-widest">{user.badges.length} Badges</div>
                                <div className="px-4 md:px-6 py-2 bg-emerald-50 dark:bg-emerald-900/30 rounded-xl md:rounded-2xl text-emerald-600 text-[9px] md:text-xs font-black uppercase tracking-widest">{user.certificates.length} Certs</div>
                            </div>
                            <Button variant="outline" size="sm" onClick={() => setIsEditingProfile(true)} className="rounded-xl px-6 font-black uppercase text-[10px] tracking-widest mt-2 md:mt-4 border-2">
                                <Settings className="w-4 h-4 mr-2" /> Edit Profile
                            </Button>
                        </div>
                    </div>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-8 md:gap-12">
                    <div className="space-y-6 md:space-y-8"><h3 className="text-xl md:text-2xl font-black flex items-center gap-3 md:gap-4 tracking-tight px-2 md:px-0"><Award className="w-6 h-6 md:w-8 md:h-8 text-indigo-600" /> Digital Badges</h3><div className="grid grid-cols-2 gap-4 md:gap-6">{user.badges.length === 0 ? (<div className="col-span-full py-10 bg-white dark:bg-slate-900 rounded-[2rem] border border-slate-100 dark:border-slate-800 text-center text-slate-400 font-bold text-xs uppercase tracking-widest">No badges earned yet</div>) : (user.badges.map(b => (<div key={b.id} className="bg-white dark:bg-slate-900 p-6 md:p-8 rounded-2xl md:rounded-[2.5rem] border border-slate-100 dark:border-slate-800 shadow-sm text-center group hover:shadow-xl active:scale-95 transition-all"><div className="w-14 h-14 md:w-20 md:h-20 bg-indigo-50 dark:bg-indigo-900/20 rounded-2xl md:rounded-3xl mx-auto mb-4 md:mb-6 flex items-center justify-center group-hover:rotate-6 transition-transform">{b.imageUrl ? <img src={b.imageUrl} className="w-8 h-8 md:w-10 md:h-10 object-contain" /> : <Award className="w-8 h-8 md:w-10 md:h-10 text-indigo-600" />}</div><h4 className="font-black text-[10px] md:text-sm mb-1 uppercase tracking-tight leading-tight line-clamp-2">{b.title}</h4><p className="text-[8px] md:text-[10px] font-bold text-slate-400 uppercase tracking-widest truncate">{b.workshopTitle}</p></div>)))}</div></div>
                    <div className="space-y-6 md:space-y-8"><h3 className="text-xl md:text-2xl font-black flex items-center gap-3 md:gap-4 tracking-tight px-2 md:px-0"><FileText className="w-6 h-6 md:w-8 md:h-8 text-emerald-600" /> Certificates</h3><div className="space-y-4 md:space-y-6">{user.certificates.length === 0 ? (<div className="py-10 bg-white dark:bg-slate-900 rounded-[2rem] border border-slate-100 dark:border-slate-800 text-center text-slate-400 font-bold text-xs uppercase tracking-widest">No certificates yet</div>) : (user.certificates.map(c => (<div key={c.id} className="bg-white dark:bg-slate-900 p-5 md:p-8 rounded-2xl md:rounded-[2.5rem] border border-slate-100 dark:border-slate-800 shadow-sm flex items-center justify-between group hover:shadow-xl active:scale-[0.98] transition-all"><div className="flex items-center gap-4 md:gap-6 min-w-0"><div className="w-12 h-12 md:w-16 md:h-16 bg-emerald-50 dark:bg-emerald-900/20 rounded-xl md:rounded-2xl flex items-center justify-center group-hover:rotate-3 transition-transform flex-shrink-0"><FileText className="w-6 h-6 md:w-8 md:h-8 text-emerald-600" /></div><div className="min-w-0"><h4 className="font-black text-sm md:text-base tracking-tight truncate">{c.title}</h4><p className="text-[8px] md:text-[10px] font-bold text-slate-400 uppercase tracking-widest mt-1 truncate">{c.workshopTitle}</p></div></div><a href={c.fileUrl} target="_blank" rel="noopener noreferrer" className="p-3 md:p-4 rounded-xl md:rounded-2xl bg-slate-50 dark:bg-slate-800 hover:bg-emerald-600 hover:text-white transition-all flex-shrink-0 ml-2"><Download className="w-4 h-4 md:w-5 md:h-5" /></a></div>)))}</div></div>
                </div>
             </div>
        )}

        {currentView === 'ADMIN_USERS' && user?.role === 'ADMIN' && (
            <div className="space-y-8 md:space-y-12 animate-in slide-in-from-bottom-8 duration-700 pb-12">
                <div className="flex flex-col md:flex-row md:items-end justify-between gap-6">
                    <div>
                        <h2 className="text-3xl md:text-5xl font-black tracking-tighter leading-none mb-3 md:mb-4">Directory</h2>
                        <p className="text-slate-500 font-bold text-sm md:text-lg">Manage platform access and assign roles.</p>
                    </div>
                    <div className="flex flex-col sm:flex-row gap-4 items-stretch sm:items-center">
                        <div className="relative group flex-1 sm:flex-none">
                            <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 group-focus-within:text-indigo-600 transition-colors" />
                            <Input placeholder="Search users..." className="pl-12 rounded-xl md:rounded-2xl h-12 md:h-14 sm:w-64 bg-white dark:bg-slate-900 border-2 border-slate-100 dark:border-slate-800 shadow-sm text-sm font-medium" value={userSearchQuery} onChange={e => setUserSearchQuery(e.target.value)} />
                        </div>
                        <div className="bg-white dark:bg-slate-900 p-4 rounded-2xl md:rounded-3xl border border-slate-100 dark:border-slate-800 shadow-sm flex items-center gap-4">
                            <div className="w-10 h-10 bg-indigo-50 dark:bg-indigo-900/30 rounded-xl flex items-center justify-center text-indigo-600"><Users className="w-5 h-5" /></div>
                            <div><p className="text-sm font-black leading-none">{users.length}</p><p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest mt-1">Total Members</p></div>
                        </div>
                    </div>
                </div>
                <div className="bg-white dark:bg-slate-900 rounded-2xl md:rounded-[3rem] border border-slate-100 dark:border-slate-800 shadow-xl overflow-hidden">
                    <div className="overflow-x-auto no-scrollbar">
                        <table className="w-full text-left border-collapse min-w-[700px] md:min-w-[800px]">
                            <thead>
                                <tr className="bg-slate-50 dark:bg-slate-800/50">
                                    <th className="px-6 md:px-8 py-5 md:py-6 text-[9px] md:text-[11px] font-black uppercase tracking-[0.2em] text-slate-400">Profile</th>
                                    <th className="px-6 md:px-8 py-5 md:py-6 text-[9px] md:text-[11px] font-black uppercase tracking-[0.2em] text-slate-400 text-center">Status</th>
                                    <th className="px-6 md:px-8 py-5 md:py-6 text-[9px] md:text-[11px] font-black uppercase tracking-[0.2em] text-slate-400">Department Control</th>
                                    <th className="px-6 md:px-8 py-5 md:py-6 text-[9px] md:text-[11px] font-black uppercase tracking-[0.2em] text-slate-400 text-right">Actions</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-50 dark:divide-slate-800">
                                {filteredUsers.length === 0 ? (
                                    <tr><td colSpan={4} className="px-8 py-20 text-center text-slate-400 font-bold">No members found matching your search.</td></tr>
                                ) : (
                                    filteredUsers.map(u => (
                                        <tr key={u.id} className="hover:bg-slate-50/50 dark:hover:bg-slate-800/20 transition-colors group">
                                            <td className="px-6 md:px-8 py-4 md:py-6 min-w-[200px]">
                                                <div className="flex items-center gap-3 md:gap-4">
                                                    <div className="w-10 h-10 md:w-12 md:h-12 rounded-xl md:rounded-2xl bg-slate-100 dark:bg-slate-800 overflow-hidden border border-slate-200 dark:border-slate-700 shadow-sm flex-shrink-0">
                                                        {u.avatarUrl ? <img src={u.avatarUrl} className="w-full h-full object-cover" /> : <UserIcon className="w-5 h-5 md:w-6 md:h-6 m-2.5 md:m-3 text-slate-300" />}
                                                    </div>
                                                    <div className="min-w-0"><p className="font-black text-sm md:text-base tracking-tight truncate">{u.name}</p><p className="text-[10px] md:text-xs text-slate-400 font-medium truncate">{u.email}</p></div>
                                                </div>
                                            </td>
                                            <td className="px-6 md:px-8 py-4 md:py-6 text-center">
                                                <div className={`inline-flex px-3 py-0.5 rounded-full text-[8px] md:text-[9px] font-black uppercase tracking-wider ${u.role === 'ADMIN' ? 'bg-rose-100 text-rose-700' : u.role === 'OFFICER' ? 'bg-amber-100 text-amber-700' : 'bg-indigo-100 text-indigo-700'}`}>{u.role}</div>
                                            </td>
                                            <td className="px-6 md:px-8 py-4 md:py-6">
                                                {u.role === 'OFFICER' ? (
                                                    <div className="flex flex-wrap items-center gap-1 bg-slate-50 dark:bg-slate-800/40 p-1 rounded-xl w-fit">
                                                        {(['CES', 'TCC', 'ICSO', 'GENERAL'] as Organization[]).map(org => (
                                                            <button key={org} onClick={() => handleUpdateOfficerOrg(u, org)} className={`px-2.5 py-1.5 rounded-lg text-[8px] font-black uppercase tracking-widest transition-all ${u.officerOrg === org ? 'bg-white dark:bg-slate-900 text-indigo-600 shadow-sm ring-1 ring-slate-200 dark:ring-slate-700' : 'text-slate-400 hover:text-slate-600 dark:hover:text-slate-200'}`}>{org}</button>
                                                        ))}
                                                    </div>
                                                ) : (<span className="text-slate-300 text-[10px] italic font-bold uppercase tracking-widest opacity-50">Locked</span>)}
                                            </td>
                                            <td className="px-6 md:px-8 py-4 md:py-6 text-right">
                                                <div className="flex justify-end gap-1.5 md:gap-2">
                                                    {u.id !== user.id && (
                                                        <>
                                                            <button onClick={() => handlePromoteUser(u)} className="p-2 md:p-3 rounded-lg md:rounded-2xl hover:bg-emerald-50 dark:hover:bg-emerald-900/20 text-slate-300 hover:text-emerald-600 transition-all flex items-center gap-1.5 text-[8px] md:text-[10px] font-black uppercase tracking-widest disabled:opacity-20 active:scale-90" title="Promote"><ArrowUpCircle className="w-4 h-4 md:w-5 md:h-5" /> <span className="hidden sm:inline">Promote</span></button>
                                                            <button onClick={() => handleDemoteUser(u)} className="p-2 md:p-3 rounded-lg md:rounded-2xl hover:bg-rose-50 dark:hover:bg-rose-900/20 text-slate-300 hover:text-rose-600 transition-all flex items-center gap-1.5 text-[8px] md:text-[10px] font-black uppercase tracking-widest disabled:opacity-20 active:scale-90" title="Demote"><ArrowDownCircle className="w-4 h-4 md:w-5 md:h-5" /> <span className="hidden sm:inline">Demote</span></button>
                                                        </>
                                                    )}
                                                </div>
                                            </td>
                                        </tr>
                                    ))
                                )}
                            </tbody>
                        </table>
                    </div>
                </div>
            </div>
        )}

        {currentView === 'ANALYTICS' && user?.role === 'ADMIN' && (
            <div className="space-y-8 md:space-y-12 animate-in fade-in duration-700 pb-20 px-2 md:px-0">
                <div className="flex flex-col md:flex-row md:items-end justify-between gap-6">
                    <div>
                        <div className="inline-flex items-center space-x-2 px-4 py-1.5 rounded-full bg-indigo-50 dark:bg-indigo-900/30 text-indigo-700 dark:text-indigo-300 text-[9px] md:text-[10px] font-black uppercase tracking-widest mb-3 md:mb-4"><PieChart className="w-4 h-4" /><span>Community Intelligence</span></div>
                        <h2 className="text-3xl md:text-5xl font-black tracking-tighter leading-none">Intelligence Hub</h2>
                        <p className="text-slate-500 font-bold text-sm md:text-lg mt-2">Global metrics across all organizations.</p>
                    </div>
                </div>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4 md:gap-8">
                    <div className="bg-white dark:bg-slate-900 p-6 md:p-8 rounded-[1.5rem] md:rounded-[3rem] border border-slate-100 dark:border-slate-800 shadow-xl relative overflow-hidden group"><div className="absolute top-0 right-0 p-4 opacity-5 group-hover:scale-110 transition-transform"><Activity className="w-16 h-16 md:w-20 md:h-20" /></div><p className="text-[8px] md:text-[11px] font-black uppercase tracking-[0.2em] text-slate-400 mb-1.5 md:mb-2">Total</p><p className="text-3xl md:text-5xl font-black tracking-tighter">{users.length}</p><div className="mt-3 md:mt-4 flex items-center gap-1.5 text-emerald-500 font-black text-[8px] md:text-xs"><ArrowUpCircle className="w-3 h-3 md:w-4 md:h-4" /> +{analyticsData.newMembers} growth</div></div>
                    <div className="bg-white dark:bg-slate-900 p-6 md:p-8 rounded-[1.5rem] md:rounded-[3rem] border border-slate-100 dark:border-slate-800 shadow-xl group"><p className="text-[8px] md:text-[11px] font-black uppercase tracking-[0.2em] text-slate-400 mb-1.5 md:mb-2">Active</p><p className="text-3xl md:text-5xl font-black tracking-tighter">{workshops.length}</p><p className="mt-3 md:mt-4 text-slate-400 font-bold text-[8px] md:text-[10px] uppercase tracking-widest truncate">Live Sessions</p></div>
                    <div className="bg-white dark:bg-slate-900 p-6 md:p-8 rounded-[1.5rem] md:rounded-[3rem] border border-slate-100 dark:border-slate-800 shadow-xl group"><p className="text-[8px] md:text-[11px] font-black uppercase tracking-[0.2em] text-slate-400 mb-1.5 md:mb-2">Awards</p><p className="text-3xl md:text-5xl font-black tracking-tighter">{analyticsData.totalAwards}</p><p className="mt-3 md:mt-4 text-slate-400 font-bold text-[8px] md:text-[10px] uppercase tracking-widest truncate">Credentials</p></div>
                    <div className="bg-indigo-600 p-6 md:p-8 rounded-[1.5rem] md:rounded-[3rem] border border-indigo-500 shadow-xl group text-white col-span-2 md:col-span-1"><p className="text-[8px] md:text-[11px] font-black uppercase tracking-[0.2em] text-white/60 mb-1.5 md:mb-2">Leader</p><p className="text-2xl md:text-4xl font-black tracking-tighter truncate">{analyticsData.mostActive?.name || 'N/A'}</p><div className="mt-3 md:mt-4 flex items-center gap-1.5 text-white/80 font-black text-[8px] md:text-xs"><Zap className="w-3.5 h-3.5 md:w-4 md:h-4 fill-current" /> High activity</div></div>
                </div>
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 md:gap-12">
                    <div className="lg:col-span-2 bg-white dark:bg-slate-900 p-6 md:p-10 rounded-[2.5rem] md:rounded-[3.5rem] border border-slate-100 dark:border-slate-800 shadow-xl">
                        <div className="flex items-center justify-between mb-10"><h3 className="text-xl md:text-2xl font-black flex items-center gap-3 md:gap-4 tracking-tight"><TrendingUp className="w-6 h-6 md:w-8 md:h-8 text-indigo-500" /> Attendance Trends</h3></div>
                        <AttendanceTrendChart workshops={workshops} />
                        <div className="mt-8 grid grid-cols-3 gap-4 border-t border-slate-100 dark:border-slate-800 pt-8">
                            <div className="text-center"><p className="text-[8px] md:text-[9px] font-black text-slate-400 uppercase tracking-widest mb-1">Max Peak</p><p className="text-lg md:text-2xl font-black text-indigo-600">{Math.max(...workshops.map(w => w.participants.length), 0)}</p></div>
                            <div className="text-center border-x border-slate-100 dark:border-slate-800"><p className="text-[8px] md:text-[9px] font-black text-slate-400 uppercase tracking-widest mb-1">Avg Rate</p><p className="text-lg md:text-2xl font-black text-emerald-600">{(workshops.reduce((acc, w) => acc + w.participants.length, 0) / (workshops.length || 1)).toFixed(1)}</p></div>
                            <div className="text-center"><p className="text-[8px] md:text-[9px] font-black text-slate-400 uppercase tracking-widest mb-1">Last Delta</p><p className="text-lg md:text-2xl font-black text-amber-600">{workshops.length > 1 ? workshops[workshops.length-1].participants.length - workshops[workshops.length-2].participants.length : '0'}</p></div>
                        </div>
                    </div>
                    <div className="bg-white dark:bg-slate-900 p-6 md:p-10 rounded-2xl md:rounded-[3.5rem] border border-slate-100 dark:border-slate-800 shadow-xl overflow-hidden">
                        <h3 className="text-lg md:text-2xl font-black mb-8 md:mb-10 flex items-center gap-3 md:gap-4"><Zap className="w-6 h-6 md:w-8 md:h-8 text-amber-500" /> Rankings</h3>
                        <div className="space-y-6 md:space-y-8">
                            {analyticsData.perOrg.sort((a,b) => b.score - a.score).map((org, idx) => (
                                <div key={org.name} className="relative">
                                    <div className="flex justify-between items-end mb-2.5">
                                        <div className="flex items-center gap-3 md:gap-4 min-w-0"><span className="text-slate-200 dark:text-slate-800 font-black text-xl md:text-2xl flex-shrink-0">#{idx+1}</span><div className="min-w-0"><span className="font-black text-sm md:text-lg tracking-tight truncate block">{org.name}</span><p className="text-[8px] md:text-[9px] font-black text-slate-400 uppercase tracking-widest truncate">{org.workshops} workshops • {org.participants} parts</p></div></div>
                                        <span className="font-black text-[10px] md:text-sm text-indigo-600 flex-shrink-0 ml-2">{org.score} pts</span>
                                    </div>
                                    <div className="h-2 md:h-3 bg-slate-50 dark:bg-slate-800 rounded-full overflow-hidden"><div className={`h-full rounded-full transition-all duration-1000 ${org.name === 'CES' ? 'bg-ces' : org.name === 'TCC' ? 'bg-tcc' : org.name === 'ICSO' ? 'bg-icso' : 'bg-slate-400'}`} style={{ width: `${Math.max(5, (org.score / (analyticsData.mostActive?.score || 1)) * 100)}%` }}></div></div>
                                </div>
                            ))}
                        </div>
                    </div>
                </div>
            </div>
        )}
      </main>

      <MobileBottomNav user={user} currentView={currentView} onNavigate={setCurrentView} />

      {/* Modals */}
      <Modal isOpen={isCreatingPost} onClose={() => { setIsCreatingPost(false); setEditingPost(null); }} title={editingPost ? "Edit Update" : "Create Update"}>
          <form onSubmit={handleCreateOrUpdatePost} className="space-y-5 md:space-y-6">
              <div className="md:col-span-2">
                  <label className="text-[9px] md:text-[10px] font-black uppercase text-slate-400 tracking-widest block mb-2">Banner Asset</label>
                  <div className="w-full h-28 md:h-32 bg-slate-50 dark:bg-slate-800/50 rounded-xl md:rounded-2xl border-2 border-dashed border-slate-200 dark:border-slate-700 flex flex-col items-center justify-center relative group overflow-hidden transition-all hover:border-indigo-500/50">
                      {editingPost?.imageUrl && !isSavingPost ? (
                          <img src={editingPost.imageUrl} className="absolute inset-0 w-full h-full object-cover" />
                      ) : (
                          <ImageIcon className="w-6 h-6 md:w-8 md:h-8 text-slate-300 mb-1.5 md:mb-2" />
                      )}
                      <p className="text-[8px] md:text-[9px] font-black uppercase text-slate-400 tracking-widest relative z-10 bg-white/80 dark:bg-slate-900/80 px-2 py-0.5 rounded">Change Banner</p>
                      <input type="file" name="image" accept="image/*" className="absolute inset-0 opacity-0 cursor-pointer z-20"/>
                  </div>
              </div>
              <Input name="title" label="Update Title" defaultValue={editingPost?.title} placeholder="What's the news?" required />
              <div className="space-y-1"><label className="text-xs md:text-sm font-black text-slate-700 dark:text-slate-300 uppercase tracking-widest">Description</label><textarea name="content" defaultValue={editingPost?.content} className="w-full h-32 p-4 rounded-xl md:rounded-2xl bg-white dark:bg-slate-900 border-2 border-slate-100 dark:border-slate-800 focus:ring-2 focus:ring-indigo-500 transition-all outline-none text-sm font-medium" placeholder="Tell everyone the details..." required></textarea></div>
              <div className="space-y-1"><label className="text-xs md:text-sm font-black text-slate-700 dark:text-slate-300 uppercase tracking-widest">Organization</label><select name="org" defaultValue={editingPost?.organization || activeOrg} disabled={user?.role === 'OFFICER'} className="w-full h-11 md:h-12 px-4 rounded-xl md:rounded-2xl bg-white dark:bg-slate-900 border-2 border-slate-100 dark:border-slate-800 focus:ring-2 focus:ring-indigo-500 transition-all outline-none text-xs md:text-sm font-black uppercase tracking-wider disabled:opacity-50"><option value="GENERAL">General</option><option value="CES">CES</option><option value="TCC">TCC</option><option value="ICSO">ICSO</option></select></div>
              <div className="flex flex-col sm:flex-row justify-end gap-3 pt-4"><Button variant="outline" type="button" onClick={() => { setIsCreatingPost(false); setEditingPost(null); }} className="rounded-xl px-8 h-12 font-black order-last sm:order-first" disabled={isSavingPost}>Cancel</Button><Button type="submit" className="rounded-xl px-8 h-12 font-black" isLoading={isSavingPost}>{editingPost ? "Save Changes" : "Post Update"}</Button></div>
          </form>
      </Modal>

      <Modal isOpen={isCreatingWorkshop} onClose={() => { setIsCreatingWorkshop(false); setEditingWorkshop(null); }} title={editingWorkshop ? "Edit Session" : "Create Session"}>
          <form onSubmit={handleCreateOrUpdateWorkshop} className="space-y-5 md:space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 md:gap-6">
                <div className="md:col-span-2"><label className="text-[9px] md:text-[10px] font-black uppercase text-slate-400 tracking-widest block mb-2">Banner Asset</label><div className="w-full h-28 md:h-32 bg-slate-50 dark:bg-slate-800/50 rounded-xl md:rounded-2xl border-2 border-dashed border-slate-200 dark:border-slate-700 flex flex-col items-center justify-center relative group overflow-hidden transition-all hover:border-indigo-500/50">{editingWorkshop?.bannerUrl && !isSavingWorkshop ? (<img src={editingWorkshop.bannerUrl} className="absolute inset-0 w-full h-full object-cover" />) : (<ImageIcon className="w-6 h-6 md:w-8 md:h-8 text-slate-300 mb-1.5 md:mb-2" />)}<p className="text-[8px] md:text-[9px] font-black uppercase text-slate-400 tracking-widest relative z-10 bg-white/80 dark:bg-slate-900/80 px-2 py-0.5 rounded">Change Banner</p><input type="file" name="banner" accept="image/*" className="absolute inset-0 opacity-0 cursor-pointer z-20"/></div></div>
                <div className="space-y-1.5 md:space-y-2"><label className="text-[9px] md:text-[10px] font-black uppercase text-slate-400 tracking-widest block mb-1">Badge</label><div className="w-full h-20 md:h-24 bg-slate-50 dark:bg-slate-800/50 rounded-xl md:rounded-2xl border-2 border-dashed border-slate-200 dark:border-slate-700 flex flex-col items-center justify-center relative overflow-hidden hover:border-indigo-500/50">{editingWorkshop?.badgeUrl ? <img src={editingWorkshop.badgeUrl} className="absolute inset-0 w-full h-full object-contain p-2" /> : <Award className="w-5 h-5 md:w-6 md:h-6 text-slate-300 mb-1" />}<input type="file" name="badge" accept="image/*" className="absolute inset-0 opacity-0 cursor-pointer z-20"/></div></div>
                <div className="space-y-1.5 md:space-y-2"><label className="text-[9px] md:text-[10px] font-black uppercase text-slate-400 tracking-widest block mb-1">Certificate</label><div className="w-full h-20 md:h-24 bg-slate-50 dark:bg-slate-800/50 rounded-xl md:rounded-2xl border-2 border-dashed border-slate-200 dark:border-slate-700 flex flex-col items-center justify-center relative overflow-hidden hover:border-indigo-500/50">{editingWorkshop?.certificateUrl ? <FileText className="w-5 h-5 md:w-6 md:h-6 text-emerald-500" /> : <FileUp className="w-5 h-5 md:w-6 md:h-6 text-slate-300 mb-1" />}<input type="file" name="certificate" accept="image/*,application/pdf" className="absolute inset-0 opacity-0 cursor-pointer z-20"/></div></div>
              </div>
              <Input name="title" label="Session Title" defaultValue={editingWorkshop?.title} placeholder="e.g. Creative Coding Essentials" required />
              <div className="space-y-1"><label className="text-xs md:text-sm font-black text-slate-700 dark:text-slate-300 uppercase tracking-widest">Outcomes</label><textarea name="desc" defaultValue={editingWorkshop?.description} className="w-full h-28 md:h-32 p-4 rounded-xl md:rounded-2xl bg-white dark:bg-slate-900 border-2 border-slate-100 dark:border-slate-800 outline-none text-sm font-medium focus:ring-2 focus:ring-indigo-500 transition-all" placeholder="What will students learn?" required></textarea></div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 md:gap-4"><Input name="date" type="datetime-local" label="Session Date & Time" defaultValue={editingWorkshop?.date ? new Date(editingWorkshop.date).toISOString().slice(0, 16) : ''} required /><Input name="limit" type="number" label="Max Seats (0 = Unlim)" defaultValue={editingWorkshop?.limit} placeholder="0" /></div>
              <div className="space-y-1"><label className="text-xs md:text-sm font-black text-slate-700 dark:text-slate-300 uppercase tracking-widest">Provider</label><select name="org" defaultValue={editingWorkshop?.organization || activeOrg} disabled={user?.role === 'OFFICER'} className="w-full h-11 md:h-12 px-4 rounded-xl md:rounded-2xl bg-white dark:bg-slate-900 border-2 border-slate-100 dark:border-slate-800 outline-none text-xs md:text-sm font-black uppercase tracking-wider disabled:opacity-50"><option value="GENERAL">General</option><option value="CES">CES</option><option value="TCC">TCC</option><option value="ICSO">ICSO</option></select></div>
              <div className="flex flex-col sm:flex-row justify-end gap-3 pt-4"><Button variant="outline" type="button" onClick={() => { setIsCreatingWorkshop(false); setEditingWorkshop(null); }} className="rounded-xl px-8 h-12 font-black order-last sm:order-first" disabled={isSavingWorkshop}>Cancel</Button><Button type="submit" className="rounded-xl px-8 h-12 font-black bg-emerald-600 hover:bg-emerald-700" isLoading={isSavingWorkshop}>{editingWorkshop ? "Save Changes" : "Create Session"}</Button></div>
          </form>
      </Modal>

      <Modal isOpen={isEditingProfile} onClose={() => setIsEditingProfile(false)} title="Personal Settings">
          <form onSubmit={handleUpdateProfile} className="space-y-6 md:space-y-8">
              <div className="flex flex-col items-center"><div className="w-28 h-28 md:w-32 md:h-32 rounded-3xl md:rounded-[2rem] bg-slate-100 dark:bg-slate-800 border-4 border-white dark:border-slate-900 shadow-xl overflow-hidden mb-4 relative group cursor-pointer">{user?.avatarUrl ? <img src={user.avatarUrl} className="w-full h-full object-cover" /> : <UserIcon className="w-12 h-12 md:w-16 md:h-16 m-8 text-slate-300" />}<div className="absolute inset-0 bg-black/50 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"><Upload className="w-5 h-5 md:w-6 md:h-6 text-white" /></div><input type="file" name="avatar" accept="image/*" className="absolute inset-0 opacity-0 cursor-pointer"/></div><p className="text-[9px] font-black uppercase text-slate-400 tracking-widest">Update Photo</p></div>
              <Input name="name" label="Display Name" defaultValue={user?.name} placeholder="Your name" required />
              <div className="bg-slate-50 dark:bg-slate-800/40 p-5 md:p-6 rounded-2xl space-y-2 border border-slate-100 dark:border-slate-800"><p className="text-[9px] md:text-[10px] font-black uppercase text-slate-400 tracking-widest">Account Details</p><p className="text-xs md:text-sm font-medium text-slate-500 truncate">{user?.email}</p><div className="inline-flex px-3 py-1 bg-white dark:bg-slate-900 rounded-lg text-[9px] font-black uppercase text-indigo-600 tracking-wider shadow-sm ring-1 ring-slate-100 dark:ring-slate-800">{user?.role} Access</div></div>
              <div className="flex flex-col sm:flex-row justify-end gap-3 pt-4"><Button variant="outline" type="button" onClick={() => setIsEditingProfile(false)} className="rounded-xl px-8 h-12 font-black order-last sm:order-first">Cancel</Button><Button type="submit" className="rounded-xl px-8 h-12 font-black">Save Settings</Button></div>
          </form>
      </Modal>

      <ChatWidget />
    </div>
  );
}

const ChatWidget: React.FC = () => {
    const [isOpen, setIsOpen] = useState(false);
    const [messages, setMessages] = useState<ChatMessage[]>([{ role: 'model', text: "Hi! I'm Echo. How can I assist you with Echo-mmunity today?" }]);
    const [input, setInput] = useState('');
    const [isTyping, setIsTyping] = useState(false);
    const scrollRef = useRef<HTMLDivElement>(null);

    useEffect(() => { if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight; }, [messages, isTyping]);

    const handleSend = async () => {
        if (!input.trim()) return;
        const userMsg = input; setInput('');
        setMessages(prev => [...prev, { role: 'user', text: userMsg }]);
        setIsTyping(true);
        const history = messages.map(m => ({ role: m.role, parts: [{ text: m.text }] }));
        const response = await generateChatResponse(history, userMsg);
        setMessages(prev => [...prev, { role: 'model', text: response }]);
        setIsTyping(false);
    };

    return (
        <div className="fixed bottom-24 md:bottom-10 right-4 md:right-10 z-[100]">
            {isOpen ? (
                <div className="w-[calc(100vw-2rem)] md:w-[26rem] h-[80vh] md:h-[38rem] bg-white dark:bg-slate-900 rounded-[2rem] md:rounded-[2.5rem] shadow-2xl border border-slate-200 dark:border-slate-800 flex flex-col overflow-hidden animate-in slide-in-from-bottom-12 duration-500">
                    <div className="p-5 md:p-7 bg-indigo-600 flex justify-between items-center text-white relative overflow-hidden">
                        <div className="absolute top-0 right-0 p-4 opacity-10"><Bot className="w-16 h-16 md:w-20 md:h-20" /></div>
                        <div className="flex items-center space-x-3 md:space-x-4 relative z-10">
                            <div className="w-10 h-10 md:w-12 md:h-12 bg-white rounded-xl md:rounded-2xl flex items-center justify-center overflow-hidden shadow-lg"><img src={LOGO_URL} alt="" className="w-8 h-8 md:w-10 md:h-10 object-contain" /></div>
                            <div>
                                <p className="font-black text-base md:text-lg tracking-tight">Echo Assistant</p>
                                <p className="text-[9px] md:text-[10px] font-bold text-indigo-100 uppercase tracking-widest flex items-center gap-1.5"><span className="w-1.5 h-1.5 bg-emerald-400 rounded-full animate-pulse"></span> Online</p>
                            </div>
                        </div>
                        <button onClick={() => setIsOpen(false)} className="p-2 rounded-xl hover:bg-white/10 transition-colors relative z-10"><X className="w-5 h-5 md:w-6 md:h-6" /></button>
                    </div>
                    <div ref={scrollRef} className="flex-1 overflow-y-auto p-4 md:p-6 space-y-5 md:space-y-6 bg-slate-50/80 dark:bg-slate-950/50 no-scrollbar">
                        {messages.map((m, i) => (
                            <div key={i} className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                                <div className={`max-w-[85%] p-4 md:p-5 rounded-2xl md:rounded-[1.5rem] text-xs md:text-sm shadow-sm leading-relaxed ${m.role === 'user' ? 'bg-indigo-600 text-white rounded-tr-none font-medium' : 'bg-white dark:bg-slate-800 dark:text-slate-200 border border-slate-100 dark:border-slate-700 rounded-tl-none font-medium'}`}>
                                    {m.text}
                                </div>
                            </div>
                        ))}
                        {isTyping && (
                            <div className="flex space-x-1.5 p-3 md:p-4 bg-white/50 dark:bg-slate-800/30 w-fit rounded-xl md:rounded-2xl border border-slate-100 dark:border-slate-700">
                                <span className="w-1.5 h-1.5 bg-indigo-500 rounded-full animate-bounce"></span>
                                <span className="w-1.5 h-1.5 bg-indigo-500 rounded-full animate-bounce delay-100"></span>
                                <span className="w-1.5 h-1.5 bg-indigo-500 rounded-full animate-bounce delay-200"></span>
                            </div>
                        )}
                    </div>
                    <div className="p-4 md:p-6 bg-white dark:bg-slate-900 border-t border-slate-100 dark:border-slate-800 flex gap-2 md:gap-3">
                        <input value={input} onChange={e => setInput(e.target.value)} onKeyDown={e => e.key === 'Enter' && handleSend()} placeholder="Type a message..." className="flex-1 bg-slate-100 dark:bg-slate-800 border-none rounded-xl md:rounded-2xl px-4 md:px-6 py-3 md:py-4 text-xs md:text-sm font-medium focus:ring-4 focus:ring-indigo-500/10 outline-none transition-all" />
                        <button onClick={handleSend} className="bg-indigo-600 text-white w-11 h-11 md:w-14 md:h-14 rounded-xl md:rounded-2xl flex items-center justify-center active:scale-90 transition-all shadow-xl shadow-indigo-600/30 flex-shrink-0"><Send className="w-5 h-5 md:w-6 md:h-6" /></button>
                    </div>
                </div>
            ) : (
                <button onClick={() => setIsOpen(true)} className="w-14 h-14 md:w-20 md:h-20 bg-indigo-600 text-white rounded-2xl md:rounded-[2rem] shadow-2xl flex items-center justify-center active:scale-90 transition-all group overflow-hidden border-4 border-white dark:border-slate-900 ring-4 ring-indigo-600/10">
                    <img src={LOGO_URL} alt="" className="w-8 h-8 md:w-14 md:h-14 object-contain transition-transform group-hover:scale-110" />
                </button>
            )}
        </div>
    );
}
