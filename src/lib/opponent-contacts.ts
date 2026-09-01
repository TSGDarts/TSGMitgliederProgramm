export interface OpponentTeamContact {
  id: string;
  opponent_id: string;
  team_no: number;
  name: string;
  phone: string;
  email: string;
  source_url: string;
  created_at?: string;
  updated_at?: string;
}

/**
 * WhatsApp-Ziel für veröffentlichte deutsche Mobilnummern. Auffällige oder
 * reine Festnetznummern bleiben bewusst ohne automatischen Empfänger.
 */
export function germanMobileForWhatsApp(phone: string): string {
  const trimmed = phone.trim();
  if (!trimmed) return "";

  let digits = trimmed.replace(/\D/g, "");
  if (trimmed.startsWith("+")) {
    // Die führende Landesvorwahl ist bereits enthalten.
  } else if (digits.startsWith("00")) {
    digits = digits.slice(2);
  } else if (digits.startsWith("0")) {
    digits = `49${digits.slice(1)}`;
  }

  return /^491[5-7]\d{8,9}$/.test(digits) ? digits : "";
}
