'use client';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useEffect, useMemo, useState, type FormEvent } from 'react';
import { useAuth } from '@/lib/auth';
import {
  CITY_TODOS,
  cityGameName,
  countryOptions,
  findCity,
  geocode,
  type CityList,
  type Place,
} from '@/lib/city-rollout';
import { cleanName } from '@/lib/game-name';
import { loadBaseVersions, rolloutCity, type BaseVersion } from '@/lib/game-store';
import { useLanguage } from '@/lib/language';
import { supabase } from '@/lib/supabase';

interface BaseRow {
  id: string;
  slug: string;
  languages: string[];
  default_language: string;
  name: Record<string, string>;
}

/** Nieuwe stad uitrollen: versie van het basisspel kiezen, land en stad, naam. */
export default function NewCityPage() {
  return (
    <Suspense>
      <NewCity />
    </Suspense>
  );
}

function NewCity() {
  const { org } = useAuth();
  const { t, lang, locale } = useLanguage();
  const router = useRouter();
  const params = useSearchParams();

  const [bases, setBases] = useState<BaseRow[] | null>(null);
  const [baseId, setBaseId] = useState('');
  const [versions, setVersions] = useState<BaseVersion[]>([]);
  const [version, setVersion] = useState('');
  const [cities, setCities] = useState<CityList | null>(null);
  const [country, setCountry] = useState('NL');
  const [cityName, setCityName] = useState('');
  /** Gevonden met "Zoek op de kaart" (een plaats die niet in de lijst staat). */
  const [found, setFound] = useState<Place | null>(null);
  /** Naam per taal; null zolang die automatisch de stadsnaam volgt. */
  const [name, setName] = useState<Record<string, string> | null>(null);
  const [errors, setErrors] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);

  // Basisspellen met hun naam.
  useEffect(() => {
    if (!org) return;
    const db = supabase();
    void Promise.all([
      db.from('games').select('id, slug, languages, default_language').eq('org_id', org.id).eq('layer', 'base').order('slug'),
      db.from('translations').select('game_id, text, lang').eq('entity', 'game').eq('entity_id', '').eq('field', 'name'),
    ]).then(([g, n]) => {
      if (g.error || n.error) {
        setErrors([(g.error ?? n.error)!.message]);
        return;
      }
      const names = n.data as { game_id: string; text: string; lang: string }[];
      const list = (g.data as Omit<BaseRow, 'name'>[]).map((b) => ({
        ...b,
        name: Object.fromEntries(names.filter((x) => x.game_id === b.id).map((x) => [x.lang, x.text])),
      }));
      setBases(list);
      const wanted = params.get('basis');
      setBaseId(list.find((b) => b.id === wanted)?.id ?? list[0]?.id ?? '');
    });
  }, [org, params]);

  // Versies van het gekozen basisspel, nieuwste voorop.
  useEffect(() => {
    if (!baseId) return;
    setVersions([]);
    setVersion('');
    void loadBaseVersions(supabase(), baseId)
      .then((list) => {
        setVersions(list);
        const wanted = list.find((v) => String(v.version) === params.get('versie')) ?? list[0];
        setVersion(wanted ? String(wanted.version) : '');
      })
      .catch((err) => setErrors([err instanceof Error ? err.message : String(err)]));
  }, [baseId, params]);

  // De lijst met steden pas laden op deze pagina.
  useEffect(() => {
    void import('@/lib/europe-cities.json').then((m) => setCities(m.default as unknown as CityList));
  }, []);

  const countries = useMemo(() => countryOptions(locale), [locale]);
  const base = bases?.find((b) => b.id === baseId) ?? null;
  const chosen = versions.find((v) => String(v.version) === version) ?? null;
  const listed = cities ? findCity(cities, country, cityName) : null;
  const place: Place | null = listed
    ? { ...listed, name: cityName.trim() || listed.name }
    : found && found.country === country && found.name === cityName.trim()
      ? found
      : null;
  const autoName = base ? cityGameName(base.name, base.languages, cityName || '…') : {};
  const shownName = name ?? autoName;

  const changeCity = (value: string) => {
    setCityName(value);
    setErrors([]);
  };

  const doSearch = async () => {
    if (!cityName.trim()) return;
    setBusy(true);
    setErrors([]);
    try {
      const hit = await geocode(cityName, country, lang);
      if (hit) setFound(hit);
      else setErrors([t('{name} niet gevonden in dit land. Controleer de spelling.', { name: cityName.trim() })]);
    } catch (err) {
      setErrors([t('Zoeken op de kaart lukt nu niet.') + ' ' + (err instanceof Error ? err.message : String(err))]);
    } finally {
      setBusy(false);
    }
  };

  const doRollout = async (e: FormEvent) => {
    e.preventDefault();
    if (!org || !base || !chosen || !place) return;
    const clean = cleanName(shownName, base.languages);
    if (!clean[base.default_language]) {
      setErrors([t('De naam in {lang} is verplicht.', { lang: base.default_language.toUpperCase() })]);
      return;
    }
    setBusy(true);
    setErrors([]);
    try {
      const id = await rolloutCity(supabase(), org.id, { baseId: base.id, version: chosen.version, place, name: clean });
      router.push(`/spellen/${id}?nieuw=1`);
    } catch (err) {
      setErrors([err instanceof Error ? err.message : String(err)]);
      setBusy(false);
    }
  };

  if (bases === null) return <p className="muted">{t('Laden…')}</p>;

  return (
    <>
      <p className="muted">
        <Link href="/spellen">{t('Spellen')}</Link>
      </p>
      <h1>{t('Nieuwe stad uitrollen')}</h1>
      <p className="muted">
        {t('Maakt een nieuwe stad op een vaste versie van het basisspel. Alle iconen van de opdrachten komen alvast in het centrum van de stad te staan, zodat je ze daarna naar de juiste plek sleept.')}
      </p>

      {bases.length === 0 ? (
        <p className="card">{t('Er is nog geen basisspel. Importeer eerst een spel.')}</p>
      ) : (
        <form onSubmit={doRollout}>
          <section className="card">
            <h2 style={{ marginTop: 0 }}>1. {t('Template')}</h2>
            {bases.length > 1 ? (
              <>
                <label htmlFor="base">{t('Basisspel')}</label>
                <select id="base" value={baseId} onChange={(e) => setBaseId(e.target.value)} disabled={busy}>
                  {bases.map((b) => (
                    <option key={b.id} value={b.id}>
                      {b.name[lang] ?? b.name[b.default_language] ?? b.slug}
                    </option>
                  ))}
                </select>
              </>
            ) : null}
            {versions.length === 0 ? (
              <p>
                {t('Dit basisspel heeft nog geen vaste versie.')}{' '}
                <Link href={`/spellen/${baseId}`}>{t('Zet eerst een versie vast.')}</Link>
              </p>
            ) : (
              <>
                <label htmlFor="version">{t('Templateversie')}</label>
                <select id="version" value={version} onChange={(e) => setVersion(e.target.value)} disabled={busy}>
                  {versions.map((v, i) => (
                    <option key={v.version} value={String(v.version)}>
                      {t('Template versie {n}', { n: v.version })} · {new Date(v.created_at).toLocaleDateString(locale)}
                      {i === 0 ? ` (${t('nieuwste')})` : ''}
                    </option>
                  ))}
                </select>
                <div className="version-note">
                  {chosen?.note ? (
                    <p style={{ whiteSpace: 'pre-wrap', margin: 0 }}>{chosen.note}</p>
                  ) : (
                    <p className="muted" style={{ margin: 0 }}>
                      {t('Nog geen omschrijving bij deze versie.')}{' '}
                      <Link href={`/spellen/${baseId}#versies`}>{t('Omschrijving toevoegen')}</Link>
                    </p>
                  )}
                </div>
              </>
            )}
          </section>

          <section className="card" style={{ marginTop: 16 }}>
            <h2 style={{ marginTop: 0 }}>2. {t('Land en stad')}</h2>
            <div className="row">
              <div>
                <label htmlFor="country">{t('Land')}</label>
                <select
                  id="country"
                  value={country}
                  onChange={(e) => {
                    setCountry(e.target.value);
                    setFound(null);
                  }}
                  disabled={busy}
                >
                  {countries.map((c) => (
                    <option key={c.code} value={c.code}>
                      {c.name}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label htmlFor="city">{t('Stad')}</label>
                <input
                  id="city"
                  list="city-list"
                  value={cityName}
                  maxLength={80}
                  autoComplete="off"
                  placeholder={t('Kies uit de lijst of typ zelf een plaats')}
                  onChange={(e) => changeCity(e.target.value)}
                  disabled={busy}
                />
                <datalist id="city-list">
                  {(cities?.[country] ?? []).map(([n]) => (
                    <option key={n} value={n} />
                  ))}
                </datalist>
              </div>
            </div>
            {cityName.trim() === '' ? null : place ? (
              <p className="notice">
                {t('Centrum: {lat}, {lng}', { lat: place.lat.toFixed(4), lng: place.lng.toFixed(4) })}{' '}
                <a
                  href={`https://www.openstreetmap.org/?mlat=${place.lat}&mlon=${place.lng}#map=14/${place.lat}/${place.lng}`}
                  target="_blank"
                  rel="noreferrer"
                >
                  {t('Bekijk op de kaart')}
                </a>
              </p>
            ) : (
              <div className="actions">
                <span className="muted">{t('Deze plaats staat niet in de lijst.')}</span>
                <button type="button" className="secondary" onClick={() => void doSearch()} disabled={busy}>
                  {busy ? t('Bezig…') : t('Zoek op de kaart')}
                </button>
              </div>
            )}
          </section>

          <section className="card" style={{ marginTop: 16 }}>
            <h2 style={{ marginTop: 0 }}>3. {t('Naam van het spel')}</h2>
            <p className="muted" style={{ marginTop: 0 }}>
              {t('Dit is de naam in de beheeromgeving, bijvoorbeeld bij het kiezen van een spel voor een nieuwe hunt. Spelers zien de naam van het basisspel.')}
            </p>
            <div className="row">
              {(base?.languages ?? []).map((l) => (
                <div key={l}>
                  <label htmlFor={`name-${l}`}>
                    {t('Naam')} ({l.toUpperCase()})
                  </label>
                  <input
                    id={`name-${l}`}
                    value={shownName[l] ?? ''}
                    maxLength={120}
                    onChange={(e) => setName({ ...shownName, [l]: e.target.value })}
                    disabled={busy}
                  />
                </div>
              ))}
            </div>
            {name ? (
              <button type="button" className="link small" onClick={() => setName(null)} style={{ marginTop: 8 }}>
                {t('Weer automatisch invullen')}
              </button>
            ) : null}
          </section>

          <section className="card" style={{ marginTop: 16 }}>
            <h2 style={{ marginTop: 0 }}>4. {t('Uitrollen')}</h2>
            <p className="muted" style={{ marginTop: 0 }}>{t('Daarna staat bij de nieuwe stad deze lijst met wat nog moet gebeuren:')}</p>
            <ul>
              {CITY_TODOS.map((td) => (
                <li key={td.key}>{t(td.label)}</li>
              ))}
            </ul>
            {errors.length > 0 ? (
              <ul className="errors">
                {errors.map((er, i) => (
                  <li key={i}>{er}</li>
                ))}
              </ul>
            ) : null}
            <div className="actions">
              <button type="submit" disabled={busy || !chosen || !place}>
                {busy
                  ? t('Bezig…')
                  : place
                    ? t('{city} uitrollen', { city: place.name })
                    : t('Uitrollen')}
              </button>
              <Link href="/spellen" className="muted">
                {t('Annuleren')}
              </Link>
            </div>
          </section>
        </form>
      )}
    </>
  );
}
