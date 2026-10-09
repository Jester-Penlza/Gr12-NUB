import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const allowedOrigins = new Set([
  "https://jester-penlza.github.io",
  "http://127.0.0.1:4173",
  "http://127.0.0.1:8080",
  "http://localhost:4173",
  "http://localhost:8080",
]);
const qrLifetimeSeconds = 1800;

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

function isQrImage(value: unknown): value is string {
  return typeof value === "string" && /^data:image\/(?:png|svg\+xml);base64,/i.test(value) && value.length < 100_000;
}

async function paymongoPost(path: string, key: string, body: unknown, idempotencyKey: string) {
  const response = await fetch(`https://api.paymongo.com/v1/${path}`, {
    method: "POST",
    headers: {
      Authorization: `Basic ${btoa(`${key}:`)}`,
      "Content-Type": "application/json",
      "Idempotency-Key": idempotencyKey,
    },
    body: JSON.stringify(body),
  });
  const result = await response.json();
  if (!response.ok) {
    console.error("PayMongo QR request failed", path.split("/")[0], response.status, result?.errors?.map((entry: any) => entry?.code));
    throw new Error(`PAYMONGO_REQUEST_FAILED:${response.status}`);
  }
  return result?.data;
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
      "&select=id,reference,total,status,payment_method,customer_name&limit=1",
    );
    const order = orders?.[0];
    if (!order || order.payment_method !== "GCASH" || order.status !== "AWAITING_PAYMENT") {
      return json(request, { error: "ORDER_NOT_AVAILABLE_FOR_ONLINE_PAYMENT" }, 404);
    }

    const payments = await supabaseGet(
      `payments?order_id=eq.${encodeURIComponent(order.id)}` +
      "&select=status,provider_session_id,provider_payment_method_id,provider_qr_image,provider_expires_at&limit=1",
    );
    const payment = payments?.[0];
    if (payment?.status === "CONFIRMED") return json(request, { error: "ORDER_ALREADY_PAID" }, 409);

    const storedExpiry = Date.parse(payment?.provider_expires_at || "");
    if (
      /^pi_[A-Za-z0-9]+$/.test(payment?.provider_session_id || "") &&
      isQrImage(payment?.provider_qr_image) &&
      Number.isFinite(storedExpiry) &&
      storedExpiry > Date.now() + 30_000
    ) {
      return json(request, {
        qrImageUrl: payment.provider_qr_image,
        paymentIntentId: payment.provider_session_id,
        expiresAt: payment.provider_expires_at,
        reused: true,
        testMode: true,
      });
    }

    const secrets = await paymentSecrets();
    const paymongoKey = Deno.env.get("PAYMONGO_SECRET_KEY_TEST") || secrets?.PAYMONGO_SECRET_KEY_TEST;
    if (!paymongoKey?.startsWith("sk_test_")) throw new Error("PAYMONGO_TEST_KEY_MISSING");

    const amount = Math.round(Number(order.total) * 100);
    if (!Number.isSafeInteger(amount) || amount < 100) throw new Error("INVALID_ORDER_TOTAL");
    const qrCycle = Math.floor(Date.now() / (qrLifetimeSeconds * 1000));
    const stableKey = `${String(order.id).replaceAll("-", "")}-${qrCycle}`;
    const intent = await paymongoPost("payment_intents", paymongoKey, {
      data: {
        attributes: {
          amount,
          currency: "PHP",
          payment_method_allowed: ["qrph"],
          description: `UNIVUE test order ${order.reference}`,
          metadata: {
            order_reference: order.reference,
            order_id: order.id,
            system: "UNIVUE",
            environment: "simulation",
          },
        },
      },
    }, `univue-intent-${stableKey}`);

    const method = await paymongoPost("payment_methods", paymongoKey, {
      data: {
        attributes: {
          type: "qrph",
          expiry_seconds: qrLifetimeSeconds,
          billing: {
            name: String(order.customer_name || "UNIVUE Demo").slice(0, 120),
            email: "univue.demo@school.edu.ph",
            phone: "09000000000",
          },
        },
      },
    }, `univue-method-${stableKey}`);

    if (!/^pi_[A-Za-z0-9]+$/.test(intent?.id || "") || !/^pm_[A-Za-z0-9]+$/.test(method?.id || "")) {
      throw new Error("INVALID_PAYMONGO_IDENTIFIERS");
    }
    const attached = await paymongoPost(`payment_intents/${intent.id}/attach`, paymongoKey, {
      data: {
        attributes: {
          payment_method: method.id,
          client_key: intent.attributes?.client_key,
        },
      },
    }, `univue-attach-${stableKey}`);

    const qrImageUrl = attached?.attributes?.next_action?.code?.image_url;
    if (
      attached?.id !== intent.id ||
      attached?.attributes?.livemode !== false ||
      attached?.attributes?.status !== "awaiting_next_action" ||
      !isQrImage(qrImageUrl)
    ) {
      throw new Error("INVALID_PAYMONGO_QR_RESPONSE");
    }

    const expiresAt = new Date(Date.now() + qrLifetimeSeconds * 1000).toISOString();
    await supabaseRpc("attach_paymongo_qr", {
      p_order_id: order.id,
      p_payment_intent_id: intent.id,
      p_payment_method_id: method.id,
      p_qr_image: qrImageUrl,
      p_expires_at: expiresAt,
    });

    return json(request, {
      qrImageUrl,
      paymentIntentId: intent.id,
      expiresAt,
      reused: false,
      testMode: true,
    });
  } catch (error) {
    console.error(error instanceof Error ? error.message : "UNKNOWN_CHECKOUT_ERROR");
    return json(request, { error: "CHECKOUT_CREATION_FAILED" }, 500);
  }
});
