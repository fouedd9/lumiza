import "server-only";

export type TransactionalEmail = {
  to: string;
  subject: string;
  text: string;
  /** Providers must deduplicate this key across retries, including worker crashes. */
  idempotencyKey: string;
};

export interface EmailProvider {
  readonly enabled: boolean;
  send(message: TransactionalEmail): Promise<void>;
}

// No provider is authorized or configured in Step 4. Do not claim delivery.
const disabledProvider: EmailProvider = {
  enabled: false,
  async send() {
    throw new Error("Transactional email provider not configured");
  },
};

export function emailProvider(): EmailProvider {
  return disabledProvider;
}
