import { icons } from "lucide-react";

/** A Lucide icon by name, kebab case or PascalCase: "square-terminal", "SquareTerminal". */
export function iconByName(name?: string) {
  if (!name) return null;
  const pascal = name.replace(/(^|-)([a-zA-Z0-9])/g, (_, __, c: string) => c.toUpperCase());
  return (icons as Record<string, (typeof icons)[keyof typeof icons]>)[pascal] ?? null;
}
