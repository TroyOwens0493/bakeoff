import { type ReactNode, useEffect, useRef } from "react";
export const usd = (value: number) =>
	new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(
		value / 100,
	);
export const amount = (value: number) => (value / 100).toFixed(2);
export function MoneyInput({
	name,
	value,
	label,
	required = true,
	readOnly = false,
}: {
	name: string;
	value?: number;
	label: string;
	required?: boolean;
	readOnly?: boolean;
}) {
	return (
		<label>
			{label}
			<span className="money-input">
				<span>$</span>
				<input
					name={name}
					defaultValue={value === undefined ? "" : amount(value)}
					inputMode="decimal"
					readOnly={readOnly}
					required={required}
					pattern="-?[0-9]+(\.[0-9]{1,2})?"
				/>
			</span>
		</label>
	);
}
export function Modal({
	title,
	onClose,
	children,
}: {
	title: string;
	onClose: () => void;
	children: ReactNode;
}) {
	const ref = useRef<HTMLDialogElement>(null);
	useEffect(() => {
		ref.current?.showModal();
	}, []);
	return (
		<dialog ref={ref} onCancel={onClose} aria-label={title}>
			<div className="modal-heading">
				<h2>{title}</h2>
				<button
					type="button"
					className="secondary"
					onClick={onClose}
					aria-label="Close dialog"
				>
					Close
				</button>
			</div>
			{children}
		</dialog>
	);
}
