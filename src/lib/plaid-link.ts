type LinkHandler = { open: () => void; destroy: () => void };
type PlaidWindow = Window & {
	Plaid?: {
		create: (options: {
			token: string;
			onSuccess: (publicToken: string) => void;
			onExit: (error: { display_message?: string } | null) => void;
		}) => LinkHandler;
	};
};
let loading: Promise<void> | undefined;
export async function openPlaid(
	token: string,
	onSuccess: (token: string) => Promise<void>,
	updated = false,
): Promise<void> {
	if (!(window as PlaidWindow).Plaid) {
		loading ??= new Promise((resolve, reject) => {
			const script = document.createElement("script");
			script.src = "https://cdn.plaid.com/link/v2/stable/link-initialize.js";
			script.onload = () => resolve();
			script.onerror = () => {
				loading = undefined;
				script.remove();
				reject(
					new Error(
						"Could not load Plaid. Check your connection and try again.",
					),
				);
			};
			document.head.append(script);
		});
		await loading;
	}
	return new Promise((resolve, reject) => {
		const handler = (window as PlaidWindow).Plaid!.create({
			token,
			onSuccess: (publicToken) => {
				void (updated ? Promise.resolve() : onSuccess(publicToken)).then(
					() => {
						handler.destroy();
						resolve();
					},
					(e) => {
						handler.destroy();
						reject(e);
					},
				);
			},
			onExit: (error) => {
				handler.destroy();
				if (error)
					reject(
						new Error(
							error.display_message ?? "Bank connection was not completed.",
						),
					);
				else resolve();
			},
		});
		handler.open();
	});
}
