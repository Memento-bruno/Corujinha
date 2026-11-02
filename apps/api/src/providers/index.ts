import type { Config } from "../config.js";
import { MockProvider } from "./mock.js";
import { PluggyProvider } from "./pluggy.js";
import type { FinanceProvider } from "./types.js";

export type { FinanceProvider } from "./types.js";

export function buildProvider(config: Config): FinanceProvider {
  if (config.FINANCE_PROVIDER === "pluggy") {
    return new PluggyProvider({
      clientId: config.PLUGGY_CLIENT_ID!,
      clientSecret: config.PLUGGY_CLIENT_SECRET!,
      baseUrl: config.PLUGGY_BASE_URL,
    });
  }
  return new MockProvider();
}
