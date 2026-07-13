/**
 * Google Ads API configuration, read from the environment. Everything here is
 * Bruce's to supply (developer token, OAuth app, refresh token, the account +
 * manager customer ids, and the two conversion-action resource names). When
 * anything required is missing, `googleAdsConfig()` returns null and the whole
 * offline-conversion feature degrades to a logged no-op — it must NEVER crash
 * the booking flow (ERP build spec 2026-07-13, item 6).
 */

export interface GoogleAdsConfig {
  developerToken: string;
  clientId: string;
  clientSecret: string;
  refreshToken: string;
  /** Digits only (dashes stripped). The Workplaces ad account, 824-301-5435. */
  customerId: string;
  /** Digits only. The manager (MCC) account, 168-696-7494 — sent as the
   *  `login-customer-id` header. */
  loginCustomerId: string;
  /** Conversion-action resource names (or bare numeric ids) for the two
   *  "import / offline" actions. A kind whose action is unset is skipped. */
  bookedConversionAction: string | null;
  signedConversionAction: string | null;
}

/** Google customer ids are dash-formatted in the UI (824-301-5435) but must be
 *  digits only in the API path and headers. */
function digitsOnly(v: string | undefined): string {
  return (v ?? "").replace(/[^0-9]/g, "");
}

function nonEmpty(v: string | undefined): string | null {
  const t = (v ?? "").trim();
  return t.length > 0 ? t : null;
}

/**
 * Returns the config only when every REQUIRED credential is present. The two
 * conversion-action resource names are optional here (each kind checks its own),
 * so the sync can run one action even if the other isn't set up yet.
 */
export function googleAdsConfig(): GoogleAdsConfig | null {
  const developerToken = nonEmpty(process.env.GOOGLE_ADS_DEVELOPER_TOKEN);
  const clientId = nonEmpty(process.env.GOOGLE_ADS_CLIENT_ID);
  const clientSecret = nonEmpty(process.env.GOOGLE_ADS_CLIENT_SECRET);
  const refreshToken = nonEmpty(process.env.GOOGLE_ADS_REFRESH_TOKEN);
  const customerId = digitsOnly(process.env.GOOGLE_ADS_CUSTOMER_ID);
  const loginCustomerId = digitsOnly(process.env.GOOGLE_ADS_LOGIN_CUSTOMER_ID);

  if (
    !developerToken ||
    !clientId ||
    !clientSecret ||
    !refreshToken ||
    !customerId ||
    !loginCustomerId
  ) {
    return null;
  }

  return {
    developerToken,
    clientId,
    clientSecret,
    refreshToken,
    customerId,
    loginCustomerId,
    bookedConversionAction: nonEmpty(process.env.GOOGLE_ADS_BOOKED_CONVERSION_ACTION),
    signedConversionAction: nonEmpty(process.env.GOOGLE_ADS_SIGNED_CONVERSION_ACTION),
  };
}

/** The list of env vars, for a friendly "not configured" log. */
export const GOOGLE_ADS_ENV_VARS = [
  "GOOGLE_ADS_DEVELOPER_TOKEN",
  "GOOGLE_ADS_CLIENT_ID",
  "GOOGLE_ADS_CLIENT_SECRET",
  "GOOGLE_ADS_REFRESH_TOKEN",
  "GOOGLE_ADS_CUSTOMER_ID",
  "GOOGLE_ADS_LOGIN_CUSTOMER_ID",
  "GOOGLE_ADS_BOOKED_CONVERSION_ACTION",
  "GOOGLE_ADS_SIGNED_CONVERSION_ACTION",
] as const;
