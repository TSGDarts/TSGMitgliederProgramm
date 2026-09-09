"use client";

import { useFormStatus } from "react-dom";
import { Button } from "@/components/ui";

export function TrainingSubmitButton() {
  const { pending } = useFormStatus();

  return (
    <Button type="submit" disabled={pending} aria-busy={pending}>
      {pending ? "Wird gespeichert …" : "Training eintragen"}
    </Button>
  );
}
