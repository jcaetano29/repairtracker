import { Resend } from "resend";

const resend = new Resend(process.env.RESEND_API_KEY);
const FROM = process.env.RESEND_FROM_EMAIL || "noreply@repairtrack.app";

export async function sendEmail({ to, subject, html }) {
  if (!to) return; // skip if client has no email

  const { error } = await resend.emails.send({
    from: FROM,
    to,
    subject,
    html,
  });

  if (error) {
    console.error("[Email] Failed to send:", error);
    throw error;
  }
}
