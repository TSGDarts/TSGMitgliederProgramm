"use server";

// Aktionen fürs Kassenbuch. Alle Kassen-Tabellen haben RLS ohne Policies –
// Zugriff läuft ausschließlich über den Service-Schlüssel (admin) NACH
// Berechtigungsprüfung im Code (Kassierer/Admin bzw. für Auslagen: das
// jeweilige Mitglied selbst).

import { revalidatePath } from "next/cache";
import { requireProfile, requireTreasurer } from "@/lib/auth";
import { createAdminSupabase } from "@/lib/supabase/admin";
import { benachrichtige } from "@/lib/benachrichtigung";
import { parseKostenstellenauswertung } from "@/lib/kasse-import";

export type Res = { ok: boolean; message?: string };

const euro = (n: number | null | undefined) =>
  n == null
    ? "—"
    : new Intl.NumberFormat("de-DE", {
        style: "currency",
        currency: "EUR",
      }).format(n);

function zahl(v: FormDataEntryValue | null): number | null {
  const s = String(v ?? "").trim().replace(/\./g, "").replace(",", ".");
  if (!s) return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}
function datum(v: FormDataEntryValue | null): string | null {
  const s = String(v ?? "").trim();
  return /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : null;
}

/** Kassierer/Admin für Benachrichtigungen. */
async function kassiererIds(
  admin: ReturnType<typeof createAdminSupabase>,
): Promise<string[]> {
  const { data } = await admin
    .from("profiles")
    .select("id, role, is_treasurer")
    .eq("is_active", true);
  return (data ?? [])
    .filter((p) => p.role === "admin" || p.is_treasurer)
    .map((p) => p.id as string);
}

/** Monatliche StarMoney-Auswertung hochladen und automatisch auslesen. */
export async function importKontostand(
  _prev: Res | null,
  formData: FormData,
): Promise<Res> {
  const profile = await requireTreasurer();
  const datei = formData.get("datei");
  if (!(datei instanceof File) || datei.size === 0) {
    return { ok: false, message: "Bitte die Excel-Datei vom Hauptverein auswählen." };
  }

  let auswertung;
  try {
    const buf = await datei.arrayBuffer();
    auswertung = parseKostenstellenauswertung(buf);
  } catch (e) {
    return {
      ok: false,
      message: `Datei konnte nicht gelesen werden: ${
        e instanceof Error ? e.message : "unbekannt"
      }`,
    };
  }
  if (auswertung.buchungen.length === 0 && auswertung.saldo === null) {
    return {
      ok: false,
      message: "In der Datei wurden keine Buchungen/Salden gefunden. Ist es die richtige Auswertung?",
    };
  }

  let admin;
  try {
    admin = createAdminSupabase();
  } catch {
    return { ok: false, message: "SUPABASE_SERVICE_ROLE_KEY fehlt." };
  }

  // Original-Datei ablegen (Nachweis)
  let filePath = "";
  try {
    const safe = datei.name.replace(/[^a-zA-Z0-9.\-_]/g, "_");
    filePath = `auswertung/${crypto.randomUUID()}-${safe}`;
    await admin.storage
      .from("kasse")
      .upload(filePath, Buffer.from(await datei.arrayBuffer()), {
        contentType:
          datei.type ||
          "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        upsert: false,
      });
  } catch {
    filePath = ""; // Ablage ist optional
  }

  // bisherige „aktuelle" Auswertung ablösen
  await admin.from("kasse_import").update({ is_current: false }).eq("is_current", true);

  const { data: imp, error } = await admin
    .from("kasse_import")
    .insert({
      stichtag: auswertung.stichtag,
      dateiname: datei.name,
      file_path: filePath,
      einnahmen: auswertung.einnahmen,
      ausgaben: auswertung.ausgaben,
      saldo: auswertung.saldo,
      is_current: true,
      created_by: profile.id,
    })
    .select("id")
    .single();
  if (error) {
    const text = /relation|column|schema/i.test(error.message)
      ? "Bitte zuerst supabase/ALLE_ERWEITERUNGEN.sql im SQL-Editor ausführen."
      : error.message;
    return { ok: false, message: text };
  }

  if (auswertung.buchungen.length > 0) {
    const rows = auswertung.buchungen.map((b) => ({
      import_id: imp.id as string,
      datum: b.datum,
      empfaenger: b.empfaenger,
      betrag: b.betrag,
      kategorie: b.kategorie,
      konto: b.konto,
      zweck: b.zweck,
    }));
    // in Blöcken einfügen
    for (let i = 0; i < rows.length; i += 500) {
      await admin.from("kasse_buchung").insert(rows.slice(i, i + 500));
    }
  }

  revalidatePath("/mitglieder/kasse");
  return {
    ok: true,
    message: `✓ Eingelesen: Saldo ${euro(auswertung.saldo)} (${
      auswertung.buchungen.length
    } Buchungen, Stichtag ${auswertung.stichtag ?? "unbekannt"}).`,
  };
}

