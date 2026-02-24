import { Resend } from "resend";

let _resend: Resend | null = null;
function getResend() {
  if (!_resend) _resend = new Resend(process.env.RESEND_API_KEY);
  return _resend;
}

export async function sendSpaceInvitationEmail({
  to,
  inviterName,
  spaceName,
  token,
}: {
  to: string;
  inviterName: string;
  spaceName: string;
  token: string;
}) {
  const appUrl = process.env.NEXT_PUBLIC_APP_URL || "https://expenses.byruben.io";
  const joinUrl = `${appUrl}/invite/${token}`;

  await getResend().emails.send({
    from: "MisGastos <noreply@byruben.io>",
    to,
    subject: `${inviterName} te invito a "${spaceName}" en MisGastos`,
    html: `
      <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; max-width: 480px; margin: 0 auto; padding: 24px;">
        <h2 style="color: #F1F3F7; margin-bottom: 8px;">Te invitaron a un espacio compartido</h2>
        <p style="color: #8B93A7; font-size: 15px; line-height: 1.5;">
          <strong style="color: #F1F3F7;">${inviterName}</strong> te invito al espacio
          <strong style="color: #10B981;">"${spaceName}"</strong> para compartir y ver gastos juntos.
        </p>
        <a href="${joinUrl}" style="display: inline-block; background: #10B981; color: #000; padding: 12px 28px; border-radius: 10px; text-decoration: none; font-weight: 600; font-size: 15px; margin: 16px 0;">
          Unirse al espacio
        </a>
        <p style="color: #5A6178; font-size: 12px; margin-top: 24px;">
          Esta invitacion expira en 7 dias. Si no tienes cuenta, registrate primero en
          <a href="${appUrl}/register" style="color: #10B981;">${appUrl}</a>.
        </p>
      </div>
    `,
  });
}
