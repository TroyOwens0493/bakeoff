import { register } from "../../validation.ts";
export const query = register("query", "public");
export const mutation = register("mutation", "public");
export const action = register("action", "public");
export const internalQuery = register("query", "internal");
export const internalMutation = register("mutation", "internal");
export const internalAction = register("action", "internal");
