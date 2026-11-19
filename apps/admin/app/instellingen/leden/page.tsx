'use client';
import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { useAuth, type Org } from '@/lib/auth';
import { tKey } from '@/lib/i18n';
import { useLanguage } from '@/lib/language';
import { supabase } from '@/lib/supabase';

interface Member {
  user_id: string;
  email: string;
  role: Org['role'];
}
interface Invitation {
  email: string;
  role: Org['role'];
  created_at: string;
  accepted_at: string | null;
}
interface Partner {
  id: string;
  name: string;
  owner_email: string | null;
  accepted: boolean;
}

const ROLES: { role: Org['role']; label: string }[] = [
  { role: 'owner', label: tKey('Eigenaar') },
  { role: 'admin', label: tKey('Beheerder') },
  { role: 'editor', label: tKey('Redacteur') },
  { role: 'instructor', label: tKey('Spelleider') },
];

/**
 * Toegang tot de beheeromgeving. Registreren kan alleen met een uitnodiging:
 * eigenaren en beheerders nodigen collega's uit, en het platform maakt
 * partners aan (een eigen organisatie met een uitnodiging voor de eigenaar).
 */
export default function AccessPage() {
  const { org } = useAuth();
  const { t } = useLanguage();
  const [members, setMembers] = useState<Member[]>([]);
  const [invitations, setInvitations] = useState<Invitation[]>([]);
  const [partners, setPartners] = useState<Partner[]>([]);
  const [platform, setPlatform] = useState(false);
  const [email, setEmail] = useState('');
  const [role, setRole] = useState<Org['role']>('instructor');
  const [partnerName, setPartnerName] = useState('');
  const [partnerEmail, setPartnerEmail] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const canInvite = !!org && ['owner', 'admin'].includes(org.role);

  const load = useCallback(async () => {
    if (!org) return;
    const db = supabase();
    const [m, i, p, pl] = await Promise.all([
      db.rpc('org_members', { p_org: org.id }),
      db.from('invitations').select('email, role, created_at, accepted_at').eq('org_id', org.id).is('accepted_at', null).order('created_at'),
      db.rpc('partner_orgs'),
      db.rpc('is_platform_admin'),
    ]);
    setMembers((m.data ?? []) as Member[]);
    setInvitations((i.data ?? []) as Invitation[]);
    setPartners((p.data ?? []) as Partner[]);
    setPlatform(pl.data === true);
  }, [org]);

  useEffect(() => {
    void load();
  }, [load]);

  if (!org) return null;

  const run = async (work: () => Promise<{ error: { message: string } | null }>, done: string) => {
    setBusy(true);
    setError(null);
    setNotice(null);
    const { error } = await work();
    if (error) setError(error.message);
    else {
      setNotice(done);
      await load();
    }
    setBusy(false);
  };
  const roleLabel = (r: Org['role']) => t(ROLES.find((x) => x.role === r)?.label ?? r);
  const loginUrl = typeof window === 'undefined' ? '' : `${window.location.origin}/login`;

  const invite = (e: FormEvent) => {
    e.preventDefault();
    void run(
      async () => supabase().rpc('invite_member', { p_org: org.id, p_email: email, p_role: role }),
      t('Uitgenodigd. Laat {email} een account aanmaken op {url} met dit e-mailadres.', { email: email.trim(), url: loginUrl }),
    ).then(() => setEmail(''));
  };
  const addPartner = (e: FormEvent) => {
    e.preventDefault();
    void run(
      async () => supabase().rpc('create_partner', { p_name: partnerName, p_owner_email: partnerEmail }),
      t('Partner aangemaakt. Laat {email} een account aanmaken op {url} met dit e-mailadres.', { email: partnerEmail.trim(), url: loginUrl }),
    ).then(() => {
      setPartnerName('');
      setPartnerEmail('');
    });
  };
  const withdraw = (address: string) =>
    void run(async () => supabase().from('invitations').delete().eq('org_id', org.id).eq('email', address), t('Uitnodiging ingetrokken.'));

  return (
    <>
      <h1>{t('Toegang')}</h1>
      <p className="muted">
        {t('Een account aanmaken kan alleen met een uitnodiging. Nodig iemand uit met zijn e-mailadres; daarna maakt hij een account aan op de inlogpagina en is hij lid zodra het e-mailadres is bevestigd.')}
      </p>
      {error ? <p className="error">{error}</p> : null}
      {notice ? <p className="notice">{notice}</p> : null}

      <h2>{t('Leden van {org}', { org: org.name })}</h2>
      <table>
        <tbody>
          {members.map((m) => (
            <tr key={m.user_id}>
              <td>{m.email}</td>
              <td>{roleLabel(m.role)}</td>
            </tr>
          ))}
          {invitations.map((i) => (
            <tr key={i.email}>
              <td>{i.email}</td>
              <td>
                {roleLabel(i.role)} · <span className="muted">{t('uitgenodigd')}</span>
                {canInvite ? (
                  <>
                    {' '}
                    <button className="link" disabled={busy} onClick={() => withdraw(i.email)}>
                      {t('Intrekken')}
                    </button>
                  </>
                ) : null}
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      {canInvite ? (
        <form onSubmit={invite}>
          <h2>{t('Collega uitnodigen')}</h2>
          <label htmlFor="invite-email">{t('E-mail')}</label>
          <input id="invite-email" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
          <label htmlFor="invite-role">{t('Rol')}</label>
          <select id="invite-role" value={role} onChange={(e) => setRole(e.target.value as Org['role'])}>
            {ROLES.filter((r) => r.role !== 'owner' || org.role === 'owner').map((r) => (
              <option key={r.role} value={r.role}>
                {t(r.label)}
              </option>
            ))}
          </select>
          <div className="actions">
            <button type="submit" disabled={busy}>
              {t('Uitnodigen')}
            </button>
          </div>
        </form>
      ) : (
        <p className="muted">{t('Alleen eigenaren en beheerders kunnen collega\'s uitnodigen.')}</p>
      )}

      {platform ? (
        <>
          <h2>{t('Partners')}</h2>
          <p className="muted small">
            {t('Een partner krijgt een eigen organisatie met eigen hunts en resultaten. Welke spellen hij mag spelen, deel je per spel.')}
          </p>
          <table>
            <tbody>
              {partners.map((p) => (
                <tr key={p.id}>
                  <td>{p.name}</td>
                  <td>
                    {p.owner_email ?? ''} · <span className="muted">{p.accepted ? t('actief') : t('uitgenodigd')}</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <form onSubmit={addPartner}>
            <h3>{t('Partner toevoegen')}</h3>
            <label htmlFor="partner-name">{t('Naam')}</label>
            <input id="partner-name" required minLength={2} maxLength={80} value={partnerName} onChange={(e) => setPartnerName(e.target.value)} />
            <label htmlFor="partner-email">{t('E-mail van de eigenaar')}</label>
            <input id="partner-email" type="email" required value={partnerEmail} onChange={(e) => setPartnerEmail(e.target.value)} />
            <div className="actions">
              <button type="submit" disabled={busy}>
                {t('Partner toevoegen')}
              </button>
            </div>
          </form>
        </>
      ) : null}
    </>
  );
}
