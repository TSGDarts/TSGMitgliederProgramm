"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

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

  await supabase
    .from("profiles")
    .update({
      full_name,
      phone,
      birthday,
      birthday_public,
      birthday_congrats,
      training_default_rsvp,
      notify_email: formData.get("notify_email") === "on",
      notify_trotz_absage: formData.get("notify_trotz_absage") === "on",
      notify_erinnerungen: (() => {
        // Komma-getrennte Tages-Listen (erinnerung_<art> = „14, 7, 1“) parsen
        const arten = [
          "punktspiele",
          "pokal",
          "freundschaft",
          "training",
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

  revalidatePath("/mitglieder/profil");
  revalidatePath("/mitglieder");
}
