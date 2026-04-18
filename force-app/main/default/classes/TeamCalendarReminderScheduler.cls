/**
 * @description       : Scheduled entry point for Team Calendar reminder processing.
 * @author            : ChangeMeIn@UserSettingsUnder.SFDoc
 * @group             :
 * @last modified on  : 04-15-2026
 * @last modified by  : ChangeMeIn@UserSettingsUnder.SFDoc
**/
public without sharing class TeamCalendarReminderScheduler implements Schedulable {
    public void execute(SchedulableContext context) {
        TeamCalendarReminderService.processDueReminders();
    }
}