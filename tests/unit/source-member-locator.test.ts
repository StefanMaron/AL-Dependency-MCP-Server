import { findMemberRange } from '../../src/parser/source-member-locator';

const SAMPLE_CODEUNIT = `codeunit 50100 "Test Codeunit"
{
    procedure DoWork(Value: Integer): Boolean
    var
        Result: Boolean;
    begin
        if Value > 0 then begin
            Result := true;
        end;

        exit(Result);
    end;

    local procedure Helper()
    begin
        case Value of
            1:
                Message('one');
            2:
                Message('two');
        end;
    end;

    [EventSubscriber(ObjectType::Codeunit, Codeunit::"Some Codeunit", 'OnEvent', '', false, false)]
    local procedure OnEvent()
    begin
        Message('handled');
    end;

    var
        Value: Integer;
}
`;

describe('findMemberRange', () => {
  const lines = SAMPLE_CODEUNIT.split(/\r\n|\n/);

  it('finds a simple procedure with an if/begin/end block', () => {
    const range = findMemberRange(lines, 'DoWork');
    expect(range).not.toBeNull();
    expect(lines[range!.start]).toContain('procedure DoWork');
    expect(lines[range!.end]).toMatch(/^\s*end;/);
  });

  it('finds a procedure containing a case statement', () => {
    const range = findMemberRange(lines, 'Helper');
    expect(range).not.toBeNull();
    expect(lines[range!.start]).toContain('procedure Helper');
    expect(lines[range!.end]).toMatch(/^\s*end;/);
    // the case's own "end;" must not be mistaken for the procedure's end
    const body = lines.slice(range!.start, range!.end + 1).join('\n');
    expect(body).toContain('Message(\'two\')');
  });

  it('includes a preceding attribute line in the range', () => {
    const range = findMemberRange(lines, 'OnEvent');
    expect(range).not.toBeNull();
    expect(lines[range!.start]).toContain('[EventSubscriber');
  });

  it('returns null when the member does not exist', () => {
    const range = findMemberRange(lines, 'DoesNotExist');
    expect(range).toBeNull();
  });
});
