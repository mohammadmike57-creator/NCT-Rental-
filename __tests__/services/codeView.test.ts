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
