const FEEDBACK_TO = process.env.FEEDBACK_EMAIL_TO?.trim() || "slicepay@slicechain.io";

type FeedbackEmailInput = {
  category: string;
  message: string;
  contact: string | null;
  page: string | null;
};

export class FeedbackEmailError extends Error {
  readonly code: "missing_config" | "domain_not_verified" | "send_failed";

  constructor(code: FeedbackEmailError["code"], message: string) {
    super(message);
    this.name = "FeedbackEmailError";
    this.code = code;
  }
}

function categoryLabel(category: string): string {
  const labels: Record<string, string> = {
    bug: "Bug",
    launch: "Launch",
    rewards: "Rewards",
    idea: "Idea",
    other: "Other",
  };
  return labels[category] ?? category;
}

function parseResendError(body: string): { message?: string; name?: string } {
  try {
    return JSON.parse(body) as { message?: string; name?: string };
  } catch {
    return {};
  }
}

export async function sendFeedbackEmail(input: FeedbackEmailInput): Promise<void> {
  const apiKey = process.env.RESEND_API_KEY?.trim();
  if (!apiKey) {
    throw new FeedbackEmailError(
      "missing_config",
      "Feedback email is not configured (RESEND_API_KEY)",
    );
  }

  const from =
    process.env.FEEDBACK_FROM_EMAIL?.trim() ||
    "Ginger Beta <feedback@gingernft.store>";

  const subject = `[Ginger Beta] ${categoryLabel(input.category)} feedback`;
  const lines = [
    `Topic: ${categoryLabel(input.category)}`,
    `Page: ${input.page || "(unknown)"}`,
    input.contact ? `Reply to: ${input.contact}` : "Reply to: (not provided)",
    "",
    input.message,
  ];

  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from,
      to: [FEEDBACK_TO],
      subject,
      text: lines.join("\n"),
    }),
  });

  if (res.ok) return;

  const detail = await res.text().catch(() => "");
  const parsed = parseResendError(detail);
  console.error("[sendFeedbackEmail]", res.status, detail);

  if (
    res.status === 403 &&
    (parsed.message?.includes("domain is not verified") ||
      parsed.name === "validation_error")
  ) {
    throw new FeedbackEmailError(
      "domain_not_verified",
      `Resend sender domain is not verified for FEEDBACK_FROM_EMAIL (${from}). Add the domain at https://resend.com/domains or use an address on a domain already verified in this Resend account.`,
    );
  }

  throw new FeedbackEmailError(
    "send_failed",
    parsed.message || "Could not deliver feedback email",
  );
}
