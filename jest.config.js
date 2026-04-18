const { jestConfig } = require('@salesforce/sfdx-lwc-jest/config');

module.exports = {
    ...jestConfig,
    moduleNameMapper: {
        ...jestConfig.moduleNameMapper,
        '^lightning/recordPicker$': '<rootDir>/force-app/test/jest-mocks/lightning/recordPicker'
    },
    modulePathIgnorePatterns: ['<rootDir>/.localdevserver']
};
