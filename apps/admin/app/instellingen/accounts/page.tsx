'use client';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useAuth, type Org } from '@/lib/auth';
import { useLanguage } from '@/lib/language';
import { ROLE_LABELS, roleKey } from '@/lib/roles';
import { supabase } from '@/lib/supabase';

interface Right {
  org_id: string;
  org: string;
  platform: boolean;
  role: Org['role'];
}
interface Account {
  user_id: string;
  email: string;
  created_at: string;
  last_sign_in_at: string | null;
  login_count: number;
  confirmed: boolean;
  rights: Right[];
  note: string | null;
}

const PAGE = 50;

/**
 * Alle beheeraccounts op één scherm, voor eigenaren en beheerders van het
 * platform: wie welke rechten heeft, wanneer laatst ingelogd en hoe vaak. Per
 * account een resetlink sturen of het account verwijderen.
 */
export default function AccountsPage() {
  const { org, user } = useAuth();
  const { t, lang } = useLanguage();
  const [accounts, setAccounts] = useState<Account[] | null>(null);
  const [query, setQuery] = useState('');
  const [orgFilter, setOrgFilter] = useState('');
  const [roleFilter, setRoleFilter] = useState('');
  const [sort, setSort] = useState<'email' | 'last'>('email');
  const [shown, setShown] = useState(PAGE);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  /** Account waarvan de omschrijving open staat om te bewerken. */
  const [editing, setEditing] = useState<string | null>(null);
  const [draft, setDraft] = useState('');
  const allowed = !!org && org.platform && ['owner', 'admin'].includes(org.role);

  const load = useCallback(async () => {
    const { data, error: e } = await supabase().rpc('platform_accounts');
    if (e) setError(e.message);
    setAccounts((data ?? []) as Account[]);
  }, []);
  useEffect(() => {
    if (allowed) void load();
  }, [allowed, load]);

  const orgs = useMemo(() => {
    const map = new Map<string, string>();
    for (const a of accounts ?? []) for (const r of a.rights) map.set(r.org_id, r.org);
    return [...map].sort((a, b) => a[1].localeCompare(b[1]));
  }, [accounts]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    const list = (accounts ?? []).filter(
      (a) =>
        (!q ||
          a.email.toLowerCase().includes(q) ||
          (a.note ?? '').toLowerCase().includes(q) ||
          a.rights.some((r) => r.org.toLowerCase().includes(q))) &&
        (!orgFilter || (orgFilter === '-' ? a.rights.length === 0 : a.rights.some((r) => r.org_id === orgFilter))) &&
        (!roleFilter || a.rights.some((r) => r.role === roleFilter && (!orgFilter || r.org_id === orgFilter))),
    );
    if (sort === 'last') list.sort((a, b) => (b.last_sign_in_at ?? '').localeCompare(a.last_sign_in_at ?? ''));
    return list;
  }, [accounts, query, orgFilter, roleFilter, sort]);

  if (!org) return null;
  if (!allowed) return <p className="muted">{t('Alleen eigenaren en beheerders van Escape Game The Hunt zien alle accounts.')}</p>;

  const date = (iso: string | null) => (iso ? new Date(iso).toLocaleString(lang, { dateStyle: 'medium', timeStyle: 'short' }) : t('nooit'));

  const sendReset = async (a: Account) => {
    setBusy(true);
    setError(null);
    setNotice(null);
    const { error: e } = await supabase().auth.resetPasswordForEmail(a.email, { redirectTo: `${window.location.origin}/wachtwoord` });
    if (e) setError(e.message);
    else setNotice(t('{email} krijgt een mail met een link om een nieuw wachtwoord te kiezen.', { email: a.email }));
    setBusy(false);
  };
  const remove = async (a: Account) => {
    if (!window.confirm(t('Account {email} helemaal verwijderen? Alle rechten gaan mee en inloggen kan niet meer.', { email: a.email }))) return;
    setBusy(true);
    setError(null);
    setNotice(null);
    const { error: e } = await supabase().rpc('delete_account', { p_user: a.user_id });
    if (e) setError(e.message);
    else {
      setNotice(t('Account {email} verwijderd.', { email: a.email }));
      await load();
    }
    setBusy(false);
  };

  const saveNote = async (a: Account) => {
    setBusy(true);
    setError(null);
    setNotice(null);
    const { error: e } = await supabase().rpc('set_account_note', { p_email: a.email, p_note: draft });
    if (e) setError(e.message);
    else {
      setEditing(null);
      await load();
    }
    setBusy(false);
  };

  return (
    <>
      <h1>{t('Accounts')}</h1>
      <p className="muted">{t('Alle accounts van de beheeromgeving, met hun rechten per organisatie. Rechten wijzigen doe je bij Toegang.')}</p>
      {error ? <p className="error">{error}</p> : null}
      {notice ? <p className="notice">{notice}</p> : null}

      <div className="actions" style={{ flexWrap: 'wrap' }}>
        <input
          type="search"
          aria-label={t('Zoeken')}
          placeholder={t('Zoek op e-mail, organisatie of omschrijving')}
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setShown(PAGE);
          }}
        />
        <select aria-label={t('Organisatie')} value={orgFilter} onChange={(e) => setOrgFilter(e.target.value)}>
          <option value="">{t('Alle organisaties')}</option>
          {orgs.map(([id, name]) => (
            <option key={id} value={id}>
              {name}
            </option>
          ))}
          <option value="-">{t('Zonder organisatie')}</option>
        </select>
        <select aria-label={t('Rol')} value={roleFilter} onChange={(e) => setRoleFilter(e.target.value)}>
          <option value="">{t('Alle rollen')}</option>
          {(Object.keys(ROLE_LABELS) as Org['role'][]).map((r) => (
            <option key={r} value={r}>
              {t(ROLE_LABELS[r])}
            </option>
          ))}
        </select>
        <select aria-label={t('Sorteren')} value={sort} onChange={(e) => setSort(e.target.value as 'email' | 'last')}>
          <option value="email">{t('Op e-mail')}</option>
          <option value="last">{t('Laatst ingelogd eerst')}</option>
        </select>
      </div>

      {accounts === null ? (
        <p className="muted">{t('Laden…')}</p>
      ) : (
        <>
          <p className="muted small">{t('{n} van {total} accounts', { n: filtered.length, total: accounts.length })}</p>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>{t('E-mail')}</th>
                  <th>{t('Rechten')}</th>
                  <th>{t('Laatste inlog')}</th>
                  <th>{t('Keer ingelogd')}</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {filtered.slice(0, shown).map((a) => (
                  <tr key={a.user_id}>
                    <td>
                      {a.email}
                      {a.confirmed ? null : <div className="muted small">{t('nog niet bevestigd')}</div>}
                      {editing === a.user_id ? (
                        <div>
                          <textarea
                            aria-label={t('Omschrijving')}
                            rows={3}
                            maxLength={1000}
                            value={draft}
                            autoFocus
                            onChange={(e) => setDraft(e.target.value)}
                          />
                          <button className="link small" disabled={busy} onClick={() => void saveNote(a)}>
                            {t('Opslaan')}
                          </button>
                          {' · '}
                          <button className="link small" disabled={busy} onClick={() => setEditing(null)}>
                            {t('Annuleren')}
                          </button>
                        </div>
                      ) : (
                        <div className="small">
                          {a.note ? <span style={{ whiteSpace: 'pre-wrap' }}>{a.note} </span> : null}
                          <button
                            className="link small"
                            onClick={() => {
                              setEditing(a.user_id);
                              setDraft(a.note ?? '');
                            }}
                          >
                            {a.note ? t('Wijzigen') : t('Omschrijving toevoegen')}
                          </button>
                        </div>
                      )}
                    </td>
                    <td className="small">
                      {a.rights.length === 0 ? <span className="muted">{t('geen')}</span> : null}
                      {a.rights.map((r) => (
                        <div key={r.org_id}>
                          {r.org}: {t(roleKey(r.role, r.platform))}
                          {r.platform || r.role === 'editor' ? null : <span className="muted"> · {t('partner')}</span>}
                        </div>
                      ))}
                    </td>
                    <td className="small">{date(a.last_sign_in_at)}</td>
                    <td>{a.login_count}</td>
                    <td className="small" style={{ whiteSpace: 'nowrap' }}>
                      <button className="link" disabled={busy} onClick={() => void sendReset(a)}>
                        {t('Resetlink sturen')}
                      </button>
                      {a.user_id !== user?.id ? (
                        <>
                          {' · '}
                          <button className="link" disabled={busy} onClick={() => void remove(a)}>
                            {t('Verwijderen')}
                          </button>
                        </>
                      ) : null}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {filtered.length > shown ? (
            <div className="actions">
              <button className="link" onClick={() => setShown((n) => n + PAGE)}>
                {t('Meer tonen')}
              </button>
            </div>
          ) : null}
        </>
      )}
    </>
  );
}
