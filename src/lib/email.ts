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
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head>
<body style="margin: 0; padding: 0; background-color: #0B0E14; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color: #0B0E14; padding: 40px 16px;">
    <tr><td align="center">
      <table role="presentation" width="480" cellpadding="0" cellspacing="0" style="max-width: 480px; width: 100%;">

        <!-- Logo -->
        <tr><td align="center" style="padding-bottom: 32px;">
          <div style="display: inline-block; background: rgba(16,185,129,0.1); border-radius: 16px; padding: 12px 20px;">
            <span style="font-size: 24px; font-weight: 700; color: #10B981; letter-spacing: -0.5px;">MisGastos</span>
          </div>
        </td></tr>

        <!-- Main card -->
        <tr><td>
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color: #131720; border: 1px solid rgba(255,255,255,0.06); border-radius: 20px; overflow: hidden;">

            <!-- Green accent bar -->
            <tr><td style="height: 3px; background: linear-gradient(90deg, #10B981, #059669);"></td></tr>

            <!-- Content -->
            <tr><td style="padding: 40px 36px;">

              <!-- Avatar + name -->
              <table role="presentation" cellpadding="0" cellspacing="0" style="margin-bottom: 24px;">
                <tr>
                  <td style="width: 44px; vertical-align: middle;">
                    <div style="width: 44px; height: 44px; border-radius: 12px; background: linear-gradient(135deg, #10B981, #059669); text-align: center; line-height: 44px; font-size: 18px; font-weight: 700; color: #fff;">
                      ${inviterName.charAt(0).toUpperCase()}
                    </div>
                  </td>
                  <td style="padding-left: 14px; vertical-align: middle;">
                    <p style="margin: 0; font-size: 15px; font-weight: 600; color: #F1F3F7;">${inviterName}</p>
                    <p style="margin: 2px 0 0; font-size: 13px; color: #5A6178;">te envio una invitacion</p>
                  </td>
                </tr>
              </table>

              <!-- Message -->
              <p style="margin: 0 0 8px; font-size: 22px; font-weight: 700; color: #F1F3F7; line-height: 1.3;">
                Unete al espacio compartido
              </p>
              <p style="margin: 0 0 28px; font-size: 15px; color: #8B93A7; line-height: 1.6;">
                Te invitaron a unirte a <strong style="color: #10B981;">"${spaceName}"</strong> para registrar y ver gastos en equipo. Podran ver los gastos de todos los miembros del espacio.
              </p>

              <!-- CTA Button -->
              <table role="presentation" cellpadding="0" cellspacing="0" style="margin-bottom: 28px;">
                <tr><td>
                  <a href="${joinUrl}" style="display: inline-block; background: #10B981; color: #000; padding: 14px 36px; border-radius: 12px; text-decoration: none; font-weight: 700; font-size: 15px; letter-spacing: -0.2px;">
                    Aceptar invitacion
                  </a>
                </td></tr>
              </table>

              <!-- Divider -->
              <div style="height: 1px; background: rgba(255,255,255,0.06); margin-bottom: 20px;"></div>

              <!-- Details -->
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
                <tr>
                  <td style="padding: 8px 0;">
                    <span style="font-size: 12px; color: #5A6178; text-transform: uppercase; letter-spacing: 0.5px;">Espacio</span><br>
                    <span style="font-size: 14px; color: #F1F3F7; font-weight: 500;">${spaceName}</span>
                  </td>
                  <td style="padding: 8px 0; text-align: right;">
                    <span style="font-size: 12px; color: #5A6178; text-transform: uppercase; letter-spacing: 0.5px;">Expira en</span><br>
                    <span style="font-size: 14px; color: #F1F3F7; font-weight: 500;">7 dias</span>
                  </td>
                </tr>
              </table>

            </td></tr>
          </table>
        </td></tr>

        <!-- Footer -->
        <tr><td style="padding-top: 28px; text-align: center;">
          <p style="margin: 0 0 6px; font-size: 12px; color: #3D4354;">
            Si no tienes cuenta, <a href="${appUrl}/register" style="color: #10B981; text-decoration: none;">registrate aqui</a> antes de aceptar.
          </p>
          <p style="margin: 0; font-size: 11px; color: #2A2E3B;">
            MisGastos &middot; expenses.byruben.io
          </p>
        </td></tr>

      </table>
    </td></tr>
  </table>
</body>
</html>
    `,
  });
}
