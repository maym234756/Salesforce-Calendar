const { jestConfig } = require('@salesforce/sfdx-lwc-jest/config');

module.exports = {
    ...jestConfig,
    moduleNameMapper: {
        ...jestConfig.moduleNameMapper,
        '^lightning/empApi$': '<rootDir>/force-app/test/jest-mocks/lightning/empApi',
        '^lightning/recordPicker$': '<rootDir>/force-app/test/jest-mocks/lightning/recordPicker'
    },
    modulePathIgnorePatterns: ['<rootDir>/.localdevserver']
};
