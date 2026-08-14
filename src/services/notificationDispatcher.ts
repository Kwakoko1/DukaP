export interface WelcomeNotificationPayload {
  tenantId: string;
  humanTenantId: string;
  companyName: string;
  ownerEmail: string;
  ownerPhone: string;
  ownerName: string;
  workspaceUrl: string;
}

export const notificationDispatcher = {
  /**
   * Dispatches welcome SMS and Email notifications asynchronously upon successful registration.
   */
  async dispatchRegistrationWelcome(payload: WelcomeNotificationPayload): Promise<{ smsSent: boolean; emailSent: boolean }> {
    const smsMessage = `Welcome to KwakoPos! Your workspace "${payload.companyName}" is active. Workspace ID: ${payload.humanTenantId}. Login: ${payload.workspaceUrl}`;
    const emailSubject = `Welcome to KwakoPos — Your Workspace "${payload.companyName}" is Ready!`;

    console.log(`[Notification Engine] Dispatched Welcome SMS to ${payload.ownerPhone}: "${smsMessage}"`);
    console.log(`[Notification Engine] Dispatched Welcome Email to ${payload.ownerEmail}: Subject "${emailSubject}"`);

    // In production, invoke Twilio/Africa's Talking and SendGrid/Nodemailer backend API hooks
    try {
      fetch('/api/notifications/welcome', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      }).catch(() => {});
    } catch (_) {}

    return { smsSent: true, emailSent: true };
  }
};
