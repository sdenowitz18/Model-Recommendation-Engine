import { createHash, createHmac, randomInt, randomBytes, timingSafeEqual } from "crypto";
import { Resend } from "resend";

const VERIFY_TOKEN_BYTES = 32;
const CODE_MIN = 100_000;
const CODE_MAX = 999_999;
const DEFAULT_EXPIRY_MS = 24 * 60 * 60 * 1000;

export function parseAdminEmails(): string[] {
  const raw = process.env.ADMIN_EMAILS ?? "";
  return raw
    .split(/[,;\s]+/)
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
}

export function isAdminEmail(email: string): boolean {
  const lower = email.toLowerCase();
  return parseAdminEmails().includes(lower);
}

export function hashVerificationToken(rawToken: string): string {
  return createHash("sha256").update(rawToken).digest("hex");
}

export function hashVerificationCode(userId: number, code: string, pepper: string): string {
  return createHmac("sha256", pepper).update(`${userId}:${code}`).digest("hex");
}

export function generateEmailVerificationSecrets(): {
  rawToken: string;
  tokenHash: string;
  code: string;
} {
  const rawToken = randomBytes(VERIFY_TOKEN_BYTES).toString("hex");
  const tokenHash = hashVerificationToken(rawToken);
  const code = String(randomInt(CODE_MIN, CODE_MAX + 1));
  return { rawToken, tokenHash, code };
}

export function buildCodeHash(userId: number, code: string): string {
  const pepper = process.env.SESSION_SECRET || "dev-secret-change-in-production";
  return hashVerificationCode(userId, code, pepper);
}

export function emailVerificationExpiry(): Date {
  return new Date(Date.now() + DEFAULT_EXPIRY_MS);
}

export function constantTimeEqualHex(a: string, b: string): boolean {
  try {
    const bufa = Buffer.from(a, "hex");
    const bufb = Buffer.from(b, "hex");
    if (bufa.length !== bufb.length) return false;
    return timingSafeEqual(bufa, bufb);
  } catch {
    return false;
  }
}

export function publicAppOrigin(): string {
  const url = process.env.APP_PUBLIC_URL?.trim().replace(/\/$/, "");
  if (url) return url;
  const port = process.env.PORT || "5001";
  return `http://localhost:${port}`;
}

export type SendVerificationResult =
  | { ok: true; channel: "resend" }
  | { ok: true; channel: "dev_console"; note: string }
  | { ok: false; reason: string };

export async function sendVerificationEmail(args: {
  to: string;
  rawToken: string;
  code: string;
}): Promise<SendVerificationResult> {
  const from = process.env.EMAIL_FROM?.trim();
  const verifyUrl = `${publicAppOrigin()}/verify-email?token=${encodeURIComponent(args.rawToken)}`;

  if (!process.env.RESEND_API_KEY?.trim()) {
    if (process.env.NODE_ENV === "production") {
      return { ok: false, reason: "Email is not configured (RESEND_API_KEY)." };
    }
    console.warn(
      "\n[auth] ━━━ Verification email NOT sent (no RESEND_API_KEY). Local testing values:\n",
      `  To:   ${args.to}\n  URL:  ${verifyUrl}\n  Code: ${args.code}\n`,
    );
    return {
      ok: true,
      channel: "dev_console",
      note:
        "Development mode: no RESEND_API_KEY, so nothing was emailed. Open the terminal where `npm run dev` is running — the verification link and code are printed there.",
    };
  }

  if (!from) {
    return { ok: false, reason: "EMAIL_FROM is not set." };
  }

  const resend = new Resend(process.env.RESEND_API_KEY);
  const { error } = await resend.emails.send({
    from,
    to: [args.to],
    subject: "Verify your email — Model Recommendation Assistant",
    html: `
      <p>Thanks for signing up. Use the button below or enter this code in the app:</p>
      <p style="font-size:22px;font-weight:bold;letter-spacing:0.08em;">${args.code}</p>
      <p><a href="${verifyUrl}" style="display:inline-block;padding:12px 20px;background:#5BC3B4;color:#0b1c1a;text-decoration:none;border-radius:8px;font-weight:600;">Verify email</a></p>
      <p style="color:#666;font-size:13px;">If the button does not work, copy this link:<br /><span style="word-break:break-all;">${verifyUrl}</span></p>
      <p style="color:#666;font-size:13px;">This link and code expire in 24 hours.</p>
    `,
  });

  if (error) {
    console.error("[auth] Resend error:", error);
    return { ok: false, reason: error.message || "Failed to send email" };
  }
  return { ok: true, channel: "resend" };
}
