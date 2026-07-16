"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { FRAGE_ARTEN } from "@/lib/types";

export async function createQuestion(formData: FormData) {
  const title = String(formData.get("title") ?? "").trim();
  const body = String(formData.get("body") ?? "").trim();
  const teamId = String(formData.get("team_id") ?? "");
  const kindRaw = String(formData.get("kind") ?? "frage");
  const kind = kindRaw in FRAGE_ARTEN ? kindRaw : "frage";
  if (!title) return;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return;

  const { data, error } = await supabase
    .from("questions")
    .insert({
      title,
      body,
      team_id: teamId || null,
      author_id: user.id,
      kind,
    })
    .select("id")
    .single();

  if (error) {
    const text = /column|schema|relation/i.test(error.message)
      ? "Bitte zuerst ALLE_ERWEITERUNGEN.sql im Supabase SQL-Editor ausführen."
      : error.message;
    redirect(`/mitglieder/fragen?fehler=${encodeURIComponent(text)}`);
  }

  revalidatePath("/mitglieder/fragen");
  if (data?.id) redirect(`/mitglieder/fragen/${data.id}`);
}

export async function createAnswer(formData: FormData) {
  const body = String(formData.get("body") ?? "").trim();
  const questionId = String(formData.get("question_id") ?? "");
  if (!body || !questionId) return;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return;

  await supabase.from("answers").insert({
    question_id: questionId,
    body,
    author_id: user.id,
  });

  revalidatePath(`/mitglieder/fragen/${questionId}`);
}
