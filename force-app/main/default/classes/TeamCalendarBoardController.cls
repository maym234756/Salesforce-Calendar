/**
 * @description       :
 * @author            : ChangeMeIn@UserSettingsUnder.SFDoc
 * @group             :
 * @last modified on  : 04-12-2026
 * @last modified by  : ChangeMeIn@UserSettingsUnder.SFDoc
**/
public with sharing class TeamCalendarBoardController {
    public class CalendarOptionDTO {
        @AuraEnabled public Id id;
        @AuraEnabled public String name;
        @AuraEnabled public String color;
        @AuraEnabled public Id ownerId;
        @AuraEnabled public Id assignedUserId;
        @AuraEnabled public String sourceScope;
        @AuraEnabled public Boolean isDisplayed;
        @AuraEnabled public Boolean canCreate;
        @AuraEnabled public Boolean canEdit;
        @AuraEnabled public String sobjectType;
        @AuraEnabled public String startField;
        @AuraEnabled public String endField;
        @AuraEnabled public String displayField;
        @AuraEnabled public Id listViewFilterId;
        @AuraEnabled public String listViewApiName;
        @AuraEnabled public String listViewObjectApiName;
    }

    public class UserOptionDTO {
        @AuraEnabled public Id id;
        @AuraEnabled public String label;
        @AuraEnabled public String name;
        @AuraEnabled public String username;
    }

    public class CalendarEventDTO {
        @AuraEnabled public Id id;
        @AuraEnabled public String name;
        @AuraEnabled public Id ownerId;
        @AuraEnabled public String ownerName;
        @AuraEnabled public Datetime start;
        @AuraEnabled public Datetime endDateTime;
        @AuraEnabled public Boolean allDay;
        @AuraEnabled public String status;
        @AuraEnabled public String notes;
        @AuraEnabled public Id calendarId;
        @AuraEnabled public String calendarName;
        @AuraEnabled public String calendarColor;
        @AuraEnabled public String externalEventId;
        @AuraEnabled public String syncStatus;
        @AuraEnabled public String syncError;
        @AuraEnabled public Datetime lastSyncedAt;
    }

    @AuraEnabled(cacheable=true)
    public static List<CalendarOptionDTO> getCalendars() {
        List<CalendarOptionDTO> rows = new List<CalendarOptionDTO>();

        for (Team_Calendar__c calendarRow : [
            SELECT Id, Name, OwnerId, Color__c, Is_Active__c
            FROM Team_Calendar__c
            WHERE Is_Active__c = true
            ORDER BY Name
        ]) {
            rows.add(toTeamCalendarOption(calendarRow, 'Team'));
        }

        rows.addAll(loadCurrentUserCalendarViewOptions());
        return rows;
    }

    @AuraEnabled(cacheable=true)
    public static List<UserOptionDTO> getActiveUsers() {
        List<UserOptionDTO> rows = new List<UserOptionDTO>();
        Set<Id> allowedSelectedUserIds =
            TeamCalendarUserPreferenceService.getAllowedSelectedUserIdsForCurrentUser();
        Id runningUserId = UserInfo.getUserId();

        for (User userRow : [
            SELECT Id, Name, Username
            FROM User
            WHERE IsActive = true
            AND UserType = 'Standard'
            ORDER BY Name
            LIMIT 500
        ]) {
            if (
                allowedSelectedUserIds != null &&
                userRow.Id != runningUserId &&
                !allowedSelectedUserIds.contains(userRow.Id)
            ) {
                continue;
            }

            UserOptionDTO dto = new UserOptionDTO();
            dto.id = userRow.Id;
            dto.label = userRow.Name;
            dto.name = userRow.Name;
            dto.username = userRow.Username;
            rows.add(dto);
        }

        return rows;
    }

    @AuraEnabled(cacheable=true)
    public static List<CalendarOptionDTO> getUserCalendars(List<String> selectedUserIds) {
        Set<Id> scopedUserIds = toIdSet(selectedUserIds);
        if (scopedUserIds.isEmpty()) {
            return new List<CalendarOptionDTO>();
        }

        Map<String, CalendarOptionDTO> rowsByKey = new Map<String, CalendarOptionDTO>();

        for (Team_Calendar__c calendarRow : [
            SELECT Id, Name, OwnerId, Color__c, Is_Active__c
            FROM Team_Calendar__c
            WHERE Is_Active__c = true
            AND OwnerId IN :scopedUserIds
            ORDER BY OwnerId, Name
        ]) {
            CalendarOptionDTO dto = toTeamCalendarOption(calendarRow, 'Assigned User');
            rowsByKey.put(buildAssignmentKey(dto.assignedUserId, dto.id), dto);
        }

        for (CalendarOptionDTO dto : loadOwnedCalendarViewOptions(scopedUserIds)) {
            rowsByKey.put(buildAssignmentKey(dto.assignedUserId, dto.id), dto);
        }

        for (CalendarOptionDTO dto : loadSharedCalendarViewOptionsForTargets(scopedUserIds)) {
            rowsByKey.put(buildAssignmentKey(dto.assignedUserId, dto.id), dto);
        }

        return new List<CalendarOptionDTO>(rowsByKey.values());
    }

    @AuraEnabled(cacheable=true)
    public static List<CalendarEventDTO> getEventsForRange(
        String startDate,
        String endDate,
        String calendarId,
        String statusFilter,
        List<String> selectedUserIds,
        String userCalendarSelectionJson
    ) {
        if (String.isBlank(startDate)) {
            throw new AuraHandledException('A start date is required.');
        }

        if (String.isBlank(endDate)) {
            throw new AuraHandledException('An end date is required.');
        }

        Date startValue = Date.valueOf(startDate);
        Date endValue = Date.valueOf(endDate);

        Datetime rangeStart = Datetime.newInstance(
            startValue,
            Time.newInstance(0, 0, 0, 0)
        );
        Datetime rangeEndExclusive = Datetime.newInstance(
            endValue.addDays(1),
            Time.newInstance(0, 0, 0, 0)
        );

        Set<Id> scopedUserIds = toIdSet(selectedUserIds);
        Map<String, Set<String>> perUserCalendarSelections =
            parseUserCalendarSelectionJson(userCalendarSelectionJson);

        Id resolvedCalendarId = String.isNotBlank(calendarId) ? (Id) calendarId : null;
        String resolvedStatusFilter = String.isNotBlank(statusFilter) ? statusFilter : null;

        String soql =
            'SELECT Id, Name, OwnerId, Owner.Name, Calendar__c, Calendar__r.Name, ' +
            'Calendar__r.Color__c, Calendar__r.OwnerId, Start__c, End__c, All_Day__c, Status__c, Notes__c, Private_To_Owner__c ' +
            'FROM Calendar_Event__c ' +
            'WHERE Start__c < :rangeEndExclusive ' +
            'AND (End__c = null OR End__c >= :rangeStart)';

        if (resolvedCalendarId != null) {
            soql += ' AND Calendar__c = :resolvedCalendarId';
        }

        if (resolvedStatusFilter != null) {
            soql += ' AND Status__c = :resolvedStatusFilter';
        }

        soql += ' ORDER BY Start__c, Name LIMIT 10000';

        List<CalendarEventDTO> rows = new List<CalendarEventDTO>();

        for (Calendar_Event__c eventRow : Database.query(soql)) {
            if (
                eventRow.Private_To_Owner__c == true &&
                eventRow.OwnerId != UserInfo.getUserId()
            ) {
                continue;
            }

            Id calendarOwnerId =
                eventRow.Calendar__r != null ? eventRow.Calendar__r.OwnerId : null;

            if (!scopedUserIds.isEmpty()) {
                Boolean matchesScopedUser =
                    scopedUserIds.contains(eventRow.OwnerId) ||
                    (calendarOwnerId != null && scopedUserIds.contains(calendarOwnerId));

                if (!matchesScopedUser) {
                    continue;
                }
            }

            Id matchedUserId = calendarOwnerId != null ? calendarOwnerId : eventRow.OwnerId;
            if (matchedUserId != null) {
                Set<String> selectedCalendarNames =
                    perUserCalendarSelections.get(String.valueOf(matchedUserId));

                if (
                    selectedCalendarNames != null &&
                    !selectedCalendarNames.isEmpty() &&
                    !selectedCalendarNames.contains(
                        eventRow.Calendar__r != null ? eventRow.Calendar__r.Name : null
                    )
                ) {
                    continue;
                }
            }

            CalendarEventDTO dto = new CalendarEventDTO();
            dto.id = eventRow.Id;
            dto.name = eventRow.Name;
            dto.ownerId = eventRow.OwnerId;
            dto.ownerName = eventRow.Owner != null ? eventRow.Owner.Name : null;
            dto.start = eventRow.Start__c;
            dto.endDateTime = eventRow.End__c;
            dto.allDay = eventRow.All_Day__c;
            dto.status = eventRow.Status__c;
            dto.notes = eventRow.Notes__c;
            dto.calendarId = eventRow.Calendar__c;
            dto.calendarName =
                eventRow.Calendar__r != null ? eventRow.Calendar__r.Name : null;
            dto.calendarColor =
                eventRow.Calendar__r != null ? eventRow.Calendar__r.Color__c : null;
            dto.externalEventId = null;
            dto.syncStatus = null;
            dto.syncError = null;
            dto.lastSyncedAt = null;
            rows.add(dto);
        }

        return rows;
    }

    @AuraEnabled(cacheable=true)
    public static String getPdfExportPageUrl() {
        String pagePath = Page.TeamCalendarPdfExport.getUrl();
        String orgDomain = URL.getOrgDomainUrl().toExternalForm();

        if (String.isBlank(orgDomain)) {
            return pagePath;
        }

        if (orgDomain.contains('.sandbox.my.salesforce.com')) {
            return orgDomain.replace('.sandbox.my.salesforce.com', '--c.vf.force.com') + pagePath;
        }

        if (orgDomain.contains('.my.salesforce.com')) {
            return orgDomain.replace('.my.salesforce.com', '--c.vf.force.com') + pagePath;
        }

        if (orgDomain.contains('.lightning.force.com')) {
            return orgDomain.replace('.lightning.force.com', '--c.vf.force.com') + pagePath;
        }

        return pagePath;
    }

    private static List<CalendarOptionDTO> loadCurrentUserCalendarViewOptions() {
        Id runningUserId = UserInfo.getUserId();
        Boolean allowAllCalendarViews =
            TeamCalendarUserPreferenceService.isSecurityAdmin(runningUserId);

        CalendarViewAccessGateway gateway = new CalendarViewAccessGateway();
        Set<Id> accessibleCalendarViewIds = allowAllCalendarViews
            ? new Set<Id>()
            : gateway.getAccessibleCalendarViewIds(runningUserId);

        List<CalendarView> calendarViewRows = gateway.loadCalendarViewsForCurrentUser(
            runningUserId,
            allowAllCalendarViews,
            accessibleCalendarViewIds
        );

        Map<Id, Calendar_Access_Rule__c> accessRulesByCalendarViewId =
            loadAccessRulesByCalendarViewId(calendarViewRows, runningUserId, allowAllCalendarViews);

        return toCalendarViewOptions(
            calendarViewRows,
            null,
            'Calendar View',
            accessRulesByCalendarViewId,
            runningUserId,
            allowAllCalendarViews
        );
    }

    private static List<CalendarOptionDTO> loadOwnedCalendarViewOptions(Set<Id> ownerIds) {
        if (ownerIds == null || ownerIds.isEmpty()) {
            return new List<CalendarOptionDTO>();
        }

        Id runningUserId = UserInfo.getUserId();
        Boolean allowAllCalendarViews =
            TeamCalendarUserPreferenceService.isSecurityAdmin(runningUserId);
        CalendarViewAccessGateway gateway = new CalendarViewAccessGateway();
        List<CalendarView> calendarViewRows = gateway.loadCalendarViewsByOwners(ownerIds);

        Map<Id, Calendar_Access_Rule__c> accessRulesByCalendarViewId =
            loadAccessRulesByCalendarViewId(calendarViewRows, runningUserId, allowAllCalendarViews);

        return toCalendarViewOptions(
            calendarViewRows,
            null,
            'Calendar View',
            accessRulesByCalendarViewId,
            runningUserId,
            allowAllCalendarViews
        );
    }

    private static List<CalendarOptionDTO> loadSharedCalendarViewOptionsForTargets(Set<Id> targetUserIds) {
        if (targetUserIds == null || targetUserIds.isEmpty()) {
            return new List<CalendarOptionDTO>();
        }

        Id runningUserId = UserInfo.getUserId();
        Boolean allowAllCalendarViews =
            TeamCalendarUserPreferenceService.isSecurityAdmin(runningUserId);
        CalendarViewAccessGateway gateway = new CalendarViewAccessGateway();
        Map<Id, Set<Id>> viewIdsByTargetUser =
            gateway.getSharedCalendarViewIdsByTargetUser(targetUserIds);

        Set<Id> allCalendarViewIds = new Set<Id>();
        for (Id targetUserId : viewIdsByTargetUser.keySet()) {
            allCalendarViewIds.addAll(viewIdsByTargetUser.get(targetUserId));
        }

        if (allCalendarViewIds.isEmpty()) {
            return new List<CalendarOptionDTO>();
        }

        List<CalendarView> calendarViewRows = gateway.loadCalendarViewsByIds(allCalendarViewIds);
        Map<Id, CalendarView> calendarViewsById = new Map<Id, CalendarView>(calendarViewRows);
        Map<Id, Calendar_Access_Rule__c> accessRulesByCalendarViewId =
            loadAccessRulesByCalendarViewId(calendarViewRows, runningUserId, allowAllCalendarViews);

        Set<Id> listViewIds = new Set<Id>();
        for (CalendarView calendarViewRow : calendarViewRows) {
            if (calendarViewRow.ListViewFilterId != null) {
                listViewIds.add(calendarViewRow.ListViewFilterId);
            }
        }

        Map<Id, ListView> listViewsById = loadListViewsById(listViewIds);

        List<CalendarOptionDTO> rows = new List<CalendarOptionDTO>();
        Set<String> addedKeys = new Set<String>();

        for (Id targetUserId : viewIdsByTargetUser.keySet()) {
            for (Id calendarViewId : viewIdsByTargetUser.get(targetUserId)) {
                CalendarView calendarViewRow = calendarViewsById.get(calendarViewId);
                if (calendarViewRow == null) {
                    continue;
                }

                String rowKey = buildAssignmentKey(targetUserId, calendarViewId);
                if (addedKeys.contains(rowKey)) {
                    continue;
                }
                addedKeys.add(rowKey);

                ListView matchedListView =
                    calendarViewRow.ListViewFilterId != null
                        ? listViewsById.get(calendarViewRow.ListViewFilterId)
                        : null;

                rows.add(
                    toCalendarViewOption(
                        calendarViewRow,
                        matchedListView,
                        targetUserId,
                        'Shared Calendar View',
                        accessRulesByCalendarViewId,
                        runningUserId,
                        allowAllCalendarViews
                    )
                );
            }
        }

        return rows;
    }

    private static List<CalendarOptionDTO> toCalendarViewOptions(
        List<CalendarView> calendarViewRows,
        Id forcedAssignedUserId,
        String sourceScope,
        Map<Id, Calendar_Access_Rule__c> accessRulesByCalendarViewId,
        Id runningUserId,
        Boolean allowAllCalendarViews
    ) {
        if (calendarViewRows == null || calendarViewRows.isEmpty()) {
            return new List<CalendarOptionDTO>();
        }

        Set<Id> listViewIds = new Set<Id>();
        for (CalendarView calendarViewRow : calendarViewRows) {
            if (calendarViewRow.ListViewFilterId != null) {
                listViewIds.add(calendarViewRow.ListViewFilterId);
            }
        }

        Map<Id, ListView> listViewsById = loadListViewsById(listViewIds);

        List<CalendarOptionDTO> rows = new List<CalendarOptionDTO>();
        Set<String> addedKeys = new Set<String>();

        for (CalendarView calendarViewRow : calendarViewRows) {
            if (calendarViewRow == null) {
                continue;
            }

            Id assignedUserId =
                forcedAssignedUserId != null ? forcedAssignedUserId : calendarViewRow.OwnerId;
            String rowKey = buildAssignmentKey(assignedUserId, calendarViewRow.Id);

            if (addedKeys.contains(rowKey)) {
                continue;
            }
            addedKeys.add(rowKey);

            ListView matchedListView =
                calendarViewRow.ListViewFilterId != null
                    ? listViewsById.get(calendarViewRow.ListViewFilterId)
                    : null;

            rows.add(
                toCalendarViewOption(
                    calendarViewRow,
                    matchedListView,
                    assignedUserId,
                    sourceScope,
                    accessRulesByCalendarViewId,
                    runningUserId,
                    allowAllCalendarViews
                )
            );
        }

        return rows;
    }

    private static CalendarOptionDTO toCalendarViewOption(
        CalendarView calendarViewRow,
        ListView matchedListView,
        Id assignedUserId,
        String sourceScope,
        Map<Id, Calendar_Access_Rule__c> accessRulesByCalendarViewId,
        Id runningUserId,
        Boolean allowAllCalendarViews
    ) {
        CalendarOptionDTO dto = new CalendarOptionDTO();
        Calendar_Access_Rule__c accessRule =
            accessRulesByCalendarViewId != null
                ? accessRulesByCalendarViewId.get(calendarViewRow.Id)
                : null;
        Boolean hasOwnerAccess = runningUserId != null && calendarViewRow.OwnerId == runningUserId;
        Boolean hasFullAccess = allowAllCalendarViews == true || hasOwnerAccess;

        dto.id = calendarViewRow.Id;
        dto.name = calendarViewRow.Name;
        dto.color = '#706e6b';
        dto.ownerId = calendarViewRow.OwnerId;
        dto.assignedUserId = assignedUserId;
        dto.sourceScope = sourceScope;
        dto.isDisplayed = calendarViewRow.IsDisplayed;
        dto.canCreate = hasFullAccess || (accessRule != null && accessRule.Can_Create__c == true);
        dto.canEdit = hasFullAccess || (accessRule != null && accessRule.Can_Edit__c == true);
        dto.sobjectType =
            matchedListView != null ? matchedListView.SobjectType : null;
        dto.startField = calendarViewRow.StartField;
        dto.endField = calendarViewRow.EndField;
        dto.displayField = calendarViewRow.DisplayField;
        dto.listViewFilterId = calendarViewRow.ListViewFilterId;
        dto.listViewApiName =
            matchedListView != null ? matchedListView.DeveloperName : null;
        dto.listViewObjectApiName =
            matchedListView != null ? matchedListView.SobjectType : null;
        return dto;
    }

    private static Map<Id, Calendar_Access_Rule__c> loadAccessRulesByCalendarViewId(
        List<CalendarView> calendarViewRows,
        Id targetUserId,
        Boolean allowAllCalendarViews
    ) {
        Map<Id, Calendar_Access_Rule__c> results = new Map<Id, Calendar_Access_Rule__c>();

        if (allowAllCalendarViews == true || targetUserId == null || calendarViewRows == null || calendarViewRows.isEmpty()) {
            return results;
        }

        Set<String> calendarViewIdStrings = new Set<String>();
        for (CalendarView calendarViewRow : calendarViewRows) {
            if (calendarViewRow != null && calendarViewRow.Id != null) {
                calendarViewIdStrings.add(String.valueOf(calendarViewRow.Id));
            }
        }

        if (calendarViewIdStrings.isEmpty()) {
            return results;
        }

        for (Calendar_Access_Rule__c ruleRow : [
            SELECT Calendar_View_Id__c,
                   Can_View__c,
                   Can_Create__c,
                   Can_Edit__c,
                   Can_Delete__c
            FROM Calendar_Access_Rule__c
            WHERE Target_User__c = :targetUserId
            AND Is_Active__c = true
            AND Calendar_View_Id__c IN :calendarViewIdStrings
        ]) {
            if (String.isBlank(ruleRow.Calendar_View_Id__c)) {
                continue;
            }

            try {
                results.put((Id) ruleRow.Calendar_View_Id__c, ruleRow);
            } catch (Exception ex) {
                // Ignore malformed ids stored in custom text fields.
            }
        }

        return results;
    }

    private static Map<Id, ListView> loadListViewsById(Set<Id> listViewIds) {
        if (listViewIds == null || listViewIds.isEmpty()) {
            return new Map<Id, ListView>();
        }

        return new Map<Id, ListView>([
            SELECT Id, DeveloperName, SobjectType
            FROM ListView
            WHERE Id IN :listViewIds
        ]);
    }

    private static CalendarOptionDTO toTeamCalendarOption(
        Team_Calendar__c calendarRow,
        String scopeLabel
    ) {
        CalendarOptionDTO dto = new CalendarOptionDTO();
        dto.id = calendarRow.Id;
        dto.name = calendarRow.Name;
        dto.color = calendarRow.Color__c;
        dto.ownerId = calendarRow.OwnerId;
        dto.assignedUserId = calendarRow.OwnerId;
        dto.sourceScope = scopeLabel;
        dto.isDisplayed = true;
        dto.canCreate = true;
        dto.canEdit = true;
        dto.sobjectType = 'Calendar_Event__c';
        dto.startField = null;
        dto.endField = null;
        dto.displayField = null;
        dto.listViewFilterId = null;
        dto.listViewApiName = null;
        dto.listViewObjectApiName = null;
        return dto;
    }

    private static String buildAssignmentKey(Id assignedUserId, Id calendarId) {
        return String.valueOf(assignedUserId) + '::' + String.valueOf(calendarId);
    }

    private without sharing class CalendarViewAccessGateway {
        public Set<Id> getAccessibleCalendarViewIds(Id targetUserId) {
            Set<Id> results = new Set<Id>();

            if (targetUserId == null) {
                return results;
            }

            for (Calendar_Access_Rule__c ruleRow : [
                SELECT Calendar_View_Id__c
                FROM Calendar_Access_Rule__c
                WHERE Target_User__c = :targetUserId
                AND Is_Active__c = true
                AND Can_View__c = true
            ]) {
                if (String.isBlank(ruleRow.Calendar_View_Id__c)) {
                    continue;
                }

                try {
                    results.add((Id) ruleRow.Calendar_View_Id__c);
                } catch (Exception ex) {
                    // Ignore malformed ids stored in custom text fields.
                }
            }

            return results;
        }

        public Map<Id, Set<Id>> getSharedCalendarViewIdsByTargetUser(Set<Id> targetUserIds) {
            Map<Id, Set<Id>> results = new Map<Id, Set<Id>>();

            if (targetUserIds == null || targetUserIds.isEmpty()) {
                return results;
            }

            for (Calendar_Access_Rule__c ruleRow : [
                SELECT Target_User__c, Calendar_View_Id__c
                FROM Calendar_Access_Rule__c
                WHERE Target_User__c IN :targetUserIds
                AND Is_Active__c = true
                AND Can_View__c = true
            ]) {
                if (ruleRow.Target_User__c == null || String.isBlank(ruleRow.Calendar_View_Id__c)) {
                    continue;
                }

                Id calendarViewId;
                try {
                    calendarViewId = (Id) ruleRow.Calendar_View_Id__c;
                } catch (Exception ex) {
                    continue;
                }

                if (!results.containsKey(ruleRow.Target_User__c)) {
                    results.put(ruleRow.Target_User__c, new Set<Id>());
                }

                results.get(ruleRow.Target_User__c).add(calendarViewId);
            }

            return results;
        }

        public List<CalendarView> loadCalendarViewsForCurrentUser(
            Id runningUserId,
            Boolean allowAllCalendarViews,
            Set<Id> accessibleCalendarViewIds
        ) {
            if (allowAllCalendarViews) {
                return [
                    SELECT Id,
                           Name,
                           OwnerId,
                           StartField,
                           EndField,
                           DisplayField,
                           ListViewFilterId,
                           IsDisplayed
                    FROM CalendarView
                    ORDER BY Name
                    LIMIT 500
                ];
            }

            if (accessibleCalendarViewIds == null || accessibleCalendarViewIds.isEmpty()) {
                return [
                    SELECT Id,
                           Name,
                           OwnerId,
                           StartField,
                           EndField,
                           DisplayField,
                           ListViewFilterId,
                           IsDisplayed
                    FROM CalendarView
                    WHERE OwnerId = :runningUserId
                    ORDER BY Name
                    LIMIT 500
                ];
            }

            return [
                SELECT Id,
                       Name,
                       OwnerId,
                       StartField,
                       EndField,
                       DisplayField,
                       ListViewFilterId,
                       IsDisplayed
                FROM CalendarView
                WHERE OwnerId = :runningUserId
                   OR Id IN :accessibleCalendarViewIds
                ORDER BY Name
                LIMIT 500
            ];
        }

        public List<CalendarView> loadCalendarViewsByOwners(Set<Id> ownerIds) {
            if (ownerIds == null || ownerIds.isEmpty()) {
                return new List<CalendarView>();
            }

            return [
                SELECT Id,
                       Name,
                       OwnerId,
                       StartField,
                       EndField,
                       DisplayField,
                       ListViewFilterId,
                       IsDisplayed
                FROM CalendarView
                WHERE OwnerId IN :ownerIds
                ORDER BY OwnerId, Name
                LIMIT 500
            ];
        }

        public List<CalendarView> loadCalendarViewsByIds(Set<Id> calendarViewIds) {
            if (calendarViewIds == null || calendarViewIds.isEmpty()) {
                return new List<CalendarView>();
            }

            return [
                SELECT Id,
                       Name,
                       OwnerId,
                       StartField,
                       EndField,
                       DisplayField,
                       ListViewFilterId,
                       IsDisplayed
                FROM CalendarView
                WHERE Id IN :calendarViewIds
                ORDER BY Name
                LIMIT 500
            ];
        }
    }

    private static Set<Id> toIdSet(List<String> rawValues) {
        Set<Id> results = new Set<Id>();

        if (rawValues == null) {
            return results;
        }

        for (String rawValue : rawValues) {
            if (String.isBlank(rawValue)) {
                continue;
            }

            try {
                results.add((Id) rawValue);
            } catch (Exception ex) {
                // Ignore non-id input safely.
            }
        }

        return results;
    }

    private static Map<String, Set<String>> parseUserCalendarSelectionJson(String rawJson) {
        Map<String, Set<String>> results = new Map<String, Set<String>>();

        if (String.isBlank(rawJson)) {
            return results;
        }

        Map<String, Object> parsedMap;
        try {
            parsedMap = (Map<String, Object>) JSON.deserializeUntyped(rawJson);
        } catch (Exception ex) {
            return results;
        }

        if (parsedMap == null) {
            return results;
        }

        for (String userId : parsedMap.keySet()) {
            Set<String> calendarNames = new Set<String>();
            List<Object> entries;

            try {
                entries = (List<Object>) parsedMap.get(userId);
            } catch (Exception ex) {
                entries = null;
            }

            if (entries != null) {
                for (Object entry : entries) {
                    if (entry != null) {
                        calendarNames.add(String.valueOf(entry));
                    }
                }
            }

            results.put(userId, calendarNames);
        }

        return results;
    }

    // ── Task-based CalendarView fallback (UI API does not support Task) ──

    public class TaskCalendarRequestDTO {
        @AuraEnabled public Id calendarViewId;
        @AuraEnabled public String calendarViewName;
        @AuraEnabled public String calendarViewColor;
        @AuraEnabled public Id ownerId;
        @AuraEnabled public String startField;
        @AuraEnabled public String displayField;
    }

    @AuraEnabled
    public static List<CalendarEventDTO> getTaskEventsForCalendarViews(
        String requestsJson,
        String startDate,
        String endDate
    ) {
        if (String.isBlank(requestsJson) || String.isBlank(startDate) || String.isBlank(endDate)) {
            return new List<CalendarEventDTO>();
        }

        List<TaskCalendarRequestDTO> requests;
        try {
            requests = (List<TaskCalendarRequestDTO>) JSON.deserialize(
                requestsJson, List<TaskCalendarRequestDTO>.class
            );
        } catch (Exception ex) {
            throw new AuraHandledException('Invalid task calendar request payload.');
        }

        if (requests == null || requests.isEmpty()) {
            return new List<CalendarEventDTO>();
        }

        Date startValue = Date.valueOf(startDate);
        Date endValue = Date.valueOf(endDate);
        Datetime rangeStart = Datetime.newInstance(startValue, Time.newInstance(0, 0, 0, 0));
        Datetime rangeEnd = Datetime.newInstance(endValue.addDays(1), Time.newInstance(0, 0, 0, 0));

        Set<Id> ownerIds = new Set<Id>();
        Map<Id, TaskCalendarRequestDTO> requestByOwner = new Map<Id, TaskCalendarRequestDTO>();
        for (TaskCalendarRequestDTO req : requests) {
            if (req.ownerId != null) {
                ownerIds.add(req.ownerId);
                requestByOwner.put(req.ownerId, req);
            }
        }

        if (ownerIds.isEmpty()) {
            return new List<CalendarEventDTO>();
        }

        List<CalendarEventDTO> rows = new List<CalendarEventDTO>();

        for (Task taskRow : [
            SELECT Id, Subject, OwnerId, Owner.Name, ActivityDate,
                   ReminderDateTime, Status, Priority, Activity_Type__c
            FROM Task
            WHERE OwnerId IN :ownerIds
            AND (
                (ReminderDateTime >= :rangeStart AND ReminderDateTime < :rangeEnd)
                OR (ActivityDate >= :startValue AND ActivityDate <= :endValue)
            )
            ORDER BY ReminderDateTime NULLS LAST, ActivityDate, Subject
            LIMIT 2000
        ]) {
            TaskCalendarRequestDTO matchedRequest = requestByOwner.get(taskRow.OwnerId);
            if (matchedRequest == null) { continue; }

            Boolean usesReminder = 'ReminderDateTime'.equalsIgnoreCase(matchedRequest.startField);
            Datetime effectiveStart;
            if (usesReminder && taskRow.ReminderDateTime != null) {
                effectiveStart = taskRow.ReminderDateTime;
            } else if (taskRow.ActivityDate != null) {
                effectiveStart = Datetime.newInstance(taskRow.ActivityDate, Time.newInstance(0, 0, 0, 0));
            } else {
                continue;
            }

            if (effectiveStart < rangeStart || effectiveStart >= rangeEnd) {
                continue;
            }

            String displayValue = taskRow.Subject;
            if ('Activity_Type__c'.equalsIgnoreCase(matchedRequest.displayField)) {
                displayValue = taskRow.Activity_Type__c != null
                    ? taskRow.Activity_Type__c
                    : taskRow.Subject;
            }

            CalendarEventDTO dto = new CalendarEventDTO();
            dto.id = taskRow.Id;
            dto.name = String.isNotBlank(displayValue) ? displayValue : 'Untitled Task';
            dto.ownerId = taskRow.OwnerId;
            dto.ownerName = taskRow.Owner.Name;
            dto.start = effectiveStart;
            dto.endDateTime = null;
            dto.allDay = !usesReminder || taskRow.ReminderDateTime == null;
            dto.status = taskRow.Status;
            dto.notes = matchedRequest.calendarViewName + ' • Task';
            dto.calendarId = matchedRequest.calendarViewId;
            dto.calendarName = matchedRequest.calendarViewName;
            dto.calendarColor = String.isNotBlank(matchedRequest.calendarViewColor)
                ? matchedRequest.calendarViewColor : '#706e6b';
            dto.externalEventId = null;
            dto.syncStatus = null;
            dto.syncError = null;
            dto.lastSyncedAt = null;
            rows.add(dto);
        }

        return rows;
    }
}
