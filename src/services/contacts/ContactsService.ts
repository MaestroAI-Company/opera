import { Contact, ContactField, getPermissionsAsync, requestPermissionsAsync } from 'expo-contacts';

export type ContactResult = {
  name: string;
  phoneNumbers: string[];
  emails: string[];
};

//phone formats collapse to one key
const PHONE_STRIP_RE = /[\s().-]/g;
const FR_INTL_PREFIX_RE = /^(?:\+33|0033)/;

function normalizePhoneKey(raw: string): string {
  const digitsAndPlus = raw.replace(PHONE_STRIP_RE, '');
  return digitsAndPlus.replace(FR_INTL_PREFIX_RE, '0');
}

//dedupe same phone in different formats
function dedupePhoneNumbers(numbers: string[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const n of numbers) {
    const key = normalizePhoneKey(n);
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(n);
  }
  return result;
}

class ContactsServiceImpl {
  //ask os for permission
  async requestPermission(): Promise<boolean> {
    try {
      const { status } = await requestPermissionsAsync();
      return status === 'granted';
    } catch (e) {
      console.warn('[ContactsService] requestPermission failed:', e);
      return false;
    }
  }

  //read current permission without prompting
  async hasPermission(): Promise<boolean> {
    try {
      const { status } = await getPermissionsAsync();
      return status === 'granted';
    } catch {
      return false;
    }
  }

  //fetch all contacts, resolve nicknames elsewhere
  async getAll(): Promise<ContactResult[]> {
    const details = await Contact.getAllDetails([
      ContactField.FULL_NAME,
      ContactField.NICKNAME,
      ContactField.PHONES,
      ContactField.EMAILS,
    ]);

    return details.map((d) => ({
      name: d.fullName || d.nickname || 'Unknown',
      phoneNumbers: dedupePhoneNumbers(d.phones.map((p) => p.number).filter((n): n is string => !!n)),
      emails: d.emails.map((e) => e.address).filter((a): a is string => !!a),
    }));
  }
}

export const ContactsService = new ContactsServiceImpl();
