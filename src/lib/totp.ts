import { authenticator } from "otplib";
import QRCode from "qrcode";

/**
 * TOTP 2FA for staff/admin accounts (SPEC §10). Admin takeover is the highest
 * value target, so every staff-like account must enroll a TOTP authenticator.
 */
const ISSUER = "Teacher Eva & Manuel Portal";

export function generateTotpSecret(): string {
  return authenticator.generateSecret();
}

export function totpKeyUri(email: string, secret: string): string {
  return authenticator.keyuri(email, ISSUER, secret);
}

export async function totpQrDataUrl(email: string, secret: string): Promise<string> {
  return QRCode.toDataURL(totpKeyUri(email, secret));
}

export function verifyTotp(token: string, secret: string): boolean {
  try {
    return authenticator.verify({ token: token.trim(), secret });
  } catch {
    return false;
  }
}
