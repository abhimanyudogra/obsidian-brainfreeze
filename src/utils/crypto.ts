import { createHash } from "crypto";

/** Compute SHA-256 hash of a string or buffer — used for manifest idempotency */
export function sha256(content: string | Buffer): string {
  return createHash("sha256").update(content).digest("hex");
}
