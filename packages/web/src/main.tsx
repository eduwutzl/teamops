import * as React from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter, NavLink, Route, Routes, useLocation } from 'react-router-dom';
import { Activity, BarChart3, Bot, Boxes, Building2, CalendarClock, Gauge, History, LayoutDashboard, LogOut, Menu, Moon, Plug, ScrollText, ShieldAlert, Siren, Sun, Wrench, X } from 'lucide-react';
import './theme.css';
import { AppContext, Loading, Toasts, type Me } from '@/components/common';
import { Button } from '@/components/ui/button';
import { TooltipProvider } from '@/components/ui/controls';
import { Input, Label } from '@/components/ui/input';
import { api } from '@/lib/api';
import { cn } from '@/lib/utils';
import Agents from '@/pages/Agents';
import AgentEditor from '@/pages/AgentEditor';
import Arms from '@/pages/Arms';
import Capacity from '@/pages/Capacity';
import Conflicts from '@/pages/Conflicts';
import Corp from '@/pages/Corp';
import Groups from '@/pages/Groups';
import HistoryPage from '@/pages/History';
import Home from '@/pages/Home';
import Problems from '@/pages/Problems';
import Reports from '@/pages/Reports';
import Routines from '@/pages/Routines';
import Rules from '@/pages/Rules';
import Tools from '@/pages/Tools';

const NAV = [
  { to: '/', label: 'Home', icon: LayoutDashboard, end: true },
  { to: '/capacidade', label: 'Capacidade', icon: Gauge },
  { to: '/problemas', label: 'Problemas', icon: Siren },
  { to: '/corporacao', label: 'Corporação', icon: Building2 },
  { to: '/regras', label: 'Regras gerais', icon: ScrollText },
  { to: '/ferramentas', label: 'Ferramentas', icon: Wrench },
  { to: '/bracos', label: 'Braços', icon: Plug },
  { to: '/grupos', label: 'Grupos', icon: Boxes },
  { to: '/agentes', label: 'Agentes', icon: Bot },
  { to: '/rotinas', label: 'Tarefas recorrentes', icon: CalendarClock },
  { to: '/conflitos', label: 'Conflitos', icon: ShieldAlert },
  { to: '/relatorios', label: 'Relatórios', icon: BarChart3 },
  { to: '/historico', label: 'Histórico', icon: History },
];

function Logo() {
  return (
    <div className="flex items-center gap-2.5">
      <span className="flex size-8 items-center justify-center rounded-lg bg-brand text-brand-foreground"><Activity className="size-[18px]" strokeWidth={2.6} /></span>
      <span className="text-[17px] font-semibold tracking-tight">TeamOps</span>
    </div>
  );
}

function useTheme() {
  const [dark, setDark] = React.useState(() => document.documentElement.classList.contains('dark'));
  const toggle = () => {
    const next = !dark;
    document.documentElement.classList.toggle('dark', next);
    try { localStorage.setItem('teamops-theme', next ? 'dark' : 'light'); } catch { /* private mode */ }
    setDark(next);
  };
  return { dark, toggle };
}

function Shell({ me, onLogout }: { me: Me; onLogout: () => void }) {
  const [open, setOpen] = React.useState(false);
  const { dark, toggle } = useTheme();
  const loc = useLocation();
  React.useEffect(() => { setOpen(false); window.scrollTo(0, 0); }, [loc.pathname]);
  return (
    <div className="min-h-dvh lg:pl-64">
      <header className="no-print sticky top-0 z-30 flex h-14 items-center justify-between border-b bg-background px-4 lg:hidden">
        <Logo />
        <Button variant="ghost" size="icon" onClick={() => setOpen(true)} aria-label="Abrir menu"><Menu /></Button>
      </header>
      {open && <div className="fixed inset-0 z-40 bg-black/60 lg:hidden" onClick={() => setOpen(false)} />}
      <aside className={cn('no-print fixed inset-y-0 left-0 z-50 flex w-64 flex-col border-r bg-sidebar transition-transform lg:translate-x-0', open ? 'translate-x-0' : '-translate-x-full')}>
        <div className="flex h-16 items-center justify-between px-5">
          <Logo />
          <Button variant="ghost" size="icon" className="lg:hidden" onClick={() => setOpen(false)} aria-label="Fechar menu"><X /></Button>
        </div>
        <div className="px-5 pb-3 text-xs text-muted-foreground truncate">{me.corp.name}</div>
        <nav className="flex-1 space-y-0.5 overflow-y-auto px-3 pb-4">
          {NAV.map((n) => (
            <NavLink key={n.to} to={n.to} end={n.end}
              className={({ isActive }) => cn('flex items-center gap-3 rounded-md px-3 py-2 text-sm transition-colors', isActive ? 'bg-brand-soft font-medium text-brand-ink' : 'text-muted-foreground hover:bg-muted hover:text-foreground')}>
              <n.icon className="size-[18px] shrink-0" strokeWidth={1.8} />
              <span className="truncate">{n.label}</span>
            </NavLink>
          ))}
        </nav>
        <div className="flex items-center gap-2 border-t p-3">
          <div className="min-w-0 flex-1 px-2">
            <div className="truncate text-sm font-medium">{me.user.name}</div>
            <div className="truncate text-xs text-muted-foreground">@{me.user.username}</div>
          </div>
          <Button variant="ghost" size="icon" onClick={toggle} aria-label={dark ? 'Usar tema claro' : 'Usar tema escuro'}>{dark ? <Sun /> : <Moon />}</Button>
          <Button variant="ghost" size="icon" onClick={onLogout} aria-label="Sair"><LogOut /></Button>
        </div>
      </aside>
      <main className="mx-auto max-w-[1280px] px-4 py-6 sm:px-8 sm:py-8">
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/capacidade" element={<Capacity />} />
          <Route path="/problemas" element={<Problems />} />
          <Route path="/corporacao" element={<Corp />} />
          <Route path="/regras" element={<Rules />} />
          <Route path="/ferramentas" element={<Tools />} />
          <Route path="/bracos" element={<Arms />} />
          <Route path="/grupos" element={<Groups />} />
          <Route path="/agentes" element={<Agents />} />
          <Route path="/agentes/:id" element={<AgentEditor />} />
          <Route path="/rotinas" element={<Routines />} />
          <Route path="/conflitos" element={<Conflicts />} />
          <Route path="/relatorios" element={<Reports />} />
          <Route path="/historico" element={<HistoryPage />} />
          <Route path="*" element={<Home />} />
        </Routes>
        <footer className="no-print mt-10 border-t pt-4 text-xs text-muted-foreground">TeamOps v{me.version} · <span className="font-mono">{me.commit}</span></footer>
      </main>
    </div>
  );
}

