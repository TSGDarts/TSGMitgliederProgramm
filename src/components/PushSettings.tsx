"use client";

import { useEffect, useState } from "react";
import {
  savePushSubscription,
  deletePushSubscription,
} from "@/app/mitglieder/profil/push-actions";

// Push-Benachrichtigungen pro GERÄT ein-/ausschalten (jedes Handy/jeder
// Browser meldet sich einzeln an). Läuft nur, wenn der Browser Push kann
// und der öffentliche VAPID-Schlüssel gesetzt ist.

function urlBase64ToUint8Array(base64: string): Uint8Array {
  const padding = "=".repeat((4 - (base64.length % 4)) % 4);
  const b64 = (base64 + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(b64);
  const arr = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) arr[i] = raw.charCodeAt(i);
  return arr;
}

type Status = "laedt" | "aus" | "an" | "verweigert" | "nicht-moeglich";

export function PushSettings() {
  const [status, setStatus] = useState<Status>("laedt");
  const [meldung, setMeldung] = useState("");
  const [beschaeftigt, setBeschaeftigt] = useState(false);
  const vapid = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY ?? "";

  useEffect(() => {
    (async () => {
      if (
        !vapid ||
        !("serviceWorker" in navigator) ||
        !("PushManager" in window) ||
        !("Notification" in window)
      ) {
        setStatus("nicht-moeglich");
        return;
      }
      if (Notification.permission === "denied") {
        setStatus("verweigert");
        return;
      }
      try {
        const reg = await navigator.serviceWorker.register("/sw.js");
        const sub = await reg.pushManager.getSubscription();
        setStatus(sub ? "an" : "aus");
      } catch {
        setStatus("nicht-moeglich");
      }
    })();
  }, [vapid]);

  async function einschalten() {
    setBeschaeftigt(true);
    setMeldung("");
    try {
      const erlaubnis = await Notification.requestPermission();
      if (erlaubnis !== "granted") {
        setStatus("verweigert");
        return;
      }
      const reg = await navigator.serviceWorker.register("/sw.js");
      const sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(vapid).buffer as ArrayBuffer,
      });
      const json = sub.toJSON();
      const res = await savePushSubscription({
        endpoint: sub.endpoint,
        keys: {
          p256dh: json.keys?.p256dh ?? "",
          auth: json.keys?.auth ?? "",
        },
      });
      if (!res.ok) {
        setMeldung(res.message ?? "Konnte nicht gespeichert werden.");
        await sub.unsubscribe();
        return;
      }
      setStatus("an");
    } catch {
      setMeldung("Push konnte auf diesem Gerät nicht aktiviert werden.");
    } finally {
      setBeschaeftigt(false);
    }
  }

  async function ausschalten() {
    setBeschaeftigt(true);
    setMeldung("");
    try {
      const reg = await navigator.serviceWorker.register("/sw.js");
      const sub = await reg.pushManager.getSubscription();
      if (sub) {
        await deletePushSubscription(sub.endpoint);
        await sub.unsubscribe();
      }
      setStatus("aus");
    } finally {
      setBeschaeftigt(false);
    }
  }

  if (status === "laedt") {
    return <p className="text-sm text-muted">Prüfe Push-Unterstützung …</p>;
  }
  if (status === "nicht-moeglich") {
    return (
      <p className="text-sm text-muted">
        Push wird auf diesem Gerät/Browser nicht unterstützt
        {!vapid ? " (bzw. ist noch nicht eingerichtet)" : ""}. Tipp fürs
        iPhone: zuerst die App über „App &amp; Teilen“ zum Home-Bildschirm
        hinzufügen und von dort öffnen.
      </p>
    );
  }
  if (status === "verweigert") {
    return (
      <p className="text-sm text-warn">
        Benachrichtigungen sind für diese Seite blockiert. Bitte in den
        Browser-/Website-Einstellungen erlauben und die Seite neu laden.
      </p>
    );
  }

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-3">
        {status === "an" ? (
          <>
            <span className="text-sm font-medium text-ok">
              ✓ Push ist auf diesem Gerät aktiv
            </span>
            <button
              type="button"
              onClick={ausschalten}
              disabled={beschaeftigt}
              className="rounded-lg border border-border px-3 py-1.5 text-sm hover:bg-border/40 disabled:opacity-60"
            >
              Auf diesem Gerät ausschalten
            </button>
          </>
        ) : (
          <button
            type="button"
            onClick={einschalten}
            disabled={beschaeftigt}
            className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-fg hover:opacity-90 disabled:opacity-60"
          >
            🔔 Push auf diesem Gerät aktivieren
          </button>
        )}
      </div>
      {meldung && <p className="text-xs text-danger">{meldung}</p>}
      <p className="text-xs text-muted">
        Gilt pro Gerät – Handy und PC also einzeln aktivieren. Benachrichtigt
        wird bei neuen Terminen/Trainings, freigegebenen Aufstellungen und –
        falls oben eingestellt – vor Turnieren.
      </p>
    </div>
  );
}
