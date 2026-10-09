import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const allowedOrigins = new Set([
  "https://jester-penlza.github.io",
  "http://127.0.0.1:4173",
  "http://127.0.0.1:8080",
  "http://localhost:4173",
  "http://localhost:8080",
]);

function corsHeaders(request: Request) {
  const origin = request.headers.get("origin") || "";
  return {
    "Access-Control-Allow-Origin": allowedOrigins.has(origin) ? origin : "https://jester-penlza.github.io",
    "Access-Control-Allow-Headers": "authorization, apikey, content-type, x-client-info",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Vary": "Origin",
  };
}

function json(request: Request, body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders(request), "Content-Type": "application/json", "Cache-Control": "no-store" },
  });
}

function adminHeaders() {
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!serviceKey) throw new Error("SUPABASE_SERVICE_KEY_MISSING");
  return {
    apikey: serviceKey,
    Authorization: `Bearer ${serviceKey}`,
    "Content-Type": "application/json",
  };
}

async function supabaseGet(path: string) {
  const baseUrl = Deno.env.get("SUPABASE_URL");
  if (!baseUrl) throw new Error("SUPABASE_URL_MISSING");
  const response = await fetch(`${baseUrl}/rest/v1/${path}`, { headers: adminHeaders() });
  if (!response.ok) throw new Error(`DATABASE_READ_FAILED:${response.status}`);
  return response.json();
}

async function supabaseRpc(name: string, body: unknown) {
  const baseUrl = Deno.env.get("SUPABASE_URL");
  if (!baseUrl) throw new Error("SUPABASE_URL_MISSING");
  const response = await fetch(`${baseUrl}/rest/v1/rpc/${name}`, {
    method: "POST",
    headers: adminHeaders(),
    body: JSON.stringify(body),
  });
  if (!response.ok) throw new Error(`DATABASE_WRITE_FAILED:${response.status}:${await response.text()}`);
  return response.json();
}

async function paymentSecrets() {
  return supabaseRpc("get_payment_server_secrets", {});
}

Deno.serve(async (request: Request) => {
  if (request.method === "OPTIONS") return new Response("ok", { headers: corsHeaders(request) });
  if (request.method !== "POST") return json(request, { error: "METHOD_NOT_ALLOWED" }, 405);

  try {
    const origin = request.headers.get("origin");
    if (origin && !allowedOrigins.has(origin)) return json(request, { error: "ORIGIN_NOT_ALLOWED" }, 403);

    const { orderReference, accessToken } = await request.json();
    if (!/^UNIVUE-[A-Z0-9-]{6,40}$/.test(String(orderReference || ""))) {
      return json(request, { error: "INVALID_ORDER_REFERENCE" }, 400);
    }
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(String(accessToken || ""))) {
      return json(request, { error: "INVALID_ACCESS_TOKEN" }, 400);
    }

    const orders = await supabaseGet(
      `orders?reference=eq.${encodeURIComponent(orderReference)}&payment_access_token=eq.${encodeURIComponent(accessToken)}` +
      "&select=id,reference,total,status,payment_method,customer_name,contact_number&limit=1",
    );
    const order = orders?.[0];
    if (!order || order.payment_method !== "GCASH" || order.status !== "AWAITING_PAYMENT") {
      return json(request, { error: "ORDER_NOT_AVAILABLE_FOR_ONLINE_PAYMENT" }, 404);
    }

    const payments = await supabaseGet(
      `payments?order_id=eq.${encodeURIComponent(order.id)}` +
      "&select=status,provider_session_id,checkout_url&limit=1",
    );
    const payment = payments?.[0];
    if (payment?.status === "CONFIRMED") return json(request, { error: "ORDER_ALREADY_PAID" }, 409);
    if (payment?.provider_session_id && payment?.checkout_url) {
      return json(request, { checkoutUrl: payment.checkout_url, sessionId: payment.provider_session_id, reused: true });
    }

    const items = await supabaseGet(
      `order_items?order_id=eq.${encodeURIComponent(order.id)}` +
      "&select=product_code,size,quantity,unit_price,products(name)",
    );
    if (!Array.isArray(items) || items.length === 0) throw new Error("ORDER_ITEMS_NOT_FOUND");

    const secrets = await paymentSecrets();
    const paymongoKey = Deno.env.get("PAYMONGO_SECRET_KEY_TEST") || secrets?.PAYMONGO_SECRET_KEY_TEST;
    if (!paymongoKey?.startsWith("sk_test_")) throw new Error("PAYMONGO_TEST_KEY_MISSING");

    const siteUrl = (Deno.env.get("UNIVUE_SITE_URL") || "https://jester-penlza.github.io/Gr12-NUB/").replace(/\/?$/, "/");
    const reference = encodeURIComponent(order.reference);
    const checkoutResponse = await fetch("https://api.paymongo.com/v2/checkout_sessions", {
      method: "POST",
      headers: {
        Authorization: `Basic ${btoa(`${paymongoKey}:`)}`,
        "Content-Type": "application/json",
        "Idempotency-Key": `univue-${order.id}`,
      },
      body: JSON.stringify({
        data: {
          attributes: {
            line_items: items.map((item: Record<string, any>) => ({
              name: `${item.products?.name || String(item.product_code).replaceAll("_", " ")} · ${item.size}`.slice(0, 120),
              amount: Math.round(Number(item.unit_price) * 100),
              currency: "PHP",
              quantity: Number(item.quantity),
            })),
            payment_method_types: ["qrph"],
            success_url: `${siteUrl}?payment=success&order=${reference}`,
            cancel_url: `${siteUrl}?payment=cancelled&order=${reference}`,
            reference_number: order.reference,
            description: `UNIVUE NU Baliwag order ${order.reference}`,
            show_description: true,
            show_line_items: true,
            send_email_receipt: false,
            billing: {
              name: String(order.customer_name).slice(0, 120),
              phone: String(order.contact_number).slice(0, 40),
            },
            metadata: { order_id: order.id, system: "UNIVUE" },
          },
        },
      }),
    });
    const checkout = await checkoutResponse.json();
    if (!checkoutResponse.ok) {
      console.error("PayMongo checkout creation failed", checkoutResponse.status, checkout?.errors?.map((e: any) => e?.code));
      return json(request, { error: "PAYMENT_PROVIDER_UNAVAILABLE" }, 502);
    }

    const sessionId = checkout?.data?.id;
    const checkoutUrl = checkout?.data?.attributes?.checkout_url;
    if (!sessionId || !checkoutUrl?.startsWith("https://checkout.paymongo.com/")) {
      throw new Error("INVALID_PAYMONGO_RESPONSE");
    }

    await supabaseRpc("attach_paymongo_checkout", {
      p_order_id: order.id,
      p_session_id: sessionId,
      p_checkout_url: checkoutUrl,
    });

    return json(request, { checkoutUrl, sessionId, reused: false });
  } catch (error) {
    console.error(error instanceof Error ? error.message : "UNKNOWN_CHECKOUT_ERROR");
    return json(request, { error: "CHECKOUT_CREATION_FAILED" }, 500);
  }
});
