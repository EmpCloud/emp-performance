// ============================================================================
// EMAIL SERVICE
// Handles sending emails via nodemailer with HTML templates for performance
// notifications: review reminders, PIP check-ins, 1-on-1 reminders, and goals.
// ============================================================================

import nodemailer from "nodemailer";
import type { Transporter } from "nodemailer";
import { config } from "../../config";
import { logger } from "../../utils/logger";

// ---------------------------------------------------------------------------
// Transporter (singleton)
// ---------------------------------------------------------------------------

let transporter: Transporter | null = null;

function getTransporter(): Transporter {
  if (!transporter) {
    transporter = nodemailer.createTransport({
      host: config.email.host,
      port: config.email.port,
      secure: config.email.port === 465,
      auth:
        config.email.user && config.email.password
          ? { user: config.email.user, pass: config.email.password }
          : undefined,
    });
  }
  return transporter;
}

// ---------------------------------------------------------------------------
// Base send
// ---------------------------------------------------------------------------

export async function sendEmail(
  to: string | string[],
  subject: string,
  htmlBody: string,
): Promise<void> {
  try {
    const transport = getTransporter();
    await transport.sendMail({
      from: config.email.from,
      to: Array.isArray(to) ? to.join(", ") : to,
      subject,
      html: htmlBody,
    });
    logger.info(`Email sent to ${Array.isArray(to) ? to.join(", ") : to}: ${subject}`);
  } catch (error) {
    logger.error("Failed to send email:", error);
    throw error;
  }
}

// ---------------------------------------------------------------------------
// Shared layout wrapper
// ---------------------------------------------------------------------------

