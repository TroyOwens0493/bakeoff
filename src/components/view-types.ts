import type { Id } from "../../convex/_generated/dataModel";

export type Run = (
	work: () => Promise<unknown>,
	success?: string,
) => Promise<boolean>;
export type ViewProps = {
	spaceId: Id<"spaces">;
	month: string;
	active: boolean;
	run: Run;
};
