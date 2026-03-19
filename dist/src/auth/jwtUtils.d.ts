/**
 * JWT Utility Functions
 */
import type { TokenPayload, TokenPair, DecodedToken } from '../types';
export declare function generateAccessToken(payload: object): string;
export declare function generateRefreshToken(payload: object): string;
export declare function generateTokenPair(user: TokenPayload): TokenPair & {
    tokenId: string;
};
export declare function verifyToken(token: string): DecodedToken;
export declare function extractTokenFromHeader(authHeader: string | undefined): string | null;
export declare function decodeToken(token: string): DecodedToken | null;
//# sourceMappingURL=jwtUtils.d.ts.map