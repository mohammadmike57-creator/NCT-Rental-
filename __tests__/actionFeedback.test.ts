import { classify, workingLabel } from '../components/ui/ActionFeedback';

describe('action confirmation titles', () => {
  it.each([
    ['Version 3 published for Sample Broker.', 'Rates published'],
    ['Rate rules version 2 published. 1 channel(s) now price with them.', 'Rate rules published'],
    ['Channel Desert Drive Travel created in testing mode. Configure the connection to go live.', 'Channel created'],
    ['New API key created for Sample Broker. Copy it now: it is shown only once.', 'API key created'],
    ['Sample Broker approved for go-live.', 'Approved'],
    ['Sample Broker deleted.', 'Deleted'],
    ['API key of Sample Broker revoked.', 'Revoked'],
    ['Rates v3 delivered to Sample Broker (HTTP 200).', 'Sent'],
    ['10.0.0.1 unlocked.', 'Unlocked'],
    ['Multi-channel update applied to 2 channels.', 'Applied'],
    ['Prices changed: +5% on EDAR. Review them, then publish.', 'Updated'],
    ['Security settings updated.', 'Saved'],
  ])('“%s” → %s', (message, title) => {
    const f = classify(message);
    expect(f.title).toBe(title);
    expect(f.tone).toBe('success');
    expect(f.detail).toBe(message);
  });

  it('a partial save is a warning, a failure is an error', () => {
    expect(classify('Version saved locally but could not be stored on the server yet; it will sync automatically.').tone).toBe('warning');
    expect(classify('Delivery to Sample Broker failed: timeout. See the delivery log.')).toMatchObject({ tone: 'error', title: 'Not completed' });
    expect(classify('Could not reach the server to deliver rates to Sample Broker.').tone).toBe('error');
  });
});

describe('what the spinner says first', () => {
  it.each([
    ['Rates published', 'Publishing…'],
    ['Channel created', 'Creating…'],
    ['Stop sale added', 'Adding…'],
    ['Revoked', 'Revoking…'],
    ['Changes saved', 'Saving…'],
  ])('%s → %s', (title, label) => {
    expect(workingLabel(title, 'success')).toBe(label);
  });
});
