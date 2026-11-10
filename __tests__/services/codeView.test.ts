import { checkMessage, detectLang, formatCode } from '../../components/channel/CodeView';

describe('code viewer helpers', () => {
  it('detects the language', () => {
    expect(detectLang('<a/>')).toBe('xml');
    expect(detectLang(' {"a":1}')).toBe('json');
    expect(detectLang('curl https://x')).toBe('text');
  });

  it('indents one-line XML and keeps text elements on one line', () => {
    const out = formatCode('<?xml version="1.0"?><A x="1"><B>text</B><C/></A>');
    expect(out.split('\n')).toEqual(['<?xml version="1.0"?>', '<A x="1">', '  <B>text</B>', '  <C/>', '</A>']);
  });

  it('indents JSON and leaves invalid JSON alone', () => {
    expect(formatCode('{"a":[1,2]}')).toBe('{\n  "a": [\n    1,\n    2\n  ]\n}');
    expect(formatCode('{bad')).toBe('{bad');
  });

  const dom = typeof DOMParser !== 'undefined' ? it : it.skip;
  dom('reads an OTA answer: success, warnings and errors', () => {
    const ok = checkMessage('<OTA_VehResRS xmlns="http://www.opentravel.org/OTA/2003/05" EchoToken="E1" Version="1.000"><Success/><Warnings><Warning Code="1" ShortText="Late"/></Warnings></OTA_VehResRS>')!;
    expect(ok).toEqual(expect.objectContaining({ ok: true, root: 'OTA_VehResRS', echo: 'E1', success: true }));
    expect(ok.warnings).toHaveLength(1);
    const bad = checkMessage('<OTA_ErrorRS><Errors><Error Type="3" Code="321" ShortText="Missing"/></Errors></OTA_ErrorRS>')!;
    expect(bad.errors).toEqual([{ code: '321', type: '3', text: 'Missing' }]);
    expect(checkMessage('<a><b></a>')!.ok).toBe(false);
  });

  it('reads JSON errors', () => {
    expect(checkMessage('{"errors":[{"code":"E1","message":"No"}]}')!.errors).toEqual([{ code: 'E1', text: 'No' }]);
    expect(checkMessage('{"ok":true}')!.success).toBe(true);
  });
});

import { acceptedVendorCodes } from '../../services/channelManager';
describe('vendor codes a broker may use', () => {
  it('matches the server: channel code, NCT, and codes from the supplier name', () => {
    expect(acceptedVendorCodes('', 'UR-Drive Jordan')).toEqual(['NCT', 'URD', 'UDJ']);
    expect(acceptedVendorCodes('urd', 'UR-Drive Jordan')).toEqual(['URD', 'NCT', 'UDJ']);
  });
});

import { friendlyTitle, humanize } from '../../components/channel/MessageReader';
describe('readable message names', () => {
  it('names OTA messages in plain words', () => {
    expect(friendlyTitle('OTA_VehAvailRateRS')).toBe('Availability & rates · answer');
    expect(friendlyTitle('OTA_VehResRQ')).toBe('Booking · request');
    expect(friendlyTitle('OTA_VehRetResRS')).toBe('Booking look-up · answer');
    expect(friendlyTitle('OTA_VehCancelRS')).toBe('Cancellation · answer');
    expect(humanize('PickUpDateTime')).toBe('Pick-up date & time');
  });
});

import { labelTables } from '../../services/responsiveTables';
describe('phone cards for tables', () => {
  it('labels each cell with its column name, keeping header parts apart', () => {
    document.body.innerHTML = `<div id="r"><table><thead><tr><th>Booking</th><th><p>1–3 days</p><p>rate band</p></th><th></th></tr></thead>
      <tbody><tr><td>RSV-1</td><td>36.00</td><td>x</td></tr><tr><td colspan="3">Note</td></tr></tbody></table>
      <table data-no-cards><thead><tr><th>A</th></tr></thead><tbody><tr><td>1</td></tr></tbody></table></div>`;
    labelTables(document.getElementById('r')!);
    const [t1, t2] = Array.from(document.querySelectorAll('table'));
    expect(t1.classList.contains('rt-cards')).toBe(true);
    const cells = t1.querySelectorAll('tbody tr:first-child td');
    expect(cells[0].getAttribute('data-label')).toBe('Booking');
    expect(cells[1].getAttribute('data-label')).toBe('1–3 days · rate band');
    expect(cells[2].hasAttribute('data-label')).toBe(false);
    expect(t1.querySelector('td[colspan]')!.hasAttribute('data-label')).toBe(false);
    expect(t2.classList.contains('rt-cards')).toBe(false);
  });
});
