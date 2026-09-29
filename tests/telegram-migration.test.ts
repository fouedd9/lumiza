import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

const migration = readFileSync(
  resolve("supabase/migrations/202609290001_paid_telegram_outbox.sql"),
  "utf8",
);
const sender = readFileSync(
  resolve("src/features/telegram/paid-order-notification.server.ts"),
  "utf8",
);

describe("paid Telegram outbox migration", () => {
  it("deduplicates by order and claims one pending job under row lock", () => {
    expect(migration).toMatch(
      /order_id uuid not null unique references public\.orders\(id\)/,
    );
    expect(migration).toContain("j.status = 'pending' and j.attempts < 3");
    expect(migration).toContain("for update of j skip locked limit 1");
    expect(migration).toContain("o.stripe_checkout_session_id = p_session");
    expect(migration).toContain(
      "old.status is distinct from 'paid' and new.status = 'paid'",
    );
  });

  it("keeps ambiguous sends out of automatic retries and restricts writes to service-role RPCs", () => {
    expect(migration).toContain("'uncertain'");
    expect(migration).toContain(
      "alter table public.owner_telegram_outbox enable row level security",
    );
    expect(migration).toContain(
      "grant execute on function public.commerce_claim_paid_telegram(uuid, text) to service_role",
    );
    expect(migration).toContain(
      "raise warning 'telegram_outbox_enqueue_failed'",
    );
    expect(migration).not.toMatch(
      /insert into public\.owner_telegram_outbox\(order_id\)\s+select/i,
    );
  });

  it("keeps Telegram credentials in server-only code", () => {
    expect(sender).toMatch(/^import "server-only";/);
    expect(sender).not.toContain("NEXT_PUBLIC_TELEGRAM");
  });
});
