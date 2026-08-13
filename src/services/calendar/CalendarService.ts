import * as Calendar from 'expo-calendar';
import { Platform } from 'react-native';

export type CalendarEventResult = {
  id: string;
  title: string;
  startDate: string;
  endDate: string;
  location: string | null;
};

class CalendarServiceImpl {
  private writableCalendar: Calendar.ExpoCalendar | null = null;

  //ask os for permission
  async requestPermission(): Promise<boolean> {
    try {
      const { status } = await Calendar.requestCalendarPermissions();
      return status === 'granted';
    } catch (e) {
      console.warn('[CalendarService] requestPermission failed:', e);
      return false;
    }
  }

  //read current permission without prompting
  async hasPermission(): Promise<boolean> {
    try {
      const { status } = await Calendar.getCalendarPermissions();
      return status === 'granted';
    } catch {
      return false;
    }
  }

  //android picks the first writable calendar
  private async getWritableCalendar(): Promise<Calendar.ExpoCalendar | null> {
    if (this.writableCalendar) return this.writableCalendar;
    if (Platform.OS === 'ios') {
      try {
        this.writableCalendar = Calendar.getDefaultCalendarSync();
        return this.writableCalendar;
      } catch {
        //fall through to generic lookup
      }
    }
    const calendars = await Calendar.getCalendars(Calendar.EntityTypes.EVENT);
    this.writableCalendar = calendars.find((c) => c.allowsModifications) ?? null;
    return this.writableCalendar;
  }

  async listUpcoming(days: number): Promise<CalendarEventResult[]> {
    const calendars = await Calendar.getCalendars(Calendar.EntityTypes.EVENT);
    const now = new Date();
    const end = new Date(now.getTime() + days * 24 * 60 * 60 * 1000);
    const events = await Calendar.listEvents(
      calendars.map((c) => c.id),
      now,
      end
    );
    return events.map((e) => this.toResult(e));
  }

  async createEvent(opts: {
    title: string;
    startDate: Date;
    endDate: Date;
    notes?: string;
    location?: string;
  }): Promise<CalendarEventResult> {
    const calendar = await this.getWritableCalendar();
    if (!calendar) throw new Error('no writable calendar found on this device');
    const event = await calendar.createEvent({
      title: opts.title,
      startDate: opts.startDate,
      endDate: opts.endDate,
      notes: opts.notes,
      location: opts.location,
    });
    return this.toResult(event);
  }

  async updateEvent(
    eventId: string,
    patch: { title?: string; startDate?: Date; endDate?: Date; notes?: string; location?: string }
  ): Promise<CalendarEventResult> {
    const event = await Calendar.ExpoCalendarEvent.get(eventId);
    await event.update(patch);
    const refreshed = await Calendar.ExpoCalendarEvent.get(eventId);
    return this.toResult(refreshed);
  }

  async deleteEvent(eventId: string): Promise<void> {
    const event = await Calendar.ExpoCalendarEvent.get(eventId);
    await event.delete();
  }

  private toResult(e: Calendar.ExpoCalendarEvent): CalendarEventResult {
    return {
      id: e.id,
      title: e.title,
      startDate: typeof e.startDate === 'string' ? e.startDate : e.startDate.toISOString(),
      endDate: typeof e.endDate === 'string' ? e.endDate : e.endDate.toISOString(),
      location: e.location,
    };
  }
}

export const CalendarService = new CalendarServiceImpl();