/** Einen Import (mitsamt Buchungen) löschen. */
export async function deleteImport(formData: FormData): Promise<void> {
  await requireTreasurer();
  const id = String(formData.get("id") ?? "");
  if (!id) return;
  const admin = createAdminSupabase();
  const { data: weg } = await admin
    .from("kasse_import")
    .select("is_current")
    .eq("id", id)
    .maybeSingle();
  await admin.from("kasse_import").delete().eq("id", id); // buchungen per cascade
  // Falls der aktuelle gelöscht wurde: neuesten verbleibenden aktuell setzen
  if (weg?.is_current) {
    const { data: neu } = await admin
      .from("kasse_import")
      .select("id")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (neu?.id) {
      await admin.from("kasse_import").update({ is_current: true }).eq("id", neu.id);
    }
  }
  revalidatePath("/mitglieder/kasse");
}

/** Beleg/Rechnung (3k, BDV …) ablegen. Datei wird clientseitig hochgeladen. */
export async function saveBeleg(_prev: Res | null, formData: FormData): Promise<Res> {
  const profile = await requireTreasurer();
  const titel = String(formData.get("titel") ?? "").trim();
  if (!titel) return { ok: false, message: "Bitte einen Titel angeben." };

  const admin = createAdminSupabase();
  const { error } = await admin.from("kasse_beleg").insert({
    titel,
    empfaenger: String(formData.get("empfaenger") ?? "").trim(),
    betrag: zahl(formData.get("betrag")),
    datum: datum(formData.get("datum")),
    kategorie: String(formData.get("kategorie") ?? "").trim(),
    file_path: String(formData.get("file_path") ?? "").trim(),
    dateiname: String(formData.get("dateiname") ?? "").trim(),
    note: String(formData.get("note") ?? "").trim(),
    created_by: profile.id,
  });
  if (error) {
    const text = /relation|column|schema/i.test(error.message)
      ? "Bitte zuerst supabase/ALLE_ERWEITERUNGEN.sql im SQL-Editor ausführen."
      : error.message;
    return { ok: false, message: text };
  }
  revalidatePath("/mitglieder/kasse");
  return { ok: true, message: "✓ Beleg gespeichert." };
}

export async function deleteBeleg(formData: FormData): Promise<void> {
  await requireTreasurer();
  const id = String(formData.get("id") ?? "");
  if (!id) return;
  const admin = createAdminSupabase();
  const { data: beleg } = await admin
    .from("kasse_beleg")
    .select("file_path")
    .eq("id", id)
    .maybeSingle();
  if (beleg?.file_path) {
    await admin.storage.from("kasse").remove([beleg.file_path as string]);
  }
  await admin.from("kasse_beleg").delete().eq("id", id);
  revalidatePath("/mitglieder/kasse");
}

/** Auslage/Beleg zur Erstattung einreichen (jedes Mitglied). */
export async function reichAuslageEin(
  _prev: Res | null,
  formData: FormData,
): Promise<Res> {
  const profile = await requireProfile();
  const titel = String(formData.get("titel") ?? "").trim();
  const betrag = zahl(formData.get("betrag"));
  if (!titel) {
    return {
      ok: false,
      message: "Bitte kurz angeben, wofür (z. B. Weizen fürs Heimspiel).",
    };
  }
  if (betrag === null || betrag <= 0) {
    return { ok: false, message: "Bitte einen gültigen Betrag angeben." };
  }

  const admin = createAdminSupabase();
  const { error } = await admin.from("kasse_auslage").insert({
    profile_id: profile.id,
    titel,
    betrag,
    datum: datum(formData.get("datum")),
    zweck: String(formData.get("zweck") ?? "").trim(),
    iban: String(formData.get("iban") ?? "").trim(),
    file_path: String(formData.get("file_path") ?? "").trim(),
    dateiname: String(formData.get("dateiname") ?? "").trim(),
    status: "eingereicht",
  });
  if (error) {
    const text = /relation|column|schema/i.test(error.message)
      ? "Bitte zuerst supabase/ALLE_ERWEITERUNGEN.sql im SQL-Editor ausführen."
      : error.message;
    return { ok: false, message: text };
  }

  // Kassierer benachrichtigen
  try {
    const ids = await kassiererIds(admin);
    await benachrichtige(ids, {
      title: `🧾 Neue Auslage: ${euro(betrag)}`,
      body: `${profile.full_name || "Ein Mitglied"} hat „${titel}" zur Erstattung eingereicht.`,
      url: "/mitglieder/kasse",
    });
  } catch {
    // best-effort
  }

  revalidatePath("/mitglieder/auslagen");
  revalidatePath("/mitglieder/kasse");
  return { ok: true, message: "✓ Antrag eingereicht. Der Kassierer prüft ihn." };
}

