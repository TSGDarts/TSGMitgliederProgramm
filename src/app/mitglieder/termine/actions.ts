"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import type { RsvpStatus } from "@/lib/types";

export async function setRsvp(eventId: string, status: RsvpStatus) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Nicht angemeldet." };

  const { error } = await supabase.from("rsvps").upsert(
    {
      event_id: eventId,
      profile_id: user.id,
      status,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "event_id,profile_id" },
  );

  if (error) return { ok: false, error: error.message };

  revalidatePath("/mitglieder");
  revalidatePath("/mitglieder/termine");
  revalidatePath(`/mitglieder/termine/${eventId}`);
  return { ok: true };
}
