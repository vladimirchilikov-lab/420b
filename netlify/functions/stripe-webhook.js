// netlify/functions/stripe-webhook.js
// ──────────────────────────────────────────────────────────────────────────
// Listens for Stripe webhooks.
// On checkout.session.completed → sends two emails via SendGrid:
//   1. Confirmation to the customer
//   2. Order notification to the admin (you)

const stripe = require("stripe")(process.env.STRIPE_SECRET_KEY);
const sgMail  = require("@sendgrid/mail");

sgMail.setApiKey(process.env.SENDGRID_API_KEY);

const ADMIN_EMAIL  = process.env.ADMIN_EMAIL;   // your email
const FROM_EMAIL   = process.env.FROM_EMAIL;    // verified sender in SendGrid (e.g. orders@420beans.com)
const FROM_NAME    = "420 Beans";

// ── BGN formatter ─────────────────────────────────────────────────────────
function formatBGN(amount) {
  return (amount / 100).toFixed(2) + " лв";
}

// ── Address formatter ─────────────────────────────────────────────────────
function formatAddress(addr) {
  if (!addr) return "—";
  const parts = [
    addr.line1,
    addr.line2,
    addr.city,
    addr.postal_code,
    addr.state,
    addr.country,
  ].filter(Boolean);
  return parts.join(", ");
}

// ── Build the customer confirmation email (HTML) ──────────────────────────
function buildCustomerEmail({ customerName, items, total, address, sessionId }) {
  const itemRows = items.map(item => `
    <tr>
      <td style="padding:12px 16px;border-bottom:1px solid #EEE;font-family:'Georgia',serif;font-size:15px;color:#1A1512;">${item.name}</td>
      <td style="padding:12px 16px;border-bottom:1px solid #EEE;text-align:center;font-size:14px;color:#9A9088;">×${item.quantity}</td>
      <td style="padding:12px 16px;border-bottom:1px solid #EEE;text-align:right;font-size:14px;color:#1A1512;">${formatBGN(item.amount_total)}</td>
    </tr>`).join("");

  return `<!DOCTYPE html>
<html lang="bg">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Потвърждение на поръчка — 420 Beans</title>
</head>
<body style="margin:0;padding:0;background:#F5F0E8;font-family:'Georgia',serif;">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#F5F0E8;padding:40px 0;">
  <tr><td align="center">
    <table width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;">

      <!-- HEADER -->
      <tr>
        <td style="background:#1A1512;padding:40px 48px;text-align:center;">
          <p style="margin:0;font-family:'Georgia',serif;font-size:26px;font-weight:bold;color:#F5F0E8;letter-spacing:0.15em;text-transform:uppercase;">420 <span style="color:#C8A97A;">Beans</span></p>
          <p style="margin:10px 0 0;font-size:11px;letter-spacing:0.25em;text-transform:uppercase;color:rgba(255,255,255,0.4);font-family:monospace;">Specialty Coffee</p>
        </td>
      </tr>

      <!-- BODY -->
      <tr>
        <td style="background:#FFFFFF;padding:48px;">

          <p style="margin:0 0 8px;font-size:11px;letter-spacing:0.2em;text-transform:uppercase;color:#C8A97A;font-family:monospace;">Потвърждение на поръчка</p>
          <h1 style="margin:0 0 24px;font-size:28px;font-weight:normal;color:#1A1512;line-height:1.2;">Благодарим ви,<br><em>${customerName}</em>!</h1>

          <p style="margin:0 0 32px;font-size:14px;line-height:1.8;color:#9A9088;font-family:monospace;">
            Поръчката ви беше приета успешно. Ще получите имейл с информация за доставката, когато пратката бъде изпратена.
          </p>

          <!-- ORDER TABLE -->
          <table width="100%" cellpadding="0" cellspacing="0" style="border:1px solid #EEE;margin-bottom:32px;">
            <thead>
              <tr style="background:#F5F0E8;">
                <th style="padding:12px 16px;text-align:left;font-size:10px;letter-spacing:0.2em;text-transform:uppercase;color:#9A9088;font-family:monospace;font-weight:normal;">Продукт</th>
                <th style="padding:12px 16px;text-align:center;font-size:10px;letter-spacing:0.2em;text-transform:uppercase;color:#9A9088;font-family:monospace;font-weight:normal;">Бр.</th>
                <th style="padding:12px 16px;text-align:right;font-size:10px;letter-spacing:0.2em;text-transform:uppercase;color:#9A9088;font-family:monospace;font-weight:normal;">Цена</th>
              </tr>
            </thead>
            <tbody>${itemRows}</tbody>
            <tfoot>
              <tr style="background:#1A1512;">
                <td colspan="2" style="padding:16px;font-size:11px;letter-spacing:0.2em;text-transform:uppercase;color:rgba(255,255,255,0.5);font-family:monospace;">Общо</td>
                <td style="padding:16px;text-align:right;font-size:18px;font-weight:bold;color:#C8A97A;font-family:'Georgia',serif;">${formatBGN(total)}</td>
              </tr>
            </tfoot>
          </table>

          <!-- DELIVERY ADDRESS -->
          <table width="100%" cellpadding="0" cellspacing="0" style="border:1px solid #EEE;margin-bottom:32px;">
            <tr><td style="padding:20px 24px;background:#F5F0E8;">
              <p style="margin:0 0 8px;font-size:10px;letter-spacing:0.2em;text-transform:uppercase;color:#9A9088;font-family:monospace;">Адрес за доставка</p>
              <p style="margin:0;font-size:14px;color:#1A1512;line-height:1.6;">${address}</p>
            </td></tr>
          </table>

          <p style="margin:0;font-size:13px;color:#9A9088;line-height:1.8;font-family:monospace;">
            При въпроси относно поръчката, моля пишете ни на <a href="mailto:${FROM_EMAIL}" style="color:#C8A97A;">${FROM_EMAIL}</a><br>
            с номер на поръчка: <strong style="color:#1A1512;">${sessionId.slice(-12).toUpperCase()}</strong>
          </p>
        </td>
      </tr>

      <!-- FOOTER -->
      <tr>
        <td style="padding:32px 48px;text-align:center;">
          <p style="margin:0 0 8px;font-size:11px;letter-spacing:0.2em;text-transform:uppercase;color:#9A9088;font-family:monospace;">420 Beans — Specialty Coffee</p>
          <p style="margin:0;font-size:11px;color:#9A9088;font-family:monospace;">Подбираме внимателно висококачествено кафе с фокус върху вкусовия профил и проследим произход до конкретни ферми.</p>
        </td>
      </tr>

    </table>
  </td></tr>
</table>
</body>
</html>`;
}

