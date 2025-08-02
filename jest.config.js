// jest.config.js
module.exports = {
  setupFiles: ["dotenv/config"],  // ===> laddar .env innan testerna körs
  preset: 'ts-jest',
  testEnvironment: 'node',
  roots: ['<rootDir>/tests'],              // Kör både unit & integration
  moduleFileExtensions: ['ts', 'js', 'json'],
  testMatch: ['**/*.test.ts'],             // Alla .test.ts
  moduleNameMapper: {
    '^src/(.*)$': '<rootDir>/src/$1'
  },
  transform: {
    // Använd ts-jest för .ts-filer, med config i tsconfig.json
    '^.+\\.ts$': ['ts-jest', { tsconfig: 'tsconfig.json' }]
  },
  forceExit: true                          // Tvinga Jest att avsluta även om handles är öppna
};
