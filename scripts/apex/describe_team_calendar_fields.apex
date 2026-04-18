Map<String, Schema.SObjectField> fieldsMap = Schema.getGlobalDescribe().get('Team_Calendar__c').getDescribe().fields.getMap();
List<String> names = new List<String>(fieldsMap.keySet());
names.sort();
System.debug(JSON.serialize(names));