function Login({ onDone }: { onDone: () => void }) {
  const [pub, setPub] = React.useState<{ corp: string; demo: { username: string; password: string } | null; version?: string; commit?: string } | null>(null);
  const [username, setU] = React.useState('');
  const [password, setP] = React.useState('');
  const [error, setError] = React.useState('');
  const [busy, setBusy] = React.useState(false);
  React.useEffect(() => { api('/public').then(setPub).catch(() => {}); }, []);
  const submit = async (u = username, p = password) => {
    setBusy(true); setError('');
    try { await api('/auth/login', { body: { username: u, password: p } }); onDone(); }
    catch (e) { setError((e as Error).message); }
    finally { setBusy(false); }
  };
  return (
    <div className="flex min-h-dvh items-center justify-center p-4">
      <div className="w-full max-w-sm space-y-8">
        <div className="space-y-3">
          <Logo />
          <div>
            <h1 className="text-2xl font-semibold">Entrar</h1>
            <p className="mt-1 text-sm text-muted-foreground">{pub?.corp ? `Time ${pub.corp}` : 'Gestão de times de agentes de IA'}</p>
          </div>
        </div>
        <form className="space-y-4" onSubmit={(e) => { e.preventDefault(); submit(); }}>
          <div className="space-y-1.5"><Label htmlFor="u">Usuário</Label><Input id="u" autoFocus autoComplete="username" value={username} onChange={(e) => setU(e.target.value)} /></div>
          <div className="space-y-1.5"><Label htmlFor="p">Senha</Label><Input id="p" type="password" autoComplete="current-password" value={password} onChange={(e) => setP(e.target.value)} /></div>
          {error && <p className="text-sm text-crit" role="alert">{error}</p>}
          <Button type="submit" className="w-full" size="lg" disabled={busy || !username}>Entrar</Button>
        </form>
        {pub?.demo && (
          <div className="rounded-xl border p-4 text-sm">
            <div className="font-medium">Ambiente de demonstração</div>
            <p className="mt-1 text-muted-foreground">Dados fictícios. Usuário <code className="font-mono text-foreground">demo</code>, senha <code className="font-mono text-foreground">demo</code>.</p>
            <Button variant="outline" size="sm" className="mt-3" disabled={busy} onClick={() => submit(pub.demo!.username, pub.demo!.password)}>Entrar como demo</Button>
          </div>
        )}
        {pub?.version && <p className="text-center text-xs text-muted-foreground">TeamOps v{pub.version} · <span className="font-mono">{pub.commit}</span></p>}
      </div>
    </div>
  );
}

function App() {
  const [me, setMe] = React.useState<Me | null | undefined>(undefined);
  const [toasts, setToasts] = React.useState<{ id: number; text: string; tone: 'ok' | 'crit' }[]>([]);
  const load = React.useCallback(() => api<Me>('/me').then(setMe).catch(() => setMe(null)), []);
  React.useEffect(() => {
    load();
    const out = () => setMe(null);
    window.addEventListener('teamops:logout', out);
    return () => window.removeEventListener('teamops:logout', out);
  }, [load]);
  const toast = React.useCallback((text: string, tone: 'ok' | 'crit' = 'ok') => {
    const id = Date.now() + Math.random();
    setToasts((t) => [...t.slice(-3), { id, text, tone }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), tone === 'ok' ? 3500 : 7000);
  }, []);
  if (me === undefined) return <div className="p-8"><Loading /></div>;
  if (me === null) return <Login onDone={load} />;
  return (
    <AppContext.Provider value={{ me, refreshMe: load, toast }}>
      <TooltipProvider>
        <Shell me={me} onLogout={async () => { await api('/auth/logout', { method: 'POST' }).catch(() => {}); setMe(null); }} />
        <Toasts items={toasts} dismiss={(id) => setToasts((t) => t.filter((x) => x.id !== id))} />
      </TooltipProvider>
    </AppContext.Provider>
  );
}

createRoot(document.getElementById('root')!).render(<BrowserRouter><App /></BrowserRouter>);
