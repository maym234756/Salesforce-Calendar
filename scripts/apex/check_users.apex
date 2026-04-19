// Bulk fix: Enable showSelectUsersBox for ALL preference records that have it as false
List<Calendar_User_Preference__c> prefRows = [
    SELECT Id, Show_Select_Users_Box__c
    FROM Calendar_User_Preference__c
    WHERE Show_Select_Users_Box__c = false
];
System.debug('Records to fix: ' + prefRows.size());
for (Calendar_User_Preference__c row : prefRows) {
    row.Show_Select_Users_Box__c = true;
}
if (!prefRows.isEmpty()) {
    update prefRows;
    System.debug('Updated ' + prefRows.size() + ' records');
}
