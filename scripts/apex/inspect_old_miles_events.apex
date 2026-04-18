List<Calendar_Event__c> rows = [
    SELECT Id, Name, OwnerId, CreatedById
    FROM Calendar_Event__c
    WHERE Id IN ('a1wVo000001nHVNIA2', 'a1wVo000001nFmvIAE')
    ORDER BY Name
];
System.debug(JSON.serializePretty(rows));