// ── Build the admin notification email (HTML) ─────────────────────────────
function buildAdminEmail({ customerName, customerEmail, customerPhone, items, total, address, sessionId }) {
  const itemRows = items.map(item => `
    <tr>
      <td style="padding:10px 14px;border-bottom:1px solid #333;color:#F5F0E8;font-size:14px;">${item.name}</td>
      <td style="padding:10px 14px;border-bottom:1px solid #333;text-align:center;color:#C8A97A;">×${item.quantity}</td>
      <td style="padding:10px 14px;border-bottom:1px solid #333;text-align:right;color:#F5F0E8;">${formatBGN(item.amount_total)}</td>
    </tr>`).join("");

  return `<!DOCTYPE html>
<html>
<head><meta charset="UTF-8"><title>Нова поръчка</title></head>
<body style="margin:0;padding:0;background:#111;font-family:monospace;">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#111;padding:40px 0;">
  <tr><td align="center">
    <table width="580" cellpadding="0" cellspacing="0" style="max-width:580px;width:100%;">

      <tr>
        <td style="background:#1A1512;padding:28px 40px;border-bottom:3px solid #C8A97A;">
          <p style="margin:0;font-size:13px;letter-spacing:0.25em;text-transform:uppercase;color:#C8A97A;">420 Beans — Нова поръчка</p>
          <p style="margin:6px 0 0;font-size:11px;color:rgba(255,255,255,0.3);">Session: ${sessionId}</p>
        </td>
      </tr>

      <tr>
        <td style="background:#1E1A17;padding:32px 40px;">

          <!-- CUSTOMER INFO -->
          <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:28px;">
            <tr><td style="padding-bottom:16px;">
              <p style="margin:0 0 4px;font-size:10px;letter-spacing:0.2em;text-transform:uppercase;color:#9A9088;">Клиент</p>
              <p style="margin:0;font-size:16px;color:#F5F0E8;">${customerName}</p>
            </td></tr>
            <tr><td style="padding-bottom:12px;">
              <p style="margin:0 0 4px;font-size:10px;letter-spacing:0.2em;text-transform:uppercase;color:#9A9088;">Имейл</p>
              <p style="margin:0;font-size:14px;color:#C8A97A;"><a href="mailto:${customerEmail}" style="color:#C8A97A;">${customerEmail}</a></p>
            </td></tr>
            ${customerPhone ? `<tr><td style="padding-bottom:12px;">
              <p style="margin:0 0 4px;font-size:10px;letter-spacing:0.2em;text-transform:uppercase;color:#9A9088;">Телефон</p>
              <p style="margin:0;font-size:14px;color:#F5F0E8;">${customerPhone}</p>
            </td></tr>` : ""}
            <tr><td>
              <p style="margin:0 0 4px;font-size:10px;letter-spacing:0.2em;text-transform:uppercase;color:#9A9088;">Адрес за доставка</p>
              <p style="margin:0;font-size:14px;color:#F5F0E8;line-height:1.6;">${address}</p>
            </td></tr>
          </table>

          <!-- PRODUCTS -->
          <table width="100%" cellpadding="0" cellspacing="0" style="border:1px solid #333;margin-bottom:20px;">
            <thead>
              <tr style="background:#2A2420;">
                <th style="padding:10px 14px;text-align:left;font-size:10px;letter-spacing:0.15em;text-transform:uppercase;color:#9A9088;font-weight:normal;">Продукт</th>
                <th style="padding:10px 14px;text-align:center;font-size:10px;letter-spacing:0.15em;text-transform:uppercase;color:#9A9088;font-weight:normal;">Бр.</th>
                <th style="padding:10px 14px;text-align:right;font-size:10px;letter-spacing:0.15em;text-transform:uppercase;color:#9A9088;font-weight:normal;">Сума</th>
              </tr>
            </thead>
            <tbody>${itemRows}</tbody>
            <tfoot>
              <tr style="background:#C8A97A;">
                <td colspan="2" style="padding:14px;font-size:11px;letter-spacing:0.15em;text-transform:uppercase;color:#1A1512;">Общо</td>
                <td style="padding:14px;text-align:right;font-size:20px;font-weight:bold;color:#1A1512;">${formatBGN(total)}</td>
              </tr>
            </tfoot>
          </table>

          <p style="margin:0;font-size:11px;color:#9A9088;">
            Вижте пълните детайли в <a href="https://dashboard.stripe.com/payments" style="color:#C8A97A;">Stripe Dashboard</a>
          </p>
        </td>
      </tr>

    </table>
  </td></tr>
</table>
</body>
</html>`;
}

