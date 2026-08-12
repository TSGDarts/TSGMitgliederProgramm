"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireProfile } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { isJerseySize } from "@/lib/jersey";

const PFAD = "/mitglieder/profil";

/** Speichert die Trikotgröße separat vom restlichen Profilformular. */
export async function updateJerseySize(formData: FormData) {
  const profile = await requireProfile(PFAD);
  const jerseySizeRaw = String(formData.get("jersey_size") ?? "");
  if (!isJerseySize(jerseySizeRaw)) {
    redirect(
      `${PFAD}?trikot_fehler=${encodeURIComponent("Bitte wähle eine gültige Trikotgröße aus.")}#trikotgroesse`,
    );
  }

  const supabase = await createClient();
  // Die DB-Funktion prüft Öffnungsstatus und speichert atomar. Damit kann
  // kein paralleles Schließen zwischen Prüfung und Update geraten.
  const { data: gespeichert, error } = await supabase.rpc(
    "set_own_jersey_size",
    { new_size: jerseySizeRaw },
  );
  if (error) {
    const text = /column|schema|relation|function|schema cache/i.test(
      error.message,
    )
      ? "Bitte zuerst ALLE_ERWEITERUNGEN.sql im Supabase SQL-Editor ausführen."
      : error.message;
    redirect(`${PFAD}?trikot_fehler=${encodeURIComponent(text)}#trikotgroesse`);
  }
  if (!gespeichert) {
    redirect(
      `${PFAD}?trikot_fehler=${encodeURIComponent("Die Trikotgrößen-Abfrage ist momentan geschlossen.")}#trikotgroesse`,
    );
  }

  revalidatePath(PFAD);
  revalidatePath("/mitglieder");
  revalidatePath("/mitglieder/admin/mitglieder");
  redirect(
    `${PFAD}?gespeichert=trikot-${profile.id}-${Date.now()}#trikotgroesse`,
  );
}

export async function updateProfile(formData: FormData) {
  const full_name = String(formData.get("full_name") ?? "").trim();
  const phone = String(formData.get("phone") ?? "").trim();
  const birthdayRaw = String(formData.get("birthday") ?? "");
  const birthday = /^\d{4}-\d{2}-\d{2}$/.test(birthdayRaw)
    ? birthdayRaw
    : null;
  const birthday_public = formData.get("birthday_public") === "on";
  const birthday_congrats = formData.get("birthday_congrats") === "on";
  const rsvpRaw = String(formData.get("training_default_rsvp") ?? "");
  const training_default_rsvp = ["", "yes", "maybe", "no"].includes(rsvpRaw)
    ? rsvpRaw
    : "";

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return;

  const { error } = await supabase
    .from("profiles")
    .update({
      full_name,
      phone,
      birthday,
      birthday_public,
      birthday_congrats,
      training_default_rsvp,
      notify_email: formData.get("notify_email") === "on",
      notify_wochenblick: formData.get("notify_wochenblick") === "on",
      notify_trotz_zusage: formData.get("notify_trotz_zusage") === "on",
      notify_trotz_vielleicht: formData.get("notify_trotz_vielleicht") === "on",
      notify_trotz_absage: formData.get("notify_trotz_absage") === "on",
      notify_erinnerungen: (() => {
        // Komma-getrennte Tages-Listen (erinnerung_<art> = „14, 7, 1“) parsen
        const arten = [
          "punktspiele",
          "pokal",
          "freundschaft",
          "training",
          "feste",
          "verein",
          "turniere",
        ];
        const erinnerungen: Record<string, number[]> = {};
        for (const art of arten) {
          const roh = String(formData.get(`erinnerung_${art}`) ?? "");
          const liste = [
            ...new Set(
              roh
                .split(/[,;\s]+/)
                .map((t) => Math.round(Number(t)))
                .filter((n) => Number.isFinite(n) && n >= 1 && n <= 30),
            ),
          ].sort((a, b) => b - a);
          if (liste.length) erinnerungen[art] = liste;
        }
        return erinnerungen;
      })(),
    })
    .eq("id", user.id);

  if (error) {
    const text = /column|schema|relation/i.test(error.message)
      ? "Bitte zuerst ALLE_ERWEITERUNGEN.sql im Supabase SQL-Editor ausführen."
      : error.message;
    redirect(`${PFAD}?fehler=${encodeURIComponent(text)}`);
  }

  revalidatePath(PFAD);
  revalidatePath("/mitglieder");
  redirect(`${PFAD}?gespeichert=${Date.now()}`);
}