function wrapInLayout(title: string, body: string): string {
  return `<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1.0"></head>
<body style="margin:0;padding:0;background:#f4f5f7;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f4f5f7;padding:32px 0;">
    <tr><td align="center">
      <table width="600" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:8px;overflow:hidden;box-shadow:0 1px 3px rgba(0,0,0,0.1);">
        <!-- Header -->
        <tr><td style="background:#4f46e5;padding:24px 32px;">
          <h1 style="margin:0;color:#ffffff;font-size:20px;font-weight:600;">EMP Performance</h1>
        </td></tr>
        <!-- Body -->
        <tr><td style="padding:32px;">
          <h2 style="margin:0 0 16px;color:#111827;font-size:18px;">${title}</h2>
          ${body}
        </td></tr>
        <!-- Footer -->
        <tr><td style="padding:16px 32px;background:#f9fafb;border-top:1px solid #e5e7eb;">
          <p style="margin:0;color:#6b7280;font-size:12px;">This is an automated notification from EMP Performance. Please do not reply to this email.</p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;
}

// ---------------------------------------------------------------------------
// Review Deadline Reminder
// ---------------------------------------------------------------------------

export async function sendReviewReminder(
  employeeEmail: string,
  employeeName: string,
  cycleName: string,
  deadline: string,
  reviewType: string,
): Promise<void> {
  const body = `
    <p style="color:#374151;line-height:1.6;">Hi <strong>${employeeName}</strong>,</p>
    <p style="color:#374151;line-height:1.6;">This is a reminder that you have a pending <strong>${reviewType}</strong> review for the cycle <strong>${cycleName}</strong>.</p>
    <table cellpadding="0" cellspacing="0" style="margin:16px 0;background:#f9fafb;border-radius:6px;padding:16px;width:100%;">
      <tr><td style="padding:8px 16px;">
        <p style="margin:0;color:#6b7280;font-size:13px;">Deadline</p>
        <p style="margin:4px 0 0;color:#111827;font-size:15px;font-weight:600;">${deadline}</p>
      </td></tr>
    </table>
    <p style="color:#374151;line-height:1.6;">Please complete your review before the deadline to ensure timely processing.</p>
  `;
  await sendEmail(
    employeeEmail,
    `Review Reminder: ${cycleName} — deadline ${deadline}`,
    wrapInLayout("Review Deadline Approaching", body),
  );
}

// ---------------------------------------------------------------------------
// PIP Check-In Reminder
// ---------------------------------------------------------------------------

export async function sendPIPCheckInReminder(
  employeeEmail: string,
  employeeName: string,
  pipTitle: string,
  nextCheckInDate: string,
): Promise<void> {
  const body = `
    <p style="color:#374151;line-height:1.6;">Hi <strong>${employeeName}</strong>,</p>
    <p style="color:#374151;line-height:1.6;">This is a reminder to submit your weekly PIP update for <strong>${pipTitle}</strong>.</p>
    <table cellpadding="0" cellspacing="0" style="margin:16px 0;background:#fef3c7;border-radius:6px;padding:16px;width:100%;">
      <tr><td style="padding:8px 16px;">
        <p style="margin:0;color:#92400e;font-size:13px;">Next Check-In Date</p>
        <p style="margin:4px 0 0;color:#78350f;font-size:15px;font-weight:600;">${nextCheckInDate}</p>
      </td></tr>
    </table>
    <p style="color:#374151;line-height:1.6;">Regular check-ins help track your progress and ensure you stay on track with your improvement plan.</p>
  `;
  await sendEmail(
    employeeEmail,
    `PIP Check-In Reminder: ${pipTitle}`,
    wrapInLayout("PIP Check-In Reminder", body),
  );
}

// ---------------------------------------------------------------------------
// One-on-One Meeting Reminder
// ---------------------------------------------------------------------------

export async function sendOneOnOneReminder(
  managerEmail: string,
  employeeEmail: string,
  meetingTitle: string,
  scheduledAt: string,
): Promise<void> {
  const body = `
    <p style="color:#374151;line-height:1.6;">This is a reminder that you have a 1-on-1 meeting scheduled for tomorrow.</p>
    <table cellpadding="0" cellspacing="0" style="margin:16px 0;background:#ede9fe;border-radius:6px;padding:16px;width:100%;">
      <tr><td style="padding:8px 16px;">
        <p style="margin:0;color:#5b21b6;font-size:13px;">Meeting</p>
        <p style="margin:4px 0 0;color:#3b0764;font-size:15px;font-weight:600;">${meetingTitle}</p>
        <p style="margin:8px 0 0;color:#5b21b6;font-size:13px;">Scheduled</p>
        <p style="margin:4px 0 0;color:#3b0764;font-size:15px;font-weight:600;">${scheduledAt}</p>
      </td></tr>
    </table>
    <p style="color:#374151;line-height:1.6;">Please prepare your agenda items and any discussion topics ahead of time.</p>
  `;

  const html = wrapInLayout("1-on-1 Meeting Tomorrow", body);
  await sendEmail(
    [managerEmail, employeeEmail],
    `1-on-1 Reminder: ${meetingTitle} — ${scheduledAt}`,
    html,
  );
}

// ---------------------------------------------------------------------------
// Goal Deadline Reminder
// ---------------------------------------------------------------------------

export async function sendGoalDeadlineReminder(
  employeeEmail: string,
  employeeName: string,
  goalTitle: string,
  dueDate: string,
): Promise<void> {
  const body = `
    <p style="color:#374151;line-height:1.6;">Hi <strong>${employeeName}</strong>,</p>
    <p style="color:#374151;line-height:1.6;">Your goal <strong>${goalTitle}</strong> is due soon.</p>
    <table cellpadding="0" cellspacing="0" style="margin:16px 0;background:#fef2f2;border-radius:6px;padding:16px;width:100%;">
      <tr><td style="padding:8px 16px;">
        <p style="margin:0;color:#991b1b;font-size:13px;">Due Date</p>
        <p style="margin:4px 0 0;color:#7f1d1d;font-size:15px;font-weight:600;">${dueDate}</p>
      </td></tr>
    </table>
    <p style="color:#374151;line-height:1.6;">Please review your progress and update your goal status if needed.</p>
  `;
  await sendEmail(
    employeeEmail,
    `Goal Deadline Approaching: ${goalTitle}`,
    wrapInLayout("Goal Deadline Reminder", body),
  );
}

// ---------------------------------------------------------------------------
// Cycle Launched Notification
// ---------------------------------------------------------------------------

export async function sendCycleLaunchedNotification(
  participantEmails: string[],
  cycleName: string,
  startDate: string,
  endDate: string,
): Promise<void> {
  if (participantEmails.length === 0) return;

  const body = `
    <p style="color:#374151;line-height:1.6;">A new review cycle has been launched and you are a participant.</p>
    <table cellpadding="0" cellspacing="0" style="margin:16px 0;background:#ecfdf5;border-radius:6px;padding:16px;width:100%;">
      <tr><td style="padding:8px 16px;">
        <p style="margin:0;color:#065f46;font-size:13px;">Cycle</p>
        <p style="margin:4px 0 0;color:#064e3b;font-size:15px;font-weight:600;">${cycleName}</p>
        <p style="margin:8px 0 0;color:#065f46;font-size:13px;">Period</p>
        <p style="margin:4px 0 0;color:#064e3b;font-size:15px;font-weight:600;">${startDate} — ${endDate}</p>
      </td></tr>
    </table>
    <p style="color:#374151;line-height:1.6;">Please log in to EMP Performance to view your review assignments and deadlines.</p>
  `;

  const html = wrapInLayout("New Review Cycle Launched", body);

  // Send individually to avoid exposing all participant emails
  const results = participantEmails.map((email) =>
    sendEmail(email, `Review Cycle Launched: ${cycleName}`, html).catch((err) => {
      logger.error(`Failed to send cycle launch notification to ${email}:`, err);
    }),
  );

  await Promise.allSettled(results);
}
