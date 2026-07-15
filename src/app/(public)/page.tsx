import { redirect } from "next/navigation";
import { getCurrentProfile } from "@/lib/auth";

// Keine öffentliche Startseite mehr: Wer die Seite (oder die App) öffnet,
// landet direkt im Mitgliederbereich bzw. beim Login.
export default async function HomePage() {
  const profile = await getCurrentProfile();
  redirect(profile ? "/mitglieder" : "/login");
}
