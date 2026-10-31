import { createServer } from "node:http";

export function queryFixture(path, args = {}, user = "alice") {
	const privateId = `${user}-private`;
	const spaceId = args.spaceId ?? privateId;
	const month = args.month ?? "2026-10";
	const shared = spaceId === "shared";
	const categories = [
		{
			_id: "food",
			_creationTime: 1,
			spaceId,
			name: "Groceries",
			color: "#90ac75",
			order: 0,
			revision: 2,
		},
		{
			_id: "housing",
			_creationTime: 2,
			spaceId,
			name: "Housing",
			color: "#9daf87",
			order: 1,
			revision: 1,
		},
	];
	const entries = [
		{
			_id: "manual",
			_creationTime: 1,
			spaceId,
			accountId: "checking",
			source: "manual",
			description: "Market <script>alert(1)</script>",
			amount: 12345,
			date: `${month}-10`,
			pending: false,
			kind: "purchase",
			note: "weekly food",
			splits: [{ categoryId: "food", amount: 12345 }],
			revision: 4,
			removed: false,
		},
		{
			_id: "imported",
			_creationTime: 2,
			spaceId,
			accountId: "checking",
			source: "plaid",
			description: "Imported market",
			amount: 12345,
			date: `${month}-10`,
			pending: false,
			kind: "purchase",
			note: "",
			splits: [{ categoryId: "food", amount: 12345 }],
			revision: 1,
			removed: false,
		},
	];
	const plan = {
		_id: "plan",
		_creationTime: 1,
		spaceId,
		month,
		expectedIncome: 200000,
		savingsTarget: 50000,
		limits: [
			{ categoryId: "food", amount: 50000 },
			{ categoryId: "housing", amount: 100000 },
		],
		revision: 3,
		saved: true,
		reviewed: false,
	};
	switch (path) {
		case "budgets:home":
			return {
				profile:
					user === "new"
						? null
						: {
								_id: `${user}-profile`,
								_creationTime: 1,
								userId: user,
								name:
									user === "alice"
										? "Alice"
										: user === "bob"
											? "Bob"
											: "New user",
								email: `${user}@example.com`,
								timeZone: "America/Boise",
							},
				user: { name: user, email: `${user}@example.com`, id: user },
				spaces:
					user === "new"
						? []
						: [
								{
									_id: privateId,
									_creationTime: 1,
									name: "My budget",
									type: "private",
									ownerId: user,
									timeZone: "America/Boise",
									active: true,
								},
								{
									_id: "shared",
									_creationTime: 2,
									name: "Shared",
									type: "shared",
									timeZone: "America/Boise",
									active: true,
								},
								{
									_id: "left",
									_creationTime: 3,
									name: "Shared",
									type: "shared",
									timeZone: "America/Boise",
									active: false,
								},
							],
			};
		case "budgets:dashboard":
			return {
				income: 200000,
				incoming: 0,
				outgoing: 0,
				spending: 24690,
				pending: 500,
				savings: 175310,
				categories,
				entries,
				plan,
				funds: {
					incoming: 0,
					outgoing: 0,
					personalIncoming: 0,
					personalOutgoing: 0,
					actualIncoming: 0,
					actualOutgoing: 0,
					carry: 0,
					allocations: [],
				},
				fundedBy: null,
				reserved: [{ _id: "carry", categoryId: "food", amount: 10000 }],
				available: 115310,
				balance: 0,
			};
		case "budgets:alerts":
			return [
				{ key: "food-near", text: "Groceries: 80% or more used", read: false },
			];
		case "budgets:reports":
			return [
				{ month: "2026-09", spending: 10000, categories: { food: 10000 } },
				{ month: "2026-10", spending: 24690, categories: { food: 24690 } },
			];
		case "budgets:recurring":
			return [
				{
					merchant: "Music",
					amount: 999,
					date: "2026-11-10",
					status: "suggested",
				},
			];
		case "budgets:transactions": {
			const rows = entries.filter(
				(e) =>
					(!args.search ||
						`${e.description} ${e.note}`
							.toLowerCase()
							.includes(args.search.toLowerCase())) &&
					(!args.categoryId ||
						e.splits.some((s) => s.categoryId === args.categoryId)) &&
					(!args.accountId || e.accountId === args.accountId),
			);
			return {
				rows: args.cursor ? rows.slice(1) : rows,
				next: args.cursor ? null : "manual",
				total: rows.length,
			};
		}
		case "accounts:list":
			return [
				{
					_id: "checking",
					name: shared ? "Shared checking" : "Personal checking",
					type: "checking",
					mask: "1234",
					active: spaceId !== "left",
					revision: 2,
					canMove: spaceId !== "left",
				},
			];
		case "accounts:connections":
			return [
				{
					_id: "bank",
					institution: "Sandbox Bank",
					status: "active",
					lastSync: 1793440800000,
				},
				{
					_id: "review-bank",
					institution: "Review Bank",
					status: "review",
					error: "Check duplicate accounts",
				},
			];
		case "sharing:status":
			return {
				members: [{ name: "Alice", active: true }],
				invitations: [
					{
						_id: "invitation",
						email: "partner@example.com",
						status: "pending",
						delivery: "sent",
						expiresAt: 1794000000000,
					},
				],
			};
		case "personalAllocations:list":
			return [
				{ privateId, name: "Alice", active: true, amount: 25000, revision: 2 },
			];
		case "contributions:list":
			return {
				contribution: {
					_id: "contribution",
					planned: 10000,
					revision: 2,
					pairs: [{ outId: "out-old", inId: "in-old", amount: 10000 }],
				},
				suggestions: [
					{
						outId: "out",
						inId: "in",
						outDescription: "Personal transfer",
						inDescription: "Shared transfer",
						date: "2026-10-01",
						amount: 10000,
					},
				],
			};
		case "bank:review":
			return args.id === "review-bank"
				? [
						{
							accountId: "possible",
							name: "Checking",
							type: "checking",
							mask: "1234",
							possibleDuplicate: true,
						},
					]
				: null;
		default:
			throw new Error(`No fixture for ${path}`);
	}
}

