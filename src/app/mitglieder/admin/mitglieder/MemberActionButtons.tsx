"use client";

import { deleteMember, toggleMemberActive } from "./actions";

export function MemberActionButtons({
  id,
  name,
  isActive,
  isSelf,
}: {
  id: string;
  name: string;
  isActive: boolean;
  isSelf: boolean;
}) {
  if (isSelf) {
    return (
      <span className="text-xs text-muted">
        (eigener Zugang – kann nicht gesperrt/gelöscht werden)
      </span>
    );
  }

  return (
    <div className="flex items-center gap-3">
      <form
        action={toggleMemberActive}
        onSubmit={(e) => {
          const frage = isActive
            ? `Login von „${name}“ wirklich sperren? Die Person kann sich dann nicht mehr anmelden.`
            : `Login von „${name}“ wieder freischalten?`;
          if (!confirm(frage)) e.preventDefault();
        }}
      >
        <input type="hidden" name="id" value={id} />
        <input type="hidden" name="is_active" value={String(isActive)} />
        <button
          className={`text-sm hover:underline ${
            isActive ? "text-warn" : "text-ok"
          }`}
        >
          {isActive ? "Login sperren" : "Entsperren"}
        </button>
      </form>

      <form
        action={deleteMember}
        onSubmit={(e) => {
          if (
            !confirm(
              `„${name}“ wirklich ENDGÜLTIG löschen?\n\nLogin, Profil, Mannschafts-Zuordnungen und Zu-/Absagen werden entfernt. Das kann nicht rückgängig gemacht werden.\n\nTipp: Zum vorübergehenden Ausschließen lieber „Login sperren“ nutzen.`,
            )
          )
            e.preventDefault();
        }}
      >
        <input type="hidden" name="id" value={id} />
        <button className="text-sm text-danger hover:underline">
          Löschen
        </button>
      </form>
    </div>
  );
}
