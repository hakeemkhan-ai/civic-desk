'use client';

import { createContext, useContext, useState, useEffect, type FormEvent, type ReactNode } from 'react';
import Link from 'next/link';
import dynamic from 'next/dynamic';
import { usePathname, useRouter } from 'next/navigation';
import {
  ArrowUpRight,
  ArrowRight,
  MapPin,
  Plus,
  Check,
  Clock3,
  Sparkles,
  ChevronLeft,
  FileText,
  Lightbulb,
  Trash2,
  Droplets,
  Route as Road,
  Waves,
  LogOut,
  ShieldCheck,
  Users,
  Search,
  Camera,
  RotateCcw,
} from 'lucide-react';
import {
  categories,
  statuses,
  transitions,
  departments,
  type Category,
  type Content,
  type Report,
  type Draft,
  type UserView,
  type ComplaintView,
  type DuplicateResult,
  type Candidate,
  type Status,
} from '../shared/domain';
import { api, body } from './api';
import { Charminar } from './Charminar';
const LocationMap = dynamic(() => import('./LocationMap'), {
  ssr: false,
  loading: () => <p role="status">Loading map…</p>,
});

const UserContext = createContext<UserView | null>(null);

function useUser() {
  const user = useContext(UserContext);
  if (!user) throw new Error('A signed-in account is required.');
  return user;
}

function NavigationLink({ href, children }: { href: string; children: ReactNode }) {
  const pathname = usePathname();
  const active = pathname === href;
  return (
    <Link
      href={href}
      className={active ? 'active' : undefined}
      aria-current={active ? 'page' : undefined}
    >
      {children}
    </Link>
  );
}

const icons = {
  roads: Road,
  waste: Trash2,
  water: Droplets,
  streetlights: Lightbulb,
  drainage: Waves,
};
const titleCase = (s: string) => s.replace(/\b\w/g, (c) => c.toUpperCase());
const date = (s: string) =>
  new Date(s).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
