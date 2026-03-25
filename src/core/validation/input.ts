const EMAIL_PATTERN = /^[a-z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-z0-9-]+(?:\.[a-z0-9-]+)+$/i;
const DOMAIN_PATTERN = /^(?=.{1,253}$)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/i;

export function normalizeDomain(input: string): string {
  const domain = input.trim().toLowerCase();

  if (!domain) {
    throw new Error("domain is required");
  }

  if (domain.includes("*")) {
    throw new Error("wildcard domains are not supported");
  }

  if (domain.includes("/") || domain.includes("\\")) {
    throw new Error("invalid domain");
  }

  if (!DOMAIN_PATTERN.test(domain)) {
    throw new Error("invalid domain");
  }

  return domain;
}

export function normalizeEmail(input: string): string {
  const email = input.trim().toLowerCase();

  if (!email) {
    throw new Error("email is required");
  }

  if (email.includes("\n") || email.includes("\r")) {
    throw new Error("invalid email");
  }

  if (email.includes("/") || email.includes("\\")) {
    throw new Error("invalid email");
  }

  if (!EMAIL_PATTERN.test(email)) {
    throw new Error("invalid email");
  }

  return email;
}

export function assertAliasBelongsToDomain(email: string, domain: string): void {
  const normalizedEmail = normalizeEmail(email);
  const normalizedDomain = normalizeDomain(domain);

  if (normalizedEmail.endsWith(`@${normalizedDomain}`)) {
    return;
  }

  throw new Error("alias does not belong to the configured domain");
}

export function assertDestinationOutsideDomain(destinationEmail: string, domain: string): void {
  const normalizedDestination = normalizeEmail(destinationEmail);
  const normalizedDomain = normalizeDomain(domain);

  if (!normalizedDestination.endsWith(`@${normalizedDomain}`)) {
    return;
  }

  throw new Error("destination inbox must not use the same managed domain");
}

export function extractDomainFromEmail(email: string): string {
  const normalizedEmail = normalizeEmail(email);
  const atIndex = normalizedEmail.lastIndexOf("@");

  if (atIndex > 0) {
    return normalizedEmail.slice(atIndex + 1);
  }

  throw new Error("invalid email");
}
