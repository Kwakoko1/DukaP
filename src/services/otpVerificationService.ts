export interface OtpSession {
  target: string; // Phone number or email
  type: 'SMS' | 'EMAIL';
  code: string;
  expiresAt: number;
  attempts: number;
  verified: boolean;
}

const activeOtpSessions = new Map<string, OtpSession>();

export const otpVerificationService = {
  /**
   * Generates and dispatches a 6-digit verification code.
   */
  async requestOtp(target: string, type: 'SMS' | 'EMAIL' = 'SMS'): Promise<{ success: boolean; sessionKey: string; message: string }> {
    const cleanTarget = target.trim().toLowerCase();
    const sessionKey = `${type}:${cleanTarget}`;
    
    // Generate 6-digit cryptographic-style OTP
    const code = Math.floor(100000 + Math.random() * 900000).toString();
    const expiresAt = Date.now() + 10 * 60 * 1000; // 10 minutes expiry

    activeOtpSessions.set(sessionKey, {
      target: cleanTarget,
      type,
      code,
      expiresAt,
      attempts: 0,
      verified: false
    });

    console.log(`[OTP Verification Engine] Dispatched 6-digit ${type} OTP "${code}" to ${cleanTarget}. Expires in 10m.`);

    return {
      success: true,
      sessionKey,
      message: `Verification code sent to ${cleanTarget}. (Demo OTP Code: ${code})`
    };
  },

  /**
   * Verifies an input OTP code against active sessions.
   */
  async verifyOtp(target: string, inputCode: string, type: 'SMS' | 'EMAIL' = 'SMS'): Promise<{ success: boolean; message: string }> {
    const cleanTarget = target.trim().toLowerCase();
    const sessionKey = `${type}:${cleanTarget}`;
    const session = activeOtpSessions.get(sessionKey);

    if (!session) {
      return { success: false, message: 'Verification session expired or invalid. Please request a new code.' };
    }

    if (Date.now() > session.expiresAt) {
      activeOtpSessions.delete(sessionKey);
      return { success: false, message: 'Verification code expired. Please request a new code.' };
    }

    if (session.attempts >= 5) {
      activeOtpSessions.delete(sessionKey);
      return { success: false, message: 'Maximum verification attempts exceeded. Please request a new code.' };
    }

    session.attempts += 1;

    if (session.code !== inputCode.trim()) {
      return { success: false, message: `Invalid verification code (${5 - session.attempts} attempts remaining).` };
    }

    session.verified = true;
    return { success: true, message: 'Verification successful!' };
  },

  /**
   * Checks whether a target has been successfully verified.
   */
  isVerified(target: string, type: 'SMS' | 'EMAIL' = 'SMS'): boolean {
    const cleanTarget = target.trim().toLowerCase();
    const sessionKey = `${type}:${cleanTarget}`;
    const session = activeOtpSessions.get(sessionKey);
    return !!session && session.verified;
  }
};
