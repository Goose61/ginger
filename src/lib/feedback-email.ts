const FEEDBACK_TO = process.env.FEEDBACK_EMAIL_TO?.trim() || "slicepay@slicechain.io";

type FeedbackEmailInput = {
  category: string;
  message: string;
  contact: string | null;
  page: string | null;
};

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

export async function sendFeedbackEmail(input: FeedbackEmailInput): Promise<void> {
  const apiKey = process.env.RESEND_API_KEY?.trim();
  if (!apiKey) {
    throw new Error("Feedback email is not configured (RESEND_API_KEY)");
  }

  const from =
    process.env.FEEDBACK_FROM_EMAIL?.trim() || "Ginger Beta <feedback@gingernft.store>";
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

  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    console.error("[sendFeedbackEmail]", res.status, detail);
    throw new Error("Could not deliver feedback email");
  }
}
