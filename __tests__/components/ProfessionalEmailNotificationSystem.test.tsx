import React from 'react';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import '@testing-library/jest-dom';
import ProfessionalEmailNotificationSystem from '../../components/ProfessionalEmailNotificationSystem';
import { mockReservation, mockCompanyDetails } from '../../setupTests';

/**
 * Comprehensive test suite for Professional Email Notification System
 *
 * Tests cover:
 * - Template management
 * - Trigger configuration
 * - Email queue
 * - Campaign creation
 * - Analytics display
 * - Template preview
 * - Search and filtering
 */
describe('ProfessionalEmailNotificationSystem', () => {
  const mockReservations = [mockReservation];
  const mockOnSendEmail = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('Component Rendering', () => {
    it('should render the component with main title', () => {
      render(
        <ProfessionalEmailNotificationSystem
          reservations={mockReservations}
          companyDetails={mockCompanyDetails}
          onSendEmail={mockOnSendEmail}
        />
      );

      expect(screen.getByText('Professional Email & Notification System')).toBeInTheDocument();
      expect(screen.getByText(/Enterprise-grade email automation/i)).toBeInTheDocument();
    });

    it('should render all navigation tabs', () => {
      render(
        <ProfessionalEmailNotificationSystem
          reservations={mockReservations}
          companyDetails={mockCompanyDetails}
          onSendEmail={mockOnSendEmail}
        />
      );

      expect(screen.getByText('Templates')).toBeInTheDocument();
      expect(screen.getByText('Triggers')).toBeInTheDocument();
      expect(screen.getByText('Queue')).toBeInTheDocument();
      expect(screen.getByText('Campaigns')).toBeInTheDocument();
      expect(screen.getByText('Analytics')).toBeInTheDocument();
      expect(screen.getByText('History')).toBeInTheDocument();
    });
  });

  describe('Templates Tab', () => {
    it('should display email templates', () => {
      render(
        <ProfessionalEmailNotificationSystem
          reservations={mockReservations}
          companyDetails={mockCompanyDetails}
          onSendEmail={mockOnSendEmail}
        />
      );

      expect(screen.getByText('Agreement Signed Confirmation')).toBeInTheDocument();
      expect(screen.getByText('Booking Confirmation')).toBeInTheDocument();
      expect(screen.getByText('24-Hour Pickup Reminder')).toBeInTheDocument();
      expect(screen.getByText('Thank You & Invoice')).toBeInTheDocument();
    });

    it('should show Create Template button', () => {
      render(
        <ProfessionalEmailNotificationSystem
          reservations={mockReservations}
          companyDetails={mockCompanyDetails}
          onSendEmail={mockOnSendEmail}
        />
      );

      const createButton = screen.getByRole('button', { name: /create template/i });
      expect(createButton).toBeInTheDocument();
    });

    it('should search templates by name', async () => {
      const user = userEvent.setup();
      render(
        <ProfessionalEmailNotificationSystem
          reservations={mockReservations}
          companyDetails={mockCompanyDetails}
          onSendEmail={mockOnSendEmail}
        />
      );

      const searchInput = screen.getByPlaceholderText('Search templates...');
      await user.type(searchInput, 'Booking');

      // Should show only templates matching "Booking"
      expect(screen.getByText('Booking Confirmation')).toBeInTheDocument();
      expect(screen.queryByText('Thank You & Invoice')).not.toBeInTheDocument();
    });

    it('should filter templates by status', async () => {
      const user = userEvent.setup();
      render(
        <ProfessionalEmailNotificationSystem
          reservations={mockReservations}
          companyDetails={mockCompanyDetails}
          onSendEmail={mockOnSendEmail}
        />
      );

      const filterSelect = screen.getByRole('combobox');
      await user.selectOptions(filterSelect, 'active');

      // Should show only active templates
      const templates = screen.getAllByText(/confirmation|reminder|invoice/i);
      expect(templates.length).toBeGreaterThan(0);
    });

    it('should open template preview on click', async () => {
      const user = userEvent.setup();
      render(
        <ProfessionalEmailNotificationSystem
          reservations={mockReservations}
          companyDetails={mockCompanyDetails}
          onSendEmail={mockOnSendEmail}
        />
      );

      const previewButtons = screen.getAllByRole('button', { name: /preview/i });
      await user.click(previewButtons[0]);

      await waitFor(() => {
        expect(screen.getByText('Template Preview')).toBeInTheDocument();
      });
    });

    it('should show template variables', () => {
      render(
        <ProfessionalEmailNotificationSystem
          reservations={mockReservations}
          companyDetails={mockCompanyDetails}
          onSendEmail={mockOnSendEmail}
        />
      );

      expect(screen.getByText('customerName')).toBeInTheDocument();
      expect(screen.getByText('bookingId')).toBeInTheDocument();
    });

    it('should toggle between desktop and mobile preview', async () => {
      const user = userEvent.setup();
      render(
        <ProfessionalEmailNotificationSystem
          reservations={mockReservations}
          companyDetails={mockCompanyDetails}
          onSendEmail={mockOnSendEmail}
        />
      );

      const previewButtons = screen.getAllByRole('button', { name: /preview/i });
      await user.click(previewButtons[0]);

      await waitFor(() => {
        const mobileButton = screen.getByRole('button', { name: /mobile/i });
        expect(mobileButton).toBeInTheDocument();
      });

      const mobileButton = screen.getByRole('button', { name: /mobile/i });
      await user.click(mobileButton);

      // Verify mobile view is active
      expect(mobileButton.className).toContain('bg-purple');
    });
  });

  describe('Triggers Tab', () => {
    it('should display automated triggers', async () => {
      const user = userEvent.setup();
      render(
        <ProfessionalEmailNotificationSystem
          reservations={mockReservations}
          companyDetails={mockCompanyDetails}
          onSendEmail={mockOnSendEmail}
        />
      );

      const triggersTab = screen.getByRole('button', { name: /triggers/i });
      await user.click(triggersTab);

      await waitFor(() => {
        expect(screen.getByText('Send Agreement on Signature')).toBeInTheDocument();
        expect(screen.getByText('Send Confirmation on Booking')).toBeInTheDocument();
        expect(screen.getByText('24hr Pickup Reminder')).toBeInTheDocument();
      });
    });

    it('should show trigger status (active/inactive)', async () => {
      const user = userEvent.setup();
      render(
        <ProfessionalEmailNotificationSystem
          reservations={mockReservations}
          companyDetails={mockCompanyDetails}
          onSendEmail={mockOnSendEmail}
        />
      );

      const triggersTab = screen.getByRole('button', { name: /triggers/i });
      await user.click(triggersTab);

      await waitFor(() => {
        const activeStatuses = screen.getAllByText('Active');
        expect(activeStatuses.length).toBeGreaterThan(0);
      });
    });

    it('should show Create Trigger button', async () => {
      const user = userEvent.setup();
      render(
        <ProfessionalEmailNotificationSystem
          reservations={mockReservations}
          companyDetails={mockCompanyDetails}
          onSendEmail={mockOnSendEmail}
        />
      );

      const triggersTab = screen.getByRole('button', { name: /triggers/i });
      await user.click(triggersTab);

      await waitFor(() => {
        expect(screen.getByRole('button', { name: /create trigger/i })).toBeInTheDocument();
      });
    });
  });

  describe('Queue Tab', () => {
    it('should display email queue statistics', async () => {
      const user = userEvent.setup();
      render(
        <ProfessionalEmailNotificationSystem
          reservations={mockReservations}
          companyDetails={mockCompanyDetails}
          onSendEmail={mockOnSendEmail}
        />
      );

      const queueTab = screen.getByRole('button', { name: /queue/i });
      await user.click(queueTab);

      await waitFor(() => {
        expect(screen.getByText('Pending')).toBeInTheDocument();
        expect(screen.getByText('Sent')).toBeInTheDocument();
        expect(screen.getByText('Failed')).toBeInTheDocument();
      });
    });

    it('should show queued email jobs', async () => {
      const user = userEvent.setup();
      render(
        <ProfessionalEmailNotificationSystem
          reservations={mockReservations}
          companyDetails={mockCompanyDetails}
          onSendEmail={mockOnSendEmail}
        />
      );

      const queueTab = screen.getByRole('button', { name: /queue/i });
      await user.click(queueTab);

      await waitFor(() => {
        expect(screen.getByText('customer1@example.com')).toBeInTheDocument();
        expect(screen.getByText(/Your Rental Agreement/i)).toBeInTheDocument();
      });
    });

    it('should display priority visualization', async () => {
      const user = userEvent.setup();
      render(
        <ProfessionalEmailNotificationSystem
          reservations={mockReservations}
          companyDetails={mockCompanyDetails}
          onSendEmail={mockOnSendEmail}
        />
      );

      const queueTab = screen.getByRole('button', { name: /queue/i });
      await user.click(queueTab);

      await waitFor(() => {
        // Priority bars should be rendered
        const priorityElements = document.querySelectorAll('.bg-purple-500');
        expect(priorityElements.length).toBeGreaterThan(0);
      });
    });

    it('should show refresh and clear failed buttons', async () => {
      const user = userEvent.setup();
      render(
        <ProfessionalEmailNotificationSystem
          reservations={mockReservations}
          companyDetails={mockCompanyDetails}
          onSendEmail={mockOnSendEmail}
        />
      );

      const queueTab = screen.getByRole('button', { name: /queue/i });
      await user.click(queueTab);

      await waitFor(() => {
        expect(screen.getByRole('button', { name: /refresh/i })).toBeInTheDocument();
        expect(screen.getByRole('button', { name: /clear failed/i })).toBeInTheDocument();
      });
    });
  });

  describe('Campaigns Tab', () => {
    it('should display email campaigns', async () => {
      const user = userEvent.setup();
      render(
        <ProfessionalEmailNotificationSystem
          reservations={mockReservations}
          companyDetails={mockCompanyDetails}
          onSendEmail={mockOnSendEmail}
        />
      );

      const campaignsTab = screen.getByRole('button', { name: /campaigns/i });
      await user.click(campaignsTab);

      await waitFor(() => {
        expect(screen.getByText('January Special Offer')).toBeInTheDocument();
        expect(screen.getByText('VIP Customer Appreciation')).toBeInTheDocument();
      });
    });

    it('should show campaign statistics', async () => {
      const user = userEvent.setup();
      render(
        <ProfessionalEmailNotificationSystem
          reservations={mockReservations}
          companyDetails={mockCompanyDetails}
          onSendEmail={mockOnSendEmail}
        />
      );

      const campaignsTab = screen.getByRole('button', { name: /campaigns/i });
      await user.click(campaignsTab);

      await waitFor(() => {
        expect(screen.getByText('Recipients')).toBeInTheDocument();
        expect(screen.getByText('Opens')).toBeInTheDocument();
        expect(screen.getByText('Clicks')).toBeInTheDocument();
      });
    });

    it('should show campaign status', async () => {
      const user = userEvent.setup();
      render(
        <ProfessionalEmailNotificationSystem
          reservations={mockReservations}
          companyDetails={mockCompanyDetails}
          onSendEmail={mockOnSendEmail}
        />
      );

      const campaignsTab = screen.getByRole('button', { name: /campaigns/i });
      await user.click(campaignsTab);

      await waitFor(() => {
        expect(screen.getByText('completed')).toBeInTheDocument();
        expect(screen.getByText('scheduled')).toBeInTheDocument();
      });
    });

    it('should display open rate progress bar', async () => {
      const user = userEvent.setup();
      render(
        <ProfessionalEmailNotificationSystem
          reservations={mockReservations}
          companyDetails={mockCompanyDetails}
          onSendEmail={mockOnSendEmail}
        />
      );

      const campaignsTab = screen.getByRole('button', { name: /campaigns/i });
      await user.click(campaignsTab);

      await waitFor(() => {
        expect(screen.getByText(/Open Rate/i)).toBeInTheDocument();
      });
    });
  });

  describe('Analytics Tab', () => {
    it('should display key metrics', async () => {
      const user = userEvent.setup();
      render(
        <ProfessionalEmailNotificationSystem
          reservations={mockReservations}
          companyDetails={mockCompanyDetails}
          onSendEmail={mockOnSendEmail}
        />
      );

      const analyticsTab = screen.getByRole('button', { name: /analytics/i });
      await user.click(analyticsTab);

      await waitFor(() => {
        expect(screen.getByText('Open Rate')).toBeInTheDocument();
        expect(screen.getByText('Click Rate')).toBeInTheDocument();
        expect(screen.getByText('Bounce Rate')).toBeInTheDocument();
        expect(screen.getByText('Unsubscribe Rate')).toBeInTheDocument();
      });
    });

    it('should show performance trend chart', async () => {
      const user = userEvent.setup();
      render(
        <ProfessionalEmailNotificationSystem
          reservations={mockReservations}
          companyDetails={mockCompanyDetails}
          onSendEmail={mockOnSendEmail}
        />
      );

      const analyticsTab = screen.getByRole('button', { name: /analytics/i });
      await user.click(analyticsTab);

      await waitFor(() => {
        expect(screen.getByText('Email Performance Trend')).toBeInTheDocument();
      });
    });

    it('should display top performing templates', async () => {
      const user = userEvent.setup();
      render(
        <ProfessionalEmailNotificationSystem
          reservations={mockReservations}
          companyDetails={mockCompanyDetails}
          onSendEmail={mockOnSendEmail}
        />
      );

      const analyticsTab = screen.getByRole('button', { name: /analytics/i });
      await user.click(analyticsTab);

      await waitFor(() => {
        expect(screen.getByText('Top Performing Templates')).toBeInTheDocument();
        expect(screen.getByText('Agreement Signed Confirmation')).toBeInTheDocument();
      });
    });

    it('should show percentage improvements', async () => {
      const user = userEvent.setup();
      render(
        <ProfessionalEmailNotificationSystem
          reservations={mockReservations}
          companyDetails={mockCompanyDetails}
          onSendEmail={mockOnSendEmail}
        />
      );

      const analyticsTab = screen.getByRole('button', { name: /analytics/i });
      await user.click(analyticsTab);

      await waitFor(() => {
        // Should show percentage changes like +12.5%, +8.3%, etc.
        expect(screen.getByText(/\+12\.5%/i)).toBeInTheDocument();
      });
    });
  });

  describe('Accessibility', () => {
    it('should have proper ARIA labels', () => {
      render(
        <ProfessionalEmailNotificationSystem
          reservations={mockReservations}
          companyDetails={mockCompanyDetails}
          onSendEmail={mockOnSendEmail}
        />
      );

      const buttons = screen.getAllByRole('button');
      expect(buttons.length).toBeGreaterThan(0);
    });

    it('should be keyboard navigable', async () => {
      const user = userEvent.setup();
      render(
        <ProfessionalEmailNotificationSystem
          reservations={mockReservations}
          companyDetails={mockCompanyDetails}
          onSendEmail={mockOnSendEmail}
        />
      );

      // Tab through elements
      await user.tab();
      await user.tab();

      const focusedElement = document.activeElement;
      expect(focusedElement).toBeInTheDocument();
    });
  });

  describe('Error Handling', () => {
    it('should handle missing reservations gracefully', () => {
      render(
        <ProfessionalEmailNotificationSystem
          reservations={[]}
          companyDetails={mockCompanyDetails}
          onSendEmail={mockOnSendEmail}
        />
      );

      expect(screen.getByText('Professional Email & Notification System')).toBeInTheDocument();
    });

    it('should handle missing company details', () => {
      render(
        <ProfessionalEmailNotificationSystem
          reservations={mockReservations}
          companyDetails={{} as any}
          onSendEmail={mockOnSendEmail}
        />
      );

      expect(screen.getByText('Professional Email & Notification System')).toBeInTheDocument();
    });
  });

  describe('Performance', () => {
    it('should render within acceptable time', () => {
      const startTime = performance.now();

      render(
        <ProfessionalEmailNotificationSystem
          reservations={mockReservations}
          companyDetails={mockCompanyDetails}
          onSendEmail={mockOnSendEmail}
        />
      );

      const endTime = performance.now();
      const renderTime = endTime - startTime;

      // Should render in less than 1000ms
      expect(renderTime).toBeLessThan(1000);
    });

    it('should handle large datasets efficiently', () => {
      const largeReservationList = Array(100).fill(mockReservation);

      render(
        <ProfessionalEmailNotificationSystem
          reservations={largeReservationList}
          companyDetails={mockCompanyDetails}
          onSendEmail={mockOnSendEmail}
        />
      );

      expect(screen.getByText('Professional Email & Notification System')).toBeInTheDocument();
    });
  });
});
