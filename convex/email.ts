import { v } from "convex/values";
import { internalAction } from "./_generated/server";
export function escapeHtml(value: string): string {
	return value.replace(
		/[&<>"']/g,
		(character) =>
			({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
				character
			]!,
	);
}
export async function sendEmail(
	to: string,
	subject: string,
	text: string,
	key: string,
): Promise<void> {
	if (!process.env.RESEND_API_KEY || !process.env.RESEND_FROM)
		throw new Error("Configure RESEND_API_KEY and RESEND_FROM in Convex.");
	const response = await fetch("https://api.resend.com/emails", {
		method: "POST",
		headers: {
			Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
			"Content-Type": "application/json",
			"Idempotency-Key": key,
		},
		body: JSON.stringify({
			from: process.env.RESEND_FROM,
			to: [to],
			subject,
			text,
		}),
	});
	if (!response.ok)
		throw new Error(
			"Email delivery failed. Check the Resend sender and configuration.",
		);
}
export const reset = internalAction({
	args: { to: v.string(), url: v.string(), key: v.string() },
	handler: async (_ctx, args) =>
		sendEmail(
			args.to,
			"Reset your Budget Together password",
			`Open this link to reset your password:\n${args.url}\nIf you did not request this, ignore this email.`,
			args.key,
		),
});
