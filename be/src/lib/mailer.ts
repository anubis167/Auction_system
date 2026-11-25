import { Resend } from 'resend';
import { HttpError } from './http';

export interface Mail {
  to: string;
  subject: string;
  text: string;
  html?: string;
  sentAt: Date;
}

export interface MailContent {
  subject: string;
  text: string;
  html?: string;
}

/** Compatible with fake transports used in tests. */
export interface MailTransport {
  sendMail(message: {
    from: string;
    to: string;
    subject: string;
    text: string;
    html?: string;
  }): Promise<unknown>;
}

export const SEND_FAILED_MESSAGE =
  'We could not send the email, please try again';

const outbox: Mail[] = [];

export function mailSettings(env: NodeJS.ProcessEnv = process.env) {
  const name = env.MAIL_FROM_NAME ?? "Beat'em";
  const email = env.RESEND_FROM_EMAIL ?? 'onboarding@resend.dev';

  if (env.RESEND_API_KEY) {
    return {
      kind: 'resend' as const,
      from: `${name} <${email}>`,
      apiKey: env.RESEND_API_KEY,
    };
  }

  return {
    kind: 'outbox' as const,
    from: `${name} <${email}>`,
    apiKey: null,
  };
}

let override: MailTransport | null = null;

let cached: {
  key: string;
  transport: MailTransport;
} | null = null;

/** Tests only: replace the transport. Null restores environment-based transport. */
export function setMailTransport(transport: MailTransport | null) {
  override = transport;
}

function currentTransport(
  settings: ReturnType<typeof mailSettings>,
): MailTransport | null {
  if (override) return override;
  if (!settings.apiKey) return null;

  const key = settings.apiKey;

  if (cached?.key !== key) {
    const resend = new Resend(key);

    cached = {
      key,
      transport: {
        async sendMail(message) {
          const { data, error } = await resend.emails.send({
            from: message.from,
            to: message.to,
            subject: message.subject,
            text: message.text,
            ...(message.html ? { html: message.html } : {}),
          });

          if (error) {
            throw new Error(
              `Resend API error: ${error.message} (${error.name})`,
            );
          }

          return data;
        },
      },
    };
  }

  return cached.transport;
}

/** Sends a mail using Resend or the development outbox. */
export async function sendMail(
  to: string,
  subject: string,
  text: string,
  html?: string,
) {
  const mail: Mail = {
    to,
    subject,
    text,
    html,
    sentAt: new Date(),
  };

  const settings = mailSettings();
  const transport = currentTransport(settings);

  if (transport) {
    try {
      await transport.sendMail({
        from: settings.from,
        to,
        subject,
        text,
        html,
      });

      console.log(`[mail] sent successfully to ${to}`);
    } catch (err) {
      console.error(`[mail] sending "${subject}" to ${to} failed:`, {
        message: err instanceof Error ? err.message : String(err),
      });

      throw err;
    }
  } else {
    if (process.env.NODE_ENV === 'production') {
      const error = new Error(
        'RESEND_API_KEY is not configured in production',
      );

      console.error('[mail] configuration error:', error.message);
      throw error;
    }

    console.log(
      `[mail] [development outbox] to=${to} subject="${subject}"\n${text}`,
    );
  }

  outbox.push(mail);

  if (outbox.length > 200) {
    outbox.shift();
  }

  return mail;
}

/** Account mails: convert delivery failures into HTTP 502. */
export async function sendAccountMail(to: string, content: MailContent) {
  try {
    return await sendMail(
      to,
      content.subject,
      content.text,
      content.html,
    );
  } catch {
    throw new HttpError(502, SEND_FAILED_MESSAGE);
  }
}

export function getOutbox(to?: string) {
  return to
    ? outbox.filter((mail) => mail.to === to)
    : [...outbox];
}
