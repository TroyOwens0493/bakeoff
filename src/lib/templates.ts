export const select = <T extends Element = HTMLElement>(
	root: ParentNode,
	selector: string,
): T => {
	const node = root.querySelector<T>(selector);
	if (!node) throw new Error(`Missing template control: ${selector}`);
	return node;
};
export const all = <T extends Element = HTMLElement>(
	root: ParentNode,
	selector: string,
) => [...root.querySelectorAll<T>(selector)];
export function template(id: string): HTMLElement {
	const source = select<HTMLTemplateElement>(document, `template#${id}`);
	const node = source.content.firstElementChild?.cloneNode(true);
	if (!(node instanceof HTMLElement)) throw new Error(`Empty template: ${id}`);
	return node;
}
export function text(root: ParentNode, key: string, value: unknown) {
	for (const node of all(root, `[data-text="${key}"]`))
		node.textContent = String(value ?? "");
}
export function field(root: ParentNode, name: string, value: unknown) {
	const node = select<
		HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement
	>(root, `[name="${CSS.escape(name)}"]`);
	if (node instanceof HTMLInputElement && node.type === "checkbox")
		node.checked = Boolean(value);
	else node.value = String(value ?? "");
	return node;
}
export function show(root: ParentNode, key: string, visible: boolean) {
	for (const node of all(root, `[data-show="${key}"]`)) node.hidden = !visible;
}
export function args(node: HTMLElement, values: object) {
	node.dataset.args = JSON.stringify(values);
}
export function rows<T>(
	root: ParentNode,
	name: string,
	items: readonly T[],
	bind: (node: HTMLElement, item: T, index: number) => void,
) {
	const source = select<HTMLTemplateElement>(
		root,
		`template[data-row="${name}"]`,
	);
	const target = select(root, `[data-list="${name}"]`);
	target.replaceChildren(
		...items.map((item, index) => {
			const node = source.content.firstElementChild?.cloneNode(true);
			if (!(node instanceof HTMLElement))
				throw new Error(`Empty row template: ${name}`);
			bind(node, item, index);
			return node;
		}),
	);
}
export function options(
	node: HTMLSelectElement,
	values: { value: string; label: string }[],
	current = "",
) {
	node.replaceChildren(
		...values.map(
			(item) =>
				new Option(item.label, item.value, false, item.value === current),
		),
	);
}
