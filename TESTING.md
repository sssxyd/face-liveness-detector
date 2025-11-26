# Testing Guide for Face Liveness Detector

This guide explains how to set up, run, and write tests for the Face Detection Engine.

## Table of Contents

- [Quick Start](#quick-start)
- [Test Structure](#test-structure)
- [Running Tests](#running-tests)
- [Writing Tests](#writing-tests)
- [Testing Strategies](#testing-strategies)
- [Mocking](#mocking)
- [Coverage](#coverage)

## Quick Start

### Install Dependencies

```bash
npm install
```

This will install Jest and all testing dependencies configured in `package.json`.

### Run All Tests

```bash
npm test
```

### Run Tests in Watch Mode

```bash
npm run test:watch
```

### Generate Coverage Report

```bash
npm run test:coverage
```

## Test Structure

The project uses the following test structure:

```
src/
├── __tests__/
│   ├── config.test.ts           # Configuration tests
│   ├── enums.test.ts            # Enumeration tests
│   ├── event-emitter.test.ts    # Event emitter tests
│   └── face-detection-engine.test.ts  # Main engine tests
├── config.ts
├── enums.ts
├── event-emitter.ts
└── index.ts
```

### Test Naming Convention

- Test files should end with `.test.ts` or `.spec.ts`
- Test files should be in `__tests__` directory
- Each test file should correspond to a source file
- Test file name format: `<module>.test.ts`

## Running Tests

### Run All Tests

```bash
npm test
```

Output:
```
PASS  src/__tests__/config.test.ts
PASS  src/__tests__/enums.test.ts
PASS  src/__tests__/event-emitter.test.ts
PASS  src/__tests__/face-detection-engine.test.ts

Test Suites: 4 passed, 4 total
Tests:       50 passed, 50 total
```

### Run Tests in Watch Mode

Automatically re-run tests when files change:

```bash
npm run test:watch
```

### Run Specific Test File

```bash
npx jest src/__tests__/config.test.ts
```

### Run Specific Test Suite

```bash
npx jest -t "Configuration"
```

### Run Tests Matching Pattern

```bash
npx jest --testNamePattern="should merge"
```

### Run With Verbose Output

```bash
npx jest --verbose
```

### Generate Coverage Report

```bash
npm run test:coverage
```

This generates:
- Console summary
- HTML report in `./coverage/index.html`
- LCOV format for CI/CD integration

## Writing Tests

### Test File Template

```typescript
/**
 * Module description
 */

import { ModuleName } from '../module'

describe('Module Name', () => {
  let instance: ModuleName

  beforeEach(() => {
    instance = new ModuleName()
  })

  afterEach(() => {
    jest.clearAllMocks()
  })

  describe('Method Name', () => {
    it('should do something', () => {
      const result = instance.method()
      expect(result).toBe(expectedValue)
    })

    it('should handle edge cases', () => {
      const result = instance.method(null)
      expect(result).toThrow()
    })
  })
})
```

### Test Structure (AAA Pattern)

Each test should follow the Arrange-Act-Assert pattern:

```typescript
it('should update configuration', () => {
  // Arrange: Set up test data
  const config = { min_face_ratio: 0.7 }

  // Act: Perform the action
  engine.updateConfig(config)

  // Assert: Verify the result
  expect(engine.getConfig().min_face_ratio).toBe(0.7)
})
```

### Common Jest Assertions

```typescript
// Equality
expect(value).toBe(expected)
expect(obj).toEqual({ key: 'value' })

// Type checks
expect(value).toBeNull()
expect(value).toBeUndefined()
expect(value).toBeTruthy()
expect(value).toBeFalsy()

// Numbers
expect(num).toBeGreaterThan(5)
expect(num).toBeLessThanOrEqual(10)
expect(num).toBeCloseTo(0.3)

// Strings
expect(str).toContain('substring')
expect(str).toMatch(/regex/)

// Arrays
expect(arr).toHaveLength(3)
expect(arr).toContain(item)
expect(arr).toEqual([1, 2, 3])

// Functions
expect(fn).toHaveBeenCalled()
expect(fn).toHaveBeenCalledWith(arg1, arg2)
expect(fn).toHaveBeenCalledTimes(2)

// Promises
expect(promise).resolves.toBe(value)
expect(promise).rejects.toThrow()

// Negation
expect(value).not.toBe(other)
expect(arr).not.toContain(item)
```

## Testing Strategies

### 1. Unit Testing

Test individual functions and methods in isolation:

```typescript
describe('mergeConfig', () => {
  it('should merge partial config with defaults', () => {
    const userConfig = { min_face_ratio: 0.6 }
    const result = mergeConfig(userConfig)
    expect(result.min_face_ratio).toBe(0.6)
    expect(result.max_face_ratio).toBe(0.9) // default
  })
})
```

### 2. Integration Testing

Test how multiple components work together:

```typescript
describe('FaceDetectionEngine', () => {
  it('should emit events after initialization', async () => {
    const loadListener = jest.fn()
    engine.on('detector-loaded', loadListener)
    
    await engine.initialize()
    
    expect(loadListener).toHaveBeenCalled()
  })
})
```

### 3. Edge Case Testing

Test boundary conditions and error scenarios:

```typescript
it('should handle zero and false values', () => {
  const config = mergeConfig({
    detection_frame_delay: 0,
    video_mirror: false
  })
  
  expect(config.detection_frame_delay).toBe(0)
  expect(config.video_mirror).toBe(false)
})
```

### 4. Error Handling

Test error scenarios:

```typescript
it('should handle initialization errors', async () => {
  const error = new Error('Model loading failed')
  loadHuman.mockRejectedValueOnce(error)
  
  const errorListener = jest.fn()
  engine.on('detector-error', errorListener)
  
  await engine.initialize()
  
  expect(errorListener).toHaveBeenCalled()
})
```

## Mocking

### Mock External Dependencies

```typescript
// Mock library loader
jest.mock('../library-loader', () => ({
  loadOpenCV: jest.fn(() => Promise.resolve({
    cv: { getBuildInformation: jest.fn(() => '1.0.0') }
  })),
  loadHuman: jest.fn(() => Promise.resolve({
    version: '3.3.0',
    detect: jest.fn()
  }))
}))
```

### Mock Functions

```typescript
// Create mock function
const mockFn = jest.fn()

// Call mock
mockFn('arg1', 'arg2')

// Verify calls
expect(mockFn).toHaveBeenCalled()
expect(mockFn).toHaveBeenCalledWith('arg1', 'arg2')
expect(mockFn).toHaveBeenCalledTimes(1)

// Get call arguments
const args = mockFn.mock.calls[0]

// Return value
mockFn.mockReturnValue(42)
mockFn.mockResolvedValue({ success: true })
mockFn.mockRejectedValue(new Error('Failed'))
```

### Mock Browser APIs (in jest.setup.js)

```typescript
// Mock Canvas API
HTMLCanvasElement.prototype.getContext = jest.fn(() => ({
  drawImage: jest.fn(),
  fillRect: jest.fn(),
  // ... other methods
}))

// Mock Video API
Object.defineProperty(HTMLVideoElement.prototype, 'videoWidth', {
  get: jest.fn(() => 640)
})

// Mock getUserMedia
Object.defineProperty(navigator, 'mediaDevices', {
  value: {
    getUserMedia: jest.fn(() => Promise.resolve(mockStream))
  }
})
```

## Coverage

### Generate Coverage Report

```bash
npm run test:coverage
```

This creates an HTML coverage report in `./coverage/index.html`.

### Coverage Thresholds

Current configuration in `jest.config.js`:
- Lines: 80%
- Functions: 80%
- Branches: 80%
- Statements: 80%

To improve coverage:
1. Add tests for untested branches
2. Test error scenarios
3. Test edge cases
4. Mock external dependencies properly

### View Coverage Report

```bash
# macOS
open coverage/index.html

# Linux
xdg-open coverage/index.html

# Windows
start coverage/index.html
```

## Best Practices

1. **Test One Thing Per Test**
   ```typescript
   // ❌ Bad: Multiple assertions on different concepts
   it('should work', () => {
     expect(config.min_face_ratio).toBe(0.6)
     expect(config.max_face_ratio).toBe(0.8)
     expect(config.liveness_action_list.length).toBe(1)
   })

   // ✅ Good: Each test has one clear purpose
   it('should set min_face_ratio', () => {
     const config = mergeConfig({ min_face_ratio: 0.6 })
     expect(config.min_face_ratio).toBe(0.6)
   })
   ```

2. **Use Descriptive Test Names**
   ```typescript
   // ❌ Bad
   it('works', () => { ... })

   // ✅ Good
   it('should merge partial config with defaults', () => { ... })
   ```

3. **Test Behavior, Not Implementation**
   ```typescript
   // ❌ Bad: Testing internal state
   it('should set private property', () => {
     engine['private_property'] = value
     expect(engine['private_property']).toBe(value)
   })

   // ✅ Good: Testing public behavior
   it('should emit loaded event after initialization', async () => {
     const listener = jest.fn()
     engine.on('detector-loaded', listener)
     await engine.initialize()
     expect(listener).toHaveBeenCalled()
   })
   ```

4. **Setup and Teardown**
   ```typescript
   beforeEach(() => {
     // Run before each test
     engine = new FaceDetectionEngine()
   })

   afterEach(() => {
     // Run after each test
     jest.clearAllMocks()
     engine.stopDetection()
   })

   afterAll(() => {
     // Run once after all tests
     cleanupResources()
   })
   ```

5. **Use Test Utilities for Common Patterns**
   ```typescript
   // Create a test helper
   function createMockEngine(config?: Partial<FaceDetectionEngineConfig>) {
     return new FaceDetectionEngine(config)
   }

   // Use in tests
   it('should initialize', async () => {
     const engine = createMockEngine()
     await engine.initialize()
     expect(engine.getStatus().isReady).toBe(true)
   })
   ```

## Continuous Integration

### GitHub Actions Example

Create `.github/workflows/test.yml`:

```yaml
name: Tests

on: [push, pull_request]

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v2
      - uses: actions/setup-node@v2
        with:
          node-version: '16'
      - run: npm install
      - run: npm test
      - run: npm run test:coverage
```

## Troubleshooting

### Tests Hanging

Add timeout:
```typescript
it('should timeout', async () => {
  // ...
}, 10000) // 10 second timeout
```

### Mock Not Working

Clear module cache:
```typescript
beforeEach(() => {
  jest.resetModules()
  jest.clearAllMocks()
})
```

### Async Test Issues

Always return promises:
```typescript
it('should work', async () => {
  const result = await asyncFunction()
  expect(result).toBe(expected)
})

// Or use done callback
it('should work', (done) => {
  asyncFunction().then(result => {
    expect(result).toBe(expected)
    done()
  })
})
```

## Resources

- [Jest Documentation](https://jestjs.io/docs/getting-started)
- [Jest API Reference](https://jestjs.io/docs/api)
- [Testing Library](https://testing-library.com/)
- [TypeScript Jest Setup](https://jestjs.io/docs/getting-started#using-typescript)

## Adding More Tests

To add tests for additional modules:

1. Create a test file: `src/__tests__/<module>.test.ts`
2. Import the module to test
3. Write test cases following the AAA pattern
4. Run `npm test` to verify
5. Aim for >80% coverage

Example for a new module:

```typescript
import { NewModule } from '../new-module'

describe('NewModule', () => {
  let instance: NewModule

  beforeEach(() => {
    instance = new NewModule()
  })

  it('should initialize', () => {
    expect(instance).toBeDefined()
  })

  it('should do something', () => {
    const result = instance.doSomething()
    expect(result).toBeDefined()
  })
})
```

---

Happy testing! 🎉