/** Auslage-Antrag zurückziehen (nur der Antragsteller, nur solange offen). */
export async function ziehAuslageZurueck(formData: FormData): Promise<void> {
  const profile = await requireProfile();
  const id = String(formData.get("id") ?? "");
  if (!id) return;
  const admin = createAdminSupabase();
  await admin
    .from("kasse_auslage")
    .delete()
    .eq("id", id)
    .eq("profile_id", profile.id)
    .eq("status", "eingereicht");
  revalidatePath("/mitglieder/auslagen");
}

/** Kassierer entscheidet über eine Auslage. */
export async function entscheideAuslage(
  id: string,
  status: "genehmigt" | "abgelehnt" | "ausgezahlt",
  note: string,
): Promise<Res> {
  const profile = await requireTreasurer();
  if (!id) return { ok: false, message: "Antrag fehlt." };
  const admin = createAdminSupabase();
  const { data: auslage } = await admin
    .from("kasse_auslage")
    .select("profile_id, titel, betrag")
    .eq("id", id)
    .maybeSingle();
  if (!auslage) return { ok: false, message: "Antrag nicht gefunden." };

  const { error } = await admin
    .from("kasse_auslage")
    .update({
      status,
      bearbeiter_id: profile.id,
      bearbeiter_note: note.trim().slice(0, 500),
      updated_at: new Date().toISOString(),
    })
    .eq("id", id);
  if (error) return { ok: false, message: error.message };

  // Antragsteller benachrichtigen
  try {
    const text =
      status === "genehmigt"
        ? "wurde genehmigt und wird ausgezahlt"
        : status === "ausgezahlt"
          ? "wurde ausgezahlt"
          : "wurde leider abgelehnt";
    const zeichen =
      status === "abgelehnt" ? "❌" : status === "ausgezahlt" ? "💶" : "✅";
    await benachrichtige([auslage.profile_id as string], {
      title: `${zeichen} Auslage ${euro(auslage.betrag as number)}`,
      body: `Dein Antrag „${auslage.titel}" ${text}.${note.trim() ? ` Hinweis: ${note.trim()}` : ""}`,
      url: "/mitglieder/auslagen",
    });
  } catch {
    // best-effort
  }

  revalidatePath("/mitglieder/kasse");
  revalidatePath("/mitglieder/auslagen");
  return { ok: true };
}

/** Signierte Download-Adresse einer Kassen-Datei (nur Kassierer/Admin). */
export async function kasseDateiUrl(path: string): Promise<string | null> {
  await requireTreasurer();
  if (!path) return null;
  const admin = createAdminSupabase();
  const { data } = await admin.storage.from("kasse").createSignedUrl(path, 600);
  return data?.signedUrl ?? null;
}

/** Signierte Adresse eines eigenen Auslage-Belegs (Antragsteller oder Kassierer). */
export async function auslageDateiUrl(auslageId: string): Promise<string | null> {
  const profile = await requireProfile();
  if (!auslageId) return null;
  const admin = createAdminSupabase();
  const { data: a } = await admin
    .from("kasse_auslage")
    .select("profile_id, file_path")
    .eq("id", auslageId)
    .maybeSingle();
  if (!a?.file_path) return null;
  const erlaubt =
    a.profile_id === profile.id ||
    profile.role === "admin" ||
    !!profile.is_treasurer;
  if (!erlaubt) return null;
  const { data } = await admin.storage
    .from("kasse")
    .createSignedUrl(a.file_path as string, 600);
  return data?.signedUrl ?? null;
}
