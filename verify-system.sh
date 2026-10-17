#!/bin/bash

# NCT Rental System Verification Script
# This script verifies that all critical files and configurations are present

echo "🔍 NCT Rental System Verification"
echo "=================================="
echo ""

ERRORS=0
WARNINGS=0

# Function to check file exists
check_file() {
    if [ -f "$1" ]; then
        echo "✅ $1"
    else
        echo "❌ MISSING: $1"
        ((ERRORS++))
    fi
}

# Function to check directory exists
check_dir() {
    if [ -d "$1" ]; then
        echo "✅ $1/"
    else
        echo "⚠️  MISSING DIR: $1/"
        ((WARNINGS++))
    fi
}

echo "📦 Core Files"
echo "-------------"
check_file "package.json"
check_file "vite.config.ts"
check_file "tsconfig.json"
check_file "tailwind.config.js"
check_file "index.html"
check_file "App.tsx"
echo ""

echo "📱 Mobile System"
echo "----------------"
check_file "components/MobileNavigation.tsx"
check_file "components/MobileDashboard.tsx"
check_file "components/MobileDataTable.tsx"
check_file "components/MobileFormComponents.tsx"
check_file "components/PWAInstallPrompt.tsx"
check_file "public/manifest.json"
check_file "public/service-worker.js"
check_file "public/favicon.svg"
check_file "utils/mobileUtils.ts"
check_file "styles/mobile.css"
echo ""

echo "🎨 Professional Components"
echo "-------------------------"
check_file "components/ProfessionalHomeDashboard.tsx"
check_file "components/ProfessionalReservationsPage.tsx"
check_file "components/ProfessionalFleetManagement.tsx"
check_file "components/ProfessionalUserManagement.tsx"
check_file "components/ProfessionalInvoiceGeneration.tsx"
check_file "components/ProfessionalSummaryDashboard.tsx"
check_file "components/ProfessionalAdvancedXMLCRM.tsx"
check_file "components/ProfessionalEmailNotificationSystem.tsx"
check_file "components/ProfessionalAdministrationDashboard.tsx"
check_file "components/ProfessionalReportsAnalytics.tsx"
check_file "components/ProfessionalSystemConfiguration.tsx"
check_file "components/ProfessionalUniversalExcelImport.tsx"
echo ""

echo "☕ Backend Structure"
echo "-------------------"
check_dir "src/main/java/com/carrental/backend"
check_dir "src/main/java/com/carrental/backend/controller"
check_dir "src/main/java/com/carrental/backend/service"
check_dir "src/main/java/com/carrental/backend/model"
check_dir "src/main/java/com/carrental/backend/repository"
check_dir "src/main/java/com/carrental/backend/config"
check_dir "src/main/java/com/carrental/backend/security"
check_file "src/main/java/com/carrental/backend/BackendApplication.java"
check_file "src/main/java/com/carrental/backend/config/SecurityConfig.java"
check_file "src/main/java/com/carrental/backend/model/FranchisePayment.java"
check_file "src/main/java/com/carrental/backend/service/ProfessionalEmailService.java"
if [ -f "src/main/resources/application.yml" ] || [ -f "src/main/resources/application.properties" ]; then
    echo "✅ src/main/resources/application config"
else
    echo "❌ MISSING: src/main/resources/application config"
    ((ERRORS++))
fi
echo ""

echo "🧪 Testing"
echo "----------"
check_file "jest.config.js"
check_file "setupTests.ts"
check_dir "__tests__"
check_dir "car-rental-backend-java/src/test"
echo ""

echo "📚 Documentation"
echo "----------------"
check_file "README_COMPLETE.md"
check_file "DEPLOYMENT_GUIDE.md"
check_file "SYSTEM_OVERVIEW.md"
check_file "MOBILE_SYSTEM_OVERVIEW.md"
check_file "TEST_DOCUMENTATION.md"
check_file "EMAIL_SYSTEM_DOCUMENTATION.md"
echo ""

echo "🔧 Configuration"
echo "----------------"
check_file ".env"
check_file ".gitignore"
check_file "Dockerfile"
check_file "tailwind.config.mobile.js"
echo ""

# Count components
echo "📊 Statistics"
echo "-------------"
COMPONENT_COUNT=$(find components -name "*.tsx" 2>/dev/null | wc -l | tr -d ' ')
echo "   Components: $COMPONENT_COUNT files"

BACKEND_COUNT=$(find src/main/java -name "*.java" 2>/dev/null | wc -l | tr -d ' ')
echo "   Backend Java: $BACKEND_COUNT files"

TEST_COUNT=$(find __tests__ -name "*.test.tsx" 2>/dev/null | wc -l | tr -d ' ')
echo "   Frontend Tests: $TEST_COUNT files"

BACKEND_TEST_COUNT=$(find car-rental-backend-java/src/test -name "*.java" 2>/dev/null | wc -l | tr -d ' ')
echo "   Backend Tests: $BACKEND_TEST_COUNT files"

DOC_COUNT=$(find . -maxdepth 1 -name "*.md" 2>/dev/null | wc -l | tr -d ' ')
echo "   Documentation: $DOC_COUNT files"

echo ""
echo "=================================="
echo "📋 Verification Complete"
echo "=================================="
echo ""

if [ $ERRORS -eq 0 ] && [ $WARNINGS -eq 0 ]; then
    echo "✅ System is HEALTHY - All critical files present"
    echo ""
    echo "🚀 Ready for:"
    echo "   - Development: npm run dev"
    echo "   - Testing: npm test"
    echo "   - Build: npm run build"
    echo "   - Deployment: See DEPLOYMENT_GUIDE.md"
    exit 0
elif [ $ERRORS -eq 0 ]; then
    echo "⚠️  System is OK - $WARNINGS warnings (non-critical)"
    echo "   Review warnings above"
    exit 0
else
    echo "❌ System has ERRORS - $ERRORS critical files missing"
    echo "   Please fix errors above before proceeding"
    exit 1
fi
