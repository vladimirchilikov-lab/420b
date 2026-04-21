// netlify/functions/create-checkout-session.js
// ─────────────────────────────────────────────
// Creates a Stripe Checkout Session and returns the URL.
// The Stripe SECRET key lives ONLY here – never in frontend code.

const stripe = require("stripe")(process.env.STRIPE_SECRET_KEY);

// ── Product catalog (must match frontend catalog) ──────────────────────────
// Prices are in стотинки (BGN * 100).  1 лв = 100 стотинки.
const PRODUCTS = {
  p1: {
    name_en: "Yirgacheffe Dawn",
    name_bg: "Йиргачефе Зора",
    price: 2800,   // 28.00 лв
    currency: "bgn",
  },
  p2: {
    name_en: "Huila Nocturne",
    name_bg: "Уила Ноктюрн",
    price: 3200,   // 32.00 лв
    currency: "bgn",
  },
  p3: {
    name_en: "Antigua Dusk",
    name_bg: "Антигуа Здрач",
    price: 2600,   // 26.00 лв
    currency: "bgn",
  },
};

exports.handler = async (event) => {
  // ── CORS headers ───────────────────────────────────────────────────────
  const headers = {
    "Access-Control-Allow-Origin": process.env.SITE_URL || "*",
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Content-Type": "application/json",
  };

  if (event.httpMethod === "OPTIONS") {
    return { statusCode: 204, headers, body: "" };
  }

  if (event.httpMethod !== "POST") {
    return { statusCode: 405, headers, body: JSON.stringify({ error: "Method not allowed" }) };
  }

  try {
    const body = JSON.parse(event.body || "{}");
    const { items, lang = "en" } = body;

    // ── Validate input ────────────────────────────────────────────────────
    if (!items || !Array.isArray(items) || items.length === 0) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ error: "No items provided" }),
      };
    }

    // ── Build Stripe line items ───────────────────────────────────────────
    const lineItems = [];

    for (const item of items) {
      const product = PRODUCTS[item.id];

      if (!product) {
        return {
          statusCode: 400,
          headers,
          body: JSON.stringify({ error: `Unknown product: ${item.id}` }),
        };
      }

      const qty = parseInt(item.qty, 10);
      if (!qty || qty < 1 || qty > 20) {
        return {
          statusCode: 400,
          headers,
          body: JSON.stringify({ error: `Invalid quantity for ${item.id}` }),
        };
      }

      lineItems.push({
        price_data: {
          currency: product.currency,
          unit_amount: product.price,
          product_data: {
            name: lang === "bg" ? product.name_bg : product.name_en,
            description: "420 Beans — Specialty Coffee",
            metadata: { product_id: item.id },
          },
        },
        quantity: qty,
      });
    }

    // ── Create Checkout Session ───────────────────────────────────────────
    const siteUrl = process.env.SITE_URL || "https://420beans.netlify.app";

    const session = await stripe.checkout.sessions.create({
      mode: "payment",
      line_items: lineItems,
      shipping_address_collection: {
        allowed_countries: ["BG", "DE", "FR", "GB", "GR", "NL", "RO", "TR"],
      },
      phone_number_collection: { enabled: true },
      customer_email: undefined, // Stripe will collect it
      locale: lang === "bg" ? "bg" : "en",
      success_url: `${siteUrl}/success.html?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url:  `${siteUrl}/cancel.html`,
      metadata: {
        lang,
        source: "420beans_website",
      },
      payment_intent_data: {
        description: "420 Beans Coffee Order",
      },
    });

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({ url: session.url }),
    };

  } catch (err) {
    console.error("Stripe error:", err.message);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({
        error: "Payment initialization failed. Please try again.",
        details: process.env.NODE_ENV === "development" ? err.message : undefined,
      }),
    };
  }
};
