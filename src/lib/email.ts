import { Resend } from "resend";
import { emailDryRun, env } from "./env";

/**
 * Email delivery (SPEC §9.3). Sends through a bulk-capable transactional
 * provider (Resend) — NEVER Gmail. Emails are tiny notifications with NO
 * attachments; files always stay in object storage and are self-served via login links.
 *
 * EMAIL_DRY_RUN=1 prints to the console instead of sending, so the app is
 * usable locally before Resend / DNS (SPF, DKIM, DMARC) is configured.
 */
const resend = env.RESEND_API_KEY ? new Resend(env.RESEND_API_KEY) : null;

async function send(opts: {
  to: string;
  subject: string;
  html: string;
  text: string;
}): Promise<void> {
  if (emailDryRun() || !resend) {
    console.log(
      `\n--- EMAIL (dry-run) ---\nTo: ${opts.to}\nSubject: ${opts.subject}\n${opts.text}\n-----------------------\n`
    );
    return;
  }
  await resend.emails.send({
    from: env.EMAIL_FROM,
    to: opts.to,
    subject: opts.subject,
    html: opts.html,
    text: opts.text,
  });
}

const unsubscribeFooter = `\n\nYou can manage email preferences after logging in.`;

/** Magic-link login email. */
export async function sendMagicLinkEmail(to: string, link: string) {
  const subject = "Your login link — Teacher Eva & Manuel";
  const text = `Click to log in (valid 15 minutes):\n${link}\n\nIf you didn't request this, ignore this email.`;
  await send({
    to,
    subject,
    text,
    html: `<p>Click to log in (valid 15 minutes):</p><p><a href="${link}">Log in to the portal</a></p><p style="color:#666">If you didn't request this, you can ignore this email.</p>`,
  });
}

/** Welcome + login link + list of what the buyer can now access (real-time grant). */
export async function sendWelcomeGrantEmail(opts: {
  to: string;
  link: string;
  productTitles: string[];
}) {
  const list = opts.productTitles.map((t) => `  • ${t}`).join("\n");
  const subject = "You now have access — Teacher Eva & Manuel";
  const text = `Thank you for your purchase! You now have access to:\n${list}\n\nLog in to download anytime:\n${opts.link}${unsubscribeFooter}`;
  const htmlList = opts.productTitles.map((t) => `<li>${t}</li>`).join("");
  await send({
    to: opts.to,
    subject,
    text,
    html: `<p>Thank you for your purchase! You now have access to:</p><ul>${htmlList}</ul><p><a href="${opts.link}">Log in to download</a></p>`,
  });
}

/** Weekly-upload alert (no attachment) — one per customer per publish batch. */
export async function sendWeekPublishedEmail(opts: {
  to: string;
  productTitle: string;
  weekNumber: number;
  link: string;
}) {
  const subject = `${opts.productTitle} — Week ${opts.weekNumber} files are ready`;
  const text = `Your ${opts.productTitle} — Week ${opts.weekNumber} files are ready. Log in to download:\n${opts.link}${unsubscribeFooter}`;
  await send({
    to: opts.to,
    subject,
    text,
    html: `<p>Your <strong>${opts.productTitle} — Week ${opts.weekNumber}</strong> files are ready.</p><p><a href="${opts.link}">Log in to download</a></p>`,
  });
}

export function loginUrl(path = "/dashboard"): string {
  return `${env.APP_URL}${path}`;
}

export function magicLinkUrl(rawToken: string): string {
  return `${env.APP_URL}/api/auth/callback?token=${encodeURIComponent(rawToken)}`;
}
