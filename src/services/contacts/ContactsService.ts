import { Contact, ContactField, getPermissionsAsync, requestPermissionsAsync } from 'expo-contacts';

export type ContactResult = {
  name: string;
  phoneNumbers: string[];
  emails: string[];
};

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
      phoneNumbers: d.phones.map((p) => p.number).filter((n): n is string => !!n),
      emails: d.emails.map((e) => e.address).filter((a): a is string => !!a),
    }));
  }
}

export const ContactsService = new ContactsServiceImpl();
