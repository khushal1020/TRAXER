import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { createRoot } from 'react-dom/client';
import {
  ArrowLeft, ArrowRight, ArrowUp, CalendarDays, Check, CircleHelp, Edit3,
  IndianRupee, Layers3, LoaderCircle, LockKeyhole, LogOut, Plus, ReceiptText,
  Search, Shuffle, Trash2, Wallet, X,
} from 'lucide-react';
import './styles.css';

const money = new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 2 });
const presetCategories = ['Food', 'Transport', 'Home', 'Health', 'Shopping', 'Bills', 'Entertainment', 'Other'];

async function api(path, options = {}) {
  const response = await fetch(`/api${path}`, {
    credentials: 'same-origin',
    ...options,
    headers: { ...(options.body ? { 'Content-Type': 'application/json' } : {}), ...options.headers },
  });
  if (response.status === 204) return null;
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw Object.assign(new Error(data.error || 'Something went wrong.'), { status: response.status, field: data.field });
  return data;
}

function localMonth() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
}

function formatDate(value) {
  return new Intl.DateTimeFormat('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })
    .format(new Date(`${value}T00:00:00`));
}

function AuthScreen({ onAuthenticated }) {
  const [mode, setMode] = useState('login');
  const [form, setForm] = useState({ displayName: '', email: '', password: '' });
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const submit = async (event) => {
    event.preventDefault(); setBusy(true); setError('');
    try {
      const data = await api(`/auth/${mode === 'register' ? 'register' : 'login'}`, { method: 'POST', body: JSON.stringify(form) });
      onAuthenticated(data.user);
    } catch (issue) { setError(issue.message); }
    finally { setBusy(false); }
  };
  return <main className="auth-shell" id="top">
    <header className="brandbar auth-brandbar">
      <Brand />
      <span className="header-note">YOUR PRIVATE DASHBOARD</span>
    </header>
    <section className="auth-card card-shadow" aria-labelledby="auth-heading">
      <div className="auth-icon"><Wallet size={22} strokeWidth={1.7} /></div>
      <p className="eyebrow">// YOUR MONEY, IN FOCUS</p>
      <h1 id="auth-heading">{mode === 'login' ? 'WELCOME BACK.' : 'START TRACKING.'}</h1>
      <p className="auth-lede">{mode === 'login' ? 'Sign in to see where your money is going.' : 'Create your private space to make every rupee count.'}</p>
      <form onSubmit={submit} className="auth-form">
        {mode === 'register' && <Field label="YOUR NAME" value={form.displayName} onChange={(value) => setForm({ ...form, displayName: value })} placeholder="e.g. Alex Morgan" autoComplete="name" required />}
        <Field label="EMAIL ADDRESS" type="email" value={form.email} onChange={(value) => setForm({ ...form, email: value })} placeholder="you@example.com" autoComplete="email" required />
        <Field label="PASSWORD" type="password" value={form.password} onChange={(value) => setForm({ ...form, password: value })} placeholder="At least 8 characters" autoComplete={mode === 'login' ? 'current-password' : 'new-password'} required />
        {error && <p className="form-error" role="alert">{error}</p>}
        <button className="button button-dark auth-submit" disabled={busy} type="submit">{busy ? <LoaderCircle className="spin" size={17} /> : <LockKeyhole size={16} />}{mode === 'login' ? 'SIGN IN' : 'CREATE ACCOUNT'} <ArrowRight size={16} /></button>
      </form>
      <p className="auth-switch">{mode === 'login' ? 'New to Traxer?' : 'Already have an account?'} <button type="button" onClick={() => { setMode(mode === 'login' ? 'register' : 'login'); setError(''); }}> {mode === 'login' ? 'Create an account' : 'Sign in'}</button></p>
      <div className="auth-privacy"><LockKeyhole size={13} /> YOUR FINANCIAL DATA STAYS PRIVATE</div>
    </section>
  </main>;
}

function Brand() {
  return <a className="brand" href="#top" aria-label="Traxer home"><span className="brand-wordmark">Traxer</span></a>;
}

function SiteFooter({ onReverseOrder }) {
  const configuredEmail = import.meta.env.VITE_CONTACT_EMAIL;
  const contactEmail = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(configuredEmail || '') ? configuredEmail : '';
  const githubUrl = 'https://github.com/khushal1020';
  const linkedInUrl = 'https://www.linkedin.com/in/khushal-umratkar-031394296/';
  const goToTop = () => window.scrollTo({ top: 0, behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' });
  return <footer className="site-footer">
    <div className="site-footer-inner app-shell">
      <section className="site-footer-about" id="about" aria-labelledby="footer-brand">
        <a className="site-footer-logo" id="footer-brand" href="#top" aria-label="Traxer home">Traxer</a>
        <p>Track your spending. Understand your habits. Stay in control of your money.</p>
      </section>
      <div className="site-footer-meta">
        <nav className="site-footer-links" aria-label="Footer navigation">
          {contactEmail && <a href={`mailto:${contactEmail}`}>Contact</a>}
          <a href={githubUrl} target="_blank" rel="noreferrer">GitHub</a>
          <a href={linkedInUrl} target="_blank" rel="noreferrer">LinkedIn</a>
          <a href="#about">About</a>
        </nav>
        <div className="site-footer-legal" id="contact">
          <span>Copyright {new Date().getFullYear()} Traxer</span>
          <span>Your financial records are private to your account.</span>
          {contactEmail && <a href={`mailto:${contactEmail}`}>{contactEmail}</a>}
        </div>
      </div>
    </div>
    <div className="footer-floats" aria-label="Quick actions">
      <button className="footer-float footer-float-light" type="button" aria-label="Back to top" title="Back to top" onClick={goToTop}><ArrowUp size={20} /></button>
      {onReverseOrder && <button className="footer-float footer-float-dark" type="button" aria-label="Reverse expense order" title="Reverse expense order" onClick={onReverseOrder}><Shuffle size={18} /></button>}
    </div>
  </footer>;
}

function Field({ label, value, onChange, type = 'text', placeholder = '', required = false, autoComplete, min, max, step, error, onBlur }) {
  const id = React.useId();
  return <label className={`field ${error ? 'field-invalid' : ''}`} htmlFor={id}><span className="field-label">{label}</span><input id={id} type={type} value={value} onChange={(event) => onChange(event.target.value)} placeholder={placeholder} required={required} autoComplete={autoComplete} min={min} max={max} step={step} onBlur={onBlur} aria-invalid={Boolean(error)} />{error && <span className="field-error">{error}</span>}</label>;
}

function Dashboard({ user, onSignOut }) {
  const [filters, setFilters] = useState({ q: '', category: '', min: '', max: '', from: '', to: '', sort: 'date', order: 'desc' });
  const [page, setPage] = useState(1);
  const [searchDraft, setSearchDraft] = useState('');
  const [data, setData] = useState(null);
  const [monthTotal, setMonthTotal] = useState(0);
  const [categories, setCategories] = useState(presetCategories);
  const [loading, setLoading] = useState(true);
  const [listError, setListError] = useState('');
  const [toast, setToast] = useState('');
  const [modal, setModal] = useState(null);
  const month = localMonth();

  useEffect(() => {
    const timeout = setTimeout(() => { setFilters((current) => ({ ...current, q: searchDraft })); setPage(1); }, 220);
    return () => clearTimeout(timeout);
  }, [searchDraft]);

  const query = useMemo(() => {
    const params = new URLSearchParams();
    for (const [key, value] of Object.entries(filters)) if (value !== '') params.set(key, value);
    params.set('page', String(page)); params.set('pageSize', '12');
    return params.toString();
  }, [filters, page]);

  const refresh = useCallback(async () => {
    setLoading(true); setListError('');
    try {
      const [list, dashboard, categoryData] = await Promise.all([
        api(`/expenses?${query}`), api(`/dashboard?month=${month}`), api('/categories'),
      ]);
      setData(list); setMonthTotal(dashboard.thisMonthTotal); setCategories(categoryData.categories);
      if (page > list.totalPages && list.totalPages > 0) setPage(list.totalPages);
    } catch (error) { setListError(error.message); setData(null); setMonthTotal(0); }
    finally { setLoading(false); }
  }, [query, month]);

  useEffect(() => { refresh(); }, [refresh]);
  useEffect(() => {
    if (!toast) return;
    const timeout = setTimeout(() => setToast(''), 3200);
    return () => clearTimeout(timeout);
  }, [toast]);

  const updateFilter = (key, value) => { setFilters((current) => ({ ...current, [key]: value })); setPage(1); };
  const clearFilters = () => { setSearchDraft(''); setFilters({ q: '', category: '', min: '', max: '', from: '', to: '', sort: 'date', order: 'desc' }); setPage(1); };
  const saveExpense = async (payload) => {
    if (modal?.expense) await api(`/expenses/${modal.expense.id}`, { method: 'PATCH', body: JSON.stringify(payload) });
    else await api('/expenses', { method: 'POST', body: JSON.stringify(payload) });
    setModal(null); setToast(modal?.expense ? 'Expense updated.' : 'Expense added.'); await refresh();
  };
  const deleteExpense = async (expense) => {
    if (!window.confirm(`Delete “${expense.description}”? This cannot be undone.`)) return;
    try { await api(`/expenses/${expense.id}`, { method: 'DELETE' }); setToast('Expense deleted.'); await refresh(); }
    catch (error) { setToast(error.message); }
  };
  const activeFilters = Boolean(filters.q || filters.category || filters.min || filters.max || filters.from || filters.to);
  const canClearFilters = Boolean(searchDraft) || activeFilters || filters.sort !== 'date' || filters.order !== 'desc';

  return <><div className="app-shell" id="top">
    <header className="brandbar"><Brand /><span className="header-note">YOUR PRIVATE DASHBOARD</span></header>
    <main>
      <section className="intro-row">
        <div><p className="eyebrow">// EXPENSE OVERVIEW</p><h1 className="greeting">GOOD TO SEE YOU, {user.displayName || 'FRIEND'}.</h1><p className="intro-copy">A clear picture of where your money is going.</p></div>
        <button className="button button-quiet signout-button" onClick={onSignOut}><LogOut size={16} /> SIGN OUT</button>
      </section>

      <section className="summary-grid" aria-label="Expense summary">
        <MetricCard icon={<CalendarDays />} label="THIS MONTH" value={money.format(monthTotal)} note={new Intl.DateTimeFormat('en-IN', { month: 'long', year: 'numeric' }).format(new Date(`${month}-01T00:00:00`)).toUpperCase()} />
        <MetricCard icon={<IndianRupee />} label="MATCHING TOTAL" value={money.format(data?.totalAmount || 0)} note={activeFilters ? 'FOR CURRENT FILTERS' : 'ALL YOUR RECORDS'} />
        <MetricCard icon={<Layers3 />} label="MATCHES" value={String(data?.totalCount || 0).padStart(2, '0')} note={activeFilters ? 'RECORDS MATCHING' : 'TOTAL RECORDS'} />
      </section>

      <section className="breakdown-panel card-shadow" aria-labelledby="breakdown-title">
        <div className="panel-heading"><div><p className="eyebrow">// SPENDING BREAKDOWN</p><h2 id="breakdown-title">BY CATEGORY</h2></div><span className="scope-label">BASED ON MATCHING RECORDS</span></div>
        <div className="breakdown-content">
          <div className="chart-wrap"><DonutChart categories={data?.categories || []} total={data?.totalAmount || 0} loading={loading} /></div>
          <div className="category-list" aria-label="Spending by category">
            {loading ? <div className="muted-note">Updating category totals…</div> : data?.categories?.length ? data.categories.map((item, index) => <CategoryRow key={item.category} category={item.category} amount={item.amount} total={data.totalAmount} index={index} />) : <div className="category-empty"><span className="empty-icon"><ReceiptText size={16} /></span><span>No category spending yet.<small>Add an expense to see your breakdown.</small></span></div>}
          </div>
        </div>
      </section>

      <section className="expenses-panel card-shadow" aria-labelledby="expenses-title">
        <div className="panel-heading expenses-heading"><div><p className="eyebrow">// YOUR RECORDS</p><h2 id="expenses-title">EXPENSES</h2></div><button className="button button-dark add-button" onClick={() => setModal({ expense: null })}><Plus size={17} /> ADD EXPENSE</button></div>
        <div className="advanced-filters">
          <fieldset className="filter-group search-group"><legend>Search and category</legend><div className="search-category-row"><label className="search-box"><span className="control-label">Description</span><Search size={16} /><span className="sr-only">Search description</span><input value={searchDraft} onChange={(event) => setSearchDraft(event.target.value)} placeholder="Search descriptions" /></label><label className="category-control"><span>Category</span><select value={filters.category} onChange={(event) => updateFilter('category', event.target.value)}><option value="">All categories</option>{categories.map((category) => <option key={category}>{category}</option>)}</select></label></div></fieldset>
          <fieldset className="filter-group amount-group"><legend>Amount range</legend><div className="range-fields"><label className="range-control"><span>Minimum</span><input aria-label="Minimum amount" type="number" min="0" step="0.01" placeholder="0" value={filters.min} onChange={(event) => updateFilter('min', event.target.value)} /></label><label className="range-control"><span>Maximum</span><input aria-label="Maximum amount" type="number" min="0" step="0.01" placeholder="No limit" value={filters.max} onChange={(event) => updateFilter('max', event.target.value)} /></label></div></fieldset>
          <fieldset className="filter-group date-group"><legend>Date range</legend><div className="range-fields"><label className="range-control date-control"><span>From</span><input aria-label="From date" type="date" value={filters.from} onChange={(event) => updateFilter('from', event.target.value)} /></label><label className="range-control date-control"><span>To</span><input aria-label="To date" type="date" value={filters.to} onChange={(event) => updateFilter('to', event.target.value)} /></label></div></fieldset>
          <fieldset className="filter-group sort-group"><legend>Sorting</legend><div className="sort-actions-row"><div className="sort-controls"><label className="sort-control"><span>Sort by</span><select id="sort-by" value={filters.sort} onChange={(event) => updateFilter('sort', event.target.value)}><option value="date">Date</option><option value="amount">Amount</option></select></label><label className="sort-control"><span>Order</span><select value={filters.order} onChange={(event) => updateFilter('order', event.target.value)}><option value="desc">Newest / highest</option><option value="asc">Oldest / lowest</option></select></label></div><button className="button button-quiet clear-filters" onClick={clearFilters} disabled={!canClearFilters}><X size={14} /> CLEAR FILTERS</button></div></fieldset>
        </div>
        {listError ? <div className="list-message error-state" role="alert"><CircleHelp size={20} /><div><strong>We couldn’t load your expenses.</strong><span>{listError}</span></div><button className="button button-outline" onClick={refresh}>TRY AGAIN</button></div> : loading && !data ? <div className="list-message"><LoaderCircle className="spin" size={20} /> Loading your records…</div> : data?.expenses?.length ? <div className="expense-list">
          {data.expenses.map((expense) => <ExpenseRow key={expense.id} expense={expense} onEdit={() => setModal({ expense })} onDelete={() => deleteExpense(expense)} />)}
        </div> : <div className="empty-state"><span className="empty-icon large"><ReceiptText size={21} /></span><h3>{activeFilters ? 'NO MATCHING EXPENSES.' : 'YOUR RECORDS START HERE.'}</h3><p>{activeFilters ? 'Try adjusting your search or filters.' : 'Add your first expense and get a clearer view of your spending.'}</p>{activeFilters ? <button className="button button-outline" onClick={clearFilters}>CLEAR FILTERS</button> : <button className="button button-dark" onClick={() => setModal({ expense: null })}><Plus size={16} /> ADD FIRST EXPENSE</button>}</div>}
        {data?.totalPages > 1 && <nav className="pagination" aria-label="Expense pages"><span>SHOWING {((page - 1) * data.pageSize) + 1}–{Math.min(page * data.pageSize, data.totalCount)} OF {data.totalCount}</span><div><button aria-label="Previous page" disabled={page <= 1 || loading} onClick={() => setPage(page - 1)}><ArrowLeft size={15} /></button><span>PAGE {page} / {data.totalPages}</span><button aria-label="Next page" disabled={page >= data.totalPages || loading} onClick={() => setPage(page + 1)}><ArrowRight size={15} /></button></div></nav>}
      </section>
    </main>
    <footer className="footer"><span>TRAXER <span className="footer-year">© {new Date().getFullYear()}</span></span><span><span className="save-dot" /> {loading ? 'UPDATING' : 'YOUR DATA IS SAVED'} <span className="footer-separator">/</span> {data?.totalCount || 0} RECORDS</span></footer>
    {toast && <div className="toast" role="status"><Check size={16} />{toast}<button aria-label="Dismiss message" onClick={() => setToast('')}><X size={14} /></button></div>}
    {modal && <ExpenseModal expense={modal.expense} categories={categories} onClose={() => setModal(null)} onSave={saveExpense} />}
  </div><SiteFooter onReverseOrder={() => updateFilter('order', filters.order === 'desc' ? 'asc' : 'desc')} /></>;
}

function MetricCard({ icon, label, value, note }) {
  return <article className="metric-card card-shadow"><div className="metric-top"><span className="metric-icon">{React.cloneElement(icon, { size: 17, strokeWidth: 1.7 })}</span><span className="metric-label">{label}</span></div><div className="metric-value">{value}</div><div className="metric-note">{note}</div></article>;
}

const chartColors = ['#171717', '#454545', '#727272', '#969696', '#b1b1b1', '#c5c5c5', '#d4d4d4', '#e2e2e2'];
function DonutChart({ categories, total, loading }) {
  const gradient = useMemo(() => {
    if (!categories.length || total <= 0) return 'conic-gradient(#e2e2e0 0deg 360deg)';
    let current = 0;
    const stops = categories.map((item, index) => {
      const next = current + (item.amount / total) * 360;
      const stop = `${chartColors[index % chartColors.length]} ${current}deg ${next}deg`;
      current = next;
      return stop;
    });
    return `conic-gradient(${stops.join(', ')})`;
  }, [categories, total]);
  return <div className="donut-outer" role="img" aria-label={`Category spending totals ${money.format(total)}`}><div className="donut-chart" style={{ background: gradient }}><div className="donut-hole"><span className="donut-kicker">TOTAL SPENDING</span><strong>{loading ? '—' : money.format(total)}</strong></div></div><span className="donut-tick tick-one" /><span className="donut-tick tick-two" /></div>;
}

function CategoryRow({ category, amount, total, index }) {
  const percent = total ? Math.round((amount / total) * 100) : 0;
  return <div className="category-row"><span className="category-swatch" style={{ backgroundColor: chartColors[index % chartColors.length] }} /><span className="category-name">{category}<small>{percent}% OF TOTAL</small></span><strong>{money.format(amount)}</strong></div>;
}

function ExpenseRow({ expense, onEdit, onDelete }) {
  return <article className="expense-row"><span className="expense-icon"><ReceiptText size={17} strokeWidth={1.7} /></span><div className="expense-description"><strong>{expense.description}</strong><span>{expense.category}<i />{formatDate(expense.date)}</span></div><div className="expense-amount">{money.format(expense.amount)}</div><div className="expense-actions"><button aria-label={`Edit ${expense.description}`} onClick={onEdit}><Edit3 size={16} /></button><button className="delete-action" aria-label={`Delete ${expense.description}`} onClick={onDelete}><Trash2 size={16} /></button></div></article>;
}

function ExpenseModal({ expense, categories, onClose, onSave }) {
  const [values, setValues] = useState({ description: expense?.description ?? '', amount: expense?.amount?.toString() ?? '', category: expense?.category ?? '', date: expense?.date ?? new Date().toLocaleDateString('en-CA') });
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [customCategory, setCustomCategory] = useState(Boolean(expense?.category && !categories.includes(expense.category)));
  useEffect(() => { const onKey = (event) => event.key === 'Escape' && onClose(); window.addEventListener('keydown', onKey); return () => window.removeEventListener('keydown', onKey); }, [onClose]);
  const submit = async (event) => {
    event.preventDefault(); setBusy(true); setError('');
    try { await onSave({ ...values, amount: Number(values.amount), category: values.category.trim() }); }
    catch (issue) { setError(issue.message); }
    finally { setBusy(false); }
  };
  return <div className="modal-backdrop" onMouseDown={(event) => event.target === event.currentTarget && onClose()}><section className="expense-modal card-shadow" role="dialog" aria-modal="true" aria-labelledby="modal-title"><div className="modal-heading"><div><p className="eyebrow">// YOUR RECORDS</p><h2 id="modal-title">{expense ? 'EDIT EXPENSE' : 'ADD EXPENSE'}</h2></div><button className="modal-close" aria-label="Close" onClick={onClose}><X size={19} /></button></div><form onSubmit={submit} className="expense-form">
    <Field label="DESCRIPTION" value={values.description} onChange={(description) => setValues({ ...values, description })} placeholder="e.g. Weekly groceries" required />
    <div className="modal-two-col"><Field label="AMOUNT (₹)" type="number" value={values.amount} onChange={(amount) => setValues({ ...values, amount })} placeholder="0.00" min="0.01" max="100000000" step="0.01" required /><Field label="DATE" type="date" value={values.date} onChange={(date) => setValues({ ...values, date })} required /></div>
    <label className="field" htmlFor="expense-category"><span className="field-label">CATEGORY</span><div className="category-entry">{customCategory ? <input id="expense-category" value={values.category} onChange={(event) => setValues({ ...values, category: event.target.value })} placeholder="Type a category" maxLength="40" required /> : <select id="expense-category" value={values.category} onChange={(event) => { if (event.target.value === '__custom__') { setCustomCategory(true); setValues({ ...values, category: '' }); } else setValues({ ...values, category: event.target.value }); }} required><option value="" disabled>Choose a category</option>{categories.map((category) => <option key={category}>{category}</option>)}<option value="__custom__">+ Add custom category…</option></select>}{customCategory && <button type="button" onClick={() => { setCustomCategory(false); setValues({ ...values, category: '' }); }}>USE SUGGESTIONS</button>}</div></label>
    {error && <p className="form-error" role="alert">{error}</p>}<div className="modal-actions"><button type="button" className="button button-quiet" onClick={onClose}>CANCEL</button><button type="submit" className="button button-dark" disabled={busy}>{busy ? <LoaderCircle className="spin" size={16} /> : <Check size={16} />}{expense ? 'SAVE CHANGES' : 'SAVE EXPENSE'}</button></div>
  </form></section></div>;
}

function App() {
  const [user, setUser] = useState(null);
  const [checking, setChecking] = useState(true);
  useEffect(() => { api('/auth/me').then((data) => setUser(data.user)).catch(() => setUser(null)).finally(() => setChecking(false)); }, []);
  const signOut = async () => { try { await api('/auth/logout', { method: 'POST' }); } finally { setUser(null); } };
  if (checking) return <div className="startup-loading"><LoaderCircle className="spin" size={22} />Loading Traxer</div>;
  return user ? <Dashboard user={user} onSignOut={signOut} /> : <><AuthScreen onAuthenticated={setUser} /><SiteFooter /></>;
}

createRoot(document.getElementById('root')).render(<React.StrictMode><App /></React.StrictMode>);