export async function startFixture() {
	const calls = [];
	const server = createServer(async (req, res) => {
		try {
			const url = new URL(req.url, "http://fixture");
			let body = "";
			for await (const chunk of req) body += chunk;
			const user =
				/better-auth.session_token=([^;]+)/.exec(
					req.headers.cookie ?? "",
				)?.[1] ?? "";
			calls.push({
				path: url.pathname,
				method: req.method,
				body,
				headers: req.headers,
			});
			res.setHeader("content-type", "application/json");
			if (url.pathname === "/api/auth/convex/token") {
				if (!user || user === "expired") {
					res.statusCode = 401;
					res.end("{}");
				} else res.end(JSON.stringify({ token: user }));
				return;
			}
			if (url.pathname === "/api/auth/get-session") {
				res.end(
					JSON.stringify(
						user
							? {
									session: {
										id: "session",
										token: user,
										userId: user,
										expiresAt: "2099-01-01T00:00:00Z",
									},
									user: { id: user, name: user, email: `${user}@example.com` },
								}
							: null,
					),
				);
				return;
			}
			if (url.pathname.startsWith("/api/auth/")) {
				res.setHeader("set-cookie", [
					"better-auth.session_token=alice; Path=/; HttpOnly; SameSite=Lax",
					"fixture=second; Path=/; HttpOnly",
				]);
				res.end(
					JSON.stringify({
						user: { id: "alice", name: "Alice", email: "alice@example.com" },
						session: { id: "session", token: "alice" },
						token: "alice",
					}),
				);
				return;
			}
			if (url.pathname === "/api/query") {
				const request = JSON.parse(body);
				const identity = (req.headers.authorization ?? "").replace(
					"Bearer ",
					"",
				);
				res.end(
					JSON.stringify({
						status: "success",
						value: queryFixture(request.path, request.args[0], identity),
						logLines: [],
					}),
				);
				return;
			}
			res.statusCode = 404;
			res.end("{}");
		} catch (error) {
			res.statusCode = 500;
			res.end(JSON.stringify({ error: error.message }));
		}
	});
	await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
	return {
		server,
		calls,
		origin: `http://127.0.0.1:${server.address().port}`,
		close: () => new Promise((resolve) => server.close(resolve)),
	};
}
