@IsTest
public class TeamCalendarTestSecurityHelper {
    private static final String RUNTIME_ACCESS_PERMISSION_SET = 'TeamCalendarRuntimeAccess';

    public static User getCurrentUserWithRuntimeAccess() {
        User currentUser = [
            SELECT Id
            FROM User
            WHERE Id = :UserInfo.getUserId()
            LIMIT 1
        ];

        PermissionSet runtimeAccess = [
            SELECT Id
            FROM PermissionSet
            WHERE Name = :RUNTIME_ACCESS_PERMISSION_SET
            LIMIT 1
        ];

        List<PermissionSetAssignment> assignments = [
            SELECT Id
            FROM PermissionSetAssignment
            WHERE AssigneeId = :currentUser.Id
            AND PermissionSetId = :runtimeAccess.Id
            LIMIT 1
        ];

        if (assignments.isEmpty()) {
            insert new PermissionSetAssignment(
                AssigneeId = currentUser.Id,
                PermissionSetId = runtimeAccess.Id
            );
        }

        return currentUser;
    }
}