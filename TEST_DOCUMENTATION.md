# NCT Rental System - Comprehensive Testing Documentation

## Table of Contents
1. [Overview](#overview)
2. [Test Structure](#test-structure)
3. [Running Tests](#running-tests)
4. [Backend Testing (Java/Spring Boot)](#backend-testing)
5. [Frontend Testing (React/TypeScript)](#frontend-testing)
6. [Test Coverage](#test-coverage)
7. [CI/CD Integration](#cicd-integration)
8. [Best Practices](#best-practices)
9. [Troubleshooting](#troubleshooting)

---

## Overview

This document provides comprehensive guidance on the testing infrastructure for the NCT Rental System. The testing suite is designed to ensure system reliability, catch bugs early, and maintain code quality as the system evolves.

### Testing Philosophy
- **Test-Driven Development (TDD)**: Write tests before implementing features
- **Comprehensive Coverage**: Aim for 80%+ code coverage across the codebase
- **Critical Path Focus**: 100% coverage for mission-critical operations
- **Fast Feedback**: Tests should run quickly to enable rapid development
- **Isolated Tests**: Each test should be independent and repeatable

### Test Types
- **Unit Tests**: Test individual components and functions in isolation
- **Integration Tests**: Test interactions between multiple components
- **End-to-End Tests**: Test complete user workflows
- **Performance Tests**: Ensure system performance under load

---

## Test Structure

### Backend Tests (Java)
```
car-rental-backend-java/src/test/java/com/carrental/backend/
├── service/
│   ├── ProfessionalEmailServiceTest.java
│   ├── FleetBalanceServiceTest.java
│   └── ...
├── controller/
│   ├── ReservationControllerTest.java
│   ├── UserControllerTest.java
│   └── ...
├── parser/
│   ├── XmlReservationParserTest.java
│   └── ...
├── integration/
│   ├── ReservationIntegrationTest.java
│   ├── EmailWorkflowIntegrationTest.java
│   └── ...
└── util/
    └── TestDataBuilder.java
```

### Frontend Tests (React/TypeScript)
```
__tests__/
├── components/
│   ├── ProfessionalFleetManagement.test.tsx
│   ├── ProfessionalUserManagement.test.tsx
│   ├── ProfessionalInvoiceGeneration.test.tsx
│   ├── ProfessionalUniversalExcelImport.test.tsx
│   ├── ProfessionalAdvancedXMLCRM.test.tsx
│   ├── ProfessionalEmailNotificationSystem.test.tsx
│   └── ...
├── services/
│   ├── reservationService.test.ts
│   ├── vehicleService.test.ts
│   └── ...
├── integration/
│   ├── reservationFlow.test.tsx
│   ├── checkoutFlow.test.tsx
│   └── ...
└── utils/
    ├── dateUtils.test.ts
    └── validationUtils.test.ts
```

---

## Running Tests

### Backend Tests (Maven)

#### Run All Tests
```bash
cd car-rental-backend-java
mvn clean test
```

#### Run Specific Test Class
```bash
mvn test -Dtest=ReservationControllerTest
```

#### Run Specific Test Method
```bash
mvn test -Dtest=ReservationControllerTest#shouldCreateReservationSuccessfully
```

#### Run with Coverage Report
```bash
mvn clean test jacoco:report
```

Coverage reports will be generated at:
- HTML: `target/site/jacoco/index.html`
- XML: `target/site/jacoco/jacoco.xml`

#### Run Integration Tests Only
```bash
mvn verify -DskipUnitTests
```

#### Run in Debug Mode
```bash
mvn test -Dmaven.surefire.debug
```
Then attach your IDE debugger to port 5005.

### Frontend Tests (Jest)

#### Run All Tests
```bash
npm test
```

#### Run Tests in Watch Mode
```bash
npm run test:watch
```

#### Run with Coverage
```bash
npm run test:coverage
```

Coverage reports will be generated at:
- HTML: `coverage/lcov-report/index.html`
- Summary: Terminal output

#### Run Specific Test File
```bash
npm test ProfessionalEmailNotificationSystem.test.tsx
```

#### Run Tests Matching Pattern
```bash
npm test -- --testNamePattern="should create reservation"
```

#### Run Tests in CI Mode
```bash
npm run test:ci
```

#### Update Snapshots
```bash
npm test -- -u
```

---

## Backend Testing

### Technologies Used
- **JUnit 5**: Testing framework
- **Mockito**: Mocking framework
- **Spring Boot Test**: Integration testing support
- **AssertJ**: Fluent assertions
- **H2 Database**: In-memory database for tests
- **XMLUnit**: XML comparison and validation
- **JaCoCo**: Code coverage reporting

### Test Examples

#### 1. Unit Test Example (Service Layer)
```java
@ExtendWith(MockitoExtension.class)
class ProfessionalEmailServiceTest {

    @Mock
    private EmailProvider primaryProvider;

    @InjectMocks
    private ProfessionalEmailService emailService;

    @Test
    @DisplayName("Should send email successfully with primary provider")
    void shouldSendEmailWithPrimaryProvider() throws Exception {
        // Arrange
        String to = "customer@example.com";
        String subject = "Test Email";
        String body = "Test Body";

        when(primaryProvider.sendEmail(to, subject, body, null)).thenReturn(true);

        // Act
        boolean result = emailService.sendEmail(to, subject, body);

        // Assert
        assertThat(result).isTrue();
        verify(primaryProvider, times(1)).sendEmail(to, subject, body, null);
    }
}
```

#### 2. Controller Test Example (MockMvc)
```java
@WebMvcTest(ReservationController.class)
class ReservationControllerTest {

    @Autowired
    private MockMvc mockMvc;

    @MockBean
    private ReservationRepository reservationRepository;

    @Test
    @WithMockUser
    @DisplayName("Should get all reservations successfully")
    void shouldGetAllReservationsSuccessfully() throws Exception {
        // Arrange
        List<Reservation> reservations = List.of(testReservation);
        when(reservationRepository.findAll()).thenReturn(reservations);

        // Act & Assert
        mockMvc.perform(get("/api/reservations"))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$", hasSize(1)))
            .andExpect(jsonPath("$[0].id").value("res-1"));
    }
}
```

#### 3. Integration Test Example
```java
@SpringBootTest
@AutoConfigureMockMvc
@Transactional
class ReservationIntegrationTest {

    @Autowired
    private MockMvc mockMvc;

    @Autowired
    private ReservationRepository reservationRepository;

    @Test
    @WithMockUser
    void shouldCompleteFullReservationLifecycle() throws Exception {
        // Create -> Confirm -> Pickup -> Return -> Complete
        // Full integration test spanning multiple operations
    }
}
```

### Testing Critical Paths

#### Email Service (100% Coverage Required)
- Email sending with all providers
- Failover between providers
- Retry logic with exponential backoff
- Rate limiting enforcement
- Queue management
- Template rendering
- Attachment validation
- Tracking pixel generation

#### Reservation Management (100% Coverage Required)
- Reservation creation with validation
- Date conflict detection
- Vehicle assignment
- Pricing calculations
- Status transitions
- Concurrent update handling

#### XML Parsing (100% Coverage Required)
- OTA XML format parsing
- Booking.com format parsing
- Expedia format parsing
- Error recovery mechanisms
- Namespace handling
- Invalid XML handling
- Batch processing

---

## Frontend Testing

### Technologies Used
- **Jest**: Testing framework
- **React Testing Library**: React component testing
- **Testing Library User Event**: User interaction simulation
- **Jest DOM**: Custom matchers for DOM testing
- **TypeScript**: Type-safe tests

### Test Examples

#### 1. Component Rendering Test
```typescript
describe('ProfessionalEmailNotificationSystem', () => {
  it('should render the component with main title', () => {
    render(
      <ProfessionalEmailNotificationSystem
        reservations={mockReservations}
        companyDetails={mockCompanyDetails}
        onSendEmail={mockOnSendEmail}
      />
    );

    expect(screen.getByText('Professional Email & Notification System')).toBeInTheDocument();
  });
});
```

#### 2. User Interaction Test
```typescript
it('should search templates by name', async () => {
  const user = userEvent.setup();
  render(<ProfessionalEmailNotificationSystem {...props} />);

  const searchInput = screen.getByPlaceholderText('Search templates...');
  await user.type(searchInput, 'Booking');

  expect(screen.getByText('Booking Confirmation')).toBeInTheDocument();
  expect(screen.queryByText('Thank You & Invoice')).not.toBeInTheDocument();
});
```

#### 3. Form Submission Test
```typescript
it('should create reservation on form submit', async () => {
  const user = userEvent.setup();
  const mockOnCreate = jest.fn();

  render(<ReservationForm onCreateReservation={mockOnCreate} />);

  await user.type(screen.getByLabelText(/customer name/i), 'John Doe');
  await user.type(screen.getByLabelText(/email/i), 'john@example.com');
  await user.click(screen.getByRole('button', { name: /create/i }));

  await waitFor(() => {
    expect(mockOnCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        personName: 'John Doe',
        customerEmail: 'john@example.com',
      })
    );
  });
});
```

#### 4. API Integration Test
```typescript
it('should fetch and display reservations', async () => {
  const mockReservations = [
    { id: '1', personName: 'John Doe' },
    { id: '2', personName: 'Jane Smith' },
  ];

  jest.spyOn(api, 'fetchReservations').mockResolvedValue(mockReservations);

  render(<ReservationList />);

  await waitFor(() => {
    expect(screen.getByText('John Doe')).toBeInTheDocument();
    expect(screen.getByText('Jane Smith')).toBeInTheDocument();
  });
});
```

### Testing Components

#### ProfessionalFleetManagement
- Vehicle CRUD operations
- Search and filtering functionality
- Sorting (by model, year, status, etc.)
- Bulk operations (delete, update status)
- PDF export generation
- Pagination

#### ProfessionalUserManagement
- User creation with validation
- Permissions management
- Status updates (active/inactive)
- Search functionality
- Role assignment

#### ProfessionalInvoiceGeneration
- Invoice creation from reservation
- Calculations (subtotal, tax, total)
- Currency conversion
- PDF generation
- Template selection
- Email invoice

#### ProfessionalUniversalExcelImport
- File upload validation
- Column auto-mapping
- Data validation
- Error handling and recovery
- Fuzzy matching algorithm
- Date format parsing
- Preview and confirmation

#### ProfessionalAdvancedXMLCRM
- XML feed parsing
- Channel management (Booking.com, Expedia, etc.)
- Webhook handling
- CRM operations
- Error handling
- Batch processing

#### ProfessionalEmailNotificationSystem
- Template management (CRUD)
- Trigger configuration
- Email queue monitoring
- Campaign creation
- Analytics display
- Template preview

---

## Test Coverage

### Coverage Goals

| Component Type | Minimum Coverage | Critical Path Coverage |
|---------------|------------------|------------------------|
| Services | 80% | 100% |
| Controllers | 75% | 100% |
| Repositories | 60% | 100% |
| Utilities | 85% | 100% |
| Components | 70% | 95% |
| Hooks | 80% | 100% |

### Critical Paths Requiring 100% Coverage

#### Backend
1. **Payment Processing**
   - Payment intent creation
   - Payment confirmation
   - Refund processing
   - Error handling

2. **Reservation Creation**
   - Input validation
   - Date conflict detection
   - Vehicle assignment
   - Status management
   - Email notifications

3. **Email Sending**
   - Provider selection
   - Failover logic
   - Retry mechanism
   - Queue management

4. **User Authentication**
   - Login flow
   - JWT generation
   - Token validation
   - Password hashing

5. **XML Parsing**
   - Format detection
   - Data extraction
   - Error recovery
   - Validation

#### Frontend
1. **Reservation Flow**
   - Form validation
   - Date selection
   - Vehicle selection
   - Payment processing
   - Confirmation

2. **User Authentication**
   - Login form
   - Session management
   - Protected routes
   - Token refresh

3. **Data Import**
   - File validation
   - Column mapping
   - Data parsing
   - Error handling

### Viewing Coverage Reports

#### Backend (JaCoCo)
```bash
mvn clean test jacoco:report
open target/site/jacoco/index.html
```

#### Frontend (Jest)
```bash
npm run test:coverage
open coverage/lcov-report/index.html
```

---

## CI/CD Integration

### GitHub Actions Example

Create `.github/workflows/test.yml`:

```yaml
name: Test Suite

on:
  push:
    branches: [ main, develop ]
  pull_request:
    branches: [ main, develop ]

jobs:
  backend-tests:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3

      - name: Set up JDK 17
        uses: actions/setup-java@v3
        with:
          java-version: '17'
          distribution: 'temurin'

      - name: Cache Maven packages
        uses: actions/cache@v3
        with:
          path: ~/.m2
          key: ${{ runner.os }}-m2-${{ hashFiles('**/pom.xml') }}
          restore-keys: ${{ runner.os }}-m2

      - name: Run tests
        run: cd car-rental-backend-java && mvn clean test jacoco:report

      - name: Upload coverage reports
        uses: codecov/codecov-action@v3
        with:
          files: ./car-rental-backend-java/target/site/jacoco/jacoco.xml
          flags: backend

  frontend-tests:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3

      - name: Set up Node.js
        uses: actions/setup-node@v3
        with:
          node-version: '18'
          cache: 'npm'

      - name: Install dependencies
        run: npm ci

      - name: Run tests
        run: npm run test:ci

      - name: Upload coverage reports
        uses: codecov/codecov-action@v3
        with:
          files: ./coverage/lcov.info
          flags: frontend
```

### Jenkins Pipeline Example

```groovy
pipeline {
    agent any

    stages {
        stage('Backend Tests') {
            steps {
                dir('car-rental-backend-java') {
                    sh 'mvn clean test jacoco:report'
                }
            }
            post {
                always {
                    junit '**/target/surefire-reports/*.xml'
                    jacoco execPattern: '**/target/jacoco.exec'
                }
            }
        }

        stage('Frontend Tests') {
            steps {
                sh 'npm ci'
                sh 'npm run test:ci'
            }
            post {
                always {
                    junit '**/junit.xml'
                    publishHTML([
                        reportDir: 'coverage/lcov-report',
                        reportFiles: 'index.html',
                        reportName: 'Coverage Report'
                    ])
                }
            }
        }
    }
}
```

---

## Best Practices

### General Testing Principles

1. **Test Naming**
   - Use descriptive names: `shouldCreateReservationWhenValidDataProvided`
   - Follow pattern: `should_[expected behavior]_when_[condition]`
   - Use @DisplayName for readable test output

2. **Arrange-Act-Assert (AAA) Pattern**
   ```java
   @Test
   void testExample() {
       // Arrange - Set up test data and mocks
       String input = "test";
       when(mock.method()).thenReturn("result");

       // Act - Execute the code under test
       String result = service.process(input);

       // Assert - Verify the outcome
       assertThat(result).isEqualTo("expected");
   }
   ```

3. **Test Independence**
   - Each test should be runnable in isolation
   - Don't depend on test execution order
   - Clean up after tests (@AfterEach, @BeforeEach)

4. **Mocking Best Practices**
   - Mock external dependencies (APIs, databases)
   - Don't mock the class under test
   - Use real objects when possible for integration tests
   - Verify mock interactions when behavior matters

5. **Test Data Management**
   - Use test data builders for complex objects
   - Keep test data minimal and focused
   - Use constants for reusable test data
   - Consider using @ParameterizedTest for multiple scenarios

6. **Assertion Best Practices**
   - Use specific assertions (not just assertTrue/assertFalse)
   - Include failure messages
   - Test one concept per test
   - Use AssertJ for fluent, readable assertions

### Backend-Specific Best Practices

1. **Use @DataJpaTest for repository tests**
   ```java
   @DataJpaTest
   class ReservationRepositoryTest {
       @Autowired
       private ReservationRepository repository;

       @Autowired
       private TestEntityManager entityManager;
   }
   ```

2. **Use @WebMvcTest for controller tests**
   ```java
   @WebMvcTest(ReservationController.class)
   class ReservationControllerTest {
       @Autowired
       private MockMvc mockMvc;
   }
   ```

3. **Use @SpringBootTest for integration tests**
   ```java
   @SpringBootTest
   @AutoConfigureMockMvc
   class ReservationIntegrationTest {
       // Full application context loaded
   }
   ```

4. **Test transactions**
   - Use @Transactional to rollback test data
   - Test optimistic locking scenarios
   - Verify database constraints

### Frontend-Specific Best Practices

1. **Query by accessibility attributes**
   ```typescript
   // Good
   screen.getByRole('button', { name: /submit/i });
   screen.getByLabelText(/email address/i);

   // Avoid
   screen.getByTestId('submit-button');
   screen.getByClassName('email-input');
   ```

2. **Wait for async operations**
   ```typescript
   await waitFor(() => {
       expect(screen.getByText('Success')).toBeInTheDocument();
   });
   ```

3. **Use userEvent over fireEvent**
   ```typescript
   const user = userEvent.setup();
   await user.click(button);
   await user.type(input, 'text');
   ```

4. **Mock API calls**
   ```typescript
   jest.spyOn(api, 'fetchData').mockResolvedValue(mockData);
   ```

---

## Troubleshooting

### Common Backend Issues

#### 1. Tests Failing Due to Database State
**Problem**: Tests pass individually but fail when run together
**Solution**:
- Add `@Transactional` to test class
- Use `@BeforeEach` to reset state
- Check for shared static state

#### 2. MockMvc 404 Errors
**Problem**: MockMvc returns 404 for valid endpoints
**Solution**:
- Verify @WebMvcTest includes correct controller
- Check security configuration
- Ensure proper request mapping paths

#### 3. Dependency Injection Failures
**Problem**: NullPointerException in tests
**Solution**:
- Add @ExtendWith(MockitoExtension.class) or @ExtendWith(SpringExtension.class)
- Use @InjectMocks and @Mock correctly
- Verify @Autowired fields in test

### Common Frontend Issues

#### 1. "Not wrapped in act(...)" Warning
**Problem**: State updates happening outside act()
**Solution**:
```typescript
await waitFor(() => {
    expect(screen.getByText('Updated')).toBeInTheDocument();
});
```

#### 2. Query Failures
**Problem**: Unable to find elements
**Solution**:
- Use `screen.debug()` to see current DOM
- Check for async operations (add waitFor)
- Verify element is visible (not hidden by CSS)

#### 3. Mock Not Working
**Problem**: Mock function not being called
**Solution**:
- Clear mocks between tests: `jest.clearAllMocks()`
- Verify module path in jest.mock()
- Check mock is properly imported

### Performance Issues

#### Slow Tests
**Backend**:
- Use @MockBean instead of real dependencies
- Limit @SpringBootTest usage
- Use test slices (@WebMvcTest, @DataJpaTest)

**Frontend**:
- Mock expensive operations
- Reduce unnecessary DOM renders
- Use `--maxWorkers=50%` in CI

---

## Additional Resources

### Documentation Links
- [JUnit 5 User Guide](https://junit.org/junit5/docs/current/user-guide/)
- [Mockito Documentation](https://javadoc.io/doc/org.mockito/mockito-core/latest/org/mockito/Mockito.html)
- [Spring Boot Testing](https://docs.spring.io/spring-boot/docs/current/reference/html/features.html#features.testing)
- [React Testing Library](https://testing-library.com/docs/react-testing-library/intro/)
- [Jest Documentation](https://jestjs.io/docs/getting-started)

### Code Coverage Tools
- [JaCoCo](https://www.jacoco.org/jacoco/)
- [Codecov](https://about.codecov.io/)
- [SonarQube](https://www.sonarqube.org/)

### Test Data Management
- [Test Data Builders](https://www.arhohuttunen.com/test-data-builders/)
- [Faker for Java](https://github.com/DiUS/java-faker)
- [Faker.js](https://fakerjs.dev/)

---

## Support

For questions or issues with the testing suite:
1. Check this documentation
2. Review existing tests for patterns
3. Check CI/CD logs for detailed error messages
4. Contact the development team

**Remember**: Good tests are an investment in code quality and developer productivity. Keep tests maintainable, readable, and focused!
