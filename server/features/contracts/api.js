const refs = new Proxy(
	{},
	{
		get: (_, module) =>
			new Proxy({}, { get: (_, name) => `${String(module)}:${String(name)}` }),
	},
);
export const api = refs;
export const internal = refs;
