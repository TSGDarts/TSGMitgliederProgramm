// Gezielter PostgreSQL-Regressionstest, ausschließlich mit lokalen Testdaten.
// Benötigt @electric-sql/pglite (ggf. separat installieren und NODE_PATH setzen).
// Aufruf: node scripts/test-jersey-survey.mjs
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import path from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';

const loadDependency = createRequire(import.meta.url);
const { PGlite } = loadDependency('@electric-sql/pglite');
const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));

test('Trikotabfrage: ursprünglicher Fehler und korrigierte Zugriffsrechte', async (t) => {
  const db = new PGlite();
  const id = (n) => `00000000-0000-0000-0000-${String(n).padStart(12, '0')}`;
  const sqlFile = (file) => readFile(path.join(scriptDirectory, '..', 'supabase', file), 'utf8');
  const asUser = async (n, sql, params = [], role = 'authenticated') => {
    await db.exec(`set role ${role}`);
    try {
      await db.query("select set_config('request.jwt.claim.sub', $1, false), set_config('request.jwt.claim.role', $2, false)", [n ? id(n) : '', role]);
      return await db.query(sql, params);
    } finally {
      await db.exec('reset role');
    }
  };
  const save = async (n, size) => (await asUser(n, 'select public.set_own_jersey_size($1) as saved', [size])).rows[0].saved;
  const toggle = (open) => asUser(1, 'select public.set_jersey_survey_open($1)', [open]);
  const sizeOf = async (n) => (await db.query('select jersey_size from profiles where id = $1', [id(n)])).rows[0].jersey_size;
  const permissionOf = async (n) => (await db.query('select can_view_jersey_report from profiles where id = $1', [id(n)])).rows[0].can_view_jersey_report;

  try {
    await db.exec(`
      create role authenticated nologin;
      create role anon nologin;
      create role service_role nologin bypassrls;
      create schema auth;
      create function auth.uid() returns uuid language sql as
        $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
      create function auth.role() returns text language sql as
        $$ select current_setting('request.jwt.claim.role', true) $$;
      grant usage on schema public, auth to authenticated, anon, service_role;
      create table public.profiles (id uuid primary key, role text, is_active boolean not null default true);
      create table public.member_invites (id uuid primary key);
      create table public.app_settings (key text primary key, value text not null, updated_at timestamptz default now());
      create function public.is_admin() returns boolean language sql security definer set search_path = public as
        $$ select exists (select 1 from profiles where id = auth.uid() and role = 'admin' and is_active) $$;
      create function public.is_editor() returns boolean language sql security definer set search_path = public as
        $$ select exists (select 1 from profiles where id = auth.uid() and role in ('admin', 'editor') and is_active) $$;
      alter table public.profiles enable row level security;
      alter table public.app_settings enable row level security;
      alter table public.member_invites enable row level security;
      create policy profiles_read on public.profiles for select using (auth.uid() is not null);
      create policy profiles_update_self_or_admin on public.profiles for update using (id = auth.uid() or public.is_admin());
      create policy profiles_admin_write on public.profiles for all using (public.is_admin()) with check (public.is_admin());
      create policy app_settings_read on public.app_settings for select using (auth.uid() is not null);
      create policy app_settings_admin on public.app_settings for all using (public.is_editor()) with check (public.is_editor());
      create policy member_invites_admin on public.member_invites for all using (public.is_admin()) with check (public.is_admin());
      grant all on all tables in schema public to authenticated, service_role;
    `);
    for (const [n, role, active] of [[1, 'admin', true], [2, 'member', true], [3, 'player', true], [4, 'editor', true], [5, 'member', false]]) {
      await db.query('insert into profiles (id, role, is_active) values ($1, $2, $3)', [id(n), role, active]);
    }
    await db.exec(await sqlFile('65_trikotgroesse.sql'));

    await t.test('reproduziert: offen lesbar, Admin speichert, normales Mitglied erhält false', async () => {
      await toggle(true);
      assert.equal((await asUser(2, "select value from app_settings where key = 'jersey_survey_open'")).rows[0].value, 'true');
      assert.equal(await save(1, 'M'), true);
      assert.equal(await save(2, 'L'), false);
      assert.equal(await sizeOf(2), null);
    });

    const migration = await sqlFile('68_trikot_fix_auswertung.sql');
    await db.exec(migration);

    await t.test('Migration erhält Öffnungsstatus und vorhandene Größen', async () => {
      assert.equal(await sizeOf(1), 'M');
      assert.equal((await db.query("select value from app_settings where key = 'jersey_survey_open'")).rows[0].value, 'true');
    });

    await t.test('Mitglied, Spieler, Bearbeiter und Admin speichern nur ihre eigene Größe', async () => {
      for (const n of [2, 3, 4, 1]) assert.equal(await save(n, 'L'), true);
      assert.equal(await save(2, '2XS'), true);
      assert.equal(await sizeOf(2), '2XS');
      for (const n of [1, 3, 4]) assert.equal(await sizeOf(n), 'L');
    });

    await t.test('alle 14 angebotenen Größen lassen sich speichern', async () => {
      for (const size of ['2XS', 'XS', 'S', 'M', 'L', 'XL', '2XL', '3XL', '4XL', '5XL', '6XL', '7XL', '8XL', '9XL']) {
        assert.equal(await save(2, size), true);
        assert.equal(await sizeOf(2), size);
      }
    });

    await t.test('geschlossene Abfrage blockiert RPC und direkte Größenänderung', async () => {
      await toggle(false);
      assert.equal(await save(2, 'S'), false);
      assert.equal(await save(1, 'S'), false);
      await assert.rejects(() => asUser(2, 'update profiles set jersey_size = $1 where id = $2', ['S', id(2)]), /geschlossen/);
      assert.equal(await sizeOf(2), '9XL');
      await toggle(true);
    });

    await t.test('inaktive und fehlende Profile sowie fehlende Anmeldung speichern nichts', async () => {
      assert.equal(await save(5, 'M'), false);
      assert.equal(await save(99, 'M'), false);
      assert.equal(await save(null, 'M'), false);
      await assert.rejects(() => asUser(null, "select public.set_own_jersey_size('M')", [], 'anon'), /permission denied/);
      assert.equal(await sizeOf(5), null);
    });

    await t.test('ungültige oder leere Größen werden zurückgewiesen', async () => {
      for (const size of [null, '', 'XXL', 'unbekannt']) await assert.rejects(() => save(2, size), /gültige Trikotgröße/);
      assert.equal(await sizeOf(2), '9XL');
    });

    await t.test('Mitglied erhält keine Änderungsrechte für den Freigabeschalter', async () => {
      const result = await asUser(2, "update app_settings set value = 'false' where key = 'jersey_survey_open' returning key");
      assert.deepEqual(result.rows, []);
      await assert.rejects(() => asUser(4, "update app_settings set value = 'false' where key = 'jersey_survey_open'"), /Nicht berechtigt/);
      assert.equal(await save(2, 'XL'), true);
    });

    await t.test('Mitglied und Bearbeiter dürfen sich die Auswertung nicht selbst freigeben', async () => {
      for (const n of [2, 4]) {
        await assert.rejects(() => asUser(n, 'update profiles set can_view_jersey_report = true where id = $1', [id(n)]), /Nur Admins/);
        assert.equal(await permissionOf(n), false);
      }
    });

    await t.test('Admin kann Auswertung gewähren und entziehen; normale Größenänderung bleibt möglich', async () => {
      await asUser(1, 'update profiles set can_view_jersey_report = true where id = $1', [id(2)]);
      assert.equal(await permissionOf(2), true);
      assert.equal(await save(2, '3XL'), true);
      await asUser(1, 'update profiles set can_view_jersey_report = false where id = $1', [id(2)]);
      assert.equal(await permissionOf(2), false);
    });

    await t.test('Admin-Invite und serverseitige Berechtigungsübernahme funktionieren', async () => {
      await asUser(1, 'insert into member_invites (id, can_view_jersey_report) values ($1, true)', [id(20)]);
      await asUser(null, 'update profiles set can_view_jersey_report = true where id = $1', [id(3)], 'service_role');
      assert.equal(await permissionOf(3), true);
    });

    await t.test('erneute Migration erhält Größen und bereits vergebene Rechte', async () => {
      await db.exec(migration);
      assert.equal(await permissionOf(3), true);
      assert.equal(await sizeOf(2), '3XL');
      assert.equal(await save(2, '4XL'), true);
    });
  } finally {
    await db.close();
  }
});
