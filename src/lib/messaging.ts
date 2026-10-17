import { phoneDigits } from '@/lib/phone';

export type Channel = 'WhatsApp' | 'Email' | 'SMS' | 'Call';

export interface ContactTarget {
  phone?: string | null;
  email?: string | null;
  contact_preference?: string | null;
}

/** Channels this person can actually be reached on, given the data we hold. */
export function availableChannels(target: ContactTarget): Channel[] {
  const out: Channel[] = [];
  if (target.phone) out.push('WhatsApp', 'SMS', 'Call');
  if (target.email) out.push('Email');
  return out;
}

/**
 * Preferred contact first, then WhatsApp, Email, SMS — skipping anything we
 * have no address for. The legacy "Both" value means WhatsApp then Email.
 */
export function pickChannel(target: ContactTarget): Channel | null {
  const available = availableChannels(target);
  if (available.length === 0) return null;

  const pref = target.contact_preference;
  if (pref === 'Both') {
    return (
      available.find((c) => c === 'WhatsApp') ??
      available.find((c) => c === 'Email') ??
      available[0]
    );
  }
  if (pref && available.includes(pref as Channel)) return pref as Channel;

  for (const channel of ['WhatsApp', 'Email', 'SMS'] as Channel[]) {
    if (available.includes(channel)) return channel;
  }
  return available[0];
}

export interface MessageContent {
  subject?: string;
  body: string;
}

/** Build the "open your own app" link for a channel. Never a send API. */
export function messageHref(
  channel: Channel,
  target: ContactTarget,
  content: MessageContent
): string | null {
  const text = encodeURIComponent(content.body);
  switch (channel) {
    case 'WhatsApp': {
      const digits = target.phone ? phoneDigits(target.phone) : '';
      return digits ? `https://wa.me/${digits}?text=${text}` : null;
    }
    case 'Email': {
      if (!target.email) return null;
      const subject = encodeURIComponent(content.subject ?? '');
      return `mailto:${target.email}?subject=${subject}&body=${text}`;
    }
    case 'SMS': {
      const cleaned = target.phone ? target.phone.replace(/[^\d+]/g, '') : '';
      return cleaned ? `sms:${cleaned}?body=${text}` : null;
    }
    case 'Call': {
      const cleaned = target.phone ? target.phone.replace(/[^\d+]/g, '') : '';
      return cleaned ? `tel:${cleaned}` : null;
    }
  }
}

export function mailtoHref(
  email: string | null | undefined,
  content: MessageContent
): string | null {
  if (!email) return null;
  return messageHref('Email', { email }, content);
}

export function telHref(phone: string | null | undefined): string | null {
  return messageHref('Call', { phone }, { body: '' });
}

export function waHref(
  phone: string | null | undefined,
  body = ''
): string | null {
  return messageHref('WhatsApp', { phone }, { body });
}
