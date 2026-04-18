List<Calendar_Event__c> rows = [
    SELECT Id, Name, OwnerId, Owner.Name, CreatedById, CreatedBy.Name, Calendar__c, Calendar__r.Name, Calendar__r.OwnerId, Calendar__r.Owner.Name
    FROM Calendar_Event__c
    WHERE Id IN ('a1wVo000001nHVNIA2', 'a1wVo000001nFmvIAE')
    ORDER BY Name
];
System.debug(JSON.serializePretty(rows));