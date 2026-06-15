import { describe, expect, it } from "vitest";
import { googleWorkspaceOAuthProvider } from "./googleOAuthProvider";

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

describe("googleWorkspaceOAuthProvider", () => {
  it("adds offline Google authorization params for refresh tokens", () => {
    const provider = googleWorkspaceOAuthProvider({
      clientId: "client-id",
      redirectUri: "http://127.0.0.1/callback",
      fetchImpl: async () => jsonResponse({}) as never,
    });

    expect(provider.authorizationParams).toMatchObject({
      access_type: "offline",
      prompt: "consent",
      include_granted_scopes: "true",
    });
    expect(provider.authorizationScopes?.(["gmail.readonly", "calendar.events"])).toEqual([
      "https://www.googleapis.com/auth/gmail.readonly",
      "https://www.googleapis.com/auth/calendar.events",
    ]);
  });

  it("normalizes Google token scopes back to connector scope ids", async () => {
    let tokenRequestBody = "";
    const provider = googleWorkspaceOAuthProvider({
      clientId: "client-id",
      clientSecret: "client-secret",
      redirectUri: "http://127.0.0.1/callback",
      fetchImpl: async (_url, init) => {
        tokenRequestBody = String(init?.body ?? "");
        return jsonResponse({
          access_token: "access",
          refresh_token: "refresh",
          expires_in: 3600,
          scope: "openid email https://www.googleapis.com/auth/gmail.readonly",
        }) as never;
      },
    });

    const token = await provider.exchangeAuthorizationCode({
      code: "code",
      codeVerifier: "verifier",
      redirectUri: "http://127.0.0.1/callback",
      requestedScopes: ["gmail.readonly"],
    });

    expect(token.accessToken).toBe("access");
    expect(token.refreshToken).toBe("refresh");
    expect(token.scopes).toEqual(["email", "gmail.readonly", "openid"]);
    expect(tokenRequestBody).toContain("client_secret=client-secret");
  });

  it("uses stable subject ids so multiple Google emails can coexist", async () => {
    const provider = googleWorkspaceOAuthProvider({
      clientId: "client-id",
      redirectUri: "http://127.0.0.1/callback",
      fetchImpl: async () =>
        jsonResponse({
          sub: "1133557799",
          email: "travis.godwin.good@gmail.com",
          name: "Travis",
        }) as never,
    });

    const identity = await provider.fetchAccountIdentity({
      token: { accessToken: "access", scopes: ["email"] },
    });

    expect(identity.id).toBe("1133557799");
    expect(identity.email).toBe("travis.godwin.good@gmail.com");
  });
});
