import "jsr:@supabase/functions-js/edge-runtime.d.ts";

function response(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
  });
}

function parseSignature(header: string) {
  return Object.fromEntries(header.split(",").map((part) => {
    const [key, ...value] = part.trim().split("=");
    return [key, value.join("=")];
  }));
}

async function hmacHex(secret: string, value: string) {
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signature = await crypto.subtle.sign("HMAC", key, encoder.encode(value));
  return Array.from(new Uint8Array(signature)).map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

function secureEqual(left: string, right: string) {
  if (left.length !== right.length) return false;
  let mismatch = 0;
  for (let index = 0; index < left.length; index += 1) mismatch |= left.charCodeAt(index) ^ right.charCodeAt(index);
  return mismatch === 0;
}

async function confirmPayment(reference: string, sessionId: string, paymentId: string, amount: number) {
  const baseUrl = Deno.env.get("SUPABASE_URL");
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!baseUrl || !serviceKey) throw new Error("SUPABASE_CONFIGURATION_MISSING");
  const result = await fetch(`${baseUrl}/rest/v1/rpc/confirm_paymongo_payment`, {
    method: "POST",
    headers: {
      apikey: serviceKey,
      Authorization: `Bearer ${serviceKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      p_order_reference: reference,
      p_session_id: sessionId,
      p_payment_id: paymentId,
      p_amount_centavos: amount,
    }),
  });
  if (!result.ok) throw new Error(`PAYMENT_CONFIRMATION_FAILED:${result.status}:${await result.text()}`);
  return result.json();
}

async function webhookSecret() {
  const baseUrl = Deno.env.get("SUPABASE_URL");
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!baseUrl || !serviceKey) throw new Error("SUPABASE_CONFIGURATION_MISSING");
  const result = await fetch(`${baseUrl}/rest/v1/rpc/get_payment_server_secrets`, {
    method: "POST",
    headers: {
      apikey: serviceKey,
      Authorization: `Bearer ${serviceKey}`,
      "Content-Type": "application/json",
    },
    body: "{}",
  });
  if (!result.ok) throw new Error(`PAYMENT_SECRET_READ_FAILED:${result.status}`);
  const secrets = await result.json();
  return Deno.env.get("PAYMONGO_WEBHOOK_SECRET_TEST") || secrets?.PAYMONGO_WEBHOOK_SECRET_TEST;
}

Deno.serve(async (request: Request) => {
  if (request.method !== "POST") return response({ error: "METHOD_NOT_ALLOWED" }, 405);

  const rawBody = await request.text();
  const webhookSecretValue = await webhookSecret();
  const signatureHeader = request.headers.get("Paymongo-Signature") || "";
  if (!webhookSecretValue || !signatureHeader) return response({ error: "UNAUTHORIZED" }, 401);

  const signature = parseSignature(signatureHeader);
  const timestamp = Number(signature.t);
  if (!Number.isFinite(timestamp) || Math.abs(Date.now() / 1000 - timestamp) > 300) {
    return response({ error: "STALE_SIGNATURE" }, 401);
  }
  const expected = await hmacHex(webhookSecretValue, `${signature.t}.${rawBody}`);
  if (!signature.te || !secureEqual(expected, signature.te)) return response({ error: "INVALID_SIGNATURE" }, 401);

  try {
    const payload = JSON.parse(rawBody);
    const event = payload?.data?.attributes;
    if (event?.livemode === true) return response({ error: "LIVE_EVENT_REJECTED" }, 400);

    if (event?.type === "payment.paid") {
      const payment = event?.data;
      const attributes = payment?.attributes;
      const reference = attributes?.metadata?.order_reference;
      const intentId = attributes?.payment_intent_id;
      const amount = Number(attributes?.amount);
      if (
        attributes?.livemode === true ||
        attributes?.status !== "paid" ||
        !/^UNIVUE-[A-Z0-9-]{6,40}$/.test(String(reference || "")) ||
        !/^pi_[A-Za-z0-9]+$/.test(String(intentId || "")) ||
        !/^pay_[A-Za-z0-9]+$/.test(String(payment?.id || "")) ||
        !Number.isInteger(amount) ||
        amount < 1
      ) {
        return response({ error: "INVALID_EVENT_PAYLOAD" }, 400);
      }
      await confirmPayment(reference, intentId, payment.id, amount);
      return response({ received: true });
    }

    // Retain compatibility with test checkout sessions generated before direct QR Ph was enabled.
    if (event?.type === "checkout_session.payment.paid") {
      const session = event?.data;
      const attributes = session?.attributes;
      const payment = attributes?.payments?.find((entry: any) => entry?.attributes?.status === "paid");
      const amount = Number(payment?.attributes?.amount);
      if (!session?.id || !attributes?.reference_number || !payment?.id || !Number.isInteger(amount) || amount < 1) {
        return response({ error: "INVALID_EVENT_PAYLOAD" }, 400);
      }
      await confirmPayment(attributes.reference_number, session.id, payment.id, amount);
      return response({ received: true });
    }

    return response({ received: true, ignored: true });
  } catch (error) {
    console.error(error instanceof Error ? error.message : "UNKNOWN_WEBHOOK_ERROR");
    return response({ error: "WEBHOOK_PROCESSING_FAILED" }, 500);
  }
});
