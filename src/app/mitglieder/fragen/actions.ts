"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export async function createQuestion(formData: FormData) {
  const title = String(formData.get("title") ?? "").trim();
  const body = String(formData.get("body") ?? "").trim();
  const teamId = String(formData.get("team_id") ?? "");
  if (!title) return;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return;

  const { data } = await supabase
    .from("questions")
    .insert({
      title,
      body,
      team_id: teamId || null,
      author_id: user.id,
    })
    .select("id")
    .single();

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
