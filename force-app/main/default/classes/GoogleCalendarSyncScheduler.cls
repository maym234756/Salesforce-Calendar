public without sharing class GoogleCalendarSyncScheduler implements Schedulable {
    public static final String JOB_NAME = 'Team Calendar Google Sync';

    private static final String DEFAULT_CRON_EXPRESSION = '0 0 * * * ?';
    private static final Integer DEFAULT_PAST_DAYS = 3;
    private static final Integer DEFAULT_FUTURE_DAYS = 30;
    private static final Integer DEFAULT_CALENDARS_PER_QUEUE = 5;
    private static final Set<String> ABORTABLE_JOB_STATES = new Set<String>{
        'WAITING',
        'ACQUIRED',
        'EXECUTING',
        'PAUSED',
        'BLOCKED',
        'PAUSED_BLOCKED'
    };

    @TestVisible
    private static SchedulerConfig testConfig;

    public void execute(SchedulableContext context) {
        SchedulerConfig config = loadConfig();
        if (config.isEnabled != true) {
            return;
        }

        List<Id> eligibleCalendarIds = loadEligibleCalendarIds();
        if (eligibleCalendarIds.isEmpty()) {
            return;
        }

        System.enqueueJob(
            new ScheduledSyncQueueable(
                eligibleCalendarIds,
                0,
                config.runImports,
                config.runExports,
                config.pastDays,
                config.futureDays,
                config.calendarsPerQueue,
                UserInfo.getUserEmail()
            )
        );
    }

    public static Id scheduleConfiguredJob() {
        SchedulerConfig config = loadConfig();
        clearExistingScheduledJobs();

        if (config.isEnabled != true) {
            return null;
        }

        return System.schedule(JOB_NAME, config.cronExpression, new GoogleCalendarSyncScheduler());
    }

    @TestVisible
    private static List<Id> loadEligibleCalendarIds() {
        SchedulerConfig config = loadConfig();
        List<Id> results = new List<Id>();

        for (Team_Calendar__c row : [
            SELECT Id, Google_Calendar_Id__c, Google_Import_Calendar_Ids__c
            FROM Team_Calendar__c
            WHERE Is_Active__c = true
              AND Google_Sync_Enabled__c = true
            ORDER BY Name, Id
            LIMIT 50000
        ]) {
            Boolean canImport = config.runImports == true && String.isNotBlank(row.Google_Import_Calendar_Ids__c);
            Boolean canExport = config.runExports == true && String.isNotBlank(row.Google_Calendar_Id__c);

            if (canImport || canExport) {
                results.add(row.Id);
            }
        }

        return results;
    }

    @TestVisible
    private static void clearExistingScheduledJobs() {
        for (CronTrigger triggerRow : [
            SELECT Id, State, CronJobDetail.Name
            FROM CronTrigger
            WHERE CronJobDetail.Name = :JOB_NAME
        ]) {
            if (!ABORTABLE_JOB_STATES.contains(triggerRow.State)) {
                continue;
            }

            try {
                System.abortJob(triggerRow.Id);
            } catch (Exception ex) {
                // Ignore non-abortable scheduler states during reschedule attempts.
            }
        }
    }

    @TestVisible
    private static void setTestConfig(
        Boolean isEnabled,
        String cronExpression,
        Boolean runImports,
        Boolean runExports,
        Integer pastDays,
        Integer futureDays,
        Integer calendarsPerQueue
    ) {
        SchedulerConfig config = new SchedulerConfig();
        config.isEnabled = isEnabled;
        config.cronExpression = cronExpression;
        config.runImports = runImports;
        config.runExports = runExports;
        config.pastDays = pastDays;
        config.futureDays = futureDays;
        config.calendarsPerQueue = calendarsPerQueue;
        testConfig = config;
    }

    @TestVisible
    private static void clearTestConfig() {
        testConfig = null;
    }

    private static SchedulerConfig loadConfig() {
        if (Test.isRunningTest() && testConfig != null) {
            return normalizeConfig(testConfig);
        }

        SchedulerConfig config = new SchedulerConfig();
        List<Google_Sync_Schedule__mdt> rows = [
            SELECT Is_Enabled__c,
                   Cron_Expression__c,
                   Run_Imports__c,
                   Run_Exports__c,
                   Past_Days__c,
                   Future_Days__c,
                   Calendars_Per_Queue__c
            FROM Google_Sync_Schedule__mdt
            WHERE DeveloperName = 'Default'
            LIMIT 1
        ];

        if (!rows.isEmpty()) {
            Google_Sync_Schedule__mdt row = rows[0];
            config.isEnabled = row.Is_Enabled__c;
            config.cronExpression = row.Cron_Expression__c;
            config.runImports = row.Run_Imports__c;
            config.runExports = row.Run_Exports__c;
            config.pastDays = normalizeDecimal(row.Past_Days__c, DEFAULT_PAST_DAYS, 0);
            config.futureDays = normalizeDecimal(row.Future_Days__c, DEFAULT_FUTURE_DAYS, 0);
            config.calendarsPerQueue = normalizeDecimal(
                row.Calendars_Per_Queue__c,
                DEFAULT_CALENDARS_PER_QUEUE,
                1
            );
        }

        return normalizeConfig(config);
    }

    private static SchedulerConfig normalizeConfig(SchedulerConfig config) {
        SchedulerConfig normalized = config == null ? new SchedulerConfig() : config;

        normalized.isEnabled = normalized.isEnabled == null ? true : normalized.isEnabled;
        normalized.cronExpression = String.isBlank(normalized.cronExpression)
            ? DEFAULT_CRON_EXPRESSION
            : normalized.cronExpression.trim();
        normalized.runImports = normalized.runImports == null ? true : normalized.runImports;
        normalized.runExports = normalized.runExports == null ? true : normalized.runExports;
        normalized.pastDays = normalizeInteger(normalized.pastDays, DEFAULT_PAST_DAYS, 0);
        normalized.futureDays = normalizeInteger(normalized.futureDays, DEFAULT_FUTURE_DAYS, 0);
        normalized.calendarsPerQueue = normalizeInteger(
            normalized.calendarsPerQueue,
            DEFAULT_CALENDARS_PER_QUEUE,
            1
        );
        return normalized;
    }

    private static Integer normalizeInteger(Integer rawValue, Integer fallbackValue, Integer minValue) {
        Integer normalized = rawValue == null ? fallbackValue : rawValue;
        if (normalized < minValue) {
            return fallbackValue;
        }
        return normalized;
    }

    private static Integer normalizeDecimal(Decimal rawValue, Integer fallbackValue, Integer minValue) {
        if (rawValue == null) {
            return fallbackValue;
        }

        Integer normalized = Integer.valueOf(String.valueOf(rawValue));
        if (normalized < minValue) {
            return fallbackValue;
        }
        return normalized;
    }

    private class SchedulerConfig {
        public Boolean isEnabled;
        public String cronExpression;
        public Boolean runImports;
        public Boolean runExports;
        public Integer pastDays;
        public Integer futureDays;
        public Integer calendarsPerQueue;
    }

    public class ScheduledSyncQueueable implements Queueable, Database.AllowsCallouts {
        private List<Id> calendarIds;
        private Integer offsetValue;
        private Boolean runImports;
        private Boolean runExports;
        private Integer pastDays;
        private Integer futureDays;
        private Integer calendarsPerQueue;
        private String notificationEmail;

        public ScheduledSyncQueueable(
            List<Id> calendarIds,
            Integer offsetValue,
            Boolean runImports,
            Boolean runExports,
            Integer pastDays,
            Integer futureDays,
            Integer calendarsPerQueue,
            String notificationEmail
        ) {
            this.calendarIds = calendarIds;
            this.offsetValue = offsetValue;
            this.runImports = runImports;
            this.runExports = runExports;
            this.pastDays = pastDays;
            this.futureDays = futureDays;
            this.calendarsPerQueue = calendarsPerQueue;
            this.notificationEmail = notificationEmail;
        }

        public void execute(QueueableContext context) {
            if (calendarIds == null || calendarIds.isEmpty()) {
                return;
            }

            Integer startIndex = offsetValue == null ? 0 : offsetValue;
            Integer chunkSize = calendarsPerQueue == null || calendarsPerQueue <= 0
                ? DEFAULT_CALENDARS_PER_QUEUE
                : calendarsPerQueue;
            Integer endIndex = Math.min(startIndex + chunkSize, calendarIds.size());

            List<Id> currentIds = new List<Id>();
            for (Integer indexValue = startIndex; indexValue < endIndex; indexValue++) {
                currentIds.add(calendarIds[indexValue]);
            }

            Datetime startValue = System.now().addDays(-(pastDays == null ? DEFAULT_PAST_DAYS : pastDays));
            Datetime endValue = System.now().addDays(futureDays == null ? DEFAULT_FUTURE_DAYS : futureDays);
            List<String> errors = new List<String>();

            for (Team_Calendar__c calendarRow : [
                SELECT Id, Name, Google_Calendar_Id__c, Google_Import_Calendar_Ids__c
                FROM Team_Calendar__c
                WHERE Id IN :currentIds
                ORDER BY Name, Id
            ]) {
                if (runImports == true && String.isNotBlank(calendarRow.Google_Import_Calendar_Ids__c)) {
                    try {
                        GoogleCalendarSyncService.SyncResult importResult =
                            GoogleCalendarSyncService.importEventsFromGoogle(
                                calendarRow.Id,
                                startValue,
                                endValue
                            );
                        if (importResult.success != true) {
                            errors.add(calendarRow.Name + ' import: ' + importResult.message);
                        }
                    } catch (Exception ex) {
                        errors.add(calendarRow.Name + ' import: ' + ex.getMessage());
                    }
                }

                if (runExports == true && String.isNotBlank(calendarRow.Google_Calendar_Id__c)) {
                    try {
                        GoogleCalendarSyncService.SyncResult exportResult =
                            GoogleCalendarSyncService.pushChangedEventsForCalendar(
                                calendarRow.Id,
                                startValue,
                                endValue
                            );
                        if (exportResult.success != true) {
                            errors.add(calendarRow.Name + ' export: ' + exportResult.message);
                        }
                    } catch (Exception ex) {
                        errors.add(calendarRow.Name + ' export: ' + ex.getMessage());
                    }
                }
            }

            sendFailureNotification(errors);

            if (endIndex < calendarIds.size()) {
                System.enqueueJob(
                    new ScheduledSyncQueueable(
                        calendarIds,
                        endIndex,
                        runImports,
                        runExports,
                        pastDays,
                        futureDays,
                        calendarsPerQueue,
                        notificationEmail
                    )
                );
            }
        }

        private void sendFailureNotification(List<String> errors) {
            if (String.isBlank(notificationEmail) || errors == null || errors.isEmpty()) {
                return;
            }

            Messaging.SingleEmailMessage message = new Messaging.SingleEmailMessage();
            message.setToAddresses(new List<String>{ notificationEmail });
            message.setSubject('Team Calendar Google Sync failures');
            message.setPlainTextBody(
                'The scheduled Team Calendar Google sync reported one or more problems:\n\n' +
                String.join(errors, '\n')
            );
            Messaging.sendEmail(new Messaging.SingleEmailMessage[]{ message });
        }
    }
}