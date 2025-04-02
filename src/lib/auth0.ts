// lib/auth0.ts
import { Auth0Client } from '@auth0/nextjs-auth0/server';

export const auth0 = new Auth0Client({
  identityClaimFilter: false,
  session: {
    idToken: true, // <- This makes custom claims from ID token available in session.user
  },
});

console.log('💥 AUTH0_ISSUER_BASE_URL =', process.env.AUTH0_ISSUER_BASE_URL);