function ErrorBox({ message }: { message: string }) {
  return message ? (
    <div className="notice error" role="alert">
      {message}
    </div>
  ) : null;
}
function Badge({ status }: { status: Status }) {
  return (
    <span className={`badge ${status.replaceAll(' ', '-')}`}>
      <span />
      {titleCase(status)}
    </span>
  );
}
function CategoryIcon({ category }: { category: Category }) {
  const Icon = icons[category];
  return (
    <span className={`category-icon ${category}`}>
      <Icon size={21} />
    </span>
  );
}
function Field({ label, children, hint }: { label: string; children: ReactNode; hint?: string }) {
  return (
    <label className="field">
      <span>{label}</span>
      {children}
      {hint && <small>{hint}</small>}
    </label>
  );
}
export default function CivicDesk({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<UserView | null>(null),
    [loading, setLoading] = useState(true),
    [error, setError] = useState('');
  useEffect(() => {
    api<UserView>('/auth/me')
      .then(setUser)
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);
  async function logout() {
    try {
      await api('/auth/logout', { method: 'POST' });
      setUser(null);
    } catch (e) {
      setError((e as Error).message);
    }
  }
  if (loading)
    return (
      <div className="boot" role="status">
        Opening Civic Desk…
      </div>
    );
  return (
    <>
      <a className="skip" href="#main">
        Skip to main content
      </a>
      <header className="topbar">
        <Link className="brand" href="/">
          <span className="brand-mark">
            <Charminar size={23} />
          </span>
          Civic Desk
          <span className="brand-divider" />
          <span className="municipality">Hyderabad</span>
        </Link>
        <div className="account">
          <span className="demo-pill">Demonstration</span>
          {user && (
            <>
              <span className="user-name">
                {user.name}
                <small>{titleCase(user.role)}</small>
              </span>
              <button className="icon-button" aria-label="Sign out" onClick={logout}>
                <LogOut size={18} />
              </button>
            </>
          )}
        </div>
      </header>
      {user ? (
        <div className="app-shell">
          <aside className="sidebar">
            <div className="sidebar-label">YOUR CIVIC DESK</div>
            <nav aria-label="Main navigation">
              <NavigationLink href="/">
                <Charminar size={19} />
                Community reports
              </NavigationLink>
              <NavigationLink href="/following">
                <Users size={19} />
                Following
              </NavigationLink>
              <NavigationLink href="/mine">
                <FileText size={19} />
                My reports
              </NavigationLink>
              {user.role === 'staff' && (
                <NavigationLink href="/staff">
                  <ShieldCheck size={19} />
                  Staff review
                </NavigationLink>
              )}
            </nav>
            <Link className="button primary report-nav" href="/report">
              <Plus size={18} />
              Report an issue
            </Link>
            <div className="sidebar-note">
              <span className="small-seal">
                <Charminar size={20} />
              </span>
              <strong>A better place, together.</strong>
              <p>Small reports help make our shared spaces better.</p>
              <div className="demo-note">
                Independent city demo.
                <br />
                No reports reach a real city.
              </div>
            </div>
          </aside>
          <main id="main" className="main">
            <ErrorBox message={error} />
            <UserContext.Provider value={user}>{children}</UserContext.Provider>
            <footer>
              Hyderabad demonstration service <span>Built for people. Reviewed by people.</span>
            </footer>
          </main>
        </div>
      ) : (
        <main id="main">
          <Auth onLogin={setUser} />
        </main>
      )}
    </>
  );
}
function Auth({ onLogin }: { onLogin: (u: UserView) => void }) {
  const [register, setRegister] = useState(false),
    [email, setEmail] = useState(''),
    [password, setPassword] = useState(''),
    [name, setName] = useState(''),
    [busy, setBusy] = useState(false),
    [error, setError] = useState('');
  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      onLogin(
        await api<UserView>(`/auth/${register ? 'register' : 'login'}`, {
          method: 'POST',
          body: body({ email, password, ...(register ? { name } : {}) }),
        }),
      );
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="auth-layout">
      <section className="auth-story">
        <p className="eyebrow">YOUR NEIGHBORHOOD. YOUR VOICE.</p>
        <h1>
          A little care.
          <br />A better community.
        </h1>
        <p>Report a problem, find others who noticed it, and see what happens next.</p>
        <div className="city-art" aria-hidden="true">
          <div className="sun" />
          <div className="building b1" />
          <div className="building b2" />
          <div className="building b3" />
          <div className="tree t1" />
          <div className="tree t2" />
          <div className="ground" />
        </div>
        <div className="auth-disclosure">
          <Charminar size={20} />
          <span>
            An independent Hyderabad demo, not an official municipal service.
            <br />
            Use synthetic reports only. This is not an emergency service.
          </span>
        </div>
      </section>
      <section className="auth-card">
        <p className="eyebrow">WELCOME TO CIVIC DESK</p>
        <h2>{register ? 'Make yourself at home.' : 'Good to see you.'}</h2>
        <p>
          {register
            ? 'Create a resident account to report and follow issues.'
            : 'Sign in to help care for your neighborhood.'}
        </p>
        <form onSubmit={submit}>
          <ErrorBox message={error} />
          {register && (
            <Field label="Your name">
              <input
                required
                minLength={2}
                maxLength={60}
                autoComplete="name"
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
            </Field>
          )}
          <Field label="Email address">
            <input
              required
              type="email"
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </Field>
          <Field label="Password" hint={register ? 'At least 12 characters.' : ''}>
            <input
              required
              type="password"
              minLength={12}
              maxLength={72}
              autoComplete={register ? 'new-password' : 'current-password'}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </Field>
          <button className="primary full" disabled={busy}>
            {busy ? 'Please wait…' : register ? 'Create resident account' : 'Sign in'}
            <ArrowRight size={18} />
          </button>
        </form>
        <button
          className="text-button"
          onClick={() => {
            setRegister(!register);
            setError('');
          }}
        >
          {register ? 'Already have an account? Sign in' : 'New here? Create a resident account'}
        </button>
        <div className="notice">
          Trying the portfolio demo? Run the development seed command to create resident and staff
          accounts. Use the password you configured.
        </div>
      </section>
    </div>
  );
}
function ReportList({
  scope,
  user,
  staff = false,
}: {
  scope: 'all' | 'mine' | 'following';
  user: UserView;
  staff?: boolean;
}) {
  const [items, setItems] = useState<ComplaintView[]>([]),
    [total, setTotal] = useState(0),
    [category, setCategory] = useState(''),
    [status, setStatus] = useState(''),
    [page, setPage] = useState(1),
    [loading, setLoading] = useState(true),
    [error, setError] = useState(''),
    [retry, setRetry] = useState(0);
  useEffect(() => {
    let live = true;
    setLoading(true);
    setError('');
    const q = new URLSearchParams({
      scope,
      page: String(page),
      ...(category ? { category } : {}),
      ...(status ? { status } : {}),
    });
    api<{ items: ComplaintView[]; total: number }>(`/complaints?${q}`)
      .then((r) => {
        if (live) {
          setItems(r.items);
          setTotal(r.total);
        }
      })
      .catch((e) => {
        if (live) setError(e.message);
      })
      .finally(() => {
        if (live) setLoading(false);
      });
    return () => {
      live = false;
    };
  }, [scope, category, status, page, retry]);
  useEffect(() => setPage(1), [scope, category, status]);
  const heading = staff
    ? 'A little attention goes a long way.'
    : scope === 'mine'
      ? 'Your voice, making a difference.'
      : scope === 'following'
        ? 'Stay close to what matters.'
        : 'A better neighborhood starts here.';
  return (
    <>
      <div className="page-heading">
        <div>
          <p className="eyebrow">
            {staff ? 'HYDERABAD · STAFF WORKSPACE' : 'HYDERABAD · COMMUNITY DESK'}
          </p>
          <h1>{heading}</h1>
          <p>
            {staff
              ? 'Review the facts, confirm the right team, and keep residents informed.'
              : 'Report an issue. Follow its progress. Help your community move forward.'}
          </p>
        </div>
        {!staff && (
          <Link className="button primary" href="/report">
            <Plus size={18} />
            Report an issue
          </Link>
        )}
      </div>
      {scope === 'all' && !staff && (
        <section className="welcome-banner">
          <div>
            <span className="banner-tag">A SHARED SPACE, A SHARED RESPONSIBILITY</span>
            <h2>Noticed something that needs a hand?</h2>
            <p>
              A broken light. A missed collection. A road that needs repair.
              <br />
              Let’s get it to the right people.
            </p>
            <Link href="/report">
              Make a report <ArrowUpRight size={18} />
            </Link>
          </div>
          <div className="banner-illustration" aria-hidden="true">
            <Charminar size={122} strokeWidth={0.8} />
            <span>
              <Check size={26} />
            </span>
          </div>
        </section>
      )}
      <section className="reports-section">
        <div className="section-heading">
          <div>
            <h2>
              {staff
                ? 'Review queue'
                : scope === 'mine'
                  ? 'My reports'
                  : scope === 'following'
                    ? 'Reports you follow'
                    : 'Around the neighborhood'}
            </h2>
            <p>
              {staff
                ? 'Suggestions guide the review. Your decisions are recorded.'
                : 'Every report has a story. Follow what happens next.'}
            </p>
          </div>
          <span className="count">
            {total} {total === 1 ? 'report' : 'reports'}
          </span>
        </div>
        <div className="filterbar">
          <div className="filter-categories" aria-label="Filter by category">
            <button className={!category ? 'selected' : ''} onClick={() => setCategory('')}>
              All categories
            </button>
            {categories.map((c) => (
              <button
                className={category === c ? 'selected' : ''}
                key={c}
                onClick={() => setCategory(c)}
              >
                {titleCase(c)}
              </button>
            ))}
          </div>
          <label className="status-filter">
            <span className="sr-only">Filter by status</span>
            <select value={status} onChange={(e) => setStatus(e.target.value)}>
              <option value="">All statuses</option>
              {statuses.map((s) => (
                <option key={s}>{s}</option>
              ))}
            </select>
          </label>
        </div>
        <ErrorBox message={error} />
        {error && (
          <button className="secondary" onClick={() => setRetry((v) => v + 1)}>
            Try again
          </button>
        )}
        {loading ? (
          <div className="loading" role="status">
            Loading community reports…
          </div>
        ) : !items.length ? (
          <div className="empty">
            <FileText size={36} />
            <h3>
              {scope === 'following'
                ? 'Your neighborhood watch starts here.'
                : 'No reports here yet.'}
            </h3>
            <p>
              {scope === 'following'
                ? 'Open a community report and choose Follow for updates.'
                : 'Try a different filter or be the first to report an issue.'}
            </p>
            <Link href="/">Browse community reports</Link>
          </div>
        ) : (
          <div className="report-grid">
            {items.map((c) => (
              <Link className="report-card" key={c.id} href={`/complaints/${c.id}`}>
                <div className="card-top">
                  <CategoryIcon category={c.content.category} />
                  <Badge status={c.status} />
                </div>
                <div className="card-category">
                  {titleCase(c.content.category)} <span>· {c.id.slice(0, 8).toUpperCase()}</span>
                </div>
                <h3>{c.content.title}</h3>
                <p className="card-description">{c.content.description}</p>
                <div className="card-location">
                  <MapPin size={15} />
                  {c.location.label || 'Location needs clarification'}
                </div>
                <div className="card-bottom">
                  <span>
                    <Clock3 size={14} />
                    {date(c.createdAt)}
                  </span>
                  <span>
                    {c.synthetic
                      ? 'Synthetic demo'
                      : c.isOwner
                        ? 'Your report'
                        : c.following
                          ? 'Following'
                          : 'View report'}
                    <ArrowUpRight size={16} />
                  </span>
                </div>
              </Link>
            ))}
          </div>
        )}
        {total > 20 && (
          <div className="pagination">
            <button
              className="secondary"
              disabled={page === 1}
              onClick={() => setPage((p) => p - 1)}
            >
              Previous
            </button>
            <span>
              Page {page} of {Math.ceil(total / 20)}
            </span>
            <button
              className="secondary"
              disabled={page * 20 >= total}
              onClick={() => setPage((p) => p + 1)}
            >
              Next
            </button>
          </div>
        )}
      </section>
      <div className="bottom-note">
        <ShieldCheck size={20} />
        <p>
          <strong>Real workflow. Demonstration community.</strong> Reports marked “Synthetic demo”
          are fictional examples. Staff reviews every routing and status decision.
        </p>
      </div>
    </>
  );
}
const emptyReport: Report = {
  notes: '',
  location: { label: '', area: 'unknown', precision: 'unknown', lat: null, lng: null, assetId: '' },
  observedAt: null,
};
export function ReportForm() {
  const router = useRouter();
  const [mapOpen, setMapOpen] = useState(false);
  const [report, setReport] = useState<Report>(emptyReport),
    [content, setContent] = useState<Content>({ title: '', description: '', category: 'roads' }),
    [draft, setDraft] = useState<{ id: string; suggestion: Draft } | null>(null),
    [step, setStep] = useState(1),
    [busy, setBusy] = useState(''),
    [error, setError] = useState(''),
    [notice, setNotice] = useState(''),
    [matches, setMatches] = useState<DuplicateResult | null>(null),
    [photo, setPhoto] = useState<File | null>(null),
    [photoId, setPhotoId] = useState<string | null>(null),
    [key, setKey] = useState(() => crypto.randomUUID());
  const setLocation = (patch: Partial<Report['location']>) =>
    setReport((r) => ({ ...r, location: { ...r.location, ...patch } }));
  function manual() {
    setDraft(null);
    setContent({ title: report.notes.slice(0, 100), description: report.notes, category: 'roads' });
    setNotice('You are writing this report manually. Please choose the right category.');
    setError('');
    setStep(2);
  }
  async function generate(e: FormEvent) {
    e.preventDefault();
    setBusy('draft');
    setError('');
    try {
      const d = await api<{ id: string; suggestion: Draft }>('/drafts', {
        method: 'POST',
        body: body(report),
      });
      setDraft(d);
      setContent({
        title: d.suggestion.title,
        description: d.suggestion.description,
        category: d.suggestion.categorySuggestion ?? 'roads',
      });
      setNotice('AI-assisted draft. Review every detail before continuing.');
      setStep(2);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy('');
    }
  }
  async function compare(e: FormEvent) {
    e.preventDefault();
    setBusy('matches');
    setError('');
    setMatches(null);
    try {
      const result = await api<DuplicateResult>('/duplicates', {
        method: 'POST',
        body: body({ original: report, content }),
      });
      setMatches(result);
      setStep(3);
    } catch (e) {
      setNotice(
        'We could not check for similar reports. You can try again or submit a new report.',
      );
      setError((e as Error).message);
      setStep(3);
    } finally {
      setBusy('');
    }
  }
  async function submit() {
    setBusy('submit');
    setError('');
    try {
      let uploadId = photoId;
      if (photo && !uploadId) {
        const form = new FormData();
        form.append('photo', photo);
        uploadId = (await api<{ id: string }>('/uploads', { method: 'POST', body: form })).id;
        setPhotoId(uploadId);
      }
      const c = await api<ComplaintView>('/complaints', {
        method: 'POST',
        headers: { 'Idempotency-Key': key },
        body: body({ original: report, content, draftId: draft?.id ?? null, photoId: uploadId }),
      });
      router.push(`/complaints/${c.id}`);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy('');
    }
  }
  function back() {
    setError('');
    setKey(crypto.randomUUID());
    setStep((s) => s - 1);
  }
  return (
    <>
      <Link className="back-link" href="/">
        <ChevronLeft size={16} />
        Community reports
      </Link>
      <div className="page-heading">
        <div>
          <p className="eyebrow">LET’S TAKE CARE OF IT</p>
          <h1>Tell us what you noticed.</h1>
          <p>A few details can make a real difference.</p>
        </div>
      </div>
      <ol className="steps">
        {['Tell us about it', 'Review your draft', 'Check similar reports'].map((s, i) => (
          <li className={step === i + 1 ? 'active' : step > i + 1 ? 'done' : ''} key={s}>
            <span>{step > i + 1 ? <Check size={16} /> : i + 1}</span>
            {s}
          </li>
        ))}
      </ol>
      <div className="form-layout">
        <section className="panel">
          <ErrorBox message={error} />
          {notice && step > 1 && <div className="notice">{notice}</div>}
          {step === 1 ? (
            <form onSubmit={generate}>
              <h2>Start in your own words.</h2>
              <p className="muted">
                Rough notes are welcome. We’ll help turn them into a clear report.
              </p>
              <Field
                label="What’s happening?"
                hint="Include what you saw and when. Leave out names, phone numbers, and other personal details."
              >
                <textarea
                  required
                  minLength={5}
                  maxLength={4000}
                  rows={5}
                  placeholder="There’s a large pothole near the State Central Library in Afzal Gunj…"
                  value={report.notes}
                  onChange={(e) => setReport({ ...report, notes: e.target.value })}
                />
              </Field>
              <Field
                label="Where is it?"
                hint="A street, landmark, or asset number helps distinguish nearby incidents. If unsure, say so."
              >
                <input
                  maxLength={200}
                  placeholder="e.g. Afzal Gunj, near the State Central Library"
                  value={report.location.label}
                  onChange={(e) => setLocation({ label: e.target.value })}
                />
              </Field>
              <div className="field-row">
                <Field label="City area (informal demo grouping)">
                  <select
                    value={report.location.area}
                    onChange={(e) =>
                      setLocation({ area: e.target.value as Report['location']['area'] })
                    }
                  >
                    <option value="unknown">I’m not sure</option>
                    <option value="north">North Hyderabad</option>
                    <option value="central">Central Hyderabad</option>
                    <option value="south">South Hyderabad</option>
                  </select>
                </Field>
                <Field label="How precise is the location?">
                  <select
                    value={report.location.precision}
                    onChange={(e) =>
                      setLocation({ precision: e.target.value as Report['location']['precision'] })
                    }
                  >
                    <option value="unknown">I’m not sure</option>
                    <option value="approximate">Approximate area</option>
                    <option value="exact">Exact landmark or position</option>
                  </select>
                </Field>
              </div>
              <details className="location-details" onToggle={(e) => setMapOpen(e.currentTarget.open)}>
                <summary>Pin on map (optional)</summary>
                {mapOpen && (
                  <LocationMap location={report.location} onChange={setLocation} />
                )}
              </details>
              <details className="location-details">
                <summary>Add coordinates or an asset number (optional)</summary>
                <div className="field-row">
                  <Field label="Latitude">
                    <input
                      type="number"
                      step="any"
                      min={-90}
                      max={90}
                      value={report.location.lat ?? ''}
                      onChange={(e) =>
                        setLocation({ lat: e.target.value ? Number(e.target.value) : null })
                      }
                    />
                  </Field>
                  <Field label="Longitude">
                    <input
                      type="number"
                      step="any"
                      min={-180}
                      max={180}
                      value={report.location.lng ?? ''}
                      onChange={(e) =>
                        setLocation({ lng: e.target.value ? Number(e.target.value) : null })
                      }
                    />
                  </Field>
                </div>
                <Field label="Asset or pole number">
                  <input
                    maxLength={80}
                    value={report.location.assetId}
                    onChange={(e) => setLocation({ assetId: e.target.value })}
                  />
                </Field>
              </details>
              <Field label="When did you notice it? (optional)">
                <input
                  type="datetime-local"
                  onChange={(e) =>
                    setReport({
                      ...report,
                      observedAt: e.target.value ? new Date(e.target.value).toISOString() : null,
                    })
                  }
                />
              </Field>
              <Field
                label="Add a photo (optional)"
                hint="JPEG, PNG, or WebP, up to 5 MB. Only you and staff can view it. Photos are not analyzed by AI."
              >
                <span className="upload-box">
                  <Camera size={22} />
                  <input
                    type="file"
                    accept="image/jpeg,image/png,image/webp"
                    onChange={(e) => {
                      const f = e.target.files?.[0] ?? null;
                      if (f && f.size > 5 * 1024 * 1024) {
                        setError('Choose a photo under 5 MB.');
                        e.target.value = '';
                        return;
                      }
                      setPhoto(f);
                      setPhotoId(null);
                      setError('');
                    }}
                  />
                </span>
              </Field>
              <div className="form-actions">
                <button className="primary" disabled={!!busy}>
                  <Sparkles size={17} />
                  {busy === 'draft' ? 'Preparing your draft…' : 'Help me draft this'}
                </button>
                <button
                  type="button"
                  className="secondary"
                  disabled={!!busy || report.notes.trim().length < 5}
                  onClick={manual}
                >
                  Write it myself
                </button>
              </div>
              <p className="fine-print">
                Drafting sends your notes and location to an AI service. You can always write
                manually.
              </p>
            </form>
          ) : step === 2 ? (
            <form onSubmit={compare}>
              <h2>Make it sound like you.</h2>
              {draft?.suggestion.missingInformation.length ? (
                <div className="questions">
                  <strong>A few details could help</strong>
                  <ul>
                    {draft.suggestion.missingInformation.map((q, i) => (
                      <li key={i}>{q.question}</li>
                    ))}
                  </ul>
                  <small>
                    Add any answers to your description, or go back to update the original notes and
                    location.
                  </small>
                </div>
              ) : null}
              <Field label="Report title">
                <input
                  required
                  minLength={5}
                  maxLength={140}
                  value={content.title}
                  onChange={(e) => setContent({ ...content, title: e.target.value })}
                />
              </Field>
              <Field label="Description">
                <textarea
                  required
                  minLength={10}
                  maxLength={4000}
                  rows={6}
                  value={content.description}
                  onChange={(e) => setContent({ ...content, description: e.target.value })}
                />
              </Field>
              <Field label="Category">
                <select
                  value={content.category}
                  onChange={(e) => setContent({ ...content, category: e.target.value as Category })}
                >
                  {categories.map((c) => (
                    <option key={c}>{c}</option>
                  ))}
                </select>
              </Field>
              <div className="notice">
                <strong>Suggested team:</strong> {departments[content.category]}
                <br />
                Staff will confirm the right service.
              </div>
              {draft && (
                <details>
                  <summary>Facts extracted from your notes</summary>
                  <ul>
                    {draft.suggestion.extractedFacts.map((f, i) => (
                      <li key={i}>
                        {f.fact}
                        <small className="evidence">Your words: “{f.evidence}”</small>
                      </li>
                    ))}
                  </ul>
                </details>
              )}
              <div className="form-actions">
                <button type="button" className="secondary" disabled={!!busy} onClick={back}>
                  Back
                </button>
                <button className="primary" disabled={!!busy}>
                  {busy === 'matches' ? 'Checking reports…' : 'Check similar reports'}
                  <ArrowRight size={17} />
                </button>
              </div>
            </form>
          ) : (
            <div>
              <h2>Has someone already reported it?</h2>
              <p className="muted">
                Compare the place and details. Similar words can describe different problems.
              </p>
              {matches && (
                <div className="notice">
                  {matches.notice}
                  {matches.mode === 'keyword' && (
                    <strong className="block">Word matching · semantic search unavailable</strong>
                  )}
                  {matches.coverage.indexed < matches.coverage.total &&
                    matches.mode !== 'keyword' && (
                      <span className="block">
                        Some reports are still being prepared for comparison.
                      </span>
                    )}
                  {matches.coverage.limited && (
                    <span className="block">Only the 2,000 most recent reports were checked.</span>
                  )}
                </div>
              )}
              {matches?.candidates.length ? (
                matches.candidates.map((candidate) => (
                  <CandidateCard
                    key={candidate.complaint.id}
                    candidate={candidate}
                    reportContext={{
                      content,
                      location: report.location,
                      observedAt: report.observedAt,
                    }}
                    onFollow={async () => {
                      await api(`/complaints/${candidate.complaint.id}/follow`, { method: 'PUT' });
                      router.push(`/complaints/${candidate.complaint.id}`);
                    }}
                  />
                ))
              ) : (
                <div className="empty compact">
                  <Search size={26} />
                  <h3>
                    {matches
                      ? 'No similar reports found.'
                      : 'Similar reports could not be checked.'}
                  </h3>
                  <p>You can still submit a new report.</p>
                </div>
              )}
              <div className="submit-summary">
                <strong>{content.title}</strong>
                <p>
                  <MapPin size={15} />
                  {report.location.label || 'Location not supplied'}
                </p>
                <small>
                  {titleCase(content.category)} · {photo ? 'Photo attached' : 'No photo'}
                </small>
              </div>
              <div className="form-actions">
                <button className="secondary" disabled={!!busy} onClick={back}>
                  Edit draft
                </button>
                <button className="primary" disabled={!!busy} onClick={submit}>
                  {busy === 'submit' ? 'Submitting…' : 'Submit a new report'}
                  <ArrowRight size={17} />
                </button>
              </div>
              {!matches && (
                <button
                  className="text-button"
                  disabled={!!busy}
                  onClick={() => compare({ preventDefault() {} } as FormEvent)}
                >
                  Try checking again
                </button>
              )}
              <p className="fine-print">
                Your approved text and location will be visible to other signed-in residents.
                Original notes and photos stay private to you and staff.
              </p>
            </div>
          )}
        </section>
        <aside className="form-aside">
          <span className="aside-icon">
            <Lightbulb size={24} />
          </span>
          <h3>A helpful report includes…</h3>
          <ul>
            <li>A recognizable location</li>
            <li>What you can see</li>
            <li>When you first noticed it</li>
            <li>A photo, if it helps</li>
          </ul>
          <hr />
          <h3>You’re in control.</h3>
          <p>
            AI can help with the words. You decide what to submit, and staff makes the final
            decisions.
          </p>
          <div className="demo-note">
            This is a portfolio demonstration, not a real municipal or emergency service. Please use
            synthetic information.
          </div>
        </aside>
      </div>
    </>
  );
}
function CandidateCard({
  candidate,
  onFollow,
  onConfirm,
  complaintId,
  reportContext,
}: {
  candidate: Candidate;
  onFollow?: () => Promise<void>;
  onConfirm?: () => Promise<void>;
  complaintId?: string;
  reportContext?: { content: Content; location: Report['location']; observedAt: string | null };
}) {
  const [busy, setBusy] = useState(false),
    [error, setError] = useState(''),
    [rejected, setRejected] = useState(false),
    [reason, setReason] = useState(''),
    [rejecting, setRejecting] = useState(false);
  const c = candidate.complaint;
  async function act(fn: () => Promise<void>) {
    setBusy(true);
    setError('');
    try {
      await fn();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <article className="candidate">
      <div className="candidate-heading">
        <span className="match-label">
          {candidate.suggested
            ? 'Potentially the same incident'
            : 'Worth comparing · details differ'}
        </span>
        <Badge status={c.status} />
      </div>
      <h3>
        <Link href={`/complaints/${c.id}`} target="_blank" rel="noreferrer">
          {c.content.title}
          <ArrowUpRight size={15} />
        </Link>
      </h3>
      <p>{c.content.description}</p>
      <div className="card-location">
        <MapPin size={15} />
        {c.location.label || 'Location unknown'}
      </div>
      <div className="signal-grid">
        {Object.values(candidate.signals).map((s) => (
          <span key={s}>{s}</span>
        ))}
      </div>
      {candidate.reasons.length > 0 && <p className="caution">{candidate.reasons.join(' ')}</p>}
      <ErrorBox message={error} />
      {rejected ? (
        <p className="success-text">
          <Check size={16} />
          Feedback saved. You can continue with a new report.
        </p>
      ) : (
        <>
          <div className="form-actions">
            {onFollow && (
              <button
                type="button"
                className="secondary"
                disabled={busy}
                onClick={() => act(onFollow)}
              >
                Follow this incident
              </button>
            )}
            {onConfirm && (
              <button
                type="button"
                className="secondary"
                disabled={busy}
                onClick={() => act(onConfirm)}
              >
                Confirm duplicate link
              </button>
            )}
            <button type="button" className="text-button" onClick={() => setRejecting(!rejecting)}>
              This is a different issue
            </button>
          </div>
          {rejecting && (
            <div>
              <Field label="What is different?">
                <input
                  maxLength={500}
                  placeholder="e.g. a different street or light pole"
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                />
              </Field>
              <button
                type="button"
                className="secondary"
                disabled={busy || reason.trim().length < 3}
                onClick={() =>
                  act(async () => {
                    await api('/feedback/duplicate', {
                      method: 'POST',
                      body: body({
                        candidateId: c.id,
                        reason,
                        ...(complaintId ? { complaintId } : {}),
                        ...(reportContext ? { query: reportContext } : {}),
                      }),
                    });
                    setRejected(true);
                  })
                }
              >
                Save feedback
              </button>
            </div>
          )}
        </>
      )}
    </article>
  );
}
export function ReportDetail({ id }: { id: string }) {
  const user = useUser();
  const [c, setC] = useState<ComplaintView | null>(null),
    [error, setError] = useState(''),
    [busy, setBusy] = useState(false),
    [retry, setRetry] = useState(0);
  useEffect(() => {
    setC(null);
    setError('');
    let live = true;
    api<ComplaintView>(`/complaints/${id}`)
      .then((v) => {
        if (live) setC(v);
      })
      .catch((e) => {
        if (live) setError(e.message);
      });
    return () => {
      live = false;
    };
  }, [id, retry]);
  async function follow() {
    if (!c) return;
    setBusy(true);
    try {
      await api(`/complaints/${id}/follow`, { method: c.following ? 'DELETE' : 'PUT' });
      setC({ ...c, following: !c.following });
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  if (!c)
    return (
      <>
        <ErrorBox message={error} />
        {error ? (
          <button className="secondary" onClick={() => setRetry((v) => v + 1)}>
            Try again
          </button>
        ) : (
          <div className="loading" role="status">
            Opening report…
          </div>
        )}
      </>
    );
  return (
    <>
      <Link className="back-link" href={user.role === 'staff' ? '/staff' : '/'}>
        <ChevronLeft size={16} />
        Back to reports
      </Link>
      <div className="detail-header">
        <div>
          <p className="eyebrow">
            REPORT {c.id.slice(0, 8).toUpperCase()} {c.synthetic ? '· SYNTHETIC DEMONSTRATION' : ''}
          </p>
          <h1>{c.content.title}</h1>
          <div className="detail-meta">
            <Badge status={c.status} />
            <span>
              <MapPin size={16} />
              {c.location.label || 'Location needs clarification'}
            </span>
          </div>
        </div>
        <button className={c.following ? 'secondary' : 'primary'} onClick={follow} disabled={busy}>
          {c.following ? <Check size={17} /> : <Plus size={17} />}{' '}
          {c.following ? 'Following · unfollow' : 'Follow this report'}
        </button>
      </div>
      <ErrorBox message={error} />
      <div className="detail-layout">
        <div>
          <section className="panel">
            <div className="section-heading">
              <h2>About this report</h2>
              <CategoryIcon category={c.content.category} />
            </div>
            <p className="report-body">{c.content.description}</p>
            {c.location.lat !== null && c.location.lng !== null && (
              <LocationMap location={c.location} />
            )}
            <dl className="facts">
              <div>
                <dt>Category</dt>
                <dd>{titleCase(c.content.category)}</dd>
              </div>
              <div>
                <dt>{c.reviewed ? 'Staff-confirmed team' : 'Suggested team · awaiting review'}</dt>
                <dd>{c.department ?? c.departmentSuggestion}</dd>
              </div>
              <div>
                <dt>Reported</dt>
                <dd>{date(c.createdAt)}</dd>
              </div>
              <div>
                <dt>First noticed</dt>
                <dd>{c.observedAt ? date(c.observedAt) : 'Not supplied'}</dd>
              </div>
            </dl>
            {c.duplicateOf && (
              <div className="notice">
                Staff linked this report to{' '}
                <Link href={`/complaints/${c.duplicateOf}`}>an existing incident</Link>. Both reports
                keep their own history.
              </div>
            )}
            {c.photoId && (
              <figure>
                <img
                  className="report-photo"
                  src={`/api/uploads/${c.photoId}`}
                  alt="Photo attached by the resident showing the reported issue"
                />
                <figcaption>Private attachment · visible to the author and staff</figcaption>
              </figure>
            )}
            {c.original && (
              <details>
                <summary>Original notes and AI suggestion · private</summary>
                <h4>Original resident notes</h4>
                <p className="report-body">{c.original.notes}</p>
                <h4>AI suggestion</h4>
                <p>
                  {c.aiSuggestion
                    ? c.aiSuggestion.description
                    : 'This report was written manually.'}
                </p>
              </details>
            )}
          </section>
          {user.role === 'staff' && (
            <StaffReview key={c.id} complaint={c} onUpdate={setC} />
          )}
        </div>
        <section className="panel timeline-panel">
          <p className="eyebrow">EVERY STEP, IN THE OPEN</p>
          <h2>Report timeline</h2>
          <p className="muted">Updates from the people handling this report.</p>
          <ol className="timeline" tabIndex={0} aria-label="Report history">
            {c.timeline.map((event, i) => (
              <li key={event.id}>
                <span className={`timeline-dot ${i === c.timeline.length - 1 ? 'latest' : ''}`}>
                  {event.kind === 'review' ? <ShieldCheck size={14} /> : <Check size={14} />}
                </span>
                <div className="timeline-title">
                  {event.kind === 'review'
                    ? 'Staff review confirmed'
                    : event.kind === 'duplicate'
                      ? 'Linked to an incident'
                      : titleCase(event.status)}
                </div>
                <time dateTime={event.at}>
                  {new Date(event.at).toLocaleString(undefined, {
                    day: 'numeric',
                    month: 'short',
                    hour: '2-digit',
                    minute: '2-digit',
                  })}
                </time>
                <p>{event.note}</p>
                {event.decision && (
                  <small>
                    {titleCase(event.decision.category)} · {event.decision.department}
                  </small>
                )}
                <span className="timeline-actor">
                  {event.actorRole === 'system' ? 'Demo data migration' : event.actorRole === 'staff' ? 'Staff decision' : 'Resident report'}
                </span>
              </li>
            ))}
          </ol>
        </section>
      </div>
    </>
  );
}
function StaffReview({
  complaint: c,
  onUpdate,
}: {
  complaint: ComplaintView;
  onUpdate: (c: ComplaintView) => void;
}) {
  const [content, setContent] = useState(c.content),
    [department, setDepartment] = useState(c.department ?? c.departmentSuggestion),
    [note, setNote] = useState(''),
    [status, setStatus] = useState<Status>(transitions[c.status][0]),
    [busy, setBusy] = useState(''),
    [error, setError] = useState(''),
    [matches, setMatches] = useState<DuplicateResult | null>(null);
  const nextStatuses = transitions[c.status];
  const nextStatus = nextStatuses.includes(status) ? status : nextStatuses[0];
  useEffect(() => {
    setStatus(transitions[c.status][0]);
  }, [c.status]);
  useEffect(() => {
    // Refresh after staff decisions; following a report must preserve unsaved edits.
    setContent(c.content);
    setDepartment(c.department ?? c.departmentSuggestion);
    setMatches(null);
    setError('');
  }, [c.version, c.content, c.department, c.departmentSuggestion]);
  async function action(name: string, fn: () => Promise<void>) {
    setBusy(name);
    setError('');
    try {
      await fn();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy('');
    }
  }
  const save = () =>
    action('review', async () =>
      onUpdate(
        await api<ComplaintView>(`/complaints/${c.id}/review`, {
          method: 'PUT',
          body: body({ content, department, note, version: c.version }),
        }),
      ),
    );
  return (
    <section className="panel staff-panel">
      <div className="section-heading">
        <h2>
          <ShieldCheck size={21} /> Staff review
        </h2>
        <span className="match-label">Human decision</span>
      </div>
      <p className="muted">Confirm the facts and service team. Every decision is recorded.</p>
      <ErrorBox message={error} />
      <form
        onSubmit={(e) => {
          e.preventDefault();
          save();
        }}
      >
        <Field label="Approved title">
          <input
            required
            minLength={5}
            maxLength={140}
            value={content.title}
            onChange={(e) => setContent({ ...content, title: e.target.value })}
          />
        </Field>
        <Field label="Approved description">
          <textarea
            required
            minLength={10}
            maxLength={4000}
            rows={4}
            value={content.description}
            onChange={(e) => setContent({ ...content, description: e.target.value })}
          />
        </Field>
        <div className="field-row">
          <Field label="Confirmed category">
            <select
              value={content.category}
              onChange={(e) => setContent({ ...content, category: e.target.value as Category })}
            >
              {categories.map((cat) => (
                <option key={cat}>{cat}</option>
              ))}
            </select>
          </Field>
          <Field label="Assigned department">
            <select value={department} onChange={(e) => setDepartment(e.target.value)}>
              {Object.values(departments).map((d) => (
                <option key={d}>{d}</option>
              ))}
            </select>
          </Field>
        </div>
        <p className="fine-print">
          Directory suggestion: {c.departmentSuggestion}. The category and department above are your
          final decision.
        </p>
        <Field
          label="Decision note"
          hint="Use a public, factual explanation. Do not include personal details."
        >
          <textarea
            required
            minLength={5}
            maxLength={1000}
            rows={2}
            value={note}
            onChange={(e) => setNote(e.target.value)}
          />
        </Field>
        <button className="primary" disabled={!!busy}>
          {busy === 'review' ? 'Saving…' : 'Confirm review'}
        </button>
      </form>
      <hr />
      <h3>Update status</h3>
      <div className="field-row">
        <Field label="Next status">
          <select value={nextStatus} onChange={(e) => setStatus(e.target.value as Status)}>
            {nextStatuses.map((s) => (
              <option key={s} disabled={s === 'assigned' && !c.reviewed}>
                {s}
              </option>
            ))}
          </select>
        </Field>
        <button
          className="secondary align-bottom"
          disabled={!!busy || note.trim().length < 5 || (nextStatus === 'assigned' && !c.reviewed)}
          onClick={() =>
            action('status', async () =>
              onUpdate(
                await api<ComplaintView>(`/complaints/${c.id}/status`, {
                  method: 'POST',
                  body: body({ status: nextStatus, note, version: c.version }),
                }),
              ),
            )
          }
        >
          {busy === 'status' ? 'Updating…' : 'Save status update'}
        </button>
      </div>
      <p className="fine-print">
        Add a decision note above. Assignment requires a confirmed review.
      </p>
      <hr />
      <button
        className="secondary"
        disabled={!!busy}
        onClick={() =>
          action('duplicates', async () => {
            const r = await api<DuplicateResult>('/duplicates', {
              method: 'POST',
              body: body({
                original: c.original ?? {
                  notes: c.content.description,
                  location: c.location,
                  observedAt: c.observedAt,
                },
                content: c.content,
                excludeComplaintId: c.id,
              }),
            });
            setMatches(r);
          })
        }
      >
        <Search size={16} />
        {busy === 'duplicates' ? 'Checking…' : 'Review duplicate candidates'}
      </button>
      {matches && (
        <>
          <p className="fine-print">
            {matches.notice} Confirm links only after checking incident identity. Links do not merge
            records.
          </p>
          {matches.candidates.length ? (
            matches.candidates.map((candidate) => (
              <CandidateCard
                key={candidate.complaint.id}
                candidate={candidate}
                complaintId={c.id}
                onConfirm={async () => {
                  if (note.trim().length < 5)
                    throw new Error(
                      'Add a decision note above before confirming a duplicate link.',
                    );
                  onUpdate(
                    await api<ComplaintView>(`/complaints/${c.id}/duplicate`, {
                      method: 'POST',
                      body: body({ targetId: candidate.complaint.id, version: c.version, note }),
                    }),
                  );
                }}
              />
            ))
          ) : (
            <p>No other candidates found.</p>
          )}
        </>
      )}
    </section>
  );
}

export function ReportsPage({
  scope = 'all',
  staff = false,
}: {
  scope?: 'all' | 'mine' | 'following';
  staff?: boolean;
}) {
  const user = useUser();
  if (staff && user.role !== 'staff') {
    return <div className="empty">Staff access is required.</div>;
  }
  return <ReportList scope={scope} user={user} staff={staff} />;
}