// ── Main handler ──────────────────────────────────────────────────────────
exports.handler = async (event) => {
  if (event.httpMethod !== "POST") {
    return { statusCode: 405, body: "Method Not Allowed" };
  }

  const sig     = event.headers["stripe-signature"];
  const secret  = process.env.STRIPE_WEBHOOK_SECRET;

  let stripeEvent;

  try {
    // Verify webhook signature — CRITICAL security step
    stripeEvent = stripe.webhooks.constructEvent(event.body, sig, secret);
  } catch (err) {
    console.error("Webhook signature verification failed:", err.message);
    return { statusCode: 400, body: `Webhook Error: ${err.message}` };
  }

  // ── Handle checkout.session.completed ──────────────────────────────────
  if (stripeEvent.type === "checkout.session.completed") {
    const session = stripeEvent.data.object;

    try {
      // Expand line items (needed for product names & amounts)
      const fullSession = await stripe.checkout.sessions.retrieve(session.id, {
        expand: ["line_items", "line_items.data.price.product"],
      });

      const customerName  = fullSession.shipping_details?.name || fullSession.customer_details?.name || "Клиент";
      const customerEmail = fullSession.customer_details?.email;
      const customerPhone = fullSession.customer_details?.phone || null;
      const addressObj    = fullSession.shipping_details?.address || fullSession.customer_details?.address;
      const address       = formatAddress(addressObj);
      const total         = fullSession.amount_total;
      const sessionId     = fullSession.id;
      const items         = fullSession.line_items?.data || [];

      // Map to plain objects for email templates
      const emailItems = items.map(item => ({
        name:         item.description || item.price?.product?.name || "Продукт",
        quantity:     item.quantity,
        amount_total: item.amount_total,
      }));

      // ── 1. Send confirmation to customer ─────────────────────────────
      if (customerEmail) {
        await sgMail.send({
          to:      customerEmail,
          from:    { email: FROM_EMAIL, name: FROM_NAME },
          subject: `Потвърждение на поръчка — 420 Beans (#${sessionId.slice(-8).toUpperCase()})`,
          html:    buildCustomerEmail({ customerName, items: emailItems, total, address, sessionId }),
        });
        console.log(`Customer email sent to ${customerEmail}`);
      }

      // ── 2. Send notification to admin ─────────────────────────────────
      if (ADMIN_EMAIL) {
        await sgMail.send({
          to:      ADMIN_EMAIL,
          from:    { email: FROM_EMAIL, name: FROM_NAME },
          subject: `🛒 Нова поръчка ${formatBGN(total)} — ${customerName}`,
          html:    buildAdminEmail({
            customerName,
            customerEmail: customerEmail || "—",
            customerPhone,
            items: emailItems,
            total,
            address,
            sessionId,
          }),
        });
        console.log(`Admin notification sent to ${ADMIN_EMAIL}`);
      }

    } catch (emailErr) {
      // Log but don't fail — Stripe won't retry just for email failures
      console.error("Email sending error:", emailErr.message);
    }
  }

  return { statusCode: 200, body: JSON.stringify({ received: true }) };
};
