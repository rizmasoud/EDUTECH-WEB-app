export interface GeneratedToken {
  rawToken: string;
  tokenHash: string;
}

export interface ISessionTokenService {
  generateToken(): GeneratedToken;
  hashToken(rawToken: string): string;
}
