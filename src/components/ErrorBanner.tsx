import { X } from "lucide-react";

export function ErrorBanner({
	message,
	onDismiss,
}: {
	message: string;
	onDismiss: () => void;
}) {
	return (
		<div className="banner error dismissible-banner" role="alert">
			{message}
			<button
				type="button"
				className="banner-dismiss"
				aria-label="Dismiss error notification"
				onClick={onDismiss}
			>
				<X size={18} aria-hidden="true" />
			</button>
		</div>
	);